// GET /api/v1/orders/:id/invoice — Download GST-compliant PDF invoice
// WHY: Indian B2B buyers need tax invoices for input credit claims.
// PROTECTED: Must be logged in; only order owner can download their invoice.

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/middleware/auth';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { generateInvoicePdf } from '@/lib/invoice';
import { prisma } from '@/lib/prisma';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const segments = req.nextUrl.pathname.split('/');
    // URL: /api/v1/orders/{id}/invoice → id is 3rd from end
    const orderId = segments[segments.length - 2];

    // Verify the order belongs to this user (or impersonated customer)
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: effectiveCustomerUserId(ctx) },
      select: { id: true, orderNumber: true, paymentStatus: true },
    });
    if (!order) throw Errors.notFound('Order');

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generateInvoicePdf(orderId);
    } catch (pdfErr) {
      console.error('[invoice] PDF generation failed for order', orderId, pdfErr);
      throw pdfErr;
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${order.orderNumber}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
