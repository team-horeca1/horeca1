import { getApprovedDistributorKeys, filterAuthorizedMappings } from '@/lib/brandAuthorizedDistributor';
import { aggregateInventories } from '@/lib/inventoryHelpers';
import {
  loadFulfillmentStockContext,
  sellableForContext,
  type InvRow,
} from '@/modules/fulfillment/fulfillmentStock';
import { Prisma, type ApprovalStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError, Errors } from '@/middleware/errorHandler';
import { emitEvent } from '@/events/emitter';
import { runMappingForVendorProduct, embedDistributorProduct } from '@/modules/brand/brand-mapper';
import {
  formatVendorSku,
  nextMasterSku,
  posSkuMatchesListing,
  resolveVendorCode,
  validateMasterSku,
} from '@/lib/sku';
import { syncProductToBrand } from '@/modules/brand/brand.service';
import {
  detectMaterialChanges,
  isTaxPercentMaterial,
  NON_MATERIAL_PRODUCT_FIELDS,
  type PendingEditPayload,
} from '@/lib/product-edit-policy';
import { auditProductDiff, logProductFieldChanges } from '@/lib/product-audit';
import { canTransitionApproval } from '@/modules/catalog/approval-state';
import { transitionProductApproval } from '@/modules/catalog/approval-state.service';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Admin import / backfill helper — auto-creates an approved master with H1-SKU-* when
 * no (name, brand) match exists. Vendor submissions must NOT use this; they go through
 * the approvals queue for admin-assigned catalog SKUs instead.
 */
export async function findOrCreateMaster(input: { name: string; brand: string | null; categoryId: string }): Promise<string> {
  const masterMatchWhere = {
    name: { equals: input.name, mode: 'insensitive' as const },
    brand: input.brand ? { equals: input.brand, mode: 'insensitive' as const } : null,
    approvalStatus: 'approved' as const,
    isActive: true,
  };

  const existing = await prisma.masterProduct.findFirst({
    where: masterMatchWhere,
    select: { id: true },
  });
  if (existing) return existing.id;

  return prisma.$transaction(async (tx) => {
    // Acquire table lock to serialize concurrent SKU generation and inserts
    await tx.$executeRawUnsafe('LOCK TABLE master_products IN EXCLUSIVE MODE;');

    // Re-check existence inside lock to avoid duplicates from concurrent creators
    const doubleCheck = await tx.masterProduct.findFirst({
      where: masterMatchWhere,
      select: { id: true },
    });
    if (doubleCheck) return doubleCheck.id;

    const sku = await nextMasterSku(tx);
    const master = await tx.masterProduct.create({
      data: { sku, name: input.name, brand: input.brand, categoryId: input.categoryId },
      select: { id: true },
    });
    await tx.masterProductCategory.create({
      data: { masterProductId: master.id, categoryId: input.categoryId, isPrimary: true },
    });
    return master.id;
  });
}

// Mirrors the slug rule in /api/v1/vendor/categories/suggest so a name maps to
// the same slug everywhere and we match (instead of duplicate) an already-
// suggested category.
function categorySlugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/[\s]+/g, '-').replace(/-+/g, '-');
}

/**
 * Resolve a category name to a category id, creating one when no match exists.
 * Used by product import (admin + vendor) so an unknown category in a sheet
 * becomes a tracked record instead of being silently dropped to null.
 *   • autoApprove=true  (admin)  → created approved + active immediately.
 *   • autoApprove=false (vendor) → created pending + inactive, CategorySuggested
 *     emitted for the approvals queue.
 * Matching is case-insensitive on name, then slug, and includes pending
 * categories so we never create a duplicate of an already-suggested one.
 * Returns null for empty names (caller treats category as absent, as before).
 */
export async function findOrCreateCategoryByName(input: {
  name: string | null | undefined;
  autoApprove: boolean;
  suggestedBy?: string;
  parentId?: string | null;
}): Promise<string | null> {
  const name = input.name?.trim();
  if (!name) return null;

  const slug = categorySlugify(name);
  const existing = await prisma.category.findFirst({
    where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, { slug }] },
    select: { id: true },
  });
  if (existing) return existing.id;

  const category = await prisma.category.create({
    data: {
      name,
      slug,
      parentId: input.parentId ?? null,
      approvalStatus: input.autoApprove ? 'approved' : 'pending',
      isActive: input.autoApprove,
      suggestedBy: input.suggestedBy ?? null,
    },
    select: { id: true, name: true },
  });

  if (input.parentId) {
    await prisma.categoryCategory.create({
      data: {
        categoryId: input.parentId,
        subCategoryId: category.id,
        isPrimary: true,
      },
    });
  }

  if (!input.autoApprove) {
    emitEvent('CategorySuggested', {
      categoryId: category.id,
      categoryName: category.name,
      suggestedBy: input.suggestedBy ?? '',
    });
  }

  return category.id;
}

/** Resolve hierarchical import columns (Parent / Sub / Additional) to category IDs. */
export async function resolveImportCategoryIds(input: {
  parentCategory?: string;
  subCategory?: string;
  additionalSubCategories?: string[];
  legacyCategory?: string;
  autoApprove: boolean;
  suggestedBy?: string;
  catMap: Map<string, string>;
}): Promise<{ primaryCategoryId: string | null; categoryIds: string[]; pending: boolean }> {
  const parentName = input.parentCategory?.trim();
  const subName = input.subCategory?.trim();
  const legacyName = input.legacyCategory?.trim();
  const additional = input.additionalSubCategories ?? [];
  const primaryName = subName || legacyName || parentName;

  if (!primaryName && additional.length === 0) {
    return { primaryCategoryId: null, categoryIds: [], pending: false };
  }

  let parentId: string | null = null;
  let pending = false;

  if (parentName) {
    parentId = input.catMap.get(parentName.toLowerCase()) ?? null;
    if (!parentId) {
      parentId = await findOrCreateCategoryByName({
        name: parentName,
        autoApprove: input.autoApprove,
        suggestedBy: input.suggestedBy,
      });
      if (parentId) {
        input.catMap.set(parentName.toLowerCase(), parentId);
        if (!input.autoApprove) pending = true;
      }
    }
  }

  const categoryIds: string[] = [];

  async function resolveName(name: string, linkUnderParent: boolean): Promise<string | null> {
    let id = input.catMap.get(name.toLowerCase()) ?? null;
    if (id) return id;
    id = await findOrCreateCategoryByName({
      name,
      autoApprove: input.autoApprove,
      suggestedBy: input.suggestedBy,
      parentId: linkUnderParent && parentId ? parentId : undefined,
    });
    if (id) {
      input.catMap.set(name.toLowerCase(), id);
      if (!input.autoApprove) pending = true;
    }
    return id;
  }

  if (primaryName) {
    const linkUnderParent = !!(subName && parentId);
    const id = await resolveName(primaryName, linkUnderParent);
    if (id) categoryIds.push(id);
  }

  // Additional sub-categories are DISPLAY-ONLY, vendor's free choice: they just
  // fan the product out across more sub-categories on the storefront. They link to
  // EXISTING (approved) categories only — never create a new/pending category and
  // never gate approval. "Request new category" is reserved for Parent / Sub. So a
  // vendor tagging extra sub-categories never sends the product to the approvals queue.
  for (const addName of additional) {
    const trimmed = addName.trim();
    if (!trimmed) continue;
    const id = input.catMap.get(trimmed.toLowerCase());
    if (id && !categoryIds.includes(id)) categoryIds.push(id);
  }

  return {
    primaryCategoryId: categoryIds[0] ?? null,
    categoryIds,
    pending,
  };
}

/** Replace ProductCategory join rows for a product; enforces exactly one primary. */
export async function syncProductCategories(
  productId: string,
  categoryIds: string[],
  db: Db = prisma,
): Promise<void> {
  if (categoryIds.length === 0) {
    await db.productCategory.deleteMany({ where: { productId } });
    return;
  }
  await db.productCategory.deleteMany({ where: { productId } });
  await db.productCategory.createMany({
    data: categoryIds.map((categoryId, idx) => ({
      productId,
      categoryId,
      isPrimary: idx === 0,
    })),
    skipDuplicates: true,
  });
}

