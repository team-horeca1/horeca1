'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function DistributorCTA() {
  return (
    <section className="w-full py-5 md:py-8 bg-background">
      <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
        <Link
          href="/vendor/register"
          className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl bg-primary hover:bg-primary-dark active:bg-[#4A141F] px-5 py-5 md:px-8 md:py-6 shadow-cdl-2 transition-colors"
        >
          <div className="min-w-0 text-left">
            <p className="text-[16px] md:text-[18px] font-bold text-white leading-snug">
              Become a Horeca1 Distributor
            </p>
            <p className="text-[12px] md:text-[13px] text-white/80 mt-1">
              Reach restaurants across your market — apply in a few minutes.
            </p>
          </div>
          <span className="inline-flex items-center justify-center gap-1.5 min-h-12 px-5 rounded-xl bg-white text-primary text-[13px] font-semibold shrink-0 self-start sm:self-center group-hover:shadow-md transition-shadow">
            Apply now
            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </span>
        </Link>
      </div>
    </section>
  );
}
