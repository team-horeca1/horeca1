// GET /api/v1/vendor/orders/:id/picklist — Printable picklist HTML
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { buildPicklistHtml } from '@/lib/print/picklistHtml';

function extractOrderId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return segments[segments.length - 2]!;
}

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'orders.view');
    const vendorId = await resolveVendorId(ctx, req);
    const orderId = extractOrderId(req);

    const order = await prisma.order.findFirst({
      where: { id: orderId, vendorId },
      include: {
        user: { select: { fullName: true, phone: true, businessName: true } },
        items: {
          include: { product: { select: { sku: true, packSize: true, unit: true } } },
        },
      },
    });
    if (!order) throw Errors.notFound('Order');

    const snap = order.deliveryAddressSnapshot as
      | {
          addressLine?: string | null;
          flatInfo?: string | null;
          landmark?: string | null;
          city?: string | null;
          state?: string | null;
          pincode?: string | null;
        }
      | null;

    const addressParts = snap
      ? [
          snap.flatInfo,
          snap.addressLine,
          snap.landmark ? `Near ${snap.landmark}` : null,
          [snap.city, snap.state].filter(Boolean).join(', ') || null,
          snap.pincode,
        ].filter((p): p is string => !!p && p.trim().length > 0)
      : [];

    const html = buildPicklistHtml({
      orderNumber: order.orderNumber,
      customerName: order.user.fullName || order.user.businessName || 'Customer',
      customerPhone: order.user.phone,
      address: addressParts.length ? addressParts.join(', ') : null,
      autoPrint: true,
      items: order.items.map((item) => {
        const qty = order.isPartial ? (item.fulfilledQty ?? item.quantity) : item.quantity;
        const pack = item.product?.packSize
          ? `${item.product.packSize}${item.product.unit ? ` ${item.product.unit}` : ''}`
          : null;
        return {
          productName: item.productName,
          sku: item.product?.sku ?? null,
          pack,
          qty,
        };
      }),
    });

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
