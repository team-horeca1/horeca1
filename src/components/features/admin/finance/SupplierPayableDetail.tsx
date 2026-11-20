'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { focusRing, inr, money, StatusPill, SupplierMark, type PillTone } from '@/components/features/finance/financeChrome';

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
  order: { orderNumber: string; status: string; paymentStatus: string; paymentMethod: string | null };
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
  recoveries: Array<{ id: string; amount: string; reason: string | null; appliedBatchId: string | null; createdAt: string }>;
  agreements: Array<{ id: string; ratePct: string; effectiveFrom: string; effectiveTo: string | null; reason: string }>;
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
    'Commission uses the tax-inclusive subtotal. That is a Phase 1 assumption, not a tax ruling.',
    'Supplier promotions and coupons are not deducted from the supplier.',
  ];
  if (lines.some((line) => Number(line.provisionalBase) > 0)) parts.push('A captured amount is not payable until the order is delivered.');
  if (lines.some((line) => Number(line.blockedSale) > 0)) parts.push('Orders without a commission rate stay unpaid.');
  if (lines.some((line) => Number(line.aboveCash) > 0)) parts.push('Amount above the cash collected is not booked.');
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

  if (error) return <p role="alert" className="text-[#DC2626]">{error}</p>;
  if (!data) return <div className="flex items-center gap-2 py-16 text-[#6B1D2E]"><Loader2 className="animate-spin" size={18} /> Loading supplier</div>;

  const name = data.vendor.displayName?.trim() || data.vendor.businessName;
  const visible = data.lines.filter((line) => line.order.orderNumber.toLowerCase().includes(q.toLowerCase()) || line.status.includes(q.toLowerCase()));
  const batches = data.batches ?? [];
  const toPay = data.lines.filter((line) => line.status === 'eligible').reduce((sum, line) => sum + money(line.netPayable), 0);
  const customerPaid = data.lines.reduce((sum, line) => sum + money(line.collectedAmount), 0);
  const fee = data.lines.reduce((sum, line) => sum + money(line.razorpayFee), 0);
  const commission = data.lines.reduce((sum, line) => sum + money(line.commissionAmount), 0);
  const feeUnknown = data.lines.some((line) => line.razorpayFeeUnknown);
  const reasonReady = reason.trim().length >= 8;

  return (
    <div className="space-y-5 pb-8 text-[#1C1C1C]">
      <Link href="/admin/finance" className={cn('text-[14px] font-semibold text-[#6B1D2E]', focusRing)}>Back to Pay suppliers</Link>

      <header className="flex flex-col gap-4 rounded-xl border border-[#E9E3DD] bg-white p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <SupplierMark name={name} logoUrl={data.vendor.logoUrl} />
          <div className="min-w-0">
            <h1 className="truncate text-[clamp(1.4rem,2vw+0.4rem,1.85rem)] font-semibold tracking-tight">{name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-[#667085]">
              {data.vendor.vendorCode ? <span>{data.vendor.vendorCode}</span> : null}
              {data.vendor.platformFeePct == null
                ? <StatusPill tone="muted">No rate</StatusPill>
                : <StatusPill tone="ready">{data.vendor.platformFeePct}% commission</StatusPill>}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-[12px] text-[#667085]">Settlement cycle
            <select value={data.vendor.settlementCycle} onChange={(event) => void setCycle(event.target.value as 'manual' | 'weekly')} className={cn('mt-1 block h-11 w-full rounded-lg border border-[#E9E3DD] bg-white px-3 text-[14px] text-[#1C1C1C] sm:w-52', focusRing)}>
              <option value="manual">Manual</option>
              <option value="weekly">Weekly draft only</option>
            </select>
          </label>
          <a href={`/api/v1/admin/finance/payables/${vendorId}/statement`} className={cn('inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#E9E3DD] bg-white px-3 text-[13px] font-semibold text-[#1C1C1C] hover:bg-[#FAF7F2]', focusRing)}>
            <Download size={15} />
            Download statement
          </a>
        </div>
      </header>
      <p className="text-[13px] text-[#667085]">Weekly only prepares a draft. It does not transfer money.</p>

      {actionError ? <p role="alert" className="rounded-xl border border-[#DC2626]/30 bg-white px-4 py-3 text-[14px] text-[#DC2626]">{actionError}</p> : null}

      <section className="overflow-hidden rounded-xl border border-[#E9E3DD] bg-white">
        <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.4fr)]">
          <div className="border-b border-[#E9E3DD] px-5 py-5 lg:border-b-0 lg:border-r">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6B1D2E]">To pay now</p>
            <p className="mt-2 text-[clamp(1.7rem,2vw+0.8rem,2.3rem)] font-semibold tabular-nums tracking-tight text-[#6B1D2E]">{inr(toPay)}</p>
            <p className="mt-2 text-[13px] leading-5 text-[#667085]">Eligible orders only. Held, unpaid, and undelivered orders are not in this figure.</p>
          </div>
          <div className="grid sm:grid-cols-3">
            <Quiet label="Customer paid" value={inr(customerPaid)} />
            <Quiet label="Razorpay fee" value={feeUnknown ? `${inr(fee)} · some missing` : inr(fee)} />
            <Quiet label="Commission" value={inr(commission)} />
          </div>
        </div>
      </section>

      <div role="tablist" aria-label="Supplier records" className="flex gap-1 overflow-x-auto border-b border-[#E9E3DD]">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            onClick={() => setTab(item.id)}
            className={cn('h-11 shrink-0 px-3 text-[14px] font-semibold', focusRing, tab === item.id ? 'border-b-2 border-[#6B1D2E] text-[#6B1D2E]' : 'text-[#667085]')}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'orders' ? (
        <section role="tabpanel" id="panel-orders" aria-labelledby="tab-orders" className="overflow-hidden rounded-xl border border-[#E9E3DD] bg-white">
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row">
            <input value={q} onChange={(event) => setQ(event.target.value)} aria-label="Search orders" placeholder="Order or status" className={cn('h-11 w-full rounded-lg border border-[#E9E3DD] px-3 text-[14px] sm:max-w-xs', focusRing)} />
            <label className="w-full text-[12px] text-[#667085] sm:max-w-sm">Hold reason
              <input value={reason} onChange={(event) => setReason(event.target.value)} aria-label="Hold reason" placeholder="At least 8 characters" className={cn('mt-1 h-11 w-full rounded-lg border border-[#E9E3DD] px-3 text-[14px] text-[#1C1C1C]', focusRing)} />
            </label>
          </div>
          {visible.length === 0 ? (
            <p className="border-t border-[#E9E3DD] px-4 py-8 text-[14px] text-[#667085]">No orders for this supplier.</p>
          ) : (
            <>
              <ul className="divide-y divide-[#E9E3DD] border-t border-[#E9E3DD] md:hidden">
                {visible.map((line) => (
                  <li key={line.id} className="px-4 py-4">
                    <OrderHead line={line} open={openId === line.id} onToggle={() => setOpenId(openId === line.id ? null : line.id)} />
                    <dl className="mt-3 space-y-1.5 text-[13px]">
                      <Pair label="Customer paid" value={inr(line.collectedAmount)} />
                      <Pair label="Razorpay fee" value={cutFee(line)} />
                      <Pair label="Commission" value={cutCommission(line)} />
                      <Pair label="Net" value={cutNet(line)} strong />
                    </dl>
                    {openId === line.id ? <Breakdown line={line} /> : null}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Advice orderId={line.orderId} />
                      <LineAction line={line} busy={holding === line.id} reasonReady={reasonReady} onHold={hold} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto border-t border-[#E9E3DD] md:block">
                <table className="w-full min-w-[920px] text-left text-[13px]">
                  <thead className="bg-[#FAF7F2] text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Order</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 text-right font-semibold">Customer paid</th>
                      <th className="px-3 py-3 text-right font-semibold">Razorpay fee</th>
                      <th className="px-3 py-3 text-right font-semibold">Commission</th>
                      <th className="px-3 py-3 text-right font-semibold">Net</th>
                      <th className="px-3 py-3 font-semibold">Payment advice</th>
                      <th className="px-4 py-3 text-right font-semibold"><span className="sr-only">Hold or release</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9E3DD]">
                    {visible.map((line) => (
                      <React.Fragment key={line.id}>
                        <tr>
                          <td className="px-4 py-3">
                            <button type="button" aria-expanded={openId === line.id} onClick={() => setOpenId(openId === line.id ? null : line.id)} className={cn('font-semibold text-[#1C1C1C]', focusRing)}>
                              {line.order.orderNumber}
                            </button>
                          </td>
                          <td className="px-3 py-3"><StatusPill tone={toneFor(line.status)}>{STATUS_LABEL[line.status] ?? line.status}</StatusPill></td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{inr(line.collectedAmount)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{cutFee(line)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{cutCommission(line)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{cutNet(line)}</td>
                          <td className="px-3 py-3"><Advice orderId={line.orderId} /></td>
                          <td className="px-4 py-3 text-right"><LineAction line={line} busy={holding === line.id} reasonReady={reasonReady} onHold={hold} /></td>
                        </tr>
                        {openId === line.id ? (
                          <tr>
                            <td colSpan={8} className="bg-[#FAF7F2] px-4 py-3"><Breakdown line={line} /></td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="border-t border-[#E9E3DD] px-4 py-3 text-[13px] leading-5 text-[#667085]">{footnote(data.lines)}</p>
        </section>
      ) : null}

      {tab === 'history' ? (
        <section role="tabpanel" id="panel-history" aria-labelledby="tab-history" className="rounded-xl border border-[#E9E3DD] bg-white px-4 py-4">
          <h2 className="text-[15px] font-semibold">Commission history</h2>
          {data.agreements.length === 0 ? <p className="mt-2 text-[13px] text-[#667085]">No rate has been set. A blank rate is not 0%.</p> : (
            <ul className="mt-3 divide-y divide-[#E9E3DD] text-[13px]">
              {data.agreements.map((row) => (
                <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <p className="font-semibold tabular-nums">{row.ratePct}%</p>
                  <p className="text-[#667085]">
                    {new Date(row.effectiveFrom).toLocaleDateString('en-IN')}
                    {row.effectiveTo ? ` – ${new Date(row.effectiveTo).toLocaleDateString('en-IN')}` : ' · current'}
                    {' · '}{row.reason}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'recoveries' ? (
        <section role="tabpanel" id="panel-recoveries" aria-labelledby="tab-recoveries" className="rounded-xl border border-[#E9E3DD] bg-white px-4 py-4">
          <h2 className="text-[15px] font-semibold">Recoveries</h2>
          <p className="mt-1 text-[13px] leading-5 text-[#667085]">A refund after a payment is locked is listed here. The paid batch is not rewritten.</p>
          {data.recoveries.length === 0 ? <p className="mt-3 text-[13px] text-[#667085]">No recoveries.</p> : (
            <ul className="mt-3 divide-y divide-[#E9E3DD] text-[13px]">
              {data.recoveries.map((row) => (
                <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <p className="font-semibold tabular-nums">{inr(row.amount)}</p>
                  <p className="text-[#667085]">{row.appliedBatchId ? 'Applied to a later draft' : 'Open'}{row.reason ? ` · ${row.reason}` : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'settlements' ? (
        <section role="tabpanel" id="panel-settlements" aria-labelledby="tab-settlements" className="overflow-hidden rounded-xl border border-[#E9E3DD] bg-white">
          {batches.length === 0 ? <p className="px-4 py-8 text-[14px] text-[#667085]">No settlements yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="bg-[#FAF7F2] text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Settlement</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 text-right font-semibold">Orders</th>
                    <th className="px-3 py-3 text-right font-semibold">Net</th>
                    <th className="px-4 py-3 font-semibold">Bank reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E3DD]">
                  {batches.map((batch) => (
                    <tr key={batch.id}>
                      <td className="px-4 py-3 font-semibold">{batch.batchNumber}</td>
                      <td className="px-3 py-3"><StatusPill tone={batch.status === 'settled' ? 'paid' : 'muted'}>{batch.status}</StatusPill></td>
                      <td className="px-3 py-3 text-right tabular-nums">{batch.orderCount}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{inr(batch.netAmount)}</td>
                      <td className="px-4 py-3 text-[#667085]">{batch.bankReference || '—'}</td>
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

function Quiet({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[#E9E3DD] px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-l sm:first:border-l-0">
      <p className="text-[12px] font-medium text-[#667085]">{label}</p>
      <p className="mt-1 text-[clamp(1.05rem,1.2vw,1.3rem)] font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function OrderHead({ line, open, onToggle }: { line: Line; open: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <button type="button" aria-expanded={open} onClick={onToggle} className={cn('text-left font-semibold', focusRing)}>{line.order.orderNumber}</button>
      <StatusPill tone={toneFor(line.status)}>{STATUS_LABEL[line.status] ?? line.status}</StatusPill>
    </div>
  );
}

function Pair({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] text-[#667085]">{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'font-semibold' : 'font-medium')}>{value}</dd>
    </div>
  );
}

function Breakdown({ line }: { line: Line }) {
  const rate = line.breakdown?.ratePct;
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] md:mt-0 md:grid-cols-4">
      <Pair label="Commercial base" value={inr(line.commercialBase ?? 0)} />
      <Pair label="Recognised" value={inr(line.recognisedBase ?? 0)} />
      <Pair label="Rate" value={rate == null ? 'No rate' : `${rate}%`} />
      <Pair label="Above cash" value={inr(line.aboveCash)} />
      {money(line.provisionalBase) > 0 ? <p className="col-span-2 text-[12px] leading-5 text-[#667085] md:col-span-4">Captured {inr(line.provisionalBase)}. Not payable until the order is delivered.</p> : null}
      {money(line.blockedSale) > 0 ? <p className="col-span-2 text-[12px] leading-5 text-[#667085] md:col-span-4">No commission rate, so {inr(line.blockedSale)} stays unpaid.</p> : null}
    </dl>
  );
}

function Advice({ orderId }: { orderId: string }) {
  return <a className={cn('text-[13px] font-semibold text-[#6B1D2E]', focusRing)} href={`/api/v1/admin/finance/payables/orders/${orderId}/payment-invoice`}>Payment advice</a>;
}

function LineAction({ line, busy, reasonReady, onHold }: { line: Line; busy: boolean; reasonReady: boolean; onHold: (id: string, action: 'hold' | 'release') => void }) {
  if (line.status === 'eligible') {
    return (
      <button
        type="button"
        disabled={busy || !reasonReady}
        title={reasonReady ? undefined : 'A hold needs a reason of at least 8 characters'}
        onClick={() => void onHold(line.id, 'hold')}
        className={cn('h-10 rounded-lg border border-[#6B1D2E] px-3 text-[12px] font-semibold text-[#6B1D2E] disabled:cursor-not-allowed disabled:border-[#E9E3DD] disabled:text-[#6B7280]', focusRing)}
      >
        {busy ? 'Saving…' : 'Hold'}
      </button>
    );
  }
  if (line.status === 'on_hold') {
    return (
      <button type="button" disabled={busy} onClick={() => void onHold(line.id, 'release')} className={cn('h-10 rounded-lg border border-[#E9E3DD] px-3 text-[12px] font-semibold disabled:opacity-50', focusRing)}>
        {busy ? 'Saving…' : 'Release'}
      </button>
    );
  }
  return <span className="text-[12px] text-[#667085]">{line.status === 'settled' || line.status === 'in_batch' ? 'Locked' : '—'}</span>;
}
