'use client';

import React from 'react';
import { Crosshair, ChevronDown, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStableSession } from '@/hooks/useStableSession';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';

interface OutletContextStripProps {
  onGuestLocationClick?: () => void;
  onLoggedInSwitchClick?: () => void;
  className?: string;
}

export function OutletContextStrip({
  onGuestLocationClick,
  onLoggedInSwitchClick,
  className,
}: OutletContextStripProps) {
  const { isAuthenticated } = useStableSession();
  const { currentAccount, currentOutlet, loading } = useBusinessAccountSwitcher();

  const accountLabel = currentAccount?.displayName ?? currentAccount?.legalName ?? 'Your business';

  const loggedInLabel = currentOutlet?.name
    ? `${accountLabel} — ${currentOutlet.name}`
    : accountLabel;

  if (loading && isAuthenticated) {
    return (
      <div className={cn('w-full bg-white px-3.5 py-1.5 border-b border-divider/60', className)}>
        <div className="h-9 w-full bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className={cn('w-full bg-white px-3.5 py-1.5 border-b border-divider/60', className)}>
        <button
          type="button"
          onClick={onLoggedInSwitchClick}
          className="w-full bg-white hover:bg-gray-50/80 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2 text-left transition-colors shadow-2xs group"
        >
          <Store size={15} className="text-primary shrink-0" />
          <span className="text-[13px] text-text-secondary flex-1 min-w-0 truncate">
            Ordering for: <strong className="font-semibold text-text">{loggedInLabel}</strong>
          </span>
          <ChevronDown size={15} className="text-text-muted shrink-0" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn('w-full bg-white px-3.5 py-1.5 border-b border-divider/60', className)}>
      <button
        type="button"
        onClick={onGuestLocationClick}
        className="w-full bg-white hover:bg-gray-50/80 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2 text-left transition-colors shadow-2xs group"
      >
        <Crosshair size={15} className="text-primary shrink-0 transition-transform group-hover:rotate-45" />
        <span className="text-[13px] text-text-secondary flex-1 min-w-0 truncate">
          Deliver to: <strong className="font-semibold text-text">Select your location</strong>
        </span>
        <ChevronDown size={15} className="text-text-muted shrink-0" />
      </button>
    </div>
  );
}
