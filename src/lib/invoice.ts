// WHY: Indian B2B buyers need GST-compliant tax invoices to claim input credit.
// Layout mirrors Zomato Hyperpure tax invoice: bordered metadata grid, Bill From /
// Shipped From / Bill To / Ship To boxes, category-grouped items table with HSN,
// CGST+SGST split, taxable + tax breakdown row, amount-in-words, declaration block.

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { CUSTOMER_CARE_WHATSAPP_URL } from '@/lib/customerCare';
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
      outlet: { select: { id: true, name: true, addressLine: true, city: true, state: true, pincode: true } },
      businessAccount: {
        select: {
          gstin: true,
          billingAddressLine: true,
          billingCity: true,
          billingState: true,
          billingPincode: true,
          displayName: true,
          legalName: true,
        },
      },
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

  // Buyer ship-to fallback only — primary source is order.deliveryAddressSnapshot.
  const buyerSavedAddr = await prisma.savedAddress.findFirst({
    where: { userId: order.userId, isDefault: true },
  }) ?? await prisma.savedAddress.findFirst({
    where: { userId: order.userId },
    orderBy: { createdAt: 'desc' },
  });

  type SnapshotAddr = {
    name?: string | null;
    addressLine?: string | null;
    flatInfo?: string | null;
    landmark?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
  };
  const snap = (order.deliveryAddressSnapshot ?? null) as SnapshotAddr | null;

  const composeParts = (...parts: Array<string | null | undefined>) =>
    parts.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean);

  const snapStreet = composeParts(snap?.addressLine, snap?.flatInfo, snap?.landmark).join(', ');
  const snapCityLine = composeParts(
    snap?.city,
    snap?.state ? `${snap.state}${snap.pincode ? `-${snap.pincode}` : ''}` : snap?.pincode,
  ).join(', ');
  const snapAddressText = composeParts(snapStreet, snapCityLine).join(', ');

  const buyerOutletName =
    snap?.name?.trim() ||
    order.outlet?.name ||
    order.businessAccount?.displayName ||
    order.businessAccount?.legalName ||
    order.user.businessName ||
    order.user.fullName;

  const buyerAddressText =
    snapAddressText ||
    buyerSavedAddr?.fullAddress?.trim() ||
    '— (buyer: add address in profile)';
  const buyerPincode = snap?.pincode?.trim() || buyerSavedAddr?.pincode || '—';
  const buyerStateForSupply =
    snap?.state?.trim() ||
    order.businessAccount?.billingState ||
    buyerSavedAddr?.state ||
    '—';
  const buyerGstin =
    order.businessAccount?.gstin ||
    order.user.gstNumber ||
    '—';

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

  // Seller: registered office first, then warehouse/pickup.
  const vendorRegisteredParts = composeParts(
    order.vendor.addressLine,
    order.vendor.city,
    order.vendor.state
      ? `${order.vendor.state}${order.vendor.addressPincode ? `-${order.vendor.addressPincode}` : ''}`
      : order.vendor.addressPincode,
  );
  const vendorPickupParts = composeParts(
    order.vendor.pickupAddressLine,
    order.vendor.pickupCity,
    order.vendor.pickupState
      ? `${order.vendor.pickupState}${order.vendor.pickupPincode ? `-${order.vendor.pickupPincode}` : ''}`
      : order.vendor.pickupPincode,
  );
  const vendorAddrText =
    vendorRegisteredParts.length > 0
      ? vendorRegisteredParts.join(', ')
      : vendorPickupParts.length > 0
        ? vendorPickupParts.join(', ')
        : '— Address not on file (vendor: set it in Settings)';
  const vendorGstin = order.vendor.gstNumber || order.vendor.user?.gstNumber || '—';
  const sellerStateValue =
    order.vendor.state || order.vendor.pickupState || null;

  // Place of supply: seller (vendor address / GSTIN) vs buyer (ship-to / GSTIN).
  const sellerState = resolveState({
    state: sellerStateValue,
    gstin: order.vendor.gstNumber,
  });
  const buyerState = resolveState({
    state: buyerStateForSupply === '—' ? undefined : buyerStateForSupply,
    gstin: buyerGstin === '—' ? undefined : buyerGstin,
  });
  const supplyType = resolveSupplyType(sellerState, buyerState);
  const { cgst, sgst, igst } = splitGstTax(totalTax, supplyType);
  const cess = 0;

  const careQr = await QRCode.toBuffer(CUSTOMER_CARE_WHATSAPP_URL, {
    type: 'png',
    width: 256,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1C1C1C', light: '#FFFFFF' },
  });

  // ── 3. Build PDF ─────────────────────────────────────────────────────────
  return new Promise<Buffer>((resolve, reject) => {
    // bufferPages so we can stamp "Pg i of n" after the layout is known.
    const doc = new PDFDocument({ margin: 30, size: 'A4', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_W = doc.page.width - 60; // 535 with 30pt margins
    const LEFT = 30;
    const TOP = 40;
    const BOTTOM = 48;
    let y = 90;
    let inItemsTable = false;

    // Helper — draw a bordered cell with optional label + value
    const cell = (
      x: number, cellY: number, w: number, h: number,
      label: string | null, value: string,
      opts: {
        bold?: boolean;
        valueSize?: number;
        labelSize?: number;
        align?: 'left' | 'center' | 'right';
        vAlign?: 'top' | 'middle';
      } = {}
    ) => {
      doc.lineWidth(0.6).strokeColor('#000').rect(x, cellY, w, h).stroke();
      const padX = 4;
      const labelSize = opts.labelSize ?? 7;
      const valueSize = opts.valueSize ?? 9;
      const labelGap = 4;
      const blockH = label ? labelSize + labelGap + valueSize : valueSize;
      const topPad = opts.vAlign === 'middle'
        ? Math.max(4, (h - blockH) / 2)
        : (label ? 3 : 4);
      if (label) {
        doc.font('Helvetica').fontSize(labelSize).fillColor('#444');
        doc.text(label, x + padX, cellY + topPad, {
          width: w - padX * 2,
          align: opts.align ?? 'left',
          height: labelSize + 2,
          lineBreak: false,
        });
      }
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(valueSize).fillColor('#000');
      const valY = label ? cellY + topPad + labelSize + labelGap : cellY + topPad;
      const valueMaxH = Math.max(valueSize + 2, cellY + h - valY - 2);
      doc.text(value, x + padX, valY, {
        width: w - padX * 2,
        align: opts.align ?? 'left',
        height: valueMaxH,
        ellipsis: true,
      });
    };

    // ── Header band: Logo (left) + TAX INVOICE (center) + Route (right) ─────
    // Page numbers are stamped after layout (see bufferedPageRange below).
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#222');
    doc.text(order.vendor.businessName, LEFT, 50, {
      width: PAGE_W / 2 - 10,
      height: 16,
      lineBreak: false,
    });
    doc.font('Helvetica').fontSize(7).fillColor('#666');
    doc.text('Vendor', LEFT, 68, { height: 10, lineBreak: false });

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#000');
    doc.text('TAX INVOICE', LEFT, 50, { width: PAGE_W, align: 'center', height: 18, lineBreak: false });

    doc.font('Helvetica').fontSize(8).fillColor('#000');
    doc.text('Route No:  ---', LEFT, 50, { width: PAGE_W, align: 'right', height: 10, lineBreak: false });
    doc.text('Invoice Count: 1', LEFT, 64, { width: PAGE_W, align: 'right', height: 10, lineBreak: false });

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

    // Row 1 — invoice number is replaced by the customer-care WhatsApp QR.
    // Caption lines are drawn separately so a wrapped text box cannot spill
    // into the Order Date row underneath.
    const row1H = 96;
    const qrSize = 52;
    const captionSize = 7;
    doc.font('Helvetica-Bold').fontSize(captionSize);
    const captionLineH = doc.currentLineHeight();
    const qrGroupH = qrSize + 8 + captionLineH * 2;
    const qrGroupTop = y + Math.max(8, (row1H - qrGroupH) / 2);
    const qrX = LEFT + (colW - qrSize) / 2;

    doc.save();
    doc.rect(LEFT, y, colW, row1H).fill('#F8E8EC');
    doc.restore();
    doc.lineWidth(0.6).strokeColor('#000').rect(LEFT, y, colW, row1H).stroke();
    doc.image(careQr, qrX, qrGroupTop, { width: qrSize, height: qrSize });
    doc.font('Helvetica-Bold').fontSize(captionSize).fillColor('#6B1D2E');
    doc.text('Scan to reach', LEFT + 6, qrGroupTop + qrSize + 6, {
      width: colW - 12,
      align: 'center',
      lineBreak: false,
    });
    doc.text('Customer Care', LEFT + 6, qrGroupTop + qrSize + 6 + captionLineH, {
      width: colW - 12,
      align: 'center',
      lineBreak: false,
    });
    doc.link(LEFT, y, colW, row1H, CUSTOMER_CARE_WHATSAPP_URL);
    cell(LEFT + colW,     y, colW, row1H, 'Order No.',          order.orderNumber, { bold: true, vAlign: 'middle' });
    cell(LEFT + colW * 2, y, colW, row1H, 'Invoice Date',       invDate, { vAlign: 'middle' });
    cell(LEFT + colW * 3, y, colW, row1H, 'Last Payment Date',  lastPaymentDate, { vAlign: 'middle' });
    y += row1H;

    const isPaid = order.paymentStatus?.toLowerCase() === 'paid';
    const payStatusDisplay = isPaid ? 'PAID' : (order.paymentStatus ? order.paymentStatus.toUpperCase() : 'PENDING');
    const payMethodDisplay = formatPaymentMethodName(order.paymentMethod);
    const refPo = order.customerPoNumber || '-';

    // Row 2
    cell(LEFT,           y, colW, cellH, 'Order Date',          invDate);
    cell(LEFT + colW,     y, colW, cellH, 'Delivery Time Slot', slot);
    cell(LEFT + colW * 2, y, colW, cellH, 'Reference PO / Terms', refPo);
    cell(LEFT + colW * 3, y, colW, cellH, 'Payment Status', `${payStatusDisplay} (${payMethodDisplay})`, {
      bold: true,
      valueSize: 7.5,
    });
    y += cellH + 4;

    // ── Bill From / Shipped From boxes ──────────────────────────────────────
    doc.font('Helvetica').fontSize(8.5);
    const partyAddrH = doc.heightOfString(vendorAddrText, { width: PAGE_W - 115 });
    const partyH = Math.max(58, 20 + partyAddrH + 16);
    const drawParty = (yStart: number, label: string) => {
      doc.lineWidth(0.6).strokeColor('#000').rect(LEFT, yStart, PAGE_W, partyH).stroke();
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
      doc.text(`${label} :`, LEFT + 5, yStart + 6, { lineBreak: false });
      doc.font('Helvetica').fontSize(9);
      doc.text(order.vendor.businessName, LEFT + 100, yStart + 6, { width: PAGE_W - 110, lineBreak: false });
      const addrY = yStart + 22;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Address  :', LEFT + 5, addrY, { lineBreak: false });
      doc.font('Helvetica').fontSize(8.5);
      doc.text(vendorAddrText, LEFT + 100, addrY, {
        width: PAGE_W - 115,
        height: partyAddrH,
      });
      const gstinY = addrY + partyAddrH + 6;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('GSTIN  :', LEFT + 5, gstinY, { lineBreak: false });
      doc.font('Helvetica').fontSize(9);
      doc.text(vendorGstin, LEFT + 100, gstinY, { width: PAGE_W - 110, lineBreak: false });
    };

    drawParty(y, 'Bill From');
    y += partyH;
    drawParty(y, 'Shipped From');
    y += partyH + 4;

    // ── Bill To / Ship To (2-col) ───────────────────────────────────────────
    // Box height follows the wrapped address so GSTIN stays inside the box
    // and cannot run into the items table.
    const halfW = PAGE_W / 2;
    doc.font('Helvetica-Bold').fontSize(8.5);
    const buyerLabelW = doc.widthOfString('Place of Supply :') + 10;
    const buyerValueW = halfW - buyerLabelW - 14;
    doc.font('Helvetica').fontSize(8.5);
    const buyerLineH = (value: string) =>
      Math.max(11, doc.heightOfString(value || '—', { width: buyerValueW }));
    const buyerH =
      8 +
      12 +
      buyerLineH(buyerOutletName) + 3 +
      buyerLineH(buyerAddressText) + 3 +
      buyerLineH(buyerPincode) + 3 +
      buyerLineH(buyerStateForSupply) + 3 +
      buyerLineH(buyerGstin) + 8;

    const drawBuyer = (xStart: number, label: string) => {
      doc.lineWidth(0.6).strokeColor('#000').rect(xStart, y, halfW, buyerH).stroke();
      const lx = xStart + 6;
      const vx = xStart + 6 + buyerLabelW;
      let by = y + 6;

      const line = (k: string, v: string) => {
        const shown = v || '—';
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000');
        doc.text(k, lx, by, { lineBreak: false });
        doc.font('Helvetica').fontSize(8.5);
        const h = buyerLineH(shown);
        doc.text(shown, vx, by, { width: buyerValueW, height: h });
        by += h + 3;
      };

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
      doc.text(`${label} :`, lx, by, { lineBreak: false });
      by += 12;
      line('Outlet :', buyerOutletName);
      line('Address :', buyerAddressText);
      line('Pincode :', buyerPincode);
      line('Place of Supply :', buyerStateForSupply);
      line('GSTIN :', buyerGstin);
    };

    drawBuyer(LEFT, 'Bill To');
    drawBuyer(LEFT + halfW, 'Ship To');
    y += buyerH + 6;

    // ── Items table ─────────────────────────────────────────────────────────
    // Keep headers to 1–2 short lines so they never spill into the next column.
    // PAGE_W ≈ 535; widths must sum exactly to PAGE_W.
    const colSpec = [
      ['sl', 22],
      ['desc', 86],
      ['hsn', 48],
      ['qty', 28],
      ['unit', 40],
      ['uom', 32],
      ['preTax', 42],
      ['disc', 32],
      ['taxable', 44],
      ['taxRate', 58],
      ['taxAmt', 40],
    ] as const;
    const COL: Record<string, { x: number; w: number }> = {};
    let colX = LEFT;
    for (const [key, w] of colSpec) {
      COL[key] = { x: colX, w };
      colX += w;
    }
    COL.total = { x: colX, w: LEFT + PAGE_W - colX };

    const headerH = 28;

    const drawTableHeader = () => {
      doc.lineWidth(0.6).strokeColor('#000');
      doc.rect(LEFT, y, PAGE_W, headerH).stroke();
      Object.values(COL).forEach((c, idx) => {
        if (idx > 0) doc.moveTo(c.x, y).lineTo(c.x, y + headerH).stroke();
      });

      doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#000');
      const drawHeader = (label: string, c: { x: number; w: number }) => {
        doc.text(label, c.x + 1, y + 3, {
          width: c.w - 2,
          align: 'center',
          lineGap: 0,
          height: headerH - 4,
          ellipsis: true,
        });
      };
      drawHeader('Sl\nNo.', COL.sl);
      drawHeader('Description of Goods', COL.desc);
      drawHeader('HSN', COL.hsn);
      drawHeader('Qty\nDel.', COL.qty);
      drawHeader('Unit\nPrice', COL.unit);
      drawHeader('UoM', COL.uom);
      drawHeader('Pre Tax', COL.preTax);
      drawHeader('Disc.', COL.disc);
      drawHeader('Taxable\nAmt', COL.taxable);
      drawHeader('Tax %', COL.taxRate);
      drawHeader('Tax\nAmt', COL.taxAmt);
      drawHeader('Total', COL.total);
      y += headerH;
    };

    /** Start a new page before drawing `needed` pts; redraw table header when mid-items. */
    const ensureSpace = (needed: number) => {
      const pageBottom = doc.page.height - BOTTOM;
      if (y + needed <= pageBottom) return;
      doc.addPage();
      y = TOP;
      if (inItemsTable) drawTableHeader();
    };

    inItemsTable = true;
    drawTableHeader();

    // Body — group by category
    doc.font('Helvetica').fontSize(8).fillColor('#000');
    let serial = 1;
    for (const [categoryName, list] of itemsByCategory) {
      const bandH = 14;
      ensureSpace(bandH);
      doc.rect(LEFT, y, PAGE_W, bandH).fillAndStroke('#f0f0f0', '#000');
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(8.5);
      doc.text(categoryName, LEFT, y + 3, {
        width: PAGE_W,
        align: 'center',
        height: bandH - 4,
        lineBreak: false,
      });
      y += bandH;
      doc.font('Helvetica').fontSize(8);

      for (const item of list) {
        const taxLabel = formatLineTaxRate(item.taxPercent, supplyType);
        doc.font('Helvetica').fontSize(8);
        const nameH = doc.heightOfString(item.productName, { width: COL.desc.w - 6 });
        doc.font('Helvetica').fontSize(7);
        const hsnH = doc.heightOfString(item.hsn ?? '-', { width: COL.hsn.w - 4 });
        doc.font('Helvetica').fontSize(6.5);
        const taxH = doc.heightOfString(taxLabel, { width: COL.taxRate.w - 4 });
        const rowH = Math.max(20, nameH, hsnH, taxH) + 8;

        ensureSpace(rowH);

        doc.lineWidth(0.4).strokeColor('#000').rect(LEFT, y, PAGE_W, rowH).stroke();
        Object.values(COL).forEach((c, idx) => {
          if (idx > 0) doc.moveTo(c.x, y).lineTo(c.x, y + rowH).stroke();
        });

        const textH = rowH - 6;
        doc.fillColor('#000').font('Helvetica').fontSize(8);
        doc.text(String(serial++), COL.sl.x + 1, y + 4, {
          width: COL.sl.w - 2, align: 'center', height: textH, lineBreak: false,
        });
        doc.text(item.productName, COL.desc.x + 2, y + 4, {
          width: COL.desc.w - 6, height: textH,
        });
        doc.fontSize(7);
        doc.text(item.hsn ?? '-', COL.hsn.x + 1, y + 4, {
          width: COL.hsn.w - 4, align: 'center', height: textH, lineBreak: false,
        });
        doc.fontSize(8);
        doc.text(String(item.quantity), COL.qty.x, y + 4, {
          width: COL.qty.w - 2, align: 'center', height: textH, lineBreak: false,
        });
        doc.text(fmtNum(item.unitPrice), COL.unit.x, y + 4, {
          width: COL.unit.w - 3, align: 'right', height: textH, lineBreak: false,
        });
        doc.text(item.unit, COL.uom.x, y + 4, {
          width: COL.uom.w - 2, align: 'center', height: textH, lineBreak: false,
        });
        doc.text(fmtNum(item.preTax), COL.preTax.x, y + 4, {
          width: COL.preTax.w - 3, align: 'right', height: textH, lineBreak: false,
        });
        doc.text(fmtNum(item.discount), COL.disc.x, y + 4, {
          width: COL.disc.w - 3, align: 'right', height: textH, lineBreak: false,
        });
        doc.text(fmtNum(item.taxableAmount), COL.taxable.x, y + 4, {
          width: COL.taxable.w - 3, align: 'right', height: textH, lineBreak: false,
        });
        doc.fontSize(6.5);
        doc.text(taxLabel, COL.taxRate.x + 1, y + 5, {
          width: COL.taxRate.w - 4, align: 'center', height: textH,
        });
        doc.fontSize(8);
        doc.text(fmtNum(item.taxAmount), COL.taxAmt.x, y + 4, {
          width: COL.taxAmt.w - 3, align: 'right', height: textH, lineBreak: false,
        });
        doc.text(fmtNum(item.total), COL.total.x, y + 4, {
          width: COL.total.w - 4, align: 'right', height: textH, lineBreak: false,
        });

        y += rowH;
      }
    }

    // Other Charges band
    const otherBandH = 14;
    ensureSpace(otherBandH);
    doc.rect(LEFT, y, PAGE_W, otherBandH).fillAndStroke('#f0f0f0', '#000');
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(8.5);
    doc.text('Other Charges', LEFT, y + 3, {
      width: PAGE_W, align: 'center', height: otherBandH - 4, lineBreak: false,
    });
    y += otherBandH;

    // Total row (across the items table)
    const totalRowH = 18;
    ensureSpace(totalRowH);
    doc.lineWidth(0.4).strokeColor('#000').rect(LEFT, y, PAGE_W, totalRowH).stroke();
    Object.values(COL).forEach((c, idx) => {
      if (idx > 0) doc.moveTo(c.x, y).lineTo(c.x, y + totalRowH).stroke();
    });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000');
    doc.text('Total', COL.sl.x, y + 5, {
      width: COL.sl.w + COL.desc.w + COL.hsn.w + COL.qty.w + COL.unit.w + COL.uom.w,
      align: 'left',
      height: totalRowH - 6,
      lineBreak: false,
    });
    doc.text(fmtNum(totalPreTax), COL.preTax.x, y + 5, {
      width: COL.preTax.w - 2, align: 'right', height: totalRowH - 6, lineBreak: false,
    });
    doc.text(fmtNum(totalDiscount), COL.disc.x, y + 5, {
      width: COL.disc.w - 2, align: 'right', height: totalRowH - 6, lineBreak: false,
    });
    doc.text(fmtNum(totalTaxable), COL.taxable.x, y + 5, {
      width: COL.taxable.w - 2, align: 'right', height: totalRowH - 6, lineBreak: false,
    });
    doc.text(fmtNum(totalTax), COL.taxAmt.x, y + 5, {
      width: COL.taxAmt.w - 2, align: 'right', height: totalRowH - 6, lineBreak: false,
    });
    doc.text(fmtNum(grandTotal), COL.total.x, y + 5, {
      width: COL.total.w - 2, align: 'right', height: totalRowH - 6, lineBreak: false,
    });
    y += totalRowH;
    inItemsTable = false;

    // ── Amount Chargeable + summary box ─────────────────────────────────────
    const summaryH = 22;
    ensureSpace(summaryH);
    doc.lineWidth(0.6).strokeColor('#000').rect(LEFT, y, PAGE_W, summaryH).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5);
    doc.text('Amount Chargeable (in words):', LEFT + 5, y + 6, {
      height: summaryH - 8, lineBreak: false,
    });
    doc.font('Helvetica').fontSize(8.5);
    doc.text(`INR ${numberToIndianWords(grandTotal)} Only`, LEFT + 165, y + 6, {
      width: PAGE_W - 230, height: summaryH - 8,
    });
    doc.font('Helvetica-Bold').fontSize(8.5);
    doc.text('E. & O.E', LEFT + PAGE_W - 60, y + 6, {
      width: 55, align: 'right', height: summaryH - 8, lineBreak: false,
    });
    y += summaryH;

    // ── Tax breakdown row: Total Taxable | IGST | CESS | CGST | SGST | Total
    const breakdownColW = PAGE_W / 6;
    const bdH = 38;
    ensureSpace(bdH + 4);
    const drawBdCell = (i: number, label: string, value: string) => {
      const x = LEFT + i * breakdownColW;
      doc.lineWidth(0.6).strokeColor('#000').rect(x, y, breakdownColW, bdH).stroke();
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#000');
      doc.text(label, x + 2, y + 3, {
        width: breakdownColW - 4,
        align: 'center',
        lineGap: 0,
        height: 16,
      });
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text(value, x + 2, y + bdH - 14, {
        width: breakdownColW - 4,
        align: 'center',
        height: 12,
        lineBreak: false,
      });
    };
    drawBdCell(0, 'Taxable Amt\n(Rs)', fmtNum(totalTaxable));
    drawBdCell(1, 'IGST', fmtNum(igst));
    drawBdCell(2, 'CESS', fmtNum(cess));
    drawBdCell(3, 'CGST', fmtNum(cgst));
    drawBdCell(4, 'SGST', fmtNum(sgst));
    drawBdCell(5, 'Total Tax', fmtNum(totalTax));
    y += bdH + 4;

    // ── IRN row ─────────────────────────────────────────────────────────────
    const irnH = 16;
    ensureSpace(irnH + 4);
    doc.lineWidth(0.6).strokeColor('#000').rect(LEFT, y, PAGE_W, irnH).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5);
    doc.text('IRN', LEFT + 5, y + 4, { height: irnH - 6, lineBreak: false });
    doc.font('Helvetica').fontSize(8);
    doc.text('—', LEFT + 40, y + 4, { width: PAGE_W - 50, height: irnH - 6, lineBreak: false });
    y += irnH + 4;

    // ── Payment / Remittance Box (for Pending / Offline / Credit payments) ──
    const hasBankDetails = Boolean(order.vendor.bankAccountNumber && order.vendor.bankIfsc);
    if (!isPaid) {
      let remitText = `Please remit payment against Order No. ${order.orderNumber} via ${payMethodDisplay}.`;
      if (hasBankDetails) {
        remitText += ` Bank: ${order.vendor.bankName || 'Vendor Bank'} | A/C Name: ${order.vendor.bankAccountName || order.vendor.businessName} | A/C No: ${order.vendor.bankAccountNumber} | IFSC: ${order.vendor.bankIfsc}`;
      }
      if (order.customerPoNumber) {
        remitText += ` | PO Ref: ${order.customerPoNumber}`;
      }
      doc.font('Helvetica').fontSize(7.5);
      const remitTextH = doc.heightOfString(remitText, { width: PAGE_W - 12 });
      const remitH = 14 + remitTextH + 4;
      ensureSpace(remitH + 4);
      doc.lineWidth(0.6).strokeColor('#000').rect(LEFT, y, PAGE_W, remitH).stroke();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#c0392b');
      doc.text('PAYMENT PENDING / REMITTANCE INSTRUCTIONS:', LEFT + 5, y + 4, { lineBreak: false });
      doc.font('Helvetica').fontSize(7.5).fillColor('#000');
      doc.text(remitText, LEFT + 5, y + 16, {
        width: PAGE_W - 12,
        lineGap: 1,
        height: remitTextH,
      });
      y += remitH + 4;
    }

    // ── Declaration ─────────────────────────────────────────────────────────
    const declarationBody =
      'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. In case of any rejections or quality complaints, please mention the same on the invoice copy itself at the time of accepting delivery. Credit Notes will only be issued on the basis of any requests done on the copy of the invoice.';
    doc.font('Helvetica').fontSize(8);
    const declarationBodyH = doc.heightOfString(declarationBody, { width: PAGE_W });
    const declarationBlockH = 12 + declarationBodyH + 10 + 12;
    ensureSpace(declarationBlockH + 40);

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    doc.text('Declaration', LEFT, y, { height: 12, lineBreak: false });
    y += 12;
    doc.font('Helvetica').fontSize(8).fillColor('#222');
    doc.text(declarationBody, LEFT, y, {
      width: PAGE_W,
      align: 'left',
      height: declarationBodyH,
    });
    y += declarationBodyH + 10;

    // Underline (red-ish)
    doc.lineWidth(1).strokeColor('#c0392b').moveTo(LEFT, y).lineTo(LEFT + PAGE_W, y).stroke();
    y += 12;

    // ── Footer: registered company info ─────────────────────────────────────
    ensureSpace(40);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    doc.text(`${order.vendor.businessName.toUpperCase()} (Registered on Horeca1)`, LEFT, y, {
      width: PAGE_W, align: 'center', height: 12, lineBreak: false,
    });
    y += 12;
    doc.font('Helvetica').fontSize(8).fillColor('#222');
    const footerLine1 = `Phone: ${order.vendor.user?.phone ?? '—'}    Email: ${order.vendor.user?.email ?? '—'}`;
    doc.text(footerLine1, LEFT, y, {
      width: PAGE_W, align: 'center', height: 12, lineBreak: false,
    });

    // Stamp real page numbers on every buffered page.
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.save();
      doc.rect(LEFT + PAGE_W - 90, 30, 90, 14).fill('#FFFFFF');
      doc.restore();
      doc.font('Helvetica').fontSize(8).fillColor('#000');
      doc.text(`Pg ${i + 1} of ${range.count}`, LEFT, 35, {
        width: PAGE_W,
        align: 'right',
        lineBreak: false,
      });
    }

    doc.end();
  });
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function formatPaymentMethodName(method: string | null | undefined): string {
  if (!method) return 'Custom Payment';
  switch (method) {
    case 'online': return 'Online Payment';
    case 'cod': return 'Cash on Delivery';
    case 'prepaid': return 'Prepaid';
    case 'bank_transfer': return 'Bank Transfer / NEFT';
    case 'po_number': return 'Purchase Order (PO)';
    case 'cheque': return 'Cheque';
    case 'credit': return 'Credit Terms';
    case 'vendor_credit': return 'Vendor Credit';
    case 'wallet':
    case 'h1_wallet': return 'H1 Wallet';
    case 'discco': return 'DiSCCO Credit';
    default: return method.replace(/_/g, ' ').toUpperCase();
  }
}

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
