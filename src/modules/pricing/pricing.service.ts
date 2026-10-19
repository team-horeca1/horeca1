/**
 * Pricing resolver — V2.2 Phase 4 + Pricing workspace V2.
 *
 * Single source of truth for "what unit price should this customer see/pay
 * for this product?". Called from cart.addItem / cart.updateQuantity /
 * cart.getCart / order.create / order.subtotal — anywhere the legacy
 * code used `product.basePrice` or `priceSlab.price` directly — and, via
 * resolveCatalogPrices, from the public catalog APIs so listing/detail
 * pages show the customer THEIR price, not the base price.
 *
 * Priority chain (first match wins, falls through on no match):
 *
 *   1. PriceListAssignment.type='outlet'   matching customer.outletId
 *   2. PriceListAssignment.type='customer' matching customer.userId
 *                                      OR customer.businessAccountId
 *   3. PriceListAssignment.type='group'    matching CustomerGroup membership
 *   4. PriceListAssignment.type='credit_status' matching CreditWallet status
 *   5. PriceListAssignment.type='segment'  matching customer.tags
 *   6. PriceListAssignment.type='pincode'  matching customer.outletPincode
 *   7. PriceListAssignment.type='area'     matching outlet city/state
 *   8. PriceListAssignment.type='brand'    matching product.brand (id or name)
 *   9. Legacy VendorCustomer.priceListId
 *  10. VendorCustomerPrice (per-product per-customer override)
 *  11. PriceSlab matching the quantity tier
 *  12. Product.basePrice (final fallback)
 *
 * Hidden wins: if ANY eligible assigned list of this vendor has
 * PriceListItem.isExcluded for the product, the product is unavailable
 * for that customer (excluded: true) — even if another list prices it.
 *
 * Within whichever PriceList wins, the chosen PriceListItem decides
 * the math:
 *   • fixed | special — customPrice replaces basePrice
 *   • discount        — basePrice × (1 − discountPercent / 100)
 *   • scheme          — if quantity ≥ schemeMinQty, customPrice;
 *                        else fall through to the next priority level
 *
 * If the matched PriceList has NO PriceListItem for this product but a
 * non-zero global discountPercent, that global discount applies.
 *
 * The resolver takes no state. Caller passes context; tests can mock.
 */

import { Prisma } from '@prisma/client';
import type {
  PrismaClient,
  PriceListAssignment,
  PriceListItem,
} from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export interface CustomerContext {
  userId: string;
  businessAccountId: string | null;
  outletId: string | null;
  outletPincode: string | null;
  outletCity: string | null;
  outletState: string | null;
  tags: readonly string[];
}

export interface ResolveInput {
  productId: string;
  vendorId: string;
  quantity: number;
  customer: CustomerContext;
}

export type ResolutionSource =
  | 'pricelist:outlet'
  | 'pricelist:customer'
  | 'pricelist:group'
  | 'pricelist:credit_status'
  | 'pricelist:segment'
  | 'pricelist:pincode'
  | 'pricelist:area'
  | 'pricelist:brand'
  | 'pricelist:legacy-customer-mapping'
  | 'customer-product-override'
  | 'price-slab'
  | 'base-price'
  | 'excluded';

export interface ResolutionResult {
  unitPrice: Prisma.Decimal;
  source: ResolutionSource;
  priceListId?: string;
  priceListItemId?: string;
  /** Product is hidden from this customer for this vendor (Hidden wins). */
  excluded?: boolean;
  // B-5: present only when a 'scheme' pricelist item matched. The caller
  // (order.create) uses these to grant free goods ("buy X get Y free").
  schemeMinQty?: number | null;
  schemeFreeQty?: number | null;
}

/** Map CreditWallet status (+ workflow) to assignment creditStatus values. */
export function normalizeCreditStatus(
  status: string | null | undefined,
  workflowStatus?: string | null,
): string | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s === 'BLACKLISTED') return 'blacklisted';
  if (s === 'BLOCKED' || s === 'FROZEN') return 'blocked';
  if (s === 'SUSPENDED') return 'suspended';
  if (s === 'CANCELLED' || s === 'EXPIRED') return 'closed';
  if (s === 'ACTIVE') return 'active';
  // Fallback: workflow for pending-ish states
  const w = (workflowStatus ?? '').toUpperCase();
  if (w === 'IN_PROGRESS' || w === 'SANCTIONED') return 'pending';
  return s.toLowerCase();
}

