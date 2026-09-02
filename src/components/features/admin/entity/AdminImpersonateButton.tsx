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
  /** Override POST body key (vendor default is supplierUserId). */
  bodyKey?: string;
  variant?: 'primary' | 'outline';
  className?: string;
  icon?: React.ReactNode;
}

export function AdminImpersonateButton({
  target,
  entityId,
  label,
  redirectTo,
  bodyKey,
  variant = 'outline',
  className,
  icon,
}: AdminImpersonateButtonProps) {
  const { start, loading } = useAdminImpersonate(target);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => void start(entityId, redirectTo, bodyKey ? { bodyKey } : undefined)}
      className={cn(
        'h-[38px] px-4 rounded-[10px] text-[12px] font-bold active:scale-97 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-60',
        variant === 'primary'
          ? 'bg-primary border border-primary text-white hover:bg-primary-dark shadow-sm shadow-primary/20'
          : 'bg-primary-light border border-primary/20 text-primary hover:bg-primary hover:text-white',
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
