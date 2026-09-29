'use client';

import Link from 'next/link';
import { RotateCcw, ListOrdered, Store, BadgePercent, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    <section className="w-full pt-1 pb-3 md:pt-1.5 md:pb-4 bg-background">
      <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
        <div className="hidden md:grid md:grid-cols-4 gap-2.5 md:gap-3">
          {ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="flex items-center gap-3 px-3.5 md:px-4 min-h-[52px] md:min-h-[54px] bg-white border border-divider/80 rounded-2xl shadow-2xs hover:border-primary/40 hover:shadow-xs transition-all group"
            >
              <span className="size-8.5 rounded-full bg-primary-light text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <action.icon className="size-4" strokeWidth={2} />
              </span>
              <span className="min-w-0 text-left flex-1">
                <span className="block text-[13px] md:text-[13.5px] font-bold text-[#181725] leading-tight truncate group-hover:text-primary transition-colors">
                  {action.label}
                </span>
                <span className="block text-[11px] md:text-[11.5px] text-[#667085] mt-0.5 leading-snug truncate">
                  {action.desc}
                </span>
              </span>
              <ChevronRight className="size-3.5 text-[#B0B7C3] group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 ml-1" strokeWidth={2.2} />
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
                'bg-white border border-divider/80 rounded-xl min-h-[58px]',
                'shadow-2xs active:scale-95 transition-all duration-150 text-center',
              )}
            >
              <div className="size-8 rounded-lg bg-primary-light text-primary flex items-center justify-center mb-1 group-hover:bg-primary group-hover:text-white transition-colors">
                <action.icon className="size-4" strokeWidth={2} />
              </div>
              <span className="text-[10.5px] font-bold text-[#181725] leading-tight tracking-tight text-center">
                {action.mobileLabel}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