/** Replace ProductCategory join rows for a product from an import row. */
export async function syncImportProductCategories(
  productId: string,
  categoryIds: string[],
  db: Db = prisma,
): Promise<void> {
  if (categoryIds.length === 0) return;
  await syncProductCategories(productId, categoryIds, db);
}

/**
 * Enforce the "Item MUST map to a sub-category" rule (Req 5): every id must be an
 * existing TERMINAL category — i.e. the most-specific node, one with no children
 * of its own. This rejects mapping to a parent/intermediate category (you must
 * pick its sub-category), and once a 2-level tree exists it effectively requires
 * level-2 — while NOT breaking a still-flat catalog that only has top-level
 * categories yet. Used by product + master-product create/update so the rule is
 * enforced uniformly server-side, not just in the UI.
 */
export async function assertLeafCategory(categoryIds: string[], db: Db = prisma): Promise<void> {
  if (categoryIds.length === 0) return;
  const unique = [...new Set(categoryIds)];
  const cats = await db.category.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, parentId: true, _count: { select: { children: true } } },
  });
  const found = new Set(cats.map((c) => c.id));
  for (const id of unique) {
    if (!found.has(id)) throw Errors.badRequest(`Category not found: ${id}`);
  }
  for (const c of cats) {
    if (c._count.children > 0) {
      throw Errors.badRequest(`"${c.name}" has sub-categories under it — pick a more specific sub-category.`);
    }
  }
}

/** Parent category IDs linked to a sub-category via CategoryCategory M2M. */
export async function getCategoryParentIds(subCategoryId: string, db: Db = prisma): Promise<string[]> {
  const links = await db.categoryCategory.findMany({
    where: { subCategoryId },
    select: { categoryId: true, isPrimary: true },
    orderBy: [{ isPrimary: 'desc' }, { categoryId: 'asc' }],
  });
  if (links.length > 0) return links.map((l) => l.categoryId);
  const cat = await db.category.findUnique({
    where: { id: subCategoryId },
    select: { parentId: true },
  });
  return cat?.parentId ? [cat.parentId] : [];
}

/** Resolve category IDs for the hierarchy picker (master fill, edit preload). */
export async function resolveCategoriesForPicker(ids: string[], db: Db = prisma) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];

  const cats = await db.category.findMany({
    where: { id: { in: unique }, isActive: true, approvalStatus: 'approved' },
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      _count: { select: { children: true } },
    },
  });

  const results = await Promise.all(
    cats.map(async (c) => {
      const isParent = c._count.children > 0;
      if (isParent) {
        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          parentCategoryIds: [] as string[],
          primaryParentCategoryId: null as string | null,
          isParent: true,
        };
      }
      const parentIds = await getCategoryParentIds(c.id, db);
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        parentCategoryIds: parentIds.length > 0 ? parentIds : c.parentId ? [c.parentId] : [],
        primaryParentCategoryId: parentIds[0] ?? c.parentId ?? null,
        isParent: false,
      };
    }),
  );

  const parentIdsNeeded = new Set<string>();
  for (const row of results) {
    for (const pid of row.parentCategoryIds) {
      if (!results.some((r) => r.id === pid)) parentIdsNeeded.add(pid);
    }
  }
  if (parentIdsNeeded.size > 0) {
    const parentRows = await db.category.findMany({
      where: { id: { in: [...parentIdsNeeded] }, isActive: true, approvalStatus: 'approved' },
      select: { id: true, name: true, slug: true },
    });
    for (const p of parentRows) {
      results.push({
        id: p.id,
        name: p.name,
        slug: p.slug,
        parentCategoryIds: [],
        primaryParentCategoryId: null,
        isParent: true,
      });
    }
  }

  return results;
}

/** Leaf IDs first so picker value[0] is never a bare parent when a leaf exists. */
export async function normalizeCategoryIdsForPicker(ids: string[], db: Db = prisma): Promise<string[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];

  const resolved = await resolveCategoriesForPicker(unique, db);
  const byId = new Map(resolved.map((r) => [r.id, r]));

  const leafIds: string[] = [];
  const parentIds: string[] = [];

  for (const id of unique) {
    const row = byId.get(id);
    if (!row) continue;
    if (row.isParent) parentIds.push(id);
    else leafIds.push(id);
  }

  const parentIdsCoveredByLeaves = new Set<string>();
  for (const leafId of leafIds) {
    const leaf = byId.get(leafId);
    if (!leaf) continue;
    if (leaf.primaryParentCategoryId) parentIdsCoveredByLeaves.add(leaf.primaryParentCategoryId);
    for (const pid of leaf.parentCategoryIds) parentIdsCoveredByLeaves.add(pid);
  }

  const extraParents = parentIds.filter((pid) => !parentIdsCoveredByLeaves.has(pid));
  return [...leafIds, ...extraParents];
}

/** Normalized IDs plus whether only parent-level categories are present (no leaf). */
export async function getCategoryPickerMeta(ids: string[], db: Db = prisma) {
  const categoryIds = await normalizeCategoryIdsForPicker(ids, db);
  if (categoryIds.length === 0) {
    return { categoryIds, categoryLeafMissing: false };
  }
  const resolved = await resolveCategoriesForPicker(categoryIds, db);
  const hasLeaf = resolved.some((r) => !r.isParent && categoryIds.includes(r.id));
  return { categoryIds, categoryLeafMissing: !hasLeaf };
}

/** Replace CategoryCategory rows for a sub-category; sync denormalized parentId. */
export async function syncCategoryParentLinks(
  subCategoryId: string,
  parentCategoryIds: string[],
  db: Db = prisma,
): Promise<void> {
  const uniqueParents = [...new Set(parentCategoryIds.filter(Boolean))];
  if (uniqueParents.length === 0) {
    await db.category.update({ where: { id: subCategoryId }, data: { parentId: null } });
    await db.categoryCategory.deleteMany({ where: { subCategoryId } });
    return;
  }

  const parents = await db.category.findMany({
    where: { id: { in: uniqueParents } },
    select: { id: true, name: true, parentId: true },
  });
  if (parents.length !== uniqueParents.length) {
    throw Errors.badRequest('One or more parent categories do not exist');
  }
  for (const p of parents) {
    if (p.parentId) {
      throw Errors.badRequest(`"${p.name}" is a sub-category — pick a root category as parent`);
    }
  }

  const primaryParentId = uniqueParents[0];
  await db.category.update({ where: { id: subCategoryId }, data: { parentId: primaryParentId } });
  await db.categoryCategory.deleteMany({ where: { subCategoryId } });
  await db.categoryCategory.createMany({
    data: uniqueParents.map((categoryId, idx) => ({
      categoryId,
      subCategoryId,
      isPrimary: idx === 0,
    })),
    skipDuplicates: true,
  });
}

/** Replace MasterProductCategory rows; caller sets MasterProduct.categoryId to categoryIds[0]. */
export async function syncMasterProductCategories(
  masterProductId: string,
  categoryIds: string[],
  db: Db = prisma,
): Promise<void> {
  await db.masterProductCategory.deleteMany({ where: { masterProductId } });
  if (categoryIds.length === 0) return;
  await db.masterProductCategory.createMany({
    data: categoryIds.map((categoryId, idx) => ({
      masterProductId,
      categoryId,
      isPrimary: idx === 0,
    })),
    skipDuplicates: true,
  });
}

// Tombstone prefix used when a product can't be hard-deleted (has order/cart/list refs)
// and we instead rename its slug to free the [vendorId, slug] unique constraint so the
// vendor can re-add a product with the same name. Rows with this prefix are hidden from
// listings, suggestions, and duplicate-name checks.
export const TOMBSTONE_PREFIX = '_deleted_';

async function getVendorCode(vendorId: string): Promise<string> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { vendorCode: true, slug: true },
  });
  if (!vendor) throw Errors.notFound('Vendor');
  return resolveVendorCode(vendor);
}

