'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { focusRing, inr, StatusPill, type PillTone } from '@/components/features/finance/financeChrome';

type Line = {
  orderId: string;
  orderNumber: string;
  status: string;
  customerPaid: string;
  razorpayFee: string | null;
  razorpayFeeUnknown: boolean;
  commission: string;
  receive: string;
  paid: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  pending_capture: 'Not paid',
  awaiting_completion: 'Not delivered',
  commission_unconfigured: 'No rate',
  fee_unknown: 'Fee missing',
  eligible: 'Ready',
  on_hold: 'Paused',
  in_batch: 'In a payment',
  settled: 'Paid',
  closed: 'Closed',
};

function toneFor(line: Line): PillTone {
  if (line.paid || line.status === 'settled') return 'paid';
  if (line.status === 'eligible') return 'ready';
  if (line.status === 'on_hold' || line.status === 'fee_unknown') return 'warn';
  return 'muted';
}

export default function WhatIReceivePage() {
  const [lines, setLines] = useState<Line[]>([]);
  const [rate, setRate] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/vendor/payables')
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json?.error?.message ?? 'Could not load');
        setLines(json.data.lines);
        setRate(json.data.ratePct);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load'))
      .finally(() => setLoading(false));
  }, []);

  const totals = lines.reduce((sum, line) => ({
    paid: sum.paid + Number(line.customerPaid || 0),
    fee: sum.fee + Number(line.razorpayFee || 0),
    commission: sum.commission + Number(line.commission || 0),
    received: sum.received + (line.paid ? Number(line.receive || 0) : 0),
    waiting: sum.waiting + (line.paid ? 0 : Number(line.receive || 0)),
  }), { paid: 0, fee: 0, commission: 0, received: 0, waiting: 0 });

  const outcome = totals.waiting > 0
    ? { label: 'Still to receive', value: totals.waiting }
    : { label: 'Received', value: totals.received };

  return (
    <div className="mx-auto max-w-[1080px] space-y-5 pb-16 text-[#1C1C1C]">
      <header>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6B1D2E]">Finance</p>
        <h1 className="mt-1 text-[clamp(1.7rem,2vw+0.8rem,2.2rem)] font-semibold tracking-tight">What I receive</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-6 text-[#667085]">
          Customer paid, minus the Razorpay fee, minus Horeca1 commission{rate == null ? '' : ` (${rate}%)`}. What is left is what Horeca1 pays you.
        </p>
      </header>
      {error ? <p role="alert" className="rounded-xl border border-[#DC2626]/30 bg-white px-4 py-3 text-[14px] text-[#DC2626]">{error}</p> : null}
      {loading ? <p className="flex items-center gap-2 text-[14px] text-[#667085]"><Loader2 className="animate-spin text-[#6B1D2E]" size={16} /> Loading your statement</p> : null}

      <section className="overflow-hidden rounded-xl border border-[#E9E3DD] bg-white">
        <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.4fr)]">
          <div className="border-b border-[#E9E3DD] px-5 py-5 lg:border-b-0 lg:border-r">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6B1D2E]">{outcome.label}</p>
            <p className={cn('mt-2 text-[clamp(1.7rem,2vw+0.8rem,2.3rem)] font-semibold tabular-nums tracking-tight', outcome.label === 'Received' ? 'text-[#16A34A]' : 'text-[#6B1D2E]')}>{inr(outcome.value)}</p>
            <p className="mt-2 text-[13px] leading-5 text-[#667085]">
              {outcome.label === 'Received' ? 'Every listed order has been marked paid.' : 'Orders that are not marked paid yet.'}
            </p>
          </div>
          <div className="grid sm:grid-cols-3">
            <Quiet label="Customer paid" value={inr(totals.paid)} />
            <Quiet label="Razorpay fee" value={inr(totals.fee)} />
            <Quiet label="Horeca1 commission" value={inr(totals.commission)} />
          </div>
        </div>
      </section>

      {lines.length === 0 && !loading ? (
        <p className="rounded-xl border border-dashed border-[#E9E3DD] bg-white px-4 py-12 text-center text-[15px] text-[#667085]">
          No payments yet. A delivered order appears here after the customer pays.
        </p>
      ) : lines.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-[#E9E3DD] bg-white">
          <div className="border-b border-[#E9E3DD] px-4 py-3">
            <h2 className="text-[15px] font-semibold">Your statement</h2>
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="bg-[#FAF7F2] text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Order</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Customer paid</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Razorpay fee</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Commission</th>
                  <th className="px-3 py-2.5 text-right font-semibold">You receive</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Advice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E3DD]">
                {lines.map((line) => (
                  <tr key={line.orderId}>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{line.orderNumber}</p>
                      <StatusPill tone={toneFor(line)}>{line.paid ? 'Paid' : (STATUS_LABEL[line.status] ?? 'Pending')}</StatusPill>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{inr(line.customerPaid)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{line.razorpayFeeUnknown ? 'Not received' : inr(line.razorpayFee)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{inr(line.commission)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{inr(line.receive)}{line.paid ? ' · Paid' : ''}</td>
                    <td className="px-4 py-3 text-right">
                      <a className={cn('text-[12px] font-semibold text-[#6B1D2E]', focusRing)} href={`/api/v1/vendor/payables/orders/${line.orderId}/payment-invoice`}>Payment advice</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-[#E9E3DD] md:hidden">
            {lines.map((line) => (
              <li key={line.orderId} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{line.orderNumber}</p>
                  <StatusPill tone={toneFor(line)}>{line.paid ? 'Paid' : (STATUS_LABEL[line.status] ?? 'Pending')}</StatusPill>
                </div>
                <dl className="mt-3 space-y-1.5 text-[13px]">
                  <Amount label="Customer paid" value={inr(line.customerPaid)} />
                  <Amount label="Razorpay fee" value={line.razorpayFeeUnknown ? 'Not received' : inr(line.razorpayFee)} />
                  <Amount label="Commission" value={inr(line.commission)} />
                  <Amount label="You receive" value={`${inr(line.receive)}${line.paid ? ' · Paid' : ''}`} strong />
                </dl>
                <a className={cn('mt-3 inline-flex min-h-11 items-center text-[13px] font-semibold text-[#6B1D2E]', focusRing)} href={`/api/v1/vendor/payables/orders/${line.orderId}/payment-invoice`}>
                  Payment advice
                </a>
              </li>
            ))}
          </ul>
          <p className="border-t border-[#E9E3DD] px-4 py-3 text-[13px] leading-5 text-[#667085]">
            The payment advice is not a goods tax invoice, and it does not start a bank transfer.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function Quiet({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[#E9E3DD] px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-l sm:first:border-l-0">
      <p className="text-[12px] font-medium text-[#667085]">{label}</p>
      <p className="mt-1 text-[clamp(1.05rem,1.2vw,1.3rem)] font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Amount({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] text-[#667085]">{label}</dt>
      <dd className={cn('tabular-nums whitespace-nowrap', strong ? 'font-semibold' : 'font-medium')}>{value}</dd>
    </div>
  );
}
