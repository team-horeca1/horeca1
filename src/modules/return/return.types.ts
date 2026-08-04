/**
 * Shared Returns Workspace (S9) domain types.
 * Statuses live on ReturnRequest — not shared with Order or Fulfilment enums.
 */

/** S9 return lifecycle (post-migration). */
export const RETURN_STATUSES = [
  'new',
  'under_review',
  'approved',
  'rejected',
  'pickup_scheduled',
  'goods_received',
  'inspection_completed',
  'closed',
] as const;

export type ReturnStatus = (typeof RETURN_STATUSES)[number];

/**
 * Vendor UI statuses — Delivery-tab parity.
 * Collapse DB ladder into few chips: New / Review / Approved / Pickup /
 * Received / Closed (+ Rejected branch). Inspection stays a drawer step.
 */
export const RETURN_UI_STATUSES = [
  'new',
  'review',
  'approved',
  'rejected',
  'pickup',
  'received',
  'closed',
] as const;

export type ReturnUiStatus = (typeof RETURN_UI_STATUSES)[number];

/** DB statuses collapsed into each Return UI status. */
export const RETURN_UI_TO_DB_STATUSES = {
  new: ['new'],
  review: ['under_review'],
  approved: ['approved'],
  rejected: ['rejected'],
  pickup: ['pickup_scheduled'],
  received: ['goods_received', 'inspection_completed'],
  closed: ['closed'],
} as const satisfies Record<ReturnUiStatus, readonly ReturnStatus[]>;

const DB_TO_RETURN_UI: Record<string, ReturnUiStatus> = Object.fromEntries(
  (Object.entries(RETURN_UI_TO_DB_STATUSES) as Array<
    [ReturnUiStatus, readonly ReturnStatus[]]
  >).flatMap(([ui, dbStatuses]) => dbStatuses.map((db) => [db, ui])),
);

/** Map a DB ReturnStatus (or legacy) → vendor UI status. */
export function toReturnUiStatus(dbStatus: string): ReturnUiStatus {
  const normalized = mapLegacyReturnStatus(dbStatus);
  return DB_TO_RETURN_UI[normalized] ?? 'new';
}

/** Expand a UI filter chip into DB statuses for Prisma `in`. */
export function dbStatusesForReturnUi(uiStatus: ReturnUiStatus): ReturnStatus[] {
  return [...RETURN_UI_TO_DB_STATUSES[uiStatus]];
}

export function isReturnUiStatus(value: string): value is ReturnUiStatus {
  return (RETURN_UI_STATUSES as readonly string[]).includes(value);
}

/**
 * Linear progress stages (rejected is a branch off Review, not a step).
 * New → Review → Approved → Pickup → Received → Closed
 * Inspection is a drawer step inside Received — not a progress node.
 */
export const RETURN_PROGRESS_STAGES = [
  'new',
  'review',
  'approved',
  'pickup',
  'received',
  'closed',
] as const satisfies readonly ReturnUiStatus[];

export type ReturnProgressStage = (typeof RETURN_PROGRESS_STAGES)[number];

/**
 * Skip-pickup path: no physical accept — progress jumps Approved → Closed.
 */
export const RETURN_SKIP_PROGRESS_STAGES = [
  'new',
  'review',
  'approved',
  'closed',
] as const satisfies readonly ReturnUiStatus[];

/**
 * Pre-S9 statuses still stored on `return_requests.status`.
 * Map via {@link mapLegacyReturnStatus} during migration / reads.
 */
export const LEGACY_RETURN_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'refund_processing',
  'refunded',
  'resolved',
] as const;

export type LegacyReturnStatus = (typeof LEGACY_RETURN_STATUSES)[number];

/** Legacy → S9 status mapping used at read / migrate time. */
export const LEGACY_RETURN_STATUS_MAP: Record<LegacyReturnStatus, ReturnStatus> = {
  pending: 'new',
  approved: 'approved',
  rejected: 'rejected',
  refund_processing: 'approved',
  refunded: 'closed',
  resolved: 'closed',
};

export function mapLegacyReturnStatus(status: string): ReturnStatus {
  if ((RETURN_STATUSES as readonly string[]).includes(status)) {
    return status as ReturnStatus;
  }
  if ((LEGACY_RETURN_STATUSES as readonly string[]).includes(status)) {
    return LEGACY_RETURN_STATUS_MAP[status as LegacyReturnStatus];
  }
  return 'new';
}

export function isReturnStatus(value: string): value is ReturnStatus {
  return (RETURN_STATUSES as readonly string[]).includes(value);
}

