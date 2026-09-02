'use client';

import React from 'react';
import { Loader2, Minus, Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  StatusTimeline,
  returnTimelineCurrentKey,
  returnTimelineStepsForStatus,
} from '@/components/features/finance/StatusTimeline';
import {
  RETURN_ITEM_REASONS,
  type ReturnItemReason,
} from '@/modules/return/return.types';
import { RETURN_ITEM_REASON_LABELS } from '@/components/features/vendor/returns/returnConstants';

export type CustomerReturnOrderItem = {
  id: string;
  productName: string;
  quantity: number;
  cancelledQty?: number;
  unitPrice: string | number;
  product?: { imageUrl: string | null; images: string[] } | null;
};

type ReturnItemRow = {
  id: string;
  orderItemId: string;
  requestedQty: number;
  approvedQty: number | null;
  reason: string;
  decision: string;
  note: string | null;
  orderItem?: {
    id: string;
    productName: string;
    productSku: string | null;
    quantity: number;
    unitPrice: string | number;
  } | null;
};

export type CustomerReturnRequest = {
  id: string;
  status: string;
  reason: string;
  adminNote?: string | null;
  type?: string;
  creditNoteNumber?: string | null;
  pickupSkippedAt?: string | null;
  createdAt: string;
  items?: ReturnItemRow[];
};

type LineDraft = {
  selected: boolean;
  quantity: number;
  reason: ReturnItemReason;
};

type Props = {
  orderId: string;
  orderStatus: string;
  items: CustomerReturnOrderItem[];
};