// ── Shared chain internals ───────────────────────────────────────────
// Structural shapes (not full Prisma models) so both the single-product
// resolver and the batch catalog resolver can feed pre-fetched rows in.

type ItemShape = Pick<
  PriceListItem,
  | 'id' | 'productId' | 'customPrice' | 'pricingType' | 'discountPercent' | 'schemeMinQty' | 'schemeFreeQty'
  | 'validFrom' | 'validTo' | 'scheduledPrice' | 'scheduledFrom' | 'scheduledTo' | 'isExcluded'
> & { isLocked?: boolean; note?: string | null; history?: unknown };

interface ListShape {
  id: string;
  name?: string;
  discountPercent: Prisma.Decimal | number;
  items: ItemShape[];
}

type AssignmentShape = Pick<
  PriceListAssignment,
  'type' | 'userId' | 'businessAccountId' | 'outletId' | 'brandId' | 'groupId' | 'pincode' | 'area' | 'segment' | 'brandName' | 'creditStatus'
> & { priceList: ListShape };

interface ProductPricingInput {
  id: string;
  basePrice: Prisma.Decimal;
  /** product.brand lowercased, for free-text brand matching */
  brandLower: string | null;
  /** canonical brand ids from verified/auto brand mappings */
  mappedBrandIds: ReadonlySet<string>;
}

function assignmentEligible(
  a: AssignmentShape,
  customer: CustomerContext,
  product: ProductPricingInput,
  customerTags: ReadonlySet<string>,
  customerGroups: ReadonlySet<string>,
  creditStatus: string | null = null,
): boolean {
  switch (a.type) {
    case 'outlet':
      return !!customer.outletId && a.outletId === customer.outletId;
    case 'customer':
      return (
        (!!a.userId && a.userId === customer.userId) ||
        (!!a.businessAccountId && a.businessAccountId === customer.businessAccountId)
      );
    case 'group':
      return !!a.groupId && customerGroups.has(a.groupId);
    case 'credit_status':
      return !!a.creditStatus && !!creditStatus && a.creditStatus.toLowerCase() === creditStatus.toLowerCase();
    case 'segment':
      return !!a.segment && customerTags.has(a.segment.toLowerCase());
    case 'pincode':
      return !!a.pincode && a.pincode === customer.outletPincode;
    case 'area': {
      if (!a.area) return false;
      const needle = a.area.toLowerCase();
      return (
        customer.outletCity?.toLowerCase() === needle ||
        customer.outletState?.toLowerCase() === needle
      );
    }
    case 'brand':
      // P0-5: canonical brandId match (via the product's brand mapping),
      // with a free-text brand-name fallback for products not yet mapped.
      if (a.brandId && product.mappedBrandIds.has(a.brandId)) return true;
      if (a.brandName && product.brandLower) return a.brandName.toLowerCase() === product.brandLower;
      return false;
    default:
      return false;
  }
}

/** Collect eligible assignments; if any excludes the product → Hidden wins. */
function findExclusion(
  assignments: AssignmentShape[],
  customer: CustomerContext,
  product: ProductPricingInput,
  customerTags: ReadonlySet<string>,
  customerGroups: ReadonlySet<string>,
  creditStatus: string | null,
  now: Date,
): { priceListId: string; priceListItemId: string } | null {
  for (const a of assignments) {
    if (!assignmentEligible(a, customer, product, customerTags, customerGroups, creditStatus)) continue;
    const item = a.priceList.items.find(
      (i) => i.productId === product.id && i.isExcluded && itemIsLive(i, now),
    );
    if (item) return { priceListId: a.priceList.id, priceListItemId: item.id };
  }
  return null;
}

