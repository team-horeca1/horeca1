'use client';

import { ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ORDER_STATUS_OPTIONS,
  ORDER_STATUS_STYLE,
  orderStatusLabel,
} from '@/components/features/orders/orderStatus';

type Props = {
  status: string;
  abandoned?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onChange: (next: string) => void;
  title?: string;
  className?: string;
};

export function OrderStatusSelect({
  status,
  abandoned = false,
  busy = false,
  disabled = false,
  onChange,
  title,
  className,
}: Props) {
  const value = abandoned ? 'abandoned' : status;
  const styleKey = abandoned ? 'abandoned' : status;

  return (
    <div className={cn('flex justify-center items-center', className)}>
      <div className="relative inline-block">
        <select
          value={value}
          disabled={disabled || busy || abandoned}
          title={title}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'cursor-pointer rounded-[8px] text-[11px] font-black uppercase tracking-wider pl-3.5 pr-8 py-2 outline-none border border-transparent appearance-none disabled:opacity-50 transition-all shadow-sm',
            ORDER_STATUS_STYLE[styleKey] || 'bg-gray-100 text-gray-700 border-gray-200',
          )}
        >
          {abandoned && <option value="abandoned">Abandoned</option>}
          {!ORDER_STATUS_OPTIONS.includes(status as (typeof ORDER_STATUS_OPTIONS)[number]) && (
            <option value={status} disabled className="bg-white text-gray-800 capitalize">
              {orderStatusLabel(status)}
            </option>
          )}
          {ORDER_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s} className="bg-white text-gray-800 capitalize">
              {orderStatusLabel(s)}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60"
        />
      </div>
      {busy && <Loader2 size={13} className="animate-spin text-primary ml-1.5 shrink-0" />}
    </div>
  );
}

export function OrderStatusBadge({
  status,
  abandoned = false,
  isPartial = false,
  className,
}: {
  status: string;
  abandoned?: boolean;
  isPartial?: boolean;
  className?: string;
}) {
  const label = abandoned
    ? 'Abandoned'
    : isPartial && status !== 'cancelled'
      ? 'Partially Accepted'
      : orderStatusLabel(status);

  return (
    <span
      className={cn(
        'text-[10px] font-bold px-2 py-0.5 rounded-[6px] uppercase',
        abandoned
          ? ORDER_STATUS_STYLE.abandoned
          : ORDER_STATUS_STYLE[status] || 'bg-gray-100 text-gray-700',
        className,
      )}
    >
      {label}
    </span>
  );
}
