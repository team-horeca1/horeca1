/**
 * Supplier Foundation: Online Store is the stock location.
 * Vendor multi-warehouse is retired — always treat as single default outlet per store.
 */
export const MULTI_WAREHOUSE_ALWAYS_ON = false;

export function isMultiWarehouseEnabled(_dbFlag?: boolean | null): boolean {
  return false;
}
