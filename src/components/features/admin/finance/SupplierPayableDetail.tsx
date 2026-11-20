'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Download,
  Loader2,
  ArrowLeft,
  Settings,
  Info,
  AlertCircle,
  FileText,
  Clock,
  CheckCircle2,
  Lock,
  ChevronDown,
  ChevronUp,
  Search,
  Wallet,
  IndianRupee,
  CreditCard,
  Percent,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  focusRing,
  inr,
  money,
  StatusPill,
  SupplierMark,
  FinanceKpiCard,
  type PillTone,
} from '@/components/features/finance/financeChrome';

type Line = {
  id: string;
  orderId: string;
  status: string;
  collectedAmount: string;
  commissionAmount: string;
  commercialBase?: string;
  recognisedBase?: string;
  razorpayFee: string | null;
  razorpayFeeUnknown: boolean;
  netPayable: string;
  provisionalBase: string;
  blockedSale: string;
  aboveCash: string;
  order: {
    orderNumber: string;
    status: string;
    paymentStatus: string;
    paymentMethod: string | null;
  };
  breakdown?: {
    ratePct?: string | null;
    quoteFee?: string;
    quoteFeeUnknown?: boolean;
    quoteCommission?: string;
    quoteNet?: string;
  } | null;
};

type Batch = {
  id: string;
  batchNumber: string;
  status: string;
  netAmount: string;
  bankReference: string | null;
  orderCount: number;
};

