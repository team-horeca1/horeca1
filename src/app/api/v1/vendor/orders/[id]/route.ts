// GET   /api/v1/vendor/orders/:id — Get full order detail (vendor view)
// PATCH /api/v1/vendor/orders/:id — Update order status
// WHY: Vendors need to view detailed order info (items, payments, delivery slot,
//      customer info) and advance orders through the fulfillment lifecycle
// PROTECTED: Vendor only (vendors + admins)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { OrderService } from '@/modules/order/order.service';
import { updateStatusSchema, partialAcceptSchema, ewayBillSchema, updateDeliverySchema } from '@/modules/order/order.validator';
import { resolveVendorId, resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';

// Helper: extract the [id] segment from /api/v1/vendor/orders/{id}
function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

// GET — full order with items, payments, customer, delivery slot
export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const vendorId = await resolveVendorId(ctx, req);

    const orderId = extractId(req);

    const order = await prisma.order.findFirst({
      where: { id: orderId, vendorId },
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            addressLine: true,
            city: true,
            state: true,
            addressPincode: true,
          },
        },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            businessName: true,
          },
        },
        items: {
          select: {
            id: true,
            productId: true,
            productName: true,
            quantity: true,
            fulfilledQty: true,
            unitPrice: true,
            totalPrice: true,
            product: {
              select: {
                imageUrl: true,
                sku: true,
                hsn: true,
                unit: true,
                packSize: true,
                taxPercent: true,
              },
            },
          },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            method: true,
            razorpayPaymentId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        deliverySlot: {
          select: {
            id: true,
            dayOfWeek: true,
            slotStart: true,
            slotEnd: true,
          },
        },
        events: {
          orderBy: { createdAt: 'asc' },
          include: {
            actor: { select: { id: true, fullName: true, email: true } },
          },
        },
        cancelRequest: true,
      },
    });

    if (!order) throw Errors.notFound('Order');

    const productIds = order.items.map((i) => i.productId);
    const [inventories, productsWithSubs] = await Promise.all([
      prisma.inventory.findMany({ where: { productId: { in: productIds } } }),
      prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, substituteIds: true } }),
    ]);
    const allSubIds = [...new Set(productsWithSubs.flatMap((p) => p.substituteIds ?? []))];
    const substituteProducts = allSubIds.length
      ? await prisma.product.findMany({ where: { id: { in: allSubIds } }, select: { id: true, name: true, sku: true } })
      : [];

    const enrichedItems = order.items.map((item) => {
      const inv = inventories.find((i) => i.productId === item.productId);
      const stockAvailable = inv ? inv.qtyAvailable - inv.qtyReserved : 0;
      const prod = productsWithSubs.find((p) => p.id === item.productId);
      const substitutes = (prod?.substituteIds ?? [])
        .map((sid) => substituteProducts.find((s) => s.id === sid))
        .filter(Boolean);
      return {
        ...item,
        stockAvailable,
        isLowStock: stockAvailable < item.quantity,
        substitutes,
      };
    });

    const { computeAttentionReasons } = await import('@/lib/orderAttention');
    const attentionReasons = computeAttentionReasons({
      status: order.status,
      paymentStatus: order.paymentStatus,
      isPartial: order.isPartial,
      createdAt: order.createdAt,
      hasPendingCancelRequest: order.cancelRequest?.status === 'pending',
      hasLowStock: enrichedItems.some((i) => i.isLowStock),
    });

    return NextResponse.json({
      success: true,
      data: { ...order, items: enrichedItems, attentionReasons },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// PATCH — update order status OR partially accept an order
//
// Full / status advance:
//   { status: "confirmed"|"processing"|"shipped"|"delivered"|"cancelled", reason?: string }
//   reason is required when status === "cancelled"
//
// Partial accept (accept with adjusted per-item quantities):
//   { items: [{ itemId: uuid, fulfilledQty: number }, ...] }
//   Items omitted from the array default to their full ordered quantity.
export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'orders.edit');

    const orderId = extractId(req);
    const body = await req.json();
    const orderService = new OrderService();

    // Apply substitute on a pending line
    if (body.action === 'substitute' && body.itemId && body.substituteProductId) {
      const updated = await orderService.applySubstitute(
        orderId,
        vendorId,
        body.itemId as string,
        body.substituteProductId as string,
        ctx.userId,
      );
      return NextResponse.json({ success: true, data: updated });
    }

    // Partial accept (pending) or post-confirm amend
    if (Array.isArray(body.items)) {
      const { items } = partialAcceptSchema.parse(body);
      if (body.mode === 'amend') {
        const updated = await orderService.amendOrderLines(orderId, vendorId, items, ctx.userId);
        return NextResponse.json({ success: true, data: updated });
      }
      const updated = await orderService.partialAccept(orderId, vendorId, items, ctx.userId);
      return NextResponse.json({ success: true, data: updated });
    }

    // E-Way Bill save — body contains ewayBillNo only
    if ('ewayBillNo' in body && !('status' in body)) {
      const { ewayBillNo } = ewayBillSchema.parse(body);
      const order = await prisma.order.findFirst({ where: { id: orderId, vendorId } });
      if (!order) throw Errors.notFound('Order');
      const updated = await prisma.order.update({
        where: { id: orderId },
        data: { ewayBillNo },
        select: { id: true, ewayBillNo: true },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    // Reschedule path — body carries deliverySlotId and/or deliveryDate
    if (('deliverySlotId' in body || 'deliveryDate' in body) && !('status' in body)) {
      const input = updateDeliverySchema.parse(body);
      const updated = await orderService.updateDelivery(orderId, vendorId, input);
      return NextResponse.json({ success: true, data: updated });
    }

    // Standard status transition path
    const { status, reason, proof, force } = updateStatusSchema.parse(body);
    const updated = await orderService.updateStatus(
      orderId,
      vendorId,
      status,
      reason,
      proof,
      force === true,
      ctx.userId,
    );
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});
