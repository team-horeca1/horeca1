'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

function inr(value: string | number | { toString(): string }): string {
  const n = Number(typeof value === 'object' ? value.toString() : value);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}

type Line = {
  id: string;
  orderId: string;
  status: string;
  collectedAmount: string;
  commissionAmount: string;
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

type Detail = {
  vendor: { id: string; businessName: string; displayName: string | null; vendorCode: string | null; platformFeePct: string | null; settlementCycle: 'manual' | 'weekly' };
  lines: Line[];
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

export function SupplierPayableDetail({ vendorId }: { vendorId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [reason, setReason] = useState('');

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
    await fetch(`/api/v1/admin/finance/payables/lines/${lineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    });
    await load();
  }

  async function setCycle(settlementCycle: 'manual' | 'weekly') {
    await fetch(`/api/v1/admin/finance/payables/${vendorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settlementCycle }),
    });
    await load();
  }

  if (error) return <p role="alert" className="text-[#DC2626]">{error}</p>;
  if (!data) return <div className="flex items-center gap-2 py-16 text-[#6B1D2E]"><Loader2 className="animate-spin" size={18} /> Loading supplier</div>;

  const name = data.vendor.displayName?.trim() || data.vendor.businessName;
  const visible = data.lines.filter((line) => line.order.orderNumber.toLowerCase().includes(q.toLowerCase()) || line.status.includes(q.toLowerCase()));

  return (
    <div className="space-y-6 pb-8 text-[#1C1C1C]">
      <Link href="/admin/finance" className="text-[14px] font-semibold text-[#6B1D2E]">Back to Pay suppliers</Link>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[clamp(1.5rem,2vw+0.5rem,2rem)] font-semibold tracking-tight">{name}</h1>
          <p className="mt-1 text-[14px] text-[#667085]">
            {data.vendor.vendorCode ? `${data.vendor.vendorCode} · ` : ''}
            {data.vendor.platformFeePct == null ? 'No rate' : `${data.vendor.platformFeePct}% commission`}
          </p>
        </div>
        <label className="text-[12px] text-[#667085]">Settlement cycle
          <select value={data.vendor.settlementCycle} onChange={(e) => void setCycle(e.target.value as 'manual' | 'weekly')} className="mt-1 block h-12 w-full rounded-xl border border-[#E9E3DD] bg-white px-3 text-[14px] text-[#1C1C1C] sm:w-56">
            <option value="manual">Manual</option>
            <option value="weekly">Weekly draft only</option>
          </select>
        </label>
      </header>
      <p className="text-[13px] text-[#667085]">Weekly only prepares a draft. It does not transfer money.</p>

      <section className="overflow-hidden rounded-xl border border-[#E9E3DD] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#E9E3DD] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[15px] font-semibold">Orders</h2>
          <a className="text-[13px] font-semibold text-[#6B1D2E]" href={`/api/v1/admin/finance/payables/${vendorId}/statement`}>Download CSV</a>
        </div>
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row">
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" placeholder="Order or status" className="h-12 w-full rounded-xl border border-[#E9E3DD] px-3 text-[14px] sm:max-w-xs" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Hold reason" placeholder="Hold reason" className="h-12 w-full rounded-xl border border-[#E9E3DD] px-3 text-[14px] sm:max-w-sm" />
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-8 text-[14px] text-[#667085]">No orders for this supplier.</p>
        ) : (
          <>
            <ul className="divide-y divide-[#E9E3DD] border-t border-[#E9E3DD] md:hidden">
              {visible.map((line) => (
                <li key={line.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{line.order.orderNumber}</p>
                      <p className="text-[12px] text-[#667085]">{STATUS_LABEL[line.status] ?? line.status}</p>
                    </div>
                    <a className="text-[13px] font-semibold text-[#6B1D2E]" href={`/api/v1/admin/finance/payables/orders/${line.orderId}/payment-invoice`}>Payment invoice</a>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                    <Money label="Customer paid" value={inr(line.collectedAmount)} />
                    <Money label="Razorpay cut" value={cutFee(line)} />
                    <Money label="Commission" value={cutCommission(line)} />
                    <Money label="Net" value={cutNet(line)} />
                  </dl>
                  <div className="mt-3"><LineAction line={line} onHold={hold} /></div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto border-t border-[#E9E3DD] md:block">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[#FAF7F2] text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Order</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 text-right font-semibold">Customer paid</th>
                    <th className="px-3 py-3 text-right font-semibold">Razorpay cut</th>
                    <th className="px-3 py-3 text-right font-semibold">Commission</th>
                    <th className="px-3 py-3 text-right font-semibold">Net</th>
                    <th className="px-3 py-3 font-semibold">Payment invoice</th>
                    <th className="px-4 py-3"><span className="sr-only">Hold or release</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E3DD]">
                  {visible.map((line) => (
                    <tr key={line.id}>
                      <td className="px-4 py-3 font-semibold">{line.order.orderNumber}</td>
                      <td className="px-3 py-3 text-[#667085]">{STATUS_LABEL[line.status] ?? line.status}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{inr(line.collectedAmount)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{cutFee(line)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{cutCommission(line)}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{cutNet(line)}</td>
                      <td className="px-3 py-3">
                        <a className="font-semibold text-[#6B1D2E]" href={`/api/v1/admin/finance/payables/orders/${line.orderId}/payment-invoice`}>Payment invoice</a>
                      </td>
                      <td className="px-4 py-3 text-right"><LineAction line={line} onHold={hold} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="border-t border-[#E9E3DD] px-4 py-3 text-[13px] leading-5 text-[#667085]">{footnote(data.lines)}</p>
      </section>

      <section className="rounded-xl border border-[#E9E3DD] bg-white px-4 py-3">
        <h2 className="text-[14px] font-semibold">Commission history</h2>
        {data.agreements.length === 0 ? <p className="mt-2 text-[13px] text-[#667085]">No rate has been set. A blank rate is not 0%.</p> : (
          <ul className="mt-2 space-y-1 text-[13px]">
            {data.agreements.map((row) => (
              <li key={row.id}>
                {row.ratePct}% from {new Date(row.effectiveFrom).toLocaleDateString('en-IN')}
                {row.effectiveTo ? ` until ${new Date(row.effectiveTo).toLocaleDateString('en-IN')}` : ' (current)'}
                {' — '}{row.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-[#E9E3DD] bg-white px-4 py-3">
        <h2 className="text-[14px] font-semibold">Recoveries</h2>
        <p className="mt-1 text-[13px] text-[#667085]">A refund after a payment is locked is listed here. The paid batch is not rewritten.</p>
        {data.recoveries.length === 0 ? <p className="mt-2 text-[13px] text-[#667085]">No recoveries.</p> : (
          <ul className="mt-2 space-y-1 text-[13px]">
            {data.recoveries.map((row) => (
              <li key={row.id}>{inr(row.amount)} · {row.appliedBatchId ? 'Applied to a later draft' : 'Open'} · {row.reason}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function footnote(lines: Line[]): string {
  const parts = [
    'Commission uses the tax-inclusive subtotal. That is a Phase 1 assumption, not a tax ruling.',
    'Supplier promotions and coupons are not deducted from the supplier.',
  ];
  if (lines.some((line) => Number(line.provisionalBase) > 0)) {
    parts.push('A captured amount is not payable until the order is delivered.');
  }
  if (lines.some((line) => Number(line.blockedSale) > 0)) {
    parts.push('Orders without a commission rate stay unpaid.');
  }
  if (lines.some((line) => Number(line.aboveCash) > 0)) {
    parts.push('Amount above the cash collected is not booked.');
  }
  return parts.join(' ');
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

function Money({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-[#667085]">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function LineAction({ line, onHold }: { line: Line; onHold: (id: string, action: 'hold' | 'release') => void }) {
  if (line.status === 'eligible') {
    return <button type="button" onClick={() => void onHold(line.id, 'hold')} className="h-10 rounded-lg border border-[#6B1D2E] px-3 text-[12px] font-semibold text-[#6B1D2E]">Hold</button>;
  }
  if (line.status === 'on_hold') {
    return <button type="button" onClick={() => void onHold(line.id, 'release')} className="h-10 rounded-lg border border-[#E9E3DD] px-3 text-[12px] font-semibold">Release</button>;
  }
  return null;
}
