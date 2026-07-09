// Promo Engine Phase 1 — Coupons + Cashback (the two priority promos).
//
// All money logic lives here; routes stay thin. Stacking rules implemented:
//   Rule 1  ONE coupon per checkout (hard-coded — single couponCode input).
//   Rule 2  Coupon + Cashback        — per-campaign `stacksWithCoupon` +
//                                      per-coupon `stacksWithCashback`.
//   Rule 3  Coupon + Vendor discount — per-coupon `stacksWithVendorPromo`;
//                                      when false the auto vendor promo is
//                                      suppressed for that checkout.
//   Rule 5  ONE cashback source       — highest eligible campaign wins.
//   Rule 6  Wallet usable alongside promotions (prepaid Wallet redemption).
//
// Calculation sequence (per the brief): price → vendor discount → coupon →
// wallet redemption → final payable → cashback computed on what the customer
// actually pays for goods (subtotal − vendor promo − coupon; wallet is a
// payment instrument, not a discount, so it does NOT reduce the cashback base).

import { prisma } from '@/lib/prisma';
import type { Prisma, Coupon, CashbackEntry } from '@prisma/client';
import { Errors } from '@/middleware/errorHandler';
import {
  resolveUnitPrice,
  computeSchemeBilledQty,
  type CustomerContext,
} from '@/modules/pricing/pricing.service';
import { getDeliveryGeo } from '@/lib/deliveryLocation';

type Db = Prisma.TransactionClient;

const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Types shared with order.service ─────────────────────────────────────

export interface CheckoutDraftItem {
  productId: string;
  categoryId: string | null;
  brand: string | null;
  lineTotal: number; // gross (GST-inclusive) line total
}

export interface CheckoutOrderDraft {
  vendorId: string;
  subtotal: number; // gross order subtotal
  promoDiscount: number; // auto vendor promo (before suppression)
  items: CheckoutDraftItem[];
}

/** A single cart line as sent by the checkout for promo/coupon preview. */
export interface PreviewItemInput {
  productId: string;
  vendorId: string;
  quantity: number;
}

/** The chosen auto vendor promotion for one vendor order. */
export interface VendorPromoResult {
  promotionId: string;
  name: string;
  type: string;
  discount: number;
}

/** Attached to catalog products for storefront badges. */
export interface StorePromotionAttachment {
  id: string;
  name: string;
  type: 'bxgy' | 'pct_discount' | 'flat_discount' | 'bxgy_get';
  badgeLabel: string;
  buyQty?: number;
  getQty?: number;
  getProductId?: string;
  getProductName?: string;
  buyProductId?: string;
  minOrderValue?: number;
}

/** Store-wide pct/flat offer shown in vendor header banner. */
export interface VendorStoreWidePromo {
  id: string;
  name: string;
  type: 'pct_discount' | 'flat_discount';
  badgeLabel: string;
  minOrderValue?: number;
  discountPct?: number;
  discountFlat?: number;
}

export interface BxgyCartResult {
  promotionId: string;
  promotionName: string;
  buyProductId: string;
  getProductId: string;
  freeUnits: number;
  sameProduct: boolean;
  minQty: number;
  getQty: number;
}

type LivePromotionRow = Awaited<ReturnType<typeof fetchLivePromotionsForVendors>>[number];

export interface CouponApplication {
  coupon: Pick<
    Coupon,
    'id' | 'code' | 'name' | 'stacksWithVendorPromo' | 'stacksWithCashback'
  >;
  /** When true, the caller must drop the auto vendor promos for this checkout. */
  suppressVendorPromos: boolean;
  /** Discount allocated per draft, aligned with the drafts array. */
  perOrder: number[];
  totalDiscount: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────

function itemMatchesScope(coupon: Coupon, item: CheckoutDraftItem): boolean {
  const hasScope =
    coupon.productIds.length > 0 || coupon.categoryIds.length > 0 || coupon.brandNames.length > 0;
  if (!hasScope) return true;
  if (coupon.productIds.includes(item.productId)) return true;
  if (item.categoryId && coupon.categoryIds.includes(item.categoryId)) return true;
  if (item.brand) {
    const b = item.brand.toLowerCase();
    if (coupon.brandNames.some((n) => n.toLowerCase() === b)) return true;
  }
  return false;
}

/** Proportional split of `total` over `weights`, rounded to paise, exact sum. */
function allocateProportional(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0 || total <= 0) return weights.map(() => 0);
  const shares: number[] = [];
  let allocated = 0;
  let lastIdx = -1;
  for (let i = 0; i < weights.length; i++) if (weights[i] > 0) lastIdx = i;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) {
      shares.push(0);
      continue;
    }
    if (i === lastIdx) {
      shares.push(r2(total - allocated));
    } else {
      const s = r2((total * weights[i]) / weightSum);
      shares.push(s);
      allocated = r2(allocated + s);
    }
  }
  return shares;
}

/**
 * Pick the best active vendor `Promotion` (pct_discount or flat_discount) for a
 * vendor order's subtotal. Pure read — never increments usage. Shared by
 * `order.service` (pass 1), the checkout preview, and coupon preview so all
 * three compute the auto vendor promo identically (first qualifying promo wins,
 * highest pct first — same semantics as the original inline order.service loop).
 */
