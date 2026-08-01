'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TimelineStep {
  key: string;
  label: string;
  description?: string;
}

interface StatusTimelineProps {
  steps: TimelineStep[];
  currentKey: string;
  className?: string;
}

export function StatusTimeline({ steps, currentKey, className }: StatusTimelineProps) {
  const currentIdx = Math.max(0, steps.findIndex((s) => s.key === currentKey));

  return (
    <ol className={cn('space-y-0', className)}>
      {steps.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        const pending = idx > currentIdx;
        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0',
                  done && 'bg-[#299E60] text-white',
                  active && 'bg-[#EEF8F1] text-[#299E60] ring-2 ring-[#299E60]/30',
                  pending && 'bg-[#F5F5F5] text-[#AEAEAE]',
                )}
              >
                {done ? <CheckCircle2 size={13} /> : <Circle size={10} fill="currentColor" />}
              </div>
              {idx < steps.length - 1 && (
                <div className={cn('w-px flex-1 min-h-[20px] my-1', done ? 'bg-[#299E60]' : 'bg-[#EEEEEE]')} />
              )}
            </div>
            <div className={cn('pb-4', idx === steps.length - 1 && 'pb-0')}>
              <p className={cn('text-[12.5px] font-bold', active || done ? 'text-[#181725]' : 'text-[#AEAEAE]')}>
                {step.label}
              </p>
              {step.description && (
                <p className="text-[11px] text-[#7C7C7C] mt-0.5">{step.description}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Customer return timeline — S9 Delivery-tab style (not legacy refund_processing).
 * Keys match {@link toReturnUiStatus} / RETURN_PROGRESS_STAGES.
 */
export const RETURN_TIMELINE_STEPS: TimelineStep[] = [
  { key: 'new', label: 'Submitted', description: 'Your return request was received' },
  { key: 'review', label: 'Under review', description: 'Store is reviewing your request' },
  { key: 'approved', label: 'Approved', description: 'Store approved the return' },
  { key: 'pickup', label: 'Pickup', description: 'Goods pickup scheduled' },
  { key: 'received', label: 'Received', description: 'Store received the goods' },
  { key: 'closed', label: 'Closed', description: 'Return completed with credit note' },
];

/** Skip-pickup path: Approved → Closed (no physical accept). */
export const RETURN_SKIP_TIMELINE_STEPS: TimelineStep[] = [
  { key: 'new', label: 'Submitted', description: 'Your return request was received' },
  { key: 'review', label: 'Under review', description: 'Store is reviewing your request' },
  { key: 'approved', label: 'Approved', description: 'Store approved the return' },
  { key: 'closed', label: 'Closed', description: 'Return completed with credit note' },
];

/** Rejected returns — short path ending at Rejected. */
export const RETURN_REJECTED_TIMELINE_STEPS: TimelineStep[] = [
  { key: 'new', label: 'Submitted', description: 'Your return request was received' },
  { key: 'review', label: 'Under review', description: 'Store reviewed your request' },
  { key: 'rejected', label: 'Rejected', description: 'Store declined this return request' },
];

/** @deprecated Prefer RETURN_TIMELINE_STEPS (S9). Kept for any stale imports. */
export const RETURN_RESOLVED_TIMELINE_STEPS: TimelineStep[] = RETURN_SKIP_TIMELINE_STEPS;

function toCustomerReturnTimelineKey(status: string): string {
  switch (status) {
    case 'pending':
    case 'new':
      return 'new';
    case 'under_review':
      return 'review';
    case 'approved':
    case 'refund_processing':
      return 'approved';
    case 'pickup_scheduled':
      return 'pickup';
    case 'goods_received':
    case 'inspection_completed':
      return 'received';
    case 'closed':
    case 'refunded':
    case 'resolved':
      return 'closed';
    case 'rejected':
      return 'rejected';
    default:
      return 'new';
  }
}

export function returnTimelineCurrentKey(status: string): string {
  return toCustomerReturnTimelineKey(status);
}

/** Pick S9 timeline steps for the return's current status / skip-pickup path. */
export function returnTimelineStepsForStatus(
  status: string,
  opts?: { pickupSkipped?: boolean },
): TimelineStep[] {
  const key = toCustomerReturnTimelineKey(status);
  if (key === 'rejected') return RETURN_REJECTED_TIMELINE_STEPS;
  if (opts?.pickupSkipped) return RETURN_SKIP_TIMELINE_STEPS;
  return RETURN_TIMELINE_STEPS;
}

export const ORDER_STATUS_STEPS: TimelineStep[] = [
  { key: 'pending', label: 'Order placed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'processing', label: 'Processing' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

export function orderTimelineCurrentKey(status: string): string {
  if (status === 'returned') return 'delivered';
  if (status === 'shipped' || status === 'out_for_delivery') return 'out_for_delivery';
  if (['pending', 'confirmed', 'processing', 'delivered', 'cancelled'].includes(status)) {
    return status === 'cancelled' ? 'pending' : status;
  }
  return 'pending';
}
