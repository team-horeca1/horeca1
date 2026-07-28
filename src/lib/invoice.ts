// WHY: Indian B2B buyers need GST-compliant tax invoices to claim input credit.
// Layout mirrors Zomato Hyperpure tax invoice: bordered metadata grid, Bill From /
// Shipped From / Bill To / Ship To boxes, category-grouped items table with HSN,
// CGST+SGST split, taxable + tax breakdown row, amount-in-words, declaration block.

import PDFDocument from 'pdfkit';
import { prisma } from '@/lib/prisma';
import { buildInvoiceLineItems, type InvoiceItem } from '@/lib/invoice-items';
import {
  formatLineTaxRate,
  resolveState,
  resolveSupplyType,
  splitGstTax,
} from '@/lib/gstPlaceOfSupply';

// --------------------------------------------------------------------------
// Main export
// --------------------------------------------------------------------------

export async function generateInvoicePdf(orderId: string): Promise<Buffer> {
  // ── 1. Fetch order from DB ───────────────────────────────────────────────
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      user: true,
      vendor: { include: { user: true } },
      items: {
        include: {
          product: {
            include: { category: true },
          },
        },
      },
      deliverySlot: true,
      payments: { take: 1, orderBy: { createdAt: 'desc' } },
    },
  });

  // Buyer ship-to: pull user's default saved address separately (avoids nested
  // select/include quirks on the User relation).
  const buyerAddr = await prisma.savedAddress.findFirst({
    where: { userId: order.userId, isDefault: true },
  }) ?? await prisma.savedAddress.findFirst({
    where: { userId: order.userId },
    orderBy: { createdAt: 'desc' },
  });
  const buyerStateForSupply = buyerAddr?.state ?? '—';

  // ── 2. Build line-item data ──────────────────────────────────────────────
  // Partial fulfilment: when a vendor accepts only part of an order, the order
  // total is recalculated against fulfilledQty but the line rows keep their
  // ordered quantity. The invoice must bill what was actually fulfilled, so for
  // a partial order we use fulfilledQty and drop lines that were not fulfilled
  // at all. Non-partial orders bill the ordered quantity as before.
  const items: InvoiceItem[] = buildInvoiceLineItems(order);

  // Group items by category (Hyperpure-style sub-headers)
  const itemsByCategory = new Map<string, InvoiceItem[]>();
  for (const item of items) {
    const list = itemsByCategory.get(item.category) ?? [];
    list.push(item);
    itemsByCategory.set(item.category, list);
  }

  const totalPreTax = items.reduce((s, i) => s + i.preTax, 0);
  const totalDiscount = items.reduce((s, i) => s + i.discount, 0);
  const totalTaxable = items.reduce((s, i) => s + i.taxableAmount, 0);
  const totalTax = items.reduce((s, i) => s + i.taxAmount, 0);
  const grandTotal = totalTaxable + totalTax;

  // Place of supply: seller (vendor address / GSTIN) vs buyer (ship-to / GSTIN).
  const sellerState = resolveState({
    state: order.vendor.state,
    gstin: order.vendor.gstNumber,
  });
  const buyerState = resolveState({
    state: buyerAddr?.state,
    gstin: order.user.gstNumber,
  });
  const supplyType = resolveSupplyType(sellerState, buyerState);
  const { cgst, sgst, igst } = splitGstTax(totalTax, supplyType);
  const cess = 0;

  // ── 3. Build PDF ─────────────────────────────────────────────────────────
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_W = doc.page.width - 60; // 535 with 30pt margins
    const LEFT = 30;

    // Helper — draw a bordered cell with optional label + value
    const cell = (
      x: number, y: number, w: number, h: number,
      label: string | null, value: string,
      opts: { bold?: boolean; valueSize?: number; labelSize?: number; align?: 'left' | 'center' | 'right' } = {}
    ) => {
      doc.lineWidth(0.6).strokeColor('#000').rect(x, y, w, h).stroke();
      const padX = 4;
      if (label) {
        doc.font('Helvetica').fontSize(opts.labelSize ?? 7).fillColor('#444');
        doc.text(label, x + padX, y + 3, { width: w - padX * 2, align: opts.align ?? 'left' });
      }
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.valueSize ?? 9).fillColor('#000');
      const valY = label ? y + 14 : y + 4;
      doc.text(value, x + padX, valY, { width: w - padX * 2, align: opts.align ?? 'left' });
    };

    // ── Top right: Pg, Route, Invoice Count ─────────────────────────────────
    doc.font('Helvetica').fontSize(8).fillColor('#000');
    doc.text('Pg 1 of 1', LEFT, 35, { width: PAGE_W, align: 'right' });

    // ── Header band: Logo (left) + TAX INVOICE (center) + Route (right) ─────
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#222');
    doc.text(order.vendor.businessName, LEFT, 50, { width: PAGE_W / 2 - 10 });
    doc.font('Helvetica').fontSize(7).fillColor('#666');
    doc.text('Vendor', LEFT, 68);

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#000');
    doc.text('TAX INVOICE', LEFT, 50, { width: PAGE_W, align: 'center' });

    doc.font('Helvetica').fontSize(8).fillColor('#000');
    doc.text('Route No:  ---', LEFT, 50, { width: PAGE_W, align: 'right' });
    doc.text('Invoice Count: 1', LEFT, 64, { width: PAGE_W, align: 'right' });

    let y = 90;

    // ── Metadata grid: 2 rows × 4 columns ───────────────────────────────────
    const colW = PAGE_W / 4;
    const cellH = 32;

    const lastPayment = order.payments[0];
    const lastPaymentDate = lastPayment?.status === 'captured'
      ? new Date(order.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '-';
    const slot = order.deliverySlot
      ? `Between ${order.deliverySlot.slotStart} and ${order.deliverySlot.slotEnd}`
      : '-';
    const invDate = new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    // Row 1
    cell(LEFT,           y, colW, cellH, 'Invoice Number',     order.orderNumber, { bold: true });
    cell(LEFT + colW,     y, colW, cellH, 'Order No.',          order.orderNumber, { bold: true });
    cell(LEFT + colW * 2, y, colW, cellH, 'Invoice Date',       invDate);
    cell(LEFT + colW * 3, y, colW, cellH, 'Last Payment Date',  lastPaymentDate);
    y += cellH;

    // Row 2
    cell(LEFT,           y, colW, cellH, 'Order Date',          invDate);
    cell(LEFT + colW,     y, colW, cellH, 'Delivery Time Slot', slot);
    cell(LEFT + colW * 2, y, colW, cellH, 'Reference PO',       '-');
    cell(LEFT + colW * 3, y, colW, cellH, 'Payment Status',     order.paymentStatus);
    y += cellH + 4;

    // ── Bill From / Shipped From boxes ──────────────────────────────────────
    // Compose vendor address from the registered fields. Empty parts dropped so the
    // line collapses cleanly when only some fields are filled.
    const vendorAddrParts = [
      order.vendor.addressLine,
      order.vendor.city,
      order.vendor.state ? `${order.vendor.state}${order.vendor.addressPincode ? '-' + order.vendor.addressPincode : ''}` : (order.vendor.addressPincode || null),
    ].filter(Boolean) as string[];
    const vendorAddrText = vendorAddrParts.length > 0 ? vendorAddrParts.join(', ') : '— Address not on file (vendor: set it in Settings)';
    const vendorGstin = order.vendor.gstNumber || order.vendor.user?.gstNumber || '—';

    const partyH = 64;
    const drawParty = (yStart: number, label: string) => {
      doc.lineWidth(0.6).strokeColor('#000').rect(LEFT, yStart, PAGE_W, partyH).stroke();
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
      doc.text(`${label} :`, LEFT + 5, yStart + 5);
      doc.font('Helvetica').fontSize(9);
      doc.text(order.vendor.businessName, LEFT + 100, yStart + 5, { width: PAGE_W - 110 });
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Address  :', LEFT + 5, yStart + 22);
      doc.font('Helvetica').fontSize(8.5);
      doc.text(vendorAddrText, LEFT + 100, yStart + 22, { width: PAGE_W - 110 });
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('GSTIN  :', LEFT + 5, yStart + 48);
      doc.font('Helvetica').fontSize(9);
      doc.text(vendorGstin, LEFT + 100, yStart + 48, { width: PAGE_W - 110 });
    };

    drawParty(y, 'Bill From');
    y += partyH;
    drawParty(y, 'Shipped From');
    y += partyH + 4;

    // ── Bill To / Ship To (2-col) ───────────────────────────────────────────
    const halfW = PAGE_W / 2;
    const buyerH = 110;

    const drawBuyer = (xStart: number, label: string) => {
      doc.lineWidth(0.6).strokeColor('#000').rect(xStart, y, halfW, buyerH).stroke();
      const lx = xStart + 5;
      const vx = xStart + 70;
      let by = y + 5;

      const line = (k: string, v: string) => {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000').text(k, lx, by);
        doc.font('Helvetica').fontSize(8.5).text(v, vx, by, { width: halfW - 75 });
        const lines = Math.max(1, Math.ceil(v.length / 38));
        by += 4 + Math.max(11, lines * 10);
      };

      doc.font('Helvetica-Bold').fontSize(9).text(`${label} :`, lx, by);
      by += 14;
      const noAddrHint = '— (buyer: add address in profile)';
      line('Outlet :',          order.user.businessName ?? order.user.fullName);
      line('Address :',         buyerAddr?.fullAddress ?? noAddrHint);
      line('Pincode :',         buyerAddr?.pincode ?? '—');
      line('Place of Supply :', buyerStateForSupply);
      line('GSTIN :',           order.user.gstNumber ?? '—');
    };

    drawBuyer(LEFT, 'Bill To');
    drawBuyer(LEFT + halfW, 'Ship To');
    y += buyerH + 6;

    // ── Items table ─────────────────────────────────────────────────────────
    // Columns: Sl | Description | HSN | Qty.Del. | Unit Price | UoM | Pre Tax | Disc | Taxable | Tax Rate | Tax Amt | Total
    const COL = {
      sl:      { x: LEFT,                     w: 22 },
      desc:    { x: LEFT + 22,                w: 110 },
      hsn:     { x: LEFT + 132,                w: 38 },
      qty:     { x: LEFT + 170,                w: 26 },
      unit:    { x: LEFT + 196,                w: 38 },
      uom:     { x: LEFT + 234,                w: 28 },
      preTax:  { x: LEFT + 262,                w: 38 },
      disc:    { x: LEFT + 300,                w: 35 },
      taxable: { x: LEFT + 335,                w: 42 },
      taxRate: { x: LEFT + 377,                w: 50 },
      taxAmt:  { x: LEFT + 427,                w: 38 },
      total:   { x: LEFT + 465,                w: PAGE_W - 465 },
    };

    const headerH = 36;

    // Header
    doc.lineWidth(0.6).strokeColor('#000');
    doc.rect(LEFT, y, PAGE_W, headerH).stroke();
    Object.values(COL).forEach((c, idx) => {
      if (idx > 0) doc.moveTo(c.x, y).lineTo(c.x, y + headerH).stroke();
    });

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000');
    const drawHeader = (label: string, c: { x: number; w: number }) => {
      doc.text(label, c.x + 1, y + 4, { width: c.w - 2, align: 'center' });
    };
    drawHeader('Sl\nNo.',                  COL.sl);
    drawHeader('Description of Goods',     COL.desc);
    drawHeader('HSN',                       COL.hsn);
    drawHeader('Qty.\nDel.',               COL.qty);
    drawHeader('Unit Price',               COL.unit);
    drawHeader('UoM',                       COL.uom);
    drawHeader('Pre Tax',                  COL.preTax);
    drawHeader('Total\nDiscount\nValue',   COL.disc);
    drawHeader('Taxable\nAmount',          COL.taxable);
    drawHeader('Tax Rate\n(CGST+SGST+IGST+\nCESS)%', COL.taxRate);
    drawHeader('Total Tax\nAmount',        COL.taxAmt);
    drawHeader('Total',                     COL.total);
    y += headerH;

    // Body — group by category
    doc.font('Helvetica').fontSize(8).fillColor('#000');
    let serial = 1;
    for (const [categoryName, list] of itemsByCategory) {
      // Category band
      const bandH = 14;
      doc.rect(LEFT, y, PAGE_W, bandH).fillAndStroke('#f0f0f0', '#000');
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(8.5);
      doc.text(categoryName, LEFT, y + 3, { width: PAGE_W, align: 'center' });
      y += bandH;
      doc.font('Helvetica').fontSize(8);

      for (const item of list) {
        const lines = Math.max(1, Math.ceil(item.productName.length / 28));
        const rowH = Math.max(20, lines * 10 + 8);

        doc.lineWidth(0.4).strokeColor('#000').rect(LEFT, y, PAGE_W, rowH).stroke();
        Object.values(COL).forEach((c, idx) => {
          if (idx > 0) doc.moveTo(c.x, y).lineTo(c.x, y + rowH).stroke();
        });

        doc.fillColor('#000').font('Helvetica').fontSize(8);
        doc.text(String(serial++), COL.sl.x + 1, y + 4, { width: COL.sl.w - 2, align: 'center' });
        doc.text(item.productName,  COL.desc.x + 2, y + 4, { width: COL.desc.w - 4 });
        doc.text(item.hsn ?? '-',   COL.hsn.x + 1, y + 4, { width: COL.hsn.w - 2, align: 'center' });
        doc.text(String(item.quantity), COL.qty.x, y + 4, { width: COL.qty.w, align: 'center' });
        doc.text(fmtNum(item.unitPrice), COL.unit.x, y + 4, { width: COL.unit.w - 2, align: 'right' });
        doc.text(item.unit,         COL.uom.x, y + 4, { width: COL.uom.w, align: 'center' });
        doc.text(fmtNum(item.preTax), COL.preTax.x, y + 4, { width: COL.preTax.w - 2, align: 'right' });
        doc.text(fmtNum(item.discount), COL.disc.x, y + 4, { width: COL.disc.w - 2, align: 'right' });
        doc.text(fmtNum(item.taxableAmount), COL.taxable.x, y + 4, { width: COL.taxable.w - 2, align: 'right' });
        doc.text(formatLineTaxRate(item.taxPercent, supplyType), COL.taxRate.x, y + 4, { width: COL.taxRate.w, align: 'center' });
        doc.text(fmtNum(item.taxAmount), COL.taxAmt.x, y + 4, { width: COL.taxAmt.w - 2, align: 'right' });
        doc.text(fmtNum(item.total), COL.total.x, y + 4, { width: COL.total.w - 2, align: 'right' });

        y += rowH;
      }
    }

    // Other Charges band
    const otherBandH = 14;
    doc.rect(LEFT, y, PAGE_W, otherBandH).fillAndStroke('#f0f0f0', '#000');
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(8.5);
    doc.text('Other Charges', LEFT, y + 3, { width: PAGE_W, align: 'center' });
    y += otherBandH;

    // Total row (across the items table)
    const totalRowH = 18;
    doc.lineWidth(0.4).strokeColor('#000').rect(LEFT, y, PAGE_W, totalRowH).stroke();
    Object.values(COL).forEach((c, idx) => {
      if (idx > 0) doc.moveTo(c.x, y).lineTo(c.x, y + totalRowH).stroke();
    });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000');
    doc.text('Total', COL.sl.x, y + 5, { width: COL.sl.w + COL.desc.w + COL.hsn.w + COL.qty.w + COL.unit.w + COL.uom.w, align: 'left' });
    doc.text(fmtNum(totalPreTax), COL.preTax.x, y + 5, { width: COL.preTax.w - 2, align: 'right' });
    doc.text(fmtNum(totalDiscount), COL.disc.x, y + 5, { width: COL.disc.w - 2, align: 'right' });
    doc.text(fmtNum(totalTaxable), COL.taxable.x, y + 5, { width: COL.taxable.w - 2, align: 'right' });
    doc.text(fmtNum(totalTax), COL.taxAmt.x, y + 5, { width: COL.taxAmt.w - 2, align: 'right' });
    doc.text(fmtNum(grandTotal), COL.total.x, y + 5, { width: COL.total.w - 2, align: 'right' });
    y += totalRowH;

    // ── Amount Chargeable + summary box ─────────────────────────────────────
    const summaryH = 22;
    doc.lineWidth(0.6).strokeColor('#000').rect(LEFT, y, PAGE_W, summaryH).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5);
    doc.text('Amount Chargeable (in words):', LEFT + 5, y + 6);
    doc.font('Helvetica').fontSize(8.5);
    doc.text(`INR ${numberToIndianWords(grandTotal)} Only`, LEFT + 165, y + 6, { width: PAGE_W - 230 });
    doc.font('Helvetica-Bold').fontSize(8.5);
    doc.text('E. & O.E', LEFT + PAGE_W - 60, y + 6, { width: 55, align: 'right' });
    y += summaryH;

    // ── Tax breakdown row: Total Taxable | IGST | CESS | CGST | SGST | Total
    const breakdownColW = PAGE_W / 6;
    const bdH = 32;
    const drawBdCell = (i: number, label: string, value: string) => {
      const x = LEFT + i * breakdownColW;
      doc.lineWidth(0.6).strokeColor('#000').rect(x, y, breakdownColW, bdH).stroke();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000');
      doc.text(label, x + 2, y + 4, { width: breakdownColW - 4, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text(value, x + 2, y + 17, { width: breakdownColW - 4, align: 'center' });
    };
    drawBdCell(0, 'Total Taxable Amount(in Rs)', fmtNum(totalTaxable));
    drawBdCell(1, 'IGST Amount',                fmtNum(igst));
    drawBdCell(2, 'CESS Amount',                fmtNum(cess));
    drawBdCell(3, 'CGST Amount',                fmtNum(cgst));
    drawBdCell(4, 'SGST Amount',                fmtNum(sgst));
    drawBdCell(5, 'Total Tax Amount',           fmtNum(totalTax));
    y += bdH + 4;

    // ── IRN row ─────────────────────────────────────────────────────────────
    const irnH = 16;
    doc.lineWidth(0.6).strokeColor('#000').rect(LEFT, y, PAGE_W, irnH).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5);
    doc.text('IRN', LEFT + 5, y + 4);
    doc.font('Helvetica').fontSize(8);
    doc.text('—', LEFT + 40, y + 4, { width: PAGE_W - 50 });
    y += irnH + 4;

    // ── Declaration ─────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    doc.text('Declaration', LEFT, y);
    y += 12;
    doc.font('Helvetica').fontSize(8).fillColor('#222');
    doc.text(
      'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. In case of any rejections or quality complaints, please mention the same on the invoice copy itself at the time of accepting delivery. Credit Notes will only be issued on the basis of any requests done on the copy of the invoice.',
      LEFT, y, { width: PAGE_W, align: 'left' }
    );
    y = doc.y + 10;

    // Underline (red-ish)
    doc.lineWidth(1).strokeColor('#c0392b').moveTo(LEFT, y).lineTo(LEFT + PAGE_W, y).stroke();
    y += 12;

    // ── Footer: registered company info ─────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    doc.text(`${order.vendor.businessName.toUpperCase()} (Registered on HoReCa Hub)`, LEFT, y, { width: PAGE_W, align: 'center' });
    y += 12;
    doc.font('Helvetica').fontSize(8).fillColor('#222');
    const footerLine1 = `Phone: ${order.vendor.user?.phone ?? '—'}    Email: ${order.vendor.user?.email ?? '—'}`;
    doc.text(footerLine1, LEFT, y, { width: PAGE_W, align: 'center' });

    doc.end();
  });
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function fmtNum(amount: number): string {
  return amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Convert a number to Indian-English words (rupees + paise).
// Handles 0 to ~99 crore.
function numberToIndianWords(n: number): string {
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  let result = inWords(rupees) + ' Rupees';
  if (paise > 0) result += ` and ${inWords(paise)} Paise`;
  return result;
}

function inWords(num: number): string {
  if (num === 0) return 'Zero';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigit = (n: number): string => {
    if (n < 20) return a[n];
    return (b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '')).trim();
  };
  const threeDigit = (n: number): string => {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return ((h ? a[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? twoDigit(r) : '')).trim();
  };

  if (num < 0) return 'Minus ' + inWords(-num);

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rest = num % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${twoDigit(crore)} Crore`);
  if (lakh) parts.push(`${twoDigit(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigit(thousand)} Thousand`);
  if (rest) parts.push(threeDigit(rest));
  return parts.join(' ');
}
