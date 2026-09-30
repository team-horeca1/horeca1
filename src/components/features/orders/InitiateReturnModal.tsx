'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ReturnItemReason } from '@/modules/return/return.types';

interface OrderItemInfo {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

interface ReturnData {
  items: OrderItemInfo[];
  remainingByOrderItem: Record<string, number>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber?: string;
  apiEndpoint: string;
  onSuccess?: () => void;
}

const REASONS: Array<{ value: ReturnItemReason; label: string }> = [
  { value: 'damaged', label: 'Damaged in transit / packaging' },
  { value: 'expired', label: 'Expired / near expiry' },
  { value: 'wrong_item', label: 'Wrong item supplied' },
  { value: 'quality_issue', label: 'Quality / freshness issue' },
  { value: 'short_supplied', label: 'Short supplied' },
  { value: 'excess_supplied', label: 'Excess supplied' },
  { value: 'customer_rejected', label: 'Customer rejected at doorstep' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'other', label: 'Other discrepancy' },
];

export function InitiateReturnModal({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  apiEndpoint,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<ReturnData | null>(null);
  const [generalReason, setGeneralReason] = useState('');

  // Selected items state: orderItemId -> { quantity: number; reason: ReturnItemReason; note: string; selected: boolean }
  const [lineSelections, setLineSelections] = useState<
    Record<
      string,
      {
        selected: boolean;
        quantity: number;
        reason: ReturnItemReason;
        note: string;
      }
    >
  >({});

  useEffect(() => {
    if (!isOpen) {
      setData(null);
      setLineSelections({});
      setGeneralReason('');
      return;
    }

    let active = true;
    setLoading(true);

    fetch(apiEndpoint)
      .then((res) => res.json())
      .then((json) => {
        if (!active) return;
        if (!json.success || !json.data) {
          toast.error(json.error?.message || 'Failed to load order items for return');
          return;
        }

        const d = json.data as ReturnData;
        setData(d);

        const initial: typeof lineSelections = {};
        for (const item of d.items || []) {
          const max = d.remainingByOrderItem[item.id] ?? item.quantity;
          initial[item.id] = {
            selected: max > 0,
            quantity: max > 0 ? max : 1,
            reason: 'damaged',
            note: '',
          };
        }
        setLineSelections(initial);
      })
      .catch((err) => {
        if (!active) return;
        toast.error(err instanceof Error ? err.message : 'Error fetching order items');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, apiEndpoint]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;

    const selectedLines = Object.entries(lineSelections)
      .filter(([_, state]) => state.selected && state.quantity > 0)
      .map(([orderItemId, state]) => ({
        orderItemId,
        quantity: state.quantity,
        reason: state.reason,
        note: state.note.trim() || undefined,
      }));

    if (selectedLines.length === 0) {
      toast.error('Please select at least one item to return');
      return;
    }

    if (!generalReason.trim()) {
      toast.error('Please enter a reason or notes for initiating this return');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: generalReason.trim(),
          type: 'return',
          items: selectedLines,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || 'Failed to initiate return');
      }

      toast.success('Return initiated and registered successfully!');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to initiate return');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-divider overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-divider bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <RotateCcw size={18} />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-text">Initiate Return</h3>
              <p className="text-[12px] text-text-muted">
                Order #{orderNumber || orderId.slice(0, 8)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text rounded-xl hover:bg-neutral-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-text-muted">
              <Loader2 className="animate-spin text-primary" size={28} />
              <p className="text-[13px]">Checking returnable items…</p>
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="py-12 text-center text-text-muted">
              <AlertCircle size={32} className="mx-auto text-amber-500 mb-2" />
              <p className="font-semibold text-text">No items available for return</p>
              <p className="text-[12px] mt-1">
                All items in this order might have already been returned or cancelled.
              </p>
            </div>
          ) : (
            <>
              {/* Reason prompt */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-text">
                  Return Reason / Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={generalReason}
                  onChange={(e) => setGeneralReason(e.target.value)}
                  placeholder="e.g. Products arrived damaged during unloading, customer requested immediate return."
                  className="w-full text-[13px] p-3 border border-divider rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Items List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-text">Select Items to Return</span>
                  <span className="text-[11px] text-text-muted">
                    Check item to include in return
                  </span>
                </div>

                <div className="space-y-3 divide-y divide-divider/50 border border-divider rounded-xl p-3 bg-surface/50">
                  {data.items.map((item) => {
                    const maxQty = data.remainingByOrderItem[item.id] ?? item.quantity;
                    const line = lineSelections[item.id] || {
                      selected: false,
                      quantity: 1,
                      reason: 'damaged',
                      note: '',
                    };
                    const isAvailable = maxQty > 0;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'pt-3 first:pt-0 space-y-2.5 transition-opacity',
                          !isAvailable && 'opacity-50 pointer-events-none'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              disabled={!isAvailable}
                              checked={line.selected && isAvailable}
                              onChange={(e) =>
                                setLineSelections((prev) => ({
                                  ...prev,
                                  [item.id]: { ...line, selected: e.target.checked },
                                }))
                              }
                              className="mt-1 size-4 rounded accent-primary text-primary"
                            />
                            <div>
                              <p className="text-[13px] font-semibold text-text">
                                {item.productName}
                              </p>
                              <p className="text-[11px] text-text-muted">
                                ₹{item.unitPrice} · Max returnable: {maxQty}
                              </p>
                            </div>
                          </label>

                          {/* Quantity Selector */}
                          {line.selected && isAvailable && (
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-text-muted">Qty:</span>
                              <input
                                type="number"
                                min={1}
                                max={maxQty}
                                value={line.quantity}
                                onChange={(e) => {
                                  const val = Math.max(
                                    1,
                                    Math.min(maxQty, parseInt(e.target.value, 10) || 1)
                                  );
                                  setLineSelections((prev) => ({
                                    ...prev,
                                    [item.id]: { ...line, quantity: val },
                                  }));
                                }}
                                className="w-16 text-center text-[13px] font-bold p-1.5 border border-divider rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </div>
                          )}
                        </div>

                        {/* Reason and Note when selected */}
                        {line.selected && isAvailable && (
                          <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <select
                              value={line.reason}
                              onChange={(e) =>
                                setLineSelections((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...line,
                                    reason: e.target.value as ReturnItemReason,
                                  },
                                }))
                              }
                              className="text-[12px] p-2 bg-white border border-divider rounded-lg focus:outline-none"
                            >
                              {REASONS.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={line.note}
                              placeholder="Optional item note"
                              onChange={(e) =>
                                setLineSelections((prev) => ({
                                  ...prev,
                                  [item.id]: { ...line, note: e.target.value },
                                }))
                              }
                              className="text-[12px] p-2 bg-white border border-divider rounded-lg focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-divider flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-[13px] font-semibold text-text-muted hover:text-text hover:bg-neutral-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loading || !data || data.items.length === 0}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-[13px] shadow-sm flex items-center gap-2 disabled:opacity-50 transition-transform active:scale-95"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Initiating…
                </>
              ) : (
                <>
                  <RotateCcw size={16} />
                  Initiate Return
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
