// GET  /api/v1/admin/orders/:id — Get full order detail
// PATCH /api/v1/admin/orders/:id — Admin force-update order status
// WHY: Admin can view any order in full detail (items, payments, vendor, customer)
//      and override order status when needed (e.g., resolving disputes, manual corrections)
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { ApiError, errorResponse, Errors } from '@/middleware/errorHandler';
import type { OrderStatus } from '@prisma/client';
import { requirePermission } from '@/lib/permissions/engine';
import { OrderService } from '@/modules/order/order.service';

const VALID_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'processing',
  'ready_for_dispatch',
  'shipped',
  'partially_delivered',
  'delivered',
  'returned',
  'cancelled',
];

// Helper: extract the [id] segment from /api/v1/admin/orders/{id}
function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

// GET — full order with items, payments, vendor, customer info
export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'orders.view');
    const id = extractId(req);

    const order = await prisma.order.findUnique({
      where: { id },
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
            unitPrice: true,
            totalPrice: true,
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
        creditTxns: {
          select: {
            id: true,
            type: true,
            amount: true,
            balanceAfter: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order) {
      throw Errors.notFound('Order');
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    return errorResponse(error);
  }
});

// PATCH — admin force-update order status
export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'orders.edit');
    const id = extractId(req);
    const body = await req.json();

    const { status, reason, proof } = body as {
      status?: OrderStatus;
      reason?: string;
      proof?: { proofType?: string; proofUrl?: string | null; notes?: string; otp?: string };
    };

    if (!status || !VALID_STATUSES.includes(status)) {
      throw new ApiError(
        'VALIDATION_ERROR',
        `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        400,
      );
    }

    // updateStatus is vendor-scoped — look up the order's vendor.
    const existing = await prisma.order.findUnique({ where: { id }, select: { vendorId: true } });
    if (!existing) throw Errors.notFound('Order');

    // P0-3: route admin status changes through the guarded state machine so the
    // same side-effects fire as the vendor path — inventory finalize/release,
    // credit debit/reversal, commission accrual, and the matching event. A raw
    // `order.update({ status })` here previously desynced stock + credit ledgers.
    const orderService = new OrderService();
    const updated = await orderService.updateStatus(
      id,
      existing.vendorId,
      status,
      reason ?? 'Updated by admin',
      proof,
      true, // admin override — allow any status; side-effects stay idempotent + guarded
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});
