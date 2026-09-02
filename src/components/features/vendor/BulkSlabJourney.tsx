'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { BulkPriceTier } from '@/types';

export function BulkSlabJourney({
  tiers,
  currentQty,
  unitLabel = 'Pc',
  className,
}: {
  tiers: BulkPriceTier[];
  currentQty: number;
  unitLabel?: string;
  className?: string;
}) {
  if (tiers.length === 0) return null;

  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  const displayTiers = sorted.slice(0, 2);
  const bestTier = sorted[sorted.length - 1];
  const onBest = currentQty >= bestTier.minQty;

  const nextTier = sorted.find((t) => currentQty < t.minQty);
  const remaining = nextTier ? nextTier.minQty - currentQty : 0;

  return (
    <div
      className={cn(
        'rounded-lg border px-2.5 py-2 text-[11px]',
        onBest ? 'bg-amber-50 border-amber-200' : 'bg-primary-light/80 border-primary/15',
        className,
      )}
    >
      <p className="font-bold text-text uppercase tracking-wide text-[10px] mb-1.5">
        {onBest ? 'Best price unlocked!' : 'Buy more · Save more'}
      </p>
      {!onBest && (
        <div className="space-y-1 mb-1.5">
          {displayTiers.map((t) => (
            <div key={t.minQty} className="flex justify-between text-text-secondary">
              <span>{t.minQty}+ Qty</span>
              <span className="font-semibold text-primary tabular-nums">₹{t.price.toFixed(2)} /{unitLabel}</span>
            </div>
          ))}
        </div>
      )}
      {onBest ? (
        <p className="font-semibold text-success tabular-nums">
          ₹{bestTier.price.toFixed(2)} /{unitLabel} — You&apos;re at maximum savings
        </p>
      ) : nextTier ? (
        <p className="text-text-secondary">
          Add <strong className="text-text">{remaining}</strong> more to get{' '}
          <strong className="text-primary tabular-nums">₹{nextTier.price.toFixed(2)}</strong> /{unitLabel}
        </p>
      ) : null}
    </div>
  );
}
