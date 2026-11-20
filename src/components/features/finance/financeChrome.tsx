'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export function inr(value: string | number | null | undefined | { toString(): string }): string {
  const raw = value == null ? 0 : typeof value === 'object' ? value.toString() : value;
  const n = Number(raw);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}

export function money(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6B1D2E]';

export type PillTone = 'ready' | 'paid' | 'warn' | 'muted';

const PILL: Record<PillTone, string> = {
  ready: 'bg-[#F8E8EC] text-[#6B1D2E]',
  paid: 'bg-[#F0FDF4] text-[#166534]',
  warn: 'bg-[#FFF7ED] text-[#9A3412]',
  muted: 'bg-[#F4F1EC] text-[#667085]',
};

export function StatusPill({ children, tone }: { children: React.ReactNode; tone: PillTone }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4', PILL[tone])}>
      {children}
    </span>
  );
}

export function SupplierMark({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const [broken, setBroken] = useState(false);
  const letters = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'S';
  if (logoUrl && !broken) {
    return (
      // Vendor logos are remote URLs and are not in the Next image allow-list.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" onError={() => setBroken(true)} className="h-9 w-9 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F8E8EC] text-[12px] font-semibold text-[#6B1D2E]">
      {letters}
    </span>
  );
}
