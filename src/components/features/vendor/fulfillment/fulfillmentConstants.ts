import {
  DELIVERY_FILTER_KEYS,
  DELIVERY_FILTER_LABELS,
  DELIVERY_PROGRESS_LABELS,
  DELIVERY_PROGRESS_STAGES,
  DELIVERY_UI_STATUS_LABELS,
  DELIVERY_UI_STATUS_STYLE,
  deliveryProgressStageIndex,
  toDeliveryUiStatus,
  type DeliveryFilterKey,
  type DeliveryUiStatus,
} from '@/modules/fulfillment/delivery.scope';
import { FULFILMENT_ACCENT, type FulfilmentStatus } from '@/modules/fulfillment/fulfillment.types';
import { personFirstCustomerLabel } from '@/lib/customerLabel';

export {
  DELIVERY_UI_STATUS_LABELS,
  DELIVERY_UI_STATUS_STYLE,
  toDeliveryUiStatus,
  type DeliveryFilterKey,
  type DeliveryUiStatus,
};

/** @deprecated Prefer DELIVERY_UI_STATUS_LABELS via toDeliveryUiStatus */
export const FULFILMENT_STATUS_LABELS: Record<FulfilmentStatus, string> = {
  awaiting_picking: DELIVERY_UI_STATUS_LABELS.accepted,
  picking: DELIVERY_UI_STATUS_LABELS.accepted,
  awaiting_packing: DELIVERY_UI_STATUS_LABELS.accepted,
  packed: DELIVERY_UI_STATUS_LABELS.packed,
  ready_for_dispatch: DELIVERY_UI_STATUS_LABELS.packed,
  out_for_delivery: DELIVERY_UI_STATUS_LABELS.dispatched,
  delivered: DELIVERY_UI_STATUS_LABELS.delivered,
  failed_delivery: DELIVERY_UI_STATUS_LABELS.delivery_attempt_failed,
};

/** @deprecated Prefer DELIVERY_UI_STATUS_STYLE via toDeliveryUiStatus */
export const FULFILMENT_STATUS_STYLE: Record<FulfilmentStatus, string> = {
  awaiting_picking: DELIVERY_UI_STATUS_STYLE.accepted,
  picking: DELIVERY_UI_STATUS_STYLE.accepted,
  awaiting_packing: DELIVERY_UI_STATUS_STYLE.accepted,
  packed: DELIVERY_UI_STATUS_STYLE.packed,
  ready_for_dispatch: DELIVERY_UI_STATUS_STYLE.packed,
  out_for_delivery: DELIVERY_UI_STATUS_STYLE.dispatched,
  delivered: DELIVERY_UI_STATUS_STYLE.delivered,
  failed_delivery: DELIVERY_UI_STATUS_STYLE.delivery_attempt_failed,
};

export const FULFILMENT_STATUS_CHIPS: Array<{
  key: 'all' | DeliveryFilterKey;
  label: string;
}> = [
  { key: 'all', label: 'All' },
  ...DELIVERY_FILTER_KEYS.map((s) => ({
    key: s,
    label: DELIVERY_FILTER_LABELS[s],
  })),
];

export const FULFILMENT_PROGRESS_LABELS = DELIVERY_PROGRESS_LABELS;

export const PAYMENT_METHOD_OPTIONS = [
  { value: '', label: 'All payments' },
  { value: 'online', label: 'Online' },
  { value: 'cod', label: 'COD' },
  { value: 'credit', label: 'Credit' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'h1_wallet', label: 'H1 Wallet' },
] as const;

export type DeliveryResourceRow = {
  id: string;
  type: string;
  name: string;
  phone: string | null;
  isActive: boolean;
};

export type MagicLinkSummary = {
  token: string;
  path: string;
  deliveryBoyName: string;
  deliveryBoyPhone: string;
  expiresAt: string | Date;
  usedAt: string | Date | null;
  createdAt?: string | Date;
};

export type BoyPortalSummary = {
  token: string;
  path: string;
  expiresAt: string | Date;
};

