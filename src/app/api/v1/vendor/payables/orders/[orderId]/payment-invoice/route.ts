// GET /api/v1/vendor/payables/orders/:orderId/payment-invoice
// Payment invoice for what the signed-in supplier receives on one order.

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { generatePaymentInvoicePdf } from '@/lib/paymentInvoice';

function orderIdFrom(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  return parts[parts.length - 2] ?? '';
}

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'wallet.view');
    const vendorId = await resolveVendorId(ctx, req);
    const { pdf, orderNumber } = await generatePaymentInvoicePdf(orderIdFrom(req), vendorId);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="payment-invoice-${orderNumber}.pdf"`,
        'Content-Length': String(pdf.length),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
