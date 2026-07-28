'use client';

/**
 * Order Workspace — primary Online Store ops screen.
 * Left: stage queues. Right: selected-order workbench (lines, stock, status, invoice).
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
import { useVendorOutletScope } from '@/hooks/useVendorOutletScope';
import { OrderWorkbenchPanel } from '@/components/features/vendor/orders/OrderWorkbenchPanel';
import { formatWorkbenchPrice, WORKBENCH_STATUS_LABELS } from '@/components/features/vendor/orders/types';

interface QueueOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  isPartial?: boolean;
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

function isOverSla(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() > 2 * 60 * 60 * 1000;
}

function customerLabel(o: QueueOrder) {
  return o.user?.businessName || o.user?.fullName || 'Customer';
}

export default function OrderWorkspace() {
  const searchParams = useSearchParams();
  const { outletQuery, scopeVersion } = useVendorOutletScope();
  const [stage, setStage] = useState<StageKey>(() =>
    stageFromStatusParam(searchParams.get('status')),
  );
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cancels, setCancels] = useState<CancelRow[]>([]);
  const [queues, setQueues] = useState<Record<Exclude<StageKey, 'cancel'>, QueueOrder[]>>({
    pending: [],
    accepted: [],
    packed: [],
    dispatch: [],
  });

  const loadQueues = useCallback(async () => {
    setLoading(true);
    try {
      const oq = outletQuery();
      const withOutlet = (path: string, status?: string) => {
        const url = new URL(path, window.location.origin);
        url.searchParams.set('limit', '40');
        if (status) url.searchParams.set('status', status);
        if (oq) {
          new URLSearchParams(oq.slice(1)).forEach((v, k) => url.searchParams.set(k, v));
        }
        return url.toString();
      };

      const [cRes, pRes, aRes, pkRes, dRes] = await Promise.all([
        fetch('/api/v1/vendor/cancel-requests?status=pending', { credentials: 'include' }),
        fetch(withOutlet('/api/v1/vendor/orders', 'pending'), { credentials: 'include' }),
        fetch(withOutlet('/api/v1/vendor/orders', 'accepted'), { credentials: 'include' }),
        fetch(withOutlet('/api/v1/vendor/orders', 'packed'), { credentials: 'include' }),
        fetch(withOutlet('/api/v1/vendor/orders', 'ready_for_dispatch'), { credentials: 'include' }),
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
    } catch {
      toast.error('Could not load workspace queues');
    } finally {
      setLoading(false);
    }
  }, [outletQuery, scopeVersion]);

  useEffect(() => {
    void loadQueues();
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
    const q = search.trim().toLowerCase();
    const match = (orderNumber: string, name: string) =>
      !q || orderNumber.toLowerCase().includes(q) || name.toLowerCase().includes(q);

    if (stage === 'cancel') {
      return cancels
        .filter((c) =>
          match(c.order.orderNumber, c.customer.fullName ?? ''),
        )
        .map((c) => ({
          id: c.order.id,
          orderNumber: c.order.orderNumber,
          secondary: `${c.customer.fullName ?? 'Customer'} · ${c.reason.slice(0, 48)}${c.reason.length > 48 ? '…' : ''}`,
          amount: Number(c.order.totalAmount),
          createdAt: c.createdAt,
          badge: 'Cancel request',
        }));
    }
    return (queues[stage] ?? [])
      .filter((o) => match(o.orderNumber, customerLabel(o)))
      .map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        secondary: customerLabel(o),
        amount: Number(o.totalAmount),
        createdAt: o.createdAt,
        badge: o.isPartial ? 'Partial' : WORKBENCH_STATUS_LABELS[o.status] ?? o.status,
      }));
  }, [stage, queues, cancels, search]);

  // Auto-select first row when stage changes / loads
  useEffect(() => {
    if (loading) return;
    if (selectedId && stageRows.some((r) => r.id === selectedId)) return;
    setSelectedId(stageRows[0]?.id ?? null);
  }, [loading, stage, stageRows, selectedId]);

  return (
    <div
      className="flex h-[calc(100vh-7.5rem)] min-h-[520px] flex-col overflow-hidden rounded-[16px] border border-[#EEEEEE] bg-[#F7F8FA]"
      data-testid="order-workspace"
    >
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEEEEE] bg-white px-[clamp(0.85rem,2vw,1.25rem)] py-3">
        <div>
          <h1 className="text-[clamp(1.15rem,2.5vw,1.4rem)] font-bold text-[#181725]">Order Workspace</h1>
          <p className="text-[12px] text-[#7C7C7C]">
            Review lines, validate stock, adjust fulfilment, and advance each order.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#AEAEAE]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Order / customer…"
              data-testid="workspace-search"
              className="h-10 w-[min(100%,220px)] rounded-[10px] border border-[#EEEEEE] bg-white pl-9 pr-3 text-[13px] outline-none focus:border-[#299E60]/40"
            />
          </div>
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
            href="/vendor/orders?view=list"
            data-testid="workspace-all-orders"
            className="inline-flex h-10 items-center rounded-[10px] border border-[#EEEEEE] bg-white px-3.5 text-[12px] font-bold text-[#181725] hover:bg-[#F7F8FA]"
          >
            All orders
          </Link>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Left rail */}
        <aside
          className="flex w-full shrink-0 flex-col border-b border-[#EEEEEE] bg-white lg:w-[min(100%,360px)] lg:border-b-0 lg:border-r"
          data-testid="workspace-rail"
        >
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
                      ? 'bg-[#299E60] text-white'
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

          <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid={`workspace-queue-${stage}`}>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-[#7C7C7C]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : stageRows.length === 0 ? (
              <p className="px-3 py-10 text-center text-[13px] text-[#AEAEAE]">Nothing in this queue.</p>
            ) : (
              <ul className="space-y-1">
                {stageRows.map((row) => {
                  const active = selectedId === row.id;
                  const sla = isOverSla(row.createdAt);
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        data-testid={`workspace-row-${row.id}`}
                        onClick={() => setSelectedId(row.id)}
                        className={cn(
                          'w-full rounded-[12px] border px-3 py-2.5 text-left transition-colors',
                          active
                            ? 'border-[#299E60]/40 bg-[#EEF8F1]'
                            : 'border-transparent bg-[#FAFAFA] hover:border-[#EEEEEE] hover:bg-white',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-[13px] font-bold text-[#181725]">{row.orderNumber}</p>
                          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#181725]">
                            {formatWorkbenchPrice(row.amount)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-[#7C7C7C]">{row.secondary}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-[#AEAEAE]">
                            {row.badge}
                          </span>
                          {sla && (
                            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                              &gt;2h
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

        {/* Right workbench */}
        <main className="min-h-0 min-w-0 flex-1 bg-white" data-testid="workspace-main">
          {selectedId ? (
            <OrderWorkbenchPanel
              key={selectedId}
              orderId={selectedId}
              onChanged={() => void loadQueues()}
            />
          ) : (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 p-10 text-center" data-testid="workspace-empty">
              <Package className="h-10 w-10 text-[#D0D0D0]" />
              <p className="text-[15px] font-bold text-[#181725]">Select an order to process</p>
              <p className="max-w-sm text-[13px] text-[#7C7C7C]">
                Choose a queue on the left, then review items, stock, and the next fulfilment step here.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
