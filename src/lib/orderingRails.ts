/** Fields the homepage rails need from `/api/v1/orders`. */
export type OrderRailFields = {
  status?: string | null;
  paymentStatus?: string | null;
  vendorId?: string | null;
  vendor?: { id?: string | null } | null;
};

const FINISHED_STATUSES = new Set(['delivered', 'returned', 'completed']);

export function orderVendorId(order: OrderRailFields): string | null {
  return order.vendorId || order.vendor?.id || null;
}

/**
 * Still being ordered: submitted, not paid, and not received.
 * Paid or delivered orders leave Continue Ordering.
 */
export function isContinueOrder(order: OrderRailFields): boolean {
  const status = order.status ?? '';
  const payment = order.paymentStatus ?? '';
  if (!status || status === 'cancelled' || status === 'draft') return false;
  if (payment === 'paid' || payment === 'refunded') return false;
  if (FINISHED_STATUSES.has(status)) return false;
  return true;
}

/**
 * A supplier belongs in Frequently Ordered once this buyer has paid
 * or received an order from them.
 */
export function isFrequentlyOrderedOrder(order: OrderRailFields): boolean {
  const status = order.status ?? '';
  const payment = order.paymentStatus ?? '';
  if (status === 'cancelled' || status === 'draft') return false;
  if (payment === 'paid') return true;
  return FINISHED_STATUSES.has(status);
}
