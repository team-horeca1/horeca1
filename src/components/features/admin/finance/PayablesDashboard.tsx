'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Kpis = {
  eligible: string;
  commission: string;
  customerPaid: string;
  razorpayFee: string;
  razorpayFeeUnknown: boolean;
  quotedNet: string;
};

type Row = {
  vendorId: string;
  supplier: string;
  supplierCode: string | null;
  ratePct: string | null;
  eligible: string;
  shownToPay: string;
  eligibleSale: string;
  razorpayFee: string | null;
  razorpayFeeUnknown: boolean;
  commission: string;
  unconfigured: boolean;
  waitingDelivery: boolean;
  settled: string;
};

type RowState = 'ready' | 'paid' | 'fee' | 'rate' | 'waiting';

const FILTERS: { id: string; label: string }[] = [
  { id: '', label: 'Everyone' },
  { id: 'eligible', label: 'Ready to pay' },
  { id: 'outstanding', label: 'Still owed' },
  { id: 'on_hold', label: 'Paused' },
  { id: 'settled', label: 'Already paid' },
];

const STATE_LABEL: Record<RowState, string> = {
  ready: 'Ready',
  paid: 'Paid',
  fee: 'Fee missing',
  rate: 'No rate',
  waiting: 'Not yet',
};

function stateLabel(row: Row, state: RowState): string {
  if (state === 'waiting' && row.waitingDelivery) return 'Not delivered';
  return STATE_LABEL[state];
}

function inr(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}

