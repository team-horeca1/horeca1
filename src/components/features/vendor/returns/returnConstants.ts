import {
  RETURN_DISPOSITIONS,
  RETURN_PROGRESS_STAGES,
  RETURN_SKIP_PROGRESS_STAGES,
  RETURN_TYPES,
  RETURN_UI_STATUSES,
  dbStatusesForReturnUi,
  returnProgressStageIndex,
  toReturnUiStatus,
  type ReturnDisposition,
  type ReturnProgressStage,
  type ReturnStatus,
  type ReturnType,
  type ReturnUiStatus,
} from '@/modules/return/return.types';
import { personFirstCustomerLabel } from '@/lib/customerLabel';

export const RETURN_UI_STATUS_LABELS: Record<ReturnUiStatus, string> = {
  new: 'New',
  review: 'Review',
  approved: 'Approved',
  rejected: 'Rejected',
  pickup: 'Pickup',
  received: 'Received',
  closed: 'Closed',
};

export const RETURN_UI_STATUS_STYLE: Record<ReturnUiStatus, string> = {
  new: 'bg-amber-50 text-amber-800 border-amber-200',
  review: 'bg-orange-50 text-orange-800 border-orange-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  pickup: 'bg-sky-50 text-sky-800 border-sky-200',
  received: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  closed: 'bg-slate-100 text-slate-700 border-slate-200',
};

/** @deprecated Prefer RETURN_UI_STATUS_LABELS via toReturnUiStatus */
export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  new: RETURN_UI_STATUS_LABELS.new,
  under_review: RETURN_UI_STATUS_LABELS.review,
  approved: RETURN_UI_STATUS_LABELS.approved,
  rejected: RETURN_UI_STATUS_LABELS.rejected,
  pickup_scheduled: RETURN_UI_STATUS_LABELS.pickup,
  goods_received: RETURN_UI_STATUS_LABELS.received,
  inspection_completed: RETURN_UI_STATUS_LABELS.received,
  closed: RETURN_UI_STATUS_LABELS.closed,
};

/** @deprecated Prefer RETURN_UI_STATUS_STYLE via toReturnUiStatus */
export const RETURN_STATUS_STYLE: Record<ReturnStatus, string> = {
  new: RETURN_UI_STATUS_STYLE.new,
  under_review: RETURN_UI_STATUS_STYLE.review,
  approved: RETURN_UI_STATUS_STYLE.approved,
  rejected: RETURN_UI_STATUS_STYLE.rejected,
  pickup_scheduled: RETURN_UI_STATUS_STYLE.pickup,
  goods_received: RETURN_UI_STATUS_STYLE.received,
  inspection_completed: RETURN_UI_STATUS_STYLE.received,
  closed: RETURN_UI_STATUS_STYLE.closed,
};

export const RETURN_STATUS_CHIPS: Array<{ key: 'all' | ReturnUiStatus; label: string }> = [
  { key: 'all', label: 'All' },
  ...RETURN_UI_STATUSES.map((s) => ({ key: s, label: RETURN_UI_STATUS_LABELS[s] })),
];

export const RETURN_PROGRESS_LABELS: Record<ReturnProgressStage, string> = {
  new: 'New',
  review: 'Review',
  approved: 'Approved',
  pickup: 'Pickup',
  received: 'Received',
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
  ...RETURN_TYPES.filter((t) => t !== 'replacement').map((t) => ({
    value: t,
    label: RETURN_TYPE_LABELS[t],
  })),
];

export const RETURN_DISPOSITION_LABELS: Record<ReturnDisposition, string> = {
  saleable: 'Saleable',
  return_to_brand: 'Return to Online Store/Brand',
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
  excess_supplied: 'Excess supplied',
  customer_rejected: 'Customer rejected',
  quality_issue: 'Quality issue',
  not_as_described: 'Not as described',
  other: 'Other',
};

export type OutletOption = { id: string; name: string };

export type ReturnPickupLink = {
  path: string;
  url: string;
  expiresAt: string;
  usedAt: string | null;
  deliveryBoyName: string | null;
  deliveryBoyPhone: string | null;
};

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
  pickupSkippedAt?: string | null;
  replacementOrderId: string | null;
  pickupLink?: ReturnPickupLink | null;
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
  pickupSkippedAt?: string | null;
  pickupSkipReason?: string | null;
  hasPickupOtp?: boolean;
  pickupLink?: ReturnPickupLink | null;
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
  return personFirstCustomerLabel({
    fullName: row.customer?.fullName || row.order?.user?.fullName,
    businessName: row.customer?.businessName || row.order?.user?.businessName,
    outletName: row.order?.outlet?.name,
    fallback: '—',
  });
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

export function progressStageIndex(
  status: ReturnStatus | string,
  opts?: { pickupSkipped?: boolean },
): number {
  return returnProgressStageIndex(status, opts);
}

export function returnStatusLabel(dbStatus: string): string {
  return RETURN_UI_STATUS_LABELS[toReturnUiStatus(dbStatus)];
}

export function returnStatusStyle(dbStatus: string): string {
  return RETURN_UI_STATUS_STYLE[toReturnUiStatus(dbStatus)];
}

export function isAwaitingReview(status: ReturnStatus | string): boolean {
  const ui = toReturnUiStatus(status);
  return ui === 'new' || ui === 'review';
}

export function money(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

/** Absolute URL for a magic-link path (client-safe). */
export function pickupLinkAbsoluteUrl(path: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export {
  RETURN_PROGRESS_STAGES,
  RETURN_SKIP_PROGRESS_STAGES,
  dbStatusesForReturnUi,
  toReturnUiStatus,
};
