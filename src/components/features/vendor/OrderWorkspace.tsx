'use client';

/**
 * Order Workspace — primary Online Store ops hub (3-zone).
 * Left: stage queues + search / date / payment filters.
 * Center: selected-order workbench (lines, stock, status, invoice).
 * Right: Activity / Timeline / Status History from OrderEvent (lg+).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ClipboardList,
  Loader2,
  Package,
  RefreshCw,
  Search,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { personFirstCustomerLabel } from '@/lib/customerLabel';
import { useVendorOutletScope } from '@/hooks/useVendorOutletScope';
import { ATTENTION_LABELS, type AttentionReasonCode } from '@/lib/orderAttention';
import { OrderWorkbenchPanel } from '@/components/features/vendor/orders/OrderWorkbenchPanel';
import { ActivityRail } from '@/components/features/vendor/orders/ActivityRail';
import {
  formatWorkbenchPrice,
  WORKBENCH_STATUS_LABELS,
  type WorkbenchOrder,
} from '@/components/features/vendor/orders/types';

const POLL_MS = 20_000;

interface QueueOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  isPartial?: boolean;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  attentionReasons?: string[];
  user?: { fullName: string; businessName?: string };
}

interface CancelRow {
  id: string;
  reason: string;
  createdAt: string;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: number;
    createdAt?: string;
  };
  customer: { fullName: string | null; email: string | null };
}

type StageKey = 'cancel' | 'pending' | 'accepted' | 'packed' | 'dispatch';

function stageFromStatusParam(status: string | null): StageKey {
  switch (status) {
    case 'accepted':
    case 'confirmed':
      return 'accepted';
    case 'packed':
    case 'processing':
      return 'packed';
    case 'ready_for_dispatch':
    case 'dispatched':
      return 'dispatch';
    case 'new':
    case 'pending':
    default:
      return 'pending';
  }
}

const STAGES: {
  key: StageKey;
  title: string;
  icon: React.ElementType;
  statusParam?: string;
}[] = [
  { key: 'cancel', title: 'Cancel requests', icon: AlertTriangle },
  { key: 'pending', title: 'Pending', icon: ShoppingBag, statusParam: 'pending' },
  { key: 'accepted', title: 'Accepted', icon: Package, statusParam: 'accepted' },
  { key: 'packed', title: 'Packed', icon: ClipboardList, statusParam: 'packed' },
  { key: 'dispatch', title: 'Ready for Dispatch', icon: Truck, statusParam: 'ready_for_dispatch' },
];

function customerLabel(o: QueueOrder) {
  return personFirstCustomerLabel({
    fullName: o.user?.fullName,
    businessName: o.user?.businessName,
  });
}

export default function OrderWorkspace() {
  const searchParams = useSearchParams();
  const { outletQuery, scopeVersion } = useVendorOutletScope();
  const [stage, setStage] = useState<StageKey>(() =>
    stageFromStatusParam(searchParams.get('status')),
  );
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [loading, setLoading] = useState(true);
  const initialLoadDone = React.useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedOrder, setLoadedOrder] = useState<WorkbenchOrder | null>(null);
  const [cancels, setCancels] = useState<CancelRow[]>([]);
  const [queues, setQueues] = useState<Record<Exclude<StageKey, 'cancel'>, QueueOrder[]>>({
    pending: [],
    accepted: [],
    packed: [],
    dispatch: [],
  });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const loadQueues = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent || initialLoadDone.current;
      if (!silent) setLoading(true);
      try {
        const oq = outletQuery();
        const withFilters = (path: string, status?: string) => {
          const url = new URL(path, window.location.origin);
          url.searchParams.set('limit', '40');
          if (status) url.searchParams.set('status', status);
          if (debouncedSearch) url.searchParams.set('search', debouncedSearch);
          if (dateFrom) url.searchParams.set('dateFrom', dateFrom);
          if (dateTo) url.searchParams.set('dateTo', dateTo);
          if (paymentStatus) url.searchParams.set('paymentStatus', paymentStatus);
          if (paymentMethod) url.searchParams.set('paymentMethod', paymentMethod);
          if (oq) {
            new URLSearchParams(oq.slice(1)).forEach((v, k) => url.searchParams.set(k, v));
          }
          return url.toString();
        };

        const [cRes, pRes, aRes, pkRes, dRes] = await Promise.all([
          fetch('/api/v1/vendor/cancel-requests?status=pending', { credentials: 'include' }),
          fetch(withFilters('/api/v1/vendor/orders', 'pending'), { credentials: 'include' }),
          fetch(withFilters('/api/v1/vendor/orders', 'accepted'), { credentials: 'include' }),
          fetch(withFilters('/api/v1/vendor/orders', 'packed'), { credentials: 'include' }),
          fetch(withFilters('/api/v1/vendor/orders', 'ready_for_dispatch'), {
            credentials: 'include',
          }),
        ]);

        const [cJson, pJson, aJson, pkJson, dJson] = await Promise.all([
          cRes.json(),
          pRes.json(),
          aRes.json(),
          pkRes.json(),
          dRes.json(),
        ]);

        if (cJson.success) setCancels(Array.isArray(cJson.data) ? cJson.data : []);
        setQueues({
          pending: pJson.success ? (pJson.data?.orders ?? []) : [],
          accepted: aJson.success ? (aJson.data?.orders ?? []) : [],
          packed: pkJson.success ? (pkJson.data?.orders ?? []) : [],
          dispatch: dJson.success ? (dJson.data?.orders ?? []) : [],
        });
        initialLoadDone.current = true;
      } catch {
        if (!silent) toast.error('Could not load workspace queues');
      } finally {
        setLoading(false);
      }
    },
    [outletQuery, scopeVersion, debouncedSearch, dateFrom, dateTo, paymentStatus, paymentMethod],
  );

  useEffect(() => {
    void loadQueues();
  }, [loadQueues]);

  // Light poll while Workspace is open (15–30s band)
  useEffect(() => {
    const id = window.setInterval(() => {
      void loadQueues({ silent: true });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [loadQueues]);

  const counts = useMemo(
    () => ({
      cancel: cancels.length,
      pending: queues.pending.length,
      accepted: queues.accepted.length,
      packed: queues.packed.length,
      dispatch: queues.dispatch.length,
    }),
    [cancels, queues],
  );

  const stageRows = useMemo(() => {
    if (stage === 'cancel') {
      const q = search.trim().toLowerCase();
      return cancels
        .filter((c) => {
          if (!q) return true;
          const name = c.customer.fullName ?? '';
          return (
            c.order.orderNumber.toLowerCase().includes(q) || name.toLowerCase().includes(q)
          );
        })
        .map((c) => ({
          id: c.order.id,
          orderNumber: c.order.orderNumber,
          secondary: `${c.customer.fullName ?? 'Customer'} · ${c.reason.slice(0, 48)}${c.reason.length > 48 ? '…' : ''}`,
          amount: Number(c.order.totalAmount),
          createdAt: c.createdAt,
          badge: 'Cancel request',
          attentionReasons: ['cancel_requested'] as string[],
        }));
    }
    return (queues[stage] ?? []).map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      secondary: customerLabel(o),
      amount: Number(o.totalAmount),
      createdAt: o.createdAt,
      badge: o.isPartial ? 'Partial' : WORKBENCH_STATUS_LABELS[o.status] ?? o.status,
      attentionReasons: o.attentionReasons ?? [],
    }));
  }, [stage, queues, cancels, search]);

  useEffect(() => {
    if (loading) return;
    if (selectedId && stageRows.some((r) => r.id === selectedId)) return;
    setSelectedId(stageRows[0]?.id ?? null);
  }, [loading, stage, stageRows, selectedId]);

  useEffect(() => {
    setLoadedOrder(null);
  }, [selectedId]);

  const handleOrderLoaded = useCallback((order: WorkbenchOrder | null) => {
    setLoadedOrder(order);
  }, []);

  return (
    <div
      className="flex h-[calc(100vh-7.5rem)] min-h-[520px] flex-col overflow-hidden rounded-[16px] border border-[#EEEEEE] bg-[#F7F8FA]"
      data-testid="order-workspace"
    >
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEEEEE] bg-white px-[clamp(0.85rem,2vw,1.25rem)] py-3">
        <div>
          <h1 className="text-[clamp(1.15rem,2.5vw,1.4rem)] font-bold text-[#181725]">
            Order Workspace
          </h1>
          <p className="text-[12px] text-[#7C7C7C]">
            Queue · workbench · activity — process pending through dispatch without leaving this hub.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadQueues()}
            data-testid="workspace-refresh"
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-[#EEEEEE] bg-white px-3 text-[12px] font-bold text-[#7C7C7C] hover:bg-[#F7F8FA]"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          <Link
            href="/vendor/orders"
            data-testid="workspace-all-orders"
            className="inline-flex h-10 items-center rounded-[10px] border border-[#EEEEEE] bg-white px-3.5 text-[12px] font-bold text-[#181725] hover:bg-[#F7F8FA]"
          >
            All orders
          </Link>
        </div>
      </div>

      {/* 3-zone body: stack on small screens; columns at lg+ */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row" data-testid="workspace-zones">
        {/* Left — queue */}
        <aside
          className="flex w-full shrink-0 flex-col border-b border-[#EEEEEE] bg-white lg:w-[min(100%,320px)] lg:border-b-0 lg:border-r"
          data-testid="workspace-rail"
        >
          <div className="space-y-2 border-b border-[#EEEEEE] p-2" data-testid="workspace-filters">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#AEAEAE]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Order # / customer / phone…"
                data-testid="workspace-search"
                className="h-9 w-full rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA] pl-9 pr-3 text-[12px] outline-none focus:border-primary/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="block">
                <span className="sr-only">From date</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  data-testid="workspace-date-from"
                  className="h-9 w-full rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA] px-2 text-[11px] text-[#181725] outline-none focus:border-primary/40"
                />
              </label>
              <label className="block">
                <span className="sr-only">To date</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  data-testid="workspace-date-to"
                  className="h-9 w-full rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA] px-2 text-[11px] text-[#181725] outline-none focus:border-primary/40"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                data-testid="workspace-payment-status"
                className="h-9 rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA] px-2 text-[11px] font-semibold text-[#181725] outline-none focus:border-primary/40"
              >
                <option value="">Payment: all</option>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
                <option value="refunded">Refunded</option>
              </select>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                data-testid="workspace-payment-method"
                className="h-9 rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA] px-2 text-[11px] font-semibold text-[#181725] outline-none focus:border-primary/40"
              >
                <option value="">Method: all</option>
                <option value="cod">COD / Cash</option>
                <option value="online">Online</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          </div>

          <div className="flex gap-1 overflow-x-auto border-b border-[#EEEEEE] p-2">
            {STAGES.map((s) => {
              const Icon = s.icon;
              const count = counts[s.key];
              return (
                <button
                  key={s.key}
                  type="button"
                  data-testid={`workspace-stage-${s.key}`}
                  onClick={() => setStage(s.key)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 py-2 text-[11px] font-bold transition-colors',
                    stage === s.key
                      ? 'bg-primary text-white'
                      : 'bg-[#F5F5F5] text-[#7C7C7C] hover:bg-[#EEEEEE]',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {s.title}
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                      stage === s.key ? 'bg-white/20' : 'bg-white text-[#181725]',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto p-2"
            data-testid={`workspace-queue-${stage}`}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-[#7C7C7C]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : stageRows.length === 0 ? (
              <p className="px-3 py-10 text-center text-[13px] text-[#AEAEAE]">
                Nothing in this queue.
              </p>
            ) : (
              <ul className="space-y-1">
                {stageRows.map((row) => {
                  const active = selectedId === row.id;
                  const attention = row.attentionReasons ?? [];
                  const topFlag = attention[0];
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        data-testid={`workspace-row-${row.id}`}
                        onClick={() => setSelectedId(row.id)}
                        className={cn(
                          'w-full rounded-[12px] border px-3 py-2.5 text-left transition-colors',
                          active
                            ? 'border-primary/40 bg-primary-light'
                            : 'border-transparent bg-[#FAFAFA] hover:border-[#EEEEEE] hover:bg-white',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-[13px] font-bold text-[#181725]">
                            {row.orderNumber}
                          </p>
                          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#181725]">
                            {formatWorkbenchPrice(row.amount)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-[#7C7C7C]">{row.secondary}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-[#AEAEAE]">
                            {row.badge}
                          </span>
                          {attention.length > 0 && (
                            <span
                              className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800"
                              data-testid={`workspace-attention-badge-${row.id}`}
                              title={attention
                                .map((c) => ATTENTION_LABELS[c as AttentionReasonCode] ?? c)
                                .join(' · ')}
                            >
                              {attention.length > 1
                                ? `${attention.length} flags`
                                : ATTENTION_LABELS[topFlag as AttentionReasonCode] ?? topFlag}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Center — workbench */}
        <main
          className="min-h-0 min-w-0 flex-1 border-b border-[#EEEEEE] bg-white lg:border-b-0"
          data-testid="workspace-main"
        >
          {selectedId ? (
            <OrderWorkbenchPanel
              key={selectedId}
              orderId={selectedId}
              showEmbeddedActivity={false}
              onChanged={() => void loadQueues({ silent: true })}
              onOrderLoaded={handleOrderLoaded}
            />
          ) : (
            <div
              className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 p-10 text-center"
              data-testid="workspace-empty"
            >
              <Package className="h-10 w-10 text-[#D0D0D0]" />
              <p className="text-[15px] font-bold text-[#181725]">Select an order to process</p>
              <p className="max-w-sm text-[13px] text-[#7C7C7C]">
                Choose a queue on the left, then review items, stock, and the next fulfilment step
                here. Activity stays visible on the right on large screens.
              </p>
            </div>
          )}
        </main>

        {/* Right — activity (permanent on lg+) */}
        <div className="flex min-h-[240px] w-full shrink-0 flex-col lg:min-h-0 lg:w-[min(100%,300px)]">
          {selectedId && loadedOrder ? (
            <ActivityRail
              events={loadedOrder.events ?? []}
              paymentStatus={loadedOrder.paymentStatus}
              paymentMethod={loadedOrder.paymentMethod}
              totalAmount={Number(loadedOrder.totalAmount)}
              orderNumber={loadedOrder.orderNumber}
            />
          ) : (
            <aside
              className="flex h-full min-h-[200px] flex-col items-center justify-center border-t border-[#EEEEEE] bg-white p-6 text-center lg:border-l lg:border-t-0"
              data-testid="workspace-activity-rail"
            >
              <p className="text-[13px] font-semibold text-[#181725]">Activity</p>
              <p className="mt-1 text-[12px] text-[#AEAEAE]">
                Timeline appears when an order is selected.
              </p>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
