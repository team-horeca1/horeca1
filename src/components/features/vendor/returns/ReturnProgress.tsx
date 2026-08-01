'use client';

import { cn } from '@/lib/utils';
import {
  RETURN_PROGRESS_STAGES,
  RETURN_SKIP_PROGRESS_STAGES,
  toReturnUiStatus,
  type ReturnStatus,
} from '@/modules/return/return.types';
import { RETURN_PROGRESS_LABELS, progressStageIndex } from './returnConstants';

interface Props {
  status: ReturnStatus;
  pickupSkipped?: boolean;
  className?: string;
}

export function ReturnProgress({ status, pickupSkipped = false, className }: Props) {
  const ui = toReturnUiStatus(status);
  const stages = pickupSkipped ? RETURN_SKIP_PROGRESS_STAGES : RETURN_PROGRESS_STAGES;
  const currentIdx = progressStageIndex(status, { pickupSkipped });
  const rejected = ui === 'rejected';

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {stages.map((stage, idx) => {
          const done = idx < currentIdx || (idx === currentIdx && ui === 'closed');
          const active = idx === currentIdx && ui !== 'closed';
          return (
            <div key={stage} className="flex items-center gap-1 min-w-0">
              <div
                className={cn(
                  'h-1.5 w-[clamp(1.5rem,4vw,2.25rem)] rounded-full shrink-0',
                  done && 'bg-[#B45309]',
                  active && !rejected && 'bg-[#B45309]/60',
                  active && rejected && 'bg-rose-500',
                  !done && !active && 'bg-[#E5E7EB]',
                )}
                title={RETURN_PROGRESS_LABELS[stage]}
              />
              {idx < stages.length - 1 && (
                <div
                  className={cn('h-px w-1 shrink-0', done ? 'bg-[#B45309]/40' : 'bg-transparent')}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {stages.map((stage, idx) => {
          const done = idx < currentIdx || (idx === currentIdx && ui === 'closed');
          const active = idx === currentIdx && ui !== 'closed';
          return (
            <span
              key={stage}
              className={cn(
                'text-[10px] font-bold uppercase tracking-wide',
                done || active ? 'text-[#B45309]' : 'text-[#AEAEAE]',
                active && rejected && 'text-rose-600',
              )}
            >
              {RETURN_PROGRESS_LABELS[stage]}
            </span>
          );
        })}
      </div>
      {rejected && (
        <p className="text-[11px] font-semibold text-rose-600">
          Return rejected — close when ready to archive
        </p>
      )}
      {pickupSkipped && ui !== 'closed' && ui !== 'rejected' && (
        <p className="text-[11px] font-semibold text-amber-800">
          Pickup skipped — credit note closes without goods received
        </p>
      )}
    </div>
  );
}
