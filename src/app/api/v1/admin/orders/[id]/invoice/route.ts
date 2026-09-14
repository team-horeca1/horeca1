// GET /api/v1/admin/orders/:id/invoice — Download GST invoice PDF for any order
// Query: ?email=true — generate PDF and email it to the customer
// PROTECTED: Admin with orders.view

import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { generateInvoicePdf } from '@/lib/invoice';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/providers/email';

function extractOrderId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../admin/orders/{id}/invoice
  return segments[segments.length - 2]!;
}

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'orders.view');
    const orderId = extractOrderId(req);
    const emailToCustomer = req.nextUrl.searchParams.get('email') === 'true';

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        paymentStatus: true,
        user: { select: { email: true, fullName: true } },
      },
    });
    if (!order) throw Errors.notFound('Order');

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generateInvoicePdf(orderId);
    } catch (pdfErr) {
      console.error('[admin-invoice] PDF generation failed for order', orderId, pdfErr);
      throw pdfErr;
    }

    if (emailToCustomer) {
      const to = order.user.email?.trim();
      if (!to) throw Errors.badRequest('Customer has no email on file');
      const authUrl = process.env.AUTH_URL ?? 'http://localhost:3000';
      const subject = `Invoice for order ${order.orderNumber} — Horeca1`;
      const text = [
        `Hello ${order.user.fullName},`,
        '',
        `Please find attached the GST tax invoice for your order ${order.orderNumber}.`,
        '',
        `You can also view your order at: ${authUrl}/orders/${order.id}`,
        '',
        '— The Horeca1 team',
      ].join('\n');
      const html = `<p>Hello <strong>${order.user.fullName}</strong>,</p><p>Please find attached the GST tax invoice for your order <strong>${order.orderNumber}</strong>.</p><p><a href="${authUrl}/orders/${order.id}">View order</a></p><p>— The Horeca1 team</p>`;
      const { sent } = await sendEmail({
        to,
        subject,
        text,
        html,
        name: order.user.fullName,
        attachments: [
          {
            filename: `invoice-${order.orderNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
      return NextResponse.json({
        success: true,
        data: { emailed: sent, orderNumber: order.orderNumber, recipient: to },
      });
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
