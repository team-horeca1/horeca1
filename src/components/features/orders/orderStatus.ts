/** Shared order status styles, labels, and filter tabs for vendor + admin lists. */

export const ORDER_STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  delivered: 'bg-primary-light text-primary border-[#D1FAE5]',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-100',
  processing: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  pending: 'bg-[#FFF8EB] text-[#D97706] border-[#FEF3C7]',
  ready_for_dispatch: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  shipped: 'bg-purple-50 text-purple-700 border-purple-100',
  partially_delivered: 'bg-orange-50 text-orange-700 border-orange-100',
  returned: 'bg-rose-50 text-rose-700 border-rose-100',
  cancelled: 'bg-[#FDF2F2] text-[#EF4444] border-[#FEE2E2]',
  abandoned: 'bg-amber-50 text-amber-800 border-amber-200',
};

export const ORDER_PAYMENT_STYLE: Record<string, string> = {
  paid: 'bg-primary-light text-primary',
  unpaid: 'bg-[#FFF4E5] text-[#976538]',
  partial: 'bg-blue-50 text-blue-600',
  refunded: 'bg-[#F3F4F6] text-[#6B7280]',
};

/** Row / dropdown labels for native order statuses (+ legacy aliases). */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  accepted: 'Accepted',
  confirmed: 'Accepted',
  partially_accepted: 'Partially Accepted',
  packed: 'Packed',
  processing: 'Packed',
  ready_for_dispatch: 'Ready for Dispatch',
  dispatched: 'Dispatched',
  shipped: 'Dispatched',
  partially_delivered: 'Partially Fulfilled',
  delivered: 'Delivered',
  returned: 'Returned',
  cancelled: 'Cancelled',
  abandoned: 'Abandoned',
};

/** Tab chip labels — Processing bucket ≠ DB processing → Packed. */
export const ORDER_TAB_LABELS: Record<string, string> = {
  all: 'All',
  new: 'New',
  processing: 'Processing',
  partially_accepted: 'Partially Accepted',
  packed: 'Packed',
  ready_for_dispatch: 'Ready for Dispatch',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  abandoned: 'Abandoned',
};

export const ORDER_STATUS_OPTIONS = [
  'pending',
  'confirmed',
  'processing',
  'ready_for_dispatch',
  'shipped',
  'partially_delivered',
  'delivered',
  'returned',
  'cancelled',
] as const;

export type OrderStatusOption = (typeof ORDER_STATUS_OPTIONS)[number];

export const ORDER_STATUS_TABS = [
  'all',
  'new',
  'processing',
  'partially_accepted',
  'packed',
  'ready_for_dispatch',
  'dispatched',
  'delivered',
  'cancelled',
  'abandoned',
] as const;

export type OrderStatusTab = (typeof ORDER_STATUS_TABS)[number];

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}
