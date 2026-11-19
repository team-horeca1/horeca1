'use client';

import React, { useEffect, useState } from 'react';

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

function inr(value: string | null): string {
  if (value == null) return 'Not received';
  const n = Number(value);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
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
    ? { label: 'Still to receive', value: totals.waiting, tone: 'pay' as const }
    : { label: 'Received', value: totals.received, tone: 'done' as const };

  return (
    <div className="mx-auto max-w-[1040px] space-y-6 pb-16 text-[#1C1C1C]">
      <header>
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#6B1D2E]">Finance</p>
        <h1 className="mt-2 text-[clamp(1.8rem,2vw+1rem,2.4rem)] font-semibold tracking-tight">What I receive</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-7 text-[#667085]">
          Customer paid, minus Razorpay’s fee, minus Horeca1’s commission{rate == null ? '' : ` (${rate}%)`}. What is left is what Horeca1 pays you.
        </p>
      </header>
      {error ? <p role="alert" className="rounded-xl border border-[#DC2626]/30 bg-white px-4 py-3 text-[14px] text-[#DC2626]">{error}</p> : null}
      {loading ? <p className="text-[14px] text-[#667085]">Loading your statement</p> : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Customer paid" value={inr(String(totals.paid))} />
        <Card label="Razorpay cut" value={inr(String(totals.fee))} />
        <Card label="Horeca1 commission" value={inr(String(totals.commission))} />
        <Card label={outcome.label} value={inr(String(outcome.value))} tone={outcome.tone} />
      </section>

      {lines.length === 0 && !loading ? (
        <p className="rounded-xl border border-dashed border-[#E9E3DD] bg-white px-4 py-12 text-center text-[15px] text-[#667085]">
          No payments yet. A delivered order appears here after the customer pays.
        </p>
      ) : (
        <section className="overflow-hidden rounded-xl border border-[#E9E3DD] bg-white">
          <div className="border-b border-[#E9E3DD] px-4 py-3">
            <h2 className="text-[15px] font-semibold">Statement</h2>
          </div>
          <div className="hidden grid-cols-[1.3fr_repeat(4,1fr)_auto] gap-3 bg-[#FAF7F2] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#667085] md:grid">
            <span>Order</span>
            <span className="text-right">Customer paid</span>
            <span className="text-right">Razorpay cut</span>
            <span className="text-right">Commission</span>
            <span className="text-right">You receive</span>
            <span className="text-right">Advice</span>
          </div>
          <ul className="divide-y divide-[#E9E3DD]">
            {lines.map((line) => (
              <li key={line.orderId} className="grid gap-3 px-4 py-4 md:grid-cols-[1.3fr_repeat(4,1fr)_auto] md:items-center">
                <div>
                  <p className="font-semibold">{line.orderNumber}</p>
                  <p className={`text-[12px] font-medium ${line.paid ? 'text-[#16A34A]' : 'text-[#667085]'}`}>
                    {STATUS_LABEL[line.status] ?? line.status}
                  </p>
                </div>
                <Amount label="Customer paid" value={inr(line.customerPaid)} />
                <Amount label="Razorpay cut" value={line.razorpayFeeUnknown ? 'Not received' : inr(line.razorpayFee)} />
                <Amount label="Commission" value={inr(line.commission)} />
                <Amount label="You receive" value={`${inr(line.receive)}${line.paid ? ' · Paid' : ''}`} strong />
                <a className="text-[13px] font-semibold text-[#6B1D2E] md:text-right" href={`/api/v1/vendor/payables/orders/${line.orderId}/payment-invoice`}>
                  Payment invoice
                </a>
              </li>
            ))}
          </ul>
          <p className="border-t border-[#E9E3DD] px-4 py-3 text-[13px] leading-5 text-[#667085]">
            The payment invoice is the payout advice. It is not the goods tax invoice.
          </p>
        </section>
      )}
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: 'pay' | 'done' }) {
  return (
    <article className="rounded-xl border border-[#E9E3DD] bg-white px-4 py-3">
      <p className="text-[12px] font-medium text-[#667085]">{label}</p>
      <p className={`mt-1 text-[clamp(1.15rem,1.5vw,1.5rem)] font-semibold tabular-nums ${tone === 'pay' ? 'text-[#6B1D2E]' : tone === 'done' ? 'text-[#16A34A]' : 'text-[#1C1C1C]'}`}>{value}</p>
    </article>
  );
}

function Amount({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 md:block md:text-right">
      <p className="text-[11px] text-[#667085] md:hidden">{label}</p>
      <p className={`tabular-nums ${strong ? 'font-semibold' : 'font-medium'}`}>{value}</p>
    </div>
  );
}