// Try to resolve via a single PriceList — picks this product's item,
// applies pricingType math, and returns a result. Null means this list
// doesn't yield a usable price (e.g. scheme miss) and the chain falls
// through to the next priority level.
function applyListForProduct(
  list: ListShape,
  productId: string,
  basePrice: Prisma.Decimal,
  quantity: number,
  sourceKey: ResolutionSource,
  now: Date = new Date(),
): ResolutionResult | null {
  // Excluded items are handled by findExclusion (Hidden wins); never price them here.
  const item = list.items.find((i) => i.productId === productId && !i.isExcluded && itemIsLive(i, now));
  if (item) {
    const result = applyPricingType(item, basePrice, quantity, now);
    if (result !== null) {
      return {
        unitPrice: result,
        source: sourceKey,
        priceListId: list.id,
        priceListItemId: item.id,
        // Surface scheme parameters so the order layer can grant free goods.
        ...(item.pricingType === 'scheme'
          ? { schemeMinQty: item.schemeMinQty, schemeFreeQty: item.schemeFreeQty }
          : {}),
      };
    }
    // scheme miss falls through to the next priority level
  }
  // No item for this product, but a global discountPercent might apply.
  if (Number(list.discountPercent) > 0) {
    const dp = new Prisma.Decimal(list.discountPercent);
    const discounted = basePrice.mul(new Prisma.Decimal(1).minus(dp.div(100)));
    return {
      unitPrice: round2(discounted),
      source: sourceKey,
      priceListId: list.id,
    };
  }
  return null;
}

const ORDERED_TYPES: Array<{ type: PriceListAssignment['type']; key: ResolutionSource }> = [
  { type: 'outlet',         key: 'pricelist:outlet' },
  { type: 'customer',       key: 'pricelist:customer' },
  { type: 'group',          key: 'pricelist:group' },
  { type: 'credit_status',  key: 'pricelist:credit_status' },
  { type: 'segment',        key: 'pricelist:segment' },
  { type: 'pincode',        key: 'pricelist:pincode' },
  { type: 'area',           key: 'pricelist:area' },
  { type: 'brand',          key: 'pricelist:brand' },
];

// Assignment-driven price lists (after Hidden-wins exclusion check).
function evaluateAssignmentChain(
  assignments: AssignmentShape[],
  customer: CustomerContext,
  product: ProductPricingInput,
  quantity: number,
  customerTags: ReadonlySet<string>,
  customerGroups: ReadonlySet<string>,
  creditStatus: string | null = null,
  now: Date = new Date(),
): ResolutionResult | null {
  for (const { type, key } of ORDERED_TYPES) {
    for (const a of assignments) {
      if (a.type !== type || !assignmentEligible(a, customer, product, customerTags, customerGroups, creditStatus)) continue;
      const r = applyListForProduct(a.priceList, product.id, product.basePrice, quantity, key, now);
      if (r) return r;
    }
  }
  return null;
}

