// Promo Engine Phase 1 — Coupons + Cashback (the two priority promos).
//
// All money logic lives here; routes stay thin. Stacking rules implemented:
//   Rule 1  ONE coupon per checkout (hard-coded — single couponCode input).
//   Rule 2  Coupon + Cashback        — per-campaign `stacksWithCoupon` +
//                                      per-coupon `stacksWithCashback`.
//   Rule 3  Coupon + Vendor discount — per-coupon `stacksWithVendorPromo`;
//                                      when false, pct/flat AND BXGY are
//                                      skipped for that checkout.
//   Rule 5  ONE cashback source per checkout (highest of platform-on-combined
//           goods + each vendor campaign on that PO). One CashbackEntry.
//   Rule 6  H1 Wallet usable alongside promotions unless the coupon's
//           `stacksWithWallet` is false. A campaign with `stacksWithWallet`
//           false is skipped when wallet was used as payment.
//
// Calculation sequence (per the brief): price → vendor discount → coupon →
// wallet redemption → final payable → cashback computed on what the customer
// actually pays for goods (subtotal − vendor promo − coupon; wallet is a
// payment instrument, not a discount, so it does NOT reduce the cashback base).

import { prisma } from '@/lib/prisma';
import type { Prisma, Coupon, CashbackEntry } from '@prisma/client';
import { Errors } from '@/middleware/errorHandler';
import * as programs from './promotion-issuance';
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
    'id' | 'code' | 'name' | 'stacksWithVendorPromo' | 'stacksWithCashback' | 'stacksWithWallet'
  >;
  /** When true, the caller must drop the auto vendor promos (pct/flat AND BXGY). */
  suppressVendorPromos: boolean;
  /** Discount allocated per draft, aligned with the drafts array. */
  perOrder: number[];
  totalDiscount: number;
}

export interface CheckoutCashbackPo {
  orderId: string;
  vendorId: string;
  /** subtotal − vendor promo − coupon (goods the customer pays for). */
  base: number;
}

/** Server-computed checkout estimate — the frontend must not invent this amount. */
export interface EstimatedCashbackPreview {
  estimatedAmount: number;
  destination: 'wallet' | 'upi';
  settlesOn: 'delivery';
  campaignName: string;
}

export interface PublicCouponOffer {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  maxDiscount: number | null;
  minOrderValue: number | null;
  endDate: Date | null;
  vendorId: string | null;
  vendorName: string | null;
  hasScope: boolean;
}

export interface PublicStoreOffer {
  id: string;
  kind: 'vendor_promo' | 'cashback';
  name: string;
  badgeLabel: string;
  type: string;
  description: string | null;
  vendorId: string | null;
  vendorName: string | null;
  minOrderValue: number | null;
  endDate: Date | null;
}

/** Cart-aware coupon row for checkout select / gray-out UI. */
export interface CheckoutCouponChoice {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  maxDiscount: number | null;
  minOrderValue: number | null;
  endDate: Date | null;
  vendorId: string | null;
  vendorName: string | null;
  hasScope: boolean;
  eligible: boolean;
  reason: string | null;
  estimatedDiscount: number | null;
}

/** Cart-aware cashback row — auto-applied winner flagged via isWinning. */
export interface CheckoutCashbackChoice {
  id: string;
  name: string;
  badgeLabel: string;
  description: string | null;
  vendorId: string | null;
  vendorName: string | null;
  minOrderValue: number | null;
  endDate: Date | null;
  eligible: boolean;
  reason: string | null;
  estimatedAmount: number | null;
  isWinning: boolean;
}

/** Cart-aware vendor store offer (pct/flat/BXGY) for checkout visibility. */
export interface CheckoutStoreOfferChoice {
  id: string;
  name: string;
  badgeLabel: string;
  type: string;
  vendorId: string;
  vendorName: string | null;
  minOrderValue: number | null;
  endDate: Date | null;
  eligible: boolean;
  reason: string | null;
  estimatedDiscount: number | null;
  isApplied: boolean;
}

export interface CheckoutOfferChoices {
  coupons: CheckoutCouponChoice[];
  cashbacks: CheckoutCashbackChoice[];
  storeOffers: CheckoutStoreOfferChoice[];
}

const EMPTY_OFFER_CHOICES: CheckoutOfferChoices = {
  coupons: [],
  cashbacks: [],
  storeOffers: [],
};

const CHECKOUT_COUPON_CHOICE_CAP = 30;
const CHECKOUT_CASHBACK_CHOICE_CAP = 20;
const CHECKOUT_STORE_OFFER_CHOICE_CAP = 20;

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

/**
 * Peek the coupon's Rule 3 flag before BXGY / vendor-promo evaluation.
 * Invalid codes return false (caller still fails later in applyCouponToCheckout).
 */
