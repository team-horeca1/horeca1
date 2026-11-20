'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { focusRing, inr, money, StatusPill, SupplierMark, type PillTone } from '@/components/features/finance/financeChrome';

type Kpis = {
  eligible: string;
  commission: string;
  customerPaid: string;
  razorpayFee: string;
  razorpayFeeUnknown: boolean;
  quotedNet: string;
  onHold?: string;
  blockedSale?: string;
  settledPeriod?: string;
  awaitingCompletion?: string;
};

type Row = {
  vendorId: string;
  supplier: string;
  supplierCode: string | null;
  logoUrl?: string | null;
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
type SortKey = '' | 'ready' | 'latest' | 'outstanding' | 'supplier';

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

const STATE_TONE: Record<RowState, PillTone> = {
  ready: 'ready',
  paid: 'paid',
  fee: 'warn',
  rate: 'muted',
  waiting: 'muted',
};

function stateLabel(row: Row, state: RowState): string {
  if (state === 'waiting' && row.waitingDelivery) return 'Not delivered';
  return STATE_LABEL[state];
}

function rowState(row: Row): RowState {
  if (money(row.eligible) > 0) return 'ready';
  if (row.waitingDelivery) return 'waiting';
  if (row.razorpayFeeUnknown) return 'fee';
  if (row.ratePct == null || row.unconfigured) return 'rate';
  if (money(row.settled) > 0) return 'paid';
  return 'waiting';
}

function settledClear(row: Row): boolean {
  return money(row.settled) > 0 && money(row.eligible) === 0;
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

function payTitle(row: Row): string | undefined {
  if (money(row.eligible) > 0) return undefined;
  if (row.waitingDelivery) return 'Turns on after delivery';
  if (row.ratePct == null || row.unconfigured) return 'Set a commission rate first';
  if (row.razorpayFeeUnknown) return 'Waiting for the Razorpay fee';
  return 'Nothing to pay';
}

function resolvedSort(status: string, sortKey: SortKey): string {
  const key = sortKey || (status === 'settled' ? 'latest' : status === 'outstanding' || status === 'on_hold' ? 'outstanding' : 'ready');
  return key === 'supplier' ? 'supplier' : `-${key}`;
}

function activeSort(status: string, sortKey: SortKey): Exclude<SortKey, ''> {
  if (sortKey) return sortKey;
  if (status === 'settled') return 'latest';
  if (status === 'outstanding' || status === 'on_hold') return 'outstanding';
  return 'ready';
}

function contextNotes(kpis: Kpis, ranged: boolean): string[] {
  const notes: string[] = [];
  const waiting = money(kpis.quotedNet) > 0 ? kpis.quotedNet : kpis.awaitingCompletion;
  if (money(waiting) > 0) notes.push(`Waiting for delivery. ${inr(waiting)} is captured and is not payable yet.`);
  if (money(kpis.blockedSale) > 0) notes.push(`Missing commission rate. ${inr(kpis.blockedSale)} stays unpaid until a rate is set. A blank rate is not 0%.`);
  if (kpis.razorpayFeeUnknown) notes.push('Missing Razorpay fee. Pay stays off for those orders until the fee arrives.');
  if (money(kpis.onHold) > 0) notes.push(`Paused. ${inr(kpis.onHold)} is held and is not in To pay now.`);
  if (money(kpis.settledPeriod) > 0) notes.push(`Already paid ${inr(kpis.settledPeriod)}${ranged ? ' in this period' : ''}.`);
  return notes;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
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
  const [sortKey, setSortKey] = useState<SortKey>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [guide, setGuide] = useState<{
    supplier: string;
    code: string | null;
    vendorId: string;
    net: string;
    utr: string;
    note: string;
    notice: string;
    paid: boolean;
  } | null>(null);

  const datesInvalid = Boolean(from && to && from > to);

  const buildParams = useCallback((pageNo: number, size: number) => {
    const params = new URLSearchParams({
      page: String(pageNo),
      pageSize: String(size),
      sort: resolvedSort(status, sortKey),
    });
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (from && !datesInvalid) params.set('from', from);
    if (to && !datesInvalid) params.set('to', to);
    return params;
  }, [datesInvalid, from, q, sortKey, status, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/admin/finance/payables?${buildParams(page, pageSize)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Could not load this page');
      setKpis(json.data.kpis);
      setRows(json.data.rows);
      setTotal(json.data.pagination.total);
      setPageSize(json.data.pagination.pageSize ?? pageSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this page');
    } finally {
      setLoading(false);
    }
  }, [buildParams, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!guide) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setGuide(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guide]);

  async function markPaid() {
    if (!guide || guide.utr.trim().length < 6 || guide.note.trim().length < 3) return;
    setBusy(guide.vendorId);
    try {
      const res = await fetch('/api/v1/admin/finance/payables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: guide.vendorId, utr: guide.utr.trim(), note: guide.note.trim() }),
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

  async function exportCsv() {
    setExporting(true);
    setError('');
    try {
      const collected: Row[] = [];
      let pageNo = 1;
      let count = 0;
      do {
        const res = await fetch(`/api/v1/admin/finance/payables?${buildParams(pageNo, 50)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message ?? 'Could not export');
        collected.push(...json.data.rows);
        count = json.data.pagination.total;
        pageNo += 1;
      } while (collected.length < count && pageNo < 20);
      const header = ['Supplier', 'Code', 'Status', 'Rate', 'Customer paid', 'Razorpay fee', 'Commission', 'To pay'];
      const body = collected.map((row) => {
        const state = rowState(row);
        return [
          row.supplier,
          row.supplierCode ?? '',
          stateLabel(row, state),
          row.ratePct == null ? '' : `${row.ratePct}%`,
          inr(row.eligibleSale),
          feeText(row),
          row.ratePct == null ? '' : inr(row.commission),
          toPayText(row, state),
        ].map(csvCell).join(',');
      });
      const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pay-suppliers.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export');
    } finally {
      setExporting(false);
    }
  }

  function openSupplier(event: React.MouseEvent, vendorId: string) {
    if ((event.target as HTMLElement).closest('a, button')) return;
    router.push(`/admin/finance/payables/${vendorId}`);
  }

  function pay(row: Row) {
    setGuide({
      supplier: row.supplier,
      code: row.supplierCode,
      vendorId: row.vendorId,
      net: row.eligible,
      utr: '',
      note: '',
      notice: '',
      paid: false,
    });
  }

  const notes = kpis ? contextNotes(kpis, Boolean(from || to)) : [];
  const sortValue = activeSort(status, sortKey);

  return (
    <div className="space-y-5 pb-8 text-[#1C1C1C]">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[clamp(1.5rem,2vw+0.5rem,1.85rem)] font-semibold tracking-tight">Pay suppliers</h1>
          <p className="mt-1 max-w-2xl text-[14px] leading-6 text-[#667085]">
            The customer pays. Razorpay takes its fee. Horeca1 keeps the commission. What is left is what you transfer. We do not call the bank.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={exporting}
          className={cn('inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#E9E3DD] bg-white px-3 text-[13px] font-semibold text-[#1C1C1C] hover:bg-[#FAF7F2] disabled:opacity-50', focusRing)}
        >
          {exporting ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}
          Export CSV
        </button>
      </header>

      {error ? <p role="alert" className="rounded-xl border border-[#DC2626]/30 bg-white px-4 py-3 text-[14px] text-[#DC2626]">{error}</p> : null}

      {kpis ? (
        <section className="overflow-hidden rounded-xl border border-[#E9E3DD] bg-white">
          <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.4fr)]">
            <div className="border-b border-[#E9E3DD] px-5 py-5 lg:border-b-0 lg:border-r">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6B1D2E]">To pay now</p>
              <p className="mt-2 text-[clamp(1.85rem,2vw+1rem,2.5rem)] font-semibold tabular-nums tracking-tight text-[#6B1D2E]">{inr(kpis.eligible)}</p>
              <p className="mt-2 max-w-sm text-[13px] leading-5 text-[#667085]">Only money that can be paid now. Waiting, missing, and paused amounts are not included.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3">
              <Quiet label="Customer paid" value={inr(kpis.customerPaid)} hint="Captured cash" />
              <Quiet label="Razorpay fee" value={inr(kpis.razorpayFee)} hint={kpis.razorpayFeeUnknown ? 'Some fees have not arrived' : 'Known fees'} />
              <Quiet label="Commission" value={inr(kpis.commission)} hint="Horeca1’s share" />
            </div>
          </div>
          {notes.length > 0 ? (
            <ul className="space-y-1 border-t border-[#E9E3DD] px-5 py-3 text-[13px] leading-5 text-[#667085]">
              {notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <input
            aria-label="Search supplier"
            value={q}
            onChange={(event) => { setQ(event.target.value); setPage(1); }}
            placeholder="Name or code"
            className={cn('h-11 w-full rounded-lg border border-[#E9E3DD] bg-white px-3 text-[15px] outline-none xl:max-w-xs', focusRing)}
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
            {FILTERS.map((filter) => (
              <button
                key={filter.label}
                type="button"
                aria-pressed={status === filter.id}
                onClick={() => { setStatus(filter.id); setSortKey(''); setPage(1); }}
                className={cn(
                  'h-10 rounded-lg px-3 text-[13px] font-semibold',
                  focusRing,
                  status === filter.id ? 'bg-[#F8E8EC] text-[#6B1D2E]' : 'border border-[#E9E3DD] bg-white text-[#667085]',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 xl:ml-auto">
            <select
              aria-label="Sort"
              value={sortValue}
              onChange={(event) => { setSortKey(event.target.value as SortKey); setPage(1); }}
              className={cn('h-10 rounded-lg border border-[#E9E3DD] bg-white px-3 text-[13px] font-semibold text-[#1C1C1C]', focusRing)}
            >
              <option value="ready">Ready to pay first</option>
              <option value="latest">Latest paid</option>
              <option value="outstanding">Largest amount</option>
              <option value="supplier">Name</option>
            </select>
            <select
              aria-label="Rows per page"
              value={String(pageSize)}
              onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
              className={cn('h-10 rounded-lg border border-[#E9E3DD] bg-white px-3 text-[13px] font-semibold text-[#1C1C1C]', focusRing)}
            >
              <option value="20">20 per page</option>
              <option value="50">50 per page</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[12px] text-[#667085]">From
            <input type="date" aria-label="From" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className={cn('mt-1 block h-10 rounded-lg border border-[#E9E3DD] bg-white px-3 text-[13px] text-[#1C1C1C]', focusRing)} />
          </label>
          <label className="text-[12px] text-[#667085]">To
            <input type="date" aria-label="To" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} className={cn('mt-1 block h-10 rounded-lg border border-[#E9E3DD] bg-white px-3 text-[13px] text-[#1C1C1C]', focusRing)} />
          </label>
          <p className="pb-2 text-[12px] leading-4 text-[#667085]">
            {datesInvalid ? 'The start date is after the end date.' : 'Dates change commission and already paid. To pay now stays the current balance.'}
          </p>
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
          <div className="overflow-hidden rounded-xl border border-[#E9E3DD] bg-white md:hidden" aria-busy={loading}>
            <ul className="divide-y divide-[#E9E3DD]">
              {rows.map((row) => {
                const state = rowState(row);
                return (
                  <li key={row.vendorId} onClick={(event) => openSupplier(event, row.vendorId)} className="cursor-pointer px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <SupplierIdentity row={row} state={state} />
                      <p className={cn('text-right text-[16px] font-semibold tabular-nums', state === 'ready' ? 'text-[#6B1D2E]' : 'text-[#1C1C1C]')}>
                        {toPayText(row, state)}
                      </p>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                      <MoneyItem label="Customer paid" value={inr(row.eligibleSale)} />
                      <MoneyItem label="Razorpay fee" value={feeText(row)} />
                      <MoneyItem label="Commission" value={row.ratePct == null ? '—' : inr(row.commission)} />
                      <MoneyItem label="Rate" value={row.ratePct == null ? '—' : `${row.ratePct}%`} />
                    </dl>
                    <PayButton row={row} busy={busy} onPay={pay} className="mt-3 min-h-12 w-full" />
                  </li>
                );
              })}
            </ul>
            <ListFooter page={page} pageSize={pageSize} total={total} onPage={setPage} />
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-[#E9E3DD] bg-white md:block" aria-busy={loading}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-[13px]">
                <thead className="bg-[#FAF7F2] text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Supplier</th>
                    <th className="px-3 py-3 text-right font-semibold">Rate</th>
                    <th className="px-3 py-3 text-right font-semibold">Customer paid</th>
                    <th className="px-3 py-3 text-right font-semibold">Razorpay fee</th>
                    <th className="px-3 py-3 text-right font-semibold">Commission</th>
                    <th className="px-3 py-3 text-right font-semibold">To pay</th>
                    <th className="px-4 py-3 text-right font-semibold"><span className="sr-only">Pay</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E3DD]">
                  {rows.map((row) => {
                    const state = rowState(row);
                    return (
                      <tr key={row.vendorId} onClick={(event) => openSupplier(event, row.vendorId)} className="cursor-pointer hover:bg-[#FAF7F2]">
                        <td className="px-4 py-3"><SupplierIdentity row={row} state={state} /></td>
                        <td className="px-3 py-3 text-right tabular-nums text-[#667085]">{row.ratePct == null ? '—' : `${row.ratePct}%`}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{inr(row.eligibleSale)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{feeText(row)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{row.ratePct == null ? '—' : inr(row.commission)}</td>
                        <td className={cn('whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums', state === 'ready' ? 'text-[#6B1D2E]' : 'text-[#1C1C1C]')}>
                          {toPayText(row, state)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <PayButton row={row} busy={busy} onPay={pay} className="h-10" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ListFooter page={page} pageSize={pageSize} total={total} onPage={setPage} />
          </div>
        </>
      )}

      {guide ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1C1C1C]/40 p-4 sm:items-center" role="presentation" onClick={() => setGuide(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-dialog-title"
            className="w-full max-w-md rounded-2xl border border-[#E9E3DD] bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6B1D2E]">Record a reference</p>
                <h2 id="pay-dialog-title" className="mt-1 text-[22px] font-semibold tracking-tight">Pay {guide.supplier}</h2>
                {guide.code ? <p className="mt-1 text-[13px] text-[#667085]">{guide.code}</p> : null}
              </div>
              <p className="text-right">
                <span className="block text-[12px] text-[#667085]">Amount</span>
                <span className="mt-1 block text-[26px] font-semibold tabular-nums text-[#6B1D2E]">{inr(guide.net)}</span>
              </p>
            </div>
            {guide.paid ? (
              <p className="mt-5 rounded-xl bg-[#F0FDF4] px-4 py-3 text-[15px] font-medium text-[#166534]">Paid. The reference is saved.</p>
            ) : (
              <div className="mt-5 flex flex-col gap-3">
                <p className="text-[14px] leading-6 text-[#3F3F46]">We do not call the bank. This saves the reference you already used. It does not start or check a transfer.</p>
                {guide.notice ? <p role="alert" className="text-[13px] text-[#DC2626]">{guide.notice}</p> : null}
                <label className="text-[13px] text-[#667085]">Bank reference
                  <input autoFocus aria-label="Bank reference" value={guide.utr} onChange={(event) => setGuide({ ...guide, utr: event.target.value })} placeholder="At least 6 characters" className={cn('mt-1 h-12 w-full rounded-lg border border-[#E9E3DD] px-3 text-[16px] text-[#1C1C1C]', focusRing)} />
                </label>
                <label className="text-[13px] text-[#667085]">Note
                  <input aria-label="Payment note" value={guide.note} onChange={(event) => setGuide({ ...guide, note: event.target.value })} placeholder="At least 3 characters" className={cn('mt-1 h-12 w-full rounded-lg border border-[#E9E3DD] px-3 text-[16px] text-[#1C1C1C]', focusRing)} />
                </label>
                <button
                  type="button"
                  onClick={() => void markPaid()}
                  disabled={busy === guide.vendorId || guide.utr.trim().length < 6 || guide.note.trim().length < 3}
                  className={cn('h-12 rounded-lg bg-[#6B1D2E] text-[15px] font-semibold text-white hover:bg-[#5A1926] disabled:cursor-not-allowed disabled:bg-[#E9E3DD] disabled:text-[#6B7280]', focusRing)}
                >
                  {busy === guide.vendorId ? 'Saving…' : 'Mark paid'}
                </button>
              </div>
            )}
            <button type="button" onClick={() => setGuide(null)} className={cn('mt-3 h-11 text-[14px] font-semibold text-[#6B1D2E]', focusRing)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Quiet({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="border-b border-[#E9E3DD] px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-l sm:first:border-l-0">
      <p className="text-[12px] font-medium text-[#667085]">{label}</p>
      <p className="mt-1 text-[clamp(1.05rem,1.2vw,1.35rem)] font-semibold tabular-nums text-[#1C1C1C]">{value}</p>
      <p className="mt-1 text-[12px] leading-4 text-[#667085]">{hint}</p>
    </div>
  );
}

function SupplierIdentity({ row, state }: { row: Row; state: RowState }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <SupplierMark name={row.supplier} logoUrl={row.logoUrl} />
      <div className="min-w-0">
        <Link href={`/admin/finance/payables/${row.vendorId}`} className={cn('block truncate font-semibold text-[#1C1C1C] hover:text-[#6B1D2E]', focusRing)}>
          {row.supplier}
        </Link>
        {row.supplierCode ? <p className="truncate text-[12px] text-[#667085]">{row.supplierCode}</p> : null}
        <StatusPill tone={STATE_TONE[state]}>{stateLabel(row, state)}</StatusPill>
      </div>
    </div>
  );
}

function MoneyItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] text-[#667085]">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function PayButton({ row, busy, onPay, className }: { row: Row; busy: string; onPay: (row: Row) => void; className?: string }) {
  const saving = busy === row.vendorId;
  const enabled = money(row.eligible) > 0 && !saving;
  if (!saving && settledClear(row)) {
    return (
      <span onClick={(event) => event.stopPropagation()} className={cn('inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#F0FDF4] px-3 text-[13px] font-semibold text-[#16A34A]', className)}>
        <Check size={14} aria-hidden />
        Paid
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={!enabled}
      title={enabled ? undefined : payTitle(row)}
      onClick={(event) => { event.stopPropagation(); if (enabled) onPay(row); }}
      className={cn(
        'rounded-lg px-4 text-[13px] font-semibold',
        focusRing,
        enabled ? 'bg-[#6B1D2E] text-white hover:bg-[#5A1926]' : 'cursor-not-allowed bg-[#E9E3DD] text-[#6B7280]',
        className,
      )}
    >
      {saving ? 'Saving…' : 'Pay'}
    </button>
  );
}

function pageWindow(page: number, pages: number): number[] {
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const end = Math.min(pages, start + 4);
  const from = Math.max(1, end - 4);
  return Array.from({ length: end - from + 1 }, (_, index) => from + index);
}

function ListFooter({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const showPager = total > pageSize;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E9E3DD] px-4 py-3 text-[13px] text-[#667085]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>Showing {start}–{end} of {total}</span>
        <Link href="/admin/ledger" className={cn('font-semibold text-[#6B1D2E]', focusRing)}>Older wallet</Link>
      </div>
      {showPager ? (
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className={cn('flex h-8 w-8 items-center justify-center rounded-lg border border-[#E9E3DD] bg-white disabled:opacity-40', focusRing)}>
            <ChevronLeft size={15} />
          </button>
          {pageWindow(page, pages).map((number) => (
            <button
              key={number}
              type="button"
              aria-label={`Page ${number}`}
              aria-current={number === page ? 'page' : undefined}
              onClick={() => onPage(number)}
              className={cn('h-8 min-w-8 rounded-lg px-2 text-[13px] font-semibold tabular-nums', focusRing, number === page ? 'bg-[#6B1D2E] text-white' : 'border border-[#E9E3DD] bg-white text-[#1C1C1C]')}
            >
              {number}
            </button>
          ))}
          <button type="button" aria-label="Next page" disabled={page * pageSize >= total} onClick={() => onPage(page + 1)} className={cn('flex h-8 w-8 items-center justify-center rounded-lg border border-[#E9E3DD] bg-white disabled:opacity-40', focusRing)}>
            <ChevronRight size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
