import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export interface ResolvedBulkFilter {
  productIds?: string[];
  categoryId?: string;
  brand?: string;
  isActive?: boolean;
}

/** Expands SKU list filter into productIds, optionally intersecting with existing ids. */
export async function resolveBulkProductFilter(
  filter: {
    productIds?: string[];
    skus?: string[];
    categoryId?: string;
    brand?: string;
    isActive?: boolean;
  },
  scope?: { vendorId?: string },
): Promise<ResolvedBulkFilter> {
  let productIds = filter.productIds;

  if (filter.skus?.length) {
    const rows = await prisma.product.findMany({
      where: {
        ...(scope?.vendorId ? { vendorId: scope.vendorId } : {}),
        OR: [
          { sku: { in: filter.skus } },
          { vendorSku: { in: filter.skus } },
        ],
      },
      select: { id: true },
    });
    const skuIds = rows.map((r) => r.id);
    productIds = productIds ? productIds.filter((id) => skuIds.includes(id)) : skuIds;
  }

  return {
    productIds,
    categoryId: filter.categoryId,
    brand: filter.brand,
    isActive: filter.isActive,
  };
}

/** Merge seasonal-off window into product metadata; deactivate when today is in range. */
export function buildSeasonalMetadataPatch(
  existing: unknown,
  from?: string,
  to?: string,
): { metadata: Prisma.InputJsonValue; isActive?: boolean } {
  const meta = (existing && typeof existing === 'object' ? { ...(existing as Record<string, unknown>) } : {}) as Record<string, unknown>;
  if (from) meta.seasonalOffFrom = from;
  if (to) meta.seasonalOffTo = to;
  const today = new Date().toISOString().slice(0, 10);
  const inWindow = Boolean(from && to && today >= from && today <= to);
  return { metadata: meta as Prisma.InputJsonValue, ...(inWindow ? { isActive: false } : {}) };
}
