/**
 * Multi-warehouse fulfillment is always enabled platform-wide.
 * Vendors cannot turn this off — stock is per godown/outlet; checkout
 * routes each order to one warehouse that can serve the delivery pincode.
 */
export const MULTI_WAREHOUSE_ALWAYS_ON = true;

export function isMultiWarehouseEnabled(_dbFlag?: boolean | null): boolean {
  return MULTI_WAREHOUSE_ALWAYS_ON;
}
