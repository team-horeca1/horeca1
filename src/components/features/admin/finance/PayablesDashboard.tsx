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
  commission: string;
  unconfigured: boolean;
};

type Batch = {
  id: string;
  batchNumber: string;
  vendorId: string;
  status: string;
  net: string;
  orderCount: number;
  bankReference: string | null;
};

function inr(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}

function money(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const BATCH_LABEL: Record<string, { title: string; next: string }> = {
  draft: { title: 'Not checked yet', next: 'Someone else must check this before you pay.' },
  in_review: { title: 'Being checked', next: 'Wait for the check to finish.' },
  finalised: { title: 'Checked. Ready to record the payment.', next: 'Type the bank reference after you send the money.' },
  settled: { title: 'Paid', next: 'The bank reference is saved. We do not call the bank to check it.' },
  cancelled: { title: 'Cancelled', next: 'These orders can be paid in a new list.' },
};

export function PayablesDashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [utr, setUtr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), sort: 'outstanding' });
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    try {
      const res = await fetch(`/api/v1/admin/finance/payables?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Could not load this page');
      setKpis(json.data.kpis);
      setRows(json.data.rows);
      setBatches(json.data.batches ?? []);
      setTotal(json.data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this page');
    } finally {
      setLoading(false);
    }
  }, [page, q, status]);

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
          reason: action === 'cancel' ? 'Payment list cancelled before it was checked' : undefined,
          utr: utr[id],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'That step did not save');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That step did not save');
    } finally {
      setBusy('');
    }
  }

  async function preparePayment(vendorId: string) {
    setBusy(vendorId);
    try {
      const res = await fetch('/api/v1/admin/finance/payables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, idempotencyKey: `manual:${vendorId}:${Date.now()}` }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Could not prepare the payment');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare the payment');
    } finally {
      setBusy('');
    }
  }

  const openPayments = batches.filter((batch) => batch.status !== 'settled' && batch.status !== 'cancelled');

  return (
    <div className="mx-auto max-w-[1100px] space-y-8 pb-16 text-[#1C1C1C]">
      <header className="space-y-3">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6B1D2E]">Finance</p>
        <h1 className="text-[clamp(1.75rem,2vw+1rem,2.25rem)] font-semibold tracking-tight">Pay suppliers</h1>
        <p className="max-w-2xl text-[16px] leading-7 text-[#3F3F46]">
          A supplier sells through Horeca1. The customer pays. When the order is delivered, we keep our commission and pay the supplier the rest.
        </p>
      </header>

      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          ['1', 'See what we owe', 'The big number is the money still unpaid to suppliers.'],
          ['2', 'Pay only what is ready', 'Ready means the customer paid and the order was delivered.'],
          ['3', 'Record the bank payment', 'Someone else checks the list. Then you type the bank reference. We do not call the bank.'],
        ].map(([step, title, body]) => (
          <li key={step} className="rounded-2xl border border-[#E9E3DD] bg-white p-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F8E8EC] text-[14px] font-semibold text-[#6B1D2E]">{step}</span>
            <p className="mt-3 font-semibold">{title}</p>
            <p className="mt-1 text-[14px] leading-6 text-[#667085]">{body}</p>
          </li>
        ))}
      </ol>

      {loading && !kpis ? (
        <div className="flex items-center gap-2 py-10 text-[#6B1D2E]"><Loader2 className="animate-spin" size={18} /> Loading</div>
      ) : null}
      {error ? <p role="alert" className="rounded-xl border border-[#DC2626]/30 bg-white px-4 py-3 text-[14px] text-[#DC2626]">{error}</p> : null}

      {kpis ? (
        <section className="rounded-2xl border border-[#E9E3DD] bg-white p-5 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-[14px] text-[#667085]">We still owe suppliers</p>
              <p className="mt-1 text-[clamp(2rem,4vw,3rem)] font-semibold tabular-nums leading-none">{inr(kpis.outstanding)}</p>
              <p className="mt-3 max-w-md text-[14px] leading-6 text-[#667085]">
                This stays here until the bank reference is saved. Preparing a payment does not make it disappear.
              </p>
            </div>
            <div className="rounded-xl bg-[#F8E8EC] p-4">
              <p className="text-[14px] font-medium text-[#6B1D2E]">Ready to pay now</p>
              <p className="mt-1 text-[clamp(1.5rem,3vw,2rem)] font-semibold tabular-nums text-[#6B1D2E]">{inr(kpis.eligible)}</p>
              <p className="mt-2 text-[14px] leading-6 text-[#6B1D2E]">Only this amount can go into a new payment.</p>
            </div>
          </div>
          <ul className="mt-6 divide-y divide-[#E9E3DD] border-t border-[#E9E3DD] text-[14px]">
            <li className="flex items-start justify-between gap-4 py-3">
              <span>Customer has not paid yet</span>
              <span className="shrink-0 tabular-nums font-medium">{inr(kpis.pendingCapture)}</span>
            </li>
            <li className="flex items-start justify-between gap-4 py-3">
              <span>Customer paid, order not delivered yet</span>
              <span className="shrink-0 tabular-nums font-medium">{inr(kpis.awaitingCompletion)}</span>
            </li>
            <li className="flex items-start justify-between gap-4 py-3">
              <span>Paused on purpose</span>
              <span className="shrink-0 tabular-nums font-medium">{inr(kpis.onHold)}</span>
            </li>
            <li className="flex items-start justify-between gap-4 py-3">
              <span>Commission rate missing, so we will not guess</span>
              <span className="shrink-0 tabular-nums font-medium">{inr(kpis.blockedSale)}</span>
            </li>
            <li className="flex items-start justify-between gap-4 py-3">
              <span>Our commission kept on delivered orders</span>
              <span className="shrink-0 tabular-nums font-medium">{inr(kpis.commission)}</span>
            </li>
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-[20px] font-semibold">Suppliers</h2>
          <p className="mt-1 text-[14px] text-[#667085]">Open a name to see which orders make up the amount.</p>
        </div>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setPage(1); void load(); }}>
          <label className="flex-1 text-[13px] text-[#667085]">Find a supplier
            <input aria-label="Search supplier" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or code" className="mt-1 h-12 w-full rounded-xl border border-[#E9E3DD] bg-white px-3 text-[15px] text-[#1C1C1C]" />
          </label>
          <label className="text-[13px] text-[#667085]">Show
            <select aria-label="Show" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="mt-1 block h-12 rounded-xl border border-[#E9E3DD] bg-white px-3">
              <option value="">Everyone</option>
              <option value="outstanding">We still owe them</option>
              <option value="eligible">Ready to pay</option>
              <option value="on_hold">Paused</option>
              <option value="settled">Already paid</option>
            </select>
          </label>
          <button type="submit" className="h-12 self-end rounded-xl bg-[#6B1D2E] px-5 text-[15px] font-semibold text-white">Apply</button>
        </form>

        {rows.length === 0 && !loading ? (
          <p className="rounded-2xl border border-[#E9E3DD] bg-white px-4 py-10 text-[15px] text-[#667085]">No suppliers match these filters.</p>
        ) : (
          <ul className="divide-y divide-[#E9E3DD] overflow-hidden rounded-2xl border border-[#E9E3DD] bg-white">
            {rows.map((row) => {
              const ready = money(row.eligible) > 0;
              const owes = money(row.outstanding) > 0;
              return (
                <li key={row.vendorId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/admin/finance/payables/${row.vendorId}`} className="text-[16px] font-semibold text-[#6B1D2E]">{row.supplier}</Link>
                    <p className="mt-1 text-[13px] text-[#667085]">
                      {row.ratePct == null ? 'Commission not set' : `Our commission is ${row.ratePct}%`}
                      {row.supplierCode ? ` · ${row.supplierCode}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-x-6 gap-y-2 sm:justify-end">
                    <div>
                      <p className="text-[12px] text-[#667085]">We owe</p>
                      <p className="text-[16px] font-semibold tabular-nums">{owes ? inr(row.outstanding) : 'Nothing'}</p>
                    </div>
                    <div>
                      <p className="text-[12px] text-[#667085]">Ready to pay</p>
                      <p className="text-[16px] font-semibold tabular-nums text-[#166534]">{ready ? inr(row.eligible) : 'Not yet'}</p>
                    </div>
                    <button
                      type="button"
                      disabled={!ready || busy === row.vendorId}
                      onClick={() => void preparePayment(row.vendorId)}
                      className="h-11 rounded-xl bg-[#6B1D2E] px-4 text-[14px] font-semibold text-white disabled:bg-[#E9E3DD] disabled:text-[#667085]"
                    >
                      {busy === row.vendorId ? 'Preparing…' : 'Prepare payment'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex items-center justify-between text-[14px] text-[#667085]">
          <span>{total} suppliers</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="h-10 rounded-xl border border-[#E9E3DD] bg-white px-3 disabled:opacity-40">Previous</button>
            <button type="button" disabled={page * 20 >= total} onClick={() => setPage((n) => n + 1)} className="h-10 rounded-xl border border-[#E9E3DD] bg-white px-3 disabled:opacity-40">Next</button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-[20px] font-semibold">Payments being prepared</h2>
          <p className="mt-1 max-w-2xl text-[14px] leading-6 text-[#667085]">
            A prepared list is not a bank payment. Another person checks it. After the money is sent, type the reference from your bank. We do not verify it with a bank.
          </p>
        </div>
        {openPayments.length === 0 && !loading ? (
          <p className="rounded-2xl border border-[#E9E3DD] bg-white px-4 py-8 text-[15px] text-[#667085]">Nothing is waiting. Prepare a payment from a supplier who is ready.</p>
        ) : (
          <ul className="space-y-3">
            {openPayments.map((batch) => {
              const label = BATCH_LABEL[batch.status] ?? { title: batch.status, next: '' };
              return (
                <li key={batch.id} className="rounded-2xl border border-[#E9E3DD] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{label.title}</p>
                      <p className="mt-1 text-[13px] text-[#667085]">{batch.batchNumber} · {batch.orderCount} orders · {inr(batch.net)}</p>
                      <p className="mt-2 text-[14px] leading-6">{label.next}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    {batch.status === 'draft' ? (
                      <>
                        <button type="button" onClick={() => void batchAction(batch.id, 'finalise')} className="h-11 rounded-xl bg-[#6B1D2E] px-4 text-[14px] font-semibold text-white">Send for a check</button>
                        <button type="button" onClick={() => void batchAction(batch.id, 'cancel')} className="h-11 rounded-xl border border-[#E9E3DD] px-4 text-[14px]">Cancel this list</button>
                      </>
                    ) : null}
                    {batch.status === 'finalised' ? (
                      <>
                        <label className="text-[13px] text-[#667085]">Bank reference
                          <input aria-label={`Bank reference for ${batch.batchNumber}`} value={utr[batch.id] ?? ''} onChange={(e) => setUtr((current) => ({ ...current, [batch.id]: e.target.value }))} placeholder="From your bank" className="mt-1 h-11 w-full rounded-xl border border-[#E9E3DD] px-3 text-[15px] text-[#1C1C1C] sm:w-56" />
                        </label>
                        <button type="button" onClick={() => void batchAction(batch.id, 'settle')} className="h-11 rounded-xl bg-[#6B1D2E] px-4 text-[14px] font-semibold text-white sm:mt-5">I have sent the money</button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="border-t border-[#E9E3DD] pt-4 text-[14px] leading-6 text-[#667085]">
        Other records, not this payment list:{' '}
        <Link href="/admin/finance/payments" className="font-semibold text-[#6B1D2E]">customer payments</Link>
        {' · '}
        <Link href="/admin/ledger" className="font-semibold text-[#6B1D2E]">older supplier wallet</Link>
        {' · '}
        <Link href="/admin/reports" className="font-semibold text-[#6B1D2E]">sales reports</Link>
      </footer>
    </div>
  );
}
