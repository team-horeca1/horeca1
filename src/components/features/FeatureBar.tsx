'use client';

import React, { useEffect, useState } from 'react';
import {
  Truck,
  BadgePercent,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';

const FEATURES = [
  {
    kind: 'feature' as const,
    icon: BadgePercent,
    title: 'Best Wholesale Rates',
    description: 'Bulk slabs built for commercial kitchens',
  },
  {
    kind: 'feature' as const,
    icon: CreditCard,
    title: 'Up to 90 Days Credit',
    description: 'DiSCCO vendor-backed terms',
  },
  {
    kind: 'feature' as const,
    icon: Truck,
    title: 'Pan-India Delivery',
    description: 'Next-day slots from verified suppliers',
  },
  {
    kind: 'feature' as const,
    icon: ShieldCheck,
    title: 'Verified Suppliers',
    description: 'GST-ready invoices on every order',
  },
];

type RailItem = (typeof FEATURES)[number] | {
  kind: 'stat';
  icon: typeof Truck;
  title: string;
  description: string;
  value: string;
};

function TrustCard({ item }: { item: RailItem }) {
  return (
    <div className="shrink-0 w-[248px] sm:w-[270px] flex items-center gap-3.5 rounded-xl border border-[#E9E3DD] bg-[#FAF7F2] px-4 py-3.5">
      <div className="size-11 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
        <item.icon className="size-5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 text-left">
        {item.kind === 'stat' ? (
          <>
            <p className="text-[15px] font-extrabold tabular-nums text-[#1C1C1C] leading-none tracking-tight">
              {item.value}
            </p>
            <p className="text-[13px] font-bold text-[#1C1C1C] mt-1 leading-tight truncate">
              {item.title}
            </p>
            <p className="text-[12px] text-[#667085] leading-snug truncate mt-0.5">
              {item.description}
            </p>
          </>
        ) : (
          <>
            <h3 className="text-[14px] font-bold text-[#1C1C1C] leading-tight">
              {item.title}
            </h3>
            <p className="text-[12px] text-[#667085] leading-snug mt-0.5">
              {item.description}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function FeatureBar() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const statsItems: RailItem[] = [
    {
      kind: 'stat',
      icon: Truck,
      value: '24-Hour',
      title: 'Morning Dispatch',
      description: 'Next-day door delivery',
    },
    {
      kind: 'stat',
      icon: ShieldCheck,
      value: '100% Quality',
      title: 'Verified Suppliers',
      description: 'Direct brand inventory',
    },
  ];

  const rail: RailItem[] = [...statsItems, ...FEATURES];
  // Duplicate for seamless CSS loop (translateX -50%)
  const loop = [...rail, ...rail];

  return (
    <section className="w-full py-4 md:py-6 overflow-hidden bg-transparent">
      <div className="w-full">
        {reduceMotion ? (
          <div className="px-4 md:px-[var(--container-padding)] flex gap-3 overflow-x-auto no-scrollbar">
            {rail.map((item) => (
              <TrustCard key={`${item.kind}-${item.title}`} item={item} />
            ))}
          </div>
        ) : (
          <div className="group relative">
            <div
              className="flex w-max gap-3 animate-[trust-marquee_42s_linear_infinite] group-hover:[animation-play-state:paused]"
              aria-label="Platform stats and benefits"
            >
              {loop.map((item, i) => (
                <TrustCard key={`${item.kind}-${item.title}-${i}`} item={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
