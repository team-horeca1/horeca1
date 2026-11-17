'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

type Kpis = {
  outstanding: string;
  eligible: string;
  pendingCapture: string;
  awaitingCompletion: string;
  commission: string;
  settledPeriod: string;
  onHold: string;
  blockedSale: string;
};

type Row = {
  vendorId: string;
  supplier: string;
  supplierCode: string | null;
  ratePct: string | null;
  outstanding: string;
  eligible: string;
  onHold: string;
  settled: string;
  eligibleSale: string;
  commission: string;
  adjustments: string;
  latestSettlement: string | null;
  unconfigured: boolean;
  settlementCycle: string;
};

type Batch = {
  id: string;
  batchNumber: string;
  vendorId: string;
  status: string;
  net: string;
  commission: string;
  adjustment: string;
  orderCount: number;
  bankReference: string | null;
  createdById: string;
  finalisedById: string | null;
};

function inr(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}

const KPI: Array<{ key: keyof Kpis; label: string; hint: string }> = [
  { key: 'outstanding', label: 'Total supplier outstanding', hint: 'Eligible, on hold, and in open batches. A draft does not remove it.' },
  { key: 'eligible', label: 'Eligible for settlement', hint: 'Can be added to a new batch.' },
  { key: 'pendingCapture', label: 'Pending capture', hint: 'Sale value with no cash payment yet.' },
  { key: 'awaitingCompletion', label: 'Awaiting completion', hint: 'Cash captured. Order is not delivered, so commission is not recognised.' },
  { key: 'commission', label: 'Commission', hint: 'Recognised on delivered orders. Calculated on the tax-inclusive subtotal.' },
  { key: 'settledPeriod', label: 'Settled in period', hint: 'Batches marked settled in the selected dates.' },
  { key: 'onHold', label: 'On hold', hint: 'Withheld from a new batch.' },
];

