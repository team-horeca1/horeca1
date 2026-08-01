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

/** Ordered stages for progress UI (rejected is a terminal branch). */
export const RETURN_PROGRESS_STAGES = [
  'new',
  'under_review',
  'approved',
  'pickup_scheduled',
  'goods_received',
  'inspection_completed',
  'closed',
] as const satisfies readonly ReturnStatus[];

export type ReturnProgressStage = (typeof RETURN_PROGRESS_STAGES)[number];

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

/** Return request commercial type. */
export const RETURN_TYPES = [
  'return',
  'replacement',
  'refund',
  'claim',
] as const;

export type ReturnType = (typeof RETURN_TYPES)[number];

/** Per-line customer reason (maps to Prisma `ReturnItemReason`). */
export const RETURN_ITEM_REASONS = [
  'damaged',
  'expired',
  'wrong_item',
  'short_supplied',
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

/** Canonical ReturnEvent.action values. */
export const RETURN_EVENT_ACTIONS = {
  CREATED: 'return.created',
  STATUS_CHANGED: 'return.status_changed',
  APPROVED: 'return.approved',
  PARTIAL_APPROVED: 'return.partial_approved',
  REJECTED: 'return.rejected',
  PICKUP_SCHEDULED: 'return.pickup_scheduled',
  GOODS_RECEIVED: 'return.goods_received',
  INSPECTION_COMPLETED: 'return.inspection_completed',
  GOODS_REJECTED: 'return.goods_rejected',
  DISPOSITION_SET: 'return.disposition_set',
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
      pickupAt: string;
      pickupAddress?: string;
      notes?: string;
    }
  | {
      action: 'mark_goods_received';
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
      action: 'generate_replacement';
      items?: Array<{ returnItemId: string; quantity: number }>;
      notes?: string;
    }
  | {
      action: 'generate_credit_note';
      amount?: number;
      notes?: string;
    }
  | {
      action: 'process_refund';
      amount?: number;
      notes?: string;
    }
  | { action: 'close'; notes?: string };

export type ReturnAction = ReturnActionBody['action'];

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
