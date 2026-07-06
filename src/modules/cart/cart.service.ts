import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { resolveUnitPrice, type CustomerContext } from '@/modules/pricing/pricing.service';
import { getDeliveryGeo } from '@/lib/deliveryLocation';

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

  async getCart(ctx: CartContext) {
    const cart = await prisma.cart.findFirst({
      where: { userId: ctx.userId, businessAccountId: ctx.businessAccountId, outletId: ctx.outletId },
      include: {
        items: {
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
    for (const item of cart.items) {
      let customer = ctxCache.get(item.vendorId);
      if (!customer) {
        customer = await this.buildCustomerContext(ctx, item.vendorId, outletInfo ?? undefined);
        ctxCache.set(item.vendorId, customer);
      }
      try {
        const resolved = await resolveUnitPrice({
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

    // Group items by vendor
    const vendorMap = new Map<string, { vendor: (typeof cart.items)[0]['vendor']; items: typeof cart.items; subtotal: number }>();

    for (const item of cart.items) {
      const group = vendorMap.get(item.vendorId) || {
        vendor: item.vendor,
        items: [],
        subtotal: 0,
      };
      group.items.push(item);
      group.subtotal += Number(item.unitPrice) * item.quantity;
      vendorMap.set(item.vendorId, group);
    }

    const vendorGroups = Array.from(vendorMap.values()).map((g) => ({
      vendor: g.vendor,
      items: g.items,
      subtotal: g.subtotal,
      meetsMov: g.subtotal >= Number(g.vendor.minOrderValue),
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

    return prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      update: { quantity, unitPrice },
      create: { cartId: cart.id, productId, vendorId, quantity, unitPrice },
    });
  }

  async updateQuantity(ctx: CartContext, itemId: string, quantity: number) {
    const cart = await prisma.cart.findFirst({
      where: { userId: ctx.userId, businessAccountId: ctx.businessAccountId, outletId: ctx.outletId },
      select: { id: true },
    });
    if (!cart) throw Errors.notFound('Cart');

    const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw Errors.notFound('Cart item');

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

    return prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity, unitPrice },
    });
  }

  async removeItem(ctx: CartContext, itemId: string) {
    const cart = await prisma.cart.findFirst({
      where: { userId: ctx.userId, businessAccountId: ctx.businessAccountId, outletId: ctx.outletId },
      select: { id: true },
    });
    if (!cart) throw Errors.notFound('Cart');

    return prisma.cartItem.delete({ where: { id: itemId, cartId: cart.id } });
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