async function composeVendorProductSku(
  vendorId: string,
  posSku: string,
  excludeProductId?: string,
): Promise<string> {
  const trimmed = posSku.trim();
  if (!trimmed) throw Errors.badRequest('Your POS SKU is required.');
  await assertVendorPosSkuUnique(vendorId, trimmed, excludeProductId);
  const vendorCode = await getVendorCode(vendorId);
  const composed = formatVendorSku(vendorCode, trimmed);
  await assertVendorSkuUnique(vendorId, composed, excludeProductId);
  return composed;
}

/** Find another listing for this vendor that already uses the same POS code. */
export async function findVendorListingWithPosSku(
  vendorId: string,
  posSku: string,
  excludeProductId?: string,
): Promise<{ id: string; name: string } | null> {
  const trimmed = posSku.trim();
  if (!trimmed) return null;

  const vendorCode = await getVendorCode(vendorId);
  const candidates = await prisma.product.findMany({
    where: {
      vendorId,
      slug: { not: { startsWith: TOMBSTONE_PREFIX } },
      ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
    },
    select: { id: true, name: true, vendorSku: true, sku: true },
  });

  for (const row of candidates) {
    if (posSkuMatchesListing(trimmed, row, vendorCode)) {
      return { id: row.id, name: row.name };
    }
  }
  return null;
}

export async function assertVendorPosSkuUnique(
  vendorId: string,
  posSku: string,
  excludeProductId?: string,
): Promise<void> {
  const trimmed = posSku.trim();
  if (!trimmed) return;
  const dup = await findVendorListingWithPosSku(vendorId, trimmed, excludeProductId);
  if (dup) {
    throw Errors.conflict(
      `You already have a product with POS SKU "${trimmed}" (${dup.name}).`,
    );
  }
}

async function assertVendorSkuUnique(
  vendorId: string,
  sku: string,
  excludeProductId?: string,
): Promise<void> {
  const dup = await prisma.product.findFirst({
    where: {
      vendorId,
      sku: { equals: sku, mode: 'insensitive' },
      slug: { not: { startsWith: TOMBSTONE_PREFIX } },
      ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
    },
    select: { id: true, name: true },
  });
  if (dup) {
    throw Errors.conflict(`SKU "${sku}" is already used by "${dup.name}".`);
  }
}

/** Compose `{vendorCode}-{posSku}` for vendor listings (import + admin approval). */
export async function composeVendorListingSku(vendorId: string, posSku: string): Promise<string> {
  return composeVendorProductSku(vendorId, posSku);
}

/** Lookup an approved master catalog row by admin-entered catalog SKU. */
export async function findApprovedMasterByCatalogSku(sku: string) {
  const check = validateMasterSku(sku);
  if (!check.ok) return null;
  return prisma.masterProduct.findFirst({
    where: {
      sku: { equals: check.normalized, mode: 'insensitive' },
      approvalStatus: 'approved',
      isActive: true,
    },
    select: { id: true, sku: true, name: true, brand: true, categoryId: true },
  });
}

/**
 * One active (non-tombstone) listing per vendor per master catalog item.
 * Mirrors the guard on vendor create — also enforced on approve / import link.
 */
export async function assertVendorMasterListingUnique(
  vendorId: string,
  masterProductId: string,
  excludeProductId?: string,
): Promise<void> {
  const dup = await prisma.product.findFirst({
    where: {
      vendorId,
      masterProductId,
      slug: { not: { startsWith: TOMBSTONE_PREFIX } },
      ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
    },
    select: { id: true, name: true },
  });
  if (dup) {
    throw Errors.conflict(
      `You already list this catalog item as "${dup.name}". Edit that product instead of assigning the same catalog SKU again.`,
    );
  }
}

function normalizeProductName(name: string): string {
  return name.trim().toLowerCase();
}

function assertConfirmLinkIfNameMismatch(input: {
  listingName: string;
  master: { id: string; name: string; sku: string };
  confirmLink?: boolean;
}): void {
  if (normalizeProductName(input.listingName) === normalizeProductName(input.master.name)) return;
  if (input.confirmLink) return;
  throw new ApiError(
    'CONFIRM_LINK_REQUIRED',
    `Catalog SKU "${input.master.sku}" belongs to "${input.master.name}", which differs from this listing ("${input.listingName}"). Confirm to link anyway.`,
    409,
    {
      requireConfirmLink: true,
      masterId: input.master.id,
      masterName: input.master.name,
      masterSku: input.master.sku,
    },
  );
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002';
}

/** Match vendor submissions to an existing approved master by (name, brand). */
export async function findApprovedMasterByNameBrand(
  name: string,
  brand: string | null,
): Promise<{ id: string } | null> {
  const trimmedName = name.trim();
  if (!trimmedName) return null;
  const trimmedBrand = brand?.trim() || null;
  return prisma.masterProduct.findFirst({
    where: {
      name: { equals: trimmedName, mode: 'insensitive' },
      brand: trimmedBrand ? { equals: trimmedBrand, mode: 'insensitive' } : null,
      approvalStatus: 'approved',
      isActive: true,
    },
    select: { id: true },
  });
}

type VendorProductForMasterAssign = {
  id: string;
  vendorId: string;
  name: string;
  brand: string | null;
  categoryId: string | null;
  imageUrl: string | null;
  unit: string | null;
  packSize: string | null;
  vendorSku: string | null;
  sku: string | null;
  masterProductId: string | null;
};

/**
 * Resolve which master catalog SKU a pending vendor listing should map to when
 * admin approves it. Creates a new approved master when the SKU is new.
 * Reusing an existing SKU links across vendors; same vendor cannot list twice.
 */
export async function resolveMasterForVendorApproval(input: {
  product: VendorProductForMasterAssign;
  adminUserId: string;
  catalogSku?: string;
  masterProductId?: string;
  categoryIds?: string[];
  /** Required when linking to an existing master whose name differs from the listing. */
  confirmLink?: boolean;
}): Promise<string> {
  const { product, adminUserId, confirmLink } = input;
  const categoryIds =
    input.categoryIds && input.categoryIds.length > 0
      ? input.categoryIds
      : product.categoryId
        ? [product.categoryId]
        : [];

  if (categoryIds.length === 0) {
    throw Errors.badRequest('Product must have a category before a catalog SKU can be assigned.');
  }
  await assertLeafCategory(categoryIds);

  const finalizeExistingMaster = async (master: { id: string; name: string; sku: string }) => {
    await assertVendorMasterListingUnique(product.vendorId, master.id, product.id);
    assertConfirmLinkIfNameMismatch({
      listingName: product.name,
      master,
      confirmLink,
    });
    return master.id;
  };

  if (input.masterProductId) {
    const linked = await prisma.masterProduct.findFirst({
      where: { id: input.masterProductId, approvalStatus: 'approved', isActive: true },
      select: { id: true, name: true, sku: true },
    });
    if (!linked) throw Errors.badRequest('Master product not found or not approved.');
    return finalizeExistingMaster(linked);
  }

  if (product.masterProductId && !input.catalogSku?.trim()) {
    const existing = await prisma.masterProduct.findFirst({
      where: { id: product.masterProductId, approvalStatus: 'approved', isActive: true },
      select: { id: true, name: true, sku: true },
    });
    if (existing) {
      // Already linked — keep without re-prompting name mismatch.
      await assertVendorMasterListingUnique(product.vendorId, existing.id, product.id);
      return existing.id;
    }
  }

  const catalogSku = input.catalogSku?.trim();
  if (!catalogSku) {
    throw Errors.badRequest(
      'Assign a catalog SKU (or link an approved master product) before approving this listing.',
    );
  }

  const skuCheck = validateMasterSku(catalogSku);
  if (!skuCheck.ok) throw Errors.badRequest(skuCheck.message);

  const linkExistingByNormalizedSku = async (normalizedSku: string) => {
    const existingBySku = await prisma.masterProduct.findFirst({
      where: { sku: { equals: normalizedSku, mode: 'insensitive' } },
      select: { id: true, name: true, sku: true, approvalStatus: true, isActive: true },
    });
    if (!existingBySku) return null;
    if (existingBySku.approvalStatus !== 'approved' || !existingBySku.isActive) {
      throw Errors.conflict(`SKU "${normalizedSku}" exists but is not an approved catalog item yet.`);
    }
    return finalizeExistingMaster(existingBySku);
  };

  const already = await linkExistingByNormalizedSku(skuCheck.normalized);
  if (already) return already;

  try {
    const master = await prisma.masterProduct.create({
      data: {
        sku: skuCheck.normalized,
        name: product.name.trim(),
        brand: product.brand?.trim() || null,
        categoryId: categoryIds[0],
        imageUrl: product.imageUrl,
        uom: product.unit ?? product.packSize,
        approvalStatus: 'approved',
        approvedBy: adminUserId,
        approvedAt: new Date(),
        isActive: true,
      },
    });
    await syncMasterProductCategories(master.id, categoryIds);

    syncProductToBrand(
      master.brand,
      master.name,
      master.categoryId,
      master.imageUrl,
      master.packSize,
      master.uom,
      master.sku,
      master.id,
    ).catch(console.error);

    return master.id;
  } catch (error) {
    // Concurrent approve of the same new SKU — treat as link to the winner.
    if (!isPrismaUniqueViolation(error)) throw error;
    const raced = await linkExistingByNormalizedSku(skuCheck.normalized);
    if (raced) return raced;
    throw error;
  }
}

