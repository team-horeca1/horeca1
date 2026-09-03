'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useCustomerCreditSummary } from '@/hooks/useCustomerCreditSummary';

function formatInr(v: number) {
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
}

function dueLabel(iso: string | null, outstanding: number): string | null {
  if (!iso || outstanding <= 0) return null;
  const due = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const days = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);
  if (days < 0) return `${formatInr(outstanding)} overdue`;
  if (days === 0) return `${formatInr(outstanding)} due today`;
  if (days === 1) return `${formatInr(outstanding)} due tomorrow`;
  return `${formatInr(outstanding)} due in ${days} days`;
}

/** Auth-only DiSCCO balance strip. Self-hides when no wallet. */
export function CreditStatusStrip() {
  const { summary, loaded, isAuthenticated } = useCustomerCreditSummary();

  if (!loaded || !isAuthenticated || !summary?.hasWallet) return null;

  const due = dueLabel(summary.currentDueDate, summary.outstandingAmount);

  return (
    <section className="w-full pt-2 pb-1 bg-background">
      <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
        <Link
          href="/wallet"
          className="flex items-center justify-between gap-3 rounded-xl bg-[#EEF3ED] border border-[#D5E3D7] px-3.5 py-3 hover:border-primary/25 transition-colors"
        >
          <p className="text-[12px] md:text-[13px] text-[#2A4A2E] leading-snug min-w-0">
            <span className="font-bold">DiSCCO Credit:</span>{' '}
            <span className="font-semibold tabular-nums">{formatInr(summary.availableCredit)} available</span>
            {due && (
              <>
                <span className="text-[#667085]"> · </span>
                <span className="font-semibold text-[#8A2E1E] tabular-nums">{due}</span>
              </>
            )}
          </p>
          <span className="inline-flex items-center gap-0.5 text-[12px] font-bold text-[#1C1C1C] shrink-0 ml-2">
            View
            <ChevronRight size={14} strokeWidth={2.5} aria-hidden />
          </span>
        </Link>
      </div>
    </section>
  );
}
