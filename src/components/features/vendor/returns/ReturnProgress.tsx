'use client';

import { cn } from '@/lib/utils';
import {
  RETURN_PROGRESS_STAGES,
  type ReturnStatus,
} from '@/modules/return/return.types';
import { RETURN_PROGRESS_LABELS, progressStageIndex } from './returnConstants';

interface Props {
  status: ReturnStatus;
  className?: string;
}

export function ReturnProgress({ status, className }: Props) {
  const currentIdx = progressStageIndex(status);
  const rejected = status === 'rejected';

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {RETURN_PROGRESS_STAGES.map((stage, idx) => {
          const done = idx < currentIdx || (idx === currentIdx && status === 'closed');
          const active = idx === currentIdx && status !== 'closed';
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
              {idx < RETURN_PROGRESS_STAGES.length - 1 && (
                <div
                  className={cn('h-px w-1 shrink-0', done ? 'bg-[#B45309]/40' : 'bg-transparent')}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {RETURN_PROGRESS_STAGES.map((stage, idx) => {
          const done = idx < currentIdx || (idx === currentIdx && status === 'closed');
          const active = idx === currentIdx && status !== 'closed';
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
    </div>
  );
}
