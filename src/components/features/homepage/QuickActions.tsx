'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { RotateCcw, ListOrdered, Store, BadgePercent, Zap, ChevronRight } from 'lucide-react';
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
    <section className="w-full py-4 md:py-6 bg-background">
      <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
        <SectionHeader
          title="Quick actions"
          subtitle="Essential shortcuts to streamline your operations"
          className="mb-3 md:mb-4"
        />
        <div className="grid grid-cols-4 gap-2 md:gap-3.5 lg:gap-4">
          {actions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={cn(
                'group relative flex flex-col md:flex-row items-center md:items-center text-center md:text-left',
                'p-2.5 sm:p-3 md:p-4 lg:p-5 gap-2 md:gap-3.5 lg:gap-4',
                'bg-white border border-divider rounded-xl md:rounded-2xl',
                'min-h-[76px] md:min-h-[96px] lg:min-h-[104px]',
                'shadow-cdl-1 hover:shadow-cdl-2 hover:border-primary/30',
                'transition-all duration-200 md:hover:-translate-y-0.5 active:scale-[0.98]',
                'overflow-hidden'
              )}
            >
              {/* Subtle hover gradient wash on desktop */}
              <div
                className="absolute inset-0 bg-gradient-to-r from-primary/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                aria-hidden
              />

              {/* Icon Container */}
              <div className="size-9 sm:size-10 md:size-12 lg:size-14 rounded-full md:rounded-2xl bg-primary-light flex items-center justify-center text-primary shrink-0 group-hover:bg-primary group-hover:text-white transition-all duration-200 shadow-sm">
                <action.icon className="size-[18px] sm:size-5 md:size-6" strokeWidth={2.2} />
              </div>

              {/* Text Container */}
              <div className="flex-1 min-w-0 w-full md:w-auto">
                <b className="block text-[10px] sm:text-[11px] md:text-[15px] lg:text-[16px] font-bold text-text leading-tight group-hover:text-primary transition-colors line-clamp-1">
                  {action.label}
                </b>
                <p className="hidden md:block text-[11px] lg:text-[12.5px] text-text-muted mt-1 font-normal line-clamp-1 leading-snug">
                  {action.desc}
                </p>
              </div>

              {/* Right Chevron on Desktop */}
              <div className="hidden lg:flex size-8 rounded-full bg-primary-light/60 text-primary items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white group-hover:translate-x-0.5 transition-all duration-150">
                <ChevronRight size={15} strokeWidth={2.5} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
