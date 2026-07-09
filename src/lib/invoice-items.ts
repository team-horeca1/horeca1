// Pure invoice line-item builder — extracted from invoice.ts so it can be unit-tested
// without pdfkit / prisma. Type-only Prisma import (erased at runtime).
//
// IMMUTABILITY RULE: invoices read OrderItem SNAPSHOT fields captured at checkout,
// never the live Product. Live product is used only as a best-effort fallback for
// historical rows written before a given snapshot column existed.

import type { Prisma } from '@prisma/client';

type DecimalLike = Prisma.Decimal | number | string;

export interface InvoiceItem {
  productName: string;
  hsn: string | null;
  category: string;
  quantity: number;
  unit: string; // UoM e.g. "Kg", "Pcs", "Pack"
  unitPrice: number; // taxable base price per unit
  taxPercent: number;
  preTax: number; // qty × unitPrice (ex-tax)
  discount: number; // 0 — placeholder until promotions wired
  taxableAmount: number;
  taxAmount: number;
  total: number;
}

export interface InvoiceLineInput {
  productName: string;
  hsn: string | null;
  packSize: string | null;
  taxPercent: DecimalLike | null;
  categoryName: string | null;
  quantity: number;
  fulfilledQty: number;
  unitPrice: DecimalLike;
  // Live product — fallback only for pre-snapshot historical rows.
  product: {
    hsn: string | null;
    unit: string | null;
    packSize: string | null;
    taxPercent: DecimalLike | null;
    category: { name: string } | null;
  };
}

export interface InvoiceOrderInput {
  isPartial: boolean;
  items: InvoiceLineInput[];
}

/**
 * Build invoice line items from an order. Reads snapshot fields first, falling back
 * to the live product only when a snapshot value is absent (legacy rows). Partial
 * orders bill `fulfilledQty`; lines with zero billable qty are dropped.
 *
 * OrderItem.unitPrice is stored GROSS (inc-GST) at checkout. Invoice math needs
 * taxable base, so we back out: taxableUnit = gross / (1 + tax%/100).
 */
export function buildInvoiceLineItems(order: InvoiceOrderInput): InvoiceItem[] {
  return order.items
    .map((item) => {
      const grossUnitPrice = Number(item.unitPrice);
      const qty = order.isPartial ? item.fulfilledQty : item.quantity;
      const taxPct = Number(item.taxPercent ?? item.product.taxPercent ?? 0);
      const taxableUnit =
        taxPct > 0
          ? Math.round((grossUnitPrice / (1 + taxPct / 100)) * 100) / 100
          : grossUnitPrice;
      const preTax = Math.round(taxableUnit * qty * 100) / 100;
      const discount = 0;
      const taxableAmount = preTax - discount;
      const taxAmount = Math.round(taxableAmount * (taxPct / 100) * 100) / 100;
      return {
        productName: item.productName,
        hsn: item.hsn ?? item.product.hsn,
        category: item.categoryName ?? item.product.category?.name ?? 'Other',
        quantity: qty,
        unit: item.packSize ?? item.product.unit ?? item.product.packSize ?? 'Pcs',
        unitPrice: taxableUnit,
        taxPercent: taxPct,
        preTax,
        discount,
        taxableAmount,
        taxAmount,
        total: Math.round((taxableAmount + taxAmount) * 100) / 100,
      };
    })
    .filter((line) => line.quantity > 0);
}
