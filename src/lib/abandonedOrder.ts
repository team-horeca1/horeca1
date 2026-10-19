/** Unpaid online order whose payment window was closed or failed. */
export function isAbandonedCart(order: {
  abandonedAt?: Date | string | null;
  paymentStatus?: string | null;
  status?: string | null;
} | null | undefined): boolean {
  if (!order?.abandonedAt) return false;
  if (order.paymentStatus === 'paid') return false;
  return !order.status || order.status === 'pending';
}

export function abandonedCartLabel(): { label: string; hint: string } {
  return {
    label: 'Abandoned',
    hint: 'Payment was not completed. Call the customer — if they pay, this becomes a normal order.',
  };
}