export async function couponSuppressesVendorPromos(db: Db, code: string): Promise<boolean> {
  const coupon = await db.coupon.findUnique({
    where: { code: code.trim().toUpperCase() },
    select: { isActive: true, stacksWithVendorPromo: true },
  });
  return !!coupon?.isActive && !coupon.stacksWithVendorPromo;
}

/**
 * Vendor coupon scope must stay inside this vendor's catalog. Never trusts a
 * body `vendorId` — the caller passes the resolved vendor from session.
 */
export async function assertVendorCouponScope(
  db: Db,
  vendorId: string,
  scope: { categoryIds?: string[]; productIds?: string[]; brandNames?: string[] },
): Promise<void> {
  if (scope.productIds && scope.productIds.length > 0) {
    const owned = await db.product.count({
      where: { id: { in: scope.productIds }, vendorId },
    });
    if (owned !== scope.productIds.length) {
      throw Errors.badRequest('One or more selected products do not belong to your store');
    }
  }

  if (scope.categoryIds && scope.categoryIds.length > 0) {
    const unique = Array.from(new Set(scope.categoryIds));
    const [primary, linked] = await Promise.all([
      db.product.findMany({
        where: { vendorId, categoryId: { in: unique } },
        select: { categoryId: true },
        distinct: ['categoryId'],
      }),
      db.productCategory.findMany({
        where: { categoryId: { in: unique }, product: { vendorId } },
        select: { categoryId: true },
        distinct: ['categoryId'],
      }),
    ]);
    const found = new Set<string>();
    for (const row of primary) {
      if (row.categoryId) found.add(row.categoryId);
    }
    for (const row of linked) found.add(row.categoryId);
    if (unique.some((id) => !found.has(id))) {
      throw Errors.badRequest('One or more selected categories are not in your catalog');
    }
  }

  if (scope.brandNames && scope.brandNames.length > 0) {
    const unique = Array.from(new Set(scope.brandNames.map((n) => n.trim()).filter(Boolean)));
    const products = await db.product.findMany({
      where: { vendorId, brand: { not: null } },
      select: { brand: true },
      distinct: ['brand'],
    });
    const catalog = new Set(
      products.map((p) => (p.brand ?? '').trim().toLowerCase()).filter(Boolean),
    );
    if (unique.some((name) => !catalog.has(name.toLowerCase()))) {
      throw Errors.badRequest('One or more selected brands are not in your catalog');
    }
  }
}

function cashbackAmountForBase(
  campaign: { cashbackType: string; cashbackValue: unknown; maxCashback?: unknown | null },
  base: number,
): number {
  let amount =
    campaign.cashbackType === 'flat'
      ? Math.min(Number(campaign.cashbackValue), base)
      : r2((base * Number(campaign.cashbackValue)) / 100);
  if (campaign.cashbackType === 'percentage' && campaign.maxCashback) {
    amount = Math.min(amount, Number(campaign.maxCashback));
  }
  return r2(Math.max(0, amount));
}

function goodsBase(order: { subtotal: unknown; promoDiscount: unknown; couponDiscount: unknown }): number {
  return r2(
    Math.max(0, Number(order.subtotal) - Number(order.promoDiscount) - Number(order.couponDiscount)),
  );
}

function pickAttachOrderId(
  pos: CheckoutCashbackPo[],
  campaignVendorId: string | null,
): string {
  const pool = campaignVendorId ? pos.filter((p) => p.vendorId === campaignVendorId) : pos;
  const candidates = pool.length > 0 ? pool : pos;
  let best = candidates[0];
  for (const p of candidates) {
    if (p.base > best.base) best = p;
  }
  return best.orderId;
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
  if (coupon.audienceUserIds.length > 0 && !coupon.audienceUserIds.includes(args.userId)) {
    throw Errors.badRequest('This coupon is not available for your account');
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
      stacksWithWallet: coupon.stacksWithWallet,
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

type CashbackPoBase = { vendorId: string; base: number };

/**
 * Pick the single highest cashback campaign for a checkout (Rule 5). Shared by
 * persist (`evaluateCashbackForCheckout`) and the estimate-only preview.
 */
async function selectWinningCashbackCampaign(
  db: Db,
  args: {
    userId: string;
    pos: CashbackPoBase[];
    couponApplied: boolean;
    couponBlocksCashback: boolean;
    walletApplied: boolean;
  },
) {
  const pos = args.pos.filter((p) => p.base > 0);
  if (pos.length === 0) return null;
  if (args.couponApplied && args.couponBlocksCashback) return null;

  const combinedBase = r2(pos.reduce((a, p) => a + p.base, 0));
  const vendorIds = Array.from(new Set(pos.map((p) => p.vendorId)));
  const baseByVendor = new Map<string, number>();
  for (const p of pos) {
    baseByVendor.set(p.vendorId, r2((baseByVendor.get(p.vendorId) ?? 0) + p.base));
  }

  const now = new Date();
  const campaigns = await db.cashbackCampaign.findMany({
    where: {
      isActive: true,
      OR: [{ vendorId: null }, { vendorId: { in: vendorIds } }],
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: now } }] },
        { OR: [{ endDate: null }, { endDate: { gte: now } }] },
      ],
    },
  });

  let best: { campaign: (typeof campaigns)[number]; amount: number } | null = null;
  for (const c of campaigns) {
    if (args.couponApplied && !c.stacksWithCoupon) continue;
    if (args.walletApplied && !c.stacksWithWallet) continue;

    const base = c.vendorId ? (baseByVendor.get(c.vendorId) ?? 0) : combinedBase;
    if (base <= 0) continue;
    if (c.minOrderValue && base < Number(c.minOrderValue)) continue;

    const amount = cashbackAmountForBase(c, base);
    if (amount <= 0) continue;
    if (c.totalBudget && Number(c.usedAmount) + amount > Number(c.totalBudget)) continue;
    if (c.perUserLimit !== null) {
      const earned = await db.cashbackEntry.count({
        where: { campaignId: c.id, userId: args.userId, status: { not: 'cancelled' } },
      });
      if (earned >= c.perUserLimit) continue;
    }

    if (!best || amount > best.amount) best = { campaign: c, amount };
  }
  return best;
}

