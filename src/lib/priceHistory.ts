import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { serializeFieldValue } from '@/lib/product-edit-policy';

type Db = Prisma.TransactionClient | typeof prisma;

const PRICE_FIELDS = new Set(['basePrice', 'priceSlabs', 'promoPrice', 'customPrice', 'discountPercent']);

export type PriceHistorySource =
  | 'vendor_edit'
  | 'admin_edit'
  | 'import'
  | 'bulk_price'
  | 'pricelist'
  | 'system';

export interface PriceHistoryEntry {
  vendorId: string;
  productId: string;
  priceListId?: string | null;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  source: PriceHistorySource | string;
  reason?: string | null;
  changedBy?: string | null;
}

/** Append one or more PriceHistory rows (skips no-ops). */
export async function logPriceHistory(
  entries: PriceHistoryEntry[],
  db: Db = prisma,
): Promise<void> {
  const rows = entries
    .filter((e) => serializeFieldValue(e.oldValue) !== serializeFieldValue(e.newValue))
    .map((e) => ({
      vendorId: e.vendorId,
      productId: e.productId,
      priceListId: e.priceListId ?? null,
      field: e.field.slice(0, 64),
      oldValue: serializeFieldValue(e.oldValue),
      newValue: serializeFieldValue(e.newValue),
      source: String(e.source).slice(0, 32),
      reason: e.reason?.slice(0, 200) ?? null,
      changedBy: e.changedBy ?? null,
    }));

  if (rows.length === 0) return;
  await db.priceHistory.createMany({ data: rows });
}

/** True when a product-audit field should also land in PriceHistory. */
export function isPriceHistoryField(field: string): boolean {
  return PRICE_FIELDS.has(field);
}
