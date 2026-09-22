'use client';

import React, { useEffect, useState } from 'react';
import {
  Truck,
  BadgePercent,
  ShieldCheck,
  CreditCard,
  Package,
  Users,
} from 'lucide-react';

function fmt(n: number) {
  return n.toLocaleString('en-IN');
}

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

type StatItem = {
  kind: 'stat';
  icon: typeof Package;
  title: string;
  description: string;
  value: string;
};

type RailItem =
  | StatItem
  | (typeof FEATURES)[number];

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
  const [display, setDisplay] = useState({ productsSold: 122, customers: 1 });
  const [stats, setStats] = useState<{ productsSold: number; customers: number } | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    fetch('/api/v1/stats/home')
      .then((r) => r.json())
      .then((json) => {
        if (json?.success && json.data) {
          setStats({
            productsSold: Number(json.data.productsSold) || 122,
            customers: Number(json.data.customers) || 1,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!stats) return;
    const end = stats;
    const duration = 1200;
    const startTime = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = 1 - (1 - t) ** 3;
      setDisplay({
        productsSold: Math.round(end.productsSold * ease),
        customers: Math.round(end.customers * ease),
      });
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [stats]);

  const statsItems: StatItem[] = [
    {
      kind: 'stat',
      icon: Package,
      value: `${fmt(display.productsSold || 120)}+`,
      title: 'Products Sold',
      description: 'Wholesale deliveries',
    },
    {
      kind: 'stat',
      icon: Users,
      value: `${fmt(display.customers || 1)}+`,
      title: 'Active Outlets',
      description: 'Restaurants & cafes',
    },
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
