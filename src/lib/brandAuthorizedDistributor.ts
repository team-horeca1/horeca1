import { prisma } from '@/lib/prisma';
import type { BrandAuthorizedDistributorStatus, Prisma } from '@prisma/client';

export function distributorAuthKey(brandId: string, vendorId: string): string {
  return `${brandId}:${vendorId}`;
}

export function recomputeAuthStatus(
  brandApprovedAt: Date | null | undefined,
  _adminApprovedAt: Date | null | undefined,
  rejectedAt: Date | null | undefined,
): BrandAuthorizedDistributorStatus {
  if (rejectedAt) return 'rejected';
  if (brandApprovedAt) return 'approved';
  return 'pending';
}

/** Prisma filter: brand-approved distributors (handles legacy rows stuck in pending). */
export function approvedDistributorWhere(filter?: {
  brandId?: string;
  vendorId?: string;
}): Prisma.BrandAuthorizedDistributorWhereInput {
  return {
    rejectedAt: null,
    ...(filter?.brandId && { brandId: filter.brandId }),
    ...(filter?.vendorId && { vendorId: filter.vendorId }),
    OR: [
      { status: 'approved' },
      { status: 'pending', brandApprovedAt: { not: null } },
    ],
  };
}

/** Repair rows that have brandApprovedAt but stale status=pending. */
async function syncStaleApprovedRows(filter?: { brandId?: string; vendorId?: string }): Promise<void> {
  await prisma.brandAuthorizedDistributor.updateMany({
    where: {
      status: 'pending',
      brandApprovedAt: { not: null },
      rejectedAt: null,
      ...(filter?.brandId && { brandId: filter.brandId }),
      ...(filter?.vendorId && { vendorId: filter.vendorId }),
    },
    data: { status: 'approved' },
  });
}

/** Set of `brandId:vendorId` keys with fully approved distributor status. */
export async function getApprovedDistributorKeys(
  filter?: { brandId?: string; vendorId?: string },
): Promise<Set<string>> {
  await syncStaleApprovedRows(filter);

  const rows = await prisma.brandAuthorizedDistributor.findMany({
    where: approvedDistributorWhere(filter),
    select: { brandId: true, vendorId: true },
  });
  return new Set(rows.map((r) => distributorAuthKey(r.brandId, r.vendorId)));
}
export async function ensurePendingDistributorAuth(brandId: string, vendorId: string): Promise<void> {
  const existing = await prisma.brandAuthorizedDistributor.findUnique({
    where: { brandId_vendorId: { brandId, vendorId } },
  });

  if (!existing) {
    await prisma.brandAuthorizedDistributor.create({
      data: { brandId, vendorId, status: 'pending' },
    });
    return;
  }

  // Reopen if brand had unlinked but vendor still maps / remaps. Leave approved/pending alone.
  if (existing.status === 'rejected') {
    await prisma.brandAuthorizedDistributor.update({
      where: { brandId_vendorId: { brandId, vendorId } },
      data: {
        status: 'pending',
        rejectedAt: null,
        rejectedBy: null,
        brandApprovedAt: null,
        brandApprovedBy: null,
      },
    });
  }
}

const LIVE_MAPPING_STATUSES = ['verified', 'auto_mapped', 'pending_review'] as const;

/** Reopen rejected distributor auth when the vendor still has live product mappings. */
export async function healRejectedDistributorsWithLiveMappings(filter: {
  brandId?: string;
  vendorId?: string;
}): Promise<number> {
  const rejected = await prisma.brandAuthorizedDistributor.findMany({
    where: {
      status: 'rejected',
      ...(filter.brandId && { brandId: filter.brandId }),
      ...(filter.vendorId && { vendorId: filter.vendorId }),
    },
    select: { id: true, brandId: true, vendorId: true },
  });
  if (rejected.length === 0) return 0;

  const toHeal: string[] = [];
  for (const row of rejected) {
    const live = await prisma.brandProductMapping.count({
      where: {
        brandId: row.brandId,
        status: { in: [...LIVE_MAPPING_STATUSES] },
        distributorProduct: { vendorId: row.vendorId },
      },
    });
    if (live > 0) toHeal.push(row.id);
  }
  if (toHeal.length === 0) return 0;

  const result = await prisma.brandAuthorizedDistributor.updateMany({
    where: { id: { in: toHeal } },
    data: {
      status: 'pending',
      rejectedAt: null,
      rejectedBy: null,
      brandApprovedAt: null,
      brandApprovedBy: null,
    },
  });
  return result.count;
}

export async function approveDistributorByBrand(
  brandId: string,
  vendorId: string,
  userId: string,
  note?: string,
) {
  const now = new Date();

  return prisma.brandAuthorizedDistributor.upsert({
    where: { brandId_vendorId: { brandId, vendorId } },
    create: {
      brandId,
      vendorId,
      status: 'approved',
      brandApprovedAt: now,
      brandApprovedBy: userId,
      note: note ?? null,
    },
    update: {
      status: 'approved',
      brandApprovedAt: now,
      brandApprovedBy: userId,
      rejectedAt: null,
      rejectedBy: null,
      ...(note !== undefined && { note }),
    },
    include: {
      vendor: { select: { id: true, businessName: true, slug: true, logoUrl: true } },
    },
  });
}

/** Demote an approved distributor back to pending (Requests). Does not create a row. */
export async function unapproveDistributorByBrand(
  brandId: string,
  vendorId: string,
  _userId: string,
  note?: string,
) {
  const existing = await prisma.brandAuthorizedDistributor.findUnique({
    where: { brandId_vendorId: { brandId, vendorId } },
  });
  if (!existing) return null;

  return prisma.brandAuthorizedDistributor.update({
    where: { brandId_vendorId: { brandId, vendorId } },
    data: {
      status: 'pending',
      brandApprovedAt: null,
      brandApprovedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      ...(note !== undefined && { note }),
    },
    include: {
      vendor: { select: { id: true, businessName: true, slug: true, logoUrl: true } },
    },
  });
}

