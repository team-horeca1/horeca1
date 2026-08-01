'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  RETURNS_ACCENT_STYLE,
  RETURN_TYPES,
  isReturnUiStatus,
  toReturnUiStatus,
  type ReturnType,
  type ReturnUiStatus,
} from '@/modules/return/return.types';
import { ReturnsTable } from './ReturnsTable';
import { ReturnDetailDrawer } from './ReturnDetailDrawer';
import {
  RETURN_ITEM_REASON_LABELS,
  RETURN_STATUS_CHIPS,
  RETURN_TYPE_OPTIONS,
  RETURN_UI_STATUS_LABELS,
  type OutletOption,
  type ReturnListRow,
} from './returnConstants';

type ReturnsSummary = {
  total: number;
  byStatus: Array<{ status: string; count: number }>;
  byReason: Array<{ reason: string; count: number; qty: number }>;
  byCustomer: Array<{
    customerId: string;
    name: string;
    count: number;
    creditNoteTotal: number;
  }>;
  byProduct: Array<{
    productId: string;
    productName: string;
    productSku: string | null;
    returnCount: number;
    requestedQty: number;
    approvedQty: number;
  }>;
};

function parseStatusParam(raw: string | null): 'all' | ReturnUiStatus {
  if (!raw) return 'all';
  if (isReturnUiStatus(raw)) return raw;
  // Legacy DB status in URL → UI chip
  return toReturnUiStatus(raw);
}

function parseTypeParam(raw: string | null): '' | ReturnType {
  if (raw && (RETURN_TYPES as readonly string[]).includes(raw)) {
    return raw as ReturnType;
  }
  return '';
}

