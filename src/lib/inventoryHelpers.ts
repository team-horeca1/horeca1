/** Aggregate per-outlet inventory rows for storefront / legacy single-stock display. */
export function aggregateInventories(
  rows: Array<{
    qtyAvailable: number;
    qtyReserved?: number;
    lowStockThreshold?: number;
  }> | null | undefined,
): {
  qtyAvailable: number;
  qtyReserved: number;
  lowStockThreshold: number;
  /** Net units that can still be sold (on-hand minus reserved). */
  qtySellable: number;
} | null {
  if (!rows?.length) return null;
  const qtyAvailable = rows.reduce((s, r) => s + r.qtyAvailable, 0);
  const qtyReserved = rows.reduce((s, r) => s + (r.qtyReserved ?? 0), 0);
  return {
    qtyAvailable,
    qtyReserved,
    qtySellable: Math.max(0, qtyAvailable - qtyReserved),
    lowStockThreshold: Math.min(...rows.map((r) => r.lowStockThreshold ?? 10)),
  };
}

/** Storefront / catalog stock — sellable units only (available − reserved). */
export function totalStockQty(
  rows: Array<{ qtyAvailable: number; qtyReserved?: number; lowStockThreshold?: number }> | null | undefined,
): number {
  return aggregateInventories(rows)?.qtySellable ?? 0;
}
export function withLegacyInventory<T extends { inventories?: Array<{ qtyAvailable: number; qtyReserved?: number; lowStockThreshold?: number }> }>(
  product: T,
): T & { inventory: ReturnType<typeof aggregateInventories> } {
  return { ...product, inventory: aggregateInventories(product.inventories) };
}
