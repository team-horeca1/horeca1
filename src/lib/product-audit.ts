import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { serializeFieldValue } from '@/lib/product-edit-policy';
import { isPriceHistoryField, logPriceHistory } from '@/lib/priceHistory';

type AuditDb = Prisma.TransactionClient | typeof prisma;

export type ProductAuditSource =
  | 'vendor_edit'
  | 'admin_edit'
  | 'master_sync'
  | 'import'
  | 'bulk_price'
  | 'system';

export interface ProductFieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/** Compact string for PriceSlab[] audit rows. */
export function summarizePriceSlabs(
  slabs: Array<{ minQty: number; maxQty?: number | null; price: unknown; promoPrice?: unknown }>,
): string {
  if (!slabs.length) return '[]';
  return slabs
    .map((s) => {
      const max = s.maxQty == null ? '+' : String(s.maxQty);
      const promo = s.promoPrice != null && s.promoPrice !== '' ? ` promo=${s.promoPrice}` : '';
      return `${s.minQty}-${max}@${s.price}${promo}`;
    })
    .join('; ');
}

/** Append field-level audit rows for a product mutation. Dual-writes price fields to PriceHistory. */
export async function logProductFieldChanges(
  productId: string,
  changedBy: string,
  source: ProductAuditSource,
  changes: ProductFieldChange[],
  db: AuditDb = prisma,
  opts?: { vendorId?: string },
): Promise<void> {
  const rows = changes
    .filter((c) => serializeFieldValue(c.oldValue) !== serializeFieldValue(c.newValue))
    .map((c) => ({
      productId,
      field: c.field,
      oldValue: serializeFieldValue(c.oldValue),
      newValue: serializeFieldValue(c.newValue),
      changedBy,
      source,
    }));

  if (rows.length === 0) return;

  await db.productAuditLog.createMany({ data: rows });

  const priceRows = rows.filter((r) => isPriceHistoryField(r.field));
  if (priceRows.length === 0) return;

  let vendorId = opts?.vendorId;
  if (!vendorId) {
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { vendorId: true },
    });
    vendorId = product?.vendorId ?? undefined;
  }
  if (!vendorId) return;

  await logPriceHistory(
    priceRows.map((r) => ({
      vendorId: vendorId!,
      productId,
      field: r.field,
      oldValue: r.oldValue,
      newValue: r.newValue,
      source,
      changedBy,
    })),
    db,
  );
}

/** Diff two plain objects and emit audit rows for listed keys. */
export async function auditProductDiff(
  productId: string,
  changedBy: string,
  source: ProductAuditSource,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
  db: AuditDb = prisma,
): Promise<void> {
  const changes: ProductFieldChange[] = fields
    .filter((f) => after[f] !== undefined)
    .map((field) => ({
      field,
      oldValue: before[field],
      newValue: after[field],
    }));

  await logProductFieldChanges(productId, changedBy, source, changes, db);
}
