'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Check, AlertCircle, Clock, Ban } from 'lucide-react';

export function inr(value: string | number | null | undefined | { toString(): string }): string {
  const raw = value == null ? 0 : typeof value === 'object' ? value.toString() : value;
  const n = Number(raw);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export function money(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B1D2E] focus-visible:ring-offset-2 transition-shadow duration-150';

export type PillTone = 'ready' | 'paid' | 'warn' | 'muted' | 'danger' | 'info';

const PILL_CONFIG: Record<
  PillTone,
  { bg: string; text: string; border: string; dot: string }
> = {
  ready: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200/80',
    dot: 'bg-emerald-500',
  },
  paid: {
    bg: 'bg-emerald-50/80',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    dot: 'bg-emerald-600',
  },
  warn: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  muted: {
    bg: 'bg-zinc-100',
    text: 'text-zinc-600',
    border: 'border-zinc-200',
    dot: 'bg-zinc-400',
  },
  danger: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
  },
  info: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
};

export function StatusPill({
  children,
  tone,
  className,
  showDot = true,
}: {
  children: React.ReactNode;
  tone: PillTone;
  className?: string;
  showDot?: boolean;
}) {
  const config = PILL_CONFIG[tone] ?? PILL_CONFIG.muted;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide leading-4',
        config.bg,
        config.text,
        config.border,
        className,
      )}
    >
      {showDot && (
        <span
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', config.dot)}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

export function SupplierMark({
  name,
  logoUrl,
  size = 'md',
  className,
}: {
  name: string;
  logoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const letters =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'S';

  const sizeClass =
    size === 'sm'
      ? 'h-8 w-8 text-[11px]'
      : size === 'lg'
      ? 'h-14 w-14 text-[16px] rounded-2xl'
      : 'h-10 w-10 text-[12px]';

  if (logoUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        onError={() => setBroken(true)}
        className={cn(
          'shrink-0 rounded-xl border border-[#E9E3DD] object-cover bg-white shadow-xs',
          sizeClass,
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl border border-[#F3D7DE] bg-gradient-to-br from-[#FAF0F3] to-[#F5E2E7] font-bold text-[#6B1D2E] shadow-xs select-none',
        sizeClass,
        className,
      )}
    >
      {letters}
    </span>
  );
}

export type KpiIconTone = 'burgundy' | 'blue' | 'emerald' | 'purple' | 'amber';

const ICON_TONE_STYLES: Record<KpiIconTone, { bg: string; text: string; border: string }> = {
  burgundy: {
    bg: 'bg-[#F8E8EC]',
    text: 'text-[#6B1D2E]',
    border: 'border-[#F3D7DE]',
  },
  blue: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    border: 'border-blue-100',
  },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    border: 'border-emerald-100',
  },
  purple: {
    bg: 'bg-purple-50',
    text: 'text-purple-600',
    border: 'border-purple-100',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    border: 'border-amber-100',
  },
};

export function FinanceKpiCard({
  title,
  value,
  subtext,
  icon,
  variant = 'default',
  iconTone = 'blue',
  className,
}: {
  title: string;
  value: string;
  subtext?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'hero';
  iconTone?: KpiIconTone;
  className?: string;
}) {
  if (variant === 'hero') {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#6B1D2E] via-[#5C1827] to-[#48121E] p-5 text-white shadow-md border border-[#83263A]/40 transition-all duration-200 hover:shadow-lg',
          className,
        )}
      >
        <div className="absolute -right-6 -bottom-6 h-28 w-28 rounded-full bg-white/5 blur-xl pointer-events-none" />
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] font-semibold tracking-wider uppercase text-rose-200/90">
            {title}
          </p>
          {icon && (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur-xs shadow-xs">
              {icon}
            </div>
          )}
        </div>
        <p className="mt-3 text-[clamp(1.75rem,2.2vw,2.35rem)] font-bold tracking-tight tabular-nums text-white">
          {value}
        </p>
        {subtext && (
          <p className="mt-2 text-[12px] font-medium leading-relaxed text-rose-100/80">
            {subtext}
          </p>
        )}
      </div>
    );
  }

  const toneStyle = ICON_TONE_STYLES[iconTone] ?? ICON_TONE_STYLES.blue;

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-[#E9E3DD] bg-white p-5 shadow-xs transition-all duration-200 hover:border-[#CDC4BA] hover:shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-[#667085]">
          {title}
        </p>
        {icon && (
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl border shadow-xs transition-transform duration-200 group-hover:scale-105',
              toneStyle.bg,
              toneStyle.text,
              toneStyle.border,
            )}
          >
            {icon}
          </div>
        )}
      </div>
      <p className="mt-3 text-[clamp(1.45rem,1.8vw,1.95rem)] font-bold tracking-tight tabular-nums text-[#1C1C1C]">
        {value}
      </p>
      {subtext && (
        <p className="mt-2 text-[12px] font-normal leading-relaxed text-[#667085]">
          {subtext}
        </p>
      )}
    </div>
  );
}
