'use client';

import { cn } from '@/lib/utils';
import {
  DELIVERY_PROGRESS_STAGES,
  toDeliveryUiStatus,
} from '@/modules/fulfillment/delivery.scope';
import {
  FULFILMENT_PROGRESS_LABELS,
  progressStageIndex,
} from './fulfillmentConstants';

interface Props {
  status: string;
  className?: string;
}

export function FulfilmentProgress({ status, className }: Props) {
  const uiStatus = toDeliveryUiStatus(status);
  const currentIdx = progressStageIndex(status);
  const failed = uiStatus === 'delivery_attempt_failed';

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {DELIVERY_PROGRESS_STAGES.map((stage, idx) => {
          const done = idx < currentIdx || (idx === currentIdx && uiStatus === 'delivered');
          const active = idx === currentIdx && uiStatus !== 'delivered';
          return (
            <div key={stage} className="flex items-center gap-1 min-w-0">
              <div
                className={cn(
                  'h-1.5 w-[clamp(1.5rem,4vw,2.25rem)] rounded-full shrink-0',
                  done && 'bg-[#0F766E]',
                  active && !failed && 'bg-[#0F766E]/60',
                  active && failed && 'bg-rose-500',
                  !done && !active && 'bg-[#E5E7EB]',
                )}
                title={FULFILMENT_PROGRESS_LABELS[stage]}
              />
              {idx < DELIVERY_PROGRESS_STAGES.length - 1 && (
                <div className={cn('h-px w-1 shrink-0', done ? 'bg-[#0F766E]/40' : 'bg-transparent')} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {DELIVERY_PROGRESS_STAGES.map((stage, idx) => {
          const done = idx < currentIdx || (idx === currentIdx && uiStatus === 'delivered');
          const active = idx === currentIdx && uiStatus !== 'delivered';
          return (
            <span
              key={stage}
              className={cn(
                'text-[10px] font-bold uppercase tracking-wide',
                done || active ? 'text-[#0F766E]' : 'text-[#AEAEAE]',
                active && failed && 'text-rose-600',
              )}
            >
              {FULFILMENT_PROGRESS_LABELS[stage]}
            </span>
          );
        })}
      </div>
      {failed && (
        <p className="text-[11px] font-semibold text-rose-600">
          Delivery attempt failed — reschedule to redispatch
        </p>
      )}
    </div>
  );
}