/**
 * Evaluate all cart-relevant coupons / cashbacks / store offers for checkout
 * select UI. Coupons use the same validator as Apply; cashback lists every
 * campaign with eligibility + flags the auto-winning one.
 */
async function buildOfferChoicesForCheckout(
  db: Db,
  args: {
    userId: string;
    drafts: CheckoutOrderDraft[];
    autoPromos: Array<{ vendorId: string; promotionId: string; discount: number }>;
    cashbackPos: CashbackPoBase[];
    couponApplied: boolean;
    couponBlocksCashback: boolean;
    walletApplied: boolean;
    winningCampaignId: string | null;
  },
): Promise<CheckoutOfferChoices> {
  const vendorIds = Array.from(new Set(args.drafts.map((d) => d.vendorId)));
  if (vendorIds.length === 0) return EMPTY_OFFER_CHOICES;

  const now = new Date();
  const vendorScope: Prisma.CouponWhereInput = {
    OR: [{ vendorId: null }, { vendorId: { in: vendorIds } }],
  };

  const [couponRows, campaignRows, promoRows] = await Promise.all([
    db.coupon.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
          {
            OR: [
              { audienceUserIds: { isEmpty: true } },
              { audienceUserIds: { has: args.userId } },
            ],
          },
          vendorScope,
        ],
      },
      include: { vendor: { select: { id: true, businessName: true } } },
      orderBy: { createdAt: 'desc' },
      take: CHECKOUT_COUPON_CHOICE_CAP,
    }),
    db.cashbackCampaign.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
          { OR: [{ vendorId: null }, { vendorId: { in: vendorIds } }] },
        ],
      },
      include: { vendor: { select: { id: true, businessName: true } } },
      orderBy: { createdAt: 'desc' },
      take: CHECKOUT_CASHBACK_CHOICE_CAP,
    }),
    db.promotion.findMany({
      where: {
        vendorId: { in: vendorIds },
        ...livePromotionWhere(now),
      },
      include: {
        vendor: { select: { id: true, businessName: true } },
        buyProduct: { select: { id: true } },
        getProduct: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: CHECKOUT_STORE_OFFER_CHOICE_CAP,
    }),
  ]);

  const coupons: CheckoutCouponChoice[] = [];
  for (const c of couponRows) {
    if (c.usageLimit !== null && c.usedCount >= c.usageLimit) continue;
    const base: Omit<CheckoutCouponChoice, 'eligible' | 'reason' | 'estimatedDiscount'> = {
      id: c.id,
      code: c.code,
      name: c.name,
      description: c.description,
      discountType: c.discountType,
      discountValue: Number(c.discountValue),
      maxDiscount: c.maxDiscount != null ? Number(c.maxDiscount) : null,
      minOrderValue: c.minOrderValue != null ? Number(c.minOrderValue) : null,
      endDate: c.endDate,
      vendorId: c.vendorId,
      vendorName: c.vendor?.businessName ?? null,
      hasScope: c.productIds.length > 0 || c.categoryIds.length > 0 || c.brandNames.length > 0,
    };
    try {
      const app = await loadAndValidateCoupon(db, {
        code: c.code,
        userId: args.userId,
        drafts: args.drafts,
      });
      coupons.push({
        ...base,
        eligible: true,
        reason: null,
        estimatedDiscount: app.totalDiscount,
      });
    } catch (error) {
      coupons.push({
        ...base,
        eligible: false,
        reason: error instanceof Error ? error.message : 'Not available for this cart',
        estimatedDiscount: null,
      });
    }
  }

  // Sort: eligible first (higher savings), then ineligible.
  coupons.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return (b.estimatedDiscount ?? 0) - (a.estimatedDiscount ?? 0);
  });

  const pos = args.cashbackPos.filter((p) => p.base > 0);
  const combinedBase = r2(pos.reduce((a, p) => a + p.base, 0));
  const baseByVendor = new Map<string, number>();
  for (const p of pos) {
    baseByVendor.set(p.vendorId, r2((baseByVendor.get(p.vendorId) ?? 0) + p.base));
  }

  const cashbacks: CheckoutCashbackChoice[] = [];
  for (const c of campaignRows) {
    const badgeLabel = cashbackOfferBadge(c);
    const baseRow: Omit<CheckoutCashbackChoice, 'eligible' | 'reason' | 'estimatedAmount' | 'isWinning'> = {
      id: c.id,
      name: c.name,
      badgeLabel,
      description: c.description,
      vendorId: c.vendorId,
      vendorName: c.vendor?.businessName ?? null,
      minOrderValue: c.minOrderValue != null ? Number(c.minOrderValue) : null,
      endDate: c.endDate,
    };

    if (args.couponApplied && args.couponBlocksCashback) {
      cashbacks.push({
        ...baseRow,
        eligible: false,
        reason: 'This coupon cannot be clubbed with cashback',
        estimatedAmount: null,
        isWinning: false,
      });
      continue;
    }
    if (args.couponApplied && !c.stacksWithCoupon) {
      cashbacks.push({
        ...baseRow,
        eligible: false,
        reason: 'Does not stack with the applied coupon',
        estimatedAmount: null,
        isWinning: false,
      });
      continue;
    }
    if (args.walletApplied && !c.stacksWithWallet) {
      cashbacks.push({
        ...baseRow,
        eligible: false,
        reason: 'Does not stack with H1 Wallet',
        estimatedAmount: null,
        isWinning: false,
      });
      continue;
    }

    const base = c.vendorId ? (baseByVendor.get(c.vendorId) ?? 0) : combinedBase;
    if (base <= 0) {
      cashbacks.push({
        ...baseRow,
        eligible: false,
        reason: 'Not available for items in your cart',
        estimatedAmount: null,
        isWinning: false,
      });
      continue;
    }
    const minVal = c.minOrderValue != null ? Number(c.minOrderValue) : 0;
    if (minVal > 0 && base < minVal) {
      const need = r2(minVal - base);
      cashbacks.push({
        ...baseRow,
        eligible: false,
        reason: `Shop for ₹${need.toLocaleString('en-IN')} more to unlock`,
        estimatedAmount: null,
        isWinning: false,
      });
      continue;
    }

    const amount = cashbackAmountForBase(c, base);
    if (amount <= 0) {
      cashbacks.push({
        ...baseRow,
        eligible: false,
        reason: 'No cashback on this cart',
        estimatedAmount: null,
        isWinning: false,
      });
      continue;
    }
    if (c.totalBudget && Number(c.usedAmount) + amount > Number(c.totalBudget)) {
      cashbacks.push({
        ...baseRow,
        eligible: false,
        reason: 'Campaign budget exhausted',
        estimatedAmount: null,
        isWinning: false,
      });
      continue;
    }
    if (c.perUserLimit !== null) {
      const earned = await db.cashbackEntry.count({
        where: { campaignId: c.id, userId: args.userId, status: { not: 'cancelled' } },
      });
      if (earned >= c.perUserLimit) {
        cashbacks.push({
          ...baseRow,
          eligible: false,
          reason: 'You have already claimed this cashback the maximum times',
          estimatedAmount: null,
          isWinning: false,
        });
        continue;
      }
    }

    cashbacks.push({
      ...baseRow,
      eligible: true,
      reason: null,
      estimatedAmount: amount,
      isWinning: args.winningCampaignId === c.id,
    });
  }

  cashbacks.sort((a, b) => {
    if (a.isWinning !== b.isWinning) return a.isWinning ? -1 : 1;
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return (b.estimatedAmount ?? 0) - (a.estimatedAmount ?? 0);
  });

  const appliedPromoIds = new Set(args.autoPromos.map((p) => p.promotionId));
  const draftSubtotalByVendor = new Map(args.drafts.map((d) => [d.vendorId, d.subtotal]));
  const storeOffers: CheckoutStoreOfferChoice[] = [];
  for (const p of promoRows.filter(promotionWithinUsage)) {
    const vendorSubtotal = draftSubtotalByVendor.get(p.vendorId) ?? 0;
    const minVal = p.minOrderValue != null ? Number(p.minOrderValue) : 0;
    const isApplied = appliedPromoIds.has(p.id);
    let estimatedDiscount: number | null = null;
    let eligible = false;
    let reason: string | null = null;

    if (p.type === 'pct_discount' || p.type === 'flat_discount') {
      if (minVal > 0 && vendorSubtotal < minVal) {
        reason = `Shop for ₹${r2(minVal - vendorSubtotal).toLocaleString('en-IN')} more from this vendor`;
      } else if (vendorSubtotal <= 0) {
        reason = 'Not available for items in your cart';
      } else {
        eligible = true;
        if (p.type === 'pct_discount' && p.discountPct) {
          estimatedDiscount = r2((vendorSubtotal * Number(p.discountPct)) / 100);
        } else if (p.type === 'flat_discount' && p.discountFlat) {
          estimatedDiscount = Math.min(Number(p.discountFlat), vendorSubtotal);
        }
      }
    } else {
      // BXGY — eligibility is item-qty driven; show as available when cart has vendor lines.
      if (vendorSubtotal <= 0) {
        reason = 'Not available for items in your cart';
      } else {
        eligible = true;
        reason = null;
      }
    }

    storeOffers.push({
      id: p.id,
      name: p.name,
      badgeLabel: vendorPromoOfferBadge(p),
      type: p.type,
      vendorId: p.vendorId,
      vendorName: p.vendor.businessName,
      minOrderValue: minVal > 0 ? minVal : null,
      endDate: p.endDate,
      eligible,
      reason,
      estimatedDiscount,
      isApplied,
    });
  }

  storeOffers.sort((a, b) => {
    if (a.isApplied !== b.isApplied) return a.isApplied ? -1 : 1;
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return (b.estimatedDiscount ?? 0) - (a.estimatedDiscount ?? 0);
  });

  return { coupons, cashbacks, storeOffers };
}

