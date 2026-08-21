/**
 * Customer-facing sellable product identity for marketplace surfaces
 * (PDP, cart, checkout, discovery). Brand mappings may enrich brand badge
 * and fill media/packaging gaps — they must never replace the vendor SKU name.
 */

export type BrandMasterLike = {
  name?: unknown;
  imageUrl?: unknown;
  images?: unknown;
  description?: unknown;
  packSize?: unknown;
  unit?: unknown;
  brand?: { name?: unknown; slug?: unknown } | null;
};

export function resolveSellableDisplayName(vendorProductName: string): string {
  return (vendorProductName || '').trim();
}

export function resolveSellableImages(
  supplierImages: string[],
  master?: BrandMasterLike | null,
): { images: string[]; usedBrandFallback: boolean } {
  if (supplierImages.length > 0) {
    return { images: supplierImages, usedBrandFallback: false };
  }
  const masterImageList = Array.isArray(master?.images)
    ? master.images.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : [];
  const masterImageUrl =
    typeof master?.imageUrl === 'string' && master.imageUrl.trim() ? master.imageUrl.trim() : '';
  const brandImages =
    masterImageList.length > 0 ? masterImageList : masterImageUrl ? [masterImageUrl] : [];
  return { images: brandImages, usedBrandFallback: brandImages.length > 0 };
}
