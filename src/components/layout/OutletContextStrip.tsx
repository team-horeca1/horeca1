'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useStableSession } from '@/hooks/useStableSession';
import { NavContextSelector } from './NavContextSelector';

interface OutletContextStripProps {
  onGuestLocationClick?: () => void;
  onLoggedInSwitchClick?: () => void;
  fallbackLabel?: string;
  className?: string;
}

export function OutletContextStrip({
  onGuestLocationClick,
  onLoggedInSwitchClick,
  fallbackLabel = 'Select Location',
  className,
}: OutletContextStripProps) {
  const { isAuthenticated } = useStableSession();

  return (
    <div className={cn('w-full bg-white px-3.5 py-1.5 border-b border-divider/60', className)}>
      <NavContextSelector
        variant="mobile"
        fallbackLabel={fallbackLabel}
        onFallbackClick={() => {
          if (isAuthenticated) onLoggedInSwitchClick?.();
          else onGuestLocationClick?.();
        }}
      />
    </div>
  );
}
