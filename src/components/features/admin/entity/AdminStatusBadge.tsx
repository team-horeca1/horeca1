'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type AdminStatusVariant = 'verified' | 'pending' | 'active' | 'inactive' | 'rejected';

const STYLES: Record<AdminStatusVariant, string> = {
  verified: 'bg-success-light border-success/15 text-success',
  pending: 'bg-[#FEF3C7] border-warning/20 text-[#B45309]',
  active: 'bg-success-light border-success/15 text-success',
  inactive: 'bg-[#FEE2E2] border-error/15 text-error',
  rejected: 'bg-[#FEE2E2] border-error/15 text-error',
};

const LABELS: Record<AdminStatusVariant, string> = {
  verified: 'Verified',
  pending: 'Pending',
  active: 'Active',
  inactive: 'Inactive',
  rejected: 'Rejected',
};

interface AdminStatusBadgeProps {
  variant: AdminStatusVariant;
  label?: string;
  className?: string;
}

export function AdminStatusBadge({ variant, label, className }: AdminStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide',
        STYLES[variant],
        className,
      )}
    >
      {label ?? LABELS[variant]}
    </span>
  );
}