export type FulfilmentListRow = {
  id: string;
  fulfilmentNumber: string;
  status: FulfilmentStatus;
  eta: string | null;
  failedReason: string | null;
  redeliveryAt: string | null;
  createdAt: string;
  deliveryResource: { id: string; type: string; name: string; phone: string | null } | null;
  outlet: { id: string; name: string } | null;
  magicLink: MagicLinkSummary | null;
  boyPortal?: BoyPortalSummary | null;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentMethod: string | null;
    paymentStatus: string;
    totalAmount: string | number;
    deliveryDate: string | null;
    deliveryAddressSnapshot?: { name?: string } | Record<string, unknown> | null;
    user: {
      id: string;
      fullName: string;
      businessName: string | null;
      phone: string | null;
    };
    outlet: { id: string; name: string } | null;
  };
};

export type FulfilmentItemRow = {
  id: string;
  orderItemId: string;
  acceptedQty: number;
  pickedQty: number;
  packedQty: number;
  exceptionNote: string | null;
  orderItem: {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: string | number;
    totalPrice: string | number;
    product: { imageUrl: string | null; sku: string | null; unit: string | null } | null;
  };
};

export type FulfilmentEventRow = {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  payload: unknown;
  createdAt: string;
  actorId: string | null;
};

export type DeliveryEventRow = {
  id: string;
  kind: string;
  payload: unknown;
  createdAt: string;
  actorId: string | null;
};

export type FulfilmentDetail = FulfilmentListRow & {
  items: FulfilmentItemRow[];
  events: FulfilmentEventRow[];
  deliveryEvents: DeliveryEventRow[];
  picklists: Array<{ id: string; status: string; createdAt: string; notes: string | null }>;
  dispatches: Array<{
    id: string;
    status: string;
    driverName: string | null;
    vehicleNumber: string | null;
    dispatchedAt: string | null;
    deliveredAt: string | null;
  }>;
  magicLink: MagicLinkSummary | null;
  order: FulfilmentListRow['order'] & {
    deliveryOtp: string | null;
    deliveryOtpExpiresAt: string | null;
    deliveryOtpVerifiedAt: string | null;
    deliveryProofType: string | null;
    deliveryProofUrl: string | null;
    deliveryNotes: string | null;
    deliveredAt: string | null;
  };
};

/** Primary customer display — person name first (matches vendor Orders page). */
export function customerLabel(row: {
  user?: { businessName: string | null; fullName: string } | null;
  outlet?: { name: string } | null;
}): string {
  return personFirstCustomerLabel({
    fullName: row.user?.fullName,
    businessName: row.user?.businessName,
    outletName: row.outlet?.name,
    fallback: '—',
  });
}

/** Customer delivery outlet (order stamp), not the warehouse fulfilment outlet. */
export function orderDeliverOutletName(order: {
  outlet?: { name: string } | null;
  deliveryAddressSnapshot?: { name?: string } | Record<string, unknown> | null;
}): string | null {
  const fromOutlet = order.outlet?.name?.trim();
  if (fromOutlet) return fromOutlet;
  const snap = order.deliveryAddressSnapshot as { name?: string } | null | undefined;
  const fromSnap = snap?.name?.trim();
  return fromSnap || null;
}

export function fulfilmentOutletLabels(row: {
  outlet?: { name: string } | null;
  order: {
    outlet?: { name: string } | null;
    deliveryAddressSnapshot?: { name?: string } | Record<string, unknown> | null;
  };
}): { deliver: string | null; fulfill: string | null } {
  return {
    deliver: orderDeliverOutletName(row.order),
    fulfill: row.outlet?.name?.trim() || null,
  };
}

export function formatEta(eta: string | null | undefined): string {
  if (!eta) return '—';
  try {
    return new Date(eta).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function progressStageIndex(status: FulfilmentStatus | string): number {
  return deliveryProgressStageIndex(toDeliveryUiStatus(status));
}

export function deliveryStatusLabel(dbStatus: string): string {
  return DELIVERY_UI_STATUS_LABELS[toDeliveryUiStatus(dbStatus)];
}

export function deliveryStatusStyle(dbStatus: string): string {
  return DELIVERY_UI_STATUS_STYLE[toDeliveryUiStatus(dbStatus)];
}

/** Absolute URL for a magic-link path (client-safe). */
export function magicLinkAbsoluteUrl(path: string): string {
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

/** Packed rows may be multi-selected for bulk assign & dispatch. */
export function canBulkAssign(dbStatus: string): boolean {
  return toDeliveryUiStatus(dbStatus) === 'packed';
}

export { DELIVERY_PROGRESS_STAGES, FULFILMENT_ACCENT };
