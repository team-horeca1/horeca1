// GET /api/v1/admin/finance/payables/orders/:orderId/payment-invoice
// Payment invoice for what Horeca1 owes the supplier on one order.

import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { generatePaymentInvoicePdf } from '@/lib/paymentInvoice';

function orderIdFrom(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../payables/orders/{orderId}/payment-invoice
  return parts[parts.length - 2] ?? '';
}

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.view');
    const { pdf, orderNumber } = await generatePaymentInvoicePdf(orderIdFrom(req));
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
