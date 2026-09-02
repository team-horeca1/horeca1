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
import { personFirstCustomerLabel } from '@/lib/customerLabel';
import { CancelRequestBanner } from './CancelRequestBanner';
import { LinkedWorkspacesCard } from './LinkedWorkspacesCard';
import { ATTENTION_LABELS, type AttentionReasonCode } from '@/lib/orderAttention';
import {
  formatWorkbenchDateTime,
  formatWorkbenchPrice,
  nextWorkbenchStatus,
  WORKBENCH_EVENT_LABELS,
  WORKBENCH_LINE_STATUS_LABELS,
  WORKBENCH_STATUS_LABELS,
  type WorkbenchOrder,
} from './types';

export function OrderWorkbenchPanel({
  orderId,
  onChanged,
  onOrderLoaded,
  showEmbeddedActivity = false,
  compactEvents = 6,
}: {
  orderId: string;
  onChanged?: () => void;
  onOrderLoaded?: (order: WorkbenchOrder | null) => void;
  /** When false (Workspace 3-zone), Activity lives in the right rail. */
  showEmbeddedActivity?: boolean;
  compactEvents?: number;
}) {
  const [order, setOrder] = useState<WorkbenchOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** This-shipment qty per line (not cumulative). */
  const [shipQtys, setShipQtys] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [activityTab, setActivityTab] = useState(false);
  const [showDeliverProof, setShowDeliverProof] = useState(false);
  const [deliverOtp, setDeliverOtp] = useState('');

  const lineBalance = (item: {
    quantity: number;
    fulfilledQty: number;
    cancelledQty?: number;
    balanceQty?: number;
  }) =>
    item.balanceQty ??
    Math.max(0, item.quantity - (item.fulfilledQty ?? 0) - (item.cancelledQty ?? 0));

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/vendor/orders/${orderId}`, { credentials: 'include' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load order');
      const data = json.data as WorkbenchOrder;
      setOrder(data);
      onOrderLoaded?.(data);
      const init: Record<string, number> = {};
      for (const item of data.items) {
        const bal = lineBalance(item);
        init[item.id] = bal > 0 ? bal : 0;
      }
      setShipQtys(init);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setOrder(null);
      onOrderLoaded?.(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, onOrderLoaded]);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  const notifyChanged = () => {
    onChanged?.();
  };

  const canShip =
    !!order &&
    ['pending', 'confirmed', 'processing', 'ready_for_dispatch', 'shipped', 'partially_delivered'].includes(
      order.status,
    ) &&
    order.items.some((i) => lineBalance(i) > 0);

  const shipDirty =
    !!order &&
    order.items.some((item) => {
      const bal = lineBalance(item);
      const q = shipQtys[item.id] ?? 0;
      return q > 0 && q <= bal;
    });

  const setShipQty = (itemId: string, next: number, max: number) => {
    setShipQtys((prev) => ({
      ...prev,
      [itemId]: Math.max(0, Math.min(max, next)),
    }));
  };

  const shipSelected = async () => {
    if (!order) return;
    const items = order.items
      .map((item) => ({
        itemId: item.id,
        shipQty: shipQtys[item.id] ?? 0,
        bal: lineBalance(item),
      }))
      .filter((r) => r.shipQty > 0 && r.shipQty <= r.bal)
      .map(({ itemId, shipQty }) => ({ itemId, shipQty }));
    if (items.length === 0) {
      toast.error('Enter a fulfillment qty greater than 0 on at least one line.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/vendor/orders/${orderId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ship', items }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Ship failed');
      toast.success('Shipment saved. Remaining qty stays as balance to fulfill.');
      await fetchOrder();
      notifyChanged();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Ship failed');
    } finally {
      setBusy(false);
    }
  };

  const cancelLineBalance = async (itemId: string) => {
    if (!order) return;
    const item = order.items.find((i) => i.id === itemId);
    if (!item) return;
    const bal = lineBalance(item);
    if (bal <= 0) return;
    const reason = window.prompt(`Cancel remaining ${bal} unit(s) of "${item.productName}"? Enter reason:`);
    if (!reason || reason.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/vendor/orders/${orderId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel_balance',
          items: [{ itemId, cancelQty: bal, reason: reason.trim() }],
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Cancel failed');
      toast.success('Balance cancelled for this line.');
      await fetchOrder();
      notifyChanged();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setBusy(false);
    }
  };

  const advanceStatus = async (
    status: string,
    proof?: { proofType?: string; notes?: string; otp?: string },
  ) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/vendor/orders/${orderId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(proof ? { proof } : {}) }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Update failed');
      toast.success(`Order marked as ${WORKBENCH_STATUS_LABELS[status] ?? status}.`);
      setShowDeliverProof(false);
      setDeliverOtp('');
      await fetchOrder();
      notifyChanged();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const confirmDeliveredWithOtp = async () => {
    const otp = deliverOtp.trim();
    if (!/^\d{4}$/.test(otp)) {
      toast.error('Enter the 4-digit customer OTP');
      return;
    }
    await advanceStatus('delivered', { proofType: 'otp', otp });
  };

  const confirmDeliveredWithoutOtp = async () => {
    await advanceStatus('delivered', {
      proofType: 'none',
      notes: 'Delivered without OTP',
    });
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
          className="text-[13px] font-bold text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const next = nextWorkbenchStatus(order.status);
  const events = order.events ?? [];
  const shownEvents = activityTab ? events : events.slice(0, compactEvents);
  const customerName = personFirstCustomerLabel({
    fullName: order.user.fullName,
    businessName: order.user.businessName,
  });
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
                    : 'border-success/30 bg-success-light text-success',
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
          {next && next.status !== 'delivered' && (
            <button
              type="button"
              disabled={busy}
              data-testid="workbench-next-status"
              onClick={() => void advanceStatus(next.status)}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-[13px] font-bold text-white hover:bg-[#248a54] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {next.label}
            </button>
          )}
          {next?.status === 'delivered' && !showDeliverProof && (
            <button
              type="button"
              disabled={busy}
              data-testid="workbench-next-status"
              onClick={() => setShowDeliverProof(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-[13px] font-bold text-white hover:bg-[#248a54] disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {next.label}
            </button>
          )}
        </div>
      </div>

      {showDeliverProof && next?.status === 'delivered' && (
        <div
          className="rounded-[12px] border border-[#EEEEEE] bg-white p-4 space-y-3"
          data-testid="workbench-deliver-proof"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[13px] font-bold text-[#181725]">Confirm delivery</p>
              <p className="text-[12px] text-[#7C7C7C]">
                Enter the customer OTP, or deliver without OTP
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowDeliverProof(false);
                setDeliverOtp('');
              }}
              className="text-[12px] font-semibold text-[#7C7C7C] hover:text-[#181725]"
            >
              Cancel
            </button>
          </div>
          <input
            value={deliverOtp}
            onChange={(e) => setDeliverOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="4-digit OTP"
            maxLength={4}
            inputMode="numeric"
            data-testid="workbench-deliver-otp"
            className="w-full h-10 px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] tracking-widest outline-none focus:border-primary/50"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || deliverOtp.trim().length < 4}
              data-testid="workbench-deliver-with-otp"
              onClick={() => void confirmDeliveredWithOtp()}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-primary px-4 text-[12px] font-bold text-primary hover:bg-primary-light disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Confirm with OTP
            </button>
            <button
              type="button"
              disabled={busy}
              data-testid="workbench-deliver-without-otp"
              onClick={() => void confirmDeliveredWithoutOtp()}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-[12px] font-bold text-white hover:bg-[#248a54] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Deliver without OTP
            </button>
          </div>
        </div>
      )}

      {order.cancelRequest?.status === 'pending' && (
        <CancelRequestBanner
          request={order.cancelRequest}
          onReviewed={() => {
            void fetchOrder();
            notifyChanged();
          }}
        />
      )}

      {(order.attentionReasons?.length ?? 0) > 0 && (
        <div
          className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3"
          data-testid="workbench-attention"
        >
          <p className="text-[12px] font-bold text-amber-900">Needs attention</p>
          <ul className="mt-1 list-inside list-disc text-[12px] text-amber-800">
            {order.attentionReasons!.map((code) => (
              <li key={code}>
                {ATTENTION_LABELS[code as AttentionReasonCode] ?? code}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Customer + notes */}
      <div className="grid gap-3 sm:grid-cols-2" data-testid="workbench-customer">
        <div className="rounded-[14px] border border-[#EEEEEE] bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#AEAEAE]">Customer</p>
          <p className="mt-1 text-[14px] font-bold text-[#181725]">{customerName}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-[12px]">
            {order.user.phone && (
              <a href={`tel:${order.user.phone}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                <Phone className="h-3.5 w-3.5" />
                {order.user.phone}
              </a>
            )}
            {order.user.email && (
              <a href={`mailto:${order.user.email}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
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

      <LinkedWorkspacesCard
        fulfilment={order.fulfilment}
        returns={order.returns}
      />

      {/* Lines — backorder fulfillment */}
      <div className="rounded-[14px] border border-[#EEEEEE] bg-white overflow-hidden" data-testid="workbench-lines">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#EEEEEE] bg-white px-4 py-3 gap-2">
          <div>
            <h3 className="text-[14px] font-bold text-[#181725]">Line items</h3>
            <p className="text-[11px] text-[#AEAEAE]">
              Ordered qty is fixed. Ship what you have now — balance stays open for later.
            </p>
          </div>
          {canShip && shipDirty && (
            <button
              type="button"
              disabled={busy}
              data-testid="workbench-ship-qty"
              onClick={() => void shipSelected()}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-[12px] font-bold text-white disabled:opacity-50 shrink-0"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Ship fulfillment qty
            </button>
          )}
        </div>
        <ul className="divide-y divide-[#F5F5F5]">
          {order.items.map((item) => {
            const bal = lineBalance(item);
            const shipQty = shipQtys[item.id] ?? 0;
            const remainingAfter = Math.max(0, bal - shipQty);
            const lineStatus = item.lineStatus ?? (bal === 0 && item.fulfilledQty > 0 ? 'FULFILLED' : bal < item.quantity ? 'PARTIALLY_FULFILLED' : 'OPEN');
            return (
              <li key={item.id} className="px-4 py-3" data-testid={`workbench-line-${item.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-bold text-[#181725]">{item.productName}</p>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-bold',
                          lineStatus === 'FULFILLED' && 'bg-success-light text-success',
                          lineStatus === 'PARTIALLY_FULFILLED' && 'bg-amber-50 text-amber-800',
                          lineStatus === 'CANCELLED' && 'bg-red-50 text-red-600',
                          lineStatus === 'OPEN' && 'bg-gray-50 text-gray-600',
                        )}
                      >
                        {WORKBENCH_LINE_STATUS_LABELS[lineStatus] ?? lineStatus}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#7C7C7C]">
                      Ordered <span className="font-semibold text-[#181725]">{item.quantity}</span>
                      {' · '}Fulfilled <span className="font-semibold text-[#181725]">{item.fulfilledQty}</span>
                      {' · '}Balance <span className="font-semibold text-amber-700">{bal}</span>
                      {(item.cancelledQty ?? 0) > 0 && (
                        <>
                          {' · '}Cancelled{' '}
                          <span className="font-semibold text-red-600">{item.cancelledQty}</span>
                        </>
                      )}
                      {typeof item.stockAvailable === 'number' && (
                        <span className={item.isLowStock ? ' text-amber-700 font-semibold' : ''}>
                          {' '}· Available {item.stockAvailable}
                        </span>
                      )}
                    </p>
                    {canShip && bal > 0 && item.isLowStock && (
                      <div className="mt-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                        <p className="font-semibold">Low stock — only {item.stockAvailable} available</p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-lg bg-white px-2 py-1 text-[11px] font-bold border border-amber-200"
                            onClick={() =>
                              setShipQty(
                                item.id,
                                Math.min(item.stockAvailable ?? 0, bal),
                                bal,
                              )
                            }
                          >
                            Ship {Math.min(item.stockAvailable ?? 0, bal)} now
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
                    {canShip && bal > 0 && (
                      <p className="mt-1 text-[11px] text-[#AEAEAE]">
                        Remaining after this shipment: <span className="font-semibold text-[#181725]">{remainingAfter}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {canShip && bal > 0 ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-[#7C7C7C]">Fulfill</span>
                          <div className="flex items-center gap-1 rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA] p-0.5">
                            <button
                              type="button"
                              aria-label="Decrease ship qty"
                              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white"
                              onClick={() => setShipQty(item.id, shipQty - 1, bal)}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <input
                              type="number"
                              min={0}
                              max={bal}
                              value={shipQty}
                              onChange={(e) => setShipQty(item.id, Number(e.target.value) || 0, bal)}
                              className="w-12 border-0 bg-transparent text-center text-[13px] font-bold outline-none"
                            />
                            <button
                              type="button"
                              aria-label="Increase ship qty"
                              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white"
                              onClick={() => setShipQty(item.id, shipQty + 1, bal)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void cancelLineBalance(item.id)}
                          className="text-[11px] font-bold text-red-600 hover:underline disabled:opacity-50"
                        >
                          Cancel remaining {bal}
                        </button>
                      </>
                    ) : (
                      <span className="text-[13px] font-bold tabular-nums text-[#181725]">
                        {item.fulfilledQty}/{item.quantity}
                      </span>
                    )}
                    <span className="min-w-[4.5rem] text-right text-[12px] font-semibold tabular-nums text-[#7C7C7C]">
                      {formatWorkbenchPrice(Number(item.totalPrice))}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Shipment history */}
      {(order.shipments?.length ?? 0) > 0 && (
        <div className="rounded-[14px] border border-[#EEEEEE] bg-white p-4" data-testid="shipment-history">
          <h3 className="text-[14px] font-bold text-[#181725]">Shipment history</h3>
          <ul className="mt-3 space-y-3">
            {order.shipments!.map((s) => (
              <li key={s.id} className="rounded-[10px] border border-[#F0F0F0] bg-[#FAFAFA] px-3 py-2">
                <p className="text-[13px] font-bold text-[#181725]">
                  Shipment {s.shipmentNo}
                  <span className="ml-2 text-[11px] font-medium text-[#AEAEAE]">
                    {formatWorkbenchDateTime(s.createdAt)}
                    {s.actor?.fullName ? ` · ${s.actor.fullName}` : ''}
                  </span>
                </p>
                <p className="mt-1 text-[12px] text-[#7C7C7C]">
                  {s.items.map((li) => {
                    const name = order.items.find((i) => i.id === li.orderItemId)?.productName ?? 'Item';
                    return `${name}: ${li.qty}`;
                  }).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

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

      {/* Activity (embedded — full detail; Workspace uses right ActivityRail) */}
      {showEmbeddedActivity && (
        <div className="rounded-[14px] border border-[#EEEEEE] bg-white overflow-hidden" data-testid="order-events-panel">
          <div className="flex items-center justify-between border-b border-[#EEEEEE] px-4 py-3">
            <h3 className="text-[14px] font-bold text-[#181725]">Activity</h3>
            <button
              type="button"
              onClick={() => setActivityTab((v) => !v)}
              className="text-[12px] font-bold text-primary hover:underline"
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
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
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
      )}
    </div>
  );
}
