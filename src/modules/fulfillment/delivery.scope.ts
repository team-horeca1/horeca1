/**
 * Locked product scope for Fulfilment → Delivery (magic-link POD).
 *
 * Source: Simplify Delivery Workspace plan + vendor request (2026-07-31).
 * Do not re-open these without an explicit product change — later todos
 * (magic-link, vendor-ui) must follow this file.
 */

/** Delivery UI statuses only (map onto Fulfilment/Order under the hood). */
export const DELIVERY_UI_STATUSES = [
  'accepted',
  'packed',
  'dispatched',
  'delivery_attempt_failed',
  'delivered',
] as const;

export type DeliveryUiStatus = (typeof DELIVERY_UI_STATUSES)[number];

/**
 * List filter chips — includes bucket aliases (New / Processing) plus stage chips.
 * New = Accepted only; Processing = after Accepted until Delivered.
 */
export const DELIVERY_FILTER_KEYS = [
  'new',
  'processing',
  ...DELIVERY_UI_STATUSES,
] as const;

export type DeliveryFilterKey = (typeof DELIVERY_FILTER_KEYS)[number];

/**
 * Linear progress stages (failed is a branch off Dispatched, not a step).
 * Accepted → Packed → Dispatched → Delivered
 */
export const DELIVERY_PROGRESS_STAGES = [
  'accepted',
  'packed',
  'dispatched',
  'delivered',
] as const satisfies readonly DeliveryUiStatus[];

export type DeliveryProgressStage = (typeof DELIVERY_PROGRESS_STAGES)[number];

/**
 * DB FulfilmentStatus values collapsed into each Delivery UI status.
 * Pick/pack ladder stays in DB for existing rows; UI never shows those stages.
 */
export const DELIVERY_UI_TO_DB_STATUSES = {
  accepted: ['awaiting_picking', 'picking', 'awaiting_packing'],
  packed: ['packed', 'ready_for_dispatch'],
  dispatched: ['out_for_delivery'],
  delivery_attempt_failed: ['failed_delivery'],
  delivered: ['delivered'],
} as const satisfies Record<DeliveryUiStatus, readonly string[]>;

const DB_TO_DELIVERY_UI: Record<string, DeliveryUiStatus> = Object.fromEntries(
  (Object.entries(DELIVERY_UI_TO_DB_STATUSES) as Array<
    [DeliveryUiStatus, readonly string[]]
  >).flatMap(([ui, dbStatuses]) => dbStatuses.map((db) => [db, ui])),
);

/** Map a DB FulfilmentStatus (or unknown) → Delivery UI status. */
export function toDeliveryUiStatus(dbStatus: string): DeliveryUiStatus {
  return DB_TO_DELIVERY_UI[dbStatus] ?? 'accepted';
}

/** Expand a Delivery UI filter chip into DB statuses for Prisma `in`. */
export function dbStatusesForDeliveryUi(uiStatus: DeliveryUiStatus): string[] {
  return [...DELIVERY_UI_TO_DB_STATUSES[uiStatus]];
}

/**
 * Expand list filter (including New / Processing buckets) → DB statuses.
 * New = Accepted; Processing = Packed + Dispatched + failed attempt (before Delivered).
 */
export function dbStatusesForDeliveryFilter(filter: DeliveryFilterKey): string[] {
  switch (filter) {
    case 'new':
      return dbStatusesForDeliveryUi('accepted');
    case 'processing':
      return [
        ...DELIVERY_UI_TO_DB_STATUSES.packed,
        ...DELIVERY_UI_TO_DB_STATUSES.dispatched,
        ...DELIVERY_UI_TO_DB_STATUSES.delivery_attempt_failed,
      ];
    default:
      return dbStatusesForDeliveryUi(filter);
  }
}

/** DB statuses allowed for mark_packed (Accepted bucket). */
export const DELIVERY_ACCEPTED_DB_STATUSES = DELIVERY_UI_TO_DB_STATUSES.accepted;

/** DB statuses allowed for assign_and_dispatch (Packed gate). */
export const DELIVERY_PACKED_DB_STATUSES = DELIVERY_UI_TO_DB_STATUSES.packed;

export const DELIVERY_UI_STATUS_LABELS: Record<DeliveryUiStatus, string> = {
  accepted: 'Accepted',
  packed: 'Packed',
  dispatched: 'Dispatched',
  delivery_attempt_failed: 'Delivery attempt failed',
  delivered: 'Delivered',
};

export const DELIVERY_FILTER_LABELS: Record<DeliveryFilterKey, string> = {
  new: 'New',
  processing: 'Processing',
  ...DELIVERY_UI_STATUS_LABELS,
};

