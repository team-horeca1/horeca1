'use client';

import React, { useEffect, useState } from 'react';
import { Package, Users, Truck, ShieldCheck } from 'lucide-react';

function fmt(n: number) {
  return n.toLocaleString('en-IN');
}

export function HomeTicker() {
  const [stats, setStats] = useState<{ productsSold: number; customers: number } | null>(null);
  const [display, setDisplay] = useState({ productsSold: 122, customers: 1 });

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

  const items = [
    {
      icon: Package,
      value: `${fmt(display.productsSold || 120)}+`,
      label: 'Products Sold',
      sublabel: 'Wholesale deliveries',
      mobileValue: `${fmt(display.productsSold || 120)}+`,
      mobileLabel: 'Products',
      iconBg: 'bg-primary-light text-primary',
      mobileColor: 'text-primary',
    },
    {
      icon: Users,
      value: `${fmt(display.customers || 1)}+`,
      label: 'Active Outlets',
      sublabel: 'Restaurants & cafes',
      mobileValue: `${fmt(display.customers || 1)}+`,
      mobileLabel: 'Outlets',
      iconBg: 'bg-primary-light text-primary',
      mobileColor: 'text-primary',
    },
    {
      icon: Truck,
      value: '24-Hour',
      label: 'Morning Dispatch',
      sublabel: 'Next-day door delivery',
      mobileValue: '24-Hour',
      mobileLabel: 'Dispatch',
      iconBg: 'bg-primary-light text-primary',
      mobileColor: 'text-primary',
    },
    {
      icon: ShieldCheck,
      value: '100% Quality',
      label: 'Verified Suppliers',
      sublabel: 'Direct brand inventory',
      mobileValue: '100%',
      mobileLabel: 'Verified',
      iconBg: 'bg-primary-light text-primary',
      mobileColor: 'text-primary',
    },
  ];

  return (
    <section className="w-full py-3 md:py-4 bg-background">
      <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
        <div className="hidden md:grid md:grid-cols-4 bg-white border border-divider rounded-2xl shadow-cdl-1 p-3 md:p-3.5 lg:p-4 divide-x divide-divider">
          {items.map((item, idx) => (
            <div
              key={item.label}
              className={`flex items-center gap-2 lg:gap-3 ${idx > 0 ? 'px-2.5 lg:px-6' : 'pr-2.5 lg:pr-6'} ${idx === items.length - 1 ? 'pl-2.5 lg:pl-6' : ''}`}
            >
              <div className={`size-10 lg:size-12 rounded-xl ${item.iconBg} flex items-center justify-center shrink-0`}>
                <item.icon className="size-5 lg:size-[22px]" strokeWidth={2} />
              </div>
              <div className="min-w-0 text-left">
                <span className="text-[16px] lg:text-[19px] font-extrabold tabular-nums text-text tracking-tight leading-none">
                  {item.value}
                </span>
                <p className="text-[11.5px] lg:text-[12px] font-bold text-text mt-1 leading-tight truncate">
                  {item.label}
                </p>
                <p className="text-[10.5px] lg:text-[11px] text-text-muted leading-tight truncate mt-0.5">
                  {item.sublabel}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="md:hidden bg-white border border-divider rounded-2xl p-2.5 shadow-cdl-1 grid grid-cols-4 divide-x divide-divider text-center">
          {items.map((item) => (
            <div key={item.label} className="flex flex-col items-center justify-center px-1">
              <item.icon size={16} className={`${item.mobileColor} mb-1`} strokeWidth={2.2} />
              <span className="text-[12px] font-extrabold text-text tabular-nums leading-tight">{item.mobileValue}</span>
              <span className="text-[9.5px] text-text-muted font-medium mt-0.5 leading-tight">{item.mobileLabel}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
