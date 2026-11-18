'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

function inr(value: string | number | { toString(): string }): string {
  const n = Number(typeof value === 'object' ? value.toString() : value);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}

type Detail = {
  vendor: { id: string; businessName: string; displayName: string | null; vendorCode: string | null; platformFeePct: string | null; settlementCycle: 'manual' | 'weekly' };
  lines: Array<{
    id: string;
    orderId: string;
    status: string;
    commercialBase: string;
    collectedAmount: string;
    recognisedBase: string;
    commissionAmount: string;
    razorpayFee: string | null;
    razorpayFeeUnknown: boolean;
    netPayable: string;
    provisionalBase: string;
    blockedSale: string;
    aboveCash: string;
    breakdown: { ratePct?: string | null; supplierPromo?: string; supplierCoupon?: string; platformCoupon?: string; taxTreatment?: string; grossCollected?: string };
    order: { orderNumber: string; status: string; paymentStatus: string; paymentMethod: string | null };
  }>;
  batches: Array<{ id: string; batchNumber: string; status: string; netAmount: string; bankReference: string | null; orderCount: number }>;
  recoveries: Array<{ id: string; amount: string; reason: string | null; appliedBatchId: string | null; createdAt: string }>;
  agreements: Array<{ id: string; ratePct: string; effectiveFrom: string; effectiveTo: string | null; reason: string }>;
};

const STATUS_LABEL: Record<string, string> = {
  pending_capture: 'Pending capture',
  awaiting_completion: 'Captured — awaiting completion',
  commission_unconfigured: 'Commission not configured',
  fee_unknown: 'Razorpay fee not received',
  eligible: 'Eligible',
  on_hold: 'On hold',
  in_batch: 'In a batch',
  settled: 'Settled',
  closed: 'No supplier liability',
};

