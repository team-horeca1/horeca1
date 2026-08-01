/**
 * Shared Fulfilment Workspace (S8) domain types.
 * Statuses live on Fulfilment — not shared with Order or Return enums.
 * Delivery UI collapses these via delivery.scope.ts (5-status flow).
 */

import type { DeliveryFailReason } from '@/modules/fulfillment/delivery.scope';

/** Operational fulfilment lifecycle (distinct from Order commercial statuses). */
export const FULFILMENT_STATUSES = [
  'awaiting_picking',
  'picking',
  'awaiting_packing',
  'packed',
  'ready_for_dispatch',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
] as const;

export type FulfilmentStatus = (typeof FULFILMENT_STATUSES)[number];

/** Ordered stages for progress UI (failed_delivery is a branch, not a linear step). */
export const FULFILMENT_PROGRESS_STAGES = [
  'awaiting_picking',
  'picking',
  'awaiting_packing',
  'packed',
  'ready_for_dispatch',
  'out_for_delivery',
  'delivered',
] as const satisfies readonly FulfilmentStatus[];

export type FulfilmentProgressStage = (typeof FULFILMENT_PROGRESS_STAGES)[number];

/** Delivery resource roster types. */
export const DELIVERY_RESOURCE_TYPES = [
  'executive',
  'vehicle',
  'logistics_partner',
] as const;

export type DeliveryResourceType = (typeof DELIVERY_RESOURCE_TYPES)[number];

/** Append-only delivery journey event kinds. */
export const DELIVERY_EVENT_KINDS = [
  'assigned',
  'en_route',
  'arrived',
  'pod',
  'failed',
  'redelivery',
] as const;

export type DeliveryEventKind = (typeof DELIVERY_EVENT_KINDS)[number];

/** Canonical FulfilmentEvent.action values. */
export const FULFILMENT_EVENT_ACTIONS = {
  CREATED: 'fulfilment.created',
  STATUS_CHANGED: 'fulfilment.status_changed',
  PICKLIST_GENERATED: 'fulfilment.picklist_generated',
  PICKING_COMPLETED: 'fulfilment.picking_completed',
  PACKING_STARTED: 'fulfilment.packing_started',
  PACKING_COMPLETED: 'fulfilment.packing_completed',
  MARK_PACKED: 'fulfilment.mark_packed',
  RESOURCE_ASSIGNED: 'fulfilment.resource_assigned',
  READY_FOR_DISPATCH: 'fulfilment.ready_for_dispatch',
  DISPATCHED: 'fulfilment.dispatched',
  POD_CAPTURED: 'fulfilment.pod_captured',
  DELIVERED: 'fulfilment.delivered',
  OVERRIDE_DELIVERED: 'fulfilment.override_delivered',
  FAILED_DELIVERY: 'fulfilment.failed_delivery',
  REDELIVERY_SCHEDULED: 'fulfilment.redelivery_scheduled',
  RESCHEDULE_DISPATCH: 'fulfilment.reschedule_dispatch',
} as const;

export type FulfilmentEventAction =
  (typeof FULFILMENT_EVENT_ACTIONS)[keyof typeof FULFILMENT_EVENT_ACTIONS];

/** Order statuses that fulfilment actions may sync at stage gates. */
export const FULFILMENT_ORDER_STATUS_GATES = [
  'processing',
  'ready_for_dispatch',
  'shipped',
  'delivered',
] as const;

export type FulfilmentOrderStatusGate = (typeof FULFILMENT_ORDER_STATUS_GATES)[number];

// ─── POST /vendor/fulfilments/:id/actions — slim Delivery actions ─────────────

/**
 * Vendor Delivery workspace actions (5-status flow).
 * Pick/pack ladder actions are disabled for Delivery — left in DB only.
 */
export type FulfilmentActionBody =
  | { action: 'mark_packed' }
  | {
      action: 'assign_and_dispatch';
      deliveryBoyName: string;
      deliveryBoyPhone: string;
      eta?: string;
    }
  | {
      action: 'record_failed_delivery';
      failedReason: DeliveryFailReason;
      /** Required when failedReason === 'other'. */
      failedReasonOther?: string;
    }
  | {
      action: 'reschedule_dispatch';
      eta?: string;
      notes?: string;
    }
  | {
      action: 'override_mark_delivered';
      /** Audit note required — no OTP. */
      note: string;
    }
  | {
      action: 'mark_delivered';
      /** Customer delivery OTP (same pattern as order ship POD). */
      otp: string;
    };

export type FulfilmentAction = FulfilmentActionBody['action'];

/** Bulk: assign boy + dispatch selected fulfilments (Packed gate each). */
export type FulfilmentBulkActionBody = {
  action: 'assign_and_dispatch';
  fulfilmentIds: string[];
  deliveryBoyName: string;
  deliveryBoyPhone: string;
  eta?: string;
};

/**
 * Teal accent — apply only on Fulfilment Workspace pages
 * (CSS var on workspace root + Tailwind arbitrary utilities).
 */
export const FULFILMENT_ACCENT = {
  hex: '#0F766E',
  cssVar: '--fulfilment-accent',
  cssVarValue: '#0F766E',
  text: 'text-[#0F766E]',
  bg: 'bg-[#0F766E]',
  bgSoft: 'bg-[#0F766E]/10',
  border: 'border-[#0F766E]',
  ring: 'ring-[#0F766E]',
  hoverBg: 'hover:bg-[#0F766E]',
  hoverText: 'hover:text-[#0F766E]',
} as const;

/** Inline style to scope `--fulfilment-accent` on a workspace root element. */
export const FULFILMENT_ACCENT_STYLE: Record<string, string> = {
  [FULFILMENT_ACCENT.cssVar]: FULFILMENT_ACCENT.cssVarValue,
};
