// POST /api/v1/vendor/orders/bulk — Bulk status update or print invoices
// Body: { action: 'update_status' | 'print_invoices', orderIds: uuid[], status?, reason? }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { OrderService } from '@/modules/order/order.service';
import { generateInvoicePdf } from '@/lib/invoice';
import { prisma } from '@/lib/prisma';

const schema = z.object({
  action: z.enum(['update_status', 'print_invoices']),
  orderIds: z.array(z.string().uuid()).min(1).max(50),
  status: z
    .enum([
      'confirmed',
      'processing',
      'ready_for_dispatch',
      'shipped',
      'partially_delivered',
      'delivered',
      'cancelled',
    ])
    .optional(),
  reason: z.string().min(1).max(500).optional(),
}).refine(
  (d) => d.action !== 'update_status' || !!d.status,
  { message: 'status is required for update_status', path: ['status'] },
).refine(
  (d) => d.status !== 'cancelled' || (d.reason && d.reason.trim().length > 0),
  { message: 'reason is required when cancelling', path: ['reason'] },
);

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'orders.edit');
    const { vendorId } = await resolveVendorContext(ctx, req);
    const body = schema.parse(await req.json());

    const owned = await prisma.order.findMany({
      where: { id: { in: body.orderIds }, vendorId },
      select: { id: true, orderNumber: true },
    });
    if (owned.length === 0) throw Errors.badRequest('No matching orders for this store');
    const ownedIds = new Set(owned.map((o) => o.id));
    const missing = body.orderIds.filter((id) => !ownedIds.has(id));
    if (missing.length) {
      throw Errors.badRequest(`Orders not found for this store: ${missing.slice(0, 3).join(', ')}`);
    }

    if (body.action === 'print_invoices') {
      const merged = await PDFDocument.create();
      for (const o of owned) {
        const buf = await generateInvoicePdf(o.id);
        const src = await PDFDocument.load(buf);
        const pages = await merged.copyPages(src, src.getPageIndices());
        for (const p of pages) merged.addPage(p);
      }
      const bytes = await merged.save();
      return new NextResponse(Buffer.from(bytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="invoices-bulk-${owned.length}.pdf"`,
          'Content-Length': String(bytes.length),
        },
      });
    }

    const orderService = new OrderService();
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of body.orderIds) {
      try {
        await orderService.updateStatus(
          id,
          vendorId,
          body.status!,
          body.reason,
          undefined,
          false,
          ctx.userId,
        );
        succeeded.push(id);
      } catch (err: unknown) {
        failed.push({
          id,
          error: err instanceof Error ? err.message : 'Update failed',
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: { succeeded, failed, total: body.orderIds.length },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