/** Progress index for vendor drawer (skip-pickup collapses pickup/received). */
export function returnProgressStageIndex(
  dbStatus: string,
  opts?: { pickupSkipped?: boolean },
): number {
  const ui = toReturnUiStatus(dbStatus);
  const stages = opts?.pickupSkipped
    ? RETURN_SKIP_PROGRESS_STAGES
    : RETURN_PROGRESS_STAGES;

  if (ui === 'rejected') {
    return stages.indexOf('review');
  }

  const idx = (stages as readonly ReturnUiStatus[]).indexOf(ui);
  return idx >= 0 ? idx : 0;
}

/**
 * Types allowed on new customer creates (Rule 9 — no replacements).
 * Legacy `replacement` rows remain readable via {@link RETURN_TYPES}.
 */
export const CREATE_RETURN_TYPES = ['return', 'refund', 'claim'] as const;

export type CreateReturnType = (typeof CREATE_RETURN_TYPES)[number];

/** All stored return types including legacy `replacement`. */
export const RETURN_TYPES = [
  'return',
  'replacement',
  'refund',
  'claim',
] as const;

export type ReturnType = (typeof RETURN_TYPES)[number];

/**
 * Vendor close gate — after CN path only `credit_note` resolves the return.
 * Admin gateway refunds stay outside the vendor two-path model.
 */
export const VENDOR_RESOLUTION_TYPES = ['credit_note'] as const;

export type VendorResolutionType = (typeof VENDOR_RESOLUTION_TYPES)[number];

/** Stored resolution values (legacy refund/replacement still present on old rows). */
export const RESOLUTION_TYPES = ['credit_note', 'refund', 'replacement'] as const;

export type ResolutionType = (typeof RESOLUTION_TYPES)[number];

/** Per-line customer reason (maps to Prisma `ReturnItemReason`). */
export const RETURN_ITEM_REASONS = [
  'damaged',
  'expired',
  'wrong_item',
  'short_supplied',
  'excess_supplied',
  'customer_rejected',
  'quality_issue',
  'not_as_described',
  'other',
] as const;

export type ReturnItemReason = (typeof RETURN_ITEM_REASONS)[number];

/** Post-inspection inventory disposition. */
export const RETURN_DISPOSITIONS = [
  'saleable',
  'return_to_brand',
  'damaged',
  'expired',
  'scrap',
  'qa_hold',
] as const;

export type ReturnDisposition = (typeof RETURN_DISPOSITIONS)[number];

/** Per-line vendor decision before disposition. */
export const RETURN_ITEM_DECISIONS = [
  'pending',
  'approved',
  'partial',
  'rejected',
] as const;

export type ReturnItemDecision = (typeof RETURN_ITEM_DECISIONS)[number];

/** Fixed fail reasons on public `/r/` pickup fail (+ vendor audit). */
export const RETURN_PICKUP_FAIL_REASONS = [
  'customer_not_available',
  'wrong_address',
  'goods_not_ready',
  'customer_refused',
  'vehicle_breakdown',
  'other',
] as const;

export type ReturnPickupFailReason = (typeof RETURN_PICKUP_FAIL_REASONS)[number];

export const RETURN_PICKUP_FAIL_REASON_LABELS: Record<ReturnPickupFailReason, string> = {
  customer_not_available: 'Customer Not Available',
  wrong_address: 'Wrong Address',
  goods_not_ready: 'Goods Not Ready',
  customer_refused: 'Customer Refused Pickup',
  vehicle_breakdown: 'Vehicle Breakdown',
  other: 'Other',
};

export function formatReturnPickupFailReason(
  reason: ReturnPickupFailReason,
  otherText?: string,
): string {
  const label = RETURN_PICKUP_FAIL_REASON_LABELS[reason];
  if (reason === 'other') {
    const detail = otherText?.trim();
    return detail ? `Other: ${detail}` : label;
  }
  return label;
}

/** Boy magic-link actions on `/r/[token]` (no vendor override). */
export const RETURN_PICKUP_LINK_ACTIONS = [
  'request_otp',
  'complete',
  'fail',
] as const;

export type ReturnPickupLinkAction = (typeof RETURN_PICKUP_LINK_ACTIONS)[number];

