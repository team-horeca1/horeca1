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

export function returnTimelineCurrentKey(status: string): string {
  if (status === 'refunded') return 'refunded';
  if (status === 'resolved') return 'resolved';
  if (status === 'refund_processing') return 'refund_processing';
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'submitted';
}

/** Default refund path (pending → approved → processing → refunded). */
export const RETURN_TIMELINE_STEPS: TimelineStep[] = [
  { key: 'submitted', label: 'Submitted', description: 'Your return request was received' },
  { key: 'approved', label: 'Vendor review', description: 'Vendor approves or rejects' },
  { key: 'refund_processing', label: 'Refund processing', description: 'Platform processes your refund' },
  { key: 'refunded', label: 'Refund complete', description: 'Money returned to you' },
];

/** Rejected returns — short path ending at Rejected. */
export const RETURN_REJECTED_TIMELINE_STEPS: TimelineStep[] = [
  { key: 'submitted', label: 'Submitted', description: 'Your return request was received' },
  { key: 'rejected', label: 'Rejected', description: 'Vendor declined this return request' },
];

/** Credit note / replacement — closed without a money refund. */
export const RETURN_RESOLVED_TIMELINE_STEPS: TimelineStep[] = [
  { key: 'submitted', label: 'Submitted', description: 'Your return request was received' },
  { key: 'approved', label: 'Vendor review', description: 'Vendor approved the request' },
  { key: 'resolved', label: 'Resolved', description: 'Closed with credit note or replacement' },
];

/** Pick the timeline steps that match the return's current status. */
export function returnTimelineStepsForStatus(status: string): TimelineStep[] {
  if (status === 'rejected') return RETURN_REJECTED_TIMELINE_STEPS;
  if (status === 'resolved') return RETURN_RESOLVED_TIMELINE_STEPS;
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