export async function evaluateVendorPromo(
  db: Db,
  vendorId: string,
  subtotal: number,
): Promise<VendorPromoResult | null> {
  const now = new Date();
  const activePromos = await db.promotion.findMany({
    where: {
      vendorId,
      isActive: true,
      type: { in: ['pct_discount', 'flat_discount'] },
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: now } }] },
        { OR: [{ endDate: null }, { endDate: { gte: now } }] },
      ],
    },
    orderBy: { discountPct: 'desc' },
  });
  for (const promo of activePromos) {
    const minVal = promo.minOrderValue ? Number(promo.minOrderValue) : 0;
    if (subtotal < minVal) continue;
    if (promo.usageLimit !== null && promo.usageCount >= promo.usageLimit) continue;
    let discount = 0;
    if (promo.type === 'pct_discount' && promo.discountPct) {
      discount = r2((subtotal * Number(promo.discountPct)) / 100);
    } else if (promo.type === 'flat_discount' && promo.discountFlat) {
      discount = Math.min(Number(promo.discountFlat), subtotal);
    }
    // First promo that clears min-order + usage wins (mirrors order.service).
    return { promotionId: promo.id, name: promo.name, type: promo.type, discount: r2(discount) };
  }
  return null;
}

/** Shared live-window filter for storefront + checkout promotion reads. */
export function livePromotionWhere(now: Date = new Date()) {
  return {
    isActive: true,
    AND: [
      { OR: [{ startDate: null }, { startDate: { lte: now } }] },
      { OR: [{ endDate: null }, { endDate: { gte: now } }] },
    ],
  };
}

function promotionWithinUsage(p: { usageLimit: number | null; usageCount: number }) {
  return p.usageLimit === null || p.usageCount < p.usageLimit;
}

function bxgyBadgeLabel(minQty: number, getQty: number, sameProduct: boolean) {
  if (sameProduct && minQty === 1 && getQty === 1) return 'Buy 1 Get 1 Free';
  if (sameProduct) return `Buy ${minQty} Get ${getQty} Free`;
  return `Buy ${minQty} Get ${getQty} Free`;
}