function fmtMoney(val: string | number): string {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return Number.isNaN(n)
    ? '—'
    : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function isOpenReturn(status: string): boolean {
  return status !== 'closed' && status !== 'rejected' && status !== 'refunded' && status !== 'resolved';
}

function reasonLabel(reason: string): string {
  return RETURN_ITEM_REASON_LABELS[reason] ?? reason.replace(/_/g, ' ');
}

export default function CustomerReturnSection({ orderId, orderStatus, items }: Props) {
  const canViewReturns = orderStatus === 'delivered' || orderStatus === 'returned';
  /** Service create gate is delivered-only. */
  const canRequestNew = orderStatus === 'delivered';

  const [loading, setLoading] = React.useState(false);
  const [returns, setReturns] = React.useState<CustomerReturnRequest[]>([]);
  const [remainingByOrderItem, setRemainingByOrderItem] = React.useState<Record<string, number>>(
    {},
  );
  const [showForm, setShowForm] = React.useState(false);
  const [headerReason, setHeaderReason] = React.useState('');
  const [lineDrafts, setLineDrafts] = React.useState<Record<string, LineDraft>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!canViewReturns) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/orders/${orderId}/return`);
      const json = await res.json();
      if (!json.success || !json.data) return;

      // Support legacy single-object shape during rollout.
      if (Array.isArray(json.data.returns)) {
        setReturns(json.data.returns as CustomerReturnRequest[]);
        setRemainingByOrderItem(
          (json.data.remainingByOrderItem as Record<string, number>) ?? {},
        );
      } else if (json.data.id) {
        setReturns([json.data as CustomerReturnRequest]);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [canViewReturns, orderId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const returnableItems = React.useMemo(() => {
    return items
      .map((item) => {
        const remaining =
          remainingByOrderItem[item.id] ??
          Math.max(0, item.quantity - (item.cancelledQty ?? 0));
        return { item, remaining };
      })
      .filter(({ remaining }) => remaining > 0);
  }, [items, remainingByOrderItem]);

  const totalRemaining = returnableItems.reduce((sum, row) => sum + row.remaining, 0);

  const openForm = () => {
    const drafts: Record<string, LineDraft> = {};
    for (const { item, remaining } of returnableItems) {
      drafts[item.id] = {
        selected: false,
        quantity: Math.min(1, remaining),
        reason: 'damaged',
      };
    }
    setLineDrafts(drafts);
    setHeaderReason('');
    setShowForm(true);
  };

  const selectedLines = Object.entries(lineDrafts).filter(([, d]) => d.selected);

  const canSubmit =
    headerReason.trim().length >= 10 &&
    selectedLines.length > 0 &&
    selectedLines.every(([, d]) => d.quantity > 0 && d.reason);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/orders/${orderId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: headerReason.trim(),
          items: selectedLines.map(([orderItemId, d]) => ({
            orderItemId,
            quantity: d.quantity,
            reason: d.reason,
          })),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to submit');
      setShowForm(false);
      toast.success('Return request submitted');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit return');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canViewReturns) return null;

  const openReturns = returns.filter((r) => isOpenReturn(r.status));
  const pastReturns = returns.filter((r) => !isOpenReturn(r.status));

  return (
    <div className="space-y-3" data-testid="customer-return-section">
      {loading && returns.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-3 text-[12px] text-gray-400">
          <Loader2 size={14} className="animate-spin" />
          Loading returns…
        </div>
      )}

      {openReturns.map((ret) => (
        <ReturnStatusCard key={ret.id} ret={ret} tone="open" />
      ))}

      {pastReturns.map((ret) => (
        <ReturnStatusCard key={ret.id} ret={ret} tone="past" />
      ))}

      {!showForm && canRequestNew && totalRemaining > 0 && (
        <button
          type="button"
          onClick={openForm}
          data-testid="request-return-btn"
          className="w-full py-3.5 border-2 border-gray-200 text-[14px] font-black text-gray-600 rounded-2xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
        >
          <RotateCcw size={16} />
          {returns.length > 0 ? 'Request Another Return' : 'Request Return'}
        </button>
      )}

      {showForm && canRequestNew && (
        <div
          className="space-y-4 p-4 border-2 border-gray-200 rounded-2xl bg-white"
          data-testid="return-request-form"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[13px] font-black text-[#181725]">Request a return</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Select items and quantities to return
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-[12px] font-bold text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>

          {returnableItems.length === 0 ? (
            <p className="text-[12px] text-gray-500">No returnable quantity left on this order.</p>
          ) : (
            <ul className="space-y-3" data-testid="return-item-picker">
              {returnableItems.map(({ item, remaining }) => {
                const draft = lineDrafts[item.id];
                if (!draft) return null;
                return (
                  <li
                    key={item.id}
                    className={cn(
                      'rounded-xl border p-3 transition-colors',
                      draft.selected ? 'border-primary/40 bg-primary/5' : 'border-gray-100',
                    )}
                  >
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.selected}
                        onChange={(e) =>
                          setLineDrafts((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], selected: e.target.checked },
                          }))
                        }
                        className="mt-1 accent-primary"
                        data-testid={`return-item-check-${item.id}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-[#181725] leading-snug">
                          {item.productName}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Up to {remaining} returnable · {fmtMoney(item.unitPrice)} each
                        </p>
                      </div>
                    </label>

                    {draft.selected && (
                      <div className="mt-3 pl-7 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                            Qty
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label="Decrease quantity"
                              disabled={draft.quantity <= 1}
                              onClick={() =>
                                setLineDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    quantity: Math.max(1, prev[item.id].quantity - 1),
                                  },
                                }))
                              }
                              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center disabled:opacity-40"
                            >
                              <Minus size={14} />
                            </button>
                            <span
                              className="w-8 text-center text-[14px] font-black tabular-nums"
                              data-testid={`return-item-qty-${item.id}`}
                            >
                              {draft.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label="Increase quantity"
                              disabled={draft.quantity >= remaining}
                              onClick={() =>
                                setLineDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    quantity: Math.min(remaining, prev[item.id].quantity + 1),
                                  },
                                }))
                              }
                              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center disabled:opacity-40"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                        <div>
                          <label
                            htmlFor={`return-reason-${item.id}`}
                            className="text-[11px] font-bold text-gray-500 uppercase tracking-wide"
                          >
                            Reason
                          </label>
                          <select
                            id={`return-reason-${item.id}`}
                            value={draft.reason}
                            onChange={(e) =>
                              setLineDrafts((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  reason: e.target.value as ReturnItemReason,
                                },
                              }))
                            }
                            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] outline-none focus:border-primary/40 bg-white"
                            data-testid={`return-item-reason-${item.id}`}
                          >
                            {RETURN_ITEM_REASONS.map((r) => (
                              <option key={r} value={r}>
                                {RETURN_ITEM_REASON_LABELS[r] ?? r}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div>
            <p className="text-[13px] font-bold text-[#181725] mb-1.5">Additional details</p>
            <textarea
              value={headerReason}
              onChange={(e) => setHeaderReason(e.target.value)}
              rows={3}
              placeholder="Describe the issue (at least 10 characters)..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] outline-none focus:border-primary/40 resize-none"
              data-testid="return-reason-input"
            />
          </div>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || !canSubmit}
            data-testid="submit-return-request"
            className="w-full py-2.5 bg-primary text-white text-[13px] font-black rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Submitting…
              </>
            ) : (
              'Submit Return Request'
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function ReturnStatusCard({
  ret,
  tone,
}: {
  ret: CustomerReturnRequest;
  tone: 'open' | 'past';
}) {
  const pickupSkipped = Boolean(ret.pickupSkippedAt);
  return (
    <div
      className={cn(
        'space-y-3 p-4 border-2 rounded-2xl',
        tone === 'open'
          ? 'border-amber-100 bg-amber-50/40'
          : 'border-gray-100 bg-gray-50/60',
      )}
      data-testid="return-request-status"
      data-return-id={ret.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-bold text-[#181725]">
            Return:{' '}
            <span className="capitalize">{ret.status.replace(/_/g, ' ')}</span>
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Submitted {fmtShortDate(ret.createdAt)}
            {ret.creditNoteNumber ? ` · CN ${ret.creditNoteNumber}` : ''}
          </p>
        </div>
        {tone === 'past' && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 shrink-0">
            Past
          </span>
        )}
      </div>

      {ret.reason && <p className="text-[12px] text-gray-600">{ret.reason}</p>}
      {ret.adminNote && (
        <p className="text-[12px] text-gray-500">Store note: {ret.adminNote}</p>
      )}

      {ret.items && ret.items.length > 0 && (
        <ul className="space-y-1.5">
          {ret.items.map((line) => (
            <li
              key={line.id}
              className="text-[12px] text-gray-600 flex justify-between gap-2"
            >
              <span className="min-w-0 truncate">
                {line.orderItem?.productName ?? 'Item'}{' '}
                <span className="text-gray-400">×{line.requestedQty}</span>
              </span>
              <span className="shrink-0 text-gray-400 capitalize">
                {reasonLabel(line.reason)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <StatusTimeline
        steps={returnTimelineStepsForStatus(ret.status, { pickupSkipped })}
        currentKey={returnTimelineCurrentKey(ret.status)}
      />
    </div>
  );
}
