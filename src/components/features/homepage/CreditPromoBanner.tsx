'use client';

import React from 'react';
import Link from 'next/link';
import { CreditCard, ArrowRight, ShieldCheck, Clock, CheckCircle2 } from 'lucide-react';
import { useCustomerCreditSummary } from '@/hooks/useCustomerCreditSummary';

/** Acquisition promo — hidden for guests with no session wait, and for auth users who already have a DiSCCO wallet. */
export function CreditPromoBanner() {
  const { summary, loaded, isAuthenticated } = useCustomerCreditSummary();

  // Wait until credit state is known for auth users so we don't flash promo then strip.
  if (isAuthenticated && !loaded) return null;
  if (isAuthenticated && summary?.hasWallet) return null;

  return (
    <section className="w-full py-4 md:py-8 bg-background overflow-hidden">
      <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
        <div className="relative rounded-2xl md:rounded-[24px] overflow-hidden bg-gradient-to-br from-[#1F191A] via-[#1A1617] to-[#2E1218] border border-white/10 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.25)] p-5 md:p-8 lg:p-10">
          <div
            className="absolute -right-20 -top-20 size-72 rounded-full bg-primary/20 blur-3xl pointer-events-none"
            aria-hidden
          />
          <div
            className="absolute -left-10 -bottom-10 size-60 rounded-full bg-primary/10 blur-2xl pointer-events-none"
            aria-hidden
          />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-rose-200 text-[11px] font-semibold tracking-wide uppercase mb-3">
                <CreditCard size={13} className="text-rose-300" />
                <span>DiSCCO™ B2B Credit</span>
              </div>

              <h2 className="text-[20px] sm:text-[24px] md:text-[28px] lg:text-[32px] font-extrabold text-white leading-tight tracking-tight">
                Get up to 90 Days Credit with DiSCCO
              </h2>

              <p className="text-[13px] md:text-[15px] text-stone-300 mt-2 leading-relaxed">
                Vendor-backed revolving credit built exclusively for commercial kitchens.
                Never let cash flow halt your daily food supply.
              </p>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-4 pt-1">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-[12px] font-medium text-stone-200 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  <span>Up to ₹5,00,000 Credit Line</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] sm:text-[12px] font-medium text-stone-200 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1">
                  <Clock size={13} className="text-amber-400" />
                  <span>Net 30 &amp; Net 90 Terms</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] sm:text-[12px] font-medium text-stone-200 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1">
                  <ShieldCheck size={13} className="text-blue-400" />
                  <span>Zero Paperwork</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-3 shrink-0 pt-2 lg:pt-0">
              <Link
                href="/wallet"
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-12 px-6 py-3.5 rounded-xl bg-white hover:bg-stone-100 text-[#1C1C1C] font-bold text-[14px] shadow-lg hover:shadow-xl transition-all duration-200 active:scale-[0.98] group"
              >
                <span>Check Eligibility</span>
                <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5 text-primary" />
              </Link>
              <span className="text-[11px] text-stone-400">
                Instant digital assessment · No impact on credit score
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
