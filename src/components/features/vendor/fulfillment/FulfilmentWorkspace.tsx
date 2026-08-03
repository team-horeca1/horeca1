'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Loader2, Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  DELIVERY_FILTER_KEYS,
  type DeliveryFilterKey,
} from '@/modules/fulfillment/delivery.scope';
import { FULFILMENT_ACCENT_STYLE } from '@/modules/fulfillment/fulfillment.types';
import { FulfilmentTable } from './FulfilmentTable';
import { FulfilmentDetailDrawer } from './FulfilmentDetailDrawer';
import { DeliveryBoysPanel } from './DeliveryBoysPanel';
import {
  canBulkAssign,
  FULFILMENT_STATUS_CHIPS,
  PAYMENT_METHOD_OPTIONS,
  type FulfilmentListRow,
} from './fulfillmentConstants';

function parseStatusParam(raw: string | null): 'all' | DeliveryFilterKey {
  if (raw && (DELIVERY_FILTER_KEYS as readonly string[]).includes(raw)) {
    return raw as DeliveryFilterKey;
  }
  return 'all';
}

type WorkspaceTab = 'delivery' | 'boys';

function parseTab(raw: string | null): WorkspaceTab {
  return raw === 'boys' ? 'boys' : 'delivery';
}

export function FulfilmentWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<WorkspaceTab>(() => parseTab(searchParams.get('tab')));
  const [boyId, setBoyId] = useState<string | null>(searchParams.get('boyId'));

  const [rows, setRows] = useState<FulfilmentListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [status, setStatus] = useState<'all' | DeliveryFilterKey>(() =>
    parseStatusParam(searchParams.get('status')),
  );
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [dateFrom, setDateFrom] = useState(searchParams.get('from') ?? '');
  const [dateTo, setDateTo] = useState(searchParams.get('to') ?? '');
  const [paymentMethod, setPaymentMethod] = useState(searchParams.get('pay') ?? '');

  const [drawerId, setDrawerId] = useState<string | null>(searchParams.get('id'));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [boyName, setBoyName] = useState('');
  const [boyPhone, setBoyPhone] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildQuery = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      params.set('limit', '20');
      if (status !== 'all') params.set('status', status);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (paymentMethod) params.set('paymentMethod', paymentMethod);
      if (cursor) params.set('cursor', cursor);
      return params.toString();
    },
    [status, debouncedSearch, dateFrom, dateTo, paymentMethod],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/vendor/fulfilments?${buildQuery()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load');
      setRows(json.data as FulfilmentListRow[]);
      setNextCursor(json.nextCursor ?? null);
      setHasMore(Boolean(json.hasMore));
      setSelectedIds(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load deliveries');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/v1/vendor/fulfilments?${buildQuery(nextCursor)}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load');
      setRows((prev) => [...prev, ...(json.data as FulfilmentListRow[])]);
      setNextCursor(json.nextCursor ?? null);
      setHasMore(Boolean(json.hasMore));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (tab === 'delivery') void load();
  }, [load, tab]);

  const syncUrl = (opts?: {
    id?: string | null;
    nextStatus?: typeof status;
    nextTab?: WorkspaceTab;
    nextBoyId?: string | null;
  }) => {
    const nextTab = opts?.nextTab ?? tab;
    const id = opts?.id === undefined ? drawerId : opts.id;
    const nextStatus = opts?.nextStatus ?? status;
    const nextBoyId = opts?.nextBoyId === undefined ? boyId : opts.nextBoyId;
    const params = new URLSearchParams();
    if (nextTab !== 'delivery') params.set('tab', nextTab);
    if (nextTab === 'boys' && nextBoyId) params.set('boyId', nextBoyId);
    if (nextTab === 'delivery') {
      if (id) params.set('id', id);
      if (nextStatus !== 'all') params.set('status', nextStatus);
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (paymentMethod) params.set('pay', paymentMethod);
    }
    const qs = params.toString();
    router.replace(qs ? `/vendor/delivery?${qs}` : '/vendor/delivery');
  };

  const openDrawer = (id: string) => {
    setDrawerId(id);
    syncUrl({ id });
  };

  const closeDrawer = () => {
    setDrawerId(null);
    syncUrl({ id: null });
  };

  const setStatusChip = (key: 'all' | DeliveryFilterKey) => {
    setStatus(key);
    syncUrl({ nextStatus: key });
  };

  const setWorkspaceTab = (next: WorkspaceTab) => {
    setTab(next);
    if (next === 'boys') {
      setDrawerId(null);
      syncUrl({ nextTab: next, id: null });
    } else {
      syncUrl({ nextTab: next, nextBoyId: null });
    }
  };

  const selectBoy = (id: string | null) => {
    setBoyId(id);
    syncUrl({ nextTab: 'boys', nextBoyId: id });
  };

  const toggleSelect = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row || !canBulkAssign(row.status)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllAssignable = () => {
    const assignable = rows.filter((r) => canBulkAssign(r.status)).map((r) => r.id);
    setSelectedIds((prev) => {
      const allSelected = assignable.length > 0 && assignable.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(assignable);
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkOpen(false);
  };

  const runBulkAssign = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!boyName.trim() || boyPhone.trim().length < 8) {
      toast.error('Enter delivery boy name and phone');
      return;
    }
    setBulkBusy(true);
    try {
      const res = await fetch('/api/v1/vendor/fulfilments/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign_and_dispatch',
          fulfilmentIds: ids,
          deliveryBoyName: boyName.trim(),
          deliveryBoyPhone: boyPhone.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Bulk assign failed');
      const results = (json.data?.results ?? []) as Array<{
        id: string;
        ok: boolean;
        error?: string;
      }>;
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      if (failCount === 0) {
        toast.success(`Assigned & dispatched ${okCount} order${okCount === 1 ? '' : 's'}`);
      } else if (okCount === 0) {
        toast.error(results[0]?.error || 'Bulk assign failed');
      } else {
        toast.warning(`${okCount} dispatched, ${failCount} failed`);
      }
      setBulkOpen(false);
      setBoyName('');
      setBoyPhone('');
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk assign failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-5 pb-10" style={FULFILMENT_ACCENT_STYLE}>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-[#0F766E]" aria-hidden />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0F766E]">
              Operations
            </span>
          </div>
          <h1 className="text-[24px] font-bold text-[#181725]">Delivery</h1>
          <p className="text-[12px] text-[#AEAEAE]">
            {tab === 'delivery'
              ? 'Accepted → Packed → Dispatched → Delivered (or failed attempt)'
              : 'Roster, portal links, and each boy’s assigned orders'}
          </p>
        </div>
      </div>

      <div className="flex gap-1 rounded-[12px] border border-[#EEEEEE] bg-white p-1 w-fit">
        {(
          [
            { key: 'delivery' as const, label: 'Delivery' },
            { key: 'boys' as const, label: 'Delivery Boy' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setWorkspaceTab(t.key)}
            className={cn(
              'h-[36px] px-4 rounded-[10px] text-[13px] font-bold transition-colors',
              tab === t.key
                ? 'bg-[#0F766E] text-white'
                : 'text-[#7C7C7C] hover:text-[#0F766E]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'boys' ? (
        <DeliveryBoysPanel boyId={boyId} onSelectBoy={selectBoy} />
      ) : (
        <>
      <div className="flex flex-wrap gap-2">
        {FULFILMENT_STATUS_CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setStatusChip(chip.key)}
            className={cn(
              'h-[32px] px-3 rounded-full text-[12px] font-bold border transition-colors',
              status === chip.key
                ? 'bg-[#0F766E] text-white border-[#0F766E]'
                : 'bg-white text-[#7C7C7C] border-[#EEEEEE] hover:border-[#0F766E]/40 hover:text-[#0F766E]',
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
            placeholder="Search order #, customer…"
            className="w-full h-[40px] pl-9 pr-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#0F766E]/40 bg-white"
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
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className="h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none bg-white min-w-[140px]"
        >
          {PAYMENT_METHOD_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {selectedCount > 0 && (
        <div className="sticky top-2 z-20 rounded-[12px] border border-[#0F766E]/30 bg-white shadow-md p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-bold text-[#181725]">
              {selectedCount} packed order{selectedCount === 1 ? '' : 's'} selected
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="h-[36px] px-3 rounded-[10px] border border-[#EEEEEE] text-[12px] font-bold text-[#7C7C7C] hover:bg-[#F5F5F5] flex items-center gap-1"
              >
                <X size={14} /> Clear
              </button>
              {!bulkOpen && (
                <button
                  type="button"
                  onClick={() => setBulkOpen(true)}
                  className="h-[36px] px-3 rounded-[10px] bg-[#0F766E] text-white text-[12px] font-bold hover:bg-[#0D9488] flex items-center gap-1.5"
                >
                  <Truck size={14} /> Assign delivery boy
                </button>
              )}
            </div>
          </div>

          {bulkOpen && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <input
                value={boyName}
                onChange={(e) => setBoyName(e.target.value)}
                placeholder="Delivery boy name"
                className="h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#0F766E]/40"
              />
              <input
                value={boyPhone}
                onChange={(e) => setBoyPhone(e.target.value)}
                placeholder="Phone number"
                className="h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#0F766E]/40"
              />
              <button
                type="button"
                disabled={bulkBusy || !boyName.trim() || boyPhone.trim().length < 8}
                onClick={() => void runBulkAssign()}
                className="h-[40px] px-4 rounded-[10px] bg-[#0F766E] text-white text-[13px] font-bold hover:bg-[#0D9488] disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
                Dispatch {selectedCount}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
        <FulfilmentTable
          rows={rows}
          loading={loading}
          selectedId={drawerId}
          onSelect={openDrawer}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAllAssignable={toggleSelectAllAssignable}
          hasMore={hasMore}
          onLoadMore={() => void loadMore()}
          loadingMore={loadingMore}
        />
      </div>

      <FulfilmentDetailDrawer
        open={!!drawerId}
        fulfilmentId={drawerId}
        onClose={closeDrawer}
        onUpdated={() => void load()}
      />
        </>
      )}
    </div>
  );
}

export function FulfilmentWorkspacePage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-[#0F766E]" />
        </div>
      }
    >
      <FulfilmentWorkspace />
    </React.Suspense>
  );
}