function money(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function rowState(row: Row): RowState {
  if (money(row.eligible) > 0) return 'ready';
  if (row.waitingDelivery) return 'waiting';
  if (row.razorpayFeeUnknown) return 'fee';
  if (row.ratePct == null || row.unconfigured) return 'rate';
  if (money(row.settled) > 0) return 'paid';
  return 'waiting';
}

function feeText(row: Row): string {
  if (row.razorpayFeeUnknown && money(row.razorpayFee ?? undefined) === 0) return '—';
  return inr(row.razorpayFee ?? 0);
}

function toPayText(row: Row, state: RowState): string {
  if (state === 'paid') return inr(row.settled);
  if (money(row.shownToPay) > 0) return inr(row.shownToPay);
  if (state === 'ready') return inr(row.eligible);
  return '—';
}

function payHighlight(row: Row, state: RowState): boolean {
  return state === 'ready' && !row.waitingDelivery;
}

export function PayablesDashboard() {
  const router = useRouter();
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [guide, setGuide] = useState<{
    supplier: string;
    vendorId: string;
    net: string;
    utr: string;
    note: string;
    notice: string;
    paid: boolean;
  } | null>(null);

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
      setTotal(json.data.pagination.total);
      setPageSize(json.data.pagination.pageSize ?? 20);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this page');
    } finally {
      setLoading(false);
    }
  }, [page, q, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markPaid() {
    if (!guide) return;
    setBusy(guide.vendorId);
    try {
      const res = await fetch('/api/v1/admin/finance/payables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: guide.vendorId, utr: guide.utr, note: guide.note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Could not mark this paid');
      setGuide({ ...guide, paid: true, notice: 'Paid. The reference is saved.' });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not mark this paid';
      setGuide((current) => current ? { ...current, notice: message } : current);
    } finally {
      setBusy('');
    }
  }

  function openSupplier(event: React.MouseEvent, vendorId: string) {
    if ((event.target as HTMLElement).closest('a, button')) return;
    router.push(`/admin/finance/payables/${vendorId}`);
  }

  function pay(row: Row) {
    setGuide({
      supplier: row.supplier,
      vendorId: row.vendorId,
      net: row.eligible,
      utr: '',
      note: '',
      notice: 'Add the bank reference and a note. We do not call the bank.',
      paid: false,
    });
  }

  return (
    <div className="space-y-6 pb-8 text-[#1C1C1C]">
      <header>
        <h1 className="text-[clamp(1.5rem,2vw+0.5rem,1.75rem)] font-semibold tracking-tight">Pay suppliers</h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-6 text-[#667085]">
          The customer pays. Razorpay takes its fee. Horeca1 keeps the commission. What is left is what you transfer. We do not call the bank.
        </p>
      </header>

      {error ? <p role="alert" className="rounded-xl border border-[#DC2626]/30 bg-white px-4 py-3 text-[14px] text-[#DC2626]">{error}</p> : null}

      {kpis ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Figure
            label="To pay"
            value={inr(kpis.eligible)}
            tone="pay"
            note={money(kpis.quotedNet) > 0 ? 'More is waiting on delivery' : undefined}
          />
          <Figure label="Customer paid" value={inr(kpis.customerPaid)} />
          <Figure
            label="Razorpay cut"
            value={inr(kpis.razorpayFee)}
            note={kpis.razorpayFeeUnknown ? 'Some fees have not arrived' : undefined}
          />
          <Figure label="Commission" value={inr(kpis.commission)} />
        </section>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          aria-label="Search supplier"
          value={q}
          onChange={(event) => { setQ(event.target.value); setPage(1); }}
          placeholder="Name or code"
          className="h-12 w-full rounded-xl border border-[#E9E3DD] bg-white px-4 text-[15px] text-[#1C1C1C] outline-none focus:border-[#6B1D2E] lg:max-w-sm"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              aria-pressed={status === filter.id}
              onClick={() => { setStatus(filter.id); setPage(1); }}
              className={cn(
                'h-10 rounded-lg px-3 text-[13px] font-semibold',
                status === filter.id
                  ? 'bg-[#F8E8EC] text-[#6B1D2E]'
                  : 'border border-[#E9E3DD] bg-white text-[#667085]',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center gap-2 py-16 text-[#6B1D2E]"><Loader2 className="animate-spin" size={18} /> Loading the ledger</div>
      ) : rows.length === 0 ? (
        error ? null : (
          <p className="rounded-xl border border-dashed border-[#E9E3DD] bg-white px-4 py-12 text-center text-[15px] text-[#667085]">
            No supplier matches. Clear the search to see everyone.
          </p>
        )
      ) : (
        <>
          <ul className="divide-y divide-[#E9E3DD] overflow-hidden rounded-xl border border-[#E9E3DD] bg-white md:hidden">
            {rows.map((row) => {
              const state = rowState(row);
              return (
                <li key={row.vendorId} onClick={(event) => openSupplier(event, row.vendorId)} className="cursor-pointer px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <SupplierIdentity row={row} state={state} />
                    <p className={cn('text-right text-[16px] font-semibold tabular-nums', payHighlight(row, state) ? 'text-[#6B1D2E]' : 'text-[#1C1C1C]')}>
                      {toPayText(row, state)}
                    </p>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                    <MoneyItem label="Customer paid" value={inr(row.eligibleSale)} />
                    <MoneyItem label="Razorpay cut" value={feeText(row)} />
                    <MoneyItem label="Commission" value={row.ratePct == null ? '—' : inr(row.commission)} />
                    <MoneyItem label="Rate" value={row.ratePct == null ? '—' : `${row.ratePct}%`} />
                  </dl>
                  <PayButton row={row} busy={busy} enabled={state === 'ready'} onPay={pay} className="mt-3 min-h-12 w-full" />
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-hidden rounded-xl border border-[#E9E3DD] bg-white md:block">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#FAF7F2] text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-3 py-3 text-right font-semibold">Rate</th>
                  <th className="px-3 py-3 text-right font-semibold">Customer paid</th>
                  <th className="px-3 py-3 text-right font-semibold">Razorpay cut</th>
                  <th className="px-3 py-3 text-right font-semibold">Commission</th>
                  <th className="px-3 py-3 text-right font-semibold">To pay</th>
                  <th className="px-4 py-3"><span className="sr-only">Pay</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E3DD]">
                {rows.map((row) => {
                  const state = rowState(row);
                  return (
                    <tr key={row.vendorId} onClick={(event) => openSupplier(event, row.vendorId)} className="cursor-pointer hover:bg-[#FAF7F2]">
                      <td className="px-4 py-3"><SupplierIdentity row={row} state={state} /></td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#667085]">{row.ratePct == null ? '—' : `${row.ratePct}%`}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{inr(row.eligibleSale)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{feeText(row)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{row.ratePct == null ? '—' : inr(row.commission)}</td>
                      <td className={cn('px-3 py-3 text-right font-semibold tabular-nums', payHighlight(row, state) ? 'text-[#6B1D2E]' : 'text-[#1C1C1C]')}>
                        {toPayText(row, state)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <PayButton row={row} busy={busy} enabled={state === 'ready'} onPay={pay} className="h-10" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-[14px] text-[#667085]">
        <span>{total} suppliers</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="h-10 rounded-lg border border-[#E9E3DD] bg-white px-4 disabled:opacity-40">Previous</button>
          <button type="button" disabled={page * pageSize >= total} onClick={() => setPage((n) => n + 1)} className="h-10 rounded-lg border border-[#E9E3DD] bg-white px-4 disabled:opacity-40">Next</button>
        </div>
      </div>

      <p className="text-[14px] text-[#667085]">
        <Link href="/admin/ledger" className="font-semibold text-[#6B1D2E]">Older wallet</Link>
      </p>

      {guide ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1C1C1C]/50 p-4 sm:items-center" role="presentation" onClick={() => setGuide(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-dialog-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6B1D2E]">Payment</p>
            <h2 id="pay-dialog-title" className="mt-1 text-[24px] font-semibold tracking-tight">Pay {guide.supplier}</h2>
            <p className="mt-2 text-[28px] font-semibold tabular-nums">{inr(guide.net)}</p>
            {guide.paid ? null : <p className="mt-2 text-[15px] leading-6 text-[#3F3F46]">{guide.notice}</p>}
            {guide.paid ? (
              <p className="mt-5 rounded-xl bg-[#F0FDF4] px-4 py-3 text-[15px] font-medium text-[#166534]">Paid. The reference is saved.</p>
            ) : (
              <div className="mt-5 flex flex-col gap-3">
                <label className="text-[13px] text-[#667085]">Bank reference
                  <input aria-label="Bank reference" value={guide.utr} onChange={(event) => setGuide({ ...guide, utr: event.target.value })} placeholder="UTR from your bank" className="mt-1 h-12 w-full rounded-xl border border-[#E9E3DD] px-3 text-[16px] text-[#1C1C1C]" />
                </label>
                <label className="text-[13px] text-[#667085]">Note
                  <input aria-label="Payment note" value={guide.note} onChange={(event) => setGuide({ ...guide, note: event.target.value })} placeholder="What this payment is for" className="mt-1 h-12 w-full rounded-xl border border-[#E9E3DD] px-3 text-[16px] text-[#1C1C1C]" />
                </label>
                <button type="button" onClick={() => void markPaid()} className="h-12 rounded-lg bg-[#6B1D2E] text-[15px] font-semibold text-white hover:bg-[#5A1926]">Mark paid</button>
              </div>
            )}
            <button type="button" onClick={() => setGuide(null)} className="mt-3 h-11 text-[14px] font-semibold text-[#6B1D2E]">Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Figure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'pay' }) {
  return (
    <div className="rounded-xl border border-[#E9E3DD] bg-white px-4 py-3">
      <p className="text-[12px] font-medium text-[#667085]">{label}</p>
      <p className={cn('mt-1 text-[clamp(1.15rem,1.5vw,1.5rem)] font-semibold tabular-nums', tone === 'pay' ? 'text-[#6B1D2E]' : 'text-[#1C1C1C]')}>{value}</p>
      {note ? <p className="mt-1 text-[12px] leading-4 text-[#667085]">{note}</p> : null}
    </div>
  );
}

function SupplierIdentity({ row, state }: { row: Row; state: RowState }) {
  return (
    <div className="min-w-0">
      <Link href={`/admin/finance/payables/${row.vendorId}`} className="font-semibold text-[#1C1C1C] hover:text-[#6B1D2E]">
        {row.supplier}
      </Link>
      {row.supplierCode ? <p className="text-[12px] text-[#667085]">{row.supplierCode}</p> : null}
      <p className={cn('text-[12px] font-medium', state === 'ready' || state === 'paid' ? 'text-[#16A34A]' : 'text-[#667085]')}>{stateLabel(row, state)}</p>
    </div>
  );
}

function MoneyItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-[#667085]">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function PayButton({ row, busy, enabled, onPay, className }: { row: Row; busy: string; enabled: boolean; onPay: (row: Row) => void; className?: string }) {
  const saving = busy === row.vendorId;
  return (
    <button
      type="button"
      disabled={!enabled || saving}
      title={enabled ? undefined : row.settled && money(row.settled) > 0 && money(row.eligible) === 0 ? 'Already paid' : row.waitingDelivery ? 'Turns on after delivery' : row.ratePct == null ? 'Set a commission rate first' : 'Waiting for the Razorpay fee'}
      onClick={(event) => { event.stopPropagation(); if (enabled) onPay(row); }}
      className={cn(
        'rounded-lg px-4 text-[13px] font-semibold',
        enabled
          ? 'bg-[#6B1D2E] text-white hover:bg-[#5A1926] disabled:bg-[#E9E3DD] disabled:text-[#6B7280]'
          : 'cursor-not-allowed bg-[#E9E3DD] text-[#6B7280]',
        className,
      )}
    >
      {saving ? 'Saving…' : !enabled && money(row.settled) > 0 && money(row.eligible) === 0 ? 'Paid' : 'Pay'}
    </button>
  );
}
