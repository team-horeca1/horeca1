'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { RotateCcw, ListOrdered, Store, BadgePercent, Zap } from 'lucide-react';
import { useStableSession } from '@/hooks/useStableSession';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/ui/SectionHeader';

const ACTIONS = [
  { href: '/orders', icon: RotateCcw, label: 'Reorder', desc: 'From last order' },
  { href: '/order-lists', icon: ListOrdered, label: 'Quick Order', desc: 'Order lists' },
  { href: '/vendors', icon: Store, label: 'My Vendors', desc: 'Saved vendors' },
  { href: '/deals', icon: BadgePercent, label: 'Deals', desc: 'Coupons & offers' },
] as const;

/** Guest quick actions — always visible on homepage */
const GUEST_ACTIONS = [
  { href: '/order-lists', icon: Zap, label: 'Quick Order', desc: 'Paste or upload' },
  { href: '/category', icon: ListOrdered, label: 'Categories', desc: 'Browse catalog' },
  { href: '/wallet', icon: BadgePercent, label: 'DiSCCO Credit', desc: 'Buy now, pay later' },
  { href: '/deals', icon: Store, label: 'Deals', desc: 'Bulk savings' },
] as const;

export function QuickActions() {
  const { isAuthenticated } = useStableSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  if (!mounted) return null;

  const actions = isAuthenticated ? ACTIONS : GUEST_ACTIONS;

  return (
    <section className="w-full py-4 bg-background">
      <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
        {isAuthenticated && (
          <SectionHeader title="Quick actions" className="mb-2" />
        )}
        <div className="grid grid-cols-4 gap-2 md:gap-3">
          {actions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={cn(
                'flex flex-col items-center text-center gap-1.5 p-2.5 md:p-3',
                'bg-white border border-divider rounded-xl min-h-[76px]',
                'shadow-cdl-1 hover:shadow-cdl-2 hover:border-primary/20',
                'active:scale-[0.97] transition-all duration-150',
              )}
            >
              <div className="size-9 rounded-full bg-primary-light flex items-center justify-center text-primary">
                <action.icon size={18} strokeWidth={2} />
              </div>
              <b className="text-[10px] md:text-[11px] font-semibold text-text leading-tight">{action.label}</b>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