export function SupplierPayableDetail({ vendorId }: { vendorId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [reason, setReason] = useState('');

  async function load() {
    const res = await fetch(`/api/v1/admin/finance/payables/${vendorId}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error?.message ?? 'Could not load this supplier');
      return;
    }
    setData(json.data);
  }

  useEffect(() => {
    void load();
  }, [vendorId]);

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
    <div className="max-w-[1600px] mx-auto space-y-6 pb-16 text-[#1C1C1C]">
      <Link href="/admin/finance" className="text-[14px] font-semibold text-[#6B1D2E]">Back to Pay suppliers</Link>
      <header>
        <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold text-[#6B1D2E]">What we owe {name}</h1>
        <p className="mt-1 text-[15px] leading-6 text-[#667085]">{data.vendor.platformFeePct == null ? 'Set a commission before this supplier can be paid. Blank is not zero.' : `We keep ${data.vendor.platformFeePct}% and pay the rest.`}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] text-[#667085]">Settlement cycle
          <select value={data.vendor.settlementCycle} onChange={(e) => void setCycle(e.target.value as 'manual' | 'weekly')} className="mt-1 block h-12 w-full rounded-lg border border-[#E9E3DD] bg-white px-3 text-[14px]">
            <option value="manual">Manual</option>
            <option value="weekly">Weekly draft only</option>
          </select>
        </label>
        <div className="text-[13px] leading-6 text-[#667085]">
          Weekly scheduling prepares a draft. It does not transfer money. Commission on these lines uses the tax-inclusive subtotal. That treatment is waiting on client confirmation.
        </div>
      </section>

      <section className="rounded-xl border border-[#E9E3DD] bg-white p-4">
        <h2 className="font-semibold text-[#6B1D2E]">Commission history</h2>
        <ul className="mt-3 space-y-2 text-[13px]">
          {data.agreements.length === 0 ? <li>No rate has been configured. Unknown is not 0%.</li> : data.agreements.map((row) => (
            <li key={row.id}>{row.ratePct}% from {new Date(row.effectiveFrom).toLocaleDateString('en-IN')} {row.effectiveTo ? `until ${new Date(row.effectiveTo).toLocaleDateString('en-IN')}` : '(current)'} — {row.reason}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-[#E9E3DD] bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-[#6B1D2E]">Orders</h2>
          <a className="text-[13px] font-semibold text-[#6B1D2E]" href={`/api/v1/admin/finance/payables/${vendorId}/statement`}>Download CSV</a>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order or status" className="mt-3 h-12 w-full max-w-sm rounded-lg border border-[#E9E3DD] px-3" />
        <label className="mt-3 block text-[12px] text-[#667085]">Hold reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 h-12 w-full max-w-md rounded-lg border border-[#E9E3DD] px-3 text-[14px]" />
        </label>
        {visible.length === 0 ? <p className="py-8 text-[14px] text-[#667085]">No orders for this supplier.</p> : (
          <div className="mt-4 space-y-3">
            {visible.map((line) => (
              <article key={line.id} className="rounded-xl border border-[#E9E3DD] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{line.order.orderNumber} <a className="text-[13px] font-semibold text-[#6B1D2E]" href={`/api/v1/admin/orders/${line.orderId}/invoice`}>Invoice</a></h3>
                    <p className="text-[12px] text-[#667085]">Order {line.order.status} · payment {line.order.paymentStatus} · {line.order.paymentMethod ?? 'no method'}</p>
                  </div>
                  <span className="rounded-full bg-[#F8E8EC] px-3 py-1 text-[12px] font-semibold text-[#6B1D2E]">{STATUS_LABEL[line.status] ?? line.status}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px] md:grid-cols-4">
                  <div><dt className="text-[#667085]">Commercial base</dt><dd className="tabular-nums font-medium">{inr(line.commercialBase)}</dd></div>
                  <div><dt className="text-[#667085]">Customer paid</dt><dd className="tabular-nums font-medium">{inr(line.collectedAmount)}</dd></div>
                  <div><dt className="text-[#667085]">Razorpay cut</dt><dd className="tabular-nums font-medium">{line.razorpayFeeUnknown ? 'Razorpay fee not received' : inr(line.razorpayFee ?? 0)}</dd></div>
                  <div><dt className="text-[#667085]">Recognised base</dt><dd className="tabular-nums font-medium">{inr(line.recognisedBase)}</dd></div>
                  <div><dt className="text-[#667085]">Net payable</dt><dd className="tabular-nums font-semibold">{inr(line.netPayable)}</dd></div>
                </dl>
                <p className="mt-3 text-[13px] leading-6 text-[#667085]">
                  Rate {line.breakdown.ratePct == null ? 'not configured' : `${line.breakdown.ratePct}%`}.
                  Supplier promo {inr(line.breakdown.supplierPromo ?? 0)}, supplier coupon {inr(line.breakdown.supplierCoupon ?? 0)}, platform coupon {inr(line.breakdown.platformCoupon ?? 0)} shown separately and not deducted from the supplier.
                  Commission {inr(line.commissionAmount)}.
                  {Number(line.provisionalBase) > 0 ? ` Provisional captured base ${inr(line.provisionalBase)} is not payable until delivery.` : ''}
                  {Number(line.blockedSale) > 0 ? ` Blocked sale ${inr(line.blockedSale)} because commission is not configured.` : ''}
                  {Number(line.aboveCash) > 0 ? ` ${inr(line.aboveCash)} of the commercial base is above cash collected and is not booked.` : ''}
                  {' '}Commission uses the tax-inclusive subtotal. That is a Phase 1 assumption, not a tax ruling.
                </p>
                <div className="mt-3 flex gap-2">
                  {line.status === 'eligible' ? <button type="button" onClick={() => void hold(line.id, 'hold')} className="h-10 rounded-lg border border-[#6B1D2E] px-3 text-[12px] font-semibold text-[#6B1D2E]">Hold</button> : null}
                  {line.status === 'on_hold' ? <button type="button" onClick={() => void hold(line.id, 'release')} className="h-10 rounded-lg border px-3 text-[12px]">Release</button> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[#E9E3DD] bg-white p-4">
        <h2 className="font-semibold text-[#6B1D2E]">Recoveries</h2>
        <p className="mt-1 text-[13px] text-[#667085]">A refund after a batch is locked is appended here. The settled batch is not rewritten.</p>
        {data.recoveries.length === 0 ? <p className="py-6 text-[14px] text-[#667085]">No recoveries.</p> : (
          <ul className="mt-3 space-y-2 text-[13px]">
            {data.recoveries.map((row) => (
              <li key={row.id}>{inr(row.amount)} · {row.appliedBatchId ? 'Applied to a later draft' : 'Open'} · {row.reason}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