/** Canonical ReturnEvent.action values. */
export const RETURN_EVENT_ACTIONS = {
  CREATED: 'return.created',
  STATUS_CHANGED: 'return.status_changed',
  APPROVED: 'return.approved',
  PARTIAL_APPROVED: 'return.partial_approved',
  REJECTED: 'return.rejected',
  PICKUP_SCHEDULED: 'return.pickup_scheduled',
  PICKUP_SKIPPED: 'return.pickup_skipped',
  PICKUP_OTP_ISSUED: 'return.pickup_otp_issued',
  PICKUP_FAILED: 'return.pickup_failed',
  GOODS_RECEIVED: 'return.goods_received',
  INSPECTION_COMPLETED: 'return.inspection_completed',
  GOODS_REJECTED: 'return.goods_rejected',
  DISPOSITION_SET: 'return.disposition_set',
  /** Legacy — Rule 9 blocks new replacements; kept for historical events. */
  REPLACEMENT_GENERATED: 'return.replacement_generated',
  CREDIT_NOTE_GENERATED: 'return.credit_note_generated',
  REFUND_PROCESSED: 'return.refund_processed',
  CLOSED: 'return.closed',
} as const;

export type ReturnEventAction =
  (typeof RETURN_EVENT_ACTIONS)[keyof typeof RETURN_EVENT_ACTIONS];

// ─── POST /vendor/returns/:id/actions bodies ────────────────────────────────

export type ReturnLineDecisionInput = {
  returnItemId: string;
  decision: Exclude<ReturnItemDecision, 'pending'>;
  approvedQty?: number;
  note?: string;
};

export type ReturnDispositionInput = {
  returnItemId: string;
  disposition: ReturnDisposition;
};

/**
 * Active vendor workspace actions (S9 Delivery-tab simplicity).
 * Rule 9: `generate_replacement` is blocked — see {@link BLOCKED_RETURN_ACTIONS}.
 * Admin Razorpay refund stays on the admin route, not here.
 */
export type ReturnActionBody =
  | {
      action: 'approve';
      items?: ReturnLineDecisionInput[];
      adminNote?: string;
    }
  | {
      action: 'partial_approve';
      items: ReturnLineDecisionInput[];
      adminNote?: string;
    }
  | {
      action: 'reject';
      reason: string;
      adminNote?: string;
    }
  | {
      action: 'schedule_pickup';
      /** Prefer selecting an existing roster boy. */
      deliveryResourceId?: string;
      /** Required when creating a new boy (no deliveryResourceId). */
      deliveryBoyName?: string;
      deliveryBoyPhone?: string;
      notes?: string;
    }
  | {
      action: 'skip_pickup';
      reason: string;
    }
  | {
      action: 'resend_pickup_otp';
    }
  | {
      /** Vendor override receive — OTP required (same code SMS’d to customer). */
      action: 'mark_goods_received';
      otp: string;
      receivedAt?: string;
      notes?: string;
    }
  | {
      action: 'complete_inspection';
      passed: boolean;
      notes?: string;
      verifiedBy?: string;
    }
  | {
      action: 'reject_goods';
      reason: string;
      notes?: string;
    }
  | {
      action: 'set_disposition';
      items: ReturnDispositionInput[];
    }
  | {
      action: 'generate_credit_note';
      amount?: number;
      notes?: string;
    }
  | { action: 'close'; notes?: string };

export type ReturnAction = ReturnActionBody['action'];

/** Actions rejected at the validator with a clear error (Rule 9 / vendor flow). */
export const BLOCKED_RETURN_ACTIONS = [
  'generate_replacement',
  'process_refund',
] as const;

export type BlockedReturnAction = (typeof BLOCKED_RETURN_ACTIONS)[number];

export const BLOCKED_RETURN_ACTION_MESSAGES: Record<BlockedReturnAction, string> = {
  generate_replacement: 'Replacements are not supported',
  process_refund:
    'Vendor refunds are not supported — generate a credit note, or use admin for gateway refunds',
};

// ─── Public /r/[token] bodies ────────────────────────────────────────────────

export type ReturnPickupLinkCompleteBody = {
  otp: string;
};

export type ReturnPickupLinkFailBody = {
  failedReason: ReturnPickupFailReason;
  failedReasonOther?: string;
};

/**
 * Amber accent — apply only on Returns Workspace pages
 * (CSS var on workspace root + Tailwind arbitrary utilities).
 */
export const RETURNS_ACCENT = {
  hex: '#B45309',
  cssVar: '--returns-accent',
  cssVarValue: '#B45309',
  text: 'text-[#B45309]',
  bg: 'bg-[#B45309]',
  bgSoft: 'bg-[#B45309]/10',
  border: 'border-[#B45309]',
  ring: 'ring-[#B45309]',
  hoverBg: 'hover:bg-[#B45309]',
  hoverText: 'hover:text-[#B45309]',
} as const;

/** Inline style to scope `--returns-accent` on a workspace root element. */
export const RETURNS_ACCENT_STYLE: Record<string, string> = {
  [RETURNS_ACCENT.cssVar]: RETURNS_ACCENT.cssVarValue,
};
