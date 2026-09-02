'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface FinanceSummaryMetric {
  label: string;
  value: string;
  accent?: 'green' | 'amber' | 'muted';
  footnote?: string;
}

interface FinanceSummaryStripProps {
  metrics: FinanceSummaryMetric[];
  className?: string;
}

export function FinanceSummaryStrip({ metrics, className }: FinanceSummaryStripProps) {
  return (
    <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-[clamp(0.75rem,2vw,1rem)]', className)}>
      {metrics.map((m) => (
        <div
          key={m.label}
          className="bg-white rounded-[14px] border border-[#EEEEEE] p-[clamp(0.75rem,2vw,1rem)]"
        >
          <p className="text-[clamp(10px,1.5vw,11px)] text-[#AEAEAE] font-semibold uppercase tracking-wide">
            {m.label}
          </p>
          <p
            className={cn(
              'text-[clamp(1rem,2vw+0.5rem,1.375rem)] font-bold mt-1',
              m.accent === 'green' && 'text-success',
              m.accent === 'amber' && 'text-amber-600',
              (!m.accent || m.accent === 'muted') && 'text-[#181725]',
            )}
          >
            {m.value}
          </p>
          {m.footnote && (
            <p className="text-[10px] text-[#AEAEAE] mt-1 leading-snug">{m.footnote}</p>
          )}
        </div>
      ))}
    </div>
  );
}
