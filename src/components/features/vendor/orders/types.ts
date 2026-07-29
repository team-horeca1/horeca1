/** Shared types for vendor order workbench / workspace. */

export interface WorkbenchUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  businessName: string | null;
}

export interface WorkbenchSubstitute {
  id: string;
  name: string;
  sku: string | null;
}

export interface WorkbenchItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  fulfilledQty: number;
  cancelledQty?: number;
  balanceQty?: number;
  lineStatus?: 'OPEN' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'CANCELLED';
  unitPrice: number;
  totalPrice: number;
  stockAvailable?: number;
  isLowStock?: boolean;
  substitutes?: WorkbenchSubstitute[];
  product?: {
    imageUrl: string | null;
    sku: string | null;
    unit: string | null;
    packSize: string | null;
  } | null;
}

export interface WorkbenchShipment {
  id: string;
  shipmentNo: number;
  createdAt: string;
  notes?: string | null;
  actor?: { id: string; fullName: string } | null;
  items: Array<{ orderItemId: string; qty: number }>;
}

export interface WorkbenchEvent {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; fullName: string; email: string | null } | null;
}

export interface WorkbenchCancelRequest {
  id: string;
  status: string;
  reason: string;
  vendorNote: string | null;
  createdAt: string;
}

export interface WorkbenchOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  paymentStatus: string;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: string;
  isPartial: boolean;
  deliveryAddressSnapshot: Record<string, unknown> | null;
  user: WorkbenchUser;
  items: WorkbenchItem[];
  shipments?: WorkbenchShipment[];
  events?: WorkbenchEvent[];
  cancelRequest?: WorkbenchCancelRequest | null;
  attentionReasons?: string[];
}

export const WORKBENCH_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  confirmed: 'Accepted',
  processing: 'Packed',
  ready_for_dispatch: 'Ready for Dispatch',
  shipped: 'Dispatched',
  partially_delivered: 'Partially Fulfilled',
  delivered: 'Completed',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

export const WORKBENCH_LINE_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  PARTIALLY_FULFILLED: 'Partially Fulfilled',
  FULFILLED: 'Fulfilled',
  CANCELLED: 'Cancelled',
};

export const WORKBENCH_EVENT_LABELS: Record<string, string> = {
  'order.created': 'Order created',
  'order.auto_accepted': 'Auto-accepted',
  'status.changed': 'Status changed',
  'item.qty_adjusted': 'Quantity adjusted',
  'item.rejected': 'Item rejected',
  'item.substituted': 'Item substituted',
  'order.partial_fulfilment': 'Partial fulfilment',
  'order.shipped_lines': 'Shipment created',
  'order.balance_cancelled': 'Balance cancelled',
  'order.cancelled': 'Order cancelled',
  'cancel.requested': 'Cancellation requested',
  'cancel.approved': 'Cancellation approved',
  'cancel.rejected': 'Cancellation declined',
  'invoice.generated': 'Invoice generated',
};

export function formatWorkbenchPrice(v: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format(v);
}

export function formatWorkbenchDateTime(dt: string): string {
  return new Date(dt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Next fulfilment step from current status (null if terminal / no single next). */
export function nextWorkbenchStatus(status: string): { status: string; label: string } | null {
  switch (status) {
    case 'pending':
      return { status: 'confirmed', label: 'Mark as Accepted' };
    case 'confirmed':
      return { status: 'processing', label: 'Mark as Packed' };
    case 'processing':
      return { status: 'ready_for_dispatch', label: 'Ready for Dispatch' };
    case 'ready_for_dispatch':
      return { status: 'shipped', label: 'Mark as Dispatched' };
    case 'shipped':
      return { status: 'delivered', label: 'Confirm Delivered' };
    case 'partially_delivered':
      return { status: 'delivered', label: 'Mark Completed' };
    default:
      return null;
  }
}
