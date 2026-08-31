import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { Prisma, type OrderStatus } from '@prisma/client';
import { emitEvent } from '@/events/emitter';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { FulfillmentRouterService } from '@/modules/fulfillment/fulfillmentRouter.service';
import { Errors } from '@/middleware/errorHandler';
import {
  createAccrual as createCommissionAccrual,
  findApplicableRule as findApplicableCommissionRule,
} from '@/modules/commission/commission.service';
import {
  resolveUnitPrice,
  computeSchemeBilledQty,
  type CustomerContext,
} from '@/modules/pricing/pricing.service';
import { getDeliveryGeo } from '@/lib/deliveryLocation';
import { CartService, type CartContext } from '@/modules/cart/cart.service';
import { creditWalletService } from '@/modules/credit/creditWallet.service';
import { creditVendorOnDelivery } from '@/modules/vendor/vendorSettlement.service';
import {
  promotionService,
  evaluateVendorPromo,
  evaluateBxgyForCart,
  couponSuppressesVendorPromos,
  type CheckoutDraftItem,
  type CouponApplication,
} from '@/modules/promotion/promotion.service';
import {
  ORDER_EVENT_ACTIONS,
  recordOrderEvent,
  recordOrderEvents,
} from '@/modules/order/order-events';

// Payment methods that draw on a CreditWallet. 'h1_wallet'/'wallet' uses the platform
// (vendor-less) wallet; the rest use the order's vendor credit line.
const CREDIT_PAYMENTS = ['credit', 'vendor_credit', 'h1_wallet', 'wallet', 'discco'];
const isCreditPayment = (m: string | null | undefined): boolean => !!m && CREDIT_PAYMENTS.includes(m);

function creditVendorIdForOrder(
  paymentMethod: string | null | undefined,
  vendorId: string,
): string | null {
  return paymentMethod === 'h1_wallet' || paymentMethod === 'wallet' ? null : vendorId;
}

/** Reserve→outstanding on deliver; release on cancel. Idempotent. */
async function applyCreditLedgerForStatus(
  tx: Prisma.TransactionClient,
  order: { id: string; userId: string; vendorId: string; paymentMethod: string | null },
  status: string,
) {
  if (!isCreditPayment(order.paymentMethod)) return;
  const creditVendorId = creditVendorIdForOrder(order.paymentMethod, order.vendorId);
  if (status === 'cancelled') {
    await creditWalletService.reverseOrderDebit(order.id, order.userId, creditVendorId, tx);
  } else if (status === 'delivered') {
    await creditWalletService.convertReservedToOutstanding(order.id, order.userId, creditVendorId, tx);
  }
}

// VendorCustomer.status values that stop the customer from placing orders with
// that vendor. Scoped per relationship — other vendors are unaffected.
const BLOCKED_CUSTOMER_STATUSES = ['blocked', 'suspended'];

