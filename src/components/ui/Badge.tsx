import React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = {
  bestseller: 'bg-primary text-white',
  premium: 'bg-[#6B3FA0] text-white',
  verified: 'bg-success text-white',
  offer: 'bg-[#F6A800] text-[#1C1C1C]',
  save: 'bg-success text-white',
  new: 'bg-[#2563EB] text-white',
  limited: 'bg-error text-white',
  bulk: 'bg-teal-600 text-white',
  neutral: 'bg-text-muted text-white',
} as const;

export type BadgeVariant = keyof typeof badgeVariants;

export function Badge({
  variant = 'bestseller',
  children,
  className,
  icon,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-6 px-3 rounded-full',
        'text-[11px] font-semibold tracking-wide',
        badgeVariants[variant],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
