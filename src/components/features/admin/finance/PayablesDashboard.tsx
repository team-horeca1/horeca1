'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

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

function money(value: string | undefined): number {
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
    const params = new URLSearchParams({ page: String(page), sort: '-outstanding' });
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

  const featured = rows.find((row) => money(row.eligible) > 0) ?? null;
  const openPayments = batches.filter((batch) => batch.status !== 'settled' && batch.status !== 'cancelled');
  const split = kpis
    ? [{
      name: 'Money',
      ready: money(kpis.eligible),
      unpaid: money(kpis.pendingCapture),
      delivering: money(kpis.awaitingCompletion),
      paused: money(kpis.onHold),
      missing: money(kpis.blockedSale),
    }]
    : [];
  const splitTotal = split[0]
    ? split[0].ready + split[0].unpaid + split[0].delivering + split[0].paused + split[0].missing
    : 0;

  return (
    <div className="mx-auto max-w-[1080px] space-y-8 pb-16 text-[#1C1C1C]">
      <header className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#6B1D2E]">Finance</p>
        <h1 className="mt-2 text-[clamp(2rem,3vw+1rem,2.75rem)] font-semibold tracking-[-0.03em]">Pay suppliers</h1>
        <p className="mt-2 max-w-xl text-[16px] leading-7 text-[#3F3F46]">
          The customer pays. The order is delivered. We keep our commission. What is left is what you pay the supplier.
        </p>
      </header>

      {loading && !kpis ? (
        <div className="flex items-center gap-2 py-16 text-[#6B1D2E]"><Loader2 className="animate-spin" size={18} /> Loading the ledger</div>
      ) : null}
      {error ? <p role="alert" className="rounded-2xl border border-[#DC2626]/30 bg-white px-4 py-3 text-[14px] text-[#DC2626]">{error}</p> : null}

      {kpis ? (
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-700 overflow-hidden rounded-[28px] bg-[#2A1218] text-[#FAF7F2] shadow-[0_24px_60px_-32px_rgba(42,18,24,0.7)]">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#E7C5CE]">We still owe suppliers</p>
              <p className="mt-3 font-semibold tabular-nums tracking-[-0.04em] text-[clamp(2.8rem,6vw,4.5rem)] leading-none">{inr(kpis.outstanding)}</p>
              <p className="mt-4 max-w-sm text-[14px] leading-6 text-[#E7C5CE]">
                This number stays until you save a bank reference. Preparing a payment does not clear it.
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
              <p className="text-[12px] uppercase tracking-[0.16em] text-[#E7C5CE]">Ready to pay now</p>
              <p className="mt-2 text-[clamp(1.8rem,3vw,2.4rem)] font-semibold tabular-nums">{inr(kpis.eligible)}</p>
              <p className="mt-2 text-[13px] leading-5 text-[#E7C5CE]">Customer paid. Order delivered. Commission already taken out.</p>
            </div>
          </div>

          {featured ? (
            <div className="mx-6 mb-6 grid gap-2 rounded-2xl bg-[#FAF7F2] p-4 text-[#1C1C1C] sm:mx-8 sm:grid-cols-[1.2fr_auto_auto_auto] sm:items-end">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6B1D2E]">Worked example</p>
                <p className="mt-1 text-[18px] font-semibold">{featured.supplier}</p>
                <p className="text-[13px] text-[#667085]">{featured.ratePct == null ? 'No commission set' : `${featured.ratePct}% commission`}</p>
              </div>
              <Figure label="Customer paid" value={inr(featured.eligibleSale)} />
              <Figure label="We keep" value={inr(featured.commission)} />
              <Figure label="Pay them" value={inr(featured.eligible)} strong />
            </div>
          ) : null}

          {splitTotal > 0 ? (
            <div className="border-t border-white/10 px-6 py-5 sm:px-8">
              <p className="mb-3 text-[12px] uppercase tracking-[0.14em] text-[#E7C5CE]">Where the money is</p>
              <div className="h-3 w-full">
                <ResponsiveContainer width="100%" height={12}>
                  <BarChart data={split} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide domain={[0, splitTotal]} />
                    <Tooltip
                      cursor={false}
                      formatter={(value, name) => [inr(Number(value ?? 0)), SPLIT_LABEL[String(name)] ?? String(name)]}
                      contentStyle={{ borderRadius: 12, border: '1px solid #E9E3DD', fontSize: 13 }}
                    />
                    <Bar dataKey="ready" stackId="m" fill="#F8E8EC" radius={[6, 0, 0, 6]} />
                    <Bar dataKey="unpaid" stackId="m" fill="#8D6E76" />
                    <Bar dataKey="delivering" stackId="m" fill="#C4A4AE" />
                    <Bar dataKey="paused" stackId="m" fill="#F59E0B" />
                    <Bar dataKey="missing" stackId="m" fill="#6B1D2E" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#E7C5CE]">
                <Legend dot="bg-[#F8E8EC]" label="Ready" value={kpis.eligible} />
                <Legend dot="bg-[#8D6E76]" label="Customer has not paid" value={kpis.pendingCapture} />
                <Legend dot="bg-[#C4A4AE]" label="Not delivered" value={kpis.awaitingCompletion} />
                <Legend dot="bg-[#F59E0B]" label="Paused" value={kpis.onHold} />
                <Legend dot="bg-[#6B1D2E]" label="No commission rate" value={kpis.blockedSale} />
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[20px] font-semibold tracking-tight">Suppliers</h2>
            <p className="text-[14px] text-[#667085]">Open a name to see the orders. Pay only the ones marked ready.</p>
          </div>
        </div>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setPage(1); void load(); }}>
          <label className="flex-1 text-[13px] text-[#667085]">Find a supplier
            <input aria-label="Search supplier" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or code" className="mt-1 h-12 w-full rounded-2xl border border-[#E9E3DD] bg-white px-4 text-[15px] text-[#1C1C1C] outline-none transition-[border-color,box-shadow] duration-200 ease-out focus:border-[#6B1D2E] focus:shadow-[0_0_0_4px_rgba(107,29,46,0.12)]" />
          </label>
          <label className="text-[13px] text-[#667085]">Show
            <select aria-label="Show" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="mt-1 block h-12 rounded-2xl border border-[#E9E3DD] bg-white px-3">
              <option value="">Everyone</option>
              <option value="outstanding">We still owe them</option>
              <option value="eligible">Ready to pay</option>
              <option value="on_hold">Paused</option>
              <option value="settled">Already paid</option>
            </select>
          </label>
          <button type="submit" className="h-12 self-end rounded-2xl bg-[#6B1D2E] px-5 text-[15px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98]">Apply</button>
        </form>

        {rows.length === 0 && !loading ? (
          <p className="rounded-[24px] border border-dashed border-[#E9E3DD] bg-white px-4 py-12 text-center text-[15px] text-[#667085]">No supplier matches. Clear the search to see everyone.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => {
              const ready = money(row.eligible) > 0;
              const queued = !ready && money(row.outstanding) > 0 && batches.some((batch) => batch.vendorId === row.vendorId && (batch.status === 'draft' || batch.status === 'in_review' || batch.status === 'finalised'));
              return (
                <li key={row.vendorId} className="group flex flex-col gap-4 rounded-[22px] border border-[#E9E3DD] bg-white p-4 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-28px_rgba(42,18,24,0.45)] sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/admin/finance/payables/${row.vendorId}`} className="text-[17px] font-semibold tracking-tight text-[#1C1C1C] underline-offset-4 hover:text-[#6B1D2E] hover:underline">{row.supplier}</Link>
                    <p className="mt-1 text-[13px] text-[#667085]">
                      {row.ratePct == null ? 'Commission not set — we will not guess a rate' : `We keep ${row.ratePct}%`}
                      {row.supplierCode ? ` · ${row.supplierCode}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <Stat label="We owe" value={money(row.outstanding) > 0 ? inr(row.outstanding) : 'Nothing'} />
                    <Stat label="Ready" value={ready ? inr(row.eligible) : queued ? 'In the list below' : 'Not yet'} tone={ready ? 'ready' : 'muted'} />
                    <button
                      type="button"
                      disabled={!ready || busy === row.vendorId}
                      onClick={() => void preparePayment(row.vendorId)}
                      className="h-11 rounded-full bg-[#6B1D2E] px-4 text-[14px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98] disabled:bg-[#EFEAE4] disabled:text-[#8A8178]"
                    >
                      {busy === row.vendorId ? 'Preparing…' : queued ? 'Already added' : 'Prepare payment'}
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
            <button type="button" disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="h-10 rounded-full border border-[#E9E3DD] bg-white px-4 disabled:opacity-40">Previous</button>
            <button type="button" disabled={page * 20 >= total} onClick={() => setPage((n) => n + 1)} className="h-10 rounded-full border border-[#E9E3DD] bg-white px-4 disabled:opacity-40">Next</button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[20px] font-semibold tracking-tight">Payments being prepared</h2>
        <p className="max-w-2xl text-[14px] leading-6 text-[#667085]">
          A list is not a bank transfer. Another person checks it. After you send the money, type the reference from your bank. We do not call the bank.
        </p>
        {openPayments.length === 0 && !loading ? (
          <p className="rounded-[22px] border border-[#E9E3DD] bg-white px-4 py-8 text-[15px] text-[#667085]">Nothing is waiting. Prepare a payment from a supplier marked ready.</p>
        ) : (
          <ul className="space-y-3">
            {openPayments.map((batch) => {
              const label = BATCH_LABEL[batch.status] ?? { title: batch.status, next: '' };
              return (
                <li key={batch.id} className="rounded-[22px] border border-[#E9E3DD] bg-white p-4">
                  <p className="font-semibold">{label.title}</p>
                  <p className="mt-1 text-[13px] text-[#667085]">{batch.batchNumber} · {batch.orderCount} orders · {inr(batch.net)}</p>
                  <p className="mt-2 text-[14px] leading-6">{label.next}</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                    {batch.status === 'draft' ? (
                      <>
                        <button type="button" onClick={() => void batchAction(batch.id, 'finalise')} className="h-11 rounded-full bg-[#6B1D2E] px-4 text-[14px] font-semibold text-white active:scale-[0.98]">Send for a check</button>
                        <button type="button" onClick={() => void batchAction(batch.id, 'cancel')} className="h-11 rounded-full border border-[#E9E3DD] px-4 text-[14px]">Cancel this list</button>
                      </>
                    ) : null}
                    {batch.status === 'finalised' ? (
                      <>
                        <label className="text-[13px] text-[#667085]">Bank reference
                          <input aria-label={`Bank reference for ${batch.batchNumber}`} value={utr[batch.id] ?? ''} onChange={(e) => setUtr((current) => ({ ...current, [batch.id]: e.target.value }))} placeholder="From your bank" className="mt-1 h-11 w-full rounded-2xl border border-[#E9E3DD] px-3 text-[15px] text-[#1C1C1C] sm:w-56" />
                        </label>
                        <button type="button" onClick={() => void batchAction(batch.id, 'settle')} className="h-11 rounded-full bg-[#6B1D2E] px-4 text-[14px] font-semibold text-white">I have sent the money</button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="border-t border-[#E9E3DD] pt-4 text-[14px] text-[#667085]">
        Other records:{' '}
        <Link href="/admin/finance/payments" className="font-semibold text-[#6B1D2E]">customer payments</Link>
        {' · '}
        <Link href="/admin/ledger" className="font-semibold text-[#6B1D2E]">older supplier wallet</Link>
        {' · '}
        <Link href="/admin/reports" className="font-semibold text-[#6B1D2E]">sales reports</Link>
      </footer>

    </div>
  );
}

const SPLIT_LABEL: Record<string, string> = {
  ready: 'Ready to pay',
  unpaid: 'Customer has not paid',
  delivering: 'Not delivered yet',
  paused: 'Paused',
  missing: 'No commission rate',
};

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[12px] text-[#667085]">{label}</p>
      <p className={`tabular-nums ${strong ? 'text-[20px] font-semibold text-[#6B1D2E]' : 'text-[16px] font-medium'}`}>{value}</p>
    </div>
  );
}

function Legend({ dot, label, value }: { dot: string; label: string; value: string }) {
  if (money(value) <= 0) return null;
  return (
    <li className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      {label} {inr(value)}
    </li>
  );
}

function Stat({ label, value, tone = 'ink' }: { label: string; value: string; tone?: 'ink' | 'ready' | 'muted' }) {
  const color = tone === 'ready' ? 'text-[#166534]' : tone === 'muted' ? 'text-[#8A8178]' : 'text-[#1C1C1C]';
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.12em] text-[#8A8178]">{label}</p>
      <p className={`text-[16px] font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
