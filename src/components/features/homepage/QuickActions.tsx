'use client';

import Link from 'next/link';
import { RotateCcw, ListOrdered, Store, BadgePercent, ChevronRight } from 'lucide-react';
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
    <section className="w-full py-3.5 md:py-5 bg-background">
      <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
        <div className="mb-3 md:mb-4">
          <SectionHeader
            title="Quick actions"
            subtitle="Essential shortcuts to streamline your operations"
          />
        </div>

        {/* Tablet / desktop: horizontal cards matching design */}
        <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-3.5 lg:gap-4">
          {ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={cn(
                'group relative flex items-center justify-between p-3.5 lg:p-4 gap-3',
                'bg-white border border-divider rounded-2xl',
                'min-h-[82px] lg:min-h-[88px]',
                'shadow-cdl-1 hover:shadow-cdl-2',
                'hover:border-primary/40 hover:-translate-y-0.5',
                'transition-all duration-200 active:scale-[0.98]',
                'overflow-hidden',
              )}
            >
              <div
                className="absolute inset-0 bg-gradient-to-r from-primary/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                aria-hidden
              />

              <div className="size-11 lg:size-12 rounded-xl bg-primary-light text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-all duration-200">
                <action.icon className="size-5 lg:size-6" strokeWidth={2} />
              </div>

              <div className="min-w-0 flex-1 text-left">
                <h3 className="text-[14.5px] lg:text-[15.5px] font-bold text-primary group-hover:text-primary-dark transition-colors line-clamp-1 leading-tight">
                  {action.label}
                </h3>
                <p className="text-[11.5px] lg:text-[12px] text-text-secondary mt-0.5 font-normal line-clamp-1 leading-snug">
                  {action.desc}
                </p>
              </div>

              <div className="size-7 lg:size-8 rounded-full bg-primary-light text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white group-hover:translate-x-0.5 transition-all duration-150">
                <ChevronRight size={15} strokeWidth={2.4} />
              </div>
            </Link>
          ))}
        </div>

        {/* Mobile: same four actions, compact dock */}
        <div className="md:hidden grid grid-cols-4 gap-2">
          {ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={cn(
                'group flex flex-col items-center justify-center p-2.5',
                'bg-white border border-divider rounded-xl min-h-[78px]',
                'shadow-cdl-1 active:scale-95 transition-all duration-150 text-center',
              )}
            >
              <div className="size-10 rounded-xl bg-primary-light text-primary flex items-center justify-center mb-1.5 group-hover:bg-primary group-hover:text-white transition-colors">
                <action.icon className="size-5" strokeWidth={2} />
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
