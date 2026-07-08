'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type AdminStatusVariant = 'verified' | 'pending' | 'active' | 'inactive' | 'rejected';

const STYLES: Record<AdminStatusVariant, string> = {
  verified: 'bg-[#EEF8F1] border-[#299E60]/10 text-[#299E60]',
  pending: 'bg-[#FFF8EB] border-[#D97706]/10 text-[#D97706]',
  active: 'bg-[#EEF8F1] border-[#299E60]/10 text-[#299E60]',
  inactive: 'bg-[#FDF2F2] border-[#EF4444]/10 text-[#EF4444]',
  rejected: 'bg-[#FDF2F2] border-[#EF4444]/10 text-[#EF4444]',
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
