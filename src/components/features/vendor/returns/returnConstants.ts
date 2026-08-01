import {
  RETURN_DISPOSITIONS,
  RETURN_PROGRESS_STAGES,
  RETURN_STATUSES,
  RETURN_TYPES,
  type ReturnDisposition,
  type ReturnStatus,
  type ReturnType,
} from '@/modules/return/return.types';

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  new: 'New',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  pickup_scheduled: 'Pickup Scheduled',
  goods_received: 'Goods Received',
  inspection_completed: 'Inspection Done',
  closed: 'Closed',
};

export const RETURN_STATUS_STYLE: Record<ReturnStatus, string> = {
  new: 'bg-amber-50 text-amber-800 border-amber-200',
  under_review: 'bg-orange-50 text-orange-800 border-orange-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  pickup_scheduled: 'bg-sky-50 text-sky-800 border-sky-200',
  goods_received: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  inspection_completed: 'bg-violet-50 text-violet-800 border-violet-200',
  closed: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const RETURN_STATUS_CHIPS: Array<{ key: 'all' | ReturnStatus; label: string }> = [
  { key: 'all', label: 'All' },
  ...RETURN_STATUSES.map((s) => ({ key: s, label: RETURN_STATUS_LABELS[s] })),
];

export const RETURN_PROGRESS_LABELS: Record<(typeof RETURN_PROGRESS_STAGES)[number], string> = {
  new: 'New',
  under_review: 'Review',
  approved: 'Approved',
  pickup_scheduled: 'Pickup',
  goods_received: 'Received',
  inspection_completed: 'Inspect',
  closed: 'Closed',
};

export const RETURN_TYPE_LABELS: Record<ReturnType, string> = {
  return: 'Return',
  replacement: 'Replacement',
  refund: 'Refund',
  claim: 'Claim',
};

export const RETURN_TYPE_OPTIONS: Array<{ value: '' | ReturnType; label: string }> = [
  { value: '', label: 'All types' },
  ...RETURN_TYPES.map((t) => ({ value: t, label: RETURN_TYPE_LABELS[t] })),
];

export const RETURN_DISPOSITION_LABELS: Record<ReturnDisposition, string> = {
  saleable: 'Saleable',
  return_to_brand: 'Return to brand',
  damaged: 'Damaged',
  expired: 'Expired',
  scrap: 'Scrap',
  qa_hold: 'QA hold',
};

export const RETURN_DISPOSITION_OPTIONS = RETURN_DISPOSITIONS.map((d) => ({
  value: d,
  label: RETURN_DISPOSITION_LABELS[d],
}));

export const RETURN_ITEM_REASON_LABELS: Record<string, string> = {
  damaged: 'Damaged',
  expired: 'Expired',
  wrong_item: 'Wrong item',
  short_supplied: 'Short supplied',
  quality_issue: 'Quality issue',
  not_as_described: 'Not as described',
  other: 'Other',
};

export type OutletOption = { id: string; name: string };

export type ReturnListRow = {
  id: string;
  status: ReturnStatus;
  type: string;
  reason: string;
  invoiceNumber: string | null;
  adminNote: string | null;
  refundAmount: string | number | null;
  resolutionType: string | null;
  creditNoteNumber: string | null;
  creditNoteAmount: string | number | null;
  pickupAt: string | null;
  goodsReceivedAt: string | null;
  replacementOrderId: string | null;
  createdAt: string;
  customer: {
    id: string;
    fullName: string;
    email: string | null;
    businessName: string | null;
    phone: string | null;
  };
  items: Array<{
    id: string;
    decision: string;
    requestedQty: number;
    approvedQty: number | null;
  }>;
  order: {
    id: string;
    orderNumber: string;
    totalAmount: string | number;
    vendorId: string;
    outletId: string | null;
    status: string;
    paymentMethod: string | null;
    outlet: { id: string; name: string } | null;
    user: {
      id: string;
      fullName: string;
      businessName: string | null;
      phone: string | null;
    } | null;
  };
};

export type ReturnItemRow = {
  id: string;
  orderItemId: string;
  requestedQty: number;
  approvedQty: number | null;
  reason: string;
  decision: string;
  disposition: ReturnDisposition | null;
  note: string | null;
  orderItem: {
    id: string;
    productId: string;
    productName: string;
    productSku: string | null;
    quantity: number;
    unitPrice: string | number;
    totalPrice: string | number;
    product: { imageUrl: string | null; sku: string | null; unit: string | null } | null;
  };
};

export type ReturnEventRow = {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  payload: unknown;
  createdAt: string;
  actorId: string | null;
};

export type ReturnInspectionRow = {
  id: string;
  passed: boolean;
  notes: string | null;
  verifiedBy: string | null;
  verifiedAt: string;
} | null;

export type ReturnDetail = Omit<ReturnListRow, 'items'> & {
  pickupAddress: string | null;
  pickupNotes: string | null;
  items: ReturnItemRow[];
  events: ReturnEventRow[];
  inspection: ReturnInspectionRow;
  replacementOrder: {
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: string | number;
  } | null;
  order: ReturnListRow['order'] & {
    paymentStatus: string;
    subtotal: string | number;
    deliveredAt: string | null;
    fulfillmentOutletId: string | null;
    userId: string;
    user: {
      id: string;
      fullName: string;
      businessName: string | null;
      phone: string | null;
      email: string | null;
    } | null;
  };
};

export function customerLabel(row: {
  customer?: { businessName: string | null; fullName: string } | null;
  order?: {
    user?: { businessName: string | null; fullName: string } | null;
    outlet?: { name: string } | null;
  } | null;
}): string {
  return (
    row.customer?.businessName ||
    row.customer?.fullName ||
    row.order?.user?.businessName ||
    row.order?.user?.fullName ||
    row.order?.outlet?.name ||
    '—'
  );
}

export function shortReturnId(id: string): string {
  return `R-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function progressStageIndex(status: ReturnStatus): number {
  if (status === 'rejected') {
    return RETURN_PROGRESS_STAGES.indexOf('under_review');
  }
  const idx = RETURN_PROGRESS_STAGES.indexOf(
    status as (typeof RETURN_PROGRESS_STAGES)[number],
  );
  return idx >= 0 ? idx : 0;
}

export function isAwaitingReview(status: ReturnStatus): boolean {
  return status === 'new' || status === 'under_review';
}

export function money(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  return `₹${Number(value).toLocaleString('en-IN')}`;
}
