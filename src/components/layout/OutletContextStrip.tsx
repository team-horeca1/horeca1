'use client';

import React from 'react';
import { MapPin, ChevronDown, Store } from 'lucide-react';
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
      <div className={cn('bg-[#1C1C1C] px-4 py-2.5', className)}>
        <div className="h-4 w-48 bg-white/10 rounded animate-pulse" />
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <button
        type="button"
        onClick={onLoggedInSwitchClick}
        className={cn(
          'w-full bg-[#1C1C1C] px-4 py-2.5 flex items-center gap-2 text-left',
          'hover:bg-[#2a2a2a] transition-colors',
          className,
        )}
      >
        <Store size={16} className="text-white/80 shrink-0" />
        <span className="text-[13px] text-white flex-1 min-w-0 truncate">
          Ordering for: <strong className="font-semibold">{loggedInLabel}</strong>
        </span>
        <ChevronDown size={16} className="text-white/60 shrink-0" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onGuestLocationClick}
      className={cn(
        'w-full bg-[#1C1C1C] px-4 py-2.5 flex items-center gap-2 text-left',
        'hover:bg-[#2a2a2a] transition-colors',
        className,
      )}
    >
      <MapPin size={16} className="text-white/80 shrink-0" />
      <span className="text-[13px] text-white flex-1 min-w-0 truncate">
        Deliver to: <strong className="font-semibold">Select your location</strong>
      </span>
      <ChevronDown size={16} className="text-white/60 shrink-0" />
    </button>
  );
}
