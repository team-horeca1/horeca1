// GET /api/v1/vendor/orders/:id/picklist — Printable picklist HTML
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';

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

    const rows = order.items.map((item, idx) => {
      const qty = order.isPartial ? (item.fulfilledQty ?? item.quantity) : item.quantity;
      const pack = item.product?.packSize
        ? `${item.product.packSize}${item.product.unit ? ` ${item.product.unit}` : ''}`
        : '—';
      return `<tr><td>${idx + 1}</td><td>${item.productName}</td><td>${item.product?.sku ?? '—'}</td><td>${pack}</td><td style="text-align:center;font-weight:bold">${qty}</td><td></td></tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Picklist ${order.orderNumber}</title>
<style>body{font-family:monospace;font-size:12px;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #000;padding:4px}</style></head>
<body><h1>PICK SLIP — ${order.orderNumber}</h1>
<p>Customer: ${order.user.businessName ?? order.user.fullName} · ${order.user.phone ?? ''}</p>
<table><thead><tr><th>#</th><th>Product</th><th>SKU</th><th>Pack</th><th>Qty</th><th>Picked</th></tr></thead><tbody>${rows}</tbody></table>
<script>window.onload=()=>window.print()</script></body></html>`;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