// List-level validity window filter (shared by both resolvers). A list with
// null bounds is always live; otherwise `now` must be within [validFrom, validTo].
function priceListLiveWhere(now: Date) {
  return {
    AND: [
      { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
      { OR: [{ validTo: null }, { validTo: { gte: now } }] },
    ],
  };
}

const ITEM_SELECT = {
  id: true, productId: true, customPrice: true, pricingType: true,
  discountPercent: true, schemeMinQty: true, schemeFreeQty: true,
  validFrom: true, validTo: true,
  scheduledPrice: true, scheduledFrom: true, scheduledTo: true,
  isExcluded: true, isLocked: true, note: true, history: true,
} as const;

function itemIsLive(
  item: { validFrom?: Date | null; validTo?: Date | null },
  now: Date,
): boolean {
  if (item.validFrom && item.validFrom > now) return false;
  if (item.validTo && item.validTo < now) return false;
  return true;
}

/**
 * Resolve the unit price the customer should see/pay right now.
 *
 * Throws if the product doesn't exist or doesn't belong to vendorId.
 * Returns a Decimal so call sites can do exact arithmetic without
 * float drift.
 */
export async function resolveUnitPrice(
  input: ResolveInput,
  db: Db = defaultPrisma,
): Promise<ResolutionResult> {
  // Single round-trip: pull product + its brand + all candidate pricing
  // sources in parallel. We over-fetch (everything the priority chain
  // might consult) so we don't pay a second roundtrip per fallthrough.
  const now = new Date();
  const [product, vendorCustomer, customerProductOverride, slabs, assignments, groupMemberships, creditWallet] =
    await Promise.all([
      db.product.findFirst({
        where: { id: input.productId, vendorId: input.vendorId },
        select: {
          id: true, basePrice: true, brand: true,
          // P0-5: lets brand-targeted pricelists match by canonical brandId
          // (via the verified/auto brand mapping), not just the free-text brand.
          brandMappings: {
            where: { status: { in: ['verified', 'auto_mapped'] } },
            select: { brandId: true },
          },
        },
      }),
      db.vendorCustomer.findUnique({
        where: { vendorId_userId: { vendorId: input.vendorId, userId: input.customer.userId } },
        select: { priceListId: true, tags: true },
      }),
      db.vendorCustomerPrice.findUnique({
        where: {
          vendorId_customerId_productId: {
            vendorId: input.vendorId,
            customerId: input.customer.userId,
            productId: input.productId,
          },
        },
        select: { price: true },
      }),
      db.priceSlab.findMany({
        where: { productId: input.productId, vendorId: input.vendorId },
        orderBy: { minQty: 'desc' },
        select: { minQty: true, maxQty: true, price: true, promoPrice: true },
      }),
      // Every active, in-window assignment that COULD match this
      // customer/product pair. We filter in memory — way fewer rules in
      // play per vendor than products.
      db.priceListAssignment.findMany({
        where: {
          priceList: { vendorId: input.vendorId, isActive: true, ...priceListLiveWhere(now) },
          OR: [
            { type: 'outlet', outletId: input.customer.outletId ?? undefined },
            { type: 'customer', userId: input.customer.userId },
            ...(input.customer.businessAccountId
              ? [{ type: 'customer' as const, businessAccountId: input.customer.businessAccountId }]
              : []),
            { type: 'group' },
            { type: 'credit_status' },
            { type: 'segment' },
            ...(input.customer.outletPincode
              ? [{ type: 'pincode' as const, pincode: input.customer.outletPincode }]
              : []),
            { type: 'area' },
            { type: 'brand' },
          ],
        },
        include: {
          priceList: {
            select: {
              id: true,
              name: true,
              discountPercent: true,
              items: { where: { productId: input.productId }, select: ITEM_SELECT },
            },
          },
        },
      }),
      db.customerGroupMember.findMany({
        where: {
          group: { vendorId: input.vendorId },
          OR: [
            { userId: input.customer.userId },
            ...(input.customer.businessAccountId ? [{ businessAccountId: input.customer.businessAccountId }] : []),
          ],
        },
        select: { groupId: true },
      }),
      db.creditWallet.findFirst({
        where: { vendorId: input.vendorId, userId: input.customer.userId },
        select: { status: true, workflowStatus: true },
      }),
    ]);

  if (!product) {
    throw new Error(`resolveUnitPrice: product ${input.productId} not found under vendor ${input.vendorId}`);
  }

  const basePrice = product.basePrice;
  const productInput: ProductPricingInput = {
    id: product.id,
    basePrice,
    brandLower: product.brand?.toLowerCase() ?? null,
    mappedBrandIds: new Set((product.brandMappings ?? []).map((m) => m.brandId)),
  };
  const customerTags = new Set(
    [...(input.customer.tags ?? []), ...(vendorCustomer?.tags ?? [])].map((t) => t.toLowerCase()),
  );
  const customerGroups = new Set(groupMemberships.map((m) => m.groupId));
  const creditStatus = normalizeCreditStatus(creditWallet?.status, creditWallet?.workflowStatus);

  // Hidden wins — any eligible list that excludes this product hides it.
  const exclusion = findExclusion(assignments, input.customer, productInput, customerTags, customerGroups, creditStatus, now);
  if (exclusion) {
    return {
      unitPrice: round2(basePrice),
      source: 'excluded',
      excluded: true,
      priceListId: exclusion.priceListId,
      priceListItemId: exclusion.priceListItemId,
    };
  }

  // ── Assignment-driven price lists ──────────────────────────────────
  const chained = evaluateAssignmentChain(
    assignments, input.customer, productInput, input.quantity,
    customerTags, customerGroups, creditStatus, now,
  );
  if (chained) return chained;

  // 8. Legacy VendorCustomer.priceListId
  if (vendorCustomer?.priceListId) {
    const list = await db.priceList.findFirst({
      where: { id: vendorCustomer.priceListId, vendorId: input.vendorId, isActive: true, ...priceListLiveWhere(now) },
      select: {
        id: true,
        discountPercent: true,
        items: { where: { productId: input.productId }, select: ITEM_SELECT },
      },
    });
    if (list) {
      const r = applyListForProduct(list, input.productId, basePrice, input.quantity, 'pricelist:legacy-customer-mapping', now);
      if (r) return r;
    }
  }

  // 8. Per-product customer override (existing system)
  if (customerProductOverride) {
    return {
      unitPrice: round2(new Prisma.Decimal(customerProductOverride.price)),
      source: 'customer-product-override',
    };
  }

  // 9. Quantity slabs — pick the highest minQty ≤ requested quantity
  for (const slab of slabs) {
    if (input.quantity >= slab.minQty && (slab.maxQty == null || input.quantity <= slab.maxQty)) {
      const slabRate = slab.promoPrice != null ? slab.promoPrice : slab.price;
      return {
        unitPrice: round2(new Prisma.Decimal(slabRate)),
        source: 'price-slab',
      };
    }
  }

  // 10. Default fallback
  return { unitPrice: round2(basePrice), source: 'base-price' };
}

// ── Batch resolver for catalog surfaces ──────────────────────────────

export interface CatalogPrice {
  unitPrice: number;
  source: ResolutionSource;
  priceListId?: string;
  priceListItemId?: string;
  excluded?: boolean;
}

/**
 * Resolve customer-specific prices for MANY products in one pass —
 * built for listing/detail/search APIs where calling resolveUnitPrice
 * per product would N+1 the database.
 *
 * Evaluates chain levels 1–8 only (price lists + legacy mapping +
 * per-product override) at quantity 1. Products that fall through to
 * slabs/base price are simply absent from the returned map — the
 * catalog already renders those correctly.
 */
export async function resolveCatalogPrices(
  products: Array<{ id: string; vendorId: string; basePrice: Prisma.Decimal | number | string; brand?: string | null }>,
  customer: CustomerContext,
  db: Db = defaultPrisma,
): Promise<Map<string, CatalogPrice>> {
  const out = new Map<string, CatalogPrice>();
  if (products.length === 0) return out;

  const productIds = [...new Set(products.map((p) => p.id))];
  const vendorIds = [...new Set(products.map((p) => p.vendorId))];

  const now = new Date();
  const [assignments, vendorCustomers, overrides, brandMappings, groupMemberships, creditWallets] = await Promise.all([
    db.priceListAssignment.findMany({
      where: {
        priceList: { vendorId: { in: vendorIds }, isActive: true, ...priceListLiveWhere(now) },
        OR: [
          { type: 'outlet', outletId: customer.outletId ?? undefined },
          { type: 'customer', userId: customer.userId },
          ...(customer.businessAccountId
            ? [{ type: 'customer' as const, businessAccountId: customer.businessAccountId }]
            : []),
          { type: 'group' },
          { type: 'credit_status' },
          { type: 'segment' },
          ...(customer.outletPincode
            ? [{ type: 'pincode' as const, pincode: customer.outletPincode }]
            : []),
          { type: 'area' },
          { type: 'brand' },
        ],
      },
      include: {
        priceList: {
          select: {
            id: true,
            name: true,
            vendorId: true,
            discountPercent: true,
            items: { where: { productId: { in: productIds } }, select: ITEM_SELECT },
          },
        },
      },
    }),
    db.vendorCustomer.findMany({
      where: { vendorId: { in: vendorIds }, userId: customer.userId },
      select: { vendorId: true, priceListId: true, tags: true },
    }),
    db.vendorCustomerPrice.findMany({
      where: { vendorId: { in: vendorIds }, customerId: customer.userId, productId: { in: productIds } },
      select: { vendorId: true, productId: true, price: true },
    }),
    db.brandProductMapping.findMany({
      where: { distributorProductId: { in: productIds }, status: { in: ['verified', 'auto_mapped'] } },
      select: { distributorProductId: true, brandId: true },
    }),
    db.customerGroupMember.findMany({
      where: {
        group: { vendorId: { in: vendorIds } },
        OR: [
          { userId: customer.userId },
          ...(customer.businessAccountId ? [{ businessAccountId: customer.businessAccountId }] : []),
        ],
      },
      select: { groupId: true },
    }),
    db.creditWallet.findMany({
      where: { vendorId: { in: vendorIds }, userId: customer.userId },
      select: { vendorId: true, status: true, workflowStatus: true },
    }),
  ]);
  const customerGroups = new Set(groupMemberships.map((m) => m.groupId));
  const creditByVendor = new Map(
    creditWallets.map((w) => [w.vendorId!, normalizeCreditStatus(w.status, w.workflowStatus)]),
  );

  const vcByVendor = new Map(vendorCustomers.map((vc) => [vc.vendorId, vc]));

  // 7. Legacy lists — fetch all referenced ones in one query.
  const legacyListIds = vendorCustomers.flatMap((vc) => (vc.priceListId ? [vc.priceListId] : []));
  const legacyLists = legacyListIds.length
    ? await db.priceList.findMany({
        where: { id: { in: legacyListIds }, vendorId: { in: vendorIds }, isActive: true, ...priceListLiveWhere(now) },
        select: {
          id: true,
          vendorId: true,
          discountPercent: true,
          items: { where: { productId: { in: productIds } }, select: ITEM_SELECT },
        },
      })
    : [];
  const legacyById = new Map(legacyLists.map((l) => [l.id, l]));

  const assignmentsByVendor = new Map<string, AssignmentShape[]>();
  for (const a of assignments) {
    const vId = a.priceList.vendorId;
    const arr = assignmentsByVendor.get(vId) ?? [];
    arr.push(a);
    assignmentsByVendor.set(vId, arr);
  }

  const overrideByKey = new Map(overrides.map((o) => [`${o.vendorId}:${o.productId}`, o.price]));
  const brandIdsByProduct = new Map<string, Set<string>>();
  for (const m of brandMappings) {
    const set = brandIdsByProduct.get(m.distributorProductId) ?? new Set<string>();
    set.add(m.brandId);
    brandIdsByProduct.set(m.distributorProductId, set);
  }

  const quantity = 1; // catalog shows the entry price; cart re-resolves per real qty

  for (const p of products) {
    const vc = vcByVendor.get(p.vendorId);
    const customerTags = new Set(
      [...(customer.tags ?? []), ...(vc?.tags ?? [])].map((t) => t.toLowerCase()),
    );
    const productInput: ProductPricingInput = {
      id: p.id,
      basePrice: new Prisma.Decimal(p.basePrice),
      brandLower: p.brand?.toLowerCase() ?? null,
      mappedBrandIds: brandIdsByProduct.get(p.id) ?? new Set(),
    };
    const creditStatus = creditByVendor.get(p.vendorId) ?? null;
    const vendorAssignments = assignmentsByVendor.get(p.vendorId) ?? [];

    const exclusion = findExclusion(
      vendorAssignments, customer, productInput, customerTags, customerGroups, creditStatus, now,
    );
    if (exclusion) {
      out.set(p.id, {
        unitPrice: Number(productInput.basePrice),
        source: 'excluded',
        excluded: true,
        priceListId: exclusion.priceListId,
        priceListItemId: exclusion.priceListItemId,
      });
      continue;
    }

    let result = evaluateAssignmentChain(
      vendorAssignments,
      customer,
      productInput,
      quantity,
      customerTags,
      customerGroups,
      creditStatus,
      now,
    );

    if (!result && vc?.priceListId) {
      const list = legacyById.get(vc.priceListId);
      if (list && list.vendorId === p.vendorId) {
        result = applyListForProduct(list, p.id, productInput.basePrice, quantity, 'pricelist:legacy-customer-mapping', now);
      }
    }

    if (result) {
      out.set(p.id, {
        unitPrice: Number(result.unitPrice),
        source: result.source,
        priceListId: result.priceListId,
        priceListItemId: result.priceListItemId,
      });
      continue;
    }

    const override = overrideByKey.get(`${p.vendorId}:${p.id}`);
    if (override != null) {
      out.set(p.id, {
        unitPrice: Number(round2(new Prisma.Decimal(override))),
        source: 'customer-product-override',
      });
    }
  }

  return out;
}

// ── Pricing-type math ────────────────────────────────────────────────
// Returns null when the type doesn't yield a price (e.g. scheme miss
// when qty < schemeMinQty), so the caller can fall through.
function applyPricingType(
  item: Pick<PriceListItem, 'customPrice' | 'pricingType' | 'discountPercent' | 'schemeMinQty' | 'scheduledPrice' | 'scheduledFrom' | 'scheduledTo'>,
  basePrice: Prisma.Decimal,
  quantity: number,
  now: Date = new Date(),
): Prisma.Decimal | null {
  let customPrice = item.customPrice;
  if (
    item.scheduledPrice != null &&
    item.scheduledFrom &&
    item.scheduledTo &&
    item.scheduledFrom <= now &&
    item.scheduledTo >= now
  ) {
    customPrice = item.scheduledPrice;
  }

  switch (item.pricingType) {
    case 'fixed':
    case 'special':
      return customPrice != null ? round2(new Prisma.Decimal(customPrice)) : null;
    case 'discount': {
      if (item.discountPercent == null) return null;
      const dp = new Prisma.Decimal(item.discountPercent);
      return round2(basePrice.mul(new Prisma.Decimal(1).minus(dp.div(100))));
    }
    case 'scheme': {
      if (customPrice == null || item.schemeMinQty == null) return null;
      if (quantity < item.schemeMinQty) return null;
      return round2(new Prisma.Decimal(customPrice));
    }
    default:
      return null;
  }
}

function round2(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Free units granted by a scheme price-list item ("buy X get Y free"). */
export function computeSchemeFreeQty(
  quantity: number,
  schemeMinQty?: number | null,
  schemeFreeQty?: number | null,
): number {
  if (!schemeMinQty || !schemeFreeQty || quantity < schemeMinQty) return 0;
  return Math.floor(quantity / schemeMinQty) * schemeFreeQty;
}

/** Qty charged after scheme free goods (never negative). */
export function computeSchemeBilledQty(
  quantity: number,
  schemeMinQty?: number | null,
  schemeFreeQty?: number | null,
): number {
  return Math.max(0, quantity - computeSchemeFreeQty(quantity, schemeMinQty, schemeFreeQty));
}

// ── Why this price? ──────────────────────────────────────────────────

export interface ExplainLadderStep {
  level: string;
  matched: boolean;
  detail?: string;
  priceListId?: string;
  priceListName?: string;
}

export interface ExplainPriceResult {
  unitPrice: number;
  source: ResolutionSource;
  excluded: boolean;
  priceListId?: string;
  priceListItemId?: string;
  priceListName?: string;
  ladder: ExplainLadderStep[];
  cell?: {
    customPrice: number | null;
    pricingType: string;
    isLocked: boolean;
    note: string | null;
    lastHistory?: { date?: string; action?: string; user?: string; oldPrice?: number | null; newPrice?: number | null };
  };
}

/**
 * Full ladder for support / "Why this price?" — reuses the same chain as resolveUnitPrice.
 */
export async function explainPrice(
  input: ResolveInput,
  db: Db = defaultPrisma,
): Promise<ExplainPriceResult> {
  const resolved = await resolveUnitPrice(input, db);
  const now = new Date();

  const [assignments, creditWallet, groupMemberships, vendorCustomer, product] = await Promise.all([
    db.priceListAssignment.findMany({
      where: {
        priceList: { vendorId: input.vendorId, isActive: true, ...priceListLiveWhere(now) },
      },
      include: {
        priceList: {
          select: {
            id: true,
            name: true,
            discountPercent: true,
            items: { where: { productId: input.productId }, select: ITEM_SELECT },
          },
        },
      },
    }),
    db.creditWallet.findFirst({
      where: { vendorId: input.vendorId, userId: input.customer.userId },
      select: { status: true, workflowStatus: true },
    }),
    db.customerGroupMember.findMany({
      where: {
        group: { vendorId: input.vendorId },
        OR: [
          { userId: input.customer.userId },
          ...(input.customer.businessAccountId ? [{ businessAccountId: input.customer.businessAccountId }] : []),
        ],
      },
      select: { groupId: true },
    }),
    db.vendorCustomer.findUnique({
      where: { vendorId_userId: { vendorId: input.vendorId, userId: input.customer.userId } },
      select: { tags: true },
    }),
    db.product.findFirst({
      where: { id: input.productId, vendorId: input.vendorId },
      select: {
        id: true, basePrice: true, brand: true,
        brandMappings: {
          where: { status: { in: ['verified', 'auto_mapped'] } },
          select: { brandId: true },
        },
      },
    }),
  ]);

  const ladder: ExplainLadderStep[] = [];
  if (!product) {
    return {
      unitPrice: Number(resolved.unitPrice),
      source: resolved.source,
      excluded: !!resolved.excluded,
      ladder: [{ level: 'error', matched: false, detail: 'Product not found' }],
    };
  }

  const productInput: ProductPricingInput = {
    id: product.id,
    basePrice: product.basePrice,
    brandLower: product.brand?.toLowerCase() ?? null,
    mappedBrandIds: new Set((product.brandMappings ?? []).map((m) => m.brandId)),
  };
  const customerTags = new Set(
    [...(input.customer.tags ?? []), ...(vendorCustomer?.tags ?? [])].map((t) => t.toLowerCase()),
  );
  const customerGroups = new Set(groupMemberships.map((m) => m.groupId));
  const creditStatus = normalizeCreditStatus(creditWallet?.status, creditWallet?.workflowStatus);

  for (const { type, key } of ORDERED_TYPES) {
    const matches = assignments.filter(
      (a) => a.type === type && assignmentEligible(a, input.customer, productInput, customerTags, customerGroups, creditStatus),
    );
    if (matches.length === 0) {
      ladder.push({ level: key, matched: false });
      continue;
    }
    for (const a of matches) {
      const item = a.priceList.items.find((i) => i.productId === product.id && itemIsLive(i, now));
      ladder.push({
        level: key,
        matched: true,
        detail: item?.isExcluded
          ? 'Excluded (Hidden wins)'
          : item
            ? `Item ${item.pricingType}`
            : Number(a.priceList.discountPercent) > 0
              ? `List discount ${a.priceList.discountPercent}%`
              : 'No item for this SKU (falls through)',
        priceListId: a.priceList.id,
        priceListName: a.priceList.name,
      });
    }
  }

  let cell: ExplainPriceResult['cell'];
  if (resolved.priceListItemId) {
    const item = assignments
      .flatMap((a) => a.priceList.items.map((i) => ({ i, name: a.priceList.name })))
      .find((x) => x.i.id === resolved.priceListItemId);
    if (item) {
      const hist = Array.isArray(item.i.history) ? item.i.history[0] as Record<string, unknown> | undefined : undefined;
      cell = {
        customPrice: item.i.customPrice != null ? Number(item.i.customPrice) : null,
        pricingType: item.i.pricingType,
        isLocked: !!item.i.isLocked,
        note: item.i.note ?? null,
        lastHistory: hist
          ? {
              date: typeof hist.date === 'string' ? hist.date : undefined,
              action: typeof hist.action === 'string' ? hist.action : undefined,
              user: typeof hist.user === 'string' ? hist.user : undefined,
              oldPrice: typeof hist.oldPrice === 'number' ? hist.oldPrice : null,
              newPrice: typeof hist.newPrice === 'number' ? hist.newPrice : null,
            }
          : undefined,
      };
    }
  }

  const winningName = assignments.find((a) => a.priceList.id === resolved.priceListId)?.priceList.name;

  return {
    unitPrice: Number(resolved.unitPrice),
    source: resolved.source,
    excluded: !!resolved.excluded,
    priceListId: resolved.priceListId,
    priceListItemId: resolved.priceListItemId,
    priceListName: winningName,
    ladder,
    cell,
  };
}

/**
 * Pure chain evaluator for unit tests — no DB. Cross-vendor independence is
 * the caller's responsibility (pass only one vendor's assignments).
 */
export function resolveFromPreloaded(args: {
  productId: string;
  basePrice: number;
  quantity: number;
  customer: CustomerContext;
  assignments: AssignmentShape[];
  customerTags?: string[];
  customerGroups?: string[];
  creditStatus?: string | null;
  brandLower?: string | null;
  mappedBrandIds?: string[];
  now?: Date;
}): ResolutionResult {
  const now = args.now ?? new Date();
  const productInput: ProductPricingInput = {
    id: args.productId,
    basePrice: new Prisma.Decimal(args.basePrice),
    brandLower: args.brandLower ?? null,
    mappedBrandIds: new Set(args.mappedBrandIds ?? []),
  };
  const tags = new Set((args.customerTags ?? args.customer.tags).map((t) => t.toLowerCase()));
  const groups = new Set(args.customerGroups ?? []);
  const credit = args.creditStatus ?? null;

  const exclusion = findExclusion(args.assignments, args.customer, productInput, tags, groups, credit, now);
  if (exclusion) {
    return {
      unitPrice: round2(productInput.basePrice),
      source: 'excluded',
      excluded: true,
      priceListId: exclusion.priceListId,
      priceListItemId: exclusion.priceListItemId,
    };
  }

  const chained = evaluateAssignmentChain(
    args.assignments, args.customer, productInput, args.quantity, tags, groups, credit, now,
  );
  if (chained) return chained;
  return { unitPrice: round2(productInput.basePrice), source: 'base-price' };
}