/** Map checkout payment methods to VendorCustomer.allowedPaymentModes values. */
function normalizeVendorPaymentMode(method: string): string {
  if (method === 'vendor_credit' || method === 'discco') return 'credit';
  if (method === 'wallet' || method === 'h1_wallet' || method === 'online' || method === 'bank_transfer') return 'prepaid';
  if (method === 'po_number') return 'cheque';
  return method;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Dynamic import — breaks OrderService ↔ FulfilmentService module cycle. */
async function ensureFulfilmentForOrder(
  orderId: string,
  opts?: { actorId?: string | null; tx?: Prisma.TransactionClient },
) {
  const { fulfilmentService } = await import('@/modules/fulfillment/fulfillment.service');
  return fulfilmentService.ensureForOrder(orderId, opts);
}

/** Catalog identity fields snapshotted onto each OrderItem at write time.
 *  Keep in sync with ORDER_ITEM_SNAPSHOT_FIELDS in order-snapshots.ts */
type OrderLineSnapshot = {
  productSku: string | null;
  hsn: string | null;
  brand: string | null;
  packSize: string | null;
  categoryName: string | null;
  taxPercent: Prisma.Decimal;
};

type OrderLineCreate = OrderLineSnapshot & {
  productId: string;
  productName: string;
  quantity: number;
  /** Accepted qty at place (auto-accept); defaults to ordered qty for live orders. */
  fulfilledQty: number;
  unitPrice: number | Prisma.Decimal;
  totalPrice: number;
};

function snapshotFromProduct(product: {
  sku: string | null;
  hsn: string | null;
  brand: string | null;
  packSize: string | null;
  taxPercent: Prisma.Decimal | number;
  category?: { name: string | null } | null;
}): OrderLineSnapshot {
  return {
    productSku: product.sku,
    hsn: product.hsn,
    brand: product.brand,
    packSize: product.packSize,
    categoryName: product.category?.name ?? null,
    taxPercent: new Prisma.Decimal(product.taxPercent ?? 0),
  };
}

interface VendorOrderInput {
  vendorId: string;
  items: Array<{ productId: string; quantity: number }>;
  deliverySlotId?: string;
  notes?: string;
}

interface CreateOrderInput {
  vendorOrders: VendorOrderInput[];
  paymentMethod: string;
  // Draft PO (Req 7): persist the order(s) without reserving stock, running the
  // credit check, or clearing the cart. Submitted later via submitDraft().
  saveDraft?: boolean;
  // Promo Engine Phase 1 — one coupon per checkout (stacking Rule 1) and
  // optional prepaid-wallet redemption (Rule 6). Both rejected on drafts.
  couponCode?: string;
  useWallet?: boolean;
}

/**
 * V2.2: every order is stamped with the user's active BusinessAccount + Outlet
 * and a snapshot of the outlet's address at order time. Cart lookup is also
 * scoped to (userId, businessAccountId, outletId).
 */
export interface OrderContext {
  userId: string;
  businessAccountId: string;
  outletId: string;
}

export class OrderService {
  private inventoryService = new InventoryService();
  private cartService = new CartService();
  private fulfillmentRouter = new FulfillmentRouterService();

  /** Resolve warehouse outlet for inventory ops on an existing order. */
  private async orderFulfillmentOutletId(
    order: { fulfillmentOutletId: string | null; vendorId: string },
    tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  ): Promise<string> {
    if (order.fulfillmentOutletId) return order.fulfillmentOutletId;
    const db = tx ?? prisma;
    const vendor = await db.vendor.findUnique({
      where: { id: order.vendorId },
      select: { businessAccountId: true },
    });
    if (!vendor) throw Errors.notFound('Vendor');
    const ba = await db.businessAccount.findUnique({
      where: { id: vendor.businessAccountId },
      select: { primaryOutletId: true },
    });
    if (ba?.primaryOutletId) return ba.primaryOutletId;
    const first = await db.outlet.findFirst({
      where: { businessAccountId: vendor.businessAccountId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!first) throw Errors.badRequest('Vendor has no fulfillment outlet');
    return first.id;
  }

  async create(ctx: OrderContext, input: CreateOrderInput) {
    const { userId, businessAccountId, outletId } = ctx;

    // Snapshot the outlet address once outside the transaction — same value
    // is written onto every PO in this checkout batch.
    const outlet = await prisma.outlet.findFirst({
      where: { id: outletId, businessAccountId },
      select: {
        name: true, addressLine: true, flatInfo: true, landmark: true,
        city: true, state: true, pincode: true, latitude: true, longitude: true,
        placeId: true, requiresAddressUpdate: true,
      },
    });
    if (!outlet) throw Errors.badRequest('Active outlet not found for this account');
    if (outlet.requiresAddressUpdate) {
      throw Errors.badRequest('Active outlet needs its address completed before placing orders');
    }
    const deliveryAddressSnapshot: Prisma.InputJsonValue = { ...outlet };
    // Location pricing follows the chosen "Deliver to" address (server-trusted
    // via the address id cookie), so the order total matches the cart/storefront.
    const deliveryGeo = await getDeliveryGeo(userId);
    const isDraft = input.saveDraft === true;
    const created = await prisma.$transaction(async (tx) => {
      const orders: Array<{
        id: string;
        orderNumber: string;
        vendorId: string;
        totalAmount: unknown;
        items: Array<{ productId: string; quantity: number }>;
      }> = [];

      // ── PASS 1 — validate + price every vendor order. No writes happen
      // here: the coupon and wallet allocations (below) need ALL subtotals
      // before any order row can be created with its final totals.
      interface PreparedOrder {
        vo: VendorOrderInput;
        itemDetails: OrderLineCreate[];
        draftItems: CheckoutDraftItem[];
        stockItems: Array<{ productId: string; quantity: number }>;
        subtotal: number;
        promoDiscount: number;
        appliedPromoId: string | null;
        appliedBxgyPromoIds: string[];
        salespersonId: string | null;
        fulfillmentOutletId: string;
      }
      const prepared: PreparedOrder[] = [];

      // Rule 3 — a coupon that cannot club with vendor promos must skip BXGY
      // free lines AND pct/flat before they are merged into the PO. Peek the
      // flag first so an invalid code still fails later in applyCouponToCheckout
      // without having already written free goods / usage.
      const suppressVendorPromosEarly =
        !isDraft && input.couponCode
          ? await couponSuppressesVendorPromos(tx, input.couponCode)
          : false;

      for (const vo of input.vendorOrders) {
        const fulfillmentOutletId = await this.fulfillmentRouter.resolveFulfillmentOutlet({
          vendorId: vo.vendorId,
          deliveryPincode: outlet.pincode,
          deliveryLat: outlet.latitude ?? null,
          deliveryLng: outlet.longitude ?? null,
          items: vo.items,
        });

        // 1. Validate stock (skipped for drafts — no reservation happens yet)
        if (!isDraft) {
          const stockCheck = await this.inventoryService.bulkCheck(vo.items, fulfillmentOutletId, tx);
          const outOfStock = stockCheck.find((s) => !s.available);
          if (outOfStock) {
            throw Errors.outOfStock(outOfStock.productName, outOfStock.qtyAvailable);
          }
        }

        // 2. Validate MOV
        const vendor = await tx.vendor.findUnique({ where: { id: vo.vendorId } });
        if (!vendor) throw Errors.notFound('Vendor');

        // 2b. Validate delivery slot — must belong to this vendor, be active, and not past cutoff
        if (vo.deliverySlotId) {
          const slot = await tx.deliverySlot.findUnique({ where: { id: vo.deliverySlotId } });
          if (!slot || slot.vendorId !== vo.vendorId || !slot.isActive) {
            throw Errors.badRequest('Invalid delivery slot for this vendor');
          }
          // Slots are stored as IST wall-clock (HH:mm). Force the comparison into
          // IST so a UTC server doesn't accept orders past the Mumbai cutoff —
          // or refuse them too early.
          const istParts = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Kolkata',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).formatToParts(new Date());
          const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
          const istDay = dayMap[istParts.find(p => p.type === 'weekday')?.value ?? ''] ?? -1;
          const istHour = Number(istParts.find(p => p.type === 'hour')?.value ?? 0);
          const istMin = Number(istParts.find(p => p.type === 'minute')?.value ?? 0);
          if (!isDraft && istDay === slot.dayOfWeek) {
            const [hh, mm] = slot.cutoffTime.split(':').map(Number);
            const nowMins = istHour * 60 + istMin;
            const cutoffMins = (hh || 0) * 60 + (mm || 0);
            if (nowMins >= cutoffMins) {
              throw Errors.badRequest(`Cutoff time ${slot.cutoffTime} IST for this slot has passed`);
            }
          }
        }

        // 3. V2.2 Phase 4 — single resolver call per line replaces the
        //    inline base→slab→customer-pricelist chain. The resolver
        //    honours every assignment type + the four pricing types in
        //    one place; cart and storefront use the same function so
        //    the price the customer sees IS the price the order writes.
        //    Also fetch salespersonId from VendorCustomer for Phase 1
        //    commission attribution at order creation time.
        const vendorCustomer = await tx.vendorCustomer.findUnique({
          where: { vendorId_userId: { vendorId: vo.vendorId, userId } },
          select: { salespersonId: true, tags: true, allowedPaymentModes: true, status: true },
        });

        // CRM block/suspend is per supplier-customer relationship: a customer
        // blocked by one vendor can still order from every other vendor.
        if (!isDraft && vendorCustomer && BLOCKED_CUSTOMER_STATUSES.includes(vendorCustomer.status)) {
          throw Errors.forbidden(
            `Ordering from ${vendor.businessName} is currently unavailable for your account. Please contact the vendor.`,
          );
        }

        if (!isDraft && vendorCustomer?.allowedPaymentModes?.length) {
          const normalized = normalizeVendorPaymentMode(input.paymentMethod);
          if (!vendorCustomer.allowedPaymentModes.includes(normalized)) {
            throw Errors.badRequest(
              `Payment method "${input.paymentMethod}" is not allowed for your account with this vendor`,
            );
          }
        }
        const customerCtx: CustomerContext = {
          userId,
          businessAccountId,
          outletId,
          outletPincode: deliveryGeo?.pincode ?? outlet.pincode,
          outletCity: deliveryGeo?.city ?? outlet.city,
          outletState: deliveryGeo?.state ?? outlet.state,
          tags: vendorCustomer?.tags ?? [],
        };

        // 4. Calculate subtotal (GST-inclusive gross prices — DB prices are ex-GST taxable rates)
        let subtotal = 0;
        const itemDetails = [];
        const draftItems: CheckoutDraftItem[] = [];
        const stockItems: Array<{ productId: string; quantity: number }> = [];
        const appliedBxgyPromoIds = new Set<string>();

        const scopedCart = await tx.cart.findFirst({
          where: { userId, businessAccountId, outletId },
          select: { items: { select: { productId: true, unitPrice: true } } },
        });
        const cartUnitPriceByProduct = new Map(
          (scopedCart?.items ?? []).map((ci) => [ci.productId, Number(ci.unitPrice)]),
        );

        const paidItemsForBxgy: Array<{ productId: string; quantity: number; unitPrice: number }> = [];

        for (const item of vo.items) {
          const cartUnit = cartUnitPriceByProduct.get(item.productId);
          const isPromoFreeLine = cartUnit === 0;

          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: {
              id: true,
              name: true,
              sku: true,
              hsn: true,
              packSize: true,
              taxPercent: true,
              creditEligible: true,
              categoryId: true,
              category: { select: { name: true } },
              brand: true,
            },
          });
          if (!product) throw Errors.notFound('Product');

          // DiSCCO is locked on for every SKU. Do not block checkout on creditEligible.

          if (isPromoFreeLine) {
            itemDetails.push({
              productId: item.productId,
              productName: product.name,
              ...snapshotFromProduct(product),
              quantity: item.quantity,
              fulfilledQty: 0,
              unitPrice: 0,
              totalPrice: 0,
            });
            stockItems.push({ productId: item.productId, quantity: item.quantity });
            continue;
          }

          const resolved = await resolveUnitPrice(
            { productId: item.productId, vendorId: vo.vendorId, quantity: item.quantity, customer: customerCtx },
            tx,
          );
          const taxableUnitPrice = Number(resolved.unitPrice);
          const taxPercent = Number(product.taxPercent) || 0;
          const grossUnitPrice = Math.round(taxableUnitPrice * (1 + taxPercent / 100) * 100) / 100;

          const billedQty = computeSchemeBilledQty(
            item.quantity,
            resolved.schemeMinQty,
            resolved.schemeFreeQty,
          );
          const totalPrice = Math.round(grossUnitPrice * billedQty * 100) / 100;
          subtotal += totalPrice;

          itemDetails.push({
            productId: item.productId,
            productName: product.name,
            ...snapshotFromProduct(product),
            quantity: item.quantity,
            fulfilledQty: 0,
            unitPrice: grossUnitPrice,
            totalPrice,
          });
          draftItems.push({
            productId: item.productId,
            categoryId: product.categoryId,
            brand: product.brand,
            lineTotal: totalPrice,
          });
          stockItems.push({ productId: item.productId, quantity: item.quantity });
          paidItemsForBxgy.push({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: taxableUnitPrice,
          });
        }

        const bxgyResults = suppressVendorPromosEarly
          ? []
          : await evaluateBxgyForCart(tx, vo.vendorId, paidItemsForBxgy);
        for (const bxgy of bxgyResults) {
          if (bxgy.freeUnits <= 0) continue;
          appliedBxgyPromoIds.add(bxgy.promotionId);

          if (bxgy.sameProduct) {
            const existingFree = itemDetails.find(
              (d) => d.productId === bxgy.getProductId && Number(d.unitPrice) === 0,
            );
            if (!existingFree) {
              const freeProduct = await tx.product.findUnique({
                where: { id: bxgy.getProductId },
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  hsn: true,
                  packSize: true,
                  taxPercent: true,
                  category: { select: { name: true } },
                  brand: true,
                },
              });
              if (freeProduct) {
                itemDetails.push({
                  productId: bxgy.getProductId,
                  productName: freeProduct.name,
                  ...snapshotFromProduct(freeProduct),
                  quantity: bxgy.freeUnits,
                  fulfilledQty: 0,
                  unitPrice: 0,
                  totalPrice: 0,
                });
                stockItems.push({ productId: bxgy.getProductId, quantity: bxgy.freeUnits });
              }
            }
          }
        }

        if (!isDraft && subtotal < Number(vendor.minOrderValue)) {
          throw Errors.belowMOV(vendor.businessName, Number(vendor.minOrderValue), subtotal);
        }

        // 4a. Pick the best active vendor promotion (pct_discount or flat_discount)
        //     via the shared helper — the SAME selection the checkout preview
        //     uses, so the previewed Store Offer equals what we deduct here.
        //     Usage is counted in PASS 2 — a non-stacking coupon (Rule 3) may
        //     suppress pct/flat AND BXGY, and a suppressed promo must not consume a use.
        const vendorPromo = suppressVendorPromosEarly
          ? null
          : await evaluateVendorPromo(tx, vo.vendorId, subtotal);
        const promoDiscount = vendorPromo?.discount ?? 0;
        const appliedPromoId = vendorPromo?.promotionId ?? null;

        prepared.push({
          vo,
          itemDetails,
          draftItems,
          stockItems,
          subtotal,
          promoDiscount,
          appliedPromoId,
          appliedBxgyPromoIds: Array.from(appliedBxgyPromoIds),
          salespersonId: vendorCustomer?.salespersonId ?? null,
          fulfillmentOutletId,
        });
      }

      // ── Coupon (Rule 1: ONE code per checkout). Validated + allocated over
      // the prepared orders; a coupon that can't be clubbed with vendor promos
      // (Rule 3) suppresses them for this checkout — without consuming a use.
      // First-order coupon-type offers auto-apply when the shopper did not
      // enter a code (they still lose it if they pick a different coupon).
      let couponApp: CouponApplication | null = null;
      let firstOrderCouponId: string | null = null;
      const couponDrafts = prepared.map((p) => ({
        vendorId: p.vo.vendorId,
        subtotal: p.subtotal,
        promoDiscount: p.promoDiscount,
        items: p.draftItems,
      }));
      let couponCode = input.couponCode ?? null;
      if (!isDraft && !couponCode) {
        const auto = await promotionService.autoFirstOrderCoupon(tx, {
          userId,
          drafts: couponDrafts,
          createIfMissing: true,
        });
        if (auto) {
          couponCode = auto.code;
          firstOrderCouponId = auto.couponId;
        }
      }
      if (!isDraft && couponCode) {
        couponApp = await promotionService.applyCouponToCheckout(tx, {
          code: couponCode,
          userId,
          drafts: couponDrafts,
        });
        if (couponApp.suppressVendorPromos) {
          for (const p of prepared) {
            p.promoDiscount = 0;
            p.appliedPromoId = null;
          }
        }
      }

      // ── Prepaid Rewards Wallet redemption (Rule 6). Applied AFTER discounts.
      // A coupon with stacksWithWallet=false ignores useWallet. Online payments
      // keep a ₹1 combined floor because Razorpay cannot charge ₹0.
      let walletShares: number[] = prepared.map(() => 0);
      const couponBlocksWallet = !!couponApp && !couponApp.coupon.stacksWithWallet;
      if (!isDraft && input.useWallet && !couponBlocksWallet) {
        const balance = await promotionService.getWalletBalance(tx, userId);
        const payables = prepared.map((p, i) =>
          round2(Math.max(0, p.subtotal - p.promoDiscount - (couponApp?.perOrder[i] ?? 0))),
        );
        const reserveMin = input.paymentMethod === 'online' ? 1 : 0;
        walletShares = promotionService.allocateWallet(balance, payables, reserveMin);
      }

      // ── PASS 2 — create the order rows with final totals + side-effects.
      const checkoutGroupId = randomUUID();
      const redemptionRows: Array<{ orderId: string; amount: number }> = [];
      const walletRows: Array<{ orderId: string; amount: number }> = [];

      for (let i = 0; i < prepared.length; i++) {
        const p = prepared[i];
        const vo = p.vo;
        const couponShare = couponApp?.perOrder[i] ?? 0;
        const walletApplied = walletShares[i] ?? 0;
        const totalAmount = round2(
          Math.max(0, p.subtotal - p.promoDiscount - couponShare - walletApplied),
        );

        // Vendor promo consumes a use only when it actually applies.
        if (p.appliedPromoId) {
          await tx.promotion.update({
            where: { id: p.appliedPromoId },
            data: { usageCount: { increment: 1 } },
          });
        }
        for (const bxgyPromoId of p.appliedBxgyPromoIds ?? []) {
          await tx.promotion.update({
            where: { id: bxgyPromoId },
            data: { usageCount: { increment: 1 } },
          });
        }

        // Unique per PO in a multi-vendor checkout (Date.now() alone can collide in a tight loop).
        const orderNumber = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}-${String(orders.length + 1).padStart(2, '0')}`;

        // Create order — salespersonId snapshotted from VendorCustomer
        // (null if no rep assigned) so commission attribution survives later
        // reassignment of the customer's salesperson.
        const order = await tx.order.create({
          data: {
            orderNumber,
            userId,
            vendorId: vo.vendorId,
            businessAccountId,
            outletId,
            fulfillmentOutletId: p.fulfillmentOutletId,
            deliveryAddressSnapshot,
            status: isDraft ? 'draft' : 'pending',
            // Section 7 Platform Rule: live orders are auto-accepted at place.
            acceptedAt: isDraft ? null : new Date(),
            subtotal: p.subtotal,
            promoDiscount: p.promoDiscount,
            promotionId: p.appliedPromoId,
            couponId: couponShare > 0 ? couponApp!.coupon.id : null,
            couponCode: couponShare > 0 ? couponApp!.coupon.code : null,
            couponDiscount: couponShare,
            walletApplied,
            checkoutGroupId,
            totalAmount,
            paymentMethod: input.paymentMethod,
            deliverySlotId: vo.deliverySlotId,
            notes: vo.notes,
            salespersonId: p.salespersonId,
            items: { create: p.itemDetails },
          },
          include: { items: true },
        });

        if (!isDraft) {
          await recordOrderEvents(tx, [
            {
              orderId: order.id,
              actorId: userId,
              action: ORDER_EVENT_ACTIONS.CREATED,
              toStatus: 'pending',
              payload: { orderNumber, totalAmount },
            },
            {
              orderId: order.id,
              actorId: userId,
              action: ORDER_EVENT_ACTIONS.AUTO_ACCEPTED,
              fromStatus: 'pending',
              toStatus: 'pending',
              payload: { reason: 'platform_auto_accept' },
            },
          ]);
          // S8 — create Fulfilment aggregate on accept (idempotent).
          await ensureFulfilmentForOrder(order.id, { actorId: userId, tx });
        }

        // Reserve inventory (drafts reserve nothing until submitted)
        if (!isDraft) await this.inventoryService.reserveStock(p.stockItems, p.fulfillmentOutletId, tx);

        // Reserve credit for credit orders (outstanding converts on delivery).
        // debitWallet validates wallet status, repayment-mode reuse rules, and
        // available limit — all inside this tx, so any failure rolls back the
        // whole order. Skipped when discounts + wallet cover the full amount.
        if (!isDraft && isCreditPayment(input.paymentMethod) && totalAmount > 0) {
          const creditVendorId = (input.paymentMethod === 'h1_wallet' || input.paymentMethod === 'wallet') ? null : vo.vendorId;
          await creditWalletService.debitWallet(userId, creditVendorId, totalAmount, order.id, tx);
          await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'paid' } });
        }

        if (couponShare > 0) redemptionRows.push({ orderId: order.id, amount: couponShare });
        if (walletApplied > 0) walletRows.push({ orderId: order.id, amount: walletApplied });

        orders.push(order);
      }

      // Cashback (Rule 5) — one source for the entire checkout, after every PO
      // exists so the winning entry can attach to a real orderId.
      if (!isDraft) {
        await promotionService.evaluateCashbackForCheckout(tx, {
          userId,
          checkoutGroupId,
          pos: orders.map((order, i) => {
            const p = prepared[i];
            const couponShare = couponApp?.perOrder[i] ?? 0;
            return {
              orderId: order.id,
              vendorId: p.vo.vendorId,
              base: round2(Math.max(0, p.subtotal - p.promoDiscount - couponShare)),
            };
          }),
          couponApplied: !!couponApp,
          couponBlocksCashback: !!couponApp && !couponApp.coupon.stacksWithCashback,
          walletApplied: walletRows.length > 0,
        });
      }

      // ── Persist the coupon use (one per checkout) + the wallet debit ledger.
      if (couponApp && redemptionRows.length > 0) {
        await promotionService.finalizeCouponRedemptions(tx, {
          couponId: couponApp.coupon.id,
          userId,
          checkoutGroupId,
          rows: redemptionRows,
        });
        if (firstOrderCouponId && firstOrderCouponId === couponApp.coupon.id) {
          await promotionService.captureFirstOrderCouponGrant(tx, {
            userId,
            couponId: couponApp.coupon.id,
            orderId: orders[0]!.id,
            checkoutGroupId,
          });
        }
      }
      if (walletRows.length > 0) {
        await promotionService.debitWalletForCheckout(tx, { userId, rows: walletRows });
      }

      // 7. Clear only cart lines for vendors that were placed (partial checkout
      // must not wipe unselected vendor groups).
      const cart = await tx.cart.findFirst({
        where: { userId, businessAccountId, outletId },
        select: { id: true },
      });
      if (cart) {
        const placedVendorIds = [...new Set(input.vendorOrders.map((v) => v.vendorId))];
        await tx.cartItem.deleteMany({
          where: { cartId: cart.id, vendorId: { in: placedVendorIds } },
        });
      }

      // 8. Emit events after transaction (not for drafts — nothing to notify yet)
      if (!isDraft) {
        setImmediate(() => {
          for (const order of orders) {
            emitEvent('OrderCreated', {
              orderId: order.id,
              orderNumber: order.orderNumber,
              userId,
              vendorId: order.vendorId,
              totalAmount: Number(order.totalAmount),
              items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
            });
          }
        });
      }

      return { orders };
    }, { isolationLevel: 'Serializable' });

    if (!isDraft && created.orders.length > 0) {
      try {
        await promotionService.onOrdersBecameSuccessful(created.orders.map((o) => o.id));
      } catch (err) {
        console.error('[Order] Program issuance after checkout failed:', err);
      }
    }
    return created;
  }

  async list(userId: string, options: { status?: string; vendorId?: string; cursor?: string; limit?: number }) {
    const { status, vendorId, cursor, limit = 20 } = options;
    const where: Prisma.OrderWhereInput = { userId, customerDeleted: false };
    if (status) where.status = status as OrderStatus;
    if (vendorId) where.vendorId = vendorId;

    const orders = await prisma.order.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: { select: { id: true, businessName: true, slug: true, logoUrl: true } },
        items: {
          include: {
            product: { select: { imageUrl: true, images: true } },
          },
        },
        review: { select: { rating: true, comment: true, createdAt: true } },
      },
    });

    const hasMore = orders.length > limit;
    if (hasMore) orders.pop();

    return {
      orders,
      pagination: { next_cursor: hasMore ? orders[orders.length - 1]?.id : null, has_more: hasMore },
    };
  }

  async getById(orderId: string, userId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId, customerDeleted: false },
      include: {
        items: {
          include: {
            product: { select: { imageUrl: true, images: true } },
          },
        },
        vendor: { select: { id: true, businessName: true, slug: true, logoUrl: true } },
        payments: true,
        review: { select: { rating: true, comment: true, createdAt: true } },
      },
    });
    if (!order) throw Errors.notFound('Order');
    return order;
  }

  async delete(orderId: string, userId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
    });
    if (!order) throw Errors.notFound('Order');

    if (order.status === 'draft') {
      await prisma.order.delete({
        where: { id: orderId },
      });
      return { deleted: true, status: 'draft' };
    } else {
      await prisma.order.update({
        where: { id: orderId },
        data: { customerDeleted: true },
      });
      return { deleted: true, status: order.status };
    }
  }

  /**
   * Repeat order (Phase 5) — re-add a past order's exact items to the caller's
   * active outlet cart at CURRENT resolved prices. Products that are gone /
   * unapproved / inactive are skipped and reported rather than silently
   * dropped, so the customer knows exactly what carried over. Quantities are
   * clamped up to each product's current minimum order quantity.
   *
   * cartCtx is the caller's resolved (userId, businessAccountId, outletId) —
   * the same context the cart routes use, so the reorder lands in whichever
   * outlet cart is active. We re-verify the order belongs to the user.
   */
  async reorder(orderId: string, cartCtx: CartContext) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: cartCtx.userId },
      select: {
        id: true,
        vendorId: true,
        items: { select: { productId: true, productName: true, quantity: true } },
      },
    });
    if (!order) throw Errors.notFound('Order');

    // One round-trip for current purchasability + minOrderQty of every item.
    const productIds = order.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, isActive: true, approvalStatus: true, minOrderQty: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const added: Array<{ productId: string; name: string; quantity: number }> = [];
    const skipped: Array<{ productId: string; name: string; reason: string }> = [];

    for (const item of order.items) {
      const product = byId.get(item.productId);
      const name = product?.name ?? item.productName;
      if (!product) {
        skipped.push({ productId: item.productId, name, reason: 'No longer available' });
        continue;
      }
      if (product.approvalStatus !== 'approved' || !product.isActive) {
        skipped.push({ productId: item.productId, name, reason: 'Not currently available for purchase' });
        continue;
      }
      const quantity = Math.max(item.quantity, product.minOrderQty);
      try {
        await this.cartService.addItem(cartCtx, item.productId, order.vendorId, quantity);
        added.push({ productId: item.productId, name, quantity });
      } catch (err) {
        skipped.push({
          productId: item.productId,
          name,
          reason: err instanceof Error ? err.message : 'Could not add to cart',
        });
      }
    }

    return { vendorId: order.vendorId, added, skipped };
  }

  // ── Draft PO + Operations controls (Req 7) ─────────────────────────────
  // modify / split / reassign operate ONLY on `pending` orders. At pending,
  // stock is reserved (so we adjust reservations) but no credit debit or
  // commission accrual has run yet — keeping these edits ledger-safe.

  /** Build a pricing CustomerContext from an order + its snapshotted outlet address. */
  private buildCustomerCtx(
    order: { userId: string; businessAccountId: string; outletId: string; deliveryAddressSnapshot: Prisma.JsonValue },
    tags: string[],
  ): CustomerContext {
    const snap = (order.deliveryAddressSnapshot ?? {}) as { pincode?: string | null; city?: string | null; state?: string | null };
    return {
      userId: order.userId,
      businessAccountId: order.businessAccountId,
      outletId: order.outletId,
      outletPincode: snap.pincode ?? null,
      outletCity: snap.city ?? null,
      outletState: snap.state ?? null,
      tags,
    };
  }

  /** Resolve gross unit price + line total (with GST + scheme free-goods) for one line. */
  private async priceLine(
    tx: Prisma.TransactionClient,
    vendorId: string,
    productId: string,
    quantity: number,
    customer: CustomerContext,
  ): Promise<{ grossUnitPrice: number; totalPrice: number }> {
    const product = await tx.product.findUnique({ where: { id: productId }, select: { taxPercent: true } });
    const resolved = await resolveUnitPrice({ productId, vendorId, quantity, customer }, tx);
    const taxableUnitPrice = Number(resolved.unitPrice);
    const taxPercent = Number(product?.taxPercent) || 0;
    const grossUnitPrice = Math.round(taxableUnitPrice * (1 + taxPercent / 100) * 100) / 100;
    const billedQty = computeSchemeBilledQty(
      quantity,
      resolved.schemeMinQty,
      resolved.schemeFreeQty,
    );
    return { grossUnitPrice, totalPrice: Math.round(grossUnitPrice * billedQty * 100) / 100 };
  }

  /** Submit a draft PO: draft → pending. Re-validates stock/MOV/credit, reserves, notifies. */
  async submitDraft(orderId: string, ctx: OrderContext, paymentMethod?: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, userId: ctx.userId, status: 'draft' },
        include: { items: true },
      });
      if (!order) throw Errors.notFound('Draft order');

      // Allow caller to override the payment method stored on the draft
      // (drafts are saved with a placeholder; user picks real method on submit).
      const effectivePaymentMethod = paymentMethod ?? order.paymentMethod;

      const items = order.items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
      const fulfillOutlet = await this.orderFulfillmentOutletId(order, tx);
      const stock = await this.inventoryService.bulkCheck(items, fulfillOutlet, tx);
      const oos = stock.find((s) => !s.available);
      if (oos) throw Errors.outOfStock(oos.productName, oos.qtyAvailable);

      const vendor = await tx.vendor.findUnique({ where: { id: order.vendorId } });
      if (!vendor) throw Errors.notFound('Vendor');
      if (Number(order.subtotal) < Number(vendor.minOrderValue)) {
        throw Errors.belowMOV(vendor.businessName, Number(vendor.minOrderValue), Number(order.subtotal));
      }

      // Same CRM block gate as createOrder — a draft saved before the vendor
      // blocked the customer must not slip through at submit time.
      const vendorCustomer = await tx.vendorCustomer.findUnique({
        where: { vendorId_userId: { vendorId: order.vendorId, userId: ctx.userId } },
        select: { status: true },
      });
      if (vendorCustomer && BLOCKED_CUSTOMER_STATUSES.includes(vendorCustomer.status)) {
        throw Errors.forbidden(
          `Ordering from ${vendor.businessName} is currently unavailable for your account. Please contact the vendor.`,
        );
      }

      await this.inventoryService.reserveStock(items, fulfillOutlet, tx);

      // Submitting a credit draft debits the wallet now (validates limit + mode).
      const creditPaid =
        isCreditPayment(effectivePaymentMethod) && Number(order.totalAmount) > 0;
      if (creditPaid) {
        const creditVendorId = (effectivePaymentMethod === 'h1_wallet' || effectivePaymentMethod === 'wallet') ? null : order.vendorId;
        await creditWalletService.debitWallet(ctx.userId, creditVendorId, Number(order.totalAmount), order.id, tx);
      }

      // Auto-accept timestamp only — fulfilledQty stays 0 until ship (backorder-safe).
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'pending',
          acceptedAt: new Date(),
          paymentMethod: effectivePaymentMethod,
          ...(creditPaid ? { paymentStatus: 'paid' } : {}),
        },
      });

      await recordOrderEvents(tx, [
        {
          orderId: order.id,
          actorId: ctx.userId,
          action: ORDER_EVENT_ACTIONS.CREATED,
          fromStatus: 'draft',
          toStatus: 'pending',
          payload: { orderNumber: order.orderNumber, via: 'submit_draft' },
        },
        {
          orderId: order.id,
          actorId: ctx.userId,
          action: ORDER_EVENT_ACTIONS.AUTO_ACCEPTED,
          fromStatus: 'pending',
          toStatus: 'pending',
          payload: { reason: 'platform_auto_accept' },
        },
      ]);
      // S8 — create Fulfilment aggregate on accept (idempotent).
      await ensureFulfilmentForOrder(order.id, { actorId: ctx.userId, tx });

      // Promo Engine — drafts skip cashback at save time; evaluate once for
      // this PO (its own checkout group) now that the order is real.
      const checkoutGroupId = order.checkoutGroupId ?? randomUUID();
      if (!order.checkoutGroupId) {
        await tx.order.update({ where: { id: order.id }, data: { checkoutGroupId } });
      }
      await promotionService.evaluateCashbackForCheckout(tx, {
        userId: ctx.userId,
        checkoutGroupId,
        pos: [{
          orderId: order.id,
          vendorId: order.vendorId,
          base: round2(Math.max(0, Number(order.subtotal) - Number(order.promoDiscount) - Number(order.couponDiscount))),
        }],
        couponApplied: Number(order.couponDiscount) > 0,
        couponBlocksCashback: false,
        walletApplied: Number(order.walletApplied) > 0,
      });

      setImmediate(() => emitEvent('OrderCreated', {
        orderId: order.id, orderNumber: order.orderNumber, userId: ctx.userId,
        vendorId: order.vendorId, totalAmount: Number(order.totalAmount), items,
      }));
      return updated;
    }, { isolationLevel: 'Serializable' });
  }

  /** Ops: change line quantities on a pending order (0 removes the line). Re-prices + re-balances reservation. */
  async modifyOrderQuantities(orderId: string, vendorId: string, lines: Array<{ itemId: string; quantity: number }>) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, vendorId, status: 'pending' }, include: { items: true } });
      if (!order) throw Errors.badRequest('Order not found or not editable (only pending orders can be modified).');
      const vendor = await tx.vendor.findUnique({ where: { id: vendorId } });
      if (!vendor) throw Errors.notFound('Vendor');
      const vc = await tx.vendorCustomer.findUnique({ where: { vendorId_userId: { vendorId, userId: order.userId } }, select: { tags: true } });
      const customer = this.buildCustomerCtx(order, vc?.tags ?? []);

      const itemMap = new Map(order.items.map((i) => [i.id, i]));
      const newQty = new Map(order.items.map((i) => [i.id, i.quantity]));
      for (const line of lines) {
        if (!itemMap.has(line.itemId)) throw Errors.badRequest(`Item ${line.itemId} not in this order`);
        if (line.quantity < 0) throw Errors.badRequest('Quantity cannot be negative');
        newQty.set(line.itemId, line.quantity);
      }

      const reserveDeltas: Array<{ productId: string; quantity: number }> = [];
      const releaseDeltas: Array<{ productId: string; quantity: number }> = [];
      let subtotal = 0;

      for (const item of order.items) {
        const q = newQty.get(item.id) ?? item.quantity;
        const delta = q - item.quantity;
        if (delta > 0) reserveDeltas.push({ productId: item.productId, quantity: delta });
        else if (delta < 0) releaseDeltas.push({ productId: item.productId, quantity: -delta });
        if (q === 0) { await tx.orderItem.delete({ where: { id: item.id } }); continue; }
        const priced = await this.priceLine(tx, vendorId, item.productId, q, customer);
        await tx.orderItem.update({ where: { id: item.id }, data: { quantity: q, unitPrice: priced.grossUnitPrice, totalPrice: priced.totalPrice } });
        subtotal += priced.totalPrice;
      }

      if (subtotal <= 0) throw Errors.badRequest('Order would have no items left. Cancel the order instead.');
      // MOV is a customer placement-time gate (enforced in createOrder + submitDraft).
      // It is intentionally NOT re-enforced here: once an order is accepted, ops/vendor
      // edits (quantity adjustments, partial fulfilment) must not be blocked because the
      // revised total dipped below the minimum.

      if (reserveDeltas.length) {
        const fulfillOutlet = await this.orderFulfillmentOutletId(order, tx);
        const check = await this.inventoryService.bulkCheck(reserveDeltas, fulfillOutlet, tx);
        const oos = check.find((s) => !s.available);
        if (oos) throw Errors.outOfStock(oos.productName, oos.qtyAvailable);
        await this.inventoryService.reserveStock(reserveDeltas, fulfillOutlet, tx);
      }
      if (releaseDeltas.length) {
        const fulfillOutlet = await this.orderFulfillmentOutletId(order, tx);
        await this.inventoryService.releaseStock(releaseDeltas, fulfillOutlet, tx);
      }

      return tx.order.update({
        where: { id: orderId },
        // Coupon + wallet amounts stay fixed when ops edit quantities; the
        // payable just shrinks/grows around them (clamped at 0).
        data: { subtotal, totalAmount: Math.max(0, subtotal - Number(order.promoDiscount) - Number(order.couponDiscount) - Number(order.walletApplied)) },
      });
    }, { isolationLevel: 'Serializable' });
  }

  /** Ops: split selected quantities off a pending order into a new sibling PO (same vendor/outlet/customer). */
  async splitOrder(orderId: string, vendorId: string, lines: Array<{ itemId: string; quantity: number }>) {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, vendorId, status: 'pending' }, include: { items: true } });
      if (!order) throw Errors.badRequest('Order not found or not splittable (only pending orders).');
      if (!lines.length) throw Errors.badRequest('Specify at least one line to split off.');

      const itemMap = new Map(order.items.map((i) => [i.id, i]));
      for (const line of lines) {
        const item = itemMap.get(line.itemId);
        if (!item) throw Errors.badRequest(`Item ${line.itemId} not in this order`);
        if (line.quantity <= 0 || line.quantity > item.quantity) throw Errors.badRequest(`Invalid split quantity for "${item.productName}"`);
      }

      let parentSubtotal = 0;
      let childSubtotal = 0;
      const childItems: OrderLineCreate[] = [];

      for (const item of order.items) {
        const moveQty = lines.find((l) => l.itemId === item.id)?.quantity ?? 0;
        const keepQty = item.quantity - moveQty;
        const unit = Number(item.unitPrice);
        if (moveQty > 0) {
          const childTotal = Math.round(unit * moveQty * 100) / 100;
          childItems.push({
            productId: item.productId,
            productName: item.productName,
            productSku: item.productSku,
            hsn: item.hsn,
            brand: item.brand,
            packSize: item.packSize,
            categoryName: item.categoryName,
            taxPercent: item.taxPercent ?? new Prisma.Decimal(0),
            quantity: moveQty,
            fulfilledQty: moveQty,
            unitPrice: item.unitPrice,
            totalPrice: childTotal,
          });
          childSubtotal += childTotal;
        }
        if (keepQty > 0) {
          const parentTotal = Math.round(unit * keepQty * 100) / 100;
          await tx.orderItem.update({
            where: { id: item.id },
            data: { quantity: keepQty, fulfilledQty: keepQty, totalPrice: parentTotal },
          });
          parentSubtotal += parentTotal;
        } else {
          await tx.orderItem.delete({ where: { id: item.id } });
        }
      }
      if (!childItems.length) throw Errors.badRequest('Nothing to split off.');
      if (parentSubtotal <= 0) throw Errors.badRequest('Cannot split off the entire order — modify quantities instead.');

      const orderNumber = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}S`;
      const child = await tx.order.create({
        data: {
          orderNumber, userId: order.userId, vendorId, businessAccountId: order.businessAccountId,
          outletId: order.outletId,
          fulfillmentOutletId: order.fulfillmentOutletId,
          deliveryAddressSnapshot: order.deliveryAddressSnapshot as Prisma.InputJsonValue,
          status: 'pending',
          acceptedAt: order.acceptedAt ?? new Date(),
          subtotal: childSubtotal, totalAmount: childSubtotal,
          paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus,
          deliverySlotId: order.deliverySlotId, salespersonId: order.salespersonId,
          notes: order.notes, items: { create: childItems },
        },
      });
      await recordOrderEvents(tx, [
        {
          orderId: child.id,
          actorId: order.userId,
          action: ORDER_EVENT_ACTIONS.CREATED,
          toStatus: 'pending',
          payload: { orderNumber, via: 'split', parentId: orderId },
        },
        {
          orderId: child.id,
          actorId: order.userId,
          action: ORDER_EVENT_ACTIONS.AUTO_ACCEPTED,
          fromStatus: 'pending',
          toStatus: 'pending',
          payload: { reason: 'platform_auto_accept', via: 'split' },
        },
      ]);
      // S8 — child order is auto-accepted; ensure its own Fulfilment row.
      await ensureFulfilmentForOrder(child.id, { actorId: order.userId, tx });
      await tx.order.update({
        where: { id: orderId },
        // Coupon discount + wallet redemption stay on the parent — the child
        // is a fresh PO with plain totals (split is an internal ops action).
        // Cashback also stays with the parent: its pending entry recomputes
        // against the reduced parent subtotal on delivery. The child does NOT
        // earn separate campaign cashback — re-evaluating would risk
        // double-counting per-user limits and bypassing a coupon's
        // stacksWithCashback=false block. (Deliberate Phase-1 behaviour.)
        data: { subtotal: parentSubtotal, totalAmount: Math.max(0, parentSubtotal - Number(order.promoDiscount) - Number(order.couponDiscount) - Number(order.walletApplied)) },
      });
      // Reservation total is unchanged — the same units now span two orders.
      return {
        parentId: orderId,
        childId: child.id,
        childOrderNumber: child.orderNumber,
        userId: order.userId,
        vendorId,
        totalAmount: childSubtotal,
        items: childItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      };
    }, { isolationLevel: 'Serializable' });

    setImmediate(() => {
      emitEvent('OrderCreated', {
        orderId: result.childId,
        orderNumber: result.childOrderNumber,
        userId: result.userId,
        vendorId: result.vendorId,
        totalAmount: result.totalAmount,
        items: result.items,
      });
    });

    return { parentId: result.parentId, childId: result.childId, childOrderNumber: result.childOrderNumber };
  }

  /** Ops: reassign a pending order to a different vendor. Remaps each line to the new vendor's product with the same master SKU, re-prices, and moves reservations. */
  async reassignOrderVendor(orderId: string, fromVendorId: string, newVendorId: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, vendorId: fromVendorId, status: 'pending' }, include: { items: true } });
      if (!order) throw Errors.badRequest('Order not found or not reassignable (only pending orders).');
      if (newVendorId === fromVendorId) throw Errors.badRequest('Order already belongs to this vendor.');
      const newVendor = await tx.vendor.findUnique({ where: { id: newVendorId } });
      if (!newVendor || !newVendor.isActive) throw Errors.badRequest('Target vendor not found or inactive.');

      const oldProducts = await tx.product.findMany({
        where: { id: { in: order.items.map((i) => i.productId) } },
        select: { id: true, masterProductId: true },
      });
      const masterByOld = new Map(oldProducts.map((p) => [p.id, p.masterProductId]));
      const vc = await tx.vendorCustomer.findUnique({ where: { vendorId_userId: { vendorId: newVendorId, userId: order.userId } }, select: { tags: true, salespersonId: true } });
      const customer = this.buildCustomerCtx(order, vc?.tags ?? []);

      const releaseOld: Array<{ productId: string; quantity: number }> = [];
      const reserveNew: Array<{ productId: string; quantity: number }> = [];
      let subtotal = 0;

      for (const item of order.items) {
        const masterId = masterByOld.get(item.productId);
        if (!masterId) throw Errors.badRequest(`"${item.productName}" has no master SKU — cannot reassign.`);
        const newProduct = await tx.product.findFirst({
          where: { vendorId: newVendorId, masterProductId: masterId, isActive: true, approvalStatus: 'approved' },
          select: {
            id: true,
            name: true,
            sku: true,
            hsn: true,
            brand: true,
            packSize: true,
            taxPercent: true,
            category: { select: { name: true } },
          },
        });
        if (!newProduct) throw Errors.badRequest(`Target vendor does not carry "${item.productName}".`);
        const priced = await this.priceLine(tx, newVendorId, newProduct.id, item.quantity, customer);
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            productId: newProduct.id,
            productName: newProduct.name,
            ...snapshotFromProduct(newProduct),
            unitPrice: priced.grossUnitPrice,
            totalPrice: priced.totalPrice,
          },
        });
        subtotal += priced.totalPrice;
        releaseOld.push({ productId: item.productId, quantity: item.quantity });
        reserveNew.push({ productId: newProduct.id, quantity: item.quantity });
      }

      if (subtotal < Number(newVendor.minOrderValue)) throw Errors.belowMOV(newVendor.businessName, Number(newVendor.minOrderValue), subtotal);

      const fulfillOutlet = await this.orderFulfillmentOutletId(order, tx);
      const newFulfillOutlet = await this.fulfillmentRouter.resolveFulfillmentOutlet({
        vendorId: newVendorId,
        deliveryPincode: (order.deliveryAddressSnapshot as { pincode?: string })?.pincode ?? null,
        deliveryLat: (order.deliveryAddressSnapshot as { latitude?: number })?.latitude ?? null,
        deliveryLng: (order.deliveryAddressSnapshot as { longitude?: number })?.longitude ?? null,
        items: reserveNew,
      });

      const check = await this.inventoryService.bulkCheck(reserveNew, newFulfillOutlet, tx);
      const oos = check.find((s) => !s.available);
      if (oos) throw Errors.outOfStock(oos.productName, oos.qtyAvailable);
      await this.inventoryService.releaseStock(releaseOld, fulfillOutlet, tx);
      await this.inventoryService.reserveStock(reserveNew, newFulfillOutlet, tx);

      const totalAmount = Math.max(0, subtotal - Number(order.promoDiscount) - Number(order.couponDiscount) - Number(order.walletApplied));

      // Per-vendor credit debits are tied to the original vendor — move the ledger
      // when ops reroute the PO (platform H1 wallet is vendor-agnostic, so skip).
      const isVendorCredit =
        isCreditPayment(order.paymentMethod)
        && order.paymentMethod !== 'h1_wallet'
        && order.paymentMethod !== 'wallet';
      if (isVendorCredit) {
        await creditWalletService.reverseOrderDebit(orderId, order.userId, fromVendorId, tx);
        if (totalAmount > 0) {
          await creditWalletService.debitWallet(order.userId, newVendorId, totalAmount, orderId, tx);
        }
      }

      // Delivery slot belonged to the old vendor — clear it; the new vendor's slot is re-picked later.
      return tx.order.update({
        where: { id: orderId },
        data: {
          vendorId: newVendorId,
          fulfillmentOutletId: newFulfillOutlet,
          salespersonId: vc?.salespersonId ?? null,
          deliverySlotId: null,
          subtotal,
          totalAmount,
        },
      });
    }, { isolationLevel: 'Serializable' });
  }

  /**
   * Generate + dispatch a delivery OTP (Phase 5). Auto-called (idempotently)
   * when an order first becomes `shipped` via `ensureDeliveryOtpIfNeeded`;
   * vendors can also regenerate via `generateDeliveryOtp` / POST delivery-otp.
   * The customer receives a 4-digit code over SMS (same MSG91 OTP API as login)
   * and reads it to the agent on the magic-link / delivered transition.
   *
   * Scoped to the order's vendor. Allowed while the order is open
   * (pending through shipped) — never for delivered/cancelled/returned.
   * SMS is sent directly (login OTP path) so local/dev works without
   * REGISTER_EVENT_LISTENERS. Event still fans out email/in_app when listeners are on.
   */
  async issueDeliveryOtp(
    orderId: string,
    vendorId: string,
    options: { emitEvent?: boolean } = {},
  ): Promise<{ otp: string; orderNumber: string; userId: string; expiresAt: Date }> {
    const { emitEvent: shouldEmit = false } = options;

    const order = await prisma.order.findFirst({
      where: { id: orderId, vendorId },
      select: {
        id: true,
        userId: true,
        orderNumber: true,
        status: true,
        user: { select: { phone: true } },
      },
    });
    if (!order) throw Errors.notFound('Order');

    const blocked = ['delivered', 'returned', 'cancelled'];
    if (blocked.includes(order.status as string)) {
      throw Errors.badRequest(`A delivery OTP cannot be issued for a closed order (current status: ${order.status}).`);
    }

    const otp = String(Math.floor(1000 + Math.random() * 9000));
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await prisma.order.update({
      where: { id: orderId },
      data: { deliveryOtp: otp, deliveryOtpExpiresAt: expiresAt, deliveryOtpVerifiedAt: null },
    });

    if (shouldEmit) {
      // Same MSG91 Verify OTP path as login — not the notification flow template.
      if (order.user.phone) {
        try {
          const { sendPhoneOtp } = await import('@/lib/providers/otpSms');
          await sendPhoneOtp(order.user.phone, otp);
        } catch (err) {
          console.error('[Order] Delivery OTP SMS failed:', err);
          throw Errors.badRequest(
            err instanceof Error
              ? err.message
              : 'Failed to send delivery OTP SMS. Try again.',
          );
        }
      } else {
        console.warn(
          `[Order] Delivery OTP for ${order.orderNumber}: customer has no phone — code stored only`,
        );
      }

      emitEvent('OrderDeliveryOtp', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        vendorId,
        otp,
      });
    }

    return { otp, orderNumber: order.orderNumber, userId: order.userId, expiresAt };
  }

  /** Vendor-triggered resend — requires in-flight status (not pending). */
  async generateDeliveryOtp(orderId: string, vendorId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, vendorId },
      select: { status: true },
    });
    if (!order) throw Errors.notFound('Order');

    const allowed = ['confirmed', 'processing', 'ready_for_dispatch', 'shipped'];
    if (!allowed.includes(order.status as string)) {
      throw Errors.badRequest(`A delivery OTP can only be generated for an in-progress order (current status: ${order.status}).`);
    }

    const result = await this.issueDeliveryOtp(orderId, vendorId, { emitEvent: true });
    return { sent: true, expiresAt: result.expiresAt };
  }

  /**
   * Ensure an active delivery OTP exists (idempotent).
   * Skips when a non-expired OTP is already on the order so mid-delivery
   * re-calls (and Fulfilment dispatch retries) do not rotate the code.
   */
  async ensureDeliveryOtpIfNeeded(orderId: string, vendorId: string): Promise<void> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, vendorId },
      select: { deliveryOtp: true, deliveryOtpExpiresAt: true },
    });
    if (!order) return;

    const now = Date.now();
    const hasActive =
      !!order.deliveryOtp &&
      (!order.deliveryOtpExpiresAt || order.deliveryOtpExpiresAt.getTime() > now);
    if (hasActive) return;

    await this.issueDeliveryOtp(orderId, vendorId, { emitEvent: true });
  }

  /**
   * Reschedule an order's delivery (Phase 5). Vendor changes the delivery slot
   * and/or date while the order is still in flight. A supplied slot must belong
   * to this vendor. Closed orders (delivered/returned/cancelled) are locked.
   */
  async updateDelivery(
    orderId: string,
    vendorId: string,
    input: { deliverySlotId?: string | null; deliveryDate?: string | null },
  ) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, vendorId },
      select: { id: true, status: true },
    });
    if (!order) throw Errors.notFound('Order');
    if (['delivered', 'returned', 'cancelled'].includes(order.status as string)) {
      throw Errors.badRequest(`Cannot reschedule a ${order.status} order.`);
    }

    if (input.deliverySlotId) {
      const slot = await prisma.deliverySlot.findFirst({
        where: { id: input.deliverySlotId, vendorId },
        select: { id: true },
      });
      if (!slot) throw Errors.badRequest('Delivery slot not found for this vendor');
    }

    const data: { deliverySlotId?: string | null; deliveryDate?: Date | null } = {};
    if (input.deliverySlotId !== undefined) data.deliverySlotId = input.deliverySlotId;
    if (input.deliveryDate !== undefined) data.deliveryDate = input.deliveryDate ? new Date(input.deliveryDate) : null;

    return prisma.order.update({
      where: { id: orderId },
      data,
      select: { id: true, deliverySlotId: true, deliveryDate: true },
    });
  }

  /**
   * Apply a catalog substitute on a pending order line:
   * - zero original fulfilledQty
   * - create a new OrderItem for the substitute (snapshotted + priced)
   * - rebalance reservation + totals
   * - emit item.substituted OrderEvent
   */
  async applySubstitute(
    orderId: string,
    vendorId: string,
    itemId: string,
    substituteProductId: string,
    actorId?: string | null,
  ) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, vendorId, status: 'pending' },
        include: { items: true },
      });
      if (!order) throw Errors.notFound('Order or order is not pending');

      const item = order.items.find((i) => i.id === itemId);
      if (!item) throw Errors.badRequest('Item does not belong to this order');

      const originalProduct = await tx.product.findFirst({
        where: { id: item.productId, vendorId },
        select: { id: true, substituteIds: true },
      });
      if (!originalProduct?.substituteIds?.includes(substituteProductId)) {
        throw Errors.badRequest('Selected product is not a configured substitute for this line');
      }

      const subProduct = await tx.product.findFirst({
        where: { id: substituteProductId, vendorId, isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          hsn: true,
          brand: true,
          packSize: true,
          taxPercent: true,
          categoryId: true,
          category: { select: { name: true } },
        },
      });
      if (!subProduct) throw Errors.notFound('Substitute product');

      const qty = item.fulfilledQty > 0 ? item.fulfilledQty : item.quantity;
      if (qty <= 0) throw Errors.badRequest('Nothing left to substitute on this line');

      const vc = await tx.vendorCustomer.findUnique({
        where: { vendorId_userId: { vendorId, userId: order.userId } },
        select: { tags: true },
      });
      const customer = this.buildCustomerCtx(order, vc?.tags ?? []);
      const resolved = await resolveUnitPrice(
        { productId: substituteProductId, vendorId, quantity: qty, customer },
        tx,
      );
      const taxPercent = Number(subProduct.taxPercent) || 0;
      const grossUnit = Math.round(Number(resolved.unitPrice) * (1 + taxPercent / 100) * 100) / 100;
      const totalPrice = Math.round(grossUnit * qty * 100) / 100;

      const fulfillOutlet = await this.orderFulfillmentOutletId(order, tx);
      // Release original reserved qty, reserve substitute
      await this.inventoryService.releaseStock(
        [{ productId: item.productId, quantity: qty }],
        fulfillOutlet,
        tx,
      );
      await this.inventoryService.reserveStock(
        [{ productId: substituteProductId, quantity: qty }],
        fulfillOutlet,
        tx,
      );

      await tx.orderItem.update({
        where: { id: item.id },
        data: { fulfilledQty: 0 },
      });

      const newItem = await tx.orderItem.create({
        data: {
          orderId,
          productId: substituteProductId,
          productName: subProduct.name,
          ...snapshotFromProduct(subProduct),
          quantity: qty,
          fulfilledQty: qty,
          unitPrice: grossUnit,
          totalPrice,
        },
      });

      const allItems = await tx.orderItem.findMany({ where: { orderId } });
      let newSubtotal = 0;
      for (const row of allItems) {
        const f = row.fulfilledQty > 0 ? row.fulfilledQty : 0;
        if (f <= 0) continue;
        newSubtotal += Math.round(Number(row.totalPrice) * (f / row.quantity) * 100) / 100;
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          isPartial: true,
          subtotal: newSubtotal,
          totalAmount: Math.max(
            0,
            newSubtotal - Number(order.promoDiscount) - Number(order.couponDiscount) - Number(order.walletApplied),
          ),
        },
        include: { items: true },
      });

      await recordOrderEvent(tx, {
        orderId,
        actorId,
        action: ORDER_EVENT_ACTIONS.ITEM_SUBSTITUTED,
        fromStatus: 'pending',
        toStatus: 'pending',
        payload: {
          originalItemId: item.id,
          originalProductId: item.productId,
          originalProductName: item.productName,
          substituteItemId: newItem.id,
          substituteProductId,
          substituteProductName: subProduct.name,
          quantity: qty,
        },
      });

      return updated;
    });
  }

  // Partial fulfilment while still in the Rule 12 cancel window (`pending`).
  // Does NOT advance status to confirmed — that is an explicit status transition.
  // Unfulfilled qty is released; order total recalculated; OrderEvents appended.
  /** balance = ordered − fulfilled − cancelled */
  private static lineBalance(item: { quantity: number; fulfilledQty: number; cancelledQty?: number | null }) {
    return Math.max(0, item.quantity - (item.fulfilledQty ?? 0) - (item.cancelledQty ?? 0));
  }

  private static lineStatus(item: { quantity: number; fulfilledQty: number; cancelledQty?: number | null }) {
    const cancelled = item.cancelledQty ?? 0;
    const fulfilled = item.fulfilledQty ?? 0;
    const balance = OrderService.lineBalance(item);
    if (cancelled >= item.quantity) return 'CANCELLED' as const;
    if (balance === 0 && fulfilled > 0) return 'FULFILLED' as const;
    if (fulfilled > 0 || cancelled > 0) return 'PARTIALLY_FULFILLED' as const;
    return 'OPEN' as const;
  }

  /**
   * Legacy bridge: map fulfilledQty targets → ship (+ optional cancel of remainder when 0).
   * Does NOT reprice — ordered qty and order totals stay intact (backorder billing).
   */
  async partialAccept(
    orderId: string,
    vendorId: string,
    itemLines: Array<{ itemId: string; fulfilledQty: number; reason?: string }>,
    actorId?: string | null,
  ) {
    // Load once to convert absolute "accept N" into ship delta + leave balance (not cancel).
    const order = await prisma.order.findFirst({
      where: { id: orderId, vendorId },
      include: { items: true },
    });
    if (!order) throw Errors.notFound('Order');

    const ships: Array<{ itemId: string; shipQty: number }> = [];
    for (const line of itemLines) {
      const item = order.items.find((i) => i.id === line.itemId);
      if (!item) throw Errors.badRequest(`Item ${line.itemId} does not belong to this order`);
      const already = item.fulfilledQty ?? 0;
      const target = line.fulfilledQty;
      if (target < already) {
        throw Errors.badRequest(
          `Cannot reduce fulfilled qty for "${item.productName}" (already shipped ${already}). Cancel balance instead.`,
        );
      }
      const delta = target - already;
      if (delta > 0) ships.push({ itemId: line.itemId, shipQty: delta });
    }

    // FulfilledQty 0 on a line → cancel entire remaining balance (Option 1 cancel items)
    const cancels: Array<{ itemId: string; cancelQty: number; reason?: string }> = [];
    for (const line of itemLines) {
      if (line.fulfilledQty !== 0) continue;
      const item = order.items.find((i) => i.id === line.itemId)!;
      const bal = OrderService.lineBalance(item);
      if (bal > 0) {
        cancels.push({ itemId: line.itemId, cancelQty: bal, reason: line.reason });
      }
    }

    let updated = order;
    if (ships.length > 0) {
      updated = await this.shipLines(orderId, vendorId, ships, actorId);
    }
    if (cancels.length > 0) {
      updated = await this.cancelLineBalance(orderId, vendorId, cancels, actorId);
    }
    if (ships.length === 0 && cancels.length === 0) {
      throw Errors.badRequest('No quantity changes to apply');
    }
    return updated;
  }

  /** Post-confirm amend → ship deltas only (no reprice / no cut). */
  async amendOrderLines(
    orderId: string,
    vendorId: string,
    itemLines: Array<{ itemId: string; fulfilledQty: number; reason?: string }>,
    actorId?: string | null,
  ) {
    return this.partialAccept(orderId, vendorId, itemLines, actorId);
  }

  /**
   * Ship line quantities (backorder-safe). Creates OrderShipment, increments fulfilledQty,
   * finalizes inventory for shipped qty, keeps order totals. Status → partially_delivered | delivered.
   */
  async shipLines(
    orderId: string,
    vendorId: string,
    items: Array<{ itemId: string; shipQty: number }>,
    actorId?: string | null,
    notes?: string,
  ) {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          vendorId,
          status: {
            in: ['pending', 'confirmed', 'processing', 'ready_for_dispatch', 'shipped', 'partially_delivered'],
          },
        },
        include: { items: true },
      });
      if (!order) throw Errors.badRequest('Order cannot be shipped in its current status');

      const orderItemMap = new Map(order.items.map((i) => [i.id, i]));
      const shipRows: Array<{ item: (typeof order.items)[0]; shipQty: number }> = [];

      for (const line of items) {
        const item = orderItemMap.get(line.itemId);
        if (!item) throw Errors.badRequest(`Item ${line.itemId} does not belong to this order`);
        if (line.shipQty < 1) throw Errors.badRequest('Ship qty must be ≥ 1');
        const balance = OrderService.lineBalance(item);
        if (line.shipQty > balance) {
          throw Errors.badRequest(
            `Cannot ship ${line.shipQty} of "${item.productName}" — balance is ${balance}`,
          );
        }
        shipRows.push({ item, shipQty: line.shipQty });
      }
      if (shipRows.length === 0) throw Errors.badRequest('At least one line to ship');

      const fulfillOutlet = await this.orderFulfillmentOutletId(order, tx);
      await this.inventoryService.finalizeStock(
        shipRows.map((r) => ({ productId: r.item.productId, quantity: r.shipQty })),
        fulfillOutlet,
        tx,
        actorId ?? undefined,
      );

      for (const { item, shipQty } of shipRows) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: { fulfilledQty: item.fulfilledQty + shipQty },
        });
      }

      const lastShipment = await tx.orderShipment.findFirst({
        where: { orderId },
        orderBy: { shipmentNo: 'desc' },
        select: { shipmentNo: true },
      });
      const shipmentNo = (lastShipment?.shipmentNo ?? 0) + 1;
      const shipmentId = randomUUID();
      await tx.orderShipment.create({
        data: {
          id: shipmentId,
          orderId,
          shipmentNo,
          actorId: actorId ?? null,
          notes: notes ?? null,
          items: {
            create: shipRows.map((r) => ({
              id: randomUUID(),
              orderItemId: r.item.id,
              qty: r.shipQty,
            })),
          },
        },
      });

      const refreshed = await tx.orderItem.findMany({ where: { orderId } });
      const anyBalance = refreshed.some((i) => OrderService.lineBalance(i) > 0);
      const anyFulfilled = refreshed.some((i) => i.fulfilledQty > 0);
      const fromStatus = order.status;
      let toStatus: OrderStatus = order.status;
      if (anyFulfilled && anyBalance) toStatus = 'partially_delivered';
      else if (anyFulfilled && !anyBalance) toStatus = 'delivered';

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: toStatus,
          isPartial: anyBalance && anyFulfilled,
          acceptedAt: order.acceptedAt ?? new Date(),
          ...(toStatus === 'delivered' ? { deliveredAt: new Date() } : {}),
        },
        include: {
          items: true,
          shipments: { include: { items: true }, orderBy: { shipmentNo: 'asc' } },
        },
      });

      await recordOrderEvent(tx, {
        orderId,
        actorId,
        action: ORDER_EVENT_ACTIONS.SHIPPED_LINES,
        fromStatus,
        toStatus,
        payload: {
          shipmentNo,
          lines: shipRows.map((r) => ({
            itemId: r.item.id,
            productName: r.item.productName,
            shipQty: r.shipQty,
            orderedQty: r.item.quantity,
          })),
        },
      });
      if (anyBalance) {
        await recordOrderEvent(tx, {
          orderId,
          actorId,
          action: ORDER_EVENT_ACTIONS.PARTIAL_FULFILMENT,
          fromStatus,
          toStatus,
          payload: { shipmentNo },
        });
      }

      await applyCreditLedgerForStatus(tx, order, toStatus);

      return updated;
    });

    if (result.status === 'delivered') {
      try {
        await this.syncOpenFulfilmentToDelivered(orderId);
      } catch (err) {
        console.error('[Order] Sync fulfilment after shipLines delivered failed:', err);
      }
    }
    return result;
  }

  /** Cancel remaining balance on lines (never ship). Order totals unchanged. */
  async cancelLineBalance(
    orderId: string,
    vendorId: string,
    items: Array<{ itemId: string; cancelQty: number; reason?: string }>,
    actorId?: string | null,
  ) {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          vendorId,
          status: {
            in: ['pending', 'confirmed', 'processing', 'ready_for_dispatch', 'partially_delivered'],
          },
        },
        include: { items: true },
      });
      if (!order) throw Errors.badRequest('Order balance cannot be cancelled in its current status');

      const orderItemMap = new Map(order.items.map((i) => [i.id, i]));
      const cancelRows: Array<{ item: (typeof order.items)[0]; cancelQty: number; reason?: string }> = [];

      for (const line of items) {
        const item = orderItemMap.get(line.itemId);
        if (!item) throw Errors.badRequest(`Item ${line.itemId} does not belong to this order`);
        const balance = OrderService.lineBalance(item);
        if (line.cancelQty < 1 || line.cancelQty > balance) {
          throw Errors.badRequest(
            `Cannot cancel ${line.cancelQty} of "${item.productName}" — balance is ${balance}`,
          );
        }
        cancelRows.push({ item, cancelQty: line.cancelQty, reason: line.reason });
      }

      const fulfillOutlet = await this.orderFulfillmentOutletId(order, tx);
      await this.inventoryService.releaseStock(
        cancelRows.map((r) => ({ productId: r.item.productId, quantity: r.cancelQty })),
        fulfillOutlet,
        tx,
        actorId ?? undefined,
      );

      for (const { item, cancelQty } of cancelRows) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: { cancelledQty: (item.cancelledQty ?? 0) + cancelQty },
        });
      }

      const refreshed = await tx.orderItem.findMany({ where: { orderId } });
      const anyBalance = refreshed.some((i) => OrderService.lineBalance(i) > 0);
      const anyFulfilled = refreshed.some((i) => i.fulfilledQty > 0);
      const allCancelled = refreshed.every((i) => (i.cancelledQty ?? 0) >= i.quantity);
      const fromStatus = order.status;
      let toStatus: OrderStatus = order.status;
      if (allCancelled) toStatus = 'cancelled';
      else if (anyFulfilled && !anyBalance) toStatus = 'delivered';
      else if (anyFulfilled && anyBalance) toStatus = 'partially_delivered';

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: toStatus,
          isPartial: anyFulfilled && anyBalance,
          ...(toStatus === 'cancelled'
            ? { rejectedAt: new Date(), rejectionReason: cancelRows[0]?.reason ?? 'Line balance cancelled' }
            : {}),
          ...(toStatus === 'delivered' ? { deliveredAt: new Date() } : {}),
        },
        include: {
          items: true,
          shipments: { include: { items: true }, orderBy: { shipmentNo: 'asc' } },
        },
      });

      await recordOrderEvents(
        tx,
        cancelRows.map((r) => ({
          orderId,
          actorId,
          action: ORDER_EVENT_ACTIONS.BALANCE_CANCELLED,
          fromStatus,
          toStatus,
          payload: {
            itemId: r.item.id,
            productName: r.item.productName,
            cancelQty: r.cancelQty,
            orderedQty: r.item.quantity,
            ...(r.reason ? { reason: r.reason } : {}),
          },
        })),
      );

      await applyCreditLedgerForStatus(tx, order, toStatus);

      return updated;
    });

    if (result.status === 'delivered') {
      try {
        await this.syncOpenFulfilmentToDelivered(orderId);
      } catch (err) {
        console.error('[Order] Sync fulfilment after cancelLineBalance delivered failed:', err);
      }
    }
    return result;
  }

  // Valid status transitions (Section 7):
  // - Live orders start as `pending`; online payment often advances to `confirmed`.
  // - Cancel window (R12 / customer cancel-request): pending + confirmed (before Packed).
  // - `pending → processing` allowed so Packed can skip optional Accepted step.
  private static readonly VALID_TRANSITIONS: Readonly<Record<string, string[]>> = {
    draft:               ['pending', 'cancelled'],
    pending:             ['confirmed', 'processing', 'partially_delivered', 'cancelled'],
    confirmed:           ['processing', 'partially_delivered', 'delivered', 'shipped', 'cancelled'],
    processing:          ['ready_for_dispatch', 'shipped', 'partially_delivered', 'delivered'],
    ready_for_dispatch:  ['shipped', 'partially_delivered', 'delivered'],
    shipped:             ['delivered', 'partially_delivered'],
    partially_delivered: ['delivered', 'returned', 'cancelled'],
    delivered:           ['returned'],
    returned:            [],
    cancelled:           [],
  };

  /** Store / customer-cancel may cancel before packing starts. */
  static isCancellableStatus(status: string): boolean {
    return status === 'pending' || status === 'confirmed';
  }

  async updateStatus(
    orderId: string,
    vendorId: string,
    status: string,
    reason?: string,
    proof?: { proofType?: string; proofUrl?: string | null; notes?: string; otp?: string },
    // Admin override (P0-3): set any status directly. The transition guard is
    // skipped, but the stock/credit side-effects below are idempotent + guarded
    // by the order's current state so a forced jump can't corrupt the ledgers.
    force = false,
    actorId?: string | null,
  ) {
    // Set inside the tx when we actually transition → shipped (not a no-op).
    // Auto-issue OTP runs after commit so Fulfilment dispatch / classic ship
    // share one hook via syncOrderGate → updateStatus.
    let becameShipped = false;
    let becameDelivered = false;

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, vendorId },
        include: {
          items: {
            select: {
              id: true,
              productId: true,
              quantity: true,
              fulfilledQty: true,
              cancelledQty: true,
              // categoryId needed to resolve category-scoped commission rules
              // at delivery time. Tiny extra row; cheap to include.
              product: { select: { categoryId: true, brand: true } },
            },
          },
        },
      });
      if (!order) throw Errors.notFound('Order');

      // Same-status PATCH is a no-op (must run before the transition guard so
      // re-deliver / re-confirm does not 400 and can stay idempotent for
      // cashback settle + program issuance callers).
      if (order.status === status) {
        // shipLines can already set delivered without running the credit
        // ledger. Re-deliver must still convert reserved → outstanding.
        if (status === 'delivered' || status === 'cancelled') {
          await applyCreditLedgerForStatus(tx, order, status);
        }
        return order;
      }

      // Rule 12 — cancel only before packing (pending/confirmed). After Packed → Returns.
      if (status === 'cancelled' && !force && !OrderService.isCancellableStatus(order.status)) {
        throw Errors.badRequest(
          'Only Pending or Confirmed orders may be cancelled. Once packed, use the Returns workflow.',
        );
      }
      if (status === 'cancelled' && !reason?.trim()) {
        throw Errors.badRequest('A cancellation / rejection reason is required.');
      }

      const validNext = OrderService.VALID_TRANSITIONS[order.status as string] ?? [];
      if (!force && !validNext.includes(status)) {
        throw Errors.badRequest(
          `Cannot move order from "${order.status}" to "${status}". ` +
          `Allowed next states: ${validNext.length ? validNext.join(', ') : 'none'}.`
        );
      }

      if (status === 'shipped') {
        becameShipped = true;
      }
      if (status === 'delivered') {
        becameDelivered = true;
      }

      // Backorder: reserved remaining = ordered − fulfilled − cancelled.
      // Fulfilled qty is already finalized incrementally via shipLines.
      const remainingReserved = order.items
        .map((i) => ({
          productId: i.productId,
          quantity: Math.max(0, i.quantity - (i.fulfilledQty ?? 0) - (i.cancelledQty ?? 0)),
        }))
        .filter((l) => l.quantity > 0);

      const RESERVED_STATES = ['pending', 'confirmed', 'processing', 'ready_for_dispatch', 'shipped', 'partially_delivered'];
      const stockReserved = RESERVED_STATES.includes(order.status as string);
      const fulfillOutlet = await this.orderFulfillmentOutletId(order, tx);
      if (status === 'cancelled' && stockReserved) {
        await this.inventoryService.releaseStock(remainingReserved, fulfillOutlet, tx);
      }
      if (status === 'delivered' && stockReserved) {
        const shipmentCount = await tx.orderShipment.count({ where: { orderId } });
        if (shipmentCount === 0) {
          // Classic path — no incremental shipments; finalize remaining reserved / ordered.
          const toFinalize = order.items
            .map((i) => ({
              productId: i.productId,
              quantity: Math.max(0, i.quantity - (i.cancelledQty ?? 0)),
            }))
            .filter((l) => l.quantity > 0);
          await this.inventoryService.finalizeStock(toFinalize, fulfillOutlet, tx);
          for (const i of order.items) {
            const target = Math.max(0, i.quantity - (i.cancelledQty ?? 0));
            if (i.fulfilledQty !== target) {
              await tx.orderItem.update({
                where: { id: i.id },
                data: { fulfilledQty: target },
              });
            }
          }
        }
        // else: shipLines already finalized fulfilled qty; release any leftover reserved balance
        else if (remainingReserved.length > 0) {
          await this.inventoryService.releaseStock(remainingReserved, fulfillOutlet, tx);
        }
      }

      // Timestamp fields
      const now = new Date();
      const extraData: Record<string, unknown> = {};
      if (status === 'confirmed' && !order.acceptedAt) extraData.acceptedAt = now;
      if (status === 'cancelled') {
        extraData.rejectedAt = now;
        if (reason) extraData.rejectionReason = reason;
      }
      if (status === 'delivered') {
        extraData.deliveredAt = now;
        if (proof?.proofType) extraData.deliveryProofType = proof.proofType;
        if (proof?.proofUrl) extraData.deliveryProofUrl = proof.proofUrl;
        if (proof?.notes) extraData.deliveryNotes = proof.notes;
        // Delivery OTP — only enforced when an OTP was actually issued for
        // this order AND the agent is submitting OTP proof. Alternate proof
        // types (photo/signature/notes) and orders with no OTP are unchanged,
        // so this never blocks the existing "mark delivered" flow.
        if (order.deliveryOtp && proof?.proofType === 'otp') {
          if (!proof.otp || proof.otp !== order.deliveryOtp) {
            throw Errors.badRequest('Delivery OTP does not match. Ask the customer to read the 4-digit code from their order updates.');
          }
          if (order.deliveryOtpExpiresAt && order.deliveryOtpExpiresAt < now) {
            throw Errors.badRequest('Delivery OTP has expired. Generate a new one and retry.');
          }
          extraData.deliveryOtpVerifiedAt = now;
        }
      }

      const fromStatus = order.status as string;
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: status as never, ...extraData },
      });

      await recordOrderEvent(tx, {
        orderId,
        actorId,
        action: status === 'cancelled' ? ORDER_EVENT_ACTIONS.CANCELLED : ORDER_EVENT_ACTIONS.STATUS_CHANGED,
        fromStatus,
        toStatus: status,
        payload: {
          ...(reason ? { reason } : {}),
          ...(force ? { force: true } : {}),
          ...(proof?.proofType ? { proofType: proof.proofType } : {}),
        },
      });

      // S8 — ensure Fulfilment exists when order becomes confirmed (or acceptedAt set).
      // Idempotent; covers legacy accepted orders that predate the Fulfilment table.
      if (status === 'confirmed' || extraData.acceptedAt) {
        await ensureFulfilmentForOrder(orderId, { actorId: actorId ?? null, tx });
      }

      // Credit side-effect — reserved at order create; convert to outstanding on
      // delivery; release reserved/outstanding on cancel (idempotent).
      await applyCreditLedgerForStatus(tx, order, status);

      // Promo Engine Phase 1 side-effects — all idempotent, all inside this tx:
      //   cancelled → reverse the coupon use, refund the Rewards Wallet amount,
      //               void the pending cashback on the attached (winning) PO.
      //               Sibling POs do not each hold an entry; settlement of the
      //               winning PO recomputes from remaining non-cancelled POs.
      //   delivered → settle the cashback (credit Rewards Wallet / approve UPI).
      //   returned  → void the cashback on the attached PO. ReturnRequest close
      //               already reaches this path — do NOT also claw back inside
      //               return.service (would double-cancel). Partial-return
      //               pro-rata is a remaining product decision.
      if (status === 'cancelled') {
        await promotionService.reverseCouponForOrder(tx, orderId);
        await promotionService.refundWalletForOrder(tx, {
          id: orderId,
          userId: order.userId,
          walletApplied: Number(order.walletApplied),
        });
        await promotionService.cancelCashbackForOrder(tx, orderId);
      }
      if (status === 'delivered') {
        await promotionService.settleCashbackForOrder(tx, orderId);
        await creditVendorOnDelivery(orderId, tx);
      }
      if (status === 'returned') {
        await promotionService.cancelCashbackForOrder(tx, orderId);
      }

      // V2.2 Phase 1 — Commission accrual hook.
      //
      // When an order is delivered AND a salesperson was attributed at order
      // creation, find the most-specific active commission rule and write
      // a pending CommissionAccrual. Idempotent — the (orderId, salespersonId)
      // unique constraint stops double-write if updateStatus is retried.
      //
      // The hook runs INSIDE the same transaction as the status update so
      // an accrual is either written-with-delivery or not at all (no race
      // window where the order is delivered but accrual missing). The
      // service falls back silently if no rule matches — the brief says
      // commissions are opt-in, not mandatory.
      if (status === 'delivered' && order.salespersonId) {
        const vendorCustomer = await tx.vendorCustomer.findUnique({
          where: { vendorId_userId: { vendorId, userId: order.userId } },
          select: { id: true },
        });
        // Category ids from the items. Brand resolution is deferred —
        // Product.brand is a free-text name today; brand-scoped commission
        // rules will activate once the brand-mapping layer is the source
        // of truth (separate Phase task).
        const categoryIds = Array.from(
          new Set(
            order.items
              .map((i) => i.product?.categoryId)
              .filter((id): id is string => !!id),
          ),
        );
        const brandNames = Array.from(
          new Set(
            order.items
              .map((i) => i.product?.brand)
              .filter((b): b is string => !!b && b.trim().length > 0),
          ),
        );
        const brandRows = brandNames.length > 0
          ? await tx.brand.findMany({
              where: { name: { in: brandNames, mode: 'insensitive' } },
              select: { id: true },
            })
          : [];
        const brandIds = brandRows.map((b) => b.id);
        const rule = await findApplicableCommissionRule(
          {
            vendorId,
            salespersonId: order.salespersonId,
            order: {
              id: order.id,
              totalAmount: order.totalAmount,
              createdAt: order.createdAt,
              userId: order.userId,
            },
            vendorCustomerId: vendorCustomer?.id ?? null,
            brandIds,
            categoryIds,
          },
          tx,
        );
        if (rule) {
          await createCommissionAccrual(
            {
              order: {
                id: order.id,
                vendorId,
                totalAmount: order.totalAmount,
                createdAt: order.createdAt,
                salespersonId: order.salespersonId,
              },
              rule,
            },
            tx,
          );
        }
      }

      // B-4: explicit status→event map so every transition has a real,
      // listener-backed event (no more silently-dropped dynamic emits).
      const STATUS_EVENT = {
        confirmed: 'OrderConfirmed',
        processing: 'OrderProcessing',
        ready_for_dispatch: 'OrderReadyForDispatch',
        shipped: 'OrderShipped',
        partially_delivered: 'OrderPartiallyDelivered',
        delivered: 'OrderDelivered',
        returned: 'OrderReturned',
        cancelled: 'OrderCancelled',
      } as const;
      const eventName = STATUS_EVENT[status as keyof typeof STATUS_EVENT];
      if (eventName) emitEvent(eventName, { orderId, userId: updated.userId, vendorId });

      return updated;
    });

    // Auto-issue delivery OTP on first transition to Out for Delivery.
    // Idempotent when an active OTP already exists (OrderCreated / prior issue).
    if (becameShipped) {
      try {
        await this.ensureDeliveryOtpIfNeeded(orderId, vendorId);
      } catch (err) {
        // Status is already committed — don't fail the ship if notify/issue fails.
        console.error('[Order] Auto-issue delivery OTP on shipped failed:', err);
      }
    }

    // Keep Fulfilment in sync when Order is marked delivered outside the
    // delivery workspace (vendor Orders PATCH / shipLines / etc.).
    if (becameDelivered) {
      try {
        await this.syncOpenFulfilmentToDelivered(orderId);
      } catch (err) {
        console.error('[Order] Sync fulfilment on delivered failed:', err);
      }
    }

    if (
      status === 'confirmed' ||
      status === 'processing' ||
      status === 'ready_for_dispatch' ||
      status === 'shipped' ||
      status === 'partially_delivered' ||
      status === 'delivered'
    ) {
      try {
        await promotionService.onOrdersBecameSuccessful([orderId]);
      } catch (err) {
        console.error('[Order] Program issuance after status change failed:', err);
      }
    }

    return updated;
  }

  /**
   * Best-effort: if Fulfilment is still out_for_delivery/failed after Order
   * became delivered, close it so boy portal stops listing the run.
   */
  private async syncOpenFulfilmentToDelivered(orderId: string): Promise<void> {
    const open = await prisma.fulfilment.findFirst({
      where: {
        orderId,
        status: { in: ['out_for_delivery', 'failed_delivery'] },
      },
      select: {
        id: true,
        dispatches: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!open) return;

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.fulfilment.update({
        where: { id: open.id },
        data: { status: 'delivered', failedReason: null },
      });
      if (open.dispatches[0]) {
        await tx.dispatch.update({
          where: { id: open.dispatches[0].id },
          data: { status: 'delivered', deliveredAt: now },
        });
      }
      await tx.deliveryAccessToken.updateMany({
        where: { fulfilmentId: open.id, revokedAt: null, usedAt: null },
        data: { usedAt: now },
      });
    });
  }

  /**
   * S9 — create a NEW replacement PO linked to a return.
   * Does not mutate the original order's line items/prices.
   * Reserves stock and ensures Fulfilment (auto-accepted).
   */
  async createReplacementOrder(input: {
    returnId: string;
    vendorId: string;
    actorId?: string | null;
    notes?: string;
    items: Array<{ returnItemId: string; quantity: number }>;
  }) {
    if (!input.items.length) {
      throw Errors.badRequest('Specify at least one return line for replacement');
    }

    const result = await prisma.$transaction(async (tx) => {
      const ret = await tx.returnRequest.findFirst({
        where: { id: input.returnId, order: { vendorId: input.vendorId } },
        include: {
          items: {
            include: {
              orderItem: {
                select: {
                  id: true,
                  productId: true,
                  productName: true,
                  productSku: true,
                  hsn: true,
                  brand: true,
                  packSize: true,
                  categoryName: true,
                  taxPercent: true,
                  unitPrice: true,
                  quantity: true,
                },
              },
            },
          },
          order: true,
        },
      });
      if (!ret) throw Errors.notFound('Return request');
      if (ret.replacementOrderId) {
        throw Errors.badRequest('Replacement order already exists for this return');
      }

      const itemMap = new Map(ret.items.map((i) => [i.id, i]));
      const childItems: OrderLineCreate[] = [];
      let subtotal = 0;

      for (const line of input.items) {
        const ri = itemMap.get(line.returnItemId);
        if (!ri) throw Errors.badRequest(`Return item ${line.returnItemId} not found`);
        if (ri.decision !== 'approved' && ri.decision !== 'partial') {
          throw Errors.badRequest(
            `Cannot replace ${ri.decision} line "${ri.orderItem.productName}"`,
          );
        }
        const maxQty = ri.approvedQty ?? ri.requestedQty;
        if (line.quantity <= 0 || line.quantity > maxQty) {
          throw Errors.badRequest(
            `Invalid replacement qty for "${ri.orderItem.productName}" (max ${maxQty})`,
          );
        }
        const unit = Number(ri.orderItem.unitPrice);
        const totalPrice = Math.round(unit * line.quantity * 100) / 100;
        childItems.push({
          productId: ri.orderItem.productId,
          productName: ri.orderItem.productName,
          productSku: ri.orderItem.productSku,
          hsn: ri.orderItem.hsn,
          brand: ri.orderItem.brand,
          packSize: ri.orderItem.packSize,
          categoryName: ri.orderItem.categoryName,
          taxPercent: ri.orderItem.taxPercent ?? new Prisma.Decimal(0),
          quantity: line.quantity,
          fulfilledQty: line.quantity,
          unitPrice: ri.orderItem.unitPrice,
          totalPrice,
        });
        subtotal += totalPrice;
      }

      if (!childItems.length) throw Errors.badRequest('Nothing to replace');

      const fulfillmentOutletId =
        ret.order.fulfillmentOutletId ??
        (await this.orderFulfillmentOutletId(
          { fulfillmentOutletId: ret.order.fulfillmentOutletId, vendorId: input.vendorId },
          tx,
        ));

      const stockItems = childItems.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      }));
      const stockCheck = await this.inventoryService.bulkCheck(stockItems, fulfillmentOutletId, tx);
      const outOfStock = stockCheck.find((s) => !s.available);
      if (outOfStock) {
        throw Errors.outOfStock(outOfStock.productName, outOfStock.qtyAvailable);
      }

      const orderNumber = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}R`;
      const noteParts = [
        `Replacement for return ${input.returnId.slice(0, 8)} (invoice ${ret.invoiceNumber ?? ret.order.orderNumber})`,
        input.notes?.trim(),
      ].filter(Boolean);

      const child = await tx.order.create({
        data: {
          orderNumber,
          userId: ret.order.userId,
          vendorId: input.vendorId,
          businessAccountId: ret.order.businessAccountId,
          outletId: ret.order.outletId,
          fulfillmentOutletId,
          deliveryAddressSnapshot: ret.order.deliveryAddressSnapshot as Prisma.InputJsonValue,
          status: 'pending',
          acceptedAt: new Date(),
          subtotal,
          totalAmount: subtotal,
          paymentMethod: 'replacement',
          paymentStatus: 'paid',
          salespersonId: ret.order.salespersonId,
          notes: noteParts.join(' — '),
          items: { create: childItems },
        },
        include: { items: true },
      });

      await recordOrderEvents(tx, [
        {
          orderId: child.id,
          actorId: input.actorId ?? ret.order.userId,
          action: ORDER_EVENT_ACTIONS.CREATED,
          toStatus: 'pending',
          payload: {
            orderNumber,
            via: 'replacement',
            returnId: input.returnId,
            originalOrderId: ret.orderId,
          },
        },
        {
          orderId: child.id,
          actorId: input.actorId ?? ret.order.userId,
          action: ORDER_EVENT_ACTIONS.AUTO_ACCEPTED,
          fromStatus: 'pending',
          toStatus: 'pending',
          payload: { reason: 'replacement_auto_accept', returnId: input.returnId },
        },
      ]);

      await this.inventoryService.reserveStock(stockItems, fulfillmentOutletId, tx);
      await ensureFulfilmentForOrder(child.id, {
        actorId: input.actorId ?? null,
        tx,
      });

      await tx.returnRequest.update({
        where: { id: input.returnId },
        data: {
          replacementOrderId: child.id,
          resolutionType: 'replacement',
        },
      });

      return {
        id: child.id,
        orderNumber: child.orderNumber,
        userId: child.userId,
        vendorId: child.vendorId,
        totalAmount: subtotal,
        items: stockItems,
      };
    }, { isolationLevel: 'Serializable' });

    setImmediate(() => {
      emitEvent('OrderCreated', {
        orderId: result.id,
        orderNumber: result.orderNumber,
        userId: result.userId,
        vendorId: result.vendorId,
        totalAmount: result.totalAmount,
        items: result.items,
      });
    });

    return { id: result.id, orderNumber: result.orderNumber };
  }
}

export const orderService = new OrderService();
