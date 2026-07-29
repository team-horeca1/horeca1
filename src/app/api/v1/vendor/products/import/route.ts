/**
 * POST /api/v1/vendor/products/import — Server-side Excel/CSV product importer
 * GET  /api/v1/vendor/products/import?template=true — Download import template
 * ───────────────────────────────────────────────────────────────────────────
 * Vendor-facing twin of /api/v1/admin/products/import. Same robust two-phase
 * flow (preview → commit) with inline row edits, per-row skip, and an undo
 * backup — but every read, write, and backup is hard-scoped to the caller's
 * session-resolved vendorId. A vendor can never preview or mutate another
 * vendor's catalog: the vendorId is taken from resolveVendorContext, never
 * from the request body.
 *
 * Differences from the admin route (all intentional):
 *   • vendorId is always present (session-resolved), so inventory rows and
 *     price slabs are always created — no "catalog-level" no-vendor branch.
 *   • New products land as approvalStatus='pending' (vendors don't self-
 *     approve). Updates leave approval untouched.
 *   • Tombstoned products (slug starts with `_deleted_`) are excluded from
 *     match queries so a delete-then-reimport creates fresh rows instead of
 *     resurrecting a dead one.
 *   • Slugs are made unique per-vendor at create time to respect the
 *     [vendorId, slug] unique constraint even when a file repeats a name.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse, friendlyErrorMessage } from '@/middleware/errorHandler';
import { parseProductImport, generateImportTemplate, generatePriceUpdateTemplate, type ParsedProductRow } from '@/modules/import-export/excel.service';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { resolveVendorOutletContext } from '@/lib/resolveVendorOutletContext';
import { ensureInventoryForAllOutlets } from '@/lib/inventoryOutlet';
import { totalStockQty } from '@/lib/inventoryHelpers';
import { requirePermission } from '@/lib/permissions/engine';
import {
  assertLeafCategory,
  assertVendorMasterListingUnique,
  composeVendorListingSku,
  findApprovedMasterByNameBrand,
  resolveImportCategoryIds,
  syncImportProductCategories,
} from '@/modules/catalog/catalog.service';
import { findOrCreateBrandByName } from '@/modules/brand/brand.service';
import {
  partitionImportRows,
  buildImportErrorReportCsv,
  type ImportErrorRowData,
} from '@/modules/import-export/import-commit';
import {
  enrichImportMetadata,
  mergeMetadata,
  normalizedVegForDb,
  resolveRowImageUrl,
  validateImportCategoryColumns,
} from '@/modules/import-export/import-helpers';
import { logProductFieldChanges, summarizePriceSlabs } from '@/lib/product-audit';
import { Prisma } from '@prisma/client';

// ── Response shapes — kept identical to the admin importer so the review
//    wizard UI is portable between the two portals. ──

interface PreviewItem {
  row: number;
  action: 'create' | 'update' | 'skip';
  name: string;
  sku?: string;
  hsn?: string;
  brand?: string;
  unit?: string;
  category?: string;
  basePrice: number;
  grossRate: number;
  taxPercent: number;
  promoPrice?: number | null;
  stock?: number;
  imageUrl?: string | null;
  imageName?: string | null;
  bulkSlabCount: number;
  bulkSlabs: Array<{
    minQty: number;
    price: number;
    grossRate: number;
    promoPrice?: number | null;
    promoGrossRate?: number | null;
  }>;
  hasPromo: boolean;
  existing?: {
    id: string;
    name: string;
    basePrice: number;
    taxPercent: number;
    stock: number;
    brand?: string;
    sku?: string;
  };
  skipReason?: string;
  parentCategory?: string;
  subCategory?: string;
  additionalSubCategories?: string[];
  vegNonVeg?: string;
  storageType?: string;
  moq?: number;
  aliasName?: string;
  upc?: string;
  metadata?: any;
}

interface PreviewResponse {
  totalRows: number;
  creates: number;
  updates: number;
  skips: number;
  errors: { row: number; field?: string; message: string }[];
  items: PreviewItem[];
}

interface CommitResponse {
  blocked: boolean;
  totalRows: number;
  validRows: number;
  created: number;
  updated: number;
  imported: number;
  errors: { row: number; field?: string; message: string }[];
  errorReport?: string;
  backupId: string;
}

// Tombstoned products keep their data but get a `_deleted_`-prefixed slug so
// the [vendorId, slug] unique constraint frees up. Match queries skip them.
const NOT_TOMBSTONED = { slug: { not: { startsWith: '_deleted_' } } } as const;

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export const GET = vendorOnly(async (req: NextRequest) => {
  try {
    const kind = req.nextUrl.searchParams.get('template');
    if (kind === 'price') {
      const buffer = generatePriceUpdateTemplate();
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="price_update_template.xlsx"',
        },
      });
    }
    // Static import template — same canonical generator the admin uses, so
    // the column headers the parser expects never drift from the template.
    const buffer = generateImportTemplate();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="product_import_template.xlsx"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    const outletCtx = await resolveVendorOutletContext(ctx, req);
    requirePermission(ctx, 'products.create');

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) throw Errors.notFound('File');

    const mode = (formData.get('mode') as string) || 'preview'; // 'preview' | 'commit'

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, errors: parseErrors } = parseProductImport(buffer);

    if (rows.length === 0 && parseErrors.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          totalRows: 0, creates: 0, updates: 0, skips: 0,
          errors: [{ row: 0, message: 'No valid rows found in file' }],
          items: [],
        } satisfies PreviewResponse,
      });
    }

    // Resolve category names → IDs (active + approved only — vendors can't
    // assign products to pending/disabled categories).
    const allCategories = await prisma.category.findMany({
      where: { isActive: true, approvalStatus: 'approved' },
      select: { id: true, name: true, slug: true },
    });
    const catMap = new Map<string, string>();
    for (const c of allCategories) {
      catMap.set(c.name.toLowerCase(), c.id);
      catMap.set(c.slug.toLowerCase(), c.id);
    }

    // ── Existing-product detection, scoped strictly to this vendor and
    //    excluding tombstones. Match by SKU first, then by name. ──
    const skus = rows.filter(r => r.sku).map(r => r.sku!);
    const existingProducts = skus.length > 0
      ? await prisma.product.findMany({
          where: {
            OR: [
              { sku: { in: skus } },
              { vendorSku: { in: skus } },
            ],
            vendorId,
            ...NOT_TOMBSTONED,
          },
          include: {
            inventories: { select: { qtyAvailable: true } },
            priceSlabs: { orderBy: { sortOrder: 'asc' } },
          },
        })
      : [];
    const existingBySku = new Map<string, typeof existingProducts[0]>();
    for (const p of existingProducts) {
      if (p.sku) existingBySku.set(p.sku.toLowerCase(), p);
      if (p.vendorSku) existingBySku.set(p.vendorSku.toLowerCase(), p);
    }

    const names = rows.map(r => r.name);
    const nameProducts = await prisma.product.findMany({
      where: { name: { in: names, mode: 'insensitive' }, vendorId, ...NOT_TOMBSTONED },
      include: {
        inventories: { select: { qtyAvailable: true } },
        priceSlabs: { orderBy: { sortOrder: 'asc' } },
      },
    });
    const existingByName = new Map<string, typeof existingProducts[0]>();
    for (const p of nameProducts) {
      existingByName.set(p.name.toLowerCase(), p);
    }

    function findExisting(row: { sku?: string; name: string }) {
      if (row.sku) {
        const match = existingBySku.get(row.sku.toLowerCase());
        if (match) return match;
      }
      return existingByName.get(row.name.toLowerCase());
    }

    // Products created earlier in THIS commit run. The snapshot maps above are
    // taken before any writes, so when a file lists the same item twice (a
    // common export artifact), the second row wouldn't see the product the
    // first row just created and would insert a DUPLICATE. Tracking in-run
    // creations lets the duplicate row update that product instead.
    const createdThisRun = new Map<string, { id: string; sku: string | null; vendorSku?: string | null; categoryId: string | null; basePrice: number }>();
    function findCreated(row: { sku?: string; name: string }) {
      if (row.sku) {
        const bySku = createdThisRun.get('sku:' + row.sku.toLowerCase());
        if (bySku) return bySku;
      }
      return createdThisRun.get('name:' + row.name.toLowerCase());
    }
    function registerCreated(p: {
      id: string;
      sku: string | null;
      vendorSku?: string | null;
      name: string;
      categoryId: string | null;
      basePrice: unknown;
    }) {
      const ref = {
        id: p.id,
        sku: p.sku,
        vendorSku: p.vendorSku,
        categoryId: p.categoryId,
        basePrice: Number(p.basePrice),
      };
      if (p.sku) createdThisRun.set('sku:' + p.sku.toLowerCase(), ref);
      if (p.vendorSku) createdThisRun.set('sku:' + p.vendorSku.toLowerCase(), ref);
      createdThisRun.set('name:' + p.name.toLowerCase(), ref);
    }

    // ── PREVIEW MODE ──
    if (mode === 'preview') {
      const items: PreviewItem[] = [];
      let creates = 0, updates = 0;
      const skips = 0;

      rows.forEach((r, idx) => {
        const rowNum = idx + 2;
        const existing = findExisting(r);

        const slabPreview = r.bulkSlabs.map((s) => ({
          minQty: s.minQty,
          price: s.taxableRate,
          grossRate: s.grossRate,
          promoPrice: s.promoTaxableRate ?? null,
          promoGrossRate: s.promoGrossRate ?? null,
        }));

        if (existing) {
          updates++;
          items.push({
            row: rowNum,
            action: 'update',
            name: r.name,
            sku: r.sku,
            hsn: r.hsn,
            brand: r.brand,
            unit: r.unit,
            category: r.category,
            basePrice: r.basePrice,
            grossRate: r.grossRate,
            taxPercent: r.taxPercent,
            promoPrice: r.promoPrice ?? null,
            stock: r.stock,
            imageUrl: r.imageUrl ?? null,
            imageName: r.imageName ?? null,
            bulkSlabCount: r.bulkSlabs.length,
            bulkSlabs: slabPreview,
            hasPromo: !!r.promoPrice,
            existing: {
              id: existing.id,
              name: existing.name,
              basePrice: Number(existing.basePrice),
              taxPercent: Number(existing.taxPercent),
              stock: totalStockQty(existing.inventories),
              brand: existing.brand || undefined,
              sku: existing.sku || undefined,
            },
            parentCategory: r.parentCategory,
            subCategory: r.subCategory,
            additionalSubCategories: r.additionalSubCategories,
            vegNonVeg: r.vegNonVeg,
            storageType: r.storageType,
            moq: r.moq,
            aliasName: r.aliasName,
            upc: r.upc,
            metadata: r.metadata,
          });
        } else {
          creates++;
          items.push({
            row: rowNum,
            action: 'create',
            name: r.name,
            sku: r.sku,
            hsn: r.hsn,
            brand: r.brand,
            unit: r.unit,
            category: r.category,
            basePrice: r.basePrice,
            grossRate: r.grossRate,
            taxPercent: r.taxPercent,
            promoPrice: r.promoPrice ?? null,
            stock: r.stock,
            imageUrl: r.imageUrl ?? null,
            imageName: r.imageName ?? null,
            bulkSlabCount: r.bulkSlabs.length,
            bulkSlabs: slabPreview,
            hasPromo: !!r.promoPrice,
            parentCategory: r.parentCategory,
            subCategory: r.subCategory,
            additionalSubCategories: r.additionalSubCategories,
            vegNonVeg: r.vegNonVeg,
            storageType: r.storageType,
            moq: r.moq,
            aliasName: r.aliasName,
            upc: r.upc,
            metadata: r.metadata,
          });
        }
      });

      return NextResponse.json({
        success: true,
        data: {
          totalRows: rows.length,
          creates,
          updates,
          skips,
          errors: parseErrors,
          items,
        } satisfies PreviewResponse,
      });
    }

    // ── COMMIT MODE ──
    const vendorRecord = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { vendorCode: true },
    });
    const vendorCode = vendorRecord?.vendorCode ?? null;

    // Backup every product that could be updated so the UI can offer a
    // complete Undo. A product can be matched by SKU *or* by name, so we
    // union both maps and dedupe by id — backing up only the SKU matches
    // (as a naive version would) silently drops name-matched updates from
    // the restore set.
    const backupId = `import_${Date.now()}_${vendorId.slice(0, 8)}`;
    const backupSource = Array.from(
      new Map([...existingProducts, ...nameProducts].map((p) => [p.id, p])).values(),
    );
    const productsToBackup = backupSource.map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      hsn: p.hsn,
      brand: p.brand,
      unit: p.unit,
      basePrice: Number(p.basePrice),
      taxPercent: Number(p.taxPercent),
      promoPrice: p.promoPrice ? Number(p.promoPrice) : null,
      stock: totalStockQty(p.inventories),
      priceSlabs: p.priceSlabs.map(s => ({
        minQty: s.minQty,
        price: Number(s.price),
        promoPrice: s.promoPrice ? Number(s.promoPrice) : null,
      })),
    }));

    // Strict by default: any invalid row blocks the whole commit. force=true
    // commits the valid rows and skips the invalid ones.
    const force = (formData.get('force') as string | null) === 'true';

    // Rows the vendor chose to skip in the review table.
    const skipRowsStr = formData.get('skipRows') as string | null;
    const skipRows = new Set(skipRowsStr ? JSON.parse(skipRowsStr) as number[] : []);

    // Per-row inline edits made in the review table. Whitelisted at apply
    // time so a forged extra key can't reach Prisma.
    const editsStr = formData.get('edits') as string | null;
    type EditSlab = { minQty: number; grossRate: number; promoGrossRate?: number | null };
    type EditRow = Partial<{
      name: string; sku: string; hsn: string; brand: string; unit: string; category: string;
      basePrice: number; taxPercent: number; promoPrice: number; stock: number; imageUrl: string; imageName: string;
      slabs: EditSlab[];
      parentCategory: string; subCategory: string; additionalSubCategories: string[];
      vegNonVeg: string; storageType: string; moq: number; aliasName: string; upc: string;
      account: string; accountCode: string; taxable: boolean; exemptionReason: string; taxabilityType: string;
      productType: string; platformCommission: number;
      inventoryAccount: string; inventoryAccountCode: string; valuationMethod: string; trackInventory: boolean;
      reorderPoint: number; openingStock: number; packageWeight: number; packageLength: number;
      packageWidth: number; packageHeight: number; dimensionUnit: string; weightUnit: string;
      ean: string; isbn: string; itemType: string; source: string; referenceId: string;
      lastSync: string; sellable: boolean; purchasable: boolean; variantMapping: string;
      itemStatus: string; activeOnlineStore: boolean;
    }>;
    let editsMap: Record<number, EditRow> = {};
    if (editsStr) {
      try {
        const parsed = JSON.parse(editsStr) as Record<string, EditRow>;
        for (const [k, v] of Object.entries(parsed)) {
          const n = Number(k);
          if (!Number.isInteger(n)) continue;
          const safe: EditRow = {};
          if (typeof v.name === 'string')      safe.name = v.name.trim();
          if (typeof v.sku === 'string')       safe.sku = v.sku.trim();
          if (typeof v.hsn === 'string')       safe.hsn = v.hsn.trim();
          if (typeof v.brand === 'string')     safe.brand = v.brand.trim();
          if (typeof v.unit === 'string')      safe.unit = v.unit.trim();
          if (typeof v.category === 'string')  safe.category = v.category.trim();
          if (typeof v.basePrice === 'number'  && v.basePrice > 0) safe.basePrice = v.basePrice;
          if (typeof v.taxPercent === 'number' && v.taxPercent >= 0 && v.taxPercent <= 100) safe.taxPercent = v.taxPercent;
          if (typeof v.promoPrice === 'number' && v.promoPrice > 0) safe.promoPrice = v.promoPrice;
          if (typeof v.stock === 'number'      && v.stock >= 0 && Number.isInteger(v.stock)) safe.stock = v.stock;
          if (typeof v.imageUrl === 'string')  safe.imageUrl = v.imageUrl.trim();
          if (typeof v.imageName === 'string') safe.imageName = v.imageName.trim();
          if (Array.isArray(v.slabs)) {
            safe.slabs = v.slabs
              .filter((s) => s && typeof s.minQty === 'number' && s.minQty > 0 && typeof s.grossRate === 'number' && s.grossRate > 0)
              .slice(0, 3)
              .map((s) => ({
                minQty: Math.floor(s.minQty),
                grossRate: s.grossRate,
                promoGrossRate: typeof s.promoGrossRate === 'number' && s.promoGrossRate > 0 ? s.promoGrossRate : null,
              }));
          }
          if (typeof v.parentCategory === 'string') safe.parentCategory = v.parentCategory.trim();
          if (typeof v.subCategory === 'string') safe.subCategory = v.subCategory.trim();
          if (Array.isArray(v.additionalSubCategories)) {
            safe.additionalSubCategories = v.additionalSubCategories.map(s => String(s).trim()).filter(Boolean);
          }
          if (typeof v.vegNonVeg === 'string') safe.vegNonVeg = v.vegNonVeg.trim();
          if (typeof v.storageType === 'string') safe.storageType = v.storageType.trim();
          if (typeof v.moq === 'number' && v.moq > 0) safe.moq = v.moq;
          if (typeof v.aliasName === 'string') safe.aliasName = v.aliasName.trim();
          if (typeof v.upc === 'string') safe.upc = v.upc.trim();

          if (typeof v.account === 'string') safe.account = v.account.trim();
          if (typeof v.accountCode === 'string') safe.accountCode = v.accountCode.trim();
          if (v.taxable !== undefined) safe.taxable = Boolean(v.taxable);
          if (typeof v.exemptionReason === 'string') safe.exemptionReason = v.exemptionReason.trim();
          if (typeof v.taxabilityType === 'string') safe.taxabilityType = v.taxabilityType.trim();
          if (typeof v.productType === 'string') safe.productType = v.productType.trim();
          if (typeof v.platformCommission === 'number') safe.platformCommission = v.platformCommission;

          if (typeof v.inventoryAccount === 'string') safe.inventoryAccount = v.inventoryAccount.trim();
          if (typeof v.inventoryAccountCode === 'string') safe.inventoryAccountCode = v.inventoryAccountCode.trim();
          if (typeof v.valuationMethod === 'string') safe.valuationMethod = v.valuationMethod.trim();
          if (v.trackInventory !== undefined) safe.trackInventory = Boolean(v.trackInventory);
          if (typeof v.reorderPoint === 'number') safe.reorderPoint = v.reorderPoint;
          if (typeof v.openingStock === 'number') safe.openingStock = v.openingStock;

          if (typeof v.packageWeight === 'number') safe.packageWeight = v.packageWeight;
          if (typeof v.packageLength === 'number') safe.packageLength = v.packageLength;
          if (typeof v.packageWidth === 'number') safe.packageWidth = v.packageWidth;
          if (typeof v.packageHeight === 'number') safe.packageHeight = v.packageHeight;
          if (typeof v.dimensionUnit === 'string') safe.dimensionUnit = v.dimensionUnit.trim();
          if (typeof v.weightUnit === 'string') safe.weightUnit = v.weightUnit.trim();

          if (typeof v.ean === 'string') safe.ean = v.ean.trim();
          if (typeof v.isbn === 'string') safe.isbn = v.isbn.trim();

          if (typeof v.itemType === 'string') safe.itemType = v.itemType.trim();
          if (typeof v.source === 'string') safe.source = v.source.trim();
          if (typeof v.referenceId === 'string') safe.referenceId = v.referenceId.trim();
          if (typeof v.lastSync === 'string') safe.lastSync = v.lastSync.trim();
          if (v.sellable !== undefined) safe.sellable = Boolean(v.sellable);
          if (v.purchasable !== undefined) safe.purchasable = Boolean(v.purchasable);
          if (typeof v.variantMapping === 'string') safe.variantMapping = v.variantMapping.trim();
          if (typeof v.itemStatus === 'string') safe.itemStatus = v.itemStatus.trim();
          if (v.activeOnlineStore !== undefined) safe.activeOnlineStore = Boolean(v.activeOnlineStore);

          editsMap[n] = safe;
        }
      } catch { editsMap = {}; }
    }

    // Slug uniqueness guard — seed from this vendor's existing slugs (incl.
    // tombstones, since those still occupy the unique key) and reserve each
    // new slug as we mint it so two rows with the same name don't collide.
    const usedSlugs = new Set(
      (await prisma.product.findMany({ where: { vendorId }, select: { slug: true } })).map(p => p.slug),
    );
    function uniqueSlug(name: string): string {
      const base = toSlug(name) || 'product';
      let candidate = base;
      let n = 2;
      while (usedSlugs.has(candidate)) {
        candidate = `${base}-${n++}`;
      }
      usedSlugs.add(candidate);
      return candidate;
    }

    // ── PASS 1: resolve reference data + validate every row. NO product writes.
    //    Category/brand auto-creation is idempotent reference data (pending admin
    //    approval) and may persist even if the atomic product commit later aborts.
    interface PreparedRow {
      rowNum: number;
      r: ParsedProductRow;
      existing: (typeof existingProducts)[number] | null;
      categoryId: string | null;
      categoryIds: string[];
      masterProductId: string | null;
      approvalStatus: 'pending' | 'approved';
      composedSku: string | null;
      vendorSku: string | null;
    }
    const prepared: PreparedRow[] = [];
    const validationErrors: { row: number; field?: string; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const parsedRow = rows[i];
      const rowNum = i + 2;

      if (skipRows.has(rowNum)) continue;

      // Merge inline edits OVER the parsed row — vendor keystrokes win.
      const e = editsMap[rowNum] ?? {};
      const r: ParsedProductRow = {
        ...parsedRow,
        ...(e.name      !== undefined ? { name: e.name } : {}),
        ...(e.sku       !== undefined ? { sku: e.sku } : {}),
        ...(e.hsn       !== undefined ? { hsn: e.hsn } : {}),
        ...(e.brand     !== undefined ? { brand: e.brand } : {}),
        ...(e.unit      !== undefined ? { unit: e.unit } : {}),
        ...(e.category  !== undefined ? { category: e.category } : {}),
        ...(e.basePrice !== undefined ? { basePrice: e.basePrice } : {}),
        ...(e.taxPercent !== undefined ? { taxPercent: e.taxPercent } : {}),
        ...(e.promoPrice !== undefined ? { promoPrice: e.promoPrice } : {}),
        ...(e.stock     !== undefined ? { stock: e.stock } : {}),
        ...(e.imageUrl  !== undefined ? { imageUrl: e.imageUrl } : {}),
        ...(e.imageName !== undefined ? { imageName: e.imageName } : {}),
        ...(e.parentCategory !== undefined ? { parentCategory: e.parentCategory } : {}),
        ...(e.subCategory !== undefined ? { subCategory: e.subCategory } : {}),
        ...(e.additionalSubCategories !== undefined ? { additionalSubCategories: e.additionalSubCategories } : {}),
        ...(e.vegNonVeg !== undefined ? { vegNonVeg: e.vegNonVeg } : {}),
        ...(e.storageType !== undefined ? { storageType: e.storageType } : {}),
        ...(e.moq !== undefined ? { moq: e.moq } : {}),
        ...(e.aliasName !== undefined ? { aliasName: e.aliasName } : {}),
        ...(e.upc !== undefined ? { upc: e.upc } : {}),
      };

      // Restructure metadata edits into r.metadata
      const meta = { ...(r.metadata || {}) };
      meta.accounting = {
        ...(meta.accounting || {}),
        ...(e.account !== undefined ? { account: e.account } : {}),
        ...(e.accountCode !== undefined ? { accountCode: e.accountCode } : {}),
        ...(e.taxable !== undefined ? { taxable: e.taxable } : {}),
        ...(e.exemptionReason !== undefined ? { exemptionReason: e.exemptionReason } : {}),
        ...(e.taxabilityType !== undefined ? { taxabilityType: e.taxabilityType } : {}),
        ...(e.platformCommission !== undefined ? { platformCommission: e.platformCommission } : {}),
      };
      meta.inventory = {
        ...(meta.inventory || {}),
        ...(e.inventoryAccount !== undefined ? { inventoryAccount: e.inventoryAccount } : {}),
        ...(e.inventoryAccountCode !== undefined ? { inventoryAccountCode: e.inventoryAccountCode } : {}),
        ...(e.valuationMethod !== undefined ? { valuationMethod: e.valuationMethod } : {}),
        ...(e.trackInventory !== undefined ? { trackInventory: e.trackInventory } : {}),
        ...(e.reorderPoint !== undefined ? { reorderPoint: e.reorderPoint } : {}),
        ...(e.openingStock !== undefined ? { openingStock: e.openingStock } : {}),
      };
      meta.packaging = {
        ...(meta.packaging || {}),
        ...(e.packageWeight !== undefined ? { packageWeight: e.packageWeight } : {}),
        ...(e.packageLength !== undefined ? { packageLength: e.packageLength } : {}),
        ...(e.packageWidth !== undefined ? { packageWidth: e.packageWidth } : {}),
        ...(e.packageHeight !== undefined ? { packageHeight: e.packageHeight } : {}),
        ...(e.dimensionUnit !== undefined ? { dimensionUnit: e.dimensionUnit } : {}),
        ...(e.weightUnit !== undefined ? { weightUnit: e.weightUnit } : {}),
      };
      meta.identifiers = {
        ...(meta.identifiers || {}),
        ...(e.ean !== undefined ? { ean: e.ean } : {}),
        ...(e.isbn !== undefined ? { isbn: e.isbn } : {}),
      };
      meta.attributes = {
        ...(meta.attributes || {}),
        ...(e.productType !== undefined ? { productType: e.productType } : {}),
        ...(e.itemType !== undefined ? { itemType: e.itemType } : {}),
        ...(e.source !== undefined ? { source: e.source } : {}),
        ...(e.referenceId !== undefined ? { referenceId: e.referenceId } : {}),
        ...(e.lastSync !== undefined ? { lastSync: e.lastSync } : {}),
        ...(e.sellable !== undefined ? { sellable: e.sellable } : {}),
        ...(e.purchasable !== undefined ? { purchasable: e.purchasable } : {}),
        ...(e.variantMapping !== undefined ? { variantMapping: e.variantMapping } : {}),
        ...(e.itemStatus !== undefined ? { itemStatus: e.itemStatus } : {}),
        ...(e.activeOnlineStore !== undefined ? { activeOnlineStore: e.activeOnlineStore } : {}),
      };
      r.metadata = meta;

      // Edited slab tiers override the file's. Sheet uses GROSS rate/unit;
      // convert to the taxable rate updatePriceSlabs persists, using the row's tax%.
      if (e.slabs !== undefined) {
        r.bulkSlabs = e.slabs.map((s) => ({
          minQty: s.minQty,
          grossRate: s.grossRate,
          taxableRate: r.taxPercent > 0 ? Math.round((s.grossRate / (1 + r.taxPercent / 100)) * 100) / 100 : s.grossRate,
          ...(s.promoGrossRate ? {
            promoGrossRate: s.promoGrossRate,
            promoTaxableRate: r.taxPercent > 0 ? Math.round((s.promoGrossRate / (1 + r.taxPercent / 100)) * 100) / 100 : s.promoGrossRate,
          } : {}),
        }));
      }

      try {
        validateImportCategoryColumns(r);
        const resolvedImageUrl = resolveRowImageUrl(r);
        if (resolvedImageUrl) r.imageUrl = resolvedImageUrl;

        // ── Resolve hierarchical categories (Parent / Sub / Additional).
        // Falls back to the legacy flat Category column during transition.
        const hasCategoryData = !!(
          r.parentCategory ||
          r.subCategory ||
          r.legacyCategory ||
          (r.additionalSubCategories && r.additionalSubCategories.length > 0)
        );
        let categoryId: string | null = null;
        let categoryIds: string[] = [];
        let categoryPending = false;
        if (hasCategoryData) {
          const resolved = await resolveImportCategoryIds({
            parentCategory: r.parentCategory,
            subCategory: r.subCategory,
            additionalSubCategories: r.additionalSubCategories,
            legacyCategory: r.legacyCategory,
            autoApprove: false,
            suggestedBy: ctx.userId,
            catMap,
          });
          categoryId = resolved.primaryCategoryId;
          categoryIds = resolved.categoryIds;
          categoryPending = resolved.pending;
          if (categoryIds.length === 0) {
            throw new Error('Sub-category required: pick a valid sub-category under the selected parent.');
          }
          await assertLeafCategory(categoryIds);
        }

        // ── Resolve brand → lightweight PENDING brand record when unknown.
        let brandPending = false;
        if (r.brand) {
          const resolvedBrand = await findOrCreateBrandByName({ name: r.brand, autoApprove: false, suggestedBy: ctx.userId });
          if (resolvedBrand && resolvedBrand.approvalStatus !== 'approved') brandPending = true;
        }

        const existing = findExisting(r) ?? null;

        let masterProductId: string | null = null;
        let approvalStatus: 'pending' | 'approved' = 'pending';
        let composedSku: string | null = null;
        const vendorSku: string | null = r.sku?.trim() || null;

        if (!existing) {
          // SKU-centric: link to approved master when matched; always compose listing SKU.
          if (categoryId) {
            const matched = await findApprovedMasterByNameBrand(r.name, r.brand ?? null);
            if (matched) {
              await assertVendorMasterListingUnique(vendorId, matched.id);
              masterProductId = matched.id;
              approvalStatus = 'approved';
            }
          }
          if (vendorSku) composedSku = await composeVendorListingSku(vendorId, vendorSku);
          // Invariant: an approved product needs an approved brand AND category.
          if (brandPending || categoryPending) approvalStatus = 'pending';
        } else if (vendorSku) {
          // Exclude self — uniqueness check would otherwise fail against this listing.
          composedSku = await composeVendorListingSku(vendorId, vendorSku, existing.id);
        }

        prepared.push({ rowNum, r, existing, categoryId, categoryIds, masterProductId, approvalStatus, composedSku, vendorSku });
      } catch (err) {
        validationErrors.push({
          row: rowNum,
          message: friendlyErrorMessage(err, 'Failed to validate product'),
        });
      }
    }

    // ── Decide the commit set. Strict (force=false): ANY error blocks everything.
    const part = partitionImportRows({
      rowNumbers: prepared.map((p) => p.rowNum),
      errorRowNumbers: validationErrors.map((er) => er.row),
      skipRowNumbers: [...skipRows] as number[],
      force,
    });
    // Parse failures use a different (sheet) row-number space and never appear in
    // `prepared`, so they can't be committed — but they DO block a strict commit.
    const blocked = part.blocked || (parseErrors.length > 0 && !force);
    const commitRowNumbers = blocked ? [] : part.commitRowNumbers;

    const allErrors = [...parseErrors, ...validationErrors];
    const rowData = new Map<number, ImportErrorRowData>(
      prepared.map(
        (p) =>
          [p.rowNum, { name: p.r.name, sku: p.r.sku, hsn: p.r.hsn, brand: p.r.brand, netRate: p.r.basePrice }] as [
            number,
            ImportErrorRowData,
          ],
      ),
    );
    const errorReport = allErrors.length > 0 ? buildImportErrorReportCsv(rowData, allErrors) : undefined;

    if (blocked) {
      // Strict mode + invalid rows: write NOTHING. Client can re-submit with force=true.
      return NextResponse.json({
        success: true,
        data: {
          blocked: true,
          totalRows: rows.length,
          validRows: commitRowNumbers.length,
          created: 0,
          updated: 0,
          imported: 0,
          errors: allErrors,
          errorReport,
          backupId,
          backup: productsToBackup,
        } satisfies CommitResponse & { backup: typeof productsToBackup },
      });
    }

    // ── PASS 2: atomic commit of the valid rows. All-or-nothing — if any write
    //    throws, the whole transaction rolls back and nothing is persisted.
    const commitSet = new Set(commitRowNumbers);
    let created = 0;
    let updated = 0;
    const responseErrors = [...allErrors];

    try {
      await prisma.$transaction(async (tx) => {
        for (const p of prepared) {
          if (!commitSet.has(p.rowNum)) continue;
          const r = p.r;
          // In-file duplicate (same SKU/name twice): the second row updates the
          // product the first row just created inside this transaction.
          const existing = p.existing ?? findCreated(r);

          if (existing) {
            // ── UPDATE existing product (approval left untouched) ──
            const updateSku = p.composedSku ?? undefined;
            const updateVendorSku = p.vendorSku ?? undefined;
            const mergedMeta = r.metadata
              ? mergeMetadata(
                  enrichImportMetadata(
                    (existing as { metadata?: unknown }).metadata as Record<string, unknown>,
                    vendorCode,
                    existing.id,
                  ),
                  r.metadata,
                )
              : enrichImportMetadata(
                  (existing as { metadata?: unknown }).metadata as Record<string, unknown>,
                  vendorCode,
                  existing.id,
                );
            const veg = normalizedVegForDb(r.vegNonVeg);
            await tx.product.update({
              where: { id: existing.id },
              data: {
                name: r.name,
                ...(updateSku !== undefined ? { sku: updateSku } : {}),
                ...(updateVendorSku !== undefined ? { vendorSku: updateVendorSku } : {}),
                categoryId: p.categoryId || existing.categoryId,
                basePrice: r.basePrice,
                taxPercent: r.taxPercent,
                promoPrice: r.promoPrice || null,
                promoStartTime: r.promoStartTime || null,
                promoEndTime: r.promoEndTime || null,
                ...(r.hsn ? { hsn: r.hsn } : {}),
                ...(r.unit ? { unit: r.unit } : {}),
                ...(r.brand ? { brand: r.brand } : {}),
                ...(r.imageUrl ? { imageUrl: r.imageUrl } : {}),
                metadata: mergedMeta,
                ...(veg !== undefined ? { vegNonVeg: veg } : {}),
                ...(r.storageType ? { storageType: r.storageType } : {}),
                ...(r.moq !== undefined ? { minOrderQty: r.moq } : {}),
                ...(r.aliasName ? { aliasNames: [r.aliasName] } : {}),
                ...(r.upc ? { barcode: r.upc } : {}),
                ...(r.packSize ? { packSize: r.packSize } : {}),
                ...(r.description ? { description: r.description } : {}),
                ...(r.originalPrice != null ? { originalPrice: r.originalPrice } : {}),
                ...(r.creditEligible != null ? { creditEligible: r.creditEligible } : {}),
                ...(r.isActive != null ? { isActive: r.isActive } : {}),
                ...(r.shelfLifeDays != null ? { shelfLifeDays: Number(r.shelfLifeDays) } : {}),
                ...(r.countryOfOrigin ? { countryOfOrigin: r.countryOfOrigin } : {}),
                ...(r.tags?.length ? { tags: r.tags } : {}),
              },
            });

            if (r.stock !== undefined) {
              await tx.inventory.upsert({
                where: { productId_outletId: { productId: existing.id, outletId: outletCtx.outletId } },
                update: { qtyAvailable: r.stock },
                create: {
                  productId: existing.id,
                  vendorId,
                  outletId: outletCtx.outletId,
                  qtyAvailable: r.stock,
                  lowStockThreshold: 10,
                },
              });
            }

            await updatePriceSlabs(existing.id, vendorId, r, tx);
            if (p.categoryIds.length > 0) {
              await syncImportProductCategories(existing.id, p.categoryIds, tx);
            }
            // Price history for import updates (Rule 7)
            const oldBase = Number(existing.basePrice);
            if (oldBase !== Number(r.basePrice)) {
              await logProductFieldChanges(existing.id, ctx.userId, 'import', [
                { field: 'basePrice', oldValue: oldBase, newValue: r.basePrice },
              ], tx);
            }
            if (r.bulkSlabs?.length) {
              await logProductFieldChanges(existing.id, ctx.userId, 'import', [
                {
                  field: 'priceSlabs',
                  oldValue: '(before import)',
                  newValue: summarizePriceSlabs(
                    r.bulkSlabs.map((s) => ({
                      minQty: s.minQty,
                      maxQty: null,
                      price: s.taxableRate,
                      promoPrice: s.promoTaxableRate,
                    })),
                  ),
                },
              ], tx);
            }
            updated++;
          } else {
            // ── CREATE new product ──
            const product = await tx.product.create({
              data: {
                vendorId,
                categoryId: p.categoryId,
                masterProductId: p.masterProductId,
                name: r.name,
                slug: uniqueSlug(r.name),
                sku: p.composedSku,
                vendorSku: p.vendorSku,
                hsn: r.hsn || null,
                unit: r.unit || null,
                brand: r.brand || null,
                basePrice: r.basePrice,
                taxPercent: r.taxPercent,
                promoPrice: r.promoPrice || null,
                promoStartTime: r.promoStartTime || null,
                promoEndTime: r.promoEndTime || null,
                imageUrl: r.imageUrl || null,
                approvalStatus: p.approvalStatus,
                metadata: mergeMetadata({}, r.metadata || {}),
                vegNonVeg: normalizedVegForDb(r.vegNonVeg) ?? null,
                storageType: r.storageType || null,
                minOrderQty: r.moq || 1,
                aliasNames: r.aliasName ? [r.aliasName] : [],
                barcode: r.upc || null,
                packSize: r.packSize || null,
                description: r.description || null,
                originalPrice: r.originalPrice ?? null,
                creditEligible: r.creditEligible ?? false,
                isActive: r.isActive ?? true,
                shelfLifeDays: r.shelfLifeDays != null ? Number(r.shelfLifeDays) : null,
                countryOfOrigin: r.countryOfOrigin || null,
                tags: r.tags ?? [],
              },
            });
            const vendor = await tx.vendor.findUnique({
              where: { id: vendorId },
              select: { businessAccountId: true },
            });
            if (vendor) {
              await ensureInventoryForAllOutlets(
                product.id,
                vendorId,
                vendor.businessAccountId,
                { initialQty: r.stock ?? 0 },
                tx,
              );
            }
            await tx.product.update({
              where: { id: product.id },
              data: {
                metadata: enrichImportMetadata(
                  product.metadata as Record<string, unknown>,
                  vendorCode,
                  product.id,
                ) as Prisma.InputJsonValue,
              },
            });

            if (p.categoryIds.length > 0) {
              await syncImportProductCategories(product.id, p.categoryIds, tx);
            }
            await updatePriceSlabs(product.id, vendorId, r, tx);
            // Register so a later duplicate row in the same file updates THIS product.
            registerCreated(product);
            created++;
          }
        }
      });
    } catch (txErr) {
      // Atomic rollback — nothing was committed.
      created = 0;
      updated = 0;
      responseErrors.push({
        row: 0,
        message: `Import rolled back: ${friendlyErrorMessage(txErr, 'unexpected error')}`,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        blocked: false,
        totalRows: rows.length,
        validRows: commitRowNumbers.length,
        created,
        updated,
        imported: created + updated,
        errors: responseErrors,
        errorReport,
        backupId,
        backup: productsToBackup,
      } satisfies CommitResponse & { backup: typeof productsToBackup },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// Replace a product's price slabs from an import row (vendor-scoped).
// Accepts a tx client so it participates in the atomic commit transaction.
async function updatePriceSlabs(
  productId: string,
  vendorId: string,
  row: ParsedProductRow,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  if (row.bulkSlabs.length === 0) return;
  await db.priceSlab.deleteMany({ where: { productId, vendorId } });
  await db.priceSlab.createMany({
    data: row.bulkSlabs.map((slab, idx) => ({
      productId,
      vendorId,
      minQty: slab.minQty,
      price: slab.taxableRate,
      promoPrice: slab.promoTaxableRate || null,
      sortOrder: idx,
    })),
  });
}
