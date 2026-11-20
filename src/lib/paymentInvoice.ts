// Payment advice for what Horeca1 transfers to a supplier on one order.
// Separate from the GST tax invoice (Bill To / Ship To / goods lines).

import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { refreshSupplierPayable } from '@/modules/finance/supplierPayable.service';

const STATUS_LABEL: Record<string, string> = {
  pending_capture: 'Not paid',
  awaiting_completion: 'Not delivered',
  commission_unconfigured: 'No rate',
  fee_unknown: 'Fee missing',
  eligible: 'Ready to Pay',
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
  // Helvetica in standard PDF does not have the INR glyph.
  return `Rs ${amount}`;
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function logoBuffer(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), 'public', 'Horeca1.png'));
  } catch {
    return null;
  }
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
      createdAt: true,
      deliveredAt: true,
      vendor: {
        select: {
          businessName: true,
          displayName: true,
          vendorCode: true,
          addressLine: true,
          city: true,
          state: true,
          addressPincode: true,
          gstNumber: true,
        },
      },
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
      calculatedAt: true,
      breakdown: true,
      batch: { select: { batchNumber: true, bankReference: true, settledAt: true, status: true } },
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
  const razorpayCut = feeUnknown ? 'Not received yet' : inr(feeAmount);
  const commissionLabel = ratePct == null ? 'Rate not set' : inr(commissionAmount);
  const commissionTitle = ratePct == null ? 'Horeca1 commission' : `Horeca1 commission (${ratePct}%)`;
  const toPay = preview && (feeUnknown || ratePct == null) ? 'Not ready' : inr(netAmount);
  const adviceDate = line.batch?.settledAt ?? order.deliveredAt ?? line.calculatedAt;
  const payeeLines = [
    supplier,
    [order.vendor.addressLine, order.vendor.city, order.vendor.state, order.vendor.addressPincode]
      .filter(Boolean)
      .join(', '),
    order.vendor.vendorCode ? `Supplier Code: ${order.vendor.vendorCode}` : '',
    order.vendor.gstNumber ? `GSTIN: ${order.vendor.gstNumber}` : '',
  ].filter((part) => part.trim().length > 0);

  const pdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 48;
    const right = doc.page.width - 48;
    const width = right - left;
    const logo = logoBuffer();

    // Top Brand Burgundy Bar
    doc.rect(0, 0, doc.page.width, 10).fill('#6B1D2E');

    // Brand Logo / Title
    if (logo) {
      doc.image(logo, left, 28, { height: 34 });
    } else {
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#6B1D2E').text('Horeca1', left, 32, { lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor('#667085').text('B2B HOSPITALITY MARKETPLACE', left, 54, { lineBreak: false });
    }

    // Document Header Right
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1C1C1C');
    doc.text('PAYMENT ADVICE', left, 28, { width, align: 'right', lineBreak: false });
    doc.font('Helvetica').fontSize(10).fillColor('#667085');
    doc.text(`Order  ${order.orderNumber}`, left, 50, { width, align: 'right', lineBreak: false });
    doc.text(`Date  ${formatDate(adviceDate)}`, left, 64, { width, align: 'right', lineBreak: false });

    // Status Badge
    const isSettled = line.status === 'settled';
    doc.font('Helvetica-Bold').fontSize(10).fillColor(isSettled ? '#16A34A' : '#6B1D2E');
    doc.text(statusLabel.toUpperCase(), left, 80, { width, align: 'right', lineBreak: false });

    // Horizontal Divider
    doc.moveTo(left, 104).lineTo(right, 104).strokeColor('#E9E3DD').lineWidth(1).stroke();

    // Side-by-side From and Payee Cards
    const boxTop = 118;
    const boxH = 108;
    const gap = 16;
    const boxW = (width - gap) / 2;

    // Card Backgrounds
    doc.save();
    doc.roundedRect(left, boxTop, boxW, boxH, 6).fillAndStroke('#FAF7F2', '#E9E3DD');
    doc.roundedRect(left + boxW + gap, boxTop, boxW, boxH, 6).fillAndStroke('#FAF7F2', '#E9E3DD');
    doc.restore();

    // FROM Card Details
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#667085').text('FROM (PAYER)', left + 14, boxTop + 14, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#1C1C1C').text('Horeca1', left + 14, boxTop + 32, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor('#667085').text('Horeca Consumer Goods Marketplace', left + 14, boxTop + 50, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor('#667085').text('Marketplace Settlement & Payables', left + 14, boxTop + 65, { lineBreak: false });
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#9A3412').text('Does not initiate a bank transfer', left + 14, boxTop + 84, { lineBreak: false });

    // PAYEE Card Details
    const payeeX = left + boxW + gap + 14;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#667085').text('PAYEE (SUPPLIER)', payeeX, boxTop + 14, { lineBreak: false });
    payeeLines.slice(0, 4).forEach((part, index) => {
      doc.font(index === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(index === 0 ? 12 : 9)
        .fillColor(index === 0 ? '#1C1C1C' : '#667085');
      doc.text(part, payeeX, boxTop + 32 + index * 16, { width: boxW - 28, height: 16, ellipsis: true, lineBreak: false });
    });

    // Itemized Financial Table
    let y = boxTop + boxH + 24;

    // Table Header
    doc.save();
    doc.roundedRect(left, y, width, 26, 4).fillAndStroke('#FAF7F2', '#E9E3DD');
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#667085');
    doc.text('DESCRIPTION', left + 14, y + 8, { lineBreak: false });
    doc.text('AMOUNT', left, y + 8, { width: width - 14, align: 'right', lineBreak: false });
    y += 26;

    const rows: Array<{ label: string; value: string; total?: boolean }> = [
      { label: 'Customer paid (gross captured amount)', value: inr(line.collectedAmount) },
      { label: 'Razorpay payment gateway fee', value: razorpayCut },
      { label: commissionTitle, value: commissionLabel },
      { label: 'Amount payable (Net to Supplier)', value: toPay, total: true },
    ];

    for (const row of rows) {
      const rowH = row.total ? 40 : 32;
      if (row.total) {
        doc.save();
        doc.roundedRect(left, y, width, rowH, 4).fillAndStroke('#F8E8EC', '#F3D7DE');
        doc.restore();
      } else {
        doc.moveTo(left, y + rowH).lineTo(right, y + rowH).strokeColor('#E9E3DD').lineWidth(0.75).stroke();
      }

      doc.font(row.total ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(row.total ? 11 : 10)
        .fillColor(row.total ? '#6B1D2E' : '#1C1C1C');

      doc.text(row.label, left + 14, y + (row.total ? 14 : 10), { width: width * 0.65, lineBreak: false });
      doc.text(row.value, left, y + (row.total ? 14 : 10), { width: width - 14, align: 'right', lineBreak: false });
      y += rowH;
    }

    // Settlement Details Card (When Paid)
    const paidFacts = [
      line.status === 'settled' && line.batch?.settledAt ? `Paid Date:  ${formatDate(line.batch.settledAt)}` : '',
      line.batch?.bankReference ? `Bank Reference (UTR):  ${line.batch.bankReference}` : '',
      line.batch?.batchNumber ? `Settlement Number:  ${line.batch.batchNumber}` : '',
    ].filter((fact) => fact.length > 0);

    y += 20;
    if (paidFacts.length > 0) {
      const box = 22 + paidFacts.length * 18;
      doc.save();
      doc.roundedRect(left, y, width, box, 6).fillAndStroke('#F0FDF4', '#DCFCE7');
      doc.restore();

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#166534').text('SETTLEMENT CONFIRMATION', left + 14, y + 10, { lineBreak: false });
      doc.font('Helvetica').fontSize(9).fillColor('#166534');
      paidFacts.forEach((fact, index) => {
        doc.text(fact, left + 14, y + 26 + index * 16, { width: width - 28, lineBreak: false });
      });
      y += box + 16;
    }

    // Bottom Disclaimer Footer
    y = Math.max(y + 10, doc.page.height - 75);
    doc.moveTo(left, y - 10).lineTo(right, y - 10).strokeColor('#E9E3DD').lineWidth(0.75).stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#667085');
    doc.text(
      'Notice: This payment advice represents the marketplace calculation and recorded payout amount from Horeca1 to the supplier. It is not a goods tax invoice, does not replace a vendor tax filing, and does not initiate or verify a bank transfer.',
      left,
      y,
      { width, lineGap: 3 },
    );

    doc.end();
  });

  return { pdf, orderNumber: order.orderNumber };
}
