'use client';

import React from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminImpersonate, type ImpersonateTarget } from '@/hooks/useAdminImpersonate';

interface AdminImpersonateButtonProps {
  target: ImpersonateTarget;
  entityId: string;
  label: string;
  redirectTo?: string;
  variant?: 'primary' | 'outline';
  className?: string;
  icon?: React.ReactNode;
}

export function AdminImpersonateButton({
  target,
  entityId,
  label,
  redirectTo,
  variant = 'outline',
  className,
  icon,
}: AdminImpersonateButtonProps) {
  const { start, loading } = useAdminImpersonate(target);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => void start(entityId, redirectTo)}
      className={cn(
        'h-[38px] px-4 rounded-[10px] text-[12px] font-bold active:scale-97 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-60',
        variant === 'primary'
          ? 'bg-[#299E60] border border-[#299E60] text-white hover:bg-[#238a54]'
          : 'bg-[#EEF8F1] border border-[#299E60]/20 text-[#299E60] hover:bg-[#D1FAE5]',
        className,
      )}
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        icon ?? <Globe size={14} />
      )}
      {label}
    </button>
  );
}