export async function approveDistributorByAdmin(
  brandId: string,
  vendorId: string,
  userId: string,
  note?: string,
) {
  const existing = await prisma.brandAuthorizedDistributor.findUnique({
    where: { brandId_vendorId: { brandId, vendorId } },
  });
  const now = new Date();
  const brandApprovedAt = existing?.brandApprovedAt ?? now;
  const status = recomputeAuthStatus(brandApprovedAt, now, null);

  return prisma.brandAuthorizedDistributor.upsert({
    where: { brandId_vendorId: { brandId, vendorId } },
    create: {
      brandId,
      vendorId,
      status,
      brandApprovedAt: now,
      adminApprovedAt: now,
      adminApprovedBy: userId,
      note: note ?? null,
    },
    update: {
      status,
      adminApprovedAt: now,
      adminApprovedBy: userId,
      brandApprovedAt: existing?.brandApprovedAt ?? now,
      rejectedAt: null,
      rejectedBy: null,
      ...(note !== undefined && { note }),
    },
    include: {
      vendor: { select: { id: true, businessName: true, slug: true, logoUrl: true } },
    },
  });
}

export async function rejectDistributorAuth(
  brandId: string,
  vendorId: string,
  userId: string,
  note?: string,
) {
  const now = new Date();
  const row = await prisma.brandAuthorizedDistributor.upsert({
    where: { brandId_vendorId: { brandId, vendorId } },
    create: {
      brandId,
      vendorId,
      status: 'rejected',
      rejectedAt: now,
      rejectedBy: userId,
      note: note ?? null,
    },
    update: {
      status: 'rejected',
      rejectedAt: now,
      rejectedBy: userId,
      ...(note !== undefined && { note }),
    },
    include: {
      vendor: { select: { id: true, businessName: true, slug: true, logoUrl: true } },
    },
  });

  // Soft-reject live product mappings so Unlink fully disconnects (no heal loop).
  await prisma.brandProductMapping.updateMany({
    where: {
      brandId,
      status: { in: [...LIVE_MAPPING_STATUSES] },
      distributorProduct: { vendorId },
    },
    data: {
      status: 'rejected',
      reviewNote: note ?? 'Unlinked by brand',
      reviewedBy: userId,
      updatedAt: now,
    },
  });

  return row;
}

/**
 * Prisma include fragment for customer-facing brand overrides on Product.
 * Loads the active verified/auto_mapped mapping plus the master fields the DAL
 * needs to override name, images, category, description, packSize/unit,
 * logistics, and packaging.
 */
export const productBrandMappingsInclude = {
  where: { status: { in: ['verified' as const, 'auto_mapped' as const] } },
  select: {
    id: true,
    status: true,
    brandId: true,
    brandMasterProductId: true,
    brandMasterProduct: {
      select: {
        id: true,
        name: true,
        imageUrl: true,
        images: true,
        description: true,
        packSize: true,
        unit: true,
        sku: true,
        hsn: true,
        barcode: true,
        fssaiRef: true,
        vegNonVeg: true,
        storageType: true,
        shelfLifeDays: true,
        countryOfOrigin: true,
        tags: true,
        aliasNames: true,
        netWeight: true,
        netWeightUnit: true,
        packageWeight: true,
        weightUnit: true,
        packageLength: true,
        packageWidth: true,
        packageHeight: true,
        dimensionUnit: true,
        categoryId: true,
        categoryIds: true,
        categoryRel: { select: { id: true, name: true, slug: true } },
        brand: { select: { name: true, slug: true } },
      },
    },
  },
  orderBy: { confidenceScore: 'desc' as const },
  take: 1,
};

/** Strip brandMappings whose vendor is not an approved distributor for that brand. */
export async function filterProductBrandMappings<
  T extends {
    vendorId?: string;
    vendor?: { id: string } | null;
    brandMappings?: Array<{ brandId?: string }>;
  },
>(products: T[]): Promise<T[]> {
  const brandIds = new Set<string>();
  const vendorIds = new Set<string>();
  for (const p of products) {
    const vendorId = p.vendor?.id ?? p.vendorId;
    if (!vendorId) continue;
    vendorIds.add(vendorId);
    for (const m of p.brandMappings ?? []) {
      if (m.brandId) brandIds.add(m.brandId);
    }
  }
  if (brandIds.size === 0 || vendorIds.size === 0) return products;

  const approved = await getApprovedDistributorKeys();
  return products.map((p) => {
    const vendorId = p.vendor?.id ?? p.vendorId;
    if (!vendorId || !p.brandMappings?.length) return p;
    const filtered = filterAuthorizedMappings(p.brandMappings, vendorId, approved);
    if (filtered.length === p.brandMappings.length) return p;
    return { ...p, brandMappings: filtered };
  });
}

/** Filter brand mappings to those whose vendor is an approved distributor for the brand. */
export function filterAuthorizedMappings<T extends { brandId?: string; brand?: { id: string } }>(
  mappings: T[] | undefined,
  vendorId: string,
  approvedKeys: Set<string>,
): T[] {
  if (!mappings?.length) return [];
  return mappings.filter((m) => {
    const brandId = m.brandId ?? m.brand?.id;
    if (!brandId) return false;
    return approvedKeys.has(distributorAuthKey(brandId, vendorId));
  });
}