/** Batch-fetch live promotions for one or more vendors (catalog + cart). */
export async function fetchLivePromotionsForVendors(db: Db, vendorIds: string[]) {
  if (vendorIds.length === 0) return [];
  const now = new Date();
  const rows = await db.promotion.findMany({
    where: {
      vendorId: { in: vendorIds },
      ...livePromotionWhere(now),
    },
    include: {
      buyProduct: { select: { id: true, name: true } },
      getProduct: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.filter(promotionWithinUsage);
}

/** Map productId → primary storefront badge (BXGY buy product wins). */
export function buildProductPromotionMap(
  promos: LivePromotionRow[],
): Map<string, StorePromotionAttachment> {
  const map = new Map<string, StorePromotionAttachment>();
  for (const p of promos) {
    if (p.type === 'bxgy' && p.buyProductId) {
      const minQty = p.minQty ?? 1;
      const getQty = p.getQty ?? 1;
      const sameProduct = p.buyProductId === p.getProductId;
      const attachment: StorePromotionAttachment = {
        id: p.id,
        name: p.name,
        type: 'bxgy',
        badgeLabel: bxgyBadgeLabel(minQty, getQty, sameProduct),
        buyQty: minQty,
        getQty,
        buyProductId: p.buyProductId,
        getProductId: p.getProductId ?? undefined,
        getProductName: p.getProduct?.name ?? undefined,
        minOrderValue: p.minOrderValue != null ? Number(p.minOrderValue) : undefined,
      };
      if (!map.has(p.buyProductId)) map.set(p.buyProductId, attachment);

      if (p.getProductId && !sameProduct && !map.has(p.getProductId)) {
        map.set(p.getProductId, {
          id: p.id,
          name: p.name,
          type: 'bxgy_get',
          badgeLabel: 'Free with purchase',
          buyProductId: p.buyProductId,
          getProductId: p.getProductId,
          getProductName: p.getProduct?.name ?? undefined,
          buyQty: minQty,
          getQty,
        });
      }
    }
  }
  return map;
}

/** Map vendorId → store-wide pct/flat promos for header banners. */
export function buildVendorWidePromoMap(
  promos: LivePromotionRow[],
): Map<string, VendorStoreWidePromo[]> {
  const map = new Map<string, VendorStoreWidePromo[]>();
  for (const p of promos) {
    if (p.type !== 'pct_discount' && p.type !== 'flat_discount') continue;
    const minVal = p.minOrderValue != null ? Number(p.minOrderValue) : undefined;
    let badgeLabel = '';
    if (p.type === 'pct_discount' && p.discountPct) {
      badgeLabel = minVal
        ? `${Number(p.discountPct).toFixed(0)}% off orders above ₹${minVal.toFixed(0)}`
        : `${Number(p.discountPct).toFixed(0)}% off`;
    } else if (p.type === 'flat_discount' && p.discountFlat) {
      badgeLabel = minVal
        ? `₹${Number(p.discountFlat).toFixed(0)} off orders above ₹${minVal.toFixed(0)}`
        : `₹${Number(p.discountFlat).toFixed(0)} off`;
    } else {
      continue;
    }
    const entry: VendorStoreWidePromo = {
      id: p.id,
      name: p.name,
      type: p.type,
      badgeLabel,
      minOrderValue: minVal,
      discountPct: p.discountPct != null ? Number(p.discountPct) : undefined,
      discountFlat: p.discountFlat != null ? Number(p.discountFlat) : undefined,
    };
    const list = map.get(p.vendorId) ?? [];
    list.push(entry);
    map.set(p.vendorId, list);
  }
  return map;
}

/** Returns an existing live BXGY on the same buy product, if any. */
export async function findConflictingBxgyPromotion(
  db: Db,
  vendorId: string,
  buyProductId: string,
  excludePromotionId?: string,
) {
  const promos = await fetchLivePromotionsForVendors(db, [vendorId]);
  return promos.find(
    (p) =>
      p.type === 'bxgy' &&
      p.buyProductId === buyProductId &&
      p.id !== excludePromotionId,
  ) ?? null;
}

/** Merge BXGY free-item rows for display (cart/checkout bill). */
export function mergeBxgyFreeItems(
  items: Array<{
    vendorId: string;
    productId: string;
    productName: string;
    quantity: number;
    promotionName: string;
  }>,
): Array<{
  vendorId: string;
  productId: string;
  productName: string;
  quantity: number;
  promotionName: string;
}> {
  const map = new Map<string, {
    vendorId: string;
    productId: string;
    productName: string;
    quantity: number;
    promotionName: string;
  }>();
  for (const item of items) {
    const key = `${item.vendorId}:${item.productId}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}

/** Compute BXGY free goods for a vendor cart snapshot. */
export async function evaluateBxgyForCart(
  db: Db,
  vendorId: string,
  items: Array<{ productId: string; quantity: number; unitPrice: number }>,
): Promise<BxgyCartResult[]> {
  const promos = (await fetchLivePromotionsForVendors(db, [vendorId])).filter((p) => p.type === 'bxgy');
  const paidQtyByProduct = new Map<string, number>();
  for (const item of items) {
    if (Number(item.unitPrice) <= 0) continue;
    paidQtyByProduct.set(
      item.productId,
      (paidQtyByProduct.get(item.productId) ?? 0) + item.quantity,
    );
  }

  const candidates: BxgyCartResult[] = [];
  for (const p of promos) {
    if (!p.buyProductId || !p.getProductId) continue;
    const minQty = p.minQty ?? 1;
    const getQty = p.getQty ?? 1;
    const buyQty = paidQtyByProduct.get(p.buyProductId) ?? 0;
    if (buyQty < minQty) continue;
    const freeSets = Math.floor(buyQty / minQty);
    const freeUnits = freeSets * getQty;
    if (freeUnits <= 0) continue;
    candidates.push({
      promotionId: p.id,
      promotionName: p.name,
      buyProductId: p.buyProductId,
      getProductId: p.getProductId,
      freeUnits,
      sameProduct: p.buyProductId === p.getProductId,
      minQty,
      getQty,
    });
  }

  // One promo per buy/get pair — highest freeUnits wins (newest promo on tie).
  const bestByPair = new Map<string, BxgyCartResult>();
  const promoCreatedAt = new Map(promos.map((p) => [p.id, p.createdAt.getTime()]));
  for (const c of candidates) {
    const key = `${c.buyProductId}:${c.getProductId}`;
    const prev = bestByPair.get(key);
    if (!prev) {
      bestByPair.set(key, c);
      continue;
    }
    if (c.freeUnits > prev.freeUnits) {
      bestByPair.set(key, c);
      continue;
    }
    if (c.freeUnits === prev.freeUnits) {
      const cTime = promoCreatedAt.get(c.promotionId) ?? 0;
      const pTime = promoCreatedAt.get(prev.promotionId) ?? 0;
      if (cTime > pTime) bestByPair.set(key, c);
    }
  }
  return Array.from(bestByPair.values());
}

/** Billed quantity when BXGY applies to the same product line. */
export function computeBxgyBilledQty(
  quantity: number,
  minQty: number,
  getQty: number,
): number {
  const freeUnits = Math.floor(quantity / minQty) * getQty;
  return Math.max(0, quantity - freeUnits);
}

/** Free units earned from a paid quantity (BXGY). */
export function computeBxgyFreeUnits(
  paidQty: number,
  minQty: number,
  getQty: number,
): number {
  return Math.floor(paidQty / minQty) * getQty;
}

async function loadAndValidateCoupon(
  db: Db,
  args: { code: string; userId: string; drafts: CheckoutOrderDraft[] },
): Promise<CouponApplication> {
  const code = args.code.trim().toUpperCase();
  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.isActive) throw Errors.badRequest('Invalid coupon code');

  const now = new Date();
  if (coupon.startDate && coupon.startDate > now) {
    throw Errors.badRequest('This coupon is not active yet');
  }
  if (coupon.endDate && coupon.endDate < now) {
    throw Errors.badRequest('This coupon has expired');
  }
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw Errors.badRequest('This coupon has reached its usage limit');
  }
  if (coupon.perUserLimit !== null) {
    // One multi-vendor checkout = one use → count distinct active checkout groups.
    const groups = await db.couponRedemption.findMany({
      where: { couponId: coupon.id, userId: args.userId, status: 'active' },
      distinct: ['checkoutGroupId'],
      select: { checkoutGroupId: true },
    });
    if (groups.length >= coupon.perUserLimit) {
      throw Errors.badRequest('You have already used this coupon the maximum number of times');
    }
  }

  // MOV — platform coupon checks the combined checkout; vendor coupon checks
  // only that vendor's orders (their MOV shouldn't be satisfiable with another
  // vendor's items).
  const relevantDrafts = coupon.vendorId
    ? args.drafts.filter((d) => d.vendorId === coupon.vendorId)
    : args.drafts;
  const relevantSubtotal = r2(relevantDrafts.reduce((a, d) => a + d.subtotal, 0));
  if (relevantSubtotal <= 0) {
    throw Errors.badRequest('This coupon does not apply to items in your cart');
  }
  if (coupon.minOrderValue && relevantSubtotal < Number(coupon.minOrderValue)) {
    throw Errors.badRequest(
      `Add items worth ₹${Number(coupon.minOrderValue).toLocaleString('en-IN')} or more to use this coupon`,
    );
  }

  // Eligible amount per draft (vendor + category/product/brand scope).
  const eligible = args.drafts.map((d) => {
    if (coupon.vendorId && d.vendorId !== coupon.vendorId) return 0;
    return r2(d.items.filter((i) => itemMatchesScope(coupon, i)).reduce((a, i) => a + i.lineTotal, 0));
  });
  const totalEligible = r2(eligible.reduce((a, b) => a + b, 0));
  if (totalEligible <= 0) {
    throw Errors.badRequest('This coupon does not apply to items in your cart');
  }

  let discount: number;
  if (coupon.discountType === 'flat') {
    discount = Math.min(Number(coupon.discountValue), totalEligible);
  } else {
    discount = r2((totalEligible * Number(coupon.discountValue)) / 100);
    if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
  }
  discount = r2(Math.max(0, discount));

  // Rule 3 — when the coupon can't be clubbed with vendor promos the caller
  // drops them, so the cap below must use the post-suppression promo value.
  const suppressVendorPromos = !coupon.stacksWithVendorPromo;
  const effPromo = args.drafts.map((d) => (suppressVendorPromos ? 0 : d.promoDiscount));

  // Allocate proportionally over eligible amounts, capped so no order total
  // can go negative.
  let perOrder = allocateProportional(discount, eligible);
  perOrder = perOrder.map((share, i) =>
    r2(Math.min(share, Math.max(0, args.drafts[i].subtotal - effPromo[i]))),
  );
  const totalDiscount = r2(perOrder.reduce((a, b) => a + b, 0));
  if (totalDiscount <= 0) {
    throw Errors.badRequest('This coupon does not apply to items in your cart');
  }

  return {
    coupon: {
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      stacksWithVendorPromo: coupon.stacksWithVendorPromo,
      stacksWithCashback: coupon.stacksWithCashback,
    },
    suppressVendorPromos,
    perOrder,
    totalDiscount,
  };
}

async function notifyInApp(
  db: Db,
  userId: string,
  title: string,
  body: string,
  referenceId?: string,
  referenceType?: string,
): Promise<void> {
  await db.notification.create({
    data: { userId, type: 'promo', channel: 'in_app', status: 'sent', title, body, referenceId, referenceType },
  });
}

// ─── Service ──────────────────────────────────────────────────────────────

export const promotionService = {
  // ── Coupons: checkout lifecycle ────────────────────────────────────────

  /** Validate + price a coupon against the prepared checkout. No writes. */
  applyCouponToCheckout(
    tx: Db,
    args: { code: string; userId: string; drafts: CheckoutOrderDraft[] },
  ): Promise<CouponApplication> {
    return loadAndValidateCoupon(tx, args);
  },

  /** Persist redemption rows + count ONE use for the whole checkout. */
  async finalizeCouponRedemptions(
    tx: Db,
    args: {
      couponId: string;
      userId: string;
      checkoutGroupId: string;
      rows: Array<{ orderId: string; amount: number }>;
    },
  ): Promise<void> {
    const rows = args.rows.filter((row) => row.amount > 0);
    if (rows.length === 0) return;
    await tx.couponRedemption.createMany({
      data: rows.map((row) => ({
        couponId: args.couponId,
        userId: args.userId,
        orderId: row.orderId,
        checkoutGroupId: args.checkoutGroupId,
        amount: row.amount,
      })),
    });
    await tx.coupon.update({
      where: { id: args.couponId },
      data: { usedCount: { increment: 1 } },
    });
  },

  /**
   * On order cancel: reverse this order's redemption. The checkout-level "use"
   * is only refunded once every order in the group is reversed.
   */
  async reverseCouponForOrder(tx: Db, orderId: string): Promise<void> {
    const redemption = await tx.couponRedemption.findUnique({ where: { orderId } });
    if (!redemption || redemption.status !== 'active') return;
    await tx.couponRedemption.update({
      where: { id: redemption.id },
      data: { status: 'reversed' },
    });
    const remaining = await tx.couponRedemption.count({
      where: { checkoutGroupId: redemption.checkoutGroupId, status: 'active' },
    });
    if (remaining === 0) {
      await tx.coupon.updateMany({
        where: { id: redemption.couponId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
    }
  },

  // ── Cashback: checkout + delivery lifecycle ────────────────────────────

  /**
   * Rule 5 — evaluate all eligible campaigns (platform + this order's vendor)
   * and create ONE pending entry for the single highest payout. Campaign terms
   * are snapshotted on the entry so settlement at delivery survives campaign
   * edits and admin order modifications.
   */
  async evaluateCashbackForOrder(
    tx: Db,
    args: {
      userId: string;
      orderId: string;
      vendorId: string;
      /** subtotal − vendor promo − coupon (what the customer pays for goods). */
      base: number;
      couponAppliedOnOrder: boolean;
      /** Per-coupon stacksWithCashback=false blocks all cashback on the checkout. */
      couponBlocksCashback: boolean;
    },
  ): Promise<{ id: string; amount: number } | null> {
    if (args.base <= 0) return null;
    if (args.couponAppliedOnOrder && args.couponBlocksCashback) return null;

    const now = new Date();
    const campaigns = await tx.cashbackCampaign.findMany({
      where: {
        isActive: true,
        OR: [{ vendorId: null }, { vendorId: args.vendorId }],
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
        ],
      },
    });

    let best: { campaign: (typeof campaigns)[number]; amount: number } | null = null;
    for (const c of campaigns) {
      if (args.couponAppliedOnOrder && !c.stacksWithCoupon) continue;
      if (c.minOrderValue && args.base < Number(c.minOrderValue)) continue;

      let amount =
        c.cashbackType === 'flat'
          ? Math.min(Number(c.cashbackValue), args.base)
          : r2((args.base * Number(c.cashbackValue)) / 100);
      if (c.cashbackType === 'percentage' && c.maxCashback) {
        amount = Math.min(amount, Number(c.maxCashback));
      }
      amount = r2(amount);
      if (amount <= 0) continue;

      if (c.totalBudget && Number(c.usedAmount) + amount > Number(c.totalBudget)) continue;
      if (c.perUserLimit !== null) {
        const earned = await tx.cashbackEntry.count({
          where: { campaignId: c.id, userId: args.userId, status: { not: 'cancelled' } },
        });
        if (earned >= c.perUserLimit) continue;
      }

      if (!best || amount > best.amount) best = { campaign: c, amount };
    }
    if (!best) return null;

    const entry = await tx.cashbackEntry.create({
      data: {
        campaignId: best.campaign.id,
        userId: args.userId,
        orderId: args.orderId,
        vendorId: best.campaign.vendorId,
        source: 'order',
        amount: best.amount,
        destination: best.campaign.destination,
        status: 'pending',
        cashbackType: best.campaign.cashbackType,
        cashbackValue: best.campaign.cashbackValue,
        maxCashback: best.campaign.maxCashback,
        minOrderValue: best.campaign.minOrderValue,
      },
    });
    await tx.cashbackCampaign.update({
      where: { id: best.campaign.id },
      data: { usedAmount: { increment: best.amount }, usedCount: { increment: 1 } },
    });
    return { id: entry.id, amount: best.amount };
  },

  /**
   * On delivery: recompute from the snapshot against the order's FINAL totals
   * (admin may have edited/split the order), then credit the wallet or move a
   * UPI payout to `approved`. Idempotent — only acts on `pending` entries.
   */
  async settleCashbackForOrder(tx: Db, orderId: string): Promise<void> {
    const entry = await tx.cashbackEntry.findUnique({ where: { orderId } });
    if (!entry || entry.status !== 'pending') return;

    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { subtotal: true, promoDiscount: true, couponDiscount: true },
    });
    if (!order) return;
    const base = r2(
      Math.max(0, Number(order.subtotal) - Number(order.promoDiscount) - Number(order.couponDiscount)),
    );

    // Re-qualify + recompute from the snapshotted terms.
    if (entry.minOrderValue && base < Number(entry.minOrderValue)) {
      await this.cancelCashbackForOrder(tx, orderId);
      return;
    }
    let amount = Number(entry.amount);
    if (entry.cashbackType && entry.cashbackValue) {
      amount =
        entry.cashbackType === 'flat'
          ? Math.min(Number(entry.cashbackValue), base)
          : r2((base * Number(entry.cashbackValue)) / 100);
      if (entry.cashbackType === 'percentage' && entry.maxCashback) {
        amount = Math.min(amount, Number(entry.maxCashback));
      }
      amount = r2(amount);
    }
    if (amount <= 0) {
      await this.cancelCashbackForOrder(tx, orderId);
      return;
    }
    const delta = r2(amount - Number(entry.amount));
    if (delta !== 0 && entry.campaignId) {
      await tx.cashbackCampaign.update({
        where: { id: entry.campaignId },
        data: { usedAmount: { increment: delta } },
      });
    }

    if (entry.destination === 'wallet') {
      const wallet = await tx.wallet.upsert({
        where: { userId: entry.userId },
        create: { userId: entry.userId, balance: amount },
        update: { balance: { increment: amount } },
      });
      const walletTxn = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'credit',
          amount,
          referenceId: entry.id,
          referenceType: 'cashback',
          notes: `Cashback for order ${orderId}`,
        },
      });
      await tx.cashbackEntry.update({
        where: { id: entry.id },
        data: { amount, status: 'credited', walletTxnId: walletTxn.id, creditedAt: new Date() },
      });
      await notifyInApp(
        tx,
        entry.userId,
        'Cashback credited 🎉',
        `₹${amount.toLocaleString('en-IN')} cashback has been credited to your wallet.`,
        entry.id,
        'cashback',
      );
    } else {
      await tx.cashbackEntry.update({
        where: { id: entry.id },
        data: { amount, status: 'approved' },
      });
      await notifyInApp(
        tx,
        entry.userId,
        'Cashback approved 🎉',
        entry.upiId
          ? `₹${amount.toLocaleString('en-IN')} cashback approved — it will be transferred to your UPI ID shortly.`
          : `₹${amount.toLocaleString('en-IN')} cashback approved! Add your UPI ID on the Rewards page to receive it.`,
        entry.id,
        'cashback',
      );
    }
  },

  /**
   * On cancel/return: void a pending/approved entry; claw back a credited one
   * from the wallet (clamped at the current balance). Paid UPI entries are left
   * for manual ops follow-up.
   */
  async cancelCashbackForOrder(tx: Db, orderId: string): Promise<void> {
    const entry = await tx.cashbackEntry.findUnique({ where: { orderId } });
    if (!entry || entry.status === 'cancelled' || entry.status === 'paid') return;

    if (entry.status === 'credited') {
      const wallet = await tx.wallet.findUnique({ where: { userId: entry.userId } });
      const clawback = r2(Math.min(Number(wallet?.balance ?? 0), Number(entry.amount)));
      if (wallet && clawback > 0) {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: clawback } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'debit',
            amount: clawback,
            referenceId: entry.id,
            referenceType: 'cashback_reversal',
            notes: `Cashback reversed — order ${orderId} cancelled/returned`,
          },
        });
      }
    }
    if (entry.campaignId) {
      await tx.cashbackCampaign.updateMany({
        where: { id: entry.campaignId, usedCount: { gt: 0 } },
        data: { usedAmount: { decrement: Number(entry.amount) }, usedCount: { decrement: 1 } },
      });
    }
    await tx.cashbackEntry.update({
      where: { id: entry.id },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
  },

  // ── Prepaid wallet redemption (Rule 6) ─────────────────────────────────

  async getWalletBalance(db: Db, userId: string): Promise<number> {
    const wallet = await db.wallet.findUnique({ where: { userId } });
    return r2(Number(wallet?.balance ?? 0));
  },

  /**
   * Allocate up to `balance` over the per-order payables. `reserveMin` keeps
   * the COMBINED payable at/above that floor (Razorpay can't charge ₹0) —
   * pass 1 for online payments, 0 otherwise.
   */
  allocateWallet(balance: number, payables: number[], reserveMin: number): number[] {
    const totalPayable = r2(payables.reduce((a, b) => a + b, 0));
    const usable = r2(Math.min(balance, Math.max(0, totalPayable - reserveMin)));
    if (usable <= 0) return payables.map(() => 0);
    let shares = allocateProportional(usable, payables);
    shares = shares.map((s, i) => r2(Math.min(s, payables[i])));
    return shares;
  },

  /** Debit the prepaid wallet once for the checkout — one ledger row per order. */
  async debitWalletForCheckout(
    tx: Db,
    args: { userId: string; rows: Array<{ orderId: string; amount: number }> },
  ): Promise<void> {
    const rows = args.rows.filter((row) => row.amount > 0);
    if (rows.length === 0) return;
    const total = r2(rows.reduce((a, row) => a + row.amount, 0));
    const wallet = await tx.wallet.findUnique({ where: { userId: args.userId } });
    if (!wallet || Number(wallet.balance) < total) {
      throw Errors.badRequest('Insufficient wallet balance');
    }
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: total } },
    });
    await tx.walletTransaction.createMany({
      data: rows.map((row) => ({
        walletId: wallet.id,
        type: 'debit' as const,
        amount: row.amount,
        referenceId: row.orderId,
        referenceType: 'order_redemption',
        notes: 'Wallet applied at checkout',
      })),
    });
  },

  /** On order cancel: return the wallet amount applied to that order. Idempotent. */
  async refundWalletForOrder(
    tx: Db,
    order: { id: string; userId: string; walletApplied: number },
  ): Promise<void> {
    if (order.walletApplied <= 0) return;
    const existing = await tx.walletTransaction.findFirst({
      where: { referenceId: order.id, referenceType: 'order_redemption_refund' },
    });
    if (existing) return;
    const wallet = await tx.wallet.upsert({
      where: { userId: order.userId },
      create: { userId: order.userId, balance: order.walletApplied },
      update: { balance: { increment: order.walletApplied } },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'credit',
        amount: order.walletApplied,
        referenceId: order.id,
        referenceType: 'order_redemption_refund',
        notes: 'Wallet refund — order cancelled',
      },
    });
  },

  // ── Customer-facing: preview + rewards + UPI claim ─────────────────────

  /**
   * Preview the auto vendor promotions — and, when a code is supplied, the
   * coupon — against the items the checkout is about to order. Prices are
   * re-resolved server-side (client prices are never trusted), so the preview
   * matches what `order.service.create` will compute. Estimate only: the order
   * transaction re-validates everything.
   *
   * Driven by the client cart items rather than the server `Cart` row because
   * the order itself is placed from client items; reading the server cart row
   * (keyed by the JWT outlet/account) could miss a switched/merged cart and
   * wrongly report "empty cart".
   *
   * Rule 3 — a coupon with `stacksWithVendorPromo = false` suppresses the auto
   * promos at checkout, so the returned `autoPromos`/`totalPromoDiscount` are
   * the EFFECTIVE (post-suppression) values for the current code.
   */
  async previewPromotions(args: {
    userId: string;
    businessAccountId: string;
    outletId: string;
    items: PreviewItemInput[];
    code?: string | null;
  }): Promise<{
    subtotal: number;
    subtotalTaxable: number;
    totalGST: number;
    autoPromos: Array<{ vendorId: string; promotionId: string; promotionName: string; type: string; discount: number }>;
    totalPromoDiscount: number;
    bxgyFreeItems: Array<{
      vendorId: string;
      productId: string;
      productName: string;
      quantity: number;
      promotionName: string;
    }>;
    coupon:
      | { valid: true; code: string; name: string; estimatedDiscount: number; stacksWithCashback: boolean }
      | { valid: false; message: string }
      | null;
  }> {
    const emptyCoupon = args.code
      ? { valid: false as const, message: 'No items found in your cart. Please add items before applying a coupon.' }
      : null;
    if (!args.items || args.items.length === 0) {
      return {
        subtotal: 0,
        subtotalTaxable: 0,
        totalGST: 0,
        autoPromos: [],
        totalPromoDiscount: 0,
        bxgyFreeItems: [],
        coupon: emptyCoupon,
      };
    }

    const scopedCart = await prisma.cart.findFirst({
      where: {
        userId: args.userId,
        businessAccountId: args.businessAccountId,
        outletId: args.outletId,
      },
      include: {
        items: { include: { product: { select: { name: true } } } },
      },
    });
    const cartUnitByProduct = new Map(
      (scopedCart?.items ?? []).map((ci) => [ci.productId, Number(ci.unitPrice)]),
    );
    const productNameById = new Map(
      (scopedCart?.items ?? []).map((ci) => [ci.productId, ci.product.name]),
    );

    // Outlet context drives pincode/area pricelist assignment rules.
    const outlet = await prisma.outlet.findFirst({
      where: { id: args.outletId, businessAccountId: args.businessAccountId },
      select: { pincode: true, city: true, state: true },
    });

    const productIds = Array.from(new Set(args.items.map((i) => i.productId)));
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, taxPercent: true, categoryId: true, brand: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const vendorIds = Array.from(new Set(args.items.map((i) => i.vendorId)));
    const vendorCustomers = await prisma.vendorCustomer.findMany({
      where: { userId: args.userId, vendorId: { in: vendorIds } },
      select: { vendorId: true, tags: true },
    });
    const tagsByVendor = new Map(vendorCustomers.map((vc) => [vc.vendorId, vc.tags]));

    // Build per-vendor drafts, re-pricing each line through the same resolver as
    // cart/checkout so the preview equals the order.
    const draftsByVendor = new Map<string, CheckoutOrderDraft>();
    let taxableTotal = 0;
    // Same delivery-location rule as cart/checkout so the cashback preview
    // prices match the order the customer will actually place.
    const deliveryGeo = await getDeliveryGeo(args.userId);
    for (const item of args.items) {
      const product = productById.get(item.productId);
      if (!product) continue;
      if (cartUnitByProduct.get(item.productId) === 0) continue;
      const customer: CustomerContext = {
        userId: args.userId,
        businessAccountId: args.businessAccountId,
        outletId: args.outletId,
        outletPincode: deliveryGeo?.pincode ?? outlet?.pincode ?? null,
        outletCity: deliveryGeo?.city ?? outlet?.city ?? null,
        outletState: deliveryGeo?.state ?? outlet?.state ?? null,
        tags: tagsByVendor.get(item.vendorId) ?? [],
      };
      const resolved = await resolveUnitPrice(
        { productId: item.productId, vendorId: item.vendorId, quantity: item.quantity, customer },
        prisma,
      );
      const taxPercent = Number(product.taxPercent) || 0;
      const grossUnit = r2(Number(resolved.unitPrice) * (1 + taxPercent / 100));
      const billedQty = computeSchemeBilledQty(
        item.quantity,
        resolved.schemeMinQty,
        resolved.schemeFreeQty,
      );
      const lineTotal = r2(grossUnit * billedQty);
      taxableTotal += taxPercent > 0 ? lineTotal / (1 + taxPercent / 100) : lineTotal;

      let draft = draftsByVendor.get(item.vendorId);
      if (!draft) {
        draft = { vendorId: item.vendorId, subtotal: 0, promoDiscount: 0, items: [] };
        draftsByVendor.set(item.vendorId, draft);
      }
      draft.subtotal = r2(draft.subtotal + lineTotal);
      draft.items.push({
        productId: item.productId,
        categoryId: product.categoryId,
        brand: product.brand,
        lineTotal,
      });
    }

    const drafts = Array.from(draftsByVendor.values());
    if (drafts.length === 0) {
      return {
        subtotal: 0,
        subtotalTaxable: 0,
        totalGST: 0,
        autoPromos: [],
        totalPromoDiscount: 0,
        bxgyFreeItems: [],
        coupon: emptyCoupon,
      };
    }

    const bxgyFreeItems: Array<{
      vendorId: string;
      productId: string;
      productName: string;
      quantity: number;
      promotionName: string;
    }> = [];
    for (const vendorId of vendorIds) {
      const vendorPreviewItems = args.items
        .filter((i) => i.vendorId === vendorId && cartUnitByProduct.get(i.productId) !== 0)
        .map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: 1 }));
      const bxgyResults = await evaluateBxgyForCart(prisma, vendorId, vendorPreviewItems);
      for (const bxgy of bxgyResults) {
        if (bxgy.freeUnits <= 0) continue;
        const name =
          productNameById.get(bxgy.getProductId) ??
          (await prisma.product.findUnique({ where: { id: bxgy.getProductId }, select: { name: true } }))?.name ??
          'Free item';
        bxgyFreeItems.push({
          vendorId,
          productId: bxgy.getProductId,
          productName: name,
          quantity: bxgy.freeUnits,
          promotionName: bxgy.promotionName,
        });
      }
    }

    // Server-authoritative subtotal (re-priced gross). The checkout/cart show
    // THIS as the subtotal so the displayed line, discounts, and total all sit
    // on the same basis the order will use.
    const subtotal = r2(drafts.reduce((a, d) => a + d.subtotal, 0));
    const subtotalTaxable = r2(taxableTotal);
    const totalGST = r2(subtotal - subtotalTaxable);

    // Auto vendor promos — same selection as order.service. Populating each
    // draft's promoDiscount makes the coupon's negative-total cap correct.
    const autoPromos: Array<{ vendorId: string; promotionId: string; promotionName: string; type: string; discount: number }> = [];
    for (const draft of drafts) {
      const promo = await evaluateVendorPromo(prisma, draft.vendorId, draft.subtotal);
      if (!promo) continue;
      draft.promoDiscount = promo.discount;
      if (promo.discount > 0) {
        autoPromos.push({
          vendorId: draft.vendorId,
          promotionId: promo.promotionId,
          promotionName: promo.name,
          type: promo.type,
          discount: promo.discount,
        });
      }
    }

    // Coupon (optional).
    let coupon:
      | { valid: true; code: string; name: string; estimatedDiscount: number; stacksWithCashback: boolean }
      | { valid: false; message: string }
      | null = null;
    let suppressVendorPromos = false;
    if (args.code) {
      try {
        const app = await loadAndValidateCoupon(prisma, { code: args.code, userId: args.userId, drafts });
        suppressVendorPromos = app.suppressVendorPromos;
        coupon = {
          valid: true,
          code: app.coupon.code,
          name: app.coupon.name,
          estimatedDiscount: app.totalDiscount,
          stacksWithCashback: app.coupon.stacksWithCashback,
        };
      } catch (error) {
        coupon = { valid: false, message: error instanceof Error ? error.message : 'Invalid coupon code' };
      }
    }

    // Effective (post-suppression) auto promos for the current code.
    const effectiveAutoPromos = suppressVendorPromos ? [] : autoPromos;
    const totalPromoDiscount = r2(effectiveAutoPromos.reduce((a, p) => a + p.discount, 0));

    return {
      subtotal,
      subtotalTaxable,
      totalGST,
      autoPromos: effectiveAutoPromos,
      totalPromoDiscount,
      bxgyFreeItems: mergeBxgyFreeItems(bxgyFreeItems),
      coupon,
    };
  },

  /** Wallet balance + cashback history for the rewards page. */
  async getRewards(userId: string) {
    const [balance, entries] = await Promise.all([
      this.getWalletBalance(prisma, userId),
      prisma.cashbackEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          campaign: { select: { name: true } },
          order: { select: { orderNumber: true } },
        },
      }),
    ]);
    const txns = await prisma.walletTransaction.findMany({
      where: { wallet: { userId } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { walletBalance: balance, entries, walletTransactions: txns };
  },

  /** Customer attaches their UPI ID to an unclaimed UPI cashback. */
  async claimUpi(entryId: string, userId: string, upiId: string): Promise<CashbackEntry> {
    const entry = await prisma.cashbackEntry.findFirst({
      where: { id: entryId, userId },
    });
    if (!entry) throw Errors.notFound('Cashback entry');
    if (entry.destination !== 'upi') {
      throw Errors.badRequest('This cashback is credited to your wallet — no UPI ID needed');
    }
    if (entry.status !== 'pending' && entry.status !== 'approved') {
      throw Errors.badRequest('This cashback can no longer be claimed');
    }
    return prisma.cashbackEntry.update({
      where: { id: entry.id },
      data: { upiId },
    });
  },

  // ── Admin ops: direct grants + UPI payout queue ────────────────────────

  /**
   * "User Cashback" direct incentive — admin rewards an individual user.
   * Wallet grants credit immediately; UPI grants enter the payout queue as
   * `approved` and the user is nudged to claim with their UPI ID.
   */
  async grantDirectIncentive(args: {
    adminId: string;
    userId: string;
    amount: number;
    destination: 'wallet' | 'upi';
    notes?: string | null;
  }): Promise<CashbackEntry> {
    const amount = r2(args.amount);
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: args.userId }, select: { id: true } });
      if (!user) throw Errors.notFound('User');

      const entry = await tx.cashbackEntry.create({
        data: {
          userId: args.userId,
          source: 'direct_grant',
          amount,
          destination: args.destination,
          status: args.destination === 'wallet' ? 'credited' : 'approved',
          notes: args.notes ?? null,
          createdById: args.adminId,
          creditedAt: args.destination === 'wallet' ? new Date() : null,
        },
      });

      if (args.destination === 'wallet') {
        const wallet = await tx.wallet.upsert({
          where: { userId: args.userId },
          create: { userId: args.userId, balance: amount },
          update: { balance: { increment: amount } },
        });
        const walletTxn = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'credit',
            amount,
            referenceId: entry.id,
            referenceType: 'direct_grant',
            notes: args.notes ?? 'Incentive from Horeca1',
          },
        });
        await tx.cashbackEntry.update({
          where: { id: entry.id },
          data: { walletTxnId: walletTxn.id },
        });
        await notifyInApp(
          tx,
          args.userId,
          'You received an incentive 🎁',
          `₹${amount.toLocaleString('en-IN')} has been credited to your Horeca1 wallet.`,
          entry.id,
          'cashback',
        );
      } else {
        await notifyInApp(
          tx,
          args.userId,
          'Grab your incentive 🎁',
          `You've been rewarded ₹${amount.toLocaleString('en-IN')}! Add your UPI ID on the Rewards page to receive it.`,
          entry.id,
          'cashback',
        );
      }
      return entry;
    });
  },

  /** Admin records a completed UPI transfer (UTR reference) for an approved entry. */
  async markEntryPaid(entryId: string, adminId: string, paidReference: string): Promise<CashbackEntry> {
    return prisma.$transaction(async (tx) => {
      const entry = await tx.cashbackEntry.findUnique({ where: { id: entryId } });
      if (!entry) throw Errors.notFound('Cashback entry');
      if (entry.destination !== 'upi' || entry.status !== 'approved') {
        throw Errors.badRequest('Only approved UPI cashbacks can be marked paid');
      }
      const updated = await tx.cashbackEntry.update({
        where: { id: entry.id },
        data: {
          status: 'paid',
          paidReference,
          paidAt: new Date(),
          notes: entry.notes ? `${entry.notes} | paid by ${adminId}` : `paid by ${adminId}`,
        },
      });
      await notifyInApp(
        tx,
        entry.userId,
        'Cashback paid 🎉',
        `₹${Number(entry.amount).toLocaleString('en-IN')} has been transferred to your UPI ID${entry.upiId ? ` (${entry.upiId})` : ''}.`,
        entry.id,
        'cashback',
      );
      return updated;
    });
  },
};
