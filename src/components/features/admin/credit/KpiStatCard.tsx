'use client';

import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';

export function KpiStatCard({
  label,
  value,
  Icon,
  tint,
}: {
  label: string;
  value: string | number;
  Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  tint: string;
}) {
  return (
    <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-4 flex items-center gap-3">
      <div className={cn('w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0', tint)}>
        <Icon size={16} strokeWidth={1.5} />
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-[#181725] truncate">{value}</p>
        <p className="text-[11px] text-[#AEAEAE]">{label}</p>
      </div>
    </div>
  );
}