export function cashbackOfferBadge(c: {
  cashbackType: string;
  cashbackValue: unknown;
  maxCashback: unknown;
  minOrderValue: unknown;
}): string {
  const minVal = c.minOrderValue != null ? Number(c.minOrderValue) : 0;
  const minSuffix = minVal > 0 ? ` on orders above ₹${minVal.toFixed(0)}` : '';
  // Marketing surface shows campaign face value as an upper bound — checkout
  // estimates the order-capped amount via preview. Always say "Up to".
  if (c.cashbackType === 'percentage') {
    const cap = c.maxCashback ? ` (max ₹${Number(c.maxCashback).toFixed(0)})` : '';
    return `Up to ${Number(c.cashbackValue).toFixed(0)}% cashback${cap}${minSuffix}`;
  }
  return `Up to ₹${Number(c.cashbackValue).toFixed(0)} cashback${minSuffix}`;
}

function vendorPromoOfferBadge(p: {
  type: string;
  name: string;
  minQty: number | null;
  getQty: number | null;
  buyProductId: string | null;
  getProductId: string | null;
  discountPct: unknown;
  discountFlat: unknown;
  minOrderValue: unknown;
}): string {
  if (p.type === 'bxgy' && p.buyProductId) {
    const minQty = p.minQty ?? 1;
    const getQty = p.getQty ?? 1;
    return bxgyBadgeLabel(minQty, getQty, p.buyProductId === p.getProductId);
  }
  const minVal = p.minOrderValue != null ? Number(p.minOrderValue) : 0;
  if (p.type === 'pct_discount' && p.discountPct) {
    return minVal > 0
      ? `${Number(p.discountPct).toFixed(0)}% off orders above ₹${minVal.toFixed(0)}`
      : `${Number(p.discountPct).toFixed(0)}% off`;
  }
  if (p.type === 'flat_discount' && p.discountFlat) {
    return minVal > 0
      ? `₹${Number(p.discountFlat).toFixed(0)} off orders above ₹${minVal.toFixed(0)}`
      : `₹${Number(p.discountFlat).toFixed(0)} off`;
  }
  return p.name;
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
      await programs.releaseFirstOrderCouponGrant(tx, redemption.checkoutGroupId);
    }
  },

  // ── Cashback: checkout + delivery lifecycle ────────────────────────────

  /**
   * Rule 5 — one cashback source per checkout. Platform campaigns score on the
   * combined goods base; each vendor campaign scores on that PO's goods base.
   * Highest amount wins. One CashbackEntry attached to the winning PO (or the
   * largest PO when a platform campaign wins). Campaign terms are snapshotted
   * so settlement at delivery survives campaign edits and admin modifications.
   */
  async evaluateCashbackForCheckout(
    tx: Db,
    args: {
      userId: string;
      checkoutGroupId: string;
      pos: CheckoutCashbackPo[];
      couponApplied: boolean;
      /** Per-coupon stacksWithCashback=false blocks all cashback on the checkout. */
      couponBlocksCashback: boolean;
      /** True when H1 Wallet was actually debited on this checkout. */
      walletApplied: boolean;
    },
  ): Promise<{ id: string; amount: number; orderId: string } | null> {
    const pos = args.pos.filter((p) => p.base > 0);
    const best = await selectWinningCashbackCampaign(tx, { ...args, pos });
    if (!best) return null;

    const orderId = pickAttachOrderId(pos, best.campaign.vendorId);
    const entry = await tx.cashbackEntry.create({
      data: {
        campaignId: best.campaign.id,
        userId: args.userId,
        orderId,
        checkoutGroupId: args.checkoutGroupId,
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
    return { id: entry.id, amount: best.amount, orderId };
  },

  /**
   * On delivery: recompute from the snapshot against remaining non-cancelled
   * POs in the checkout group (legacy entries without checkoutGroupId still
   * use this order alone). Then credit the H1 Wallet or move a UPI payout
   * to `approved`. Idempotent — only acts on `pending` entries.
   */
  async settleCashbackForOrder(tx: Db, orderId: string): Promise<void> {
    const entry = await tx.cashbackEntry.findUnique({ where: { orderId } });
    if (!entry || entry.status !== 'pending') return;

    let base: number;
    if (entry.checkoutGroupId) {
      const siblings = await tx.order.findMany({
        where: {
          checkoutGroupId: entry.checkoutGroupId,
          status: { notIn: ['cancelled', 'returned', 'draft'] },
        },
        select: { vendorId: true, subtotal: true, promoDiscount: true, couponDiscount: true },
      });
      const remaining = entry.vendorId
        ? siblings.filter((o) => o.vendorId === entry.vendorId)
        : siblings;
      if (remaining.length === 0) {
        await this.cancelCashbackForOrder(tx, orderId);
        return;
      }
      base = r2(remaining.reduce((a, o) => a + goodsBase(o), 0));
    } else {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { subtotal: true, promoDiscount: true, couponDiscount: true },
      });
      if (!order) return;
      base = goodsBase(order);
    }

    // Re-qualify + recompute from the snapshotted terms.
    if (entry.minOrderValue && base < Number(entry.minOrderValue)) {
      await this.cancelCashbackForOrder(tx, orderId);
      return;
    }
    let amount = Number(entry.amount);
    if (entry.cashbackType && entry.cashbackValue) {
      amount = cashbackAmountForBase(
        {
          cashbackType: entry.cashbackType,
          cashbackValue: entry.cashbackValue,
          maxCashback: entry.maxCashback,
        },
        base,
      );
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
        `₹${amount.toLocaleString('en-IN')} cashback has been credited to your H1 Wallet.`,
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
        notes: 'H1 Wallet applied at checkout',
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
        notes: 'H1 Wallet refund — order cancelled',
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
   * pct/flat promos AND BXGY at checkout, so the returned `autoPromos` /
   * `totalPromoDiscount` / `bxgyFreeItems` are the EFFECTIVE (post-suppression)
   * values for the current code.
   */
  async previewPromotions(args: {
    userId: string;
    businessAccountId: string;
    outletId: string;
    items: PreviewItemInput[];
    code?: string | null;
    useWallet?: boolean;
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
      | { valid: true; code: string; name: string; estimatedDiscount: number; stacksWithCashback: boolean; stacksWithWallet: boolean }
      | { valid: false; message: string }
      | null;
    estimatedCashback: EstimatedCashbackPreview | null;
    offerChoices: CheckoutOfferChoices;
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
        estimatedCashback: null,
        offerChoices: EMPTY_OFFER_CHOICES,
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
        estimatedCashback: null,
        offerChoices: EMPTY_OFFER_CHOICES,
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
      | { valid: true; code: string; name: string; estimatedDiscount: number; stacksWithCashback: boolean; stacksWithWallet: boolean }
      | { valid: false; message: string }
      | null = null;
    let suppressVendorPromos = false;
    let couponPerOrder: number[] = drafts.map(() => 0);
    let couponBlocksCashback = false;
    let couponBlocksWallet = false;
    if (args.code) {
      try {
        const app = await loadAndValidateCoupon(prisma, { code: args.code, userId: args.userId, drafts });
        suppressVendorPromos = app.suppressVendorPromos;
        couponPerOrder = app.perOrder;
        couponBlocksCashback = !app.coupon.stacksWithCashback;
        couponBlocksWallet = !app.coupon.stacksWithWallet;
        coupon = {
          valid: true,
          code: app.coupon.code,
          name: app.coupon.name,
          estimatedDiscount: app.totalDiscount,
          stacksWithCashback: app.coupon.stacksWithCashback,
          stacksWithWallet: app.coupon.stacksWithWallet,
        };
      } catch (error) {
        coupon = { valid: false, message: error instanceof Error ? error.message : 'Invalid coupon code' };
      }
    }

    // Effective (post-suppression) auto promos + BXGY for the current code.
    const effectiveAutoPromos = suppressVendorPromos ? [] : autoPromos;
    const totalPromoDiscount = r2(effectiveAutoPromos.reduce((a, p) => a + p.discount, 0));
    const effectiveBxgy = suppressVendorPromos ? [] : mergeBxgyFreeItems(bxgyFreeItems);

    const promoByVendor = new Map(effectiveAutoPromos.map((p) => [p.vendorId, p.discount]));
    const cashbackPos = drafts.map((d, i) => ({
      vendorId: d.vendorId,
      base: r2(Math.max(0, d.subtotal - (promoByVendor.get(d.vendorId) ?? 0) - (couponPerOrder[i] ?? 0))),
    }));
    const walletApplied = Boolean(args.useWallet) && !couponBlocksWallet;
    const winner = await selectWinningCashbackCampaign(prisma, {
      userId: args.userId,
      pos: cashbackPos,
      couponApplied: coupon?.valid === true,
      couponBlocksCashback,
      walletApplied,
    });
    const estimatedCashback: EstimatedCashbackPreview | null = winner
      ? {
          estimatedAmount: winner.amount,
          destination: winner.campaign.destination,
          settlesOn: 'delivery',
          campaignName: winner.campaign.name,
        }
      : null;

    const offerChoices = await buildOfferChoicesForCheckout(prisma, {
      userId: args.userId,
      drafts,
      autoPromos: effectiveAutoPromos,
      cashbackPos,
      couponApplied: coupon?.valid === true,
      couponBlocksCashback,
      walletApplied,
      winningCampaignId: winner?.campaign.id ?? null,
    });

    return {
      subtotal,
      subtotalTaxable,
      totalGST,
      autoPromos: effectiveAutoPromos,
      totalPromoDiscount,
      bxgyFreeItems: effectiveBxgy,
      coupon,
      estimatedCashback,
      offerChoices,
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

  /**
   * Customer deals surface: live coupons + store offers (vendor pct/flat/BXGY
   * and cashback campaigns). When `vendorId` is set, only platform + that
   * vendor — never another vendor's private coupons. Otherwise platform +
   * vendors visible for the delivery pincode (same rule as catalog).
   */
  async listPublicOffers(args: {
    userId: string;
    vendorId?: string | null;
    pincode?: string | null;
  }): Promise<{ coupons: PublicCouponOffer[]; storeOffers: PublicStoreOffer[] }> {
    const now = new Date();
    const pincode = args.pincode && /^\d{6}$/.test(args.pincode) ? args.pincode : null;
    const vendorVisibility: Prisma.VendorWhereInput = {
      isActive: true,
      isVerified: true,
      ...(pincode ? { serviceAreas: { some: { pincode, isActive: true } } } : {}),
    };
    const vendorScope: Prisma.CouponWhereInput = args.vendorId
      ? { OR: [{ vendorId: null }, { vendorId: args.vendorId }] }
      : { OR: [{ vendorId: null }, { vendor: vendorVisibility }] };

    const [couponRows, promoRows, campaignRows] = await Promise.all([
      prisma.coupon.findMany({
        where: {
          isActive: true,
          AND: [
            { OR: [{ startDate: null }, { startDate: { lte: now } }] },
            { OR: [{ endDate: null }, { endDate: { gte: now } }] },
            {
              OR: [
                { audienceUserIds: { isEmpty: true } },
                { audienceUserIds: { has: args.userId } },
              ],
            },
            vendorScope,
          ],
        },
        include: { vendor: { select: { id: true, businessName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.promotion.findMany({
        where: {
          ...livePromotionWhere(now),
          ...(args.vendorId ? { vendorId: args.vendorId } : { vendor: vendorVisibility }),
        },
        include: { vendor: { select: { id: true, businessName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.cashbackCampaign.findMany({
        where: {
          isActive: true,
          AND: [
            { OR: [{ startDate: null }, { startDate: { lte: now } }] },
            { OR: [{ endDate: null }, { endDate: { gte: now } }] },
            args.vendorId
              ? { OR: [{ vendorId: null }, { vendorId: args.vendorId }] }
              : { OR: [{ vendorId: null }, { vendor: vendorVisibility }] },
          ],
        },
        include: { vendor: { select: { id: true, businessName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    const coupons: PublicCouponOffer[] = couponRows
      .filter((c) => c.usageLimit === null || c.usedCount < c.usageLimit)
      .map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        description: c.description,
        discountType: c.discountType,
        discountValue: Number(c.discountValue),
        maxDiscount: c.maxDiscount != null ? Number(c.maxDiscount) : null,
        minOrderValue: c.minOrderValue != null ? Number(c.minOrderValue) : null,
        endDate: c.endDate,
        vendorId: c.vendorId,
        vendorName: c.vendor?.businessName ?? null,
        hasScope: c.productIds.length > 0 || c.categoryIds.length > 0 || c.brandNames.length > 0,
      }));

    const storeOffers: PublicStoreOffer[] = [
      ...promoRows.filter(promotionWithinUsage).map((p) => ({
        id: p.id,
        kind: 'vendor_promo' as const,
        name: p.name,
        badgeLabel: vendorPromoOfferBadge(p),
        type: p.type,
        description: null,
        vendorId: p.vendorId,
        vendorName: p.vendor.businessName,
        minOrderValue: p.minOrderValue != null ? Number(p.minOrderValue) : null,
        endDate: p.endDate,
      })),
      ...campaignRows
        .filter((c) => !c.totalBudget || Number(c.usedAmount) < Number(c.totalBudget))
        .map((c) => ({
          id: c.id,
          kind: 'cashback' as const,
          name: c.name,
          badgeLabel: cashbackOfferBadge(c),
          type: c.cashbackType,
          description: c.description,
          vendorId: c.vendorId,
          vendorName: c.vendor?.businessName ?? null,
          minOrderValue: c.minOrderValue != null ? Number(c.minOrderValue) : null,
          endDate: c.endDate,
        })),
    ];

    return { coupons, storeOffers };
  },

  /** Customer attaches their UPI ID to an unclaimed UPI cashback. */
  async claimUpi(entryId: string, userId: string, upiId: string): Promise<CashbackEntry> {
    const entry = await prisma.cashbackEntry.findFirst({
      where: { id: entryId, userId },
    });
    if (!entry) throw Errors.notFound('Cashback entry');
    if (entry.destination !== 'upi') {
      throw Errors.badRequest('This cashback is credited to your H1 Wallet — no UPI ID needed');
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
          `₹${amount.toLocaleString('en-IN')} has been credited to your H1 Wallet.`,
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

  // ── Phase C programs (welcome / first-order / referral / payout) ───────

  hasSuccessfulOrder(userId: string, opts?: { excludeOrderIds?: string[] }) {
    return programs.hasSuccessfulOrder(prisma, userId, opts);
  },

  autoFirstOrderCoupon(
    tx: Db,
    args: { userId: string; drafts: Array<{ subtotal: number; promoDiscount: number }>; createIfMissing: boolean },
  ) {
    return programs.autoFirstOrderCoupon(tx, args);
  },

  captureFirstOrderCouponGrant(
    tx: Db,
    args: { userId: string; couponId: string; orderId: string; checkoutGroupId: string },
  ) {
    return programs.captureFirstOrderCouponGrant(tx, args);
  },

  onOrdersBecameSuccessful(orderIds: string[]) {
    return programs.onOrdersBecameSuccessful(orderIds);
  },

  issueWelcomeForUser(userId: string) {
    return programs.issueWelcomeForUser(userId);
  },

  attributeReferralOnSignup(args: { referredUserId: string; token: string }) {
    return programs.attributeReferralOnSignup(args);
  },

  recordReferralClick(token: string) {
    return programs.recordReferralClick(token);
  },

  getMyReferral(userId: string, opts?: { originOverride?: string | null }) {
    return programs.getMyReferral(userId, opts);
  },

  getWelcomeOffer() {
    return programs.getWelcomeOffer();
  },
  upsertWelcomeOffer(data: Parameters<typeof programs.upsertWelcomeOffer>[0]) {
    return programs.upsertWelcomeOffer(data);
  },
  getFirstOrderOffer() {
    return programs.getFirstOrderOffer();
  },
  upsertFirstOrderOffer(data: Parameters<typeof programs.upsertFirstOrderOffer>[0]) {
    return programs.upsertFirstOrderOffer(data);
  },
  getReferralProgram() {
    return programs.getReferralProgram();
  },
  upsertReferralProgram(data: Parameters<typeof programs.upsertReferralProgram>[0]) {
    return programs.upsertReferralProgram(data);
  },

  createPayoutInvite(args: Parameters<typeof programs.createPayoutInvite>[0]) {
    return programs.createPayoutInvite(args);
  },
  getPayoutInvitePublic(token: string) {
    return programs.getPayoutInvitePublic(token);
  },
  claimPayoutInvite(args: Parameters<typeof programs.claimPayoutInvite>[0]) {
    return programs.claimPayoutInvite(args);
  },
};
