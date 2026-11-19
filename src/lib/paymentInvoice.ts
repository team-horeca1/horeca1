// Payment invoice for what Horeca1 owes a supplier on one order.
// Separate from the GST tax invoice (Bill To / Ship To / goods lines).

import PDFDocument from 'pdfkit';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { refreshSupplierPayable } from '@/modules/finance/supplierPayable.service';

const STATUS_LABEL: Record<string, string> = {
  pending_capture: 'Not paid',
  awaiting_completion: 'Not delivered',
  commission_unconfigured: 'No rate',
  fee_unknown: 'Fee missing',
  eligible: 'Ready',
  on_hold: 'Paused',
  in_batch: 'In a payment',
  settled: 'Paid',
  closed: 'Closed',
};

function inr(value: string | number | { toString(): string }): string {
  const n = Number(typeof value === 'object' ? value.toString() : value);
  const amount = (Number.isFinite(n) ? n : 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Helvetica has no rupee glyph; keep the amount readable in the PDF.
  return `Rs ${amount}`;
}

export async function generatePaymentInvoicePdf(
  orderId: string,
  vendorId?: string,
): Promise<{ pdf: Buffer; orderNumber: string }> {
  const order = await prisma.order.findFirst({
    where: vendorId ? { id: orderId, vendorId } : { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      vendor: { select: { businessName: true, displayName: true, vendorCode: true } },
    },
  });
  if (!order) throw Errors.notFound('Order');

  await refreshSupplierPayable(order.id);

  const line = await prisma.supplierPayableLine.findUnique({
    where: { orderId: order.id },
    select: {
      status: true,
      collectedAmount: true,
      razorpayFee: true,
      razorpayFeeUnknown: true,
      commissionAmount: true,
      netPayable: true,
      breakdown: true,
    },
  });
  if (!line) throw Errors.notFound('Payable');

  const breakdown = (line.breakdown ?? {}) as {
    ratePct?: string | null;
    quoteFee?: string;
    quoteFeeUnknown?: boolean;
    quoteCommission?: string;
    quoteNet?: string;
  };
  const preview = line.status === 'awaiting_completion' || line.status === 'pending_capture';
  const ratePct = breakdown.ratePct == null ? null : String(breakdown.ratePct);
  const supplier = (order.vendor.displayName?.trim() || order.vendor.businessName).trim();
  const statusLabel = STATUS_LABEL[line.status] ?? line.status;
  const feeUnknown = preview ? breakdown.quoteFeeUnknown === true : line.razorpayFeeUnknown;
  const feeAmount = preview ? (breakdown.quoteFee ?? 0) : (line.razorpayFee ?? 0);
  const commissionAmount = preview ? (breakdown.quoteCommission ?? 0) : line.commissionAmount;
  const netAmount = preview ? (breakdown.quoteNet ?? 0) : line.netPayable;
  const razorpayCut = feeUnknown ? 'Fee not received' : inr(feeAmount);
  const commissionLabel = ratePct == null
    ? 'Rate not set'
    : `${inr(commissionAmount)} (${ratePct}%)`;
  const toPay = preview && (feeUnknown || ratePct == null) ? '—' : inr(netAmount);

  const pdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const LEFT = 48;
    const PAGE_W = doc.page.width - 96;
    let y = 48;

    doc.font('Helvetica').fontSize(10).fillColor('#6B1D2E');
    doc.text('Horeca1', LEFT, y);
    y += 28;

    doc.font('Helvetica-Bold').fontSize(20).fillColor('#1C1C1C');
    doc.text('Payment invoice', LEFT, y);
    y += 28;

    doc.font('Helvetica').fontSize(11).fillColor('#1C1C1C');
    doc.text(`Supplier: ${supplier}`, LEFT, y, { width: PAGE_W });
    y += 16;
    if (order.vendor.vendorCode) {
      doc.text(`Code: ${order.vendor.vendorCode}`, LEFT, y, { width: PAGE_W });
      y += 16;
    }
    doc.text(`Order: ${order.orderNumber}`, LEFT, y, { width: PAGE_W });
    y += 16;
    doc.text(`Status: ${statusLabel}`, LEFT, y, { width: PAGE_W });
    y += 28;

    const rows: Array<{ label: string; value: string; strong?: boolean }> = [
      { label: 'Customer paid', value: inr(line.collectedAmount) },
      { label: 'Razorpay cut', value: razorpayCut },
      { label: 'Commission', value: commissionLabel },
      { label: 'To pay', value: toPay, strong: true },
    ];

    for (const row of rows) {
      doc.font('Helvetica').fontSize(10).fillColor('#667085');
      doc.text(row.label, LEFT, y, { width: PAGE_W / 2 });
      doc.font(row.strong ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(row.strong ? 14 : 11)
        .fillColor(row.strong ? '#6B1D2E' : '#1C1C1C');
      doc.text(row.value, LEFT + PAGE_W / 2, y, { width: PAGE_W / 2, align: 'right' });
      y += row.strong ? 28 : 22;
    }

    y += 12;
    doc.font('Helvetica').fontSize(10).fillColor('#667085');
    doc.text(
      'This is the amount Horeca1 transfers. It is not the goods tax invoice, and it does not call the bank.',
      LEFT,
      y,
      { width: PAGE_W },
    );

    doc.end();
  });

  return { pdf, orderNumber: order.orderNumber };
}