export const DELIVERY_UI_STATUS_STYLE: Record<DeliveryUiStatus, string> = {
  accepted: 'bg-amber-50 text-amber-800 border-amber-200',
  packed: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  dispatched: 'bg-violet-50 text-violet-800 border-violet-200',
  delivery_attempt_failed: 'bg-rose-50 text-rose-800 border-rose-200',
  delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

export const DELIVERY_PROGRESS_LABELS: Record<DeliveryProgressStage, string> = {
  accepted: 'Accepted',
  packed: 'Packed',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
};

/**
 * 1) Returns — OUT of this rewrite.
 * Leave `/vendor/returns` and return APIs as already built. No Returns UX/API
 * changes in the Delivery pass.
 */
export const DELIVERY_SCOPE_RETURNS = 'out' as const;

/**
 * 2) Magic-link auth — public opaque token, no login.
 * Path `/d/[token]`. No delivery-boy accounts or app auth (explicit non-goal).
 * Token can be revoked/rotated on reschedule; link stays viewable after fail
 * but complete is disabled until vendor redispatches.
 */
export const DELIVERY_SCOPE_MAGIC_LINK_AUTH = 'public_token' as const;

/**
 * 3) Packed gate — hard gate before dispatch.
 * Flow: Accepted → mark Packed → assign boy + dispatch (creates magic link).
 * `assign_and_dispatch` must reject (or no-op with clear error) if not Packed.
 */
export const DELIVERY_SCOPE_PACKED_GATE = 'required_before_dispatch' as const;

/**
 * 4) Override location — vendor Delivery workspace only.
 * Magic-link boy UI: Complete Delivery (OTP) + Fail (fixed reasons) only.
 * Vendor drawer: Reschedule + Override mark delivered (no OTP, audit note).
 * Order workbench ship/POD left as-is; not the primary override surface.
 */
export const DELIVERY_SCOPE_OVERRIDE_LOCATION = 'vendor_delivery_ui_only' as const;

/** Fixed fail reasons on magic-link Fail + vendor record_failed_delivery. */
export const DELIVERY_FAIL_REASONS = [
  'customer_not_available',
  'wrong_address',
  'vehicle_breakdown',
  'product_damaged',
  'customer_refused_delivery',
  'other',
] as const;

export type DeliveryFailReason = (typeof DELIVERY_FAIL_REASONS)[number];

export const DELIVERY_FAIL_REASON_LABELS: Record<DeliveryFailReason, string> = {
  customer_not_available: 'Customer Not Available',
  wrong_address: 'Wrong Address',
  vehicle_breakdown: 'Vehicle Breakdown',
  product_damaged: 'Product Damaged',
  customer_refused_delivery: 'Customer Refused Delivery',
  other: 'Other',
};

/** Format stored failedReason text from enum (+ optional Other free text). */
export function formatDeliveryFailReason(
  reason: DeliveryFailReason,
  otherText?: string,
): string {
  const label = DELIVERY_FAIL_REASON_LABELS[reason];
  if (reason === 'other') {
    const detail = otherText?.trim();
    return detail ? `Other: ${detail}` : label;
  }
  return label;
}

/** Vendor actions allowed in the slim Delivery API/UI. */
export const DELIVERY_VENDOR_ACTIONS = [
  'mark_packed',
  'assign_and_dispatch',
  'record_failed_delivery',
  'reschedule_dispatch',
  'override_mark_delivered',
  'mark_delivered',
] as const;

export type DeliveryVendorAction = (typeof DELIVERY_VENDOR_ACTIONS)[number];

/** Boy magic-link actions (no override). */
export const DELIVERY_LINK_ACTIONS = [
  'request_otp',
  'complete',
  'fail',
] as const;

export type DeliveryLinkAction = (typeof DELIVERY_LINK_ACTIONS)[number];

/**
 * Delivery UI status → Order.status sync rules.
 * Failed attempt does not complete the order — Order stays `shipped`.
 */
export const DELIVERY_TO_ORDER_STATUS = {
  accepted: 'confirmed',
  packed: 'ready_for_dispatch',
  dispatched: 'shipped',
  delivery_attempt_failed: 'shipped',
  delivered: 'delivered',
} as const satisfies Record<DeliveryUiStatus, string>;

export function deliveryProgressStageIndex(uiStatus: DeliveryUiStatus): number {
  if (uiStatus === 'delivery_attempt_failed') {
    return DELIVERY_PROGRESS_STAGES.indexOf('dispatched');
  }
  return DELIVERY_PROGRESS_STAGES.indexOf(
    uiStatus as DeliveryProgressStage,
  );
}