/** Link an approved master to a vendor product and compose vendor POS SKU when present. */
export async function applyMasterLinkToVendorProduct(
  productId: string,
  vendorId: string,
  masterProductId: string,
): Promise<{ sku: string | null; vendorSku: string | null; masterProductId: string }> {
  const product = await prisma.product.findFirst({
    where: { id: productId, vendorId },
    select: { vendorSku: true, sku: true, imageUrl: true, images: true },
  });
  if (!product) throw Errors.notFound('Product');

  const master = await prisma.masterProduct.findFirst({
    where: { id: masterProductId, approvalStatus: 'approved', isActive: true },
    select: { id: true, name: true, brand: true, categoryId: true, imageUrl: true, images: true },
  });
  if (!master) throw Errors.badRequest('Master product not found or not approved.');

  await assertVendorMasterListingUnique(vendorId, master.id, productId);

  const posSku = product.vendorSku?.trim() || product.sku?.trim() || '';
  let composedSku: string | null = product.sku;
  let vendorSku: string | null = product.vendorSku;

  if (posSku) {
    composedSku = await composeVendorProductSku(vendorId, posSku, productId);
    vendorSku = posSku;
  } else {
    composedSku = null;
  }

  const updateData: Prisma.ProductUpdateInput = {
    masterProduct: { connect: { id: master.id } },
    name: master.name,
    category: { connect: { id: master.categoryId } },
    sku: composedSku,
    vendorSku,
  };
  if (master.brand) updateData.brand = master.brand;
  if (master.imageUrl && !product.imageUrl) updateData.imageUrl = master.imageUrl;
  if (master.images.length > 0 && (!product.images || product.images.length === 0)) {
    updateData.images = master.images;
  }

  await prisma.product.update({ where: { id: productId }, data: updateData });

  return { sku: composedSku, vendorSku, masterProductId: master.id };
}

