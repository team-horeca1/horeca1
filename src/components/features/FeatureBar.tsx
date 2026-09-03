'use client';

import React from 'react';
import { Truck, BadgePercent, ShieldCheck, CreditCard } from 'lucide-react';

const FEATURES = [
  {
    icon: BadgePercent,
    title: 'Best Wholesale Rates',
    description: 'Bulk slabs built for commercial kitchens',
  },
  {
    icon: CreditCard,
    title: 'Up to 90 Days Credit',
    description: 'DiSCCO vendor-backed terms',
  },
  {
    icon: Truck,
    title: 'Pan-India Delivery',
    description: 'Next-day slots from verified suppliers',
  },
  {
    icon: ShieldCheck,
    title: 'Verified Suppliers',
    description: 'GST-ready invoices on every order',
  },
];

export function FeatureBar() {
  return (
    <section className="w-full py-3 md:py-5 bg-white border-y border-divider overflow-hidden">
      <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
        {/* Mobile: compact 2×2 trust strip */}
        <div className="grid grid-cols-2 gap-2 md:hidden">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="flex items-start gap-2 rounded-xl bg-background border border-divider px-2.5 py-2.5"
            >
              <div className="size-8 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">
                <feature.icon className="size-3.5" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-[#1C1C1C] leading-tight">{feature.title}</p>
                <p className="text-[10px] text-[#667085] leading-snug mt-0.5 line-clamp-2">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Tablet / desktop */}
        <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="flex items-center gap-3.5 bg-background border border-divider rounded-xl p-4 shadow-cdl-1 hover:shadow-cdl-2 hover:border-primary/20 transition-all duration-200"
            >
              <div className="size-11 rounded-full bg-primary flex items-center justify-center shrink-0">
                <feature.icon className="size-5 text-white" strokeWidth={1.75} />
              </div>
              <div className="flex flex-col min-w-0 text-left">
                <h3 className="text-[14px] lg:text-[15px] font-bold text-text mb-0.5">{feature.title}</h3>
                <p className="text-[12px] text-text-secondary leading-snug">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
