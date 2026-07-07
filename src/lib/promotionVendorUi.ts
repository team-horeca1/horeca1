/** Parse vendor promotion date inputs as IST day boundaries. */
export function promotionStartIso(date: string): string {
  return new Date(`${date}T00:00:00.000+05:30`).toISOString();
}

export function promotionEndIso(date: string): string {
  return new Date(`${date}T23:59:59.999+05:30`).toISOString();
}

export type PromoType = 'pct_discount' | 'flat_discount' | 'bxgy';

export function promotionIsLive(p: {
  isActive: boolean;
  startDate: string | Date | null;
  endDate: string | Date | null;
  usageLimit?: number | null;
  usageCount?: number;
}): boolean {
  if (!p.isActive) return false;
  const now = Date.now();
  if (p.startDate && new Date(p.startDate).getTime() > now) return false;
  if (p.endDate && new Date(p.endDate).getTime() < now) return false;
  if (p.usageLimit != null && (p.usageCount ?? 0) >= p.usageLimit) return false;
  return true;
}

export function promotionStorefrontLabel(type: PromoType, live: boolean): string {
  if (!live) return 'Not live';
  if (type === 'bxgy') return 'Product card + Deals tab';
  return 'Checkout + store banner';
}

export function buildPromotionPayload(input: {
  name: string;
  type: PromoType;
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
  minOrderValue?: string;
  discountPct?: string;
  discountFlat?: string;
  minQty?: string;
  getQty?: string;
  buyProductId?: string | null;
  getProductId?: string | null;
  usageLimit?: string;
}) {
  return {
    name: input.name.trim(),
    type: input.type,
    isActive: input.isActive ?? true,
    startDate: input.startDate ? promotionStartIso(input.startDate) : null,
    endDate: input.endDate ? promotionEndIso(input.endDate) : null,
    minOrderValue: input.minOrderValue ? parseFloat(input.minOrderValue) : null,
    discountPct: input.type === 'pct_discount' && input.discountPct ? parseFloat(input.discountPct) : null,
    discountFlat: input.type === 'flat_discount' && input.discountFlat ? parseFloat(input.discountFlat) : null,
    minQty: input.type === 'bxgy' ? (parseInt(input.minQty || '1', 10) || 1) : null,
    getQty: input.type === 'bxgy' ? (parseInt(input.getQty || '1', 10) || 1) : null,
    buyProductId: input.type === 'bxgy' ? (input.buyProductId || null) : null,
    getProductId: input.type === 'bxgy' ? (input.getProductId || null) : null,
    usageLimit: input.usageLimit ? parseInt(input.usageLimit, 10) : null,
  };
}

export function promotionPublishSuccessMessage(type: PromoType): string {
  if (type === 'bxgy') {
    return 'Scheme published! It will appear on the product card and Deals tab.';
  }
  return 'Scheme published! Customers will see it at checkout and in your store banner.';
}