type Detail = {
  vendor: {
    id: string;
    businessName: string;
    displayName: string | null;
    vendorCode: string | null;
    logoUrl?: string | null;
    platformFeePct: string | null;
    settlementCycle: 'manual' | 'weekly';
  };
  lines: Line[];
  batches: Batch[];
  recoveries: Array<{
    id: string;
    amount: string;
    reason: string | null;
    appliedBatchId: string | null;
    createdAt: string;
  }>;
  agreements: Array<{
    id: string;
    ratePct: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    reason: string;
  }>;
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

const TABS = [
  { id: 'orders', label: 'Orders' },
  { id: 'history', label: 'Commission history' },
  { id: 'recoveries', label: 'Recoveries' },
  { id: 'settlements', label: 'Settlements' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function toneFor(status: string): PillTone {
  if (status === 'eligible') return 'ready';
  if (status === 'settled') return 'paid';
  if (status === 'on_hold' || status === 'fee_unknown') return 'warn';
  if (status === 'commission_unconfigured') return 'danger';
  return 'muted';
}

function isPreview(line: Line): boolean {
  return line.status === 'awaiting_completion' || line.status === 'pending_capture';
}

function cutFee(line: Line): string {
  if (isPreview(line)) {
    if (line.breakdown?.quoteFeeUnknown) return 'Fee missing';
    return inr(line.breakdown?.quoteFee ?? 0);
  }
  return line.razorpayFeeUnknown ? 'Fee missing' : inr(line.razorpayFee ?? 0);
}

function cutCommission(line: Line): string {
  if (line.breakdown?.ratePct == null) return '—';
  if (isPreview(line)) return inr(line.breakdown?.quoteCommission ?? 0);
  return inr(line.commissionAmount);
}

function cutNet(line: Line): string {
  if (isPreview(line)) {
    if (line.breakdown?.quoteFeeUnknown || line.breakdown?.ratePct == null) return '—';
    return inr(line.breakdown?.quoteNet ?? 0);
  }
  return inr(line.netPayable);
}

function footnote(lines: Line[]): string {
  const parts = [
    'A held line cannot be paid. A line already in a payment or paid cannot be held.',
    'Commission uses the tax-inclusive subtotal. That is a Phase 1 assumption, not a tax ruling.',
    'Supplier promotions and coupons are not deducted from the supplier.',
  ];
  if (lines.some((line) => Number(line.provisionalBase) > 0))
    parts.push('A captured amount is not payable until the order is delivered.');
  if (lines.some((line) => Number(line.blockedSale) > 0))
    parts.push('Orders without a commission rate stay unpaid.');
  if (lines.some((line) => Number(line.aboveCash) > 0))
    parts.push('Amount above the cash collected is not booked.');
  return parts.join(' ');
}

export function SupplierPayableDetail({ vendorId }: { vendorId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [q, setQ] = useState('');
  const [reason, setReason] = useState('');
  const [tab, setTab] = useState<TabId>('orders');
  const [openId, setOpenId] = useState<string | null>(null);
  const [holding, setHolding] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/finance/payables/${vendorId}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error?.message ?? 'Could not load this supplier');
      return;
    }
    setError('');
    setData(json.data);
  }, [vendorId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function hold(lineId: string, action: 'hold' | 'release') {
    if (action === 'hold' && reason.trim().length < 8) {
      setActionError('A hold needs a reason of at least 8 characters.');
      return;
    }
    setHolding(lineId);
    setActionError('');
    try {
      const res = await fetch(`/api/v1/admin/finance/payables/lines/${lineId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Could not update this order');
      if (action === 'hold') setReason('');
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update this order');
    } finally {
      setHolding('');
    }
  }

  async function setCycle(settlementCycle: 'manual' | 'weekly') {
    setActionError('');
    const res = await fetch(`/api/v1/admin/finance/payables/${vendorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settlementCycle }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionError(json?.error?.message ?? 'Could not change the cycle');
      return;
    }
    await load();
  }

  if (error)
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800" role="alert">
        {error}
      </div>
    );

  if (!data)
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#6B1D2E] gap-3">
        <Loader2 className="animate-spin" size={28} />
        <p className="text-sm font-semibold tracking-wide">Loading supplier details…</p>
      </div>
    );

  const name = data.vendor.displayName?.trim() || data.vendor.businessName;
  const visible = data.lines.filter(
    (line) =>
      line.order.orderNumber.toLowerCase().includes(q.toLowerCase()) ||
      line.status.includes(q.toLowerCase()),
  );
  const batches = data.batches ?? [];
  const toPay = data.lines
    .filter((line) => line.status === 'eligible')
    .reduce((sum, line) => sum + money(line.netPayable), 0);
  const customerPaid = data.lines.reduce((sum, line) => sum + money(line.collectedAmount), 0);
  const fee = data.lines.reduce((sum, line) => sum + money(line.razorpayFee), 0);
  const commission = data.lines.reduce((sum, line) => sum + money(line.commissionAmount), 0);
  const feeUnknown = data.lines.some((line) => line.razorpayFeeUnknown);
  const reasonReady = reason.trim().length >= 8;

  return (
    <div className="space-y-6 pb-12 text-[#1C1C1C]">
      {/* Navigation Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-[#667085]">
        <Link href="/admin/finance" className="hover:text-[#6B1D2E] transition-colors">
          Finance
        </Link>
        <span className="text-zinc-300">/</span>
        <Link href="/admin/finance" className="hover:text-[#6B1D2E] transition-colors">
          Payables
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="text-[#1C1C1C] font-semibold truncate max-w-xs">{name}</span>
      </nav>

      {/* Back Link */}
      <div>
        <Link
          href="/admin/finance"
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B1D2E] hover:underline',
            focusRing,
          )}
        >
          <ArrowLeft size={14} />
          <span>Back to Pay suppliers</span>
        </Link>
      </div>

      {/* Supplier Profile Hero Header Card */}
      <div className="overflow-hidden rounded-2xl border border-[#E9E3DD] bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          {/* Identity Info */}
          <div className="flex items-start gap-4">
            <SupplierMark name={name} logoUrl={data.vendor.logoUrl} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-[#1C1C1C] sm:text-2xl">
                  {name}
                </h1>
                {toPay > 0 ? (
                  <StatusPill tone="ready">Ready to Pay</StatusPill>
                ) : (
                  <StatusPill tone="muted">Settled / Idle</StatusPill>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#667085]">
                {data.vendor.vendorCode ? (
                  <span className="font-mono bg-zinc-100 px-2 py-0.5 rounded text-zinc-700 font-medium">
                    {data.vendor.vendorCode}
                  </span>
                ) : null}
                {data.vendor.platformFeePct == null ? (
                  <StatusPill tone="danger">No rate configured</StatusPill>
                ) : (
                  <StatusPill tone="ready">{data.vendor.platformFeePct}% Commission</StatusPill>
                )}
              </div>
            </div>
          </div>

          {/* Controls & Statement Action */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Settlement cycle widget */}
            <div className="flex items-center gap-3 rounded-xl border border-[#E9E3DD] bg-[#FAF7F2]/60 px-3.5 py-2">
              <Settings size={16} className="text-[#6B1D2E] shrink-0" />
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#667085]">
                  Settlement cycle
                </label>
                <select
                  aria-label="Settlement cycle"
                  value={data.vendor.settlementCycle}
                  onChange={(event) =>
                    void setCycle(event.target.value as 'manual' | 'weekly')
                  }
                  className={cn(
                    'mt-0.5 bg-transparent text-xs font-semibold text-[#1C1C1C] outline-none cursor-pointer',
                    focusRing,
                  )}
                >
                  <option value="manual">Manual</option>
                  <option value="weekly">Weekly draft only</option>
                </select>
              </div>
            </div>

            {/* Download Statement */}
            <a
              href={`/api/v1/admin/finance/payables/${vendorId}/statement`}
              className={cn(
                'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#6B1D2E] px-4 text-xs font-semibold text-white shadow-xs hover:bg-[#5A1926] transition-colors',
                focusRing,
              )}
            >
              <Download size={14} />
              <span>Download statement</span>
            </a>
          </div>
        </div>

        {/* Disclaimer / Info note */}
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-900 leading-relaxed">
          <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
          <span>
            Commission uses tax-inclusive subtotal. A captured amount is not payable until the
            order is delivered. Weekly only prepares a draft. It does not transfer money.
          </span>
        </div>
      </div>

      {actionError ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800"
        >
          <AlertCircle size={16} className="text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      ) : null}

      {/* Financial Overview Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FinanceKpiCard
          title="To pay now"
          value={inr(toPay)}
          subtext="Eligible orders only. Held, unpaid, and undelivered orders are not in this figure."
          icon={<Wallet className="h-4 w-4" />}
          variant="hero"
        />
        <FinanceKpiCard
          title="Customer paid"
          value={inr(customerPaid)}
          subtext="Total collected cash"
          icon={<IndianRupee className="h-4 w-4" />}
          iconTone="blue"
        />
        <FinanceKpiCard
          title="Razorpay fee"
          value={feeUnknown ? `${inr(fee)} · some missing` : inr(fee)}
          subtext={feeUnknown ? 'Some fees not recorded' : 'All gateway deductions'}
          icon={<CreditCard className="h-4 w-4" />}
          iconTone="emerald"
        />
        <FinanceKpiCard
          title="Commission"
          value={inr(commission)}
          subtext="Horeca1 commission cut"
          icon={<Percent className="h-4 w-4" />}
          iconTone="purple"
        />
      </section>

      {/* Tabs Navigation */}
      <div
        role="tablist"
        aria-label="Supplier records"
        className="flex gap-2 border-b border-[#E9E3DD] overflow-x-auto"
      >
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={active}
              aria-controls={`panel-${item.id}`}
              onClick={() => setTab(item.id)}
              className={cn(
                'relative flex items-center gap-2 px-4 py-3 text-xs font-semibold transition-colors duration-150',
                focusRing,
                active ? 'text-[#6B1D2E]' : 'text-[#667085] hover:text-[#1C1C1C]',
              )}
            >
              <span>{item.label}</span>
              {item.id === 'orders' && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 font-medium">
                  {data.lines.length}
                </span>
              )}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6B1D2E] rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {tab === 'orders' ? (
        <section
          role="tabpanel"
          id="panel-orders"
          aria-labelledby="tab-orders"
          className="overflow-hidden rounded-2xl border border-[#E9E3DD] bg-white shadow-xs"
        >
          {/* Orders Filter & Hold Reason Toolbar */}
          <div className="flex flex-col gap-3 p-4 border-b border-[#E9E3DD] sm:flex-row sm:items-center sm:justify-between bg-[#FAF7F2]/40">
            <div className="relative w-full sm:max-w-xs">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
              />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                aria-label="Search orders"
                placeholder="Search order or status…"
                className={cn(
                  'h-9 w-full rounded-xl border border-[#E9E3DD] bg-white pl-9 pr-3 text-xs text-[#1C1C1C] placeholder:text-[#667085] hover:border-[#CDC4BA]',
                  focusRing,
                )}
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:max-w-md">
              <label className="text-xs font-medium text-[#667085] shrink-0">Hold reason:</label>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-label="Hold reason"
                placeholder="At least 8 characters required to hold"
                className={cn(
                  'h-9 w-full rounded-xl border border-[#E9E3DD] bg-white px-3 text-xs text-[#1C1C1C] placeholder:text-zinc-400 hover:border-[#CDC4BA]',
                  focusRing,
                )}
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#667085]">
              No orders found for this supplier.
            </div>
          ) : (
            <>
              {/* Mobile View */}
              <ul className="divide-y divide-[#E9E3DD] md:hidden">
                {visible.map((line) => (
                  <li key={line.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        aria-expanded={openId === line.id}
                        onClick={() => setOpenId(openId === line.id ? null : line.id)}
                        className={cn(
                          'flex items-center gap-1.5 font-bold text-sm text-[#1C1C1C] hover:text-[#6B1D2E]',
                          focusRing,
                        )}
                      >
                        <span>{line.order.orderNumber}</span>
                        {openId === line.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <StatusPill tone={toneFor(line.status)}>
                        {STATUS_LABEL[line.status] ?? line.status}
                      </StatusPill>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#FAF7F2] p-3 text-xs">
                      <Pair label="Customer paid" value={inr(line.collectedAmount)} />
                      <Pair label="Razorpay fee" value={cutFee(line)} />
                      <Pair label="Commission" value={cutCommission(line)} />
                      <Pair label="Net" value={cutNet(line)} strong />
                    </div>

                    {openId === line.id ? <Breakdown line={line} /> : null}

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <Advice orderId={line.orderId} />
                      <LineAction
                        line={line}
                        busy={holding === line.id}
                        reasonReady={reasonReady}
                        onHold={hold}
                      />
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop View */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[920px] text-left text-xs">
                  <thead className="border-b border-[#E9E3DD] bg-[#FAF7F2]/80 text-[11px] font-bold uppercase tracking-wider text-[#667085]">
                    <tr>
                      <th scope="col" className="px-5 py-3.5 font-bold">
                        Order
                      </th>
                      <th scope="col" className="px-3.5 py-3.5 font-bold">
                        Status
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
                        Net
                      </th>
                      <th scope="col" className="px-4 py-3.5 font-bold">
                        Payment advice
                      </th>
                      <th scope="col" className="px-5 py-3.5 text-right font-bold">
                        Hold / Release
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9E3DD]">
                    {visible.map((line) => (
                      <React.Fragment key={line.id}>
                        <tr className="hover:bg-[#FAF7F2]/60 transition-colors">
                          <td className="px-5 py-3.5">
                            <button
                              type="button"
                              aria-expanded={openId === line.id}
                              onClick={() => setOpenId(openId === line.id ? null : line.id)}
                              className={cn(
                                'inline-flex items-center gap-1.5 font-semibold text-sm text-[#1C1C1C] hover:text-[#6B1D2E]',
                                focusRing,
                              )}
                            >
                              <span>{line.order.orderNumber}</span>
                              {openId === line.id ? (
                                <ChevronUp size={13} className="text-[#6B1D2E]" />
                              ) : (
                                <ChevronDown size={13} className="text-zinc-400" />
                              )}
                            </button>
                          </td>
                          <td className="px-3.5 py-3.5">
                            <StatusPill tone={toneFor(line.status)}>
                              {STATUS_LABEL[line.status] ?? line.status}
                            </StatusPill>
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3.5 text-right tabular-nums text-[#1C1C1C]">
                            {inr(line.collectedAmount)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3.5 text-right tabular-nums text-[#667085]">
                            {cutFee(line)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3.5 text-right tabular-nums text-[#667085]">
                            {cutCommission(line)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3.5 text-right font-bold tabular-nums text-sm text-[#1C1C1C]">
                            {cutNet(line)}
                          </td>
                          <td className="px-4 py-3.5">
                            <Advice orderId={line.orderId} />
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <LineAction
                              line={line}
                              busy={holding === line.id}
                              reasonReady={reasonReady}
                              onHold={hold}
                            />
                          </td>
                        </tr>
                        {openId === line.id ? (
                          <tr>
                            <td colSpan={8} className="bg-[#FAF7F2]/90 p-4 border-b border-[#E9E3DD]">
                              <Breakdown line={line} />
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Table Footnote */}
          <div className="border-t border-[#E9E3DD] bg-[#FAF7F2]/40 p-4 text-xs leading-relaxed text-[#667085]">
            <p>{footnote(data.lines)}</p>
          </div>
        </section>
      ) : null}

      {tab === 'history' ? (
        <section
          role="tabpanel"
          id="panel-history"
          aria-labelledby="tab-history"
          className="rounded-2xl border border-[#E9E3DD] bg-white p-5 shadow-xs"
        >
          <h2 className="text-sm font-bold text-[#1C1C1C]">Commission history</h2>
          <p className="mt-1 text-xs text-[#667085]">
            Changes to the supplier rate are recorded with effective dates and reason.
          </p>
          {data.agreements.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-[#E9E3DD] p-8 text-center text-xs text-[#667085]">
              No rate has been set. A blank rate is not 0%.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[#E9E3DD] text-xs">
              {data.agreements.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 font-bold">
                      {row.ratePct}%
                    </span>
                    <div>
                      <span className="font-semibold text-[#1C1C1C]">Rate agreement</span>
                      <p className="text-[#667085] mt-0.5">{row.reason}</p>
                    </div>
                  </div>
                  <div className="text-right text-[#667085]">
                    <span>{new Date(row.effectiveFrom).toLocaleDateString('en-IN')}</span>
                    {row.effectiveTo ? (
                      <span> – {new Date(row.effectiveTo).toLocaleDateString('en-IN')}</span>
                    ) : (
                      <span className="font-semibold text-emerald-700"> · Current</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'recoveries' ? (
        <section
          role="tabpanel"
          id="panel-recoveries"
          aria-labelledby="tab-recoveries"
          className="rounded-2xl border border-[#E9E3DD] bg-white p-5 shadow-xs"
        >
          <h2 className="text-sm font-bold text-[#1C1C1C]">Recoveries</h2>
          <p className="mt-1 text-xs text-[#667085]">
            A refund after a payment is locked is listed here. The paid batch is not rewritten.
          </p>
          {data.recoveries.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-[#E9E3DD] p-8 text-center text-xs text-[#667085]">
              No recoveries recorded.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[#E9E3DD] text-xs">
              {data.recoveries.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="font-bold tabular-nums text-sm text-[#1C1C1C]">
                      {inr(row.amount)}
                    </p>
                    <p className="text-[#667085] mt-0.5">{row.reason || 'Post-settlement adjustment'}</p>
                  </div>
                  <StatusPill tone={row.appliedBatchId ? 'paid' : 'warn'}>
                    {row.appliedBatchId ? 'Applied to draft' : 'Open recovery'}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'settlements' ? (
        <section
          role="tabpanel"
          id="panel-settlements"
          aria-labelledby="tab-settlements"
          className="overflow-hidden rounded-2xl border border-[#E9E3DD] bg-white shadow-xs"
        >
          {batches.length === 0 ? (
            <p className="p-12 text-center text-xs text-[#667085]">No settlements yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="border-b border-[#E9E3DD] bg-[#FAF7F2]/80 text-[11px] font-bold uppercase tracking-wider text-[#667085]">
                  <tr>
                    <th scope="col" className="px-5 py-3.5 font-bold">
                      Settlement
                    </th>
                    <th scope="col" className="px-3.5 py-3.5 font-bold">
                      Status
                    </th>
                    <th scope="col" className="px-3.5 py-3.5 text-right font-bold">
                      Orders
                    </th>
                    <th scope="col" className="px-3.5 py-3.5 text-right font-bold">
                      Net
                    </th>
                    <th scope="col" className="px-5 py-3.5 font-bold">
                      Bank reference
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E3DD]">
                  {batches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-[#FAF7F2]/60 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-[#1C1C1C]">
                        {batch.batchNumber}
                      </td>
                      <td className="px-3.5 py-3.5">
                        <StatusPill tone={batch.status === 'settled' ? 'paid' : 'muted'}>
                          {batch.status}
                        </StatusPill>
                      </td>
                      <td className="px-3.5 py-3.5 text-right tabular-nums text-[#667085]">
                        {batch.orderCount}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3.5 text-right font-bold tabular-nums text-sm text-[#1C1C1C]">
                        {inr(batch.netAmount)}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[#667085]">
                        {batch.bankReference || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function Pair({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
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

function Breakdown({ line }: { line: Line }) {
  const rate = line.breakdown?.ratePct;
  return (
    <div className="rounded-xl border border-[#E9E3DD] bg-white p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold text-[#6B1D2E]">
        <FileText size={14} />
        <span>Calculation Breakdown</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4 text-xs">
        <div className="rounded-lg bg-[#FAF7F2] p-2.5">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">
            Commercial base
          </dt>
          <dd className="mt-1 font-semibold tabular-nums text-sm text-[#1C1C1C]">
            {inr(line.commercialBase ?? 0)}
          </dd>
        </div>
        <div className="rounded-lg bg-[#FAF7F2] p-2.5">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">
            Recognised base
          </dt>
          <dd className="mt-1 font-semibold tabular-nums text-sm text-[#1C1C1C]">
            {inr(line.recognisedBase ?? 0)}
          </dd>
        </div>
        <div className="rounded-lg bg-[#FAF7F2] p-2.5">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">
            Commission Rate
          </dt>
          <dd className="mt-1 font-semibold tabular-nums text-sm text-[#1C1C1C]">
            {rate == null ? 'No rate' : `${rate}%`}
          </dd>
        </div>
        <div className="rounded-lg bg-[#FAF7F2] p-2.5">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">
            Above cash
          </dt>
          <dd className="mt-1 font-semibold tabular-nums text-sm text-[#1C1C1C]">
            {inr(line.aboveCash)}
          </dd>
        </div>
      </dl>
      {money(line.provisionalBase) > 0 ? (
        <p className="text-xs text-[#667085] flex items-center gap-1.5">
          <Clock size={13} className="text-amber-600 shrink-0" />
          <span>Captured {inr(line.provisionalBase)}. Not payable until the order is delivered.</span>
        </p>
      ) : null}
      {money(line.blockedSale) > 0 ? (
        <p className="text-xs text-rose-700 flex items-center gap-1.5">
          <AlertCircle size={13} className="text-rose-600 shrink-0" />
          <span>No commission rate configured, so {inr(line.blockedSale)} stays unpaid.</span>
        </p>
      ) : null}
    </div>
  );
}

function Advice({ orderId }: { orderId: string }) {
  return (
    <a
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold text-[#6B1D2E] hover:underline',
        focusRing,
      )}
      href={`/api/v1/admin/finance/payables/orders/${orderId}/payment-invoice`}
    >
      <Download size={13} />
      <span>Payment advice</span>
    </a>
  );
}

function LineAction({
  line,
  busy,
  reasonReady,
  onHold,
}: {
  line: Line;
  busy: boolean;
  reasonReady: boolean;
  onHold: (id: string, action: 'hold' | 'release') => void;
}) {
  if (line.status === 'eligible') {
    return (
      <button
        type="button"
        disabled={busy || !reasonReady}
        title={reasonReady ? undefined : 'A hold needs a reason of at least 8 characters'}
        onClick={() => void onHold(line.id, 'hold')}
        className={cn(
          'inline-flex h-8 items-center justify-center rounded-xl border border-[#6B1D2E] px-3 text-xs font-semibold text-[#6B1D2E] hover:bg-[#6B1D2E] hover:text-white transition-colors disabled:cursor-not-allowed disabled:border-[#E9E3DD] disabled:text-zinc-400 disabled:hover:bg-transparent',
          focusRing,
        )}
      >
        {busy ? <Loader2 className="animate-spin" size={12} /> : 'Hold'}
      </button>
    );
  }
  if (line.status === 'on_hold') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void onHold(line.id, 'release')}
        className={cn(
          'inline-flex h-8 items-center justify-center rounded-xl border border-[#E9E3DD] bg-white px-3 text-xs font-semibold text-[#1C1C1C] hover:bg-zinc-50 transition-colors disabled:opacity-50',
          focusRing,
        )}
      >
        {busy ? <Loader2 className="animate-spin" size={12} /> : 'Release'}
      </button>
    );
  }
  return (
    <span className="text-xs text-[#667085]">
      {line.status === 'settled' || line.status === 'in_batch' ? 'Locked' : '—'}
    </span>
  );
}
