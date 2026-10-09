/**
 * Rule-based attention flags for Order Workspace (Phase 2 hook).
 * Derived at read time — no ML. Shape is stable for future enrichment.
 */

export type AttentionReasonCode =
  | 'low_stock'
  | 'payment_unpaid'
  | 'partial'
  | 'cancel_requested'
  | 'sla_overdue'
  | 'abandoned_cart';

export const ATTENTION_LABELS: Record<AttentionReasonCode, string> = {
  low_stock: 'Low stock on one or more lines',
  payment_unpaid: 'Payment unpaid',
  partial: 'Partially fulfilled',
  cancel_requested: 'Customer cancellation pending',
  sla_overdue: 'Open longer than 2 hours',
  abandoned_cart: 'Abandoned cart — call the customer. Paying turns this into a normal order.',
};

export function computeAttentionReasons(input: {
  status: string;
  paymentStatus?: string | null;
  isPartial?: boolean;
  createdAt?: string | Date | null;
  abandonedAt?: string | Date | null;
  hasPendingCancelRequest?: boolean;
  /** true if any line has stockAvailable < ordered quantity */
  hasLowStock?: boolean;
}): AttentionReasonCode[] {
  const reasons: AttentionReasonCode[] = [];
  const abandoned = !!input.abandonedAt && input.paymentStatus !== 'paid' && input.status === 'pending';
  if (abandoned) {
    reasons.push('abandoned_cart');
    return reasons;
  }
  if (input.hasLowStock) reasons.push('low_stock');
  if (input.paymentStatus === 'unpaid' && input.status !== 'cancelled' && input.status !== 'draft') {
    reasons.push('payment_unpaid');
  }
  if (input.isPartial) reasons.push('partial');
  if (input.hasPendingCancelRequest) reasons.push('cancel_requested');
  if (
    input.createdAt &&
    !['delivered', 'cancelled'].includes(input.status) &&
    Date.now() - new Date(input.createdAt).getTime() > 2 * 60 * 60 * 1000
  ) {
    reasons.push('sla_overdue');
  }
  return reasons;
}