export function PayablesDashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [commission, setCommission] = useState('');
  const [sort, setSort] = useState('outstanding');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [utr, setUtr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), sort });
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (commission) params.set('commission', commission);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    try {
      const res = await fetch(`/api/v1/admin/finance/payables?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Could not load supplier payables');
      setKpis(json.data.kpis);
      setRows(json.data.rows);
      setBatches(json.data.batches ?? []);
      setTotal(json.data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load supplier payables');
    } finally {
      setLoading(false);
    }
  }, [page, q, status, commission, sort, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  async function batchAction(id: string, action: 'cancel' | 'finalise' | 'settle') {
    setBusy(id + action);
    try {
      const res = await fetch(`/api/v1/admin/finance/payables/batches/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reason: action === 'cancel' ? 'Draft cancelled by finance operator' : undefined,
          utr: utr[id],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Action failed');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy('');
    }
  }

  async function createDraft(vendorId: string) {
    setBusy(vendorId);
    try {
      const res = await fetch('/api/v1/admin/finance/payables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, idempotencyKey: `manual:${vendorId}:${Date.now()}` }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Could not create a draft');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a draft');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-16 text-[#1C1C1C]">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-tight text-[#6B1D2E]">Supplier Payables</h1>
        <p className="max-w-3xl text-[14px] leading-6 text-[#667085]">
          What Horeca1 owes each supplier after that supplier&apos;s commission. Outstanding includes drafts and finalised batches until a UTR is recorded. The UTR is the operator&apos;s record. This screen does not verify it with a bank.
        </p>
      </header>

      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setPage(1); void load(); }}>
        <label className="text-[12px] text-[#667085]">From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block h-12 rounded-lg border border-[#E9E3DD] bg-white px-3" />
        </label>
        <label className="text-[12px] text-[#667085]">To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block h-12 rounded-lg border border-[#E9E3DD] bg-white px-3" />
        </label>
        <p className="text-[12px] text-[#667085] max-w-sm">Dates filter commission and settled amounts. Outstanding is the balance now.</p>
      </form>

      {loading && !kpis ? (
        <div className="flex items-center gap-2 py-16 text-[#6B1D2E]"><Loader2 className="animate-spin" size={18} /> Loading payables</div>
      ) : null}
      {error ? <p role="alert" className="rounded-lg border border-[#DC2626]/30 bg-white px-4 py-3 text-[14px] text-[#DC2626]">{error}</p> : null}

      {kpis ? (
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {KPI.map((item) => (
            <article key={item.key} className="rounded-xl border border-[#E9E3DD] bg-white p-4">
              <p className="text-[12px] font-medium text-[#667085]">{item.label}</p>
              <p className="mt-2 text-[clamp(1.1rem,1vw+0.8rem,1.45rem)] font-semibold tabular-nums text-[#1C1C1C]">{inr(kpis[item.key])}</p>
              <p className="mt-2 text-[12px] leading-5 text-[#667085]">{item.hint}</p>
            </article>
          ))}
          <article className="rounded-xl border border-[#E9E3DD] bg-[#F8E8EC] p-4">
            <p className="text-[12px] font-medium text-[#6B1D2E]">Commission not configured</p>
            <p className="mt-2 text-[clamp(1.1rem,1vw+0.8rem,1.45rem)] font-semibold tabular-nums">{inr(kpis.blockedSale)}</p>
            <p className="mt-2 text-[12px] leading-5 text-[#6B1D2E]">Blocked sale value. It is not treated as 0% and it is not in outstanding.</p>
          </article>
        </section>
      ) : null}

      <section className="rounded-xl border border-[#E9E3DD] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#E9E3DD] p-4 lg:flex-row lg:items-center">
          <label className="flex-1 text-[12px] text-[#667085]">Search supplier
            <input value={q} onChange={(e) => setQ(e.target.value)} className="mt-1 h-12 w-full rounded-lg border border-[#E9E3DD] px-3 text-[14px] text-[#1C1C1C]" placeholder="Name or code" />
          </label>
          <label className="text-[12px] text-[#667085]">Status
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="mt-1 block h-12 rounded-lg border border-[#E9E3DD] bg-white px-3">
              <option value="">All</option>
              <option value="outstanding">Outstanding</option>
              <option value="eligible">Eligible</option>
              <option value="on_hold">On hold</option>
              <option value="settled">Settled</option>
            </select>
          </label>
          <label className="text-[12px] text-[#667085]">Commission
            <select value={commission} onChange={(e) => { setCommission(e.target.value); setPage(1); }} className="mt-1 block h-12 rounded-lg border border-[#E9E3DD] bg-white px-3">
              <option value="">All</option>
              <option value="configured">Configured</option>
              <option value="zero">Explicit 0%</option>
              <option value="unconfigured">Not configured</option>
            </select>
          </label>
          <label className="text-[12px] text-[#667085]">Sort
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="mt-1 block h-12 rounded-lg border border-[#E9E3DD] bg-white px-3">
              <option value="outstanding">Outstanding</option>
              <option value="-outstanding">Outstanding, low first</option>
              <option value="eligible">Eligible</option>
              <option value="commission">Commission</option>
              <option value="supplier">Name</option>
            </select>
          </label>
          <button type="button" onClick={() => { setPage(1); void load(); }} className="h-12 rounded-lg bg-[#6B1D2E] px-4 text-[14px] font-semibold text-white">Apply</button>
        </div>

        {rows.length === 0 && !loading ? (
          <p className="px-4 py-12 text-[14px] text-[#667085]">No suppliers match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[960px] w-full text-left text-[13px]">
              <thead className="bg-[#FAF7F2] text-[12px] text-[#667085]">
                <tr>
                  {['Supplier', 'Eligible sale', 'Rate', 'Commission', 'Outstanding', 'Eligible', 'On hold', 'Settled', ''].map((heading) => (
                    <th key={heading} className="px-3 py-3 font-medium">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.vendorId} className="border-t border-[#E9E3DD]">
                    <td className="px-3 py-3">
                      <Link href={`/admin/finance/payables/${row.vendorId}`} className="font-semibold text-[#6B1D2E]">{row.supplier}</Link>
                      <div className="text-[12px] text-[#667085]">{row.supplierCode ?? 'No code'} · {row.settlementCycle}</div>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{inr(row.eligibleSale)}</td>
                    <td className="px-3 py-3">{row.ratePct == null ? <span className="rounded bg-[#F8E8EC] px-2 py-1 text-[12px] text-[#6B1D2E]">Commission not configured</span> : `${row.ratePct}%`}</td>
                    <td className="px-3 py-3 tabular-nums">{inr(row.commission)}</td>
                    <td className="px-3 py-3 tabular-nums font-semibold">{inr(row.outstanding)}</td>
                    <td className="px-3 py-3 tabular-nums text-[#16A34A]">{inr(row.eligible)}</td>
                    <td className="px-3 py-3 tabular-nums">{inr(row.onHold)}</td>
                    <td className="px-3 py-3 tabular-nums text-[#667085]">{inr(row.settled)}</td>
                    <td className="px-3 py-3">
                      <button type="button" disabled={busy === row.vendorId || row.eligible === '0.00'} onClick={() => void createDraft(row.vendorId)} className="h-10 rounded-lg border border-[#6B1D2E] px-3 text-[12px] font-semibold text-[#6B1D2E] disabled:opacity-40">Draft batch</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-3 text-[13px] text-[#667085]">
          <span>{total} suppliers</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="h-10 rounded-lg border border-[#E9E3DD] px-3 disabled:opacity-40">Previous</button>
            <button type="button" disabled={page * 20 >= total} onClick={() => setPage((n) => n + 1)} className="h-10 rounded-lg border border-[#E9E3DD] px-3 disabled:opacity-40">Next</button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[#E9E3DD] bg-white p-4">
        <h2 className="text-[16px] font-semibold text-[#6B1D2E]">Settlement batches</h2>
        <p className="mt-1 text-[13px] text-[#667085]">A draft moves no money. Finalising locks it. Marking settled stores the UTR you type. It does not check the bank.</p>
        {batches.length === 0 ? <p className="py-8 text-[14px] text-[#667085]">No finance batches yet.</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[880px] w-full text-left text-[13px]">
              <thead className="text-[12px] text-[#667085]">
                <tr>{['Batch', 'Orders', 'Commission', 'Adjustment', 'Payable', 'Status', 'UTR', ''].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id} className="border-t border-[#E9E3DD]">
                    <td className="px-2 py-3 font-medium">{batch.batchNumber}</td>
                    <td className="px-2 py-3">{batch.orderCount}</td>
                    <td className="px-2 py-3 tabular-nums">{inr(batch.commission)}</td>
                    <td className="px-2 py-3 tabular-nums">{inr(batch.adjustment)}</td>
                    <td className="px-2 py-3 tabular-nums font-semibold">{inr(batch.net)}</td>
                    <td className="px-2 py-3">{batch.status}</td>
                    <td className="px-2 py-3">
                      {batch.status === 'finalised' ? (
                        <input aria-label={`UTR for ${batch.batchNumber}`} value={utr[batch.id] ?? ''} onChange={(e) => setUtr((current) => ({ ...current, [batch.id]: e.target.value }))} className="h-10 w-36 rounded-lg border border-[#E9E3DD] px-2" placeholder="UTR" />
                      ) : (batch.bankReference ?? '—')}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap gap-2">
                        {batch.status === 'draft' ? <button type="button" onClick={() => void batchAction(batch.id, 'cancel')} className="h-10 rounded-lg border px-3">Cancel draft</button> : null}
                        {batch.status === 'draft' ? <button type="button" onClick={() => void batchAction(batch.id, 'finalise')} className="h-10 rounded-lg bg-[#6B1D2E] px-3 text-white">Finalise</button> : null}
                        {batch.status === 'finalised' ? <button type="button" onClick={() => void batchAction(batch.id, 'settle')} className="h-10 rounded-lg bg-[#6B1D2E] px-3 text-white">Mark settled</button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