export class CatalogService {
  async getVendorProducts(
    vendorIdOrSlug: string,
    options: {
      categoryId?: string;
      search?: string;
      cursor?: string;
      limit?: number;
      includeInactive?: boolean;
      /** Customer delivery pincode — scopes stock to fulfillment outlets */
      pincode?: string;
      /** Vendor dashboard: keep network aggregate instead of fulfillment-aware */
      aggregateStock?: boolean;
    }
  ) {
    const { categoryId, search, cursor, limit = 20, includeInactive, pincode, aggregateStock } = options;

    // Accept either UUID or slug (matches VendorService.getById behaviour).
    // Postgres throws P2007 ("invalid input syntax for type uuid") if a non-UUID
    // string is used directly in a `where: { vendorId }` filter on the products table.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let vendorId = vendorIdOrSlug;
    if (!UUID_RE.test(vendorIdOrSlug)) {
      const v = await prisma.vendor.findFirst({
        where: { slug: vendorIdOrSlug },
        select: { id: true },
      });
      if (!v) throw Errors.notFound('Vendor');
      vendorId = v.id;
    }

    const where: Record<string, unknown> = {
      vendorId,
      slug: { not: { startsWith: TOMBSTONE_PREFIX } },
    };
    if (!includeInactive) {
      where.isActive = true;
      where.approvalStatus = 'approved';
    }
    if (categoryId) where.categoryId = categoryId;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const useFulfillmentStock = !aggregateStock;
    const stockCtx = useFulfillmentStock
      ? await loadFulfillmentStockContext(vendorId)
      : null;

    const include = {
      priceSlabs: { orderBy: { sortOrder: 'asc' as const } },
      inventories: {
        select: {
          outletId: true,
          qtyAvailable: true,
          qtyReserved: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          imageUrl: true,
          parentId: true,
          parent: { select: { id: true, name: true, slug: true, imageUrl: true } },
        },
      },
      categoryLinks: {
        select: {
          isPrimary: true,
          category: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              parentId: true,
              parent: { select: { id: true, name: true } },
            },
          },
        },
      },
      vendor: { select: { id: true, businessName: true, logoUrl: true, vendorCode: true } },
      brandMappings: {
        where: { status: { in: ['verified' as const, 'auto_mapped' as const] } },
        select: {
          brandId: true,
          brandMasterProduct: {
            select: {
              name: true,
              brand: { select: { name: true, slug: true } },
            },
          },
        },
        orderBy: { confidenceScore: 'desc' as const },
        take: 1,
      },
    };

    const approvedKeys = await getApprovedDistributorKeys({ vendorId });

    const mapOne = (p: {
      id: string;
      inventories: InvRow[];
      brandMappings: unknown;
      category?: { name?: string; slug?: string } | null;
      [key: string]: unknown;
    }) => {
      const rows = p.inventories as InvRow[];
      let qtyAvailable: number;
      if (stockCtx) {
        qtyAvailable = sellableForContext(stockCtx, rows, pincode);
      } else {
        const inv = aggregateInventories(rows);
        qtyAvailable = inv ? inv.qtySellable : 0;
      }
      return {
        ...p,
        inventories: [{ qtyAvailable, qtyReserved: 0 }],
        brandMappings: filterAuthorizedMappings(
          p.brandMappings as Parameters<typeof filterAuthorizedMappings>[0],
          vendorId,
          approvedKeys,
        ),
        categoryName: p.category?.name || '',
        categorySlug: p.category?.slug || '',
        in_stock: qtyAvailable > 0,
        qty_available: qtyAvailable,
      };
    };

    // Fill a page. Zero-stock SKUs stay in the catalog (cards show Out / grayed UI).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const collected: any[] = [];
    let pageCursor = cursor;
    let dbExhausted = false;
    while (collected.length < limit + 1 && !dbExhausted) {
      const remaining = limit + 1 - collected.length;
      const batch = await prisma.product.findMany({
        where,
        take: remaining,
        ...(pageCursor ? { cursor: { id: pageCursor }, skip: 1 } : {}),
        orderBy: { name: 'asc' },
        include,
      });
      if (batch.length === 0) {
        dbExhausted = true;
        break;
      }
      if (batch.length < remaining) dbExhausted = true;
      pageCursor = batch[batch.length - 1]!.id;

      for (const p of batch) {
        collected.push(mapOne(p as Parameters<typeof mapOne>[0]));
        if (collected.length >= limit + 1) break;
      }
    }

    const hasMore = collected.length > limit;
    if (hasMore) collected.pop();

    return {
      products: collected,
      pagination: {
        next_cursor: hasMore ? (collected[collected.length - 1]?.id as string | undefined) ?? null : null,
        has_more: hasMore,
      },
    };
  }

  async getCategories(parentId?: string) {
    const roots = await prisma.category.findMany({
      where: { isActive: true, approvalStatus: 'approved', parentId: parentId || null },
      orderBy: { sortOrder: 'asc' },
      include: {
        children: {
          where: { isActive: true, approvalStatus: 'approved' },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    const subIds = roots.flatMap((r) => r.children.map((c) => c.id));
    if (subIds.length === 0) return roots;

    const links = await prisma.categoryCategory.findMany({
      where: { subCategoryId: { in: subIds } },
      select: { categoryId: true, subCategoryId: true, isPrimary: true },
    });
    const bySub = new Map<string, { parentCategoryIds: string[]; primaryParentCategoryId: string | null }>();
    for (const link of links) {
      const entry = bySub.get(link.subCategoryId) ?? { parentCategoryIds: [], primaryParentCategoryId: null };
      entry.parentCategoryIds.push(link.categoryId);
      if (link.isPrimary) entry.primaryParentCategoryId = link.categoryId;
      bySub.set(link.subCategoryId, entry);
    }

    return roots.map((root) => ({
      ...root,
      children: root.children.map((child) => {
        const info = bySub.get(child.id);
        return {
          ...child,
          parentCategoryIds: info?.parentCategoryIds.length
            ? info.parentCategoryIds
            : child.parentId
              ? [child.parentId]
              : [],
          primaryParentCategoryId: info?.primaryParentCategoryId ?? child.parentId,
        };
      }),
    }));
  }

  async getCategoryVendors(categoryId: string, pincode?: string) {
    // Items map only to SUB-categories, so a top-level category matches nothing directly.
    // Match products in this category OR in any of its sub-categories (category.parentId).
    const where: Record<string, unknown> = {
      isActive: true,
      isVerified: true,
      products: {
        some: {
          isActive: true,
          OR: [{ categoryId }, { category: { parentId: categoryId } }],
        },
      },
    };

    if (pincode) {
      where.serviceAreas = { some: { pincode, isActive: true } };
    }

    return prisma.vendor.findMany({
      where,
      orderBy: { rating: 'desc' },
      select: {
        id: true,
        businessName: true,
        slug: true,
        logoUrl: true,
        rating: true,
        minOrderValue: true,
      },
    });
  }

  async getCollections() {
    return prisma.collection.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        products: {
          include: { product: true },
          orderBy: { sortOrder: 'asc' },
          take: 10,
        },
      },
    });
  }

  async createProduct(vendorId: string, data: {
    name: string;
    slug: string;
    categoryId?: string;
    categoryIds?: string[];
    description?: string;
    imageUrl?: string;
    images?: string[];
    packSize?: string;
    unit?: string;
    sku?: string;
    vendorSku?: string;
    hsn?: string;
    fssaiRef?: string;
    brand?: string;
    barcode?: string;
    tags?: string[];
    aliasNames?: string[];
    shelfLifeDays?: number;
    countryOfOrigin?: string;
    vegNonVeg?: 'veg' | 'nonveg' | 'egg';
    storageType?: string;
    basePrice: number;
    originalPrice?: number;
    taxPercent?: number;
    minOrderQty?: number;
    creditEligible?: boolean;
    masterProductId?: string;
    basedOnProductId?: string;
    basedOnBrandMasterProductId?: string;
    listingStatus?: 'draft' | 'submitted';
  }) {
    const {
      basedOnProductId,
      basedOnBrandMasterProductId,
      categoryIds,
      vendorSku,
      listingStatus = 'submitted',
      ...productData
    } = data;
    const isDraft = listingStatus === 'draft';
    let resolvedVendorSku: string | undefined = vendorSku?.trim() || undefined;

    // Resolve the category set: prefer the explicit multi-category array, fall
    // back to the single legacy categoryId, then inherit the master's category.
    // The first entry is the "primary" — mirrored into Product.categoryId and
    // flagged isPrimary=true in the join table so existing single-category
    // queries (filtering, breadcrumbs) keep working unchanged.
    let resolvedCategoryIds = categoryIds && categoryIds.length > 0
      ? categoryIds
      : (data.categoryId ? [data.categoryId] : []);
    if (resolvedCategoryIds.length === 0 && productData.masterProductId) {
      const m = await prisma.masterProduct.findUnique({
        where: { id: productData.masterProductId },
        select: {
          categoryId: true,
          categoryLinks: {
            select: { categoryId: true, isPrimary: true },
            orderBy: [{ isPrimary: 'desc' }, { categoryId: 'asc' }],
          },
        },
      });
      if (m) {
        resolvedCategoryIds =
          m.categoryLinks.length > 0
            ? m.categoryLinks.map((l) => l.categoryId)
            : [m.categoryId];
      }
    }
    // Published listings require at least one leaf sub-category; drafts may omit categories.
    if (!isDraft) {
      if (resolvedCategoryIds.length === 0) {
        throw Errors.badRequest('Product must be mapped to at least one sub-category.');
      }
      await assertLeafCategory(resolvedCategoryIds);
      productData.categoryId = resolvedCategoryIds[0];
    } else if (resolvedCategoryIds.length > 0) {
      await assertLeafCategory(resolvedCategoryIds);
      productData.categoryId = resolvedCategoryIds[0];
    }

    // If based on an existing approved product, inherit master SKU and auto-approve.
    let approvalStatus: 'pending' | 'approved' = 'pending';
    if (isDraft) {
      approvalStatus = 'pending';
    } else if (basedOnProductId) {
      const source = await prisma.product.findFirst({
        where: { id: basedOnProductId, approvalStatus: 'approved' },
        select: { id: true, name: true, brand: true, imageUrl: true, images: true, masterProductId: true },
      });
      if (source) {
        approvalStatus = 'approved';
        if (source.masterProductId) productData.masterProductId = source.masterProductId;
        productData.name = source.name;
        if (source.brand) productData.brand = source.brand;
        if (source.imageUrl) productData.imageUrl = source.imageUrl;
        if (source.images && Array.isArray(source.images) && (source.images as string[]).length > 0) {
          productData.images = source.images as string[];
        }
      }
    }

    // If based on a brand canonical product, inherit master link when available.
    let brandMaster: { id: string; brandId: string; name: string; brandName: string } | null = null;
    if (basedOnBrandMasterProductId) {
      const mp = await prisma.brandMasterProduct.findFirst({
        where: {
          id: basedOnBrandMasterProductId,
          isActive: true,
          brand: { isActive: true, approvalStatus: 'approved' },
        },
        select: {
          id: true,
          brandId: true,
          name: true,
          sku: true,
          masterProductId: true,
          brand: { select: { name: true } },
        },
      });
      if (mp) {
        approvalStatus = 'approved';
        if (mp.masterProductId) {
          productData.masterProductId = mp.masterProductId;
        } else if (mp.sku) {
          const linked = await prisma.masterProduct.findFirst({
            where: { sku: { equals: mp.sku, mode: 'insensitive' }, approvalStatus: 'approved' },
            select: { id: true },
          });
          if (linked) productData.masterProductId = linked.id;
        }
        brandMaster = { id: mp.id, brandId: mp.brandId, name: mp.name, brandName: mp.brand.name };
        productData.brand = mp.brand.name;
      }
    }

    // Master catalog match → instant approved listing with admin-assigned SKU.
    if (!isDraft && productData.masterProductId) {
      const master = await prisma.masterProduct.findFirst({
        where: { id: productData.masterProductId, approvalStatus: 'approved', isActive: true },
        select: {
          id: true, name: true, brand: true, sku: true, categoryId: true, imageUrl: true, images: true, uom: true,
          categoryLinks: {
            select: { categoryId: true, isPrimary: true },
            orderBy: [{ isPrimary: 'desc' }, { categoryId: 'asc' }],
          },
        },
      });
      if (!master) throw Errors.badRequest('Master product not found or not approved.');
      approvalStatus = 'approved';
      productData.name = master.name;
      if (master.brand) productData.brand = master.brand;
      const posSku = (vendorSku ?? productData.sku)?.trim();
      if (!posSku) {
        throw Errors.badRequest('Your POS SKU is required when listing a catalog item.');
      }
      productData.sku = await composeVendorProductSku(vendorId, posSku);
      resolvedVendorSku = posSku;
      if (master.imageUrl && !productData.imageUrl) productData.imageUrl = master.imageUrl;
      if (master.images.length > 0 && (!productData.images || productData.images.length === 0)) {
        productData.images = master.images;
      }
      if (resolvedCategoryIds.length === 0) {
        resolvedCategoryIds =
          master.categoryLinks.length > 0
            ? master.categoryLinks.map((l) => l.categoryId)
            : [master.categoryId];
        productData.categoryId = resolvedCategoryIds[0];
      }

      const dup = await prisma.product.findFirst({
        where: {
          vendorId,
          masterProductId: productData.masterProductId,
          slug: { not: { startsWith: TOMBSTONE_PREFIX } },
        },
        select: { id: true, name: true },
      });
      if (dup) {
        throw Errors.conflict(`You already list "${dup.name}" for this master SKU. Edit the existing product instead.`);
      }
    } else if (approvalStatus === 'pending' && !isDraft) {
      // New vendor submission — admin reviews and assigns catalog SKU before it goes live.
      // Treat body.sku as the vendor POS code when vendorSku was not sent explicitly.
      if (!resolvedVendorSku && typeof productData.sku === 'string' && productData.sku.trim()) {
        resolvedVendorSku = productData.sku.trim();
      }
      delete productData.masterProductId;
      delete productData.sku;

      const dupSlug = await prisma.product.findFirst({
        where: {
          vendorId,
          slug: productData.slug,
        },
        select: { id: true, name: true, slug: true },
      });
      if (dupSlug && !dupSlug.slug.startsWith(TOMBSTONE_PREFIX)) {
        throw Errors.conflict(`You already have a product named "${dupSlug.name}". Edit it instead.`);
      }
    } else if (isDraft) {
      if (!resolvedVendorSku && typeof productData.sku === 'string' && productData.sku.trim()) {
        resolvedVendorSku = productData.sku.trim();
      }
      delete productData.sku;
    }

    // Block duplicate POS codes at create/draft time — don't wait until admin approve.
    if (resolvedVendorSku) {
      await assertVendorPosSkuUnique(vendorId, resolvedVendorSku);
    }

    // Vendor single-add loophole: a brand typed freely (not picked from the
    // approved list) must still become a tracked record so it reaches the
    // approvals queue — mirrors what product import does. Only for genuinely new
    // submissions; the master / brand-canonical paths already carry an approved
    // brand. Lazy import avoids a static import cycle with the brand module.
    if (!isDraft && approvalStatus === 'pending' && productData.brand) {
      const { findOrCreateBrandByName } = await import('@/modules/brand/brand.service');
      await findOrCreateBrandByName({ name: productData.brand, autoApprove: false });
    }

    const draftBasePrice =
      productData.basePrice != null && productData.basePrice > 0 ? productData.basePrice : 0.01;

    const created = await prisma.product.create({
      data: {
        ...productData,
        vendorSku: resolvedVendorSku,
        vendorId,
        basePrice: isDraft ? draftBasePrice : productData.basePrice,
        approvalStatus,
        listingStatus: isDraft ? 'draft' : 'submitted',
        isActive: isDraft ? false : (productData as { isActive?: boolean }).isActive ?? true,
      },
    });

    // Write the multi-category join rows. First entry is isPrimary=true to match
    // Product.categoryId. skipDuplicates guards against the caller passing the
    // same id twice.
    if (resolvedCategoryIds.length > 0) {
      await prisma.productCategory.createMany({
        data: resolvedCategoryIds.map((categoryId, idx) => ({
          productId: created.id,
          categoryId,
          isPrimary: idx === 0,
        })),
        skipDuplicates: true,
      });
    }

    // When the vendor explicitly picked the brand catalog entry, create a verified
    // mapping immediately. No need to wait on embedding or the fuzzy auto-mapper —
    // the user told us the link is right. Idempotent via the unique pair.
    if (brandMaster) {
      await prisma.brandProductMapping.upsert({
        where: {
          brandMasterProductId_distributorProductId: {
            brandMasterProductId: brandMaster.id,
            distributorProductId: created.id,
          },
        },
        create: {
          brandId: brandMaster.brandId,
          brandMasterProductId: brandMaster.id,
          distributorProductId: created.id,
          status: 'verified',
          matchedBy: 'manually_verified',
          confidenceScore: 1.0,
        },
        update: {
          status: 'verified',
          matchedBy: 'manually_verified',
          confidenceScore: 1.0,
          updatedAt: new Date(),
        },
      });
    }

    // Fire-and-forget: embed first, THEN run brand mapping so the AI signal is available.
    // Skip the auto-mapper when we already created a verified mapping above.
    if (!isDraft && approvalStatus === 'approved' && !brandMaster) {
      embedDistributorProduct(created.id)
        .catch(() => {})
        .finally(() => runMappingForVendorProduct(created.id).catch(() => {}));
    }

    return created;
  }

  /**
   * Decide whether a vendor product qualifies for instant approval (catalog match).
   * Mirrors the auto-approve branches in createProduct.
   */
  private async evaluateInstantApproval(input: {
    vendorId: string;
    masterProductId?: string | null;
    basedOnProductId?: string;
    basedOnBrandMasterProductId?: string;
    excludeProductId?: string;
  }): Promise<'approved' | 'pending'> {
    const { vendorId, excludeProductId } = input;
    let masterProductId = input.masterProductId ?? null;

    if (input.basedOnProductId) {
      const source = await prisma.product.findFirst({
        where: { id: input.basedOnProductId, approvalStatus: 'approved' },
        select: { masterProductId: true },
      });
      if (source) {
        if (source.masterProductId) masterProductId = source.masterProductId;
        return 'approved';
      }
    }

    if (input.basedOnBrandMasterProductId) {
      const mp = await prisma.brandMasterProduct.findFirst({
        where: {
          id: input.basedOnBrandMasterProductId,
          isActive: true,
          brand: { isActive: true, approvalStatus: 'approved' },
        },
        select: { masterProductId: true, sku: true },
      });
      if (mp) {
        if (mp.masterProductId) {
          masterProductId = mp.masterProductId;
        } else if (mp.sku) {
          const linked = await prisma.masterProduct.findFirst({
            where: { sku: { equals: mp.sku, mode: 'insensitive' }, approvalStatus: 'approved' },
            select: { id: true },
          });
          if (linked) masterProductId = linked.id;
        }
        return 'approved';
      }
    }

    if (masterProductId) {
      const master = await prisma.masterProduct.findFirst({
        where: { id: masterProductId, approvalStatus: 'approved', isActive: true },
        select: { id: true },
      });
      if (!master) return 'pending';

      const dup = await prisma.product.findFirst({
        where: {
          vendorId,
          masterProductId,
          slug: { not: { startsWith: TOMBSTONE_PREFIX } },
          ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
        },
        select: { id: true },
      });
      if (dup) return 'pending';

      return 'approved';
    }

    return 'pending';
  }

  async updateProduct(
    productId: string,
    vendorId: string,
    data: Record<string, unknown>,
    actorUserId?: string,
  ) {
    const product = await prisma.product.findFirst({
      where: { id: productId, vendorId },
    });
    if (!product) throw Errors.notFound('Product');

    const isResubmit = product.approvalStatus === 'rejected';
    const isDraftSave = data.listingStatus === 'draft';
    const isPublishing =
      data.listingStatus === 'submitted' && product.listingStatus === 'draft';

    // Archive / unarchive semantics
    if (data.isActive === false && product.isActive && product.approvalStatus === 'approved') {
      data.archivedAt = new Date();
    } else if (data.isActive === true) {
      data.archivedAt = null;
    }

    const categoryIds = Array.isArray(data.categoryIds) ? (data.categoryIds as string[]) : undefined;
    delete data.categoryIds;

    if (categoryIds !== undefined) {
      if (isDraftSave) {
        if (categoryIds.length > 0) {
          await assertLeafCategory(categoryIds);
          data.categoryId = categoryIds[0] ?? null;
        }
      } else {
        if (categoryIds.length === 0) {
          throw Errors.badRequest('Product must remain mapped to at least one sub-category.');
        }
        await assertLeafCategory(categoryIds);
        data.categoryId = categoryIds[0] ?? null;
      }
    } else if (isPublishing) {
      const existingCats = await prisma.productCategory.findMany({
        where: { productId },
        select: { categoryId: true },
      });
      const cats =
        existingCats.length > 0
          ? existingCats.map((c) => c.categoryId)
          : product.categoryId
            ? [product.categoryId]
            : [];
      if (cats.length === 0) {
        throw Errors.badRequest('Product must be mapped to at least one sub-category.');
      }
      await assertLeafCategory(cats);
    }

    if (isDraftSave) {
      data.isActive = false;
    } else if (data.listingStatus === 'submitted') {
      data.isActive = true;
    }

    if (product.approvalStatus === 'approved' && !isResubmit) {
      delete data.masterProductId;
    }

    // Compose vendor SKU when POS code changes (approved / catalog-linked listings).
    // Pending/draft listings store POS in vendorSku and get composed sku on approve.
    if (typeof data.vendorSku === 'string' && data.vendorSku.trim()) {
      const posSku = data.vendorSku.trim();
      await assertVendorPosSkuUnique(vendorId, posSku, productId);
      data.vendorSku = posSku;
      if (product.approvalStatus === 'approved' || product.masterProductId) {
        data.sku = await composeVendorProductSku(vendorId, posSku, productId);
      } else {
        // Keep listing sku unset until catalog approval composes it.
        data.sku = null;
      }
    } else if (
      typeof data.sku === 'string' &&
      data.sku.trim() &&
      product.approvalStatus !== 'approved' &&
      !product.masterProductId
    ) {
      // Vendor form sends POS in `sku` for standalone pending/draft products.
      const posSku = data.sku.trim();
      await assertVendorPosSkuUnique(vendorId, posSku, productId);
      data.vendorSku = posSku;
      data.sku = null;
    }

    const existingCategoryRows = await prisma.productCategory.findMany({
      where: { productId },
      select: { categoryId: true },
    });
    const currentCategoryIds =
      existingCategoryRows.length > 0
        ? existingCategoryRows.map((c) => c.categoryId)
        : product.categoryId
          ? [product.categoryId]
          : [];

    // Material vs non-material split for approved live listings
    const isApprovedLive =
      product.approvalStatus === 'approved' && !isResubmit && !isDraftSave;
    const isPendingEdit = product.approvalStatus === 'pending_edit';

    let pendingPayload: PendingEditPayload | null = null;

    if (isApprovedLive || isPendingEdit) {
      const { materialPayload, hasMaterialChanges, nameIsMinorOnly } = detectMaterialChanges(
        {
          name: product.name,
          brand: product.brand,
          hsn: product.hsn,
          packSize: product.packSize,
          unit: product.unit,
          vegNonVeg: product.vegNonVeg,
          masterProductId: product.masterProductId,
          categoryId: product.categoryId,
          imageUrl: product.imageUrl,
          images: product.images,
        },
        currentCategoryIds,
        data,
        categoryIds,
      );

      if (isTaxPercentMaterial(data, materialPayload)) {
        (materialPayload as Record<string, unknown>).taxPercent = data.taxPercent;
      }

      if (hasMaterialChanges) {
        const existingPending = (product.pendingEditPayload ?? {}) as unknown as PendingEditPayload;
        pendingPayload = {
          ...existingPending,
          ...materialPayload,
          submittedAt: new Date().toISOString(),
          submittedBy: actorUserId ?? vendorId,
        };
        data.approvalStatus = 'pending_edit';

        // Strip material fields from live update — queue only
        for (const key of [
          'brand',
          'name',
          'hsn',
          'packSize',
          'unit',
          'vegNonVeg',
          'masterProductId',
          'taxPercent',
          'imageUrl',
          'images',
        ] as const) {
          if (materialPayload[key as keyof typeof materialPayload] !== undefined) {
            delete data[key];
          }
        }
        if (materialPayload.categoryIds !== undefined) {
          delete data.categoryId;
        }
        data.pendingEditPayload = pendingPayload as unknown as Prisma.InputJsonValue;

        emitEvent('ProductEditSubmitted', {
          productId,
          vendorId,
          productName: product.name,
        });
      } else if (nameIsMinorOnly && data.name !== undefined) {
        // Minor name typo — apply live, audit only
      }

      // Non-material fields apply immediately with audit
      if (actorUserId) {
        const nonMaterialBefore: Record<string, unknown> = {};
        const nonMaterialAfter: Record<string, unknown> = {};
        for (const field of NON_MATERIAL_PRODUCT_FIELDS) {
          if (data[field] !== undefined) {
            nonMaterialBefore[field] = (product as Record<string, unknown>)[field];
            nonMaterialAfter[field] = data[field];
          }
        }
        await auditProductDiff(
          productId,
          actorUserId,
          'vendor_edit',
          nonMaterialBefore,
          nonMaterialAfter,
          [...NON_MATERIAL_PRODUCT_FIELDS],
        );
        if (nameIsMinorOnly && data.name !== undefined) {
          await logProductFieldChanges(productId, actorUserId, 'vendor_edit', [
            { field: 'name', oldValue: product.name, newValue: data.name },
          ]);
        }
      }

      if (categoryIds !== undefined && !materialPayload.categoryIds) {
        await syncProductCategories(productId, categoryIds);
        delete data.categoryId;
      }
    }

    if (isResubmit) {
      const mergedMasterId =
        (typeof data.masterProductId === 'string' ? data.masterProductId : null) ??
        product.masterProductId;
      const basedOnProductId =
        typeof data.basedOnProductId === 'string' ? data.basedOnProductId : undefined;
      const basedOnBrandMasterProductId =
        typeof data.basedOnBrandMasterProductId === 'string'
          ? data.basedOnBrandMasterProductId
          : undefined;

      const approvalStatus = await this.evaluateInstantApproval({
        vendorId,
        masterProductId: mergedMasterId,
        basedOnProductId,
        basedOnBrandMasterProductId,
        excludeProductId: productId,
      });

      if (approvalStatus === 'approved' && mergedMasterId) {
        const master = await prisma.masterProduct.findFirst({
          where: { id: mergedMasterId, approvalStatus: 'approved', isActive: true },
          select: {
            id: true,
            name: true,
            brand: true,
            sku: true,
            categoryId: true,
            imageUrl: true,
            images: true,
          },
        });
        if (master) {
          data.name = master.name;
          if (master.brand) data.brand = master.brand;
          const vendorSkuInput = typeof data.vendorSku === 'string' ? data.vendorSku : undefined;
          delete data.vendorSku;
          const posSku =
            vendorSkuInput?.trim() ||
            (typeof data.sku === 'string' ? data.sku.trim() : '') ||
            product.sku?.trim() ||
            '';
          if (posSku) {
            data.sku = await composeVendorProductSku(vendorId, posSku, productId);
            data.vendorSku = posSku;
          } else {
            throw Errors.badRequest('Your POS SKU is required when listing a catalog item.');
          }
          data.masterProductId = master.id;
          if (master.imageUrl && !data.imageUrl) data.imageUrl = master.imageUrl;
          if (
            master.images.length > 0 &&
            (!Array.isArray(data.images) || (data.images as string[]).length === 0)
          ) {
            data.images = master.images;
          }
          if (!data.categoryId && !categoryIds?.length) {
            data.categoryId = master.categoryId;
          }
        }
      }

      data.approvalStatus = approvalStatus;
      data.approvalNote = null;
      data.approvedBy = null;
      data.approvedAt = null;
      data.pendingEditPayload = Prisma.JsonNull;
    }

    // Enforce the approval state machine for any in-flow status change
    // (material edit → pending_edit, resubmit → pending|approved). Initial
    // status on create is set elsewhere and is not a transition.
    if (
      typeof data.approvalStatus === 'string' &&
      data.approvalStatus !== product.approvalStatus &&
      !canTransitionApproval(product.approvalStatus, data.approvalStatus as ApprovalStatus)
    ) {
      throw Errors.conflict(
        `Invalid product approval transition: "${product.approvalStatus}" → "${data.approvalStatus}".`,
      );
    }

    const updated = await prisma.product.update({ where: { id: productId }, data });

    if (
      actorUserId &&
      typeof data.approvalStatus === 'string' &&
      data.approvalStatus !== product.approvalStatus
    ) {
      await logProductFieldChanges(productId, actorUserId, isResubmit ? 'vendor_edit' : 'system', [
        { field: 'approvalStatus', oldValue: product.approvalStatus, newValue: data.approvalStatus },
      ]);
    }

    if (categoryIds !== undefined && !pendingPayload?.categoryIds) {
      await syncProductCategories(productId, categoryIds);
    }

    if (isResubmit) {
      if (updated.approvalStatus === 'approved') {
        emitEvent('ProductApproved', {
          productId: updated.id,
          vendorId,
          productName: updated.name,
          approvedBy: '',
        });
        embedDistributorProduct(updated.id)
          .catch(() => {})
          .finally(() => runMappingForVendorProduct(updated.id).catch(() => {}));
      } else if (updated.approvalStatus === 'pending') {
        emitEvent('ProductSubmitted', {
          productId: updated.id,
          vendorId,
          productName: updated.name,
        });
      }
    } else if (isPublishing && updated.approvalStatus === 'pending') {
      emitEvent('ProductSubmitted', {
        productId: updated.id,
        vendorId,
        productName: updated.name,
      });
    }

    return updated;
  }

  /** Admin approves a pending_edit — apply queued payload to live listing. */
  async applyPendingProductEdit(
    productId: string,
    adminUserId: string,
  ): Promise<void> {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw Errors.notFound('Product');
    if (product.approvalStatus !== 'pending_edit') {
      throw Errors.badRequest('Product has no pending edit to approve.');
    }
    const pending = product.pendingEditPayload as unknown as PendingEditPayload | null;
    if (!pending) throw Errors.badRequest('Pending edit payload is empty.');

    const updateData: Prisma.ProductUncheckedUpdateInput = {
      pendingEditPayload: Prisma.DbNull,
      approvedBy: adminUserId,
      approvedAt: new Date(),
    };

    if (pending.name !== undefined) updateData.name = pending.name;
    if (pending.brand !== undefined) updateData.brand = pending.brand;
    if (pending.hsn !== undefined) updateData.hsn = pending.hsn;
    if (pending.packSize !== undefined) updateData.packSize = pending.packSize;
    if (pending.unit !== undefined) updateData.unit = pending.unit;
    if (pending.vegNonVeg !== undefined) {
      updateData.vegNonVeg = pending.vegNonVeg as Prisma.ProductUncheckedUpdateInput['vegNonVeg'];
    }
    if (pending.masterProductId !== undefined) {
      updateData.masterProductId = pending.masterProductId ?? null;
    }
    if (pending.categoryIds?.length) {
      updateData.categoryId = pending.categoryIds[0];
    }
    if (pending.imageUrl !== undefined) {
      updateData.imageUrl = pending.imageUrl;
    }
    if (pending.images !== undefined) {
      updateData.images = pending.images;
    }

    await transitionProductApproval(productId, 'approved', adminUserId, {
      data: updateData,
      source: 'admin_edit',
    });

    if (pending.categoryIds?.length) {
      await syncProductCategories(productId, pending.categoryIds);
    }

    await logProductFieldChanges(
      productId,
      adminUserId,
      'admin_edit',
      Object.entries(pending)
        .filter(([k]) => !['submittedAt', 'submittedBy'].includes(k))
        .map(([field, newValue]) => ({
          field,
          oldValue: (product as Record<string, unknown>)[field],
          newValue,
        })),
    );

    if (product.vendorId) {
      emitEvent('ProductEditApproved', {
        productId,
        vendorId: product.vendorId,
        productName: (pending.name as string) ?? product.name,
        approvedBy: adminUserId,
      });
    }
  }

  /** Admin rejects pending_edit — discard queue, keep live listing. */
  async rejectPendingProductEdit(
    productId: string,
    adminUserId: string,
    note?: string,
  ): Promise<void> {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw Errors.notFound('Product');
    if (product.approvalStatus !== 'pending_edit') {
      throw Errors.badRequest('Product has no pending edit to reject.');
    }

    await transitionProductApproval(productId, 'approved', adminUserId, {
      data: {
        pendingEditPayload: Prisma.DbNull,
        approvalNote: note ?? null,
      },
      source: 'admin_edit',
    });

    if (product.vendorId) {
      emitEvent('ProductEditRejected', {
        productId,
        vendorId: product.vendorId,
        productName: product.name,
        rejectedBy: adminUserId,
        reason: note,
      });
    }
  }

  // Hard-delete the product.
  // OrderItem snapshots + the product FK. If cart/list refs block deletion (no orders),
  // fall back to tombstoning so the [vendorId, slug] unique frees up.
  // Returns { hardDeleted: true } when fully gone, or { hardDeleted: false } when tombstoned.
  async deleteProduct(productId: string, vendorId?: string): Promise<{ hardDeleted: boolean }> {
    const product = await prisma.product.findFirst({
      where: { id: productId, ...(vendorId ? { vendorId } : {}) },
      select: { id: true, slug: true, name: true, vendorId: true },
    });
    if (!product) throw Errors.notFound('Product');

    const orderCount = await prisma.orderItem.count({ where: { productId } });
    if (orderCount > 0) {
      throw Errors.conflict('Cannot delete: this SKU has order history.');
    }

    try {
      await prisma.product.delete({ where: { id: productId } });
      return { hardDeleted: true };
    } catch (e) {
      // Prisma FK-violation: P2003 (referenced rows exist with no cascade).
      // Expected blockers without order history: cart_items, quick_order_list_items.
      const code = (e as { code?: string })?.code;
      if (code !== 'P2003') throw e;

      const ts = Date.now();
      await prisma.product.update({
        where: { id: productId },
        data: {
          slug: `${TOMBSTONE_PREFIX}${ts}_${product.slug}`.slice(0, 255),
          name: `[Deleted] ${product.name}`.slice(0, 255),
          isActive: false,
        },
      });
      return { hardDeleted: false };
    }
  }

  async approveProduct(productId: string, adminUserId: string, note?: string) {
    const product = await transitionProductApproval(productId, 'approved', adminUserId, {
      data: {
        approvedBy: adminUserId,
        approvedAt: new Date(),
        approvalNote: note || null,
      },
      source: 'admin_edit',
    });
    if (product.vendorId) {
      emitEvent('ProductApproved', {
        productId: product.id,
        vendorId: product.vendorId,
        productName: product.name,
        approvedBy: adminUserId,
      });
    }
    // Fire-and-forget: embed then run brand mapping once approved.
    embedDistributorProduct(product.id)
      .catch(() => {})
      .finally(() => runMappingForVendorProduct(product.id).catch(() => {}));
    return product;
  }

  async rejectProduct(productId: string, adminUserId: string, note: string) {
    const product = await transitionProductApproval(productId, 'rejected', adminUserId, {
      data: {
        approvedBy: adminUserId,
        approvedAt: new Date(),
        approvalNote: note,
      },
      source: 'admin_edit',
    });
    const { sendProductRejectedNotifications } = await import('@/lib/productRejectionNotifications');
    await sendProductRejectedNotifications({
      productId: product.id,
      vendorId: product.vendorId,
      productName: product.name,
      reason: note,
    });
    return product;
  }

  async approveCategory(categoryId: string, adminUserId: string, note?: string) {
    const category = await prisma.category.update({
      where: { id: categoryId },
      data: {
        approvalStatus: 'approved',
        approvedBy: adminUserId,
        approvedAt: new Date(),
        approvalNote: note || null,
      },
    });
    emitEvent('CategoryApproved', {
      categoryId: category.id,
      categoryName: category.name,
      approvedBy: adminUserId,
      suggestedBy: category.suggestedBy || undefined,
    });
    return category;
  }

  async rejectCategory(categoryId: string, adminUserId: string, note: string) {
    const category = await prisma.category.update({
      where: { id: categoryId },
      data: {
        approvalStatus: 'rejected',
        approvedBy: adminUserId,
        approvedAt: new Date(),
        approvalNote: note,
      },
    });
    emitEvent('CategoryRejected', {
      categoryId: category.id,
      categoryName: category.name,
      rejectedBy: adminUserId,
      suggestedBy: category.suggestedBy || undefined,
      reason: note,
    });
    return category;
  }
}
