'use client';

import Link from 'next/link';
import { RotateCcw, ListOrdered, Store, BadgePercent } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/ui/SectionHeader';

/** Single Quick actions set — Reorder · Quick Order · My Vendors · Deals */
const ACTIONS = [
  {
    href: '/orders',
    icon: RotateCcw,
    label: 'Reorder',
    mobileLabel: 'Reorder',
    desc: 'From last order',
  },
  {
    href: '/order-lists',
    icon: ListOrdered,
    label: 'Quick Order',
    mobileLabel: 'Quick Order',
    desc: 'Order lists',
  },
  {
    href: '/vendors',
    icon: Store,
    label: 'My Vendors',
    mobileLabel: 'Vendors',
    desc: 'Saved vendors',
  },
  {
    href: '/deals',
    icon: BadgePercent,
    label: 'Deals',
    mobileLabel: 'Deals',
    desc: 'Coupons & offers',
  },
] as const;

export function QuickActions() {
  return (
    <section className="w-full py-2 md:py-2 bg-background">
      <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
        <SectionHeader title="Quick actions" className="mb-2" />

        <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-2">
          {ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={cn(
                'group flex items-center gap-2.5 px-3 min-h-14',
                'bg-white border border-divider rounded-md',
                'hover:border-primary/30 transition-colors',
              )}
            >
              <div className="size-8 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">
                <action.icon className="size-4" strokeWidth={2} />
              </div>
              <div className="min-w-0 text-left">
                <h3 className="text-[13px] font-semibold text-[#1C1C1C] leading-tight line-clamp-1">
                  {action.label}
                </h3>
                <p className="text-[11px] text-text-secondary mt-0.5 font-normal line-clamp-1 leading-snug">
                  {action.desc}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Mobile: same four actions, compact dock */}
        <div className="md:hidden grid grid-cols-4 gap-1.5">
          {ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={cn(
                'group flex flex-col items-center justify-center p-1.5',
                'bg-white border border-divider rounded-lg min-h-[58px]',
                'shadow-cdl-1 active:scale-95 transition-all duration-150 text-center',
              )}
            >
              <div className="size-8 rounded-lg bg-primary-light text-primary flex items-center justify-center mb-1 group-hover:bg-primary group-hover:text-white transition-colors">
                <action.icon className="size-4" strokeWidth={2} />
              </div>
              <span className="text-[10.5px] font-bold text-text leading-tight tracking-tight text-center">
                {action.mobileLabel}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
