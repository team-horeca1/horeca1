import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import {
  resolveUnitPrice,
  computeSchemeFreeQty,
  type CustomerContext,
  type ResolutionResult,
} from '@/modules/pricing/pricing.service';
import { getDeliveryGeo } from '@/lib/deliveryLocation';
import {
  evaluateBxgyForCart,
  computeBxgyFreeUnits,
  type BxgyCartResult,
} from '@/modules/promotion/promotion.service';
import type { VendorPromoSummary } from '@/types';

/**
 * V2.2: cart is keyed by (userId, businessAccountId, outletId). Every method
 * accepts a CartContext so switching account or outlet loads the correct
 * cart. The legacy unique on (userId) was dropped in Step C.
 *
 * Resolve the CartContext from the session in route handlers via
 * resolveCartContext() (below) so the new fields fall back gracefully for
 * legacy users mid-migration.
 */

export interface CartContext {
  userId: string;
  businessAccountId: string;
  outletId: string;
}

export class CartService {
  /**
   * Build the CustomerContext the pricing resolver needs. Pulls outlet
   * geo data + the customer's per-vendor tags (used for segment matches).
   * Cached per (vendorId) inside one cart operation to avoid re-fetching
   * the same outlet when many items belong to the same vendor.
   */
  private async buildCustomerContext(
    ctx: CartContext,
    vendorId: string,
    outletInfo?: { pincode: string | null; city: string | null; state: string | null },
  ): Promise<CustomerContext> {
    const outlet = outletInfo ?? await prisma.outlet.findUnique({
      where: { id: ctx.outletId },
      select: { pincode: true, city: true, state: true },
    });
    const vc = await prisma.vendorCustomer.findUnique({
      where: { vendorId_userId: { vendorId, userId: ctx.userId } },
      select: { tags: true },
    });
    // Location pricing follows the chosen "Deliver to" address when present,
    // so the cart price matches what the storefront showed.
    const delivery = await getDeliveryGeo(ctx.userId);
    return {
      userId: ctx.userId,
      businessAccountId: ctx.businessAccountId,
      outletId: ctx.outletId,
      outletPincode: delivery?.pincode ?? outlet?.pincode ?? null,
      outletCity: delivery?.city ?? outlet?.city ?? null,
      outletState: delivery?.state ?? outlet?.state ?? null,
      tags: vc?.tags ?? [],
    };
  }

