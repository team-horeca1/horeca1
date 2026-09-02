import React from 'react';
import { cn } from '@/lib/utils';

const chipBorder = {
  veg: 'border-success text-success',
  nonveg: 'border-[#E4573D] text-[#E4573D]',
  frozen: 'border-[#2A6FD8] text-[#2A6FD8]',
  dairy: 'border-[#2A6FD8] text-[#2A6FD8]',
  organic: 'border-success text-success',
  neutral: 'border-text-muted text-text-secondary',
} as const;

export type ChipVariant = keyof typeof chipBorder;

export function Chip({
  variant = 'neutral',
  children,
  className,
  icon,
}: {
  variant?: ChipVariant;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full',
        'text-[11px] font-medium bg-white border',
        chipBorder[variant],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
