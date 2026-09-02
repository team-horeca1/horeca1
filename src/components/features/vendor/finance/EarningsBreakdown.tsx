'use client';

import React from 'react';
import { cn } from '@/lib/utils';

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export interface EarningsBreakdownProps {
  gross: number;
  platformFee: number;
  platformFeePct: number;
  gatewayFee?: number;
  net: number;
  isCustomRate?: boolean;
  className?: string;
  compact?: boolean;
}

export function EarningsBreakdown({
  gross,
  platformFee,
  platformFeePct,
  gatewayFee = 0,
  net,
  isCustomRate = false,
  className,
  compact = false,
}: EarningsBreakdownProps) {
  const rows = [
    { label: 'Gross sale', value: gross, sign: '' as const },
    { label: `Platform fee (${platformFeePct}%${isCustomRate ? ' — your rate' : ''})`, value: platformFee, sign: '−' as const },
    ...(gatewayFee > 0
      ? [{ label: 'Payment gateway (2%)', value: gatewayFee, sign: '−' as const }]
      : []),
  ];

  if (compact) {
    return (
      <div className={cn('text-[11px] text-[#7C7C7C] space-y-0.5', className)}>
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-2">
            <span>{r.label}</span>
            <span className="font-semibold text-[#181725]">{r.sign}{inr(r.value)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-2 pt-1 border-t border-[#EEEEEE] font-bold text-primary">
          <span>You receive</span>
          <span>{inr(net)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-[14px] border border-[#EEEEEE] bg-white p-[clamp(1rem,2vw,1.25rem)]', className)}>
      <p className="text-[13px] font-bold text-[#181725] mb-3">How your earnings are calculated</p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-[13px]">
            <span className="text-[#7C7C7C]">{r.label}</span>
            <span className="font-semibold text-[#181725]">{r.sign}{inr(r.value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-[#EEEEEE] flex items-center justify-between">
        <span className="text-[14px] font-bold text-[#181725]">You receive</span>
        <span className="text-[18px] font-bold text-primary">{inr(net)}</span>
      </div>
      <p className="text-[11px] text-[#AEAEAE] mt-2">
        Platform fee is set by HoReCa1. {isCustomRate ? 'Your store has a custom rate.' : 'Using the global default rate.'}
      </p>
    </div>
  );
}

export function PlatformFeeCalculator({ pct }: { pct: number }) {
  const gross = 100000;
  const fee = Math.round(gross * (pct / 100));
  const net = gross - fee;
  return (
    <div className="rounded-[12px] bg-[#F8FAFC] border border-[#E2E8F0] p-4 mt-3">
      <p className="text-[12px] font-bold text-[#475569] mb-2">Example calculation</p>
      <p className="text-[13px] text-[#334155] leading-relaxed">
        If a vendor sells <strong>{inr(gross)}</strong> at <strong>{pct}%</strong> platform fee,
        the vendor wallet is credited <strong className="text-primary">{inr(net)}</strong>
        (online orders also deduct 2% gateway fee).
      </p>
    </div>
  );
}
