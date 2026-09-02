'use client';

import React, { useEffect, useState } from 'react';
import { Package, Users } from 'lucide-react';

function fmt(n: number) {
  return n.toLocaleString('en-IN');
}

export function HomeTicker() {
  const [stats, setStats] = useState<{ productsSold: number; customers: number } | null>(null);
  const [display, setDisplay] = useState({ productsSold: 0, customers: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch('/api/v1/stats/home')
      .then((r) => r.json())
      .then((json) => {
        if (json?.success && json.data) {
          setStats({
            productsSold: Number(json.data.productsSold) || 0,
            customers: Number(json.data.customers) || 0,
          });
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
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

  if (!ready) {
    return (
      <section className="w-full mb-4">
        <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
          <div className="flex gap-3">
            <div className="h-[72px] w-[220px] bg-white border border-divider rounded-2xl animate-pulse" />
            <div className="h-[72px] w-[220px] bg-white border border-divider rounded-2xl animate-pulse" />
          </div>
        </div>
      </section>
    );
  }

  if (!stats || (stats.productsSold === 0 && stats.customers === 0)) {
    return null;
  }

  const cards = [
    { icon: Package, value: display.productsSold, label: 'Products sold' },
    { icon: Users, value: display.customers, label: 'Customers' },
  ] as const;

  return (
    <section className="w-full mb-4">
      <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
        <div className="flex gap-3 overflow-x-auto no-scrollbar">
          {cards.map((card) => (
            <article
              key={card.label}
              className="flex items-center gap-3 min-w-[200px] md:min-w-[240px] bg-white border border-divider rounded-2xl px-4 py-3 shadow-cdl-1"
            >
              <div className="size-11 rounded-[10px] bg-primary-light text-primary flex items-center justify-center shrink-0">
                <card.icon size={20} strokeWidth={1.8} />
              </div>
              <div className="min-w-0 text-left">
                <p className="text-[20px] font-bold tabular-nums text-[#1C1C1C] leading-none">
                  {fmt(card.value)}
                </p>
                <p className="text-[11px] text-[#667085] font-medium mt-1.5 leading-none">
                  {card.label}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
