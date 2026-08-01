'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  RETURNS_ACCENT_STYLE,
  RETURN_STATUSES,
  RETURN_TYPES,
  type ReturnStatus,
  type ReturnType,
} from '@/modules/return/return.types';
import { ReturnsTable } from './ReturnsTable';
import { ReturnDetailDrawer } from './ReturnDetailDrawer';
import {
  RETURN_STATUS_CHIPS,
  RETURN_TYPE_OPTIONS,
  type OutletOption,
  type ReturnListRow,
} from './returnConstants';

function parseStatusParam(raw: string | null): 'all' | ReturnStatus {
  if (raw && (RETURN_STATUSES as readonly string[]).includes(raw)) {
    return raw as ReturnStatus;
  }
  return 'all';
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

  const [status, setStatus] = useState<'all' | ReturnStatus>(() =>
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

  const buildQuery = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      params.set('limit', '20');
      if (status !== 'all') params.set('status', status);
      if (type) params.set('type', type);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (outletId) params.set('outletId', outletId);
      if (cursor) params.set('cursor', cursor);
      return params.toString();
    },
    [status, type, debouncedSearch, dateFrom, dateTo, outletId],
  );

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

  const setStatusChip = (key: 'all' | ReturnStatus) => {
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
            Review, inspect, disposition, and resolve customer returns — separate from order status
          </p>
        </div>
      </div>

      {/* Status chips */}
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

      {/* Filters */}
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
