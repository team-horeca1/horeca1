'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Loader2, Package, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type {
  ReturnActionBody,
  ReturnDisposition,
  ReturnType,
} from '@/modules/return/return.types';
import { ReturnProgress } from './ReturnProgress';
import { ReturnActions } from './ReturnActions';
import {
  RETURN_ITEM_REASON_LABELS,
  RETURN_DISPOSITION_LABELS,
  RETURN_TYPE_LABELS,
  customerLabel,
  formatDateTime,
  shortReturnId,
  money,
  returnStatusLabel,
  returnStatusStyle,
  type ReturnDetail,
} from './returnConstants';

interface Props {
  open: boolean;
  returnId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}

export function ReturnDetailDrawer({ open, returnId, onClose, onUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<ReturnDetail | null>(null);

  const load = useCallback(async () => {
    if (!returnId || !open) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/vendor/returns/${returnId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load');
      setDetail(json.data as ReturnDetail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [returnId, open, onClose]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (body: ReturnActionBody) => {
    if (!returnId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/vendor/returns/${returnId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Action failed');
      toast.success(actionSuccessMessage(body.action));
      setDetail(json.data as ReturnDetail);
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (!open || !returnId) return null;

  const typeLabel =
    detail && detail.type in RETURN_TYPE_LABELS
      ? RETURN_TYPE_LABELS[detail.type as ReturnType]
      : detail?.type;

  return (
    <div className="fixed inset-0 z-[10002] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative w-full max-w-[480px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEEEEE]">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-[#181725] truncate font-mono">
              {detail ? shortReturnId(detail.id) : 'Return'}
            </p>
            {detail && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border',
                    returnStatusStyle(detail.status),
                  )}
                >
                  {returnStatusLabel(detail.status)}
                </span>
                {typeLabel && (
                  <span className="text-[11px] font-bold text-[#7C7C7C]">{typeLabel}</span>
                )}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[#F5F5F5]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading || !detail ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-[#B45309]" size={28} />
            </div>
          ) : (
            <>
              <ReturnProgress
                status={detail.status}
                pickupSkipped={!!detail.pickupSkippedAt}
              />

              <div className="text-[13px] space-y-1.5 bg-[#FAFAFA] rounded-[10px] p-3 border border-[#EEEEEE]">
                <p>
                  <span className="text-[#7C7C7C]">Customer:</span>{' '}
                  <strong>{customerLabel(detail)}</strong>
                </p>
                <p>
                  <span className="text-[#7C7C7C]">Order:</span>{' '}
                  <Link
                    href={`/vendor/orders/${detail.order.id}`}
                    className="font-bold text-[#B45309] hover:underline"
                  >
                    {detail.order.orderNumber}
                  </Link>
                </p>
                <p>
                  <span className="text-[#7C7C7C]">Invoice:</span>{' '}
                  <strong>{detail.invoiceNumber ?? detail.order.orderNumber}</strong>
                </p>
                {detail.order.outlet?.name && (
                  <p>
                    <span className="text-[#7C7C7C]">Outlet:</span>{' '}
                    <strong>{detail.order.outlet.name}</strong>
                  </p>
                )}
                <p>
                  <span className="text-[#7C7C7C]">Requested:</span>{' '}
                  <strong>{formatDateTime(detail.createdAt)}</strong>
                </p>
                {detail.pickupAt && (
                  <p>
                    <span className="text-[#7C7C7C]">Pickup:</span>{' '}
                    <strong>{formatDateTime(detail.pickupAt)}</strong>
                  </p>
                )}
                {detail.goodsReceivedAt && (
                  <p>
                    <span className="text-[#7C7C7C]">Received:</span>{' '}
                    <strong>{formatDateTime(detail.goodsReceivedAt)}</strong>
                  </p>
                )}
                {detail.reason && (
                  <p className="pt-1 border-t border-[#EEEEEE] mt-1.5">
                    <span className="text-[#7C7C7C] block text-[11px] font-bold uppercase mb-0.5">
                      Customer reason
                    </span>
                    <span className="text-[#181725]">{detail.reason}</span>
                  </p>
                )}
              </div>

              <div>
                <h4 className="text-[12px] font-bold text-[#7C7C7C] uppercase mb-2 flex items-center gap-1">
                  <Package size={14} /> Items
                </h4>
                <div className="border border-[#EEEEEE] rounded-[10px] divide-y divide-[#F5F5F5]">
                  {detail.items.length === 0 ? (
                    <p className="px-3 py-3 text-[12px] text-[#AEAEAE]">
                      Whole-order return (no line items)
                    </p>
                  ) : (
                    detail.items.map((item) => (
                      <div key={item.id} className="px-3 py-2.5 text-[13px]">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium text-[#181725] pr-2">
                            {item.orderItem.productName}
                          </span>
                          <span className="font-bold shrink-0 text-[#B45309]">
                            ×{item.approvedQty ?? item.requestedQty}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#AEAEAE] mt-0.5">
                          Req {item.requestedQty}
                          {item.approvedQty != null ? ` · Approved ${item.approvedQty}` : ''}
                          {' · '}
                          {RETURN_ITEM_REASON_LABELS[item.reason] ?? item.reason}
                          {' · '}
                          <span className="capitalize">{item.decision}</span>
                        </p>
                        {item.disposition && (
                          <p className="text-[11px] text-[#B45309] mt-1 font-semibold">
                            Disposition:{' '}
                            {RETURN_DISPOSITION_LABELS[item.disposition as ReturnDisposition] ??
                              item.disposition}
                          </p>
                        )}
                        {item.note && (
                          <p className="text-[11px] text-[#7C7C7C] mt-1 italic">{item.note}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {detail.inspection && (
                <div className="rounded-[10px] border border-[#EEEEEE] p-3 text-[13px]">
                  <p className="text-[11px] font-bold text-[#7C7C7C] uppercase mb-1">Inspection</p>
                  <p
                    className={cn(
                      'font-semibold',
                      detail.inspection.passed ? 'text-emerald-700' : 'text-rose-600',
                    )}
                  >
                    {detail.inspection.passed ? 'Passed' : 'Failed'}
                  </p>
                  {detail.inspection.notes && (
                    <p className="text-[12px] text-[#7C7C7C] mt-1">{detail.inspection.notes}</p>
                  )}
                  <p className="text-[11px] text-[#AEAEAE] mt-1">
                    {formatDateTime(detail.inspection.verifiedAt)}
                  </p>
                </div>
              )}

              {(detail.creditNoteNumber || detail.refundAmount != null) && (
                <div className="rounded-[10px] border border-[#EEEEEE] p-3 text-[13px] space-y-1">
                  <p className="text-[11px] font-bold text-[#7C7C7C] uppercase mb-1">
                    Commercial refs
                  </p>
                  {detail.creditNoteNumber && (
                    <p>
                      Credit note <strong>{detail.creditNoteNumber}</strong>
                      {detail.creditNoteAmount != null && (
                        <span className="text-[#7C7C7C]"> · {money(detail.creditNoteAmount)}</span>
                      )}
                    </p>
                  )}
                  {detail.refundAmount != null && (
                    <p>
                      Refund <strong>{money(detail.refundAmount)}</strong>
                    </p>
                  )}
                </div>
              )}

              <div>
                <h4 className="text-[12px] font-bold text-[#7C7C7C] uppercase mb-2">Actions</h4>
                <ReturnActions detail={detail} busy={busy} onAction={runAction} />
              </div>

              <div>
                <h4 className="text-[12px] font-bold text-[#7C7C7C] uppercase mb-2 flex items-center gap-1">
                  <Clock size={14} /> Timeline
                </h4>
                <ol className="space-y-2 border border-[#EEEEEE] rounded-[10px] p-3 max-h-[240px] overflow-y-auto">
                  {detail.events.length === 0 ? (
                    <li className="text-[12px] text-[#AEAEAE]">No events yet</li>
                  ) : (
                    detail.events.map((ev) => (
                      <li key={ev.id} className="flex justify-between gap-2 text-[12px]">
                        <span className="font-medium text-[#181725] capitalize">
                          {ev.action.replace(/^return\./, '').replace(/_/g, ' ')}
                          {ev.toStatus ? ` → ${ev.toStatus.replace(/_/g, ' ')}` : ''}
                        </span>
                        <span className="text-[#AEAEAE] shrink-0">
                          {formatDateTime(ev.createdAt)}
                        </span>
                      </li>
                    ))
                  )}
                </ol>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function actionSuccessMessage(action: ReturnActionBody['action']): string {
  switch (action) {
    case 'approve':
    case 'partial_approve':
      return 'Return approved';
    case 'reject':
      return 'Return rejected';
    case 'schedule_pickup':
      return 'Pickup scheduled';
    case 'skip_pickup':
      return 'Pickup skipped';
    case 'resend_pickup_otp':
      return 'Pickup OTP resent';
    case 'mark_goods_received':
      return 'Goods received';
    case 'complete_inspection':
      return 'Inspection recorded';
    case 'reject_goods':
      return 'Goods rejected';
    case 'set_disposition':
      return 'Disposition applied';
    case 'generate_credit_note':
      return 'Credit note generated';
    case 'close':
      return 'Return closed';
    default:
      return 'Updated';
  }
}
