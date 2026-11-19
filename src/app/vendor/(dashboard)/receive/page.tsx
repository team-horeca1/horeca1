'use client';

import React, { useEffect, useState } from 'react';

type Line = {
  orderId: string;
  orderNumber: string;
  customerPaid: string;
  razorpayFee: string | null;
  razorpayFeeUnknown: boolean;
  commission: string;
  receive: string;
  paid: boolean;
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

  useEffect(() => {
    fetch('/api/v1/vendor/payables')
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json?.error?.message ?? 'Could not load');
        setLines(json.data.lines);
        setRate(json.data.ratePct);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load'));
  }, []);

  const totals = lines.reduce((sum, line) => ({
    paid: sum.paid + Number(line.customerPaid || 0),
    fee: sum.fee + Number(line.razorpayFee || 0),
    commission: sum.commission + Number(line.commission || 0),
    receive: sum.receive + (line.paid ? 0 : Number(line.receive || 0)),
  }), { paid: 0, fee: 0, commission: 0, receive: 0 });

  return (
    <div className="mx-auto max-w-[960px] space-y-6 pb-16 text-[#1C1C1C]">
      <header>
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#6B1D2E]">Finance</p>
        <h1 className="mt-2 text-[clamp(1.8rem,2vw+1rem,2.4rem)] font-semibold tracking-tight">What I receive</h1>
        <p className="mt-2 max-w-xl text-[16px] leading-7 text-[#3F3F46]">
          Customer paid, minus Razorpay’s fee, minus Horeca1’s commission{rate == null ? '' : ` (${rate}%)`}. What is left is what Horeca1 pays you.
        </p>
      </header>
      {error ? <p className="text-[#DC2626]">{error}</p> : null}
      <section className="grid gap-3 sm:grid-cols-3">
        <Card label="Razorpay cut" value={inr(String(totals.fee))} />
        <Card label="Horeca1 commission" value={inr(String(totals.commission))} />
        <Card label="Still to receive" value={inr(String(totals.receive))} />
      </section>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.orderId} className="rounded-[22px] border border-[#E9E3DD] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{line.orderNumber} <a className="text-[13px] font-semibold text-[#6B1D2E]" href={`/api/v1/vendor/payables/orders/${line.orderId}/payment-invoice`}>Payment invoice</a></p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-[14px] sm:grid-cols-4">
              <div><dt className="text-[#667085]">Customer paid</dt><dd className="tabular-nums font-medium">{inr(line.customerPaid)}</dd></div>
              <div><dt className="text-[#667085]">Razorpay cut</dt><dd className="tabular-nums font-medium">{line.razorpayFeeUnknown ? 'Razorpay fee not received' : inr(line.razorpayFee)}</dd></div>
              <div><dt className="text-[#667085]">Horeca1 commission</dt><dd className="tabular-nums font-medium">{inr(line.commission)}</dd></div>
              <div><dt className="text-[#667085]">I receive</dt><dd className="tabular-nums font-semibold">{inr(line.receive)}{line.paid ? ' · Paid' : ''}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-[#E9E3DD] bg-white p-4">
      <p className="text-[13px] text-[#667085]">{label}</p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums">{value}</p>
    </article>
  );
}
