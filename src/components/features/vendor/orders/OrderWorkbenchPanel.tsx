'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileDown,
  Loader2,
  Mail,
  Minus,
  Phone,
  Plus,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CancelRequestBanner } from './CancelRequestBanner';
import {
  formatWorkbenchDateTime,
  formatWorkbenchPrice,
  nextWorkbenchStatus,
  WORKBENCH_EVENT_LABELS,
  WORKBENCH_STATUS_LABELS,
  type WorkbenchOrder,
} from './types';

export function OrderWorkbenchPanel({
  orderId,
  onChanged,
  compactEvents = 6,
}: {
  orderId: string;
  onChanged?: () => void;
  compactEvents?: number;
}) {
  const [order, setOrder] = useState<WorkbenchOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fulfilledQtys, setFulfilledQtys] = useState<Record<string, number>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [activityTab, setActivityTab] = useState(false);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/vendor/orders/${orderId}`, { credentials: 'include' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load order');
      const data = json.data as WorkbenchOrder;
      setOrder(data);
      const init: Record<string, number> = {};
      for (const item of data.items) {
        init[item.id] = item.fulfilledQty ?? item.quantity;
      }
      setFulfilledQtys(init);
      setRejectReasons({});
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  const notifyChanged = () => {
    onChanged?.();
  };

  const isPartialDirty =
    !!order &&
    order.status === 'pending' &&
    order.items.some((item) => {
      const current = item.fulfilledQty > 0 ? item.fulfilledQty : item.quantity;
      return (fulfilledQtys[item.id] ?? current) !== current;
    });

  const isAmendDirty =
    !!order &&
    ['confirmed', 'processing', 'ready_for_dispatch'].includes(order.status) &&
    order.items.some(
      (item) =>
        (fulfilledQtys[item.id] ?? item.fulfilledQty ?? item.quantity) !==
        (item.fulfilledQty ?? item.quantity),
    );

  const canEditQty =
    !!order && ['pending', 'confirmed', 'processing', 'ready_for_dispatch'].includes(order.status);

  const setQty = (itemId: string, next: number, max: number) => {
    setFulfilledQtys((prev) => ({
      ...prev,
      [itemId]: Math.max(0, Math.min(max, next)),
    }));
  };

  const saveAdjustments = async () => {
    if (!order) return;
    const zeroWithoutReason = order.items.filter((item) => {
      const q = fulfilledQtys[item.id] ?? item.quantity;
      return q === 0 && !(rejectReasons[item.id]?.trim());
    });
    if (zeroWithoutReason.length > 0) {
      toast.error('Enter a rejection reason for each line set to quantity 0.');
      return;
    }
    setBusy(true);
    try {
      const items = order.items.map((item) => ({
        itemId: item.id,
        fulfilledQty: fulfilledQtys[item.id] ?? item.quantity,
        ...(fulfilledQtys[item.id] === 0 && rejectReasons[item.id]
          ? { reason: rejectReasons[item.id].trim() }
          : {}),
      }));
      const isAmend = order.status !== 'pending';
      const res = await fetch(`/api/v1/vendor/orders/${orderId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, ...(isAmend ? { mode: 'amend' } : {}) }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Save failed');
      toast.success(
        isAmend
          ? 'Order quantities updated.'
          : 'Quantity adjustments saved. Order remains Pending until you advance status.',
      );
      await fetchOrder();
      notifyChanged();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const advanceStatus = async (status: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/vendor/orders/${orderId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Update failed');
      toast.success(`Order marked as ${WORKBENCH_STATUS_LABELS[status] ?? status}.`);
      await fetchOrder();
      notifyChanged();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async () => {
    const reason = window.prompt('Cancellation reason (min 3 characters):');
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/vendor/orders/${orderId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', reason: reason.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Cancel failed');
      toast.success('Order cancelled. Inventory released.');
      await fetchOrder();
      notifyChanged();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setBusy(false);
    }
  };

  const applySubstitute = async (itemId: string, substituteProductId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/vendor/orders/${orderId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'substitute', itemId, substituteProductId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Substitute failed');
      toast.success('Substitute applied.');
      await fetchOrder();
      notifyChanged();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Substitute failed');
    } finally {
      setBusy(false);
    }
  };

  const downloadInvoice = async () => {
    try {
      const res = await fetch(`/api/v1/vendor/orders/${orderId}/invoice`, { credentials: 'include' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || 'Invoice unavailable');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${order?.orderNumber ?? 'invoice'}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success('Invoice downloaded');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Invoice failed');
    }
  };

  if (loading) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center gap-2 text-[#7C7C7C]" data-testid="workbench-loading">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading order…
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 p-8 text-center" data-testid="workbench-error">
        <AlertTriangle className="h-8 w-8 text-[#D97706]" />
        <p className="text-[14px] font-semibold text-[#181725]">{error ?? 'Order not found'}</p>
        <button
          type="button"
          onClick={() => void fetchOrder()}
          className="text-[13px] font-bold text-[#299E60] hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const next = nextWorkbenchStatus(order.status);
  const events = order.events ?? [];
  const shownEvents = activityTab ? events : events.slice(0, compactEvents);
  const customerName = order.user.businessName || order.user.fullName;
  const addr = order.deliveryAddressSnapshot;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-[clamp(0.75rem,2vw,1.25rem)]" data-testid="order-workbench">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EEEEEE] pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[clamp(1.1rem,2.5vw,1.35rem)] font-bold text-[#181725]" data-testid="workbench-order-number">
              {order.orderNumber}
            </h2>
            <span
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide',
                order.status === 'cancelled'
                  ? 'border-red-200 bg-red-50 text-red-600'
                  : order.status === 'pending'
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700',
              )}
              data-testid="workbench-status"
            >
              {WORKBENCH_STATUS_LABELS[order.status] ?? order.status}
            </span>
            {order.isPartial && (
              <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-bold text-orange-700">
                Partial
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-[#7C7C7C]">
            {customerName}
            <span className="mx-1.5 text-[#D0D0D0]">·</span>
            {formatWorkbenchPrice(Number(order.totalAmount))}
            <span className="mx-1.5 text-[#D0D0D0]">·</span>
            {formatWorkbenchDateTime(order.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadInvoice()}
            data-testid="workbench-invoice"
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-[#EEEEEE] bg-white px-3 text-[12px] font-bold text-[#7C7C7C] hover:bg-[#F7F8FA]"
          >
            <FileDown className="h-3.5 w-3.5" />
            Invoice
          </button>
          <Link
            href={`/vendor/orders/${order.id}`}
            data-testid="workbench-full-detail"
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-[#EEEEEE] bg-white px-3 text-[12px] font-bold text-[#181725] hover:bg-[#F7F8FA]"
          >
            Full detail
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          {next && (
            <button
              type="button"
              disabled={busy}
              data-testid="workbench-next-status"
              onClick={() => void advanceStatus(next.status)}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-[#299E60] px-4 text-[13px] font-bold text-white hover:bg-[#248a54] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {next.label}
            </button>
          )}
        </div>
      </div>

      {order.cancelRequest?.status === 'pending' && (
        <CancelRequestBanner
          request={order.cancelRequest}
          onReviewed={() => {
            void fetchOrder();
            notifyChanged();
          }}
        />
      )}

      {/* Customer + notes */}
      <div className="grid gap-3 sm:grid-cols-2" data-testid="workbench-customer">
        <div className="rounded-[14px] border border-[#EEEEEE] bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#AEAEAE]">Customer</p>
          <p className="mt-1 text-[14px] font-bold text-[#181725]">{customerName}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-[12px]">
            {order.user.phone && (
              <a href={`tel:${order.user.phone}`} className="inline-flex items-center gap-1 font-semibold text-[#299E60] hover:underline">
                <Phone className="h-3.5 w-3.5" />
                {order.user.phone}
              </a>
            )}
            {order.user.email && (
              <a href={`mailto:${order.user.email}`} className="inline-flex items-center gap-1 font-semibold text-[#299E60] hover:underline">
                <Mail className="h-3.5 w-3.5" />
                Email
              </a>
            )}
          </div>
          {addr && (
            <p className="mt-2 text-[12px] leading-snug text-[#7C7C7C]">
              {[addr.flatInfo, addr.addressLine, addr.city, addr.state, addr.pincode]
                .filter((x) => typeof x === 'string' && x)
                .join(', ') || 'Delivery address on file'}
            </p>
          )}
        </div>
        <div className="rounded-[14px] border border-[#EEEEEE] bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#AEAEAE]">Customer notes</p>
          <p className="mt-1 text-[13px] text-[#181725]">
            {order.notes?.trim() ? order.notes : 'No notes from customer.'}
          </p>
        </div>
      </div>

      {/* Lines */}
      <div className="rounded-[14px] border border-[#EEEEEE] bg-white overflow-hidden" data-testid="workbench-lines">
        <div className="flex items-center justify-between border-b border-[#EEEEEE] px-4 py-3">
          <h3 className="text-[14px] font-bold text-[#181725]">Line items</h3>
          {(isPartialDirty || isAmendDirty) && (
            <button
              type="button"
              disabled={busy}
              data-testid="workbench-save-qty"
              onClick={() => void saveAdjustments()}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#299E60] px-3 text-[12px] font-bold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save Quantity Adjustments
            </button>
          )}
        </div>
        <ul className="divide-y divide-[#F5F5F5]">
          {order.items.map((item) => {
            const fulfilled = canEditQty
              ? (fulfilledQtys[item.id] ?? item.fulfilledQty ?? item.quantity)
              : item.fulfilledQty;
            const showReject = canEditQty && fulfilled === 0;
            return (
              <li key={item.id} className="px-4 py-3" data-testid={`workbench-line-${item.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-[#181725]">{item.productName}</p>
                    <p className="text-[11px] text-[#AEAEAE]">
                      Ordered {item.quantity}
                      {item.product?.unit ? ` ${item.product.unit}` : ''}
                      {typeof item.stockAvailable === 'number' && (
                        <span className={item.isLowStock ? ' text-amber-700 font-semibold' : ''}>
                          {' '}· Stock {item.stockAvailable}
                        </span>
                      )}
                    </p>
                    {canEditQty && item.isLowStock && (
                      <div className="mt-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                        <p className="font-semibold">Low stock — only {item.stockAvailable} available</p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-lg bg-white px-2 py-1 text-[11px] font-bold border border-amber-200"
                            onClick={() =>
                              setQty(
                                item.id,
                                Math.min(item.stockAvailable ?? 0, item.quantity),
                                item.quantity,
                              )
                            }
                          >
                            Accept {Math.min(item.stockAvailable ?? 0, item.quantity)} only
                          </button>
                          {(item.substitutes ?? []).map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              disabled={busy}
                              data-testid={`apply-sub-${item.id}-${s.id}`}
                              onClick={() => void applySubstitute(item.id, s.id)}
                              className="rounded-lg bg-[#181725] px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                            >
                              Apply {s.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {showReject && (
                      <input
                        type="text"
                        value={rejectReasons[item.id] ?? ''}
                        onChange={(e) =>
                          setRejectReasons((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        placeholder="Rejection reason (required)"
                        data-testid={`reject-reason-desk-${item.id}`}
                        className="mt-2 w-full max-w-md rounded-[8px] border border-red-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-red-400"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {canEditQty ? (
                      <div className="flex items-center gap-1 rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA] p-0.5">
                        <button
                          type="button"
                          aria-label="Decrease qty"
                          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white"
                          onClick={() => setQty(item.id, fulfilled - 1, item.quantity)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={item.quantity}
                          value={fulfilled}
                          onChange={(e) =>
                            setQty(item.id, Number(e.target.value) || 0, item.quantity)
                          }
                          className="w-12 border-0 bg-transparent text-center text-[13px] font-bold outline-none"
                        />
                        <button
                          type="button"
                          aria-label="Increase qty"
                          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white"
                          onClick={() => setQty(item.id, fulfilled + 1, item.quantity)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[13px] font-bold tabular-nums text-[#181725]">
                        {fulfilled}/{item.quantity}
                      </span>
                    )}
                    <span className="min-w-[4.5rem] text-right text-[13px] font-semibold tabular-nums text-[#181725]">
                      {formatWorkbenchPrice(Number(item.unitPrice) * fulfilled)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Actions row */}
      {order.status === 'pending' && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancelOrder()}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-red-200 px-4 text-[13px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" />
            Cancel Order
          </button>
        </div>
      )}

      {/* Activity */}
      <div className="rounded-[14px] border border-[#EEEEEE] bg-white overflow-hidden" data-testid="order-events-panel">
        <div className="flex items-center justify-between border-b border-[#EEEEEE] px-4 py-3">
          <h3 className="text-[14px] font-bold text-[#181725]">Activity</h3>
          <button
            type="button"
            onClick={() => setActivityTab((v) => !v)}
            className="text-[12px] font-bold text-[#299E60] hover:underline"
          >
            {activityTab ? 'Show less' : 'Activity Log'}
          </button>
        </div>
        <div className="max-h-48 space-y-2 overflow-y-auto p-4">
          {shownEvents.length === 0 ? (
            <p className="py-2 text-center text-[12px] text-[#AEAEAE]">No events yet.</p>
          ) : (
            shownEvents.map((ev) => (
              <div key={ev.id} className="flex gap-2 border-b border-[#F5F5F5] pb-2 last:border-0">
                <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#299E60]" />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-[#181725]">
                    {WORKBENCH_EVENT_LABELS[ev.action] ?? ev.action}
                  </p>
                  <p className="text-[11px] text-[#AEAEAE]">
                    {formatWorkbenchDateTime(ev.createdAt)}
                    {ev.actor?.fullName ? ` · ${ev.actor.fullName}` : ''}
                  </p>
                  {activityTab && typeof ev.payload?.reason === 'string' && (
                    <p className="text-[11px] text-[#7C7C7C]">— {String(ev.payload.reason)}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
