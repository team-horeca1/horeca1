'use client';

import { AlertTriangle, CreditCard, IndianRupee, ShieldOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inr } from './adminCreditTypes';

interface AdminCreditKpiStripProps {
  lines: number;
  exposure: number;
  outstanding: number;
  overdue: number;
}

export function AdminCreditKpiStrip({ lines, exposure, outstanding, overdue }: AdminCreditKpiStripProps) {
  const cards = [
    { label: 'Credit lines', value: String(lines), Icon: CreditCard, tint: 'text-[#299E60] bg-[#EEF8F1]' },
    { label: 'Total limit', value: inr(exposure), Icon: IndianRupee, tint: 'text-blue-600 bg-blue-50' },
    { label: 'Outstanding', value: inr(outstanding), Icon: AlertTriangle, tint: 'text-amber-600 bg-amber-50' },
    { label: 'Overdue', value: String(overdue), Icon: ShieldOff, tint: 'text-red-500 bg-red-50' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(({ label, value, Icon, tint }) => (
        <div key={label} className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-4 flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0', tint)}>
            <Icon size={16} strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-[#181725] truncate">{value}</p>
            <p className="text-[11px] text-[#AEAEAE]">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
