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

export type DraftCell = Partial<PriceListItemData> | null;

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
    if (d.price !== undefined && d.price !== null) return d.price;
  }
  const cell = row.cells[col.id];
  if (cell?.isExcluded) return fallbackPrice(row, col);
  return cell?.price != null ? cell.price : fallbackPrice(row, col);
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
