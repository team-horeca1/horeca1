export type AssignmentType =
  | 'customer'
  | 'outlet'
  | 'pincode'
  | 'area'
  | 'segment'
  | 'brand'
  | 'group'
  | 'credit_status';

export interface PriceListCol {
  id: string;
  name: string;
  discountPercent: number;
  kind?: 'selected' | 'percent';
  priority?: number;
  floorPercentOfBase?: number | null;
  counts?: { priced: number; excluded: number; locked: number; scheduled: number };
  assignmentSummary?: Record<string, number>;
  assignmentCount?: number;
}

export interface PriceHistoryEntry {
  date: string;
  action: string;
  oldPrice: number | null;
  newPrice: number | null;
  user?: string;
}

export interface PriceListItemData {
  price: number | null;
  isLocked: boolean;
  isExcluded: boolean;
  pricingType?: string | null;
  discountPercent?: number | null;
  validFrom: string | null;
  validTo: string | null;
  note: string | null;
  scheduledPrice: number | null;
  scheduledFrom: string | null;
  scheduledTo: string | null;
  history: PriceHistoryEntry[];
}

export interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  packSize: string | null;
  basePrice: number;
  taxPercent: number;
  mrp: number | null;
  cells: Record<string, PriceListItemData | null>;
}

export type DraftCell = (Partial<PriceListItemData> & { added?: boolean }) | null;

export interface CustomerTarget {
  userId: string;
  label: string;
  hcidDisplay?: string | null;
  creditStatus: string | null;
  pincodes: string[];
  cities: string[];
  tags: string[];
}

export const inr = (n: number | null | undefined) =>
  n == null || Number.isNaN(Number(n))
    ? '—'
    : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function fallbackPrice(row: ProductRow, col: PriceListCol): number {
  if (col.discountPercent > 0) {
    return Math.round(row.basePrice * (1 - col.discountPercent / 100) * 100) / 100;
  }
  return row.basePrice;
}

export function cellKey(productId: string, listId: string) {
  return `${productId}:${listId}`;
}

export function listKind(col: PriceListCol): 'selected' | 'percent' {
  return col.kind ?? (col.discountPercent > 0 ? 'percent' : 'selected');
}

export function isPercentList(col: PriceListCol): boolean {
  return listKind(col) === 'percent';
}

/** Chip / column subtitle: "Default: Base · 11 custom · 0 hidden" */
export function listRuleLabel(col: PriceListCol): string {
  if (isPercentList(col)) return `−${Number(col.discountPercent)}%`;
  return 'Base';
}

export function listSubtitle(col: PriceListCol, customCount?: number): string {
  const custom = customCount ?? col.counts?.priced ?? 0;
  const hidden = col.counts?.excluded ?? 0;
  return `Default: ${listRuleLabel(col)} · ${custom} custom · ${hidden} hidden`;
}

export function effective(
  row: ProductRow,
  col: PriceListCol,
  dirty: Record<string, DraftCell>,
): number {
  const key = cellKey(row.id, col.id);
  if (key in dirty) {
    const d = dirty[key];
    if (d === null) return fallbackPrice(row, col);
    if (d.isExcluded) return fallbackPrice(row, col);
    // Explicit null = clear override → list % / base (do not fall through to stored cell).
    if (d.price === null) return fallbackPrice(row, col);
    if (d.price !== undefined) return d.price;
  }
  const cell = row.cells[col.id];
  if (cell?.isExcluded) return fallbackPrice(row, col);
  return cell?.price != null ? cell.price : fallbackPrice(row, col);
}

/** True when the cell has a frozen custom price (not the list −% / base fallback). */
export function hasCustomOverride(
  row: ProductRow,
  col: PriceListCol,
  dirty: Record<string, DraftCell>,
): boolean {
  const key = cellKey(row.id, col.id);
  if (key in dirty) {
    const d = dirty[key];
    if (d === null) return false;
    if (d.isExcluded) return false;
    if (d.price === null) return false;
    if (d.price !== undefined) return true;
  }
  const cell = row.cells[col.id];
  if (!cell || cell.isExcluded) return false;
  return cell.price != null;
}

/**
 * Unified cell source — every cell is exactly one of:
 *   custom → frozen override
 *   list   → list default −N% (tracks base)
 *   base   → no rule / no override (equals base price)
 */
export type PriceSource = 'custom' | 'list' | 'base';

export function priceSource(
  row: ProductRow,
  col: PriceListCol,
  dirty: Record<string, DraftCell>,
): PriceSource {
  if (hasCustomOverride(row, col, dirty)) return 'custom';
  if (isPercentList(col)) return 'list';
  return 'base';
}

/** @deprecated Prefer hasCustomOverride / priceSource — kept for callers that still filter "members". */
export function isMember(row: ProductRow, col: PriceListCol, dirty: Record<string, DraftCell>): boolean {
  if (isPercentList(col)) return true;
  return hasCustomOverride(row, col, dirty) || isExcluded(row, col, dirty);
}

/** Tooltip for the unified Reset control. */
export function resetTooltip(col: PriceListCol): string {
  if (isPercentList(col)) {
    return `Clear the custom price and use the list −${Number(col.discountPercent)}% again`;
  }
  return 'Remove this product’s custom price — it goes back to Base (or the next list the customer is on)';
}

export function isExcluded(
  row: ProductRow,
  col: PriceListCol,
  dirty: Record<string, DraftCell>,
): boolean {
  const key = cellKey(row.id, col.id);
  if (key in dirty) {
    const d = dirty[key];
    if (d === null) return false;
    return !!d.isExcluded;
  }
  return !!row.cells[col.id]?.isExcluded;
}

export function isDirty(row: ProductRow, col: PriceListCol, dirty: Record<string, DraftCell>): boolean {
  return cellKey(row.id, col.id) in dirty;
}

/** Convert client dirty map to PATCH / workspace review payload cells. */
export function dirtyToPublishCells(dirty: Record<string, DraftCell>) {
  return Object.entries(dirty).map(([key, cellUpdates]) => {
    const [productId, priceListId] = key.split(':');
    if (cellUpdates === null) {
      return { productId, priceListId, customPrice: null, isExcluded: false };
    }
    return {
      productId,
      priceListId,
      added: cellUpdates.added,
      customPrice: cellUpdates.price !== undefined ? cellUpdates.price : undefined,
      isExcluded: cellUpdates.isExcluded,
      isLocked: cellUpdates.isLocked,
      validFrom: cellUpdates.validFrom,
      validTo: cellUpdates.validTo,
      note: cellUpdates.note,
      scheduledPrice: cellUpdates.scheduledPrice,
      scheduledFrom: cellUpdates.scheduledFrom,
      scheduledTo: cellUpdates.scheduledTo,
    };
  });
}

export type PublishCell = ReturnType<typeof dirtyToPublishCells>[number];
