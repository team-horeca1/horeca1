'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Wallet,
  CreditCard,
  Percent,
  IndianRupee,
  Search,
  Info,
  AlertCircle,
  ArrowRight,
  SlidersHorizontal,
  X,
  FileSpreadsheet,
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
  hasUnsettledOrder: boolean;
  settled: string;
  dates: PayDate[];
};

type PayDate = {
  date: string;
  orderCount: number;
  orderIds: string[];
  net: string;
  payable: boolean;
  waitingDelivery: boolean;
  feeUnknown: boolean;
  unconfigured: boolean;
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
  rate: 'danger',
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
  if (row.hasUnsettledOrder) return 'waiting';
  if (money(row.settled) > 0) return 'paid';
  return 'waiting';
}

function settledClear(row: Row): boolean {
  return money(row.settled) > 0 && money(row.eligible) === 0 && !row.hasUnsettledOrder;
}

function feeText(row: Row): string {
  if (row.razorpayFeeUnknown && money(row.razorpayFee ?? undefined) === 0) return '—';
  return inr(row.razorpayFee ?? 0);
}

function toPayText(row: Row, state: RowState): string {
  if (state === 'paid') return inr(row.settled);
  if (state === 'ready' || money(row.shownToPay) > 0) return inr(row.shownToPay);
  return '—';
}

function payTitle(row: Row): string | undefined {
  if (money(row.shownToPay) > 0) return undefined;
  if (row.waitingDelivery) return 'Turns on after delivery';
  if (row.ratePct == null || row.unconfigured) return 'Set a commission rate first';
  if (row.razorpayFeeUnknown) return 'Waiting for the Razorpay fee';
  if (row.hasUnsettledOrder) return 'Turns on when this order can be paid';
  return 'Nothing to pay';
}

function formatPayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function dateTitle(day: PayDate): string | undefined {
  if (day.payable) return undefined;
  if (day.waitingDelivery) return 'Turns on after delivery';
  if (day.unconfigured) return 'Set a commission rate first';
  if (day.feeUnknown) return 'Waiting for the Razorpay fee';
  return 'Turns on when this order can be paid';
}

function dateLabel(day: PayDate): string {
  if (day.payable) return 'Delivered';
  if (day.waitingDelivery) return 'Not delivered';
  if (day.unconfigured) return 'No rate';
  if (day.feeUnknown) return 'Fee missing';
  return 'Not yet';
}

function dateTone(day: PayDate): PillTone {
  if (day.payable) return 'ready';
  if (day.unconfigured) return 'danger';
  if (day.feeUnknown) return 'warn';
  return 'muted';
}

function resolvedSort(status: string, sortKey: SortKey): string {
  const key =
    sortKey ||
    (status === 'settled'
      ? 'latest'
      : status === 'outstanding' || status === 'on_hold'
      ? 'outstanding'
      : 'ready');
  return key === 'supplier' ? 'supplier' : `-${key}`;
}

