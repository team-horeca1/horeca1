'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Download,
  Loader2,
  Wallet,
  IndianRupee,
  CreditCard,
  Percent,
  CheckCircle2,
  Info,
  FileSpreadsheet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  focusRing,
  inr,
  StatusPill,
  FinanceKpiCard,
  type PillTone,
} from '@/components/features/finance/financeChrome';

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

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
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

  const totals = lines.reduce(
    (sum, line) => ({
      paid: sum.paid + Number(line.customerPaid || 0),
      fee: sum.fee + Number(line.razorpayFee || 0),
      commission: sum.commission + Number(line.commission || 0),
      received: sum.received + (line.paid ? Number(line.receive || 0) : 0),
      waiting: sum.waiting + (line.paid ? 0 : Number(line.receive || 0)),
    }),
    { paid: 0, fee: 0, commission: 0, received: 0, waiting: 0 },
  );

  const outcome =
    totals.waiting > 0
      ? { label: 'Still to receive', value: totals.waiting }
      : { label: 'Received', value: totals.received };

  function exportCsv() {
    if (lines.length === 0) return;
    const header = [
      'Order',
      'Status',
      'Customer paid',
      'Razorpay fee',
      'Commission',
      'You receive',
    ];
    const body = lines.map((line) =>
      [
        line.orderNumber,
        line.paid ? 'Paid' : STATUS_LABEL[line.status] ?? 'Pending',
        inr(line.customerPaid),
        line.razorpayFeeUnknown ? 'Not received' : inr(line.razorpayFee),
        inr(line.commission),
        inr(line.receive),
      ]
        .map(csvCell)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'supplier-receive-statement.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16 text-[#1C1C1C]">
      {/* Navigation Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-[#667085]">
        <Link href="/vendor/dashboard" className="hover:text-[#6B1D2E] transition-colors">
          Finance
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="text-[#1C1C1C] font-semibold">Vendor Receive</span>
      </nav>

      {/* Header section */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1C1C1C] sm:text-3xl">
            What I receive
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[#667085]">
            Customer paid, minus the Razorpay fee, minus Horeca1 commission
            {rate == null ? '' : ` (${rate}%)`}. What is left is what Horeca1 pays you.
          </p>
        </div>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={exportCsv}
            className={cn(
              'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E9E3DD] bg-white px-4 text-xs font-semibold text-[#1C1C1C] hover:bg-[#FAF7F2] shadow-xs transition-colors shrink-0',
              focusRing,
            )}
          >
            <Download size={14} />
            <span>Download CSV</span>
          </button>
        )}
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[#667085] py-4">
          <Loader2 className="animate-spin text-[#6B1D2E]" size={16} />
          <span>Loading your statement…</span>
        </div>
      ) : null}

      {/* 4 Financial KPI Overview Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FinanceKpiCard
          title={outcome.label}
          value={inr(outcome.value)}
          subtext={
            outcome.label === 'Received'
              ? 'Every listed order has been marked paid.'
              : 'Orders that are not marked paid yet.'
          }
          icon={<Wallet className="h-4 w-4" />}
          variant={outcome.label === 'Received' ? 'default' : 'hero'}
          iconTone={outcome.label === 'Received' ? 'emerald' : 'burgundy'}
        />
        <FinanceKpiCard
          title="Customer paid"
          value={inr(totals.paid)}
          subtext="Total captured from customers"
          icon={<IndianRupee className="h-4 w-4" />}
          iconTone="blue"
        />
        <FinanceKpiCard
          title="Razorpay fee"
          value={inr(totals.fee)}
          subtext="Payment gateway transaction fees"
          icon={<CreditCard className="h-4 w-4" />}
          iconTone="emerald"
        />
        <FinanceKpiCard
          title="Horeca1 commission"
          value={inr(totals.commission)}
          subtext={rate == null ? 'Commission rate not configured' : `Calculated at ${rate}%`}
          icon={<Percent className="h-4 w-4" />}
          iconTone="purple"
        />
      </section>

      {/* Statement Section */}
      {lines.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-[#E9E3DD] bg-white p-12 text-center shadow-xs">
          <FileSpreadsheet className="mx-auto h-10 w-10 text-zinc-300 mb-3" />
          <p className="text-sm font-medium text-[#667085]">
            No payments yet. A delivered order appears here after the customer pays.
          </p>
        </div>
      ) : lines.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-[#E9E3DD] bg-white shadow-xs">
          <div className="border-b border-[#E9E3DD] bg-[#FAF7F2]/60 px-5 py-3.5">
            <h2 className="text-sm font-bold text-[#1C1C1C]">Your statement</h2>
          </div>

          {/* Desktop Table View */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-[#E9E3DD] bg-[#FAF7F2]/80 text-[11px] font-bold uppercase tracking-wider text-[#667085]">
                <tr>
                  <th scope="col" className="px-5 py-3.5 font-bold">
                    Order
                  </th>
                  <th scope="col" className="px-3.5 py-3.5 text-right font-bold">
                    Customer paid
                  </th>
                  <th scope="col" className="px-3.5 py-3.5 text-right font-bold">
                    Razorpay fee
                  </th>
                  <th scope="col" className="px-3.5 py-3.5 text-right font-bold">
                    Commission
                  </th>
                  <th scope="col" className="px-3.5 py-3.5 text-right font-bold">
                    You receive
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right font-bold">
                    Advice
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E3DD]">
                {lines.map((line) => (
                  <tr key={line.orderId} className="hover:bg-[#FAF7F2]/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-sm text-[#1C1C1C]">{line.orderNumber}</p>
                      <div className="mt-0.5">
                        <StatusPill tone={toneFor(line)}>
                          {line.paid ? 'Paid' : STATUS_LABEL[line.status] ?? 'Pending'}
                        </StatusPill>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3.5 text-right tabular-nums text-[#1C1C1C]">
                      {inr(line.customerPaid)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3.5 text-right tabular-nums text-[#667085]">
                      {line.razorpayFeeUnknown ? 'Not received' : inr(line.razorpayFee)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3.5 text-right tabular-nums text-[#667085]">
                      {inr(line.commission)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3.5 text-right font-bold tabular-nums text-sm text-[#1C1C1C]">
                      {inr(line.receive)}
                      {line.paid ? ' · Paid' : ''}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <a
                        className={cn(
                          'inline-flex items-center gap-1 text-xs font-semibold text-[#6B1D2E] hover:underline',
                          focusRing,
                        )}
                        href={`/api/v1/vendor/payables/orders/${line.orderId}/payment-invoice`}
                      >
                        <Download size={13} />
                        <span>Payment advice</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Card View */}
          <ul className="divide-y divide-[#E9E3DD] md:hidden">
            {lines.map((line) => (
              <li key={line.orderId} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-bold text-sm text-[#1C1C1C]">{line.orderNumber}</p>
                  <StatusPill tone={toneFor(line)}>
                    {line.paid ? 'Paid' : STATUS_LABEL[line.status] ?? 'Pending'}
                  </StatusPill>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#FAF7F2] p-3 text-xs">
                  <Amount label="Customer paid" value={inr(line.customerPaid)} />
                  <Amount
                    label="Razorpay fee"
                    value={line.razorpayFeeUnknown ? 'Not received' : inr(line.razorpayFee)}
                  />
                  <Amount label="Commission" value={inr(line.commission)} />
                  <Amount
                    label="You receive"
                    value={`${inr(line.receive)}${line.paid ? ' · Paid' : ''}`}
                    strong
                  />
                </div>

                <div className="pt-1">
                  <a
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B1D2E] hover:underline',
                      focusRing,
                    )}
                    href={`/api/v1/vendor/payables/orders/${line.orderId}/payment-invoice`}
                  >
                    <Download size={13} />
                    <span>Payment advice</span>
                  </a>
                </div>
              </li>
            ))}
          </ul>

          {/* Legal / Informational Footer */}
          <div className="flex items-start gap-2 border-t border-[#E9E3DD] bg-[#FAF7F2]/40 p-4 text-xs leading-relaxed text-[#667085]">
            <Info size={14} className="shrink-0 text-[#667085] mt-0.5" />
            <span>
              The payment advice is the payout advice. It is not a goods tax invoice, and it does
              not start a bank transfer.
            </span>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Amount({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[11px] text-[#667085]">{label}</dt>
      <dd
        className={cn(
          'tabular-nums text-xs',
          strong ? 'font-bold text-[#1C1C1C]' : 'font-medium text-[#1C1C1C]',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
