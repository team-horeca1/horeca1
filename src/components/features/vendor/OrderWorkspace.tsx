'use client';

/**
 * Order Workspace — single next-action hub for store order ops.
 * Surfaces queues (cancel reviews, new/pending, pack, dispatch) with
 * the primary next status advance inline — composition over list/detail.
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Package,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useVendorOutletScope } from '@/hooks/useVendorOutletScope';

interface QueueOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
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
  };
  customer: { fullName: string | null; email: string | null };
}

type QueueKey = 'cancel' | 'pending' | 'accepted' | 'packed' | 'dispatch';

const QUEUES: {
  key: QueueKey;
  title: string;
  hint: string;
  nextAction?: { status: string; label: string };
  listHref: string;
  icon: React.ElementType;
  accent: string;
}[] = [
  {
    key: 'cancel',
    title: 'Cancel requests',
    hint: 'Customer asked to cancel — approve or reject on the order',
    listHref: '/vendor/orders?status=pending',
    icon: AlertTriangle,
    accent: 'border-rose-200 bg-rose-50/60',
  },
  {
    key: 'pending',
    title: 'Pending',
    hint: 'Auto-accepted — adjust lines or Mark as Accepted',
    nextAction: { status: 'confirmed', label: 'Mark Accepted' },
    listHref: '/vendor/orders?status=pending',
    icon: ShoppingBag,
    accent: 'border-amber-200 bg-amber-50/50',
  },
  {
    key: 'accepted',
    title: 'Accepted',
    hint: 'Ready to pack',
    nextAction: { status: 'processing', label: 'Mark Packed' },
    listHref: '/vendor/orders?status=accepted',
    icon: Package,
    accent: 'border-blue-200 bg-blue-50/50',
  },
  {
    key: 'packed',
    title: 'Packed',
    hint: 'Ready for dispatch handoff',
    nextAction: { status: 'ready_for_dispatch', label: 'Ready for Dispatch' },
    listHref: '/vendor/orders?status=packed',
    icon: ClipboardList,
    accent: 'border-indigo-200 bg-indigo-50/50',
  },
  {
    key: 'dispatch',
    title: 'Ready for Dispatch',
    hint: 'Mark Dispatched when the van leaves',
    nextAction: { status: 'shipped', label: 'Mark Dispatched' },
    listHref: '/vendor/orders?status=ready_for_dispatch',
    icon: Truck,
    accent: 'border-cyan-200 bg-cyan-50/50',
  },
];

function formatINR(v: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format(v);
}

function customerLabel(o: QueueOrder) {
  return o.user?.businessName || o.user?.fullName || 'Customer';
}

export default function OrderWorkspace() {
  const { outletQuery, scopeVersion } = useVendorOutletScope();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancels, setCancels] = useState<CancelRow[]>([]);
  const [queues, setQueues] = useState<Record<Exclude<QueueKey, 'cancel'>, QueueOrder[]>>({
    pending: [],
    accepted: [],
    packed: [],
    dispatch: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const oq = outletQuery();
      const withOutlet = (path: string) => {
        const url = new URL(path, window.location.origin);
        url.searchParams.set('limit', '8');
        if (oq) {
          new URLSearchParams(oq.slice(1)).forEach((v, k) => url.searchParams.set(k, v));
        }
        return url.toString();
      };

      const [cRes, pRes, aRes, pkRes, dRes] = await Promise.all([
        fetch('/api/v1/vendor/cancel-requests?status=pending', { credentials: 'include' }),
        fetch(withOutlet('/api/v1/vendor/orders?status=pending'), { credentials: 'include' }),
        fetch(withOutlet('/api/v1/vendor/orders?status=accepted'), { credentials: 'include' }),
        fetch(withOutlet('/api/v1/vendor/orders?status=packed'), { credentials: 'include' }),
        fetch(withOutlet('/api/v1/vendor/orders?status=ready_for_dispatch'), { credentials: 'include' }),
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
    void load();
  }, [load]);

  const advance = async (orderId: string, status: string, label: string) => {
    setBusyId(orderId);
    try {
      const res = await fetch(`/api/v1/vendor/orders/${orderId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.message || 'Update failed');
      }
      toast.success(label);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const queueItems = (key: QueueKey): Array<{ id: string; primary: string; secondary: string; href: string; amount?: number }> => {
    if (key === 'cancel') {
      return cancels.map((c) => ({
        id: c.id,
        primary: c.order.orderNumber,
        secondary: `${c.customer.fullName ?? 'Customer'} · ${c.reason.slice(0, 60)}${c.reason.length > 60 ? '…' : ''}`,
        href: `/vendor/orders/${c.order.id}`,
        amount: Number(c.order.totalAmount),
      }));
    }
    return (queues[key] ?? []).map((o) => ({
      id: o.id,
      primary: o.orderNumber,
      secondary: customerLabel(o),
      href: `/vendor/orders/${o.id}`,
      amount: Number(o.totalAmount),
    }));
  };

  const countFor = (key: QueueKey) => (key === 'cancel' ? cancels.length : queues[key].length);

  return (
    <div className="space-y-[clamp(1rem,2vw,1.5rem)]" data-testid="order-workspace">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[#7C7C7C]">
            Order Management
          </p>
          <h1 className="text-[clamp(1.35rem,3vw,1.75rem)] font-bold text-[#181725]">
            Order Workspace
          </h1>
          <p className="mt-1 max-w-xl text-[14px] text-[#7C7C7C]">
            One screen for what needs attention next — cancel reviews and fulfilment advances.
          </p>
        </div>
        <Link
          href="/vendor/orders"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E2E2] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#181725] hover:bg-[#F7F8FA]"
          data-testid="workspace-full-list-link"
        >
          Full order list
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-[#7C7C7C]">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading queues…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {QUEUES.map((q) => {
            const Icon = q.icon;
            const items = queueItems(q.key);
            const count = countFor(q.key);
            return (
              <section
                key={q.key}
                data-testid={`workspace-queue-${q.key}`}
                className={cn(
                  'flex min-h-[280px] flex-col rounded-2xl border p-[clamp(0.85rem,2vw,1.15rem)]',
                  q.accent,
                )}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 rounded-lg bg-white/80 p-2 shadow-sm">
                      <Icon className="h-4 w-4 text-[#181725]" />
                    </span>
                    <div>
                      <h2 className="text-[15px] font-bold text-[#181725]">{q.title}</h2>
                      <p className="mt-0.5 text-[12px] leading-snug text-[#7C7C7C]">{q.hint}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[13px] font-bold text-[#181725] tabular-nums shadow-sm">
                    {count}
                  </span>
                </div>

                <ul className="flex-1 space-y-2">
                  {items.length === 0 ? (
                    <li className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-6 text-[13px] text-[#AEAEAE]">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#299E60]" />
                      Nothing waiting here
                    </li>
                  ) : (
                    items.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center gap-2 rounded-xl border border-white/80 bg-white/90 px-3 py-2.5 shadow-sm"
                      >
                        <Link href={row.href} className="min-w-0 flex-1 hover:opacity-80">
                          <p className="truncate text-[13px] font-bold text-[#181725]">{row.primary}</p>
                          <p className="truncate text-[11px] text-[#7C7C7C]">{row.secondary}</p>
                        </Link>
                        {row.amount != null && (
                          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#181725]">
                            {formatINR(row.amount)}
                          </span>
                        )}
                        {q.key === 'cancel' ? (
                          <Link
                            href={row.href}
                            className="shrink-0 rounded-lg bg-[#181725] px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-black"
                          >
                            Review
                          </Link>
                        ) : q.nextAction ? (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void advance(row.id, q.nextAction!.status, q.nextAction!.label)}
                            className="shrink-0 rounded-lg bg-[#299E60] px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-[#248a54] disabled:opacity-50"
                          >
                            {busyId === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              q.nextAction.label
                            )}
                          </button>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>

                <Link
                  href={q.listHref}
                  className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[#299E60] hover:underline"
                >
                  Open full list
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