  /** Sync BXGY free-product lines (different-product promos) and return per-vendor BXGY map. */
  private async syncBxgyFreeItems(cartId: string) {
    const items = await prisma.cartItem.findMany({ where: { cartId } });
    const vendorIds = Array.from(new Set(items.map((i) => i.vendorId)));
    const activeFreeKeys = new Set<string>();
    const bxgyByVendor = new Map<string, BxgyCartResult[]>();

    for (const vendorId of vendorIds) {
      const vendorItems = items.filter((i) => i.vendorId === vendorId);
      const paidItems = vendorItems
        .filter((i) => Number(i.unitPrice) > 0)
        .map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
        }));
      const bxgyResults = await evaluateBxgyForCart(prisma, vendorId, paidItems);
      bxgyByVendor.set(vendorId, bxgyResults);

      for (const bxgy of bxgyResults) {
        if (bxgy.sameProduct) continue;
        if (bxgy.freeUnits <= 0) continue;
        const key = `${vendorId}:${bxgy.getProductId}`;
        activeFreeKeys.add(key);
        const existing = vendorItems.find(
          (i) => i.productId === bxgy.getProductId && Number(i.unitPrice) === 0,
        );
        if (existing) {
          if (existing.quantity !== bxgy.freeUnits) {
            await prisma.cartItem.update({
              where: { id: existing.id },
              data: { quantity: bxgy.freeUnits },
            });
          }
        } else {
          await prisma.cartItem.create({
            data: {
              cartId,
              productId: bxgy.getProductId,
              vendorId,
              quantity: bxgy.freeUnits,
              unitPrice: 0,
            },
          });
        }
      }
    }

    for (const item of items) {
      if (Number(item.unitPrice) !== 0) continue;
      const key = `${item.vendorId}:${item.productId}`;
      if (!activeFreeKeys.has(key)) {
        await prisma.cartItem.delete({ where: { id: item.id } });
      }
    }

    return bxgyByVendor;
  }

  private computeLineCharge(
    item: {
      productId: string;
      vendorId: string;
      quantity: number;
      unitPrice: unknown;
      schemeFreeQty?: number;
    },
    bxgyResults: BxgyCartResult[],
  ): number {
    if (Number(item.unitPrice) <= 0) return 0;
    // Same-product BXGY: customer pays for all units in the line; free units are
    // informational. Scheme free-goods: charge billed qty only (matches order.create).
    const sameProductBxgy = bxgyResults.find(
      (b) => b.sameProduct && b.buyProductId === item.productId,
    );
    const schemeFree = item.schemeFreeQty ?? 0;
    const chargeQty = sameProductBxgy
      ? item.quantity
      : Math.max(0, item.quantity - schemeFree);
    const taxPercent = Number(
      (item as { product?: { taxPercent?: unknown } }).product?.taxPercent,
    ) || 0;
    const taxable = Number(item.unitPrice) * chargeQty;
    return Math.round(taxable * (1 + taxPercent / 100) * 100) / 100;
  }

  private buildPromoSummary(
    vendorId: string,
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: unknown;
      isPromoFree?: boolean;
      bxgyFreeQty?: number;
      bxgyPromotionName?: string;
      schemeFreeQty?: number;
      product: { id: string; name: string; basePrice: unknown; taxPercent: unknown };
    }>,
    bxgyResults: BxgyCartResult[],
  ): VendorPromoSummary | null {
    const paidLines: VendorPromoSummary['paidLines'] = [];
    const freeLines: VendorPromoSummary['freeLines'] = [];

    for (const item of items) {
      const taxPercent = Number(item.product.taxPercent) || 0;
      const unitGross = Math.round(Number(item.product.basePrice) * (1 + taxPercent / 100) * 100) / 100;

      if (item.isPromoFree) {
        freeLines.push({
          productId: item.productId,
          name: item.product.name,
          quantity: item.quantity,
          unitValueSaved: unitGross,
        });
        continue;
      }
      const freeQty = (item.bxgyFreeQty ?? 0) || (item.schemeFreeQty ?? 0);
      if (freeQty > 0) {
        paidLines.push({
          productId: item.productId,
          name: item.product.name,
          paidQty: item.quantity,
          freeQty,
        });
        if (
          (item.schemeFreeQty ?? 0) > 0
          || bxgyResults.some((b) => b.sameProduct && b.buyProductId === item.productId)
        ) {
          freeLines.push({
            productId: item.productId,
            name: item.product.name,
            quantity: freeQty,
            unitValueSaved: unitGross,
          });
        }
      }
    }

    for (const bxgy of bxgyResults) {
      if (bxgy.sameProduct) continue;
      const freeItem = items.find(
        (i) => i.isPromoFree && i.productId === bxgy.getProductId,
      );
      if (freeItem) continue;
      const getProduct = items.find((i) => i.productId === bxgy.getProductId);
      const name = getProduct?.product.name ?? 'Free item';
      const taxPercent = getProduct ? Number(getProduct.product.taxPercent) || 0 : 0;
      const base = getProduct ? Number(getProduct.product.basePrice) : 0;
      const unitGross = Math.round(base * (1 + taxPercent / 100) * 100) / 100;
      freeLines.push({
        productId: bxgy.getProductId,
        name,
        quantity: bxgy.freeUnits,
        unitValueSaved: unitGross,
      });
    }

    if (paidLines.length === 0 && freeLines.length === 0) return null;

    const hasBxgy = bxgyResults.length > 0;
    const schemeLine = items.find((i) => (i.schemeFreeQty ?? 0) > 0);
    const promotionName = hasBxgy
      ? bxgyResults[0].promotionName
      : schemeLine
        ? `Buy more, get ${schemeLine.schemeFreeQty} free`
        : 'Scheme offer';

    return {
      vendorId,
      promotionName,
      type: hasBxgy ? 'bxgy' : 'scheme',
      paidLines,
      freeLines,
    };
  }

  private enrichItemsWithBxgy<T extends {
    productId: string;
    vendorId: string;
    quantity: number;
    unitPrice: unknown;
    schemeFreeQty?: number;
  }>(
    items: T[],
    bxgyResults: BxgyCartResult[],
  ) {
    return items.map((item) => {
      const isPromoFree = Number(item.unitPrice) === 0;
      const sameBxgy = bxgyResults.find((b) => b.sameProduct && b.buyProductId === item.productId);
      const bxgyFreeQty = sameBxgy && !isPromoFree
        ? computeBxgyFreeUnits(item.quantity, sameBxgy.minQty, sameBxgy.getQty)
        : isPromoFree ? item.quantity : 0;
      const bxgyPromo = bxgyResults.find(
        (b) => !b.sameProduct && (b.getProductId === item.productId || b.buyProductId === item.productId),
      );
      return {
        ...item,
        isPromoFree,
        bxgyFreeQty,
        bxgyPromotionName: bxgyPromo?.promotionName ?? sameBxgy?.promotionName,
        schemeFreeQty: item.schemeFreeQty ?? 0,
      };
    });
  }

  async getCart(ctx: CartContext) {
    const cart = await prisma.cart.findFirst({
      where: { userId: ctx.userId, businessAccountId: ctx.businessAccountId, outletId: ctx.outletId },
      include: {
        items: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            product: {
              select: {
                id: true, name: true, imageUrl: true, basePrice: true, originalPrice: true,
                taxPercent: true, minOrderQty: true, packSize: true,
                unit: true, creditEligible: true,
                priceSlabs: { orderBy: { minQty: 'asc' as const }, select: { minQty: true, maxQty: true, price: true } },
                inventories: { select: { qtyAvailable: true } },
              },
            },
            vendor: { select: { id: true, businessName: true, slug: true, minOrderValue: true, logoUrl: true } },
          },
        },
      },
    });

    if (!cart) return { vendorGroups: [], total: 0 };

    // V2.2 Phase 4 — re-resolve every line through the PricingService so
    // assignment / pricelist changes show up on cart load WITHOUT requiring
    // the customer to re-add the item. Cache outlet + per-vendor context to
    // avoid N+1 queries when many items belong to the same vendor.
    const outletInfo = await prisma.outlet.findUnique({
      where: { id: ctx.outletId },
      select: { pincode: true, city: true, state: true },
    });
    const ctxCache = new Map<string, CustomerContext>();
    const refreshes: Array<{ id: string; unitPrice: number }> = [];
    const schemeByItemId = new Map<string, number>();
    for (const item of cart.items) {
      if (Number(item.unitPrice) === 0) continue;
      let customer = ctxCache.get(item.vendorId);
      if (!customer) {
        customer = await this.buildCustomerContext(ctx, item.vendorId, outletInfo ?? undefined);
        ctxCache.set(item.vendorId, customer);
      }
      try {
        const resolved: ResolutionResult = await resolveUnitPrice({
          productId: item.productId,
          vendorId: item.vendorId,
          quantity: item.quantity,
          customer,
        });
        const next = Number(resolved.unitPrice);
        if (next !== Number(item.unitPrice)) {
          refreshes.push({ id: item.id, unitPrice: next });
          item.unitPrice = resolved.unitPrice as unknown as typeof item.unitPrice;
        }
        schemeByItemId.set(
          item.id,
          computeSchemeFreeQty(item.quantity, resolved.schemeMinQty, resolved.schemeFreeQty),
        );
      } catch {
        // Resolver throws if a product was deleted; leave the existing
        // unitPrice as-is so the row still renders. The pre-checkout
        // validation will catch dangling items.
      }
    }
    if (refreshes.length > 0) {
      await prisma.$transaction(
        refreshes.map((r) => prisma.cartItem.update({ where: { id: r.id }, data: { unitPrice: r.unitPrice } })),
      );
    }

    const bxgyByVendor = await this.syncBxgyFreeItems(cart.id);

    // Re-load after BXGY sync may have added/removed free lines
    const freshItems = await prisma.cartItem.findMany({
      where: { cartId: cart.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        product: {
          select: {
            id: true, name: true, imageUrl: true, basePrice: true, originalPrice: true,
            taxPercent: true, minOrderQty: true, packSize: true,
            unit: true, creditEligible: true,
            priceSlabs: { orderBy: { minQty: 'asc' as const }, select: { minQty: true, maxQty: true, price: true } },
            inventories: { select: { qtyAvailable: true } },
          },
        },
        vendor: { select: { id: true, businessName: true, slug: true, minOrderValue: true, logoUrl: true } },
      },
    });

    const vendorMap = new Map<string, {
      vendor: (typeof freshItems)[0]['vendor'];
      items: Array<ReturnType<CartService['enrichItemsWithBxgy']>[number] & { product: (typeof freshItems)[0]['product'] }>;
      subtotal: number;
      bxgyResults: BxgyCartResult[];
    }>();

    for (const item of freshItems) {
      const bxgyResults = bxgyByVendor.get(item.vendorId) ?? [];
      const group = vendorMap.get(item.vendorId) || {
        vendor: item.vendor,
        items: [],
        subtotal: 0,
        bxgyResults,
      };
      const withScheme = {
        ...item,
        schemeFreeQty: schemeByItemId.get(item.id) ?? 0,
      };
      const enriched = this.enrichItemsWithBxgy([withScheme], bxgyResults)[0];
      group.items.push({ ...enriched, product: item.product });
      group.subtotal += this.computeLineCharge(withScheme, bxgyResults);
      vendorMap.set(item.vendorId, group);
    }

    const vendorGroups = Array.from(vendorMap.values()).map((g) => ({
      vendor: g.vendor,
      items: g.items,
      subtotal: g.subtotal,
      meetsMov: g.subtotal >= Number(g.vendor.minOrderValue),
      promoSummary: this.buildPromoSummary(g.vendor.id, g.items, g.bxgyResults),
    }));

    const total = vendorGroups.reduce((sum, g) => sum + g.subtotal, 0);

    return { vendorGroups, total };
  }

  async addItem(ctx: CartContext, productId: string, vendorId: string, quantity: number) {
    // Ensure cart exists for this (user, account, outlet).
    let cart = await prisma.cart.findFirst({
      where: { userId: ctx.userId, businessAccountId: ctx.businessAccountId, outletId: ctx.outletId },
      select: { id: true },
    });
    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId: ctx.userId, businessAccountId: ctx.businessAccountId, outletId: ctx.outletId },
        select: { id: true },
      });
    }

    // Validate the product is purchasable; resolve unit price via the
    // PricingService instead of touching basePrice / priceSlab directly
    // so all V2.2 Phase 4 assignment + pricing-type rules apply.
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, approvalStatus: true, isActive: true, minOrderQty: true },
    });
    if (!product) throw Errors.notFound('Product');
    if (product.approvalStatus !== 'approved' || !product.isActive) {
      throw Errors.forbidden('This product is not available for purchase');
    }
    if (quantity < product.minOrderQty) throw Errors.badRequest(`Minimum order quantity for this product is ${product.minOrderQty}`);

    const customer = await this.buildCustomerContext(ctx, vendorId);
    const { unitPrice: resolved } = await resolveUnitPrice({ productId, vendorId, quantity, customer });
    const unitPrice = Number(resolved);

    const result = await prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      update: { quantity, unitPrice },
      create: { cartId: cart.id, productId, vendorId, quantity, unitPrice },
    });
    await this.syncBxgyFreeItems(cart.id);
    return result;
  }

  async updateQuantity(ctx: CartContext, itemId: string, quantity: number) {
    const cart = await prisma.cart.findFirst({
      where: { userId: ctx.userId, businessAccountId: ctx.businessAccountId, outletId: ctx.outletId },
      select: { id: true },
    });
    if (!cart) throw Errors.notFound('Cart');

    const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw Errors.notFound('Cart item');
    if (Number(item.unitPrice) === 0) {
      throw Errors.badRequest('Promotional free items cannot be edited directly');
    }

    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: { minOrderQty: true },
    });
    if (!product) throw Errors.notFound('Product');
    if (quantity < product.minOrderQty) throw Errors.badRequest(`Minimum order quantity for this product is ${product.minOrderQty}`);

    const customer = await this.buildCustomerContext(ctx, item.vendorId);
    const { unitPrice: resolved } = await resolveUnitPrice({
      productId: item.productId,
      vendorId: item.vendorId,
      quantity,
      customer,
    });
    const unitPrice = Number(resolved);

    const result = await prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity, unitPrice },
    });
    await this.syncBxgyFreeItems(cart.id);
    return result;
  }

  async removeItem(ctx: CartContext, itemId: string) {
    const cart = await prisma.cart.findFirst({
      where: { userId: ctx.userId, businessAccountId: ctx.businessAccountId, outletId: ctx.outletId },
      select: { id: true },
    });
    if (!cart) throw Errors.notFound('Cart');

    const deleted = await prisma.cartItem.delete({ where: { id: itemId, cartId: cart.id } });
    await this.syncBxgyFreeItems(cart.id);
    return deleted;
  }

  async clearCart(ctx: CartContext) {
    const cart = await prisma.cart.findFirst({
      where: { userId: ctx.userId, businessAccountId: ctx.businessAccountId, outletId: ctx.outletId },
      select: { id: true },
    });
    if (!cart) return;
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }
}

/**
 * @deprecated Use `resolveStorefrontContext` from `@/lib/resolveStorefrontContext`.
 */
export { resolveStorefrontContext as resolveCartContext } from '@/lib/resolveStorefrontContext';
