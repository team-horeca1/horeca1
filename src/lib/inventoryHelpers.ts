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
} | null {
  if (!rows?.length) return null;
  return {
    qtyAvailable: rows.reduce((s, r) => s + r.qtyAvailable, 0),
    qtyReserved: rows.reduce((s, r) => s + (r.qtyReserved ?? 0), 0),
    lowStockThreshold: Math.min(...rows.map((r) => r.lowStockThreshold ?? 10)),
  };
}

export function totalStockQty(
  rows: Array<{ qtyAvailable: number; qtyReserved?: number; lowStockThreshold?: number }> | null | undefined,
): number {
  return aggregateInventories(rows)?.qtyAvailable ?? 0;
}
export function withLegacyInventory<T extends { inventories?: Array<{ qtyAvailable: number; qtyReserved?: number; lowStockThreshold?: number }> }>(
  product: T,
): T & { inventory: ReturnType<typeof aggregateInventories> } {
  return { ...product, inventory: aggregateInventories(product.inventories) };
}