export function ReturnsWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<ReturnListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [status, setStatus] = useState<'all' | ReturnUiStatus>(() =>
    parseStatusParam(searchParams.get('status')),
  );
  const [type, setType] = useState<'' | ReturnType>(() => parseTypeParam(searchParams.get('type')));
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [dateFrom, setDateFrom] = useState(searchParams.get('from') ?? '');
  const [dateTo, setDateTo] = useState(searchParams.get('to') ?? '');
  const [outletId, setOutletId] = useState(searchParams.get('outlet') ?? '');
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [drawerId, setDrawerId] = useState<string | null>(searchParams.get('id'));
  const [summary, setSummary] = useState<ReturnsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadOutlets = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/vendor/outlets');
      const json = await res.json();
      if (json.success && Array.isArray(json.data?.outlets)) {
        setOutlets(
          (json.data.outlets as Array<{ id: string; name: string }>).map((o) => ({
            id: o.id,
            name: o.name,
          })),
        );
      }
    } catch {
      /* optional filter */
    }
  }, []);

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (type) params.set('type', type);
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (outletId) params.set('outletId', outletId);
    return params;
  }, [status, type, debouncedSearch, dateFrom, dateTo, outletId]);

  const buildQuery = useCallback(
    (cursor?: string | null) => {
      const params = buildFilterParams();
      params.set('limit', '20');
      if (cursor) params.set('cursor', cursor);
      return params.toString();
    },
    [buildFilterParams],
  );

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const qs = buildFilterParams().toString();
      const res = await fetch(`/api/v1/vendor/returns/summary${qs ? `?${qs}` : ''}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load summary');
      setSummary(json.data as ReturnsSummary);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [buildFilterParams]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const qs = buildFilterParams().toString();
      const res = await fetch(`/api/v1/vendor/returns/export${qs ? `?${qs}` : ''}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `returns-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success('Export downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/vendor/returns?${buildQuery()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load');
      setRows(json.data as ReturnListRow[]);
      setNextCursor(json.nextCursor ?? null);
      setHasMore(Boolean(json.hasMore));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load returns');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/v1/vendor/returns?${buildQuery(nextCursor)}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load');
      setRows((prev) => [...prev, ...(json.data as ReturnListRow[])]);
      setNextCursor(json.nextCursor ?? null);
      setHasMore(Boolean(json.hasMore));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadOutlets();
  }, [loadOutlets]);

  const syncUrl = (
    id: string | null,
    nextStatus: typeof status = status,
    nextType: typeof type = type,
  ) => {
    const params = new URLSearchParams();
    if (id) params.set('id', id);
    if (nextStatus !== 'all') params.set('status', nextStatus);
    if (nextType) params.set('type', nextType);
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    if (outletId) params.set('outlet', outletId);
    const qs = params.toString();
    router.replace(qs ? `/vendor/returns?${qs}` : '/vendor/returns');
  };

  const openDrawer = (id: string) => {
    setDrawerId(id);
    syncUrl(id);
  };

  const closeDrawer = () => {
    setDrawerId(null);
    syncUrl(null);
  };

  const setStatusChip = (key: 'all' | ReturnUiStatus) => {
    setStatus(key);
    syncUrl(drawerId, key);
  };

  return (
    <div className="space-y-5 pb-10" style={RETURNS_ACCENT_STYLE}>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-[#B45309]" aria-hidden />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#B45309]">
              Operations
            </span>
          </div>
          <h1 className="text-[24px] font-bold text-[#181725]">Returns</h1>
          <p className="text-[12px] text-[#AEAEAE]">
            Review → credit note or pickup — same flow as Delivery
          </p>
        </div>
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={exporting}
          title="Export filtered returns as CSV"
          className="h-[40px] px-3 rounded-[10px] bg-white border border-[#EEEEEE] text-[#7C7C7C] hover:bg-[#F5F5F5] flex items-center gap-1.5 text-[12px] font-semibold shadow-sm shrink-0 disabled:opacity-60"
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Export CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {RETURN_STATUS_CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setStatusChip(chip.key)}
            className={cn(
              'h-[32px] px-3 rounded-full text-[12px] font-bold border transition-colors',
              status === chip.key
                ? 'bg-[#B45309] text-white border-[#B45309]'
                : 'bg-white text-[#7C7C7C] border-[#EEEEEE] hover:border-[#B45309]/40 hover:text-[#B45309]',
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search return, order #, invoice, customer…"
            className="w-full h-[40px] pl-9 pr-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#B45309]/40 bg-white"
          />
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none bg-white"
          aria-label="From date"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none bg-white"
          aria-label="To date"
        />
        <select
          value={type}
          onChange={(e) => {
            const next = parseTypeParam(e.target.value || null);
            setType(next);
            syncUrl(drawerId, status, next);
          }}
          className="h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none bg-white min-w-[130px]"
        >
          {RETURN_TYPE_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {outlets.length > 0 && (
          <select
            value={outletId}
            onChange={(e) => setOutletId(e.target.value)}
            className="h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none bg-white min-w-[150px]"
          >
            <option value="">All outlets</option>
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {(summaryLoading || summary) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <SummaryCard
            title="By status"
            loading={summaryLoading}
            total={summary?.total}
            rows={(summary?.byStatus ?? []).slice(0, 6).map((r) => ({
              key: r.status,
              label:
                RETURN_UI_STATUS_LABELS[r.status as ReturnUiStatus] ??
                r.status.replace(/_/g, ' '),
              value: String(r.count),
            }))}
          />
          <SummaryCard
            title="By reason"
            loading={summaryLoading}
            rows={(summary?.byReason ?? []).slice(0, 6).map((r) => ({
              key: r.reason,
              label: RETURN_ITEM_REASON_LABELS[r.reason] ?? r.reason.replace(/_/g, ' '),
              value: `${r.count} · qty ${r.qty}`,
            }))}
          />
          <SummaryCard
            title="By customer"
            loading={summaryLoading}
            rows={(summary?.byCustomer ?? []).slice(0, 6).map((r) => ({
              key: r.customerId,
              label: r.name,
              value: String(r.count),
            }))}
          />
          <SummaryCard
            title="By product"
            loading={summaryLoading}
            rows={(summary?.byProduct ?? []).slice(0, 6).map((r) => ({
              key: r.productId,
              label: r.productSku ? `${r.productName} (${r.productSku})` : r.productName,
              value: `qty ${r.requestedQty}`,
            }))}
          />
        </div>
      )}

      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
        <ReturnsTable
          rows={rows}
          loading={loading}
          selectedId={drawerId}
          onSelect={openDrawer}
          hasMore={hasMore}
          onLoadMore={() => void loadMore()}
          loadingMore={loadingMore}
        />
      </div>

      <ReturnDetailDrawer
        open={!!drawerId}
        returnId={drawerId}
        onClose={closeDrawer}
        onUpdated={() => void load()}
      />
    </div>
  );
}

export function ReturnsWorkspacePage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-[#B45309]" />
        </div>
      }
    >
      <ReturnsWorkspace />
    </React.Suspense>
  );
}

function SummaryCard({
  title,
  loading,
  total,
  rows,
}: {
  title: string;
  loading: boolean;
  total?: number;
  rows: Array<{ key: string; label: string; value: string }>;
}) {
  return (
    <div className="bg-white rounded-[12px] border border-[#EEEEEE] shadow-sm p-3.5 min-h-[140px]">
      <div className="flex items-baseline justify-between gap-2 mb-2.5">
        <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-[#AEAEAE]">
          {title}
        </h2>
        {typeof total === 'number' && (
          <span className="text-[12px] font-bold text-[#181725]">{total} total</span>
        )}
      </div>
      {loading && !rows.length ? (
        <div className="flex justify-center py-6">
          <Loader2 size={16} className="animate-spin text-[#B45309]" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-[#AEAEAE] py-4">No data for filters</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.key} className="flex items-start justify-between gap-2 text-[12px]">
              <span className="text-[#181725] truncate min-w-0" title={row.label}>
                {row.label}
              </span>
              <span className="font-bold text-[#7C7C7C] shrink-0 tabular-nums">{row.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