function activeSort(status: string, sortKey: SortKey): Exclude<SortKey, ''> {
  if (sortKey) return sortKey;
  if (status === 'settled') return 'latest';
  if (status === 'outstanding' || status === 'on_hold') return 'outstanding';
  return 'ready';
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
  const [openSuppliers, setOpenSuppliers] = useState<Record<string, boolean>>({});
  const [guide, setGuide] = useState<{
    supplier: string;
    code: string | null;
    vendorId: string;
    net: string;
    orderIds?: string[];
    scope: string;
    utr: string;
    note: string;
    notice: string;
    paid: boolean;
  } | null>(null);

  const datesInvalid = Boolean(from && to && from > to);

  const buildParams = useCallback(
    (pageNo: number, size: number) => {
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
    },
    [datesInvalid, from, q, sortKey, status, to],
  );

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
        body: JSON.stringify({
          vendorId: guide.vendorId,
          utr: guide.utr.trim(),
          note: guide.note.trim(),
          amount: guide.net,
          ...(guide.orderIds?.length ? { orderIds: guide.orderIds } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Could not mark this paid');
      setGuide({ ...guide, paid: true, notice: 'Paid. The reference is saved.' });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not mark this paid';
      if (/amount changed/i.test(message)) {
        setGuide(null);
        await load();
        setError('The amount changed. Check the new To pay figure, then pay again.');
        return;
      }
      setGuide((current) => (current ? { ...current, notice: message } : current));
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

      const header = [
        'Supplier',
        'Code',
        'Status',
        'Rate',
        'Customer paid',
        'Razorpay fee',
        'Commission',
        'To pay',
      ];
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
        ]
          .map(csvCell)
          .join(',');
      });
      const blob = new Blob([[header.join(','), ...body].join('\n')], {
        type: 'text/csv;charset=utf-8',
      });
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

  function toggleSupplier(vendorId: string) {
    setOpenSuppliers((current) => ({ ...current, [vendorId]: !current[vendorId] }));
  }

  function openSupplier(event: React.MouseEvent, vendorId: string) {
    if ((event.target as HTMLElement).closest('a, button')) return;
    router.push(`/admin/finance/payables/${vendorId}`);
  }

  function pay(row: Row, day?: PayDate) {
    setGuide({
      supplier: row.supplier,
      code: row.supplierCode,
      vendorId: row.vendorId,
      net: day ? day.net : row.shownToPay,
      orderIds: day?.orderIds,
      scope: day
        ? `${formatPayDate(day.date)} · ${day.orderCount} order${day.orderCount === 1 ? '' : 's'}`
        : 'All delivered orders that are ready',
      utr: '',
      note: '',
      notice: '',
      paid: false,
    });
  }

  const sortValue = activeSort(status, sortKey);

  return (
    <div className="space-y-6 pb-12 text-[#1C1C1C]">
      {/* Navigation Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-[#667085]">
        <Link href="/admin/finance" className="hover:text-[#6B1D2E] transition-colors">
          Finance
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="text-[#1C1C1C] font-semibold">Pay Suppliers</span>
      </nav>

      {/* Header section */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1C1C1C] sm:text-3xl">
            Pay suppliers
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[#667085]">
            The supplier comes first. Open the arrow to see the dates still to pay, and close it
            when you are done. Pay turns on after delivery. Pay together settles every ready date.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Link
            href="/admin/ledger"
            className={cn(
              'inline-flex h-10 items-center justify-center rounded-xl border border-[#E9E3DD] bg-white px-3.5 text-xs font-semibold text-[#667085] hover:bg-[#FAF7F2] hover:text-[#1C1C1C] shadow-xs transition-colors',
              focusRing,
            )}
          >
            Older wallet
          </Link>
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={exporting}
            className={cn(
              'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E9E3DD] bg-white px-4 text-xs font-semibold text-[#1C1C1C] hover:bg-[#FAF7F2] disabled:opacity-50 shadow-xs transition-colors',
              focusRing,
            )}
          >
            {exporting ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}
            Export CSV
          </button>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 shadow-xs"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Financial KPIs Overview */}
      {kpis ? (
        <div className="space-y-4">
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FinanceKpiCard
              title="To pay now"
              value={inr(kpis.eligible)}
              subtext="Only money that can be paid now. Waiting, missing, and paused amounts are not included."
              icon={<Wallet className="h-4 w-4" />}
              variant="hero"
            />
            <FinanceKpiCard
              title="Customer paid"
              value={inr(kpis.customerPaid)}
              subtext="All captured cash"
              icon={<IndianRupee className="h-4 w-4" />}
              iconTone="blue"
            />
            <FinanceKpiCard
              title="Razorpay fee"
              value={inr(kpis.razorpayFee)}
              subtext={kpis.razorpayFeeUnknown ? 'Some fees have not arrived' : 'Known fees'}
              icon={<CreditCard className="h-4 w-4" />}
              iconTone="emerald"
            />
            <FinanceKpiCard
              title="Commission"
              value={inr(kpis.commission)}
              subtext="Horeca1’s share"
              icon={<Percent className="h-4 w-4" />}
              iconTone="purple"
            />
          </section>
        </div>
      ) : null}

      {/* Filter and Control Bar */}
      <div className="space-y-3 rounded-2xl border border-[#E9E3DD] bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Search Box */}
          <div className="relative w-full lg:max-w-xs">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
            />
            <input
              aria-label="Search supplier"
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(1);
              }}
              placeholder="Search supplier..."
              className={cn(
                'h-10 w-full rounded-xl border border-[#E9E3DD] bg-white pl-10 pr-3.5 text-sm text-[#1C1C1C] placeholder:text-[#667085] hover:border-[#CDC4BA] transition-colors',
                focusRing,
              )}
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ('');
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div
            className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-0.5"
            role="group"
            aria-label="Show"
          >
            {FILTERS.map((filter) => {
              const active = status === filter.id;
              return (
                <button
                  key={filter.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setStatus(filter.id);
                    setSortKey('');
                    setPage(1);
                  }}
                  className={cn(
                    'h-9 rounded-xl px-3.5 text-xs font-semibold transition-all duration-150',
                    focusRing,
                    active
                      ? 'bg-[#6B1D2E] text-white shadow-xs'
                      : 'border border-[#E9E3DD] bg-white text-[#667085] hover:border-[#CDC4BA] hover:text-[#1C1C1C]',
                  )}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          {/* Sort & Pagination Selectors */}
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <select
              aria-label="Sort"
              value={sortValue}
              onChange={(event) => {
                setSortKey(event.target.value as SortKey);
                setPage(1);
              }}
              className={cn(
                'h-9 rounded-xl border border-[#E9E3DD] bg-white px-3 text-xs font-semibold text-[#1C1C1C] hover:border-[#CDC4BA] transition-colors',
                focusRing,
              )}
            >
              <option value="ready">Ready to pay first</option>
              <option value="latest">Latest paid</option>
              <option value="outstanding">Largest amount</option>
              <option value="supplier">Name</option>
            </select>
            <select
              aria-label="Rows per page"
              value={String(pageSize)}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className={cn(
                'h-9 rounded-xl border border-[#E9E3DD] bg-white px-3 text-xs font-semibold text-[#1C1C1C] hover:border-[#CDC4BA] transition-colors',
                focusRing,
              )}
            >
              <option value="20">20 per page</option>
              <option value="50">50 per page</option>
            </select>
          </div>
        </div>

        {/* Date Filter Strip */}
        <div className="flex flex-wrap items-center gap-3 border-t border-[#F2ECE6] pt-3 text-xs text-[#667085]">
          <div className="flex items-center gap-2">
            <label className="font-medium text-[#1C1C1C]">From:</label>
            <input
              type="date"
              aria-label="From"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
              className={cn(
                'h-8 rounded-lg border border-[#E9E3DD] bg-white px-2.5 text-xs text-[#1C1C1C] hover:border-[#CDC4BA]',
                focusRing,
              )}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="font-medium text-[#1C1C1C]">To:</label>
            <input
              type="date"
              aria-label="To"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
              className={cn(
                'h-8 rounded-lg border border-[#E9E3DD] bg-white px-2.5 text-xs text-[#1C1C1C] hover:border-[#CDC4BA]',
                focusRing,
              )}
            />
          </div>
          <p className="text-[11px] text-[#667085] ml-auto">
            {datesInvalid
              ? 'The start date is after the end date.'
              : 'Dates change commission and already paid. To pay now stays the current balance.'}
          </p>
        </div>
      </div>

      {/* Main Table / List Content */}
      {loading && rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[#6B1D2E] gap-3">
          <Loader2 className="animate-spin" size={28} />
          <p className="text-sm font-semibold tracking-wide">Loading the ledger…</p>
        </div>
      ) : rows.length === 0 ? (
        error ? null : (
          <div className="rounded-2xl border border-dashed border-[#E9E3DD] bg-white p-12 text-center shadow-xs">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-zinc-300 mb-3" />
            <p className="text-sm font-medium text-[#667085]">
              No supplier matches. Clear the search to see everyone.
            </p>
          </div>
        )
      ) : (
        <>
          {/* Mobile Card List (< 768px) */}
          <div
            className="overflow-hidden rounded-2xl border border-[#E9E3DD] bg-white shadow-xs md:hidden"
            aria-busy={loading}
          >
            <ul className="divide-y divide-[#E9E3DD]">
              {rows.map((row) => {
                const state = rowState(row);
                const dates = row.dates ?? [];
                const open = openSuppliers[row.vendorId] === true;
                return (
                  <li key={row.vendorId} className="p-4">
                    <div
                      onClick={(event) => openSupplier(event, row.vendorId)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2">
                          <HierarchyToggle
                            count={dates.length}
                            open={open}
                            onToggle={() => toggleSupplier(row.vendorId)}
                          />
                          <SupplierIdentity row={row} state={state} />
                        </div>
                        <div className="text-right">
                          <span className="block text-[11px] font-medium text-[#667085]">To pay</span>
                          <p
                            className={cn(
                              'text-base font-bold tabular-nums',
                              state === 'ready' ? 'text-[#6B1D2E]' : 'text-[#1C1C1C]',
                            )}
                          >
                            {toPayText(row, state)}
                          </p>
                        </div>
                      </div>
                      <PayButton
                        row={row}
                        busy={busy}
                        onPay={pay}
                        label={dates.length > 1 ? 'Pay together' : 'Pay'}
                        className="mt-3.5 h-11 w-full justify-center"
                      />
                    </div>
                    {open && dates.length > 0 ? (
                      <ul className="mt-3 space-y-2 border-l-2 border-[#F3D7DE] pl-3">
                        {dates.map((day) => (
                          <li key={`${day.date}-${day.waitingDelivery}`} className="flex items-center justify-between gap-3 rounded-xl bg-[#FAF7F2] px-3 py-2.5">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold tabular-nums">{formatPayDate(day.date)}</p>
                              <p className="text-[11px] text-[#667085]">
                                {day.orderCount} order{day.orderCount === 1 ? '' : 's'}
                              </p>
                              <StatusPill tone={dateTone(day)}>{dateLabel(day)}</StatusPill>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold tabular-nums text-[#1C1C1C]">{money(day.net) > 0 ? inr(day.net) : '—'}</p>
                              <ActionButton
                                label="Pay"
                                enabled={day.payable}
                                busy={busy === row.vendorId}
                                title={dateTitle(day)}
                                onClick={() => pay(row, day)}
                                className="mt-1.5 h-9"
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <ListFooter page={page} pageSize={pageSize} total={total} onPage={setPage} />
          </div>

          {/* Desktop Table (>= 768px) */}
          <div
            className="hidden overflow-hidden rounded-2xl border border-[#E9E3DD] bg-white shadow-xs md:block"
            aria-busy={loading}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-xs">
                <thead className="border-b border-[#E9E3DD] bg-[#FAF7F2]/80 text-[11px] font-bold uppercase tracking-wider text-[#667085]">
                  <tr>
                    <th scope="col" className="px-5 py-3.5 font-bold">
                      Supplier
                    </th>
                    <th scope="col" className="px-3.5 py-3.5 text-right font-bold">
                      Rate
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
                      To pay
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-right font-bold">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const state = rowState(row);
                    const dates = row.dates ?? [];
                    const open = openSuppliers[row.vendorId] === true;
                    return (
                      <React.Fragment key={row.vendorId}>
                        <tr
                          onClick={(event) => openSupplier(event, row.vendorId)}
                          className="cursor-pointer border-t border-[#E9E3DD] transition-colors duration-100 hover:bg-[#FAF7F2]/70"
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <HierarchyToggle
                                count={dates.length}
                                open={open}
                                onToggle={() => toggleSupplier(row.vendorId)}
                              />
                              <SupplierIdentity row={row} state={state} />
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3.5 text-right tabular-nums font-medium text-[#667085]">
                            {row.ratePct == null ? '—' : `${row.ratePct}%`}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3.5 text-right tabular-nums text-[#1C1C1C]">
                            {inr(row.eligibleSale)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3.5 text-right tabular-nums text-[#667085]">
                            {feeText(row)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3.5 text-right tabular-nums text-[#667085]">
                            {row.ratePct == null ? '—' : inr(row.commission)}
                          </td>
                          <td
                            className={cn(
                              'whitespace-nowrap px-3.5 py-3.5 text-right font-bold tabular-nums text-sm',
                              state === 'ready' ? 'text-[#6B1D2E]' : 'text-[#1C1C1C]',
                            )}
                          >
                            {toPayText(row, state)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <PayButton
                              row={row}
                              busy={busy}
                              onPay={pay}
                              label={dates.length > 1 ? 'Pay together' : 'Pay'}
                              className="h-9"
                            />
                          </td>
                        </tr>
                        {open ? dates.map((day) => (
                          <tr key={`${row.vendorId}-${day.date}-${day.waitingDelivery}`} className="bg-[#FAF7F2]/70">
                            <td className="border-l-2 border-[#F3D7DE] py-2.5 pl-12 pr-5">
                              <p className="font-semibold text-[#1C1C1C]">{formatPayDate(day.date)}</p>
                              <p className="text-[11px] text-[#667085]">
                                {day.orderCount} order{day.orderCount === 1 ? '' : 's'}
                              </p>
                            </td>
                            <td className="px-3.5 py-2.5" colSpan={4}>
                              <StatusPill tone={dateTone(day)}>{dateLabel(day)}</StatusPill>
                            </td>
                            <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-semibold tabular-nums text-[#1C1C1C]">
                              {money(day.net) > 0 ? inr(day.net) : '—'}
                            </td>
                            <td className="px-5 py-2.5 text-right">
                              <ActionButton
                                label="Pay"
                                enabled={day.payable}
                                busy={busy === row.vendorId}
                                title={dateTitle(day)}
                                onClick={() => pay(row, day)}
                                className="h-9"
                              />
                            </td>
                          </tr>
                        )) : null}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ListFooter page={page} pageSize={pageSize} total={total} onPage={setPage} />
          </div>
        </>
      )}

      {/* Pay Supplier Modal Dialog */}
      {guide ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs p-4 sm:items-center"
          role="presentation"
          onClick={() => setGuide(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-dialog-title"
            className="w-full max-w-lg rounded-2xl border border-[#E9E3DD] bg-white p-6 shadow-2xl transition-all duration-150 animate-in fade-in zoom-in-95"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E9E3DD]">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B1D2E]">
                  Pay Supplier
                </span>
                <h2 id="pay-dialog-title" className="mt-0.5 text-xl font-bold tracking-tight text-[#1C1C1C]">
                  Pay {guide.supplier}
                </h2>
                {guide.code ? (
                  <p className="mt-0.5 text-xs text-[#667085]">Supplier code: {guide.code}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setGuide(null)}
                className={cn('rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600', focusRing)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Amount Card */}
            <div className="mt-4 rounded-xl border border-[#F3D7DE] bg-gradient-to-br from-[#FAF0F3] to-[#FDF6F8] p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-[#6B1D2E]/80">Amount to Transfer</p>
                <p className="text-xs text-[#667085] mt-0.5">{guide.scope}</p>
              </div>
              <p className="text-2xl font-bold tabular-nums text-[#6B1D2E] tracking-tight">
                {inr(guide.net)}
              </p>
            </div>

            {guide.paid ? (
              <div className="mt-5 space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                  <Check className="h-5 w-5 shrink-0 text-emerald-600" />
                  <p className="text-sm font-semibold">Paid. The reference is saved.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setGuide(null)}
                  className={cn(
                    'h-11 w-full rounded-xl bg-[#6B1D2E] text-sm font-semibold text-white hover:bg-[#5A1926]',
                    focusRing,
                  )}
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {/* Bank transfer disclaimer banner */}
                <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-xs leading-relaxed text-blue-900">
                  <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                  <span>
                    We do not call the bank. This saves the reference you already used. It does not
                    start or check a bank transfer.
                  </span>
                </div>

                {guide.notice ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700"
                  >
                    {guide.notice}
                  </div>
                ) : null}

                {/* Form fields */}
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[#1C1C1C]">
                      Bank reference <span className="text-rose-500">*</span>
                    </label>
                    <input
                      autoFocus
                      aria-label="Bank reference"
                      value={guide.utr}
                      onChange={(event) => setGuide({ ...guide, utr: event.target.value })}
                      placeholder="Enter bank reference (min 6 characters)"
                      className={cn(
                        'mt-1 h-11 w-full rounded-xl border border-[#E9E3DD] bg-white px-3.5 text-sm text-[#1C1C1C] placeholder:text-zinc-400 hover:border-[#CDC4BA]',
                        focusRing,
                      )}
                    />
                    <p className="mt-1 text-[11px] text-[#667085]">
                      Must be at least 6 characters (e.g. UTR / NEFT / IMPS reference).
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#1C1C1C]">
                      Note <span className="text-rose-500">*</span>
                    </label>
                    <input
                      aria-label="Payment note"
                      value={guide.note}
                      onChange={(event) => setGuide({ ...guide, note: event.target.value })}
                      placeholder="Enter note (min 3 characters)"
                      className={cn(
                        'mt-1 h-11 w-full rounded-xl border border-[#E9E3DD] bg-white px-3.5 text-sm text-[#1C1C1C] placeholder:text-zinc-400 hover:border-[#CDC4BA]',
                        focusRing,
                      )}
                    />
                    <p className="mt-1 text-[11px] text-[#667085]">
                      Internal reconciliation note (at least 3 characters).
                    </p>
                  </div>
                </div>

                {/* Modal Footer actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E9E3DD]">
                  <button
                    type="button"
                    onClick={() => setGuide(null)}
                    className={cn(
                      'h-10 rounded-xl border border-[#E9E3DD] bg-white px-4 text-xs font-semibold text-[#667085] hover:bg-zinc-50 hover:text-[#1C1C1C]',
                      focusRing,
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void markPaid()}
                    disabled={
                      busy === guide.vendorId ||
                      guide.utr.trim().length < 6 ||
                      guide.note.trim().length < 3
                    }
                    className={cn(
                      'inline-flex h-10 items-center justify-center rounded-xl bg-[#6B1D2E] px-5 text-xs font-semibold text-white shadow-xs hover:bg-[#5A1926] disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 transition-colors',
                      focusRing,
                    )}
                  >
                    {busy === guide.vendorId ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="animate-spin" size={14} />
                        Saving…
                      </span>
                    ) : (
                      'Mark paid'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HierarchyToggle({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  if (count === 0) return <span className="inline-block w-8" aria-hidden />;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? 'Hide dates' : 'Show dates'}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[#E9E3DD] bg-white px-1.5 text-[11px] font-semibold text-[#6B1D2E] hover:bg-[#F8E8EC]',
        focusRing,
      )}
    >
      <ChevronDown
        size={14}
        aria-hidden
        className={cn('transition-transform duration-150', open ? 'rotate-0' : '-rotate-90')}
      />
      <span className="pr-1 tabular-nums">{count}</span>
    </button>
  );
}

function SupplierIdentity({ row, state }: { row: Row; state: RowState }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <SupplierMark name={row.supplier} logoUrl={row.logoUrl} size="md" />
      <div className="min-w-0">
        <Link
          href={`/admin/finance/payables/${row.vendorId}`}
          className={cn(
            'block truncate font-semibold text-sm text-[#1C1C1C] hover:text-[#6B1D2E] transition-colors',
            focusRing,
          )}
        >
          {row.supplier}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {row.supplierCode ? (
            <span className="truncate text-[11px] font-mono text-[#667085]">
              {row.supplierCode}
            </span>
          ) : null}
          <StatusPill tone={STATE_TONE[state]}>{stateLabel(row, state)}</StatusPill>
        </div>
      </div>
    </div>
  );
}

function MoneyItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[11px] text-[#667085]">{label}</dt>
      <dd className="font-semibold tabular-nums text-[#1C1C1C]">{value}</dd>
    </div>
  );
}

function PaidMark({ className }: { className?: string }) {
  return (
    <span
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 select-none',
        className,
      )}
    >
      <Check size={13} aria-hidden />
      Paid
    </span>
  );
}

function ActionButton({
  label,
  enabled,
  busy,
  title,
  onClick,
  className,
}: {
  label: string;
  enabled: boolean;
  busy: boolean;
  title?: string;
  onClick: () => void;
  className?: string;
}) {
  const on = enabled && !busy;
  return (
    <button
      type="button"
      disabled={!on}
      title={on ? undefined : title}
      onClick={(event) => {
        event.stopPropagation();
        if (on) onClick();
      }}
      className={cn(
        'inline-flex items-center justify-center rounded-xl px-4 py-1.5 text-xs font-semibold transition-all duration-150',
        focusRing,
        on
          ? 'bg-[#6B1D2E] text-white shadow-xs hover:bg-[#5A1926] hover:shadow-sm'
          : 'cursor-not-allowed bg-zinc-100 text-zinc-400 border border-zinc-200/60',
        className,
      )}
    >
      {busy ? (
        <span className="flex items-center gap-1.5">
          <Loader2 className="animate-spin" size={13} />
          Saving…
        </span>
      ) : (
        label
      )}
    </button>
  );
}

function PayButton({
  row,
  busy,
  onPay,
  label,
  className,
}: {
  row: Row;
  busy: string;
  onPay: (row: Row, day?: PayDate) => void;
  label: string;
  className?: string;
}) {
  const saving = busy === row.vendorId;
  if (!saving && settledClear(row)) return <PaidMark className={className} />;
  if ((row.dates ?? []).length === 0 && money(row.shownToPay) === 0 && money(row.settled) === 0) {
    return (
      <ActionButton
        label="Pay"
        enabled={false}
        busy={false}
        title={payTitle(row)}
        onClick={() => undefined}
        className={className}
      />
    );
  }
  return (
    <ActionButton
      label={label}
      enabled={money(row.shownToPay) > 0}
      busy={saving}
      title={payTitle(row)}
      onClick={() => onPay(row)}
      className={className}
    />
  );
}

function pageWindow(page: number, pages: number): number[] {
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const end = Math.min(pages, start + 4);
  const from = Math.max(1, end - 4);
  return Array.from({ length: end - from + 1 }, (_, index) => from + index);
}

function ListFooter({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const showPager = total > pageSize;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E9E3DD] bg-[#FAF7F2]/40 px-5 py-3 text-xs text-[#667085]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          Showing <span className="font-semibold text-[#1C1C1C]">{start}</span>–
          <span className="font-semibold text-[#1C1C1C]">{end}</span> of{' '}
          <span className="font-semibold text-[#1C1C1C]">{total}</span> suppliers
        </span>
        <Link
          href="/admin/ledger"
          className={cn(
            'font-semibold text-[#6B1D2E] hover:underline flex items-center gap-1',
            focusRing,
          )}
        >
          <span>Go to Old Wallet</span>
          <ArrowRight size={12} />
        </Link>
      </div>
      {showPager ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-xl border border-[#E9E3DD] bg-white text-[#667085] hover:text-[#1C1C1C] disabled:opacity-40 shadow-xs',
              focusRing,
            )}
          >
            <ChevronLeft size={15} />
          </button>
          {pageWindow(page, pages).map((number) => (
            <button
              key={number}
              type="button"
              aria-label={`Page ${number}`}
              aria-current={number === page ? 'page' : undefined}
              onClick={() => onPage(number)}
              className={cn(
                'h-8 min-w-8 rounded-xl px-2.5 text-xs font-semibold tabular-nums transition-colors',
                focusRing,
                number === page
                  ? 'bg-[#6B1D2E] text-white shadow-xs'
                  : 'border border-[#E9E3DD] bg-white text-[#1C1C1C] hover:bg-[#FAF7F2]',
              )}
            >
              {number}
            </button>
          ))}
          <button
            type="button"
            aria-label="Next page"
            disabled={page * pageSize >= total}
            onClick={() => onPage(page + 1)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-xl border border-[#E9E3DD] bg-white text-[#667085] hover:text-[#1C1C1C] disabled:opacity-40 shadow-xs',
              focusRing,
            )}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
