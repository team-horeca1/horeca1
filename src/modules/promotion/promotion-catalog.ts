/**
 * Catalog promotion bridge — attaches live vendor store offers to PUBLIC
 * catalog API responses (vendor listing, product detail, search, deals).
 *
 * Mirrors the pattern in catalog-pricing.ts: anonymous traffic passes through
 * unchanged except for promotion badges; failures never break browsing.
 */

import { prisma } from '@/lib/prisma';
import {
  type StorePromotionAttachment,
  type VendorStoreWidePromo,
  fetchLivePromotionsForVendors,
  buildProductPromotionMap,
  buildVendorWidePromoMap,
} from '@/modules/promotion/promotion.service';

interface PromotableProduct {
  id: string;
  vendorId?: string | null;
  vendor?: { id: string } | null;
  basePrice?: unknown;
}

export type { StorePromotionAttachment, VendorStoreWidePromo };

/**
 * Attach `storePromotion` to products that have a live BXGY buy-offer or
 * secondary "free with purchase" badge on the get-product.
 */
export async function attachActivePromotions<T extends PromotableProduct>(
  products: T[],
): Promise<Array<T & { storePromotion?: StorePromotionAttachment }>> {
  if (products.length === 0) return products;

  try {
    const vendorIds = Array.from(
      new Set(
        products
          .map((p) => p.vendorId ?? p.vendor?.id)
          .filter((id): id is string => !!id),
      ),
    );
    if (vendorIds.length === 0) return products;

    const promos = await fetchLivePromotionsForVendors(prisma, vendorIds);
    const byProduct = buildProductPromotionMap(promos);

    return products.map((p) => {
      const promo = byProduct.get(p.id);
      return promo ? { ...p, storePromotion: promo } : p;
    });
  } catch {
    return products;
  }
}

/** Live store-wide pct/flat promos for vendor header banners. */
export async function getVendorStoreWidePromos(
  vendorIdOrSlug: string,
): Promise<VendorStoreWidePromo[]> {
  try {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let vendorId = vendorIdOrSlug;
    if (!UUID_RE.test(vendorIdOrSlug)) {
      const v = await prisma.vendor.findFirst({
        where: { slug: vendorIdOrSlug },
        select: { id: true },
      });
      if (!v) return [];
      vendorId = v.id;
    }
    const promos = await fetchLivePromotionsForVendors(prisma, [vendorId]);
    const map = buildVendorWidePromoMap(promos);
    return map.get(vendorId) ?? [];
  } catch {
    return [];
  }
}
