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
  // Helvetica has no rupee glyph.
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
    [order.vendor.addressLine, order.vendor.city, order.vendor.state, order.vendor.addressPincode].filter(Boolean).join(', '),
    order.vendor.vendorCode ? `Code ${order.vendor.vendorCode}` : '',
    order.vendor.gstNumber ? `GSTIN ${order.vendor.gstNumber}` : '',
  ].filter((part) => part.trim().length > 0);

  const pdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 40;
    const right = doc.page.width - 40;
    const width = right - left;
    const logo = logoBuffer();

    doc.rect(0, 0, doc.page.width, 8).fill('#6B1D2E');

    if (logo) {
      doc.image(logo, left, 28, { height: 34 });
    } else {
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#6B1D2E').text('Horeca1', left, 34);
    }

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1C1C1C');
    doc.text('PAYMENT ADVICE', left, 28, { width, align: 'right', lineBreak: false });
    doc.font('Helvetica').fontSize(10).fillColor('#667085');
    doc.text(order.orderNumber, left, 50, { width, align: 'right', lineBreak: false });
    doc.text(formatDate(adviceDate), left, 64, { width, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(line.status === 'settled' ? '#16A34A' : '#6B1D2E');
    doc.text(statusLabel.toUpperCase(), left, 80, { width, align: 'right', lineBreak: false });

    doc.moveTo(left, 108).lineTo(right, 108).strokeColor('#E9E3DD').stroke();

    const boxTop = 124;
    const boxH = 88;
    const gap = 16;
    const boxW = (width - gap) / 2;
    doc.rect(left, boxTop, boxW, boxH).strokeColor('#E9E3DD').stroke();
    doc.rect(left + boxW + gap, boxTop, boxW, boxH).stroke();

    doc.font('Helvetica').fontSize(9).fillColor('#667085').text('FROM', left + 12, boxTop + 10, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1C1C1C').text('Horeca1', left + 12, boxTop + 26, { lineBreak: false });
    doc.font('Helvetica').fontSize(10).fillColor('#667085').text('Marketplace payout', left + 12, boxTop + 46, { lineBreak: false });

    const payeeX = left + boxW + gap + 12;
    doc.font('Helvetica').fontSize(9).fillColor('#667085').text('PAYEE', payeeX, boxTop + 10, { lineBreak: false });
    payeeLines.slice(0, 4).forEach((part, index) => {
      doc.font(index === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(index === 0 ? 12 : 10).fillColor('#1C1C1C');
      doc.text(part, payeeX, boxTop + 26 + index * 14, { width: boxW - 24, height: 14, ellipsis: true, lineBreak: false });
    });

    let y = boxTop + boxH + 28;
    doc.rect(left, y, width, 28).fill('#FAF7F2');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#667085');
    doc.text('DESCRIPTION', left + 12, y + 9);
    doc.text('AMOUNT', left, y + 9, { width: width - 12, align: 'right' });
    y += 28;

    const rows: Array<{ label: string; value: string; total?: boolean }> = [
      { label: 'Customer paid', value: inr(line.collectedAmount) },
      { label: 'Razorpay fee', value: razorpayCut },
      { label: commissionTitle, value: commissionLabel },
      { label: 'Amount payable', value: toPay, total: true },
    ];

    for (const row of rows) {
      const rowH = row.total ? 40 : 32;
      if (row.total) doc.rect(left, y, width, rowH).fill('#F8E8EC');
      doc.moveTo(left, y + rowH).lineTo(right, y + rowH).strokeColor('#E9E3DD').stroke();
      doc.font(row.total ? 'Helvetica-Bold' : 'Helvetica').fontSize(row.total ? 12 : 11);
      doc.fillColor(row.total ? '#6B1D2E' : '#1C1C1C');
      doc.text(row.label, left + 12, y + (row.total ? 13 : 9), { width: width * 0.62, lineBreak: false });
      doc.text(row.value, left, y + (row.total ? 13 : 9), { width: width - 12, align: 'right', lineBreak: false });
      y += rowH;
    }

    y += 22;
    doc.font('Helvetica').fontSize(10).fillColor('#1C1C1C');
    if (line.status === 'settled' && line.batch?.settledAt) {
      doc.text(`Paid on ${formatDate(line.batch.settledAt)}`, left, y);
      y += 16;
    }
    if (line.batch?.bankReference) {
      doc.text(`Bank reference  ${line.batch.bankReference}`, left, y);
      y += 16;
    }
    if (line.batch?.batchNumber) {
      doc.text(`Settlement  ${line.batch.batchNumber}`, left, y);
      y += 16;
    }

    y += 10;
    doc.font('Helvetica').fontSize(9).fillColor('#667085');
    doc.text(
      'This payment advice is the amount Horeca1 transfers to the supplier. It is not a tax invoice for goods, and it does not move money by itself.',
      left,
      y,
      { width },
    );

    doc.end();
  });

  return { pdf, orderNumber: order.orderNumber };
}
