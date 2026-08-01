// Thin credit-note PDF parallel to invoice.ts — references original invoiceNumber.
// No Invoice Prisma model; CN number lives on ReturnRequest.creditNoteNumber.

import PDFDocument from 'pdfkit';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';

export async function generateCreditNotePdf(returnRequestId: string): Promise<Buffer> {
  const ret = await prisma.returnRequest.findUnique({
    where: { id: returnRequestId },
    include: {
      customer: {
        select: { fullName: true, businessName: true, email: true, phone: true, gstNumber: true },
      },
      items: {
        include: {
          orderItem: {
            select: {
              productName: true,
              productSku: true,
              hsn: true,
              unitPrice: true,
              taxPercent: true,
              packSize: true,
            },
          },
        },
      },
      order: {
        include: {
          vendor: {
            include: { user: { select: { gstNumber: true } } },
          },
          businessAccount: {
            select: {
              gstin: true,
              displayName: true,
              legalName: true,
              billingAddressLine: true,
              billingCity: true,
              billingState: true,
              billingPincode: true,
            },
          },
          outlet: {
            select: { name: true, addressLine: true, city: true, state: true, pincode: true },
          },
        },
      },
    },
  });

  if (!ret) throw Errors.notFound('Return request');
  if (!ret.creditNoteNumber) {
    throw Errors.badRequest('Credit note has not been generated for this return');
  }

  const amount = Number(ret.creditNoteAmount ?? ret.refundAmount ?? 0);
  const invoiceRef = ret.invoiceNumber ?? ret.order.orderNumber;
  const buyerName =
    ret.order.businessAccount?.displayName ||
    ret.order.businessAccount?.legalName ||
    ret.customer.businessName ||
    ret.customer.fullName;
  const vendorGstin = ret.order.vendor.gstNumber || ret.order.vendor.user?.gstNumber || '—';
  const buyerGstin = ret.order.businessAccount?.gstin || ret.customer.gstNumber || '—';

  const vendorAddr = [
    ret.order.vendor.addressLine,
    ret.order.vendor.city,
    ret.order.vendor.state
      ? `${ret.order.vendor.state}${ret.order.vendor.addressPincode ? `-${ret.order.vendor.addressPincode}` : ''}`
      : ret.order.vendor.addressPincode,
  ]
    .filter(Boolean)
    .join(', ') || '—';

  const buyerAddr = [
    ret.order.businessAccount?.billingAddressLine || ret.order.outlet?.addressLine,
    ret.order.businessAccount?.billingCity || ret.order.outlet?.city,
    (ret.order.businessAccount?.billingState || ret.order.outlet?.state)
      ? `${ret.order.businessAccount?.billingState || ret.order.outlet?.state}${
          (ret.order.businessAccount?.billingPincode || ret.order.outlet?.pincode)
            ? `-${ret.order.businessAccount?.billingPincode || ret.order.outlet?.pincode}`
            : ''
        }`
      : ret.order.businessAccount?.billingPincode || ret.order.outlet?.pincode,
  ]
    .filter(Boolean)
    .join(', ') || '—';

  const cnDate = new Date(ret.updatedAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const approvedLines = ret.items.filter(
    (i) => i.decision === 'approved' || i.decision === 'partial',
  );

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_W = doc.page.width - 80;
    const LEFT = 40;

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#222');
    doc.text(ret.order.vendor.businessName, LEFT, 40, { width: PAGE_W / 2 });
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#000');
    doc.text('CREDIT NOTE', LEFT, 40, { width: PAGE_W, align: 'center' });

    let y = 75;
    doc.font('Helvetica').fontSize(9).fillColor('#000');
    doc.text(`Credit Note No: ${ret.creditNoteNumber}`, LEFT, y);
    doc.text(`Date: ${cnDate}`, LEFT + PAGE_W / 2, y, { width: PAGE_W / 2, align: 'right' });
    y += 16;
    doc.text(`Against Invoice: ${invoiceRef}`, LEFT, y);
    doc.text(`Order: ${ret.order.orderNumber}`, LEFT + PAGE_W / 2, y, {
      width: PAGE_W / 2,
      align: 'right',
    });
    y += 16;
    doc.text(`Return ID: ${ret.id.slice(0, 8).toUpperCase()}`, LEFT, y);
    y += 24;

    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('From (Vendor)', LEFT, y);
    doc.text('To (Buyer)', LEFT + PAGE_W / 2, y);
    y += 14;
    doc.font('Helvetica').fontSize(9);
    doc.text(ret.order.vendor.businessName, LEFT, y, { width: PAGE_W / 2 - 10 });
    doc.text(buyerName, LEFT + PAGE_W / 2, y, { width: PAGE_W / 2 - 10 });
    y += 12;
    doc.text(vendorAddr, LEFT, y, { width: PAGE_W / 2 - 10 });
    doc.text(buyerAddr, LEFT + PAGE_W / 2, y, { width: PAGE_W / 2 - 10 });
    y += 28;
    doc.text(`GSTIN: ${vendorGstin}`, LEFT, y);
    doc.text(`GSTIN: ${buyerGstin}`, LEFT + PAGE_W / 2, y);
    y += 28;

    // Table header
    doc.font('Helvetica-Bold').fontSize(9);
    doc.rect(LEFT, y, PAGE_W, 20).stroke();
    doc.text('#', LEFT + 4, y + 5, { width: 24 });
    doc.text('Item', LEFT + 30, y + 5, { width: PAGE_W * 0.4 });
    doc.text('Qty', LEFT + PAGE_W * 0.5, y + 5, { width: 40 });
    doc.text('Unit Price', LEFT + PAGE_W * 0.6, y + 5, { width: 70 });
    doc.text('Amount', LEFT + PAGE_W * 0.8, y + 5, { width: 80, align: 'right' });
    y += 20;

    doc.font('Helvetica').fontSize(8.5);
    let lineTotal = 0;
    if (approvedLines.length === 0) {
      doc.rect(LEFT, y, PAGE_W, 22).stroke();
      doc.text('Return credit (no line breakdown)', LEFT + 4, y + 6, { width: PAGE_W - 100 });
      doc.text(`₹${amount.toFixed(2)}`, LEFT + PAGE_W * 0.8, y + 6, {
        width: 80,
        align: 'right',
      });
      lineTotal = amount;
      y += 22;
    } else {
      approvedLines.forEach((line, idx) => {
        const qty = line.approvedQty ?? line.requestedQty;
        const unit = Number(line.orderItem.unitPrice);
        const rowAmt = Math.round(unit * qty * 100) / 100;
        lineTotal += rowAmt;
        const rowH = 22;
        doc.rect(LEFT, y, PAGE_W, rowH).stroke();
        doc.text(String(idx + 1), LEFT + 4, y + 6, { width: 24 });
        doc.text(line.orderItem.productName, LEFT + 30, y + 6, { width: PAGE_W * 0.4 });
        doc.text(String(qty), LEFT + PAGE_W * 0.5, y + 6, { width: 40 });
        doc.text(`₹${unit.toFixed(2)}`, LEFT + PAGE_W * 0.6, y + 6, { width: 70 });
        doc.text(`₹${rowAmt.toFixed(2)}`, LEFT + PAGE_W * 0.8, y + 6, {
          width: 80,
          align: 'right',
        });
        y += rowH;
      });
    }

    y += 12;
    const creditAmount = amount > 0 ? amount : lineTotal;
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text(`Credit Amount: ₹${creditAmount.toFixed(2)}`, LEFT, y, {
      width: PAGE_W,
      align: 'right',
    });
    y += 28;

    if (ret.adminNote) {
      doc.font('Helvetica').fontSize(8).fillColor('#444');
      doc.text(`Notes: ${ret.adminNote}`, LEFT, y, { width: PAGE_W });
      y += 20;
    }

    doc.font('Helvetica').fontSize(7).fillColor('#666');
    doc.text(
      'This credit note is issued against the referenced tax invoice. ' +
        'Retain for your records. Generated by HoReCa Hub.',
      LEFT,
      Math.max(y, 720),
      { width: PAGE_W },
    );

    doc.end();
  });
}
