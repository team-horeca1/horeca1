'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Loader2,
  PackageCheck,
  RotateCcw,
  Truck,
  XCircle,
  ClipboardCheck,
  Banknote,
  Archive,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReturnActionBody, ReturnDisposition } from '@/modules/return/return.types';
import {
  RETURN_DISPOSITION_OPTIONS,
  isAwaitingReview,
  money,
  type ReturnDetail,
  type ReturnItemRow,
} from './returnConstants';

interface Props {
  detail: ReturnDetail;
  busy: boolean;
  onAction: (body: ReturnActionBody) => Promise<void>;
}

type DecisionDraft = Record<
  string,
  { decision: 'approved' | 'partial' | 'rejected'; approvedQty: number; note: string }
>;

type DispositionDraft = Record<string, ReturnDisposition>;

function buildDecisionDraft(items: ReturnItemRow[]): DecisionDraft {
  const draft: DecisionDraft = {};
  for (const item of items) {
    const decision =
      item.decision === 'partial' || item.decision === 'rejected' || item.decision === 'approved'
        ? item.decision
        : 'approved';
    draft[item.id] = {
      decision,
      approvedQty: item.approvedQty ?? item.requestedQty,
      note: item.note ?? '',
    };
  }
  return draft;
}

function buildDispositionDraft(items: ReturnItemRow[]): DispositionDraft {
  const draft: DispositionDraft = {};
  for (const item of items) {
    if (item.decision !== 'approved' && item.decision !== 'partial') continue;
    if ((item.approvedQty ?? item.requestedQty) <= 0) continue;
    draft[item.id] = item.disposition ?? 'saleable';
  }
  return draft;
}

function dispositionEligible(items: ReturnItemRow[]): ReturnItemRow[] {
  return items.filter(
    (i) =>
      (i.decision === 'approved' || i.decision === 'partial') &&
      (i.approvedQty ?? i.requestedQty) > 0 &&
      !i.disposition,
  );
}

export function ReturnActions({ detail, busy, onAction }: Props) {
  const status = detail.status;
  const [adminNote, setAdminNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [decisionDraft, setDecisionDraft] = useState<DecisionDraft>(() =>
    buildDecisionDraft(detail.items),
  );
  const [pickupAt, setPickupAt] = useState('');
  const [pickupAddress, setPickupAddress] = useState(detail.pickupAddress ?? '');
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [rejectGoodsReason, setRejectGoodsReason] = useState('');
  const [dispositionDraft, setDispositionDraft] = useState<DispositionDraft>(() =>
    buildDispositionDraft(detail.items),
  );
  const [resolutionAmount, setResolutionAmount] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');

  useEffect(() => {
    Promise.resolve().then(() => {
      setDecisionDraft(buildDecisionDraft(detail.items));
      setDispositionDraft(buildDispositionDraft(detail.items));
      setPickupAddress(detail.pickupAddress ?? '');
    });
  }, [detail]);

  const btn =
    'h-[40px] px-4 rounded-[10px] text-[13px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 w-full sm:w-auto';
  const primary = cn(btn, 'bg-[#B45309] text-white hover:bg-[#92400E]');
  const secondary = cn(btn, 'border border-[#EEEEEE] text-[#181725] hover:bg-[#F5F5F5]');
  const danger = cn(btn, 'border border-rose-200 text-rose-600 hover:bg-rose-50');

  const awaiting = isAwaitingReview(status);
  const canSchedule = status === 'approved';
  const canReceive = status === 'pickup_scheduled' || status === 'approved';
  const canInspect = status === 'goods_received';
  const inspectionFailed = detail.inspection?.passed === false;
  const canDisposition = status === 'inspection_completed' && !inspectionFailed;
  const canRejectGoodsAfterInspect = status === 'inspection_completed' && inspectionFailed;
  const canResolve =
    status === 'approved' ||
    status === 'pickup_scheduled' ||
    status === 'goods_received' ||
    status === 'inspection_completed';
  const canClose =
    status === 'approved' ||
    status === 'rejected' ||
    status === 'pickup_scheduled' ||
    status === 'goods_received' ||
    status === 'inspection_completed';

  const pendingDisposition = dispositionEligible(detail.items);
  const allDispositioned =
    canDisposition &&
    detail.items
      .filter((i) => i.decision === 'approved' || i.decision === 'partial')
      .filter((i) => (i.approvedQty ?? i.requestedQty) > 0)
      .every((i) => !!i.disposition);

  const lineDecisions = (): NonNullable<
    Extract<ReturnActionBody, { action: 'approve' }>['items']
  > =>
    detail.items.map((item) => {
      const d = decisionDraft[item.id];
      return {
        returnItemId: item.id,
        decision: d?.decision ?? 'approved',
        approvedQty:
          d?.decision === 'rejected'
            ? 0
            : d?.decision === 'partial'
              ? d.approvedQty
              : d?.approvedQty ?? item.requestedQty,
        note: d?.note?.trim() || undefined,
      };
    });

  const downloadCreditNote = () => {
    window.open(`/api/v1/vendor/returns/${detail.id}/credit-note`, '_blank');
  };

  if (status === 'closed') {
    return (
      <p className="text-[13px] text-emerald-700 font-semibold flex items-center gap-1.5">
        <CheckCircle2 size={16} /> Return closed
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {awaiting && (
        <div className="space-y-3 rounded-[10px] border border-[#EEEEEE] p-3 bg-[#FAFAFA]">
          <p className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
            Review decision
          </p>
          {detail.items.length > 0 && (
            <div className="space-y-2">
              {detail.items.map((item) => {
                const d = decisionDraft[item.id];
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-[#EEEEEE] bg-white p-2.5 space-y-2"
                  >
                    <p className="text-[12px] font-semibold text-[#181725] leading-snug">
                      {item.orderItem.productName}
                    </p>
                    <p className="text-[10px] text-[#AEAEAE]">
                      Requested ×{item.requestedQty}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(['approved', 'partial', 'rejected'] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            setDecisionDraft((prev) => ({
                              ...prev,
                              [item.id]: {
                                decision: opt,
                                approvedQty:
                                  opt === 'rejected'
                                    ? 0
                                    : opt === 'partial'
                                      ? Math.max(1, Math.min((prev[item.id]?.approvedQty ?? item.requestedQty) - 1, item.requestedQty - 1))
                                      : item.requestedQty,
                                note: prev[item.id]?.note ?? '',
                              },
                            }))
                          }
                          className={cn(
                            'h-[28px] px-2.5 rounded-lg text-[11px] font-bold border capitalize',
                            d?.decision === opt
                              ? 'bg-[#B45309] text-white border-[#B45309]'
                              : 'bg-white text-[#7C7C7C] border-[#EEEEEE]',
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    {d?.decision === 'partial' && (
                      <input
                        type="number"
                        min={1}
                        max={item.requestedQty - 1}
                        value={d.approvedQty}
                        onChange={(e) =>
                          setDecisionDraft((prev) => ({
                            ...prev,
                            [item.id]: {
                              ...prev[item.id]!,
                              approvedQty: Number(e.target.value),
                            },
                          }))
                        }
                        className="w-20 h-[32px] px-2 rounded-lg border border-[#EEEEEE] text-[12px] font-bold text-center outline-none focus:border-[#B45309]/40"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            rows={2}
            placeholder="Note to customer (optional on approve)"
            className="w-full px-3 py-2 rounded-[10px] border border-[#EEEEEE] text-[13px] resize-none outline-none focus:border-[#B45309]/40"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className={primary}
              onClick={() => {
                const items = detail.items.length ? lineDecisions() : undefined;
                const note = adminNote.trim() || undefined;
                const isPartial = detail.items.some(
                  (i) =>
                    decisionDraft[i.id]?.decision === 'partial' ||
                    decisionDraft[i.id]?.decision === 'rejected',
                );
                if (isPartial && items?.length) {
                  void onAction({ action: 'partial_approve', items, adminNote: note });
                } else {
                  void onAction({ action: 'approve', items, adminNote: note });
                }
              }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Approve
            </button>
          </div>
          <div className="space-y-2 pt-1 border-t border-[#EEEEEE]">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
              placeholder="Reject reason (min 10 characters)"
              className="w-full px-3 py-2 rounded-[10px] border border-rose-100 text-[13px] resize-none outline-none"
            />
            <button
              type="button"
              disabled={busy || rejectReason.trim().length < 10}
              className={danger}
              onClick={() =>
                onAction({
                  action: 'reject',
                  reason: rejectReason.trim(),
                  adminNote: rejectReason.trim(),
                })
              }
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              Reject return
            </button>
          </div>
        </div>
      )}

      {canSchedule && (
        <div className="space-y-2 rounded-[10px] border border-[#EEEEEE] p-3">
          <p className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide flex items-center gap-1">
            <Truck size={12} /> Schedule pickup
          </p>
          <input
            type="datetime-local"
            value={pickupAt}
            onChange={(e) => setPickupAt(e.target.value)}
            className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#B45309]/40"
          />
          <input
            value={pickupAddress}
            onChange={(e) => setPickupAddress(e.target.value)}
            placeholder="Pickup address (optional)"
            className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none"
          />
          <button
            type="button"
            disabled={busy || !pickupAt}
            className={primary}
            onClick={() =>
              onAction({
                action: 'schedule_pickup',
                pickupAt: new Date(pickupAt).toISOString(),
                pickupAddress: pickupAddress.trim() || undefined,
              })
            }
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
            Schedule pickup
          </button>
        </div>
      )}

      {canReceive && (
        <button
          type="button"
          disabled={busy}
          className={status === 'approved' ? secondary : primary}
          onClick={() => onAction({ action: 'mark_goods_received' })}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
          Mark goods received
        </button>
      )}

      {canInspect && (
        <div className="space-y-2 rounded-[10px] border border-[#EEEEEE] p-3">
          <p className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide flex items-center gap-1">
            <ClipboardCheck size={12} /> Inspection
          </p>
          <textarea
            value={inspectionNotes}
            onChange={(e) => setInspectionNotes(e.target.value)}
            rows={2}
            placeholder="Inspection notes (optional)"
            className="w-full px-3 py-2 rounded-[10px] border border-[#EEEEEE] text-[13px] resize-none outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className={primary}
              onClick={() =>
                onAction({
                  action: 'complete_inspection',
                  passed: true,
                  notes: inspectionNotes.trim() || undefined,
                })
              }
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Pass inspection
            </button>
            <button
              type="button"
              disabled={busy}
              className={secondary}
              onClick={() =>
                onAction({
                  action: 'complete_inspection',
                  passed: false,
                  notes: inspectionNotes.trim() || undefined,
                })
              }
            >
              Fail inspection
            </button>
          </div>
          <div className="space-y-2 pt-2 border-t border-[#EEEEEE]">
            <textarea
              value={rejectGoodsReason}
              onChange={(e) => setRejectGoodsReason(e.target.value)}
              rows={2}
              placeholder="Reject goods reason"
              className="w-full px-3 py-2 rounded-[10px] border border-rose-100 text-[13px] resize-none outline-none"
            />
            <button
              type="button"
              disabled={busy || rejectGoodsReason.trim().length < 3}
              className={danger}
              onClick={() =>
                onAction({
                  action: 'reject_goods',
                  reason: rejectGoodsReason.trim(),
                })
              }
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              Reject goods
            </button>
          </div>
        </div>
      )}

      {canRejectGoodsAfterInspect && (
        <div className="space-y-2 rounded-[10px] border border-rose-100 bg-rose-50/40 p-3">
          <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wide">
            Inspection failed
          </p>
          <textarea
            value={rejectGoodsReason}
            onChange={(e) => setRejectGoodsReason(e.target.value)}
            rows={2}
            placeholder="Reject goods reason"
            className="w-full px-3 py-2 rounded-[10px] border border-rose-200 text-[13px] resize-none outline-none"
          />
          <button
            type="button"
            disabled={busy || rejectGoodsReason.trim().length < 3}
            className={danger}
            onClick={() =>
              onAction({
                action: 'reject_goods',
                reason: rejectGoodsReason.trim(),
              })
            }
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            Reject goods
          </button>
        </div>
      )}

      {canDisposition && pendingDisposition.length > 0 && (
        <div className="space-y-3 rounded-[10px] border border-amber-100 bg-amber-50/40 p-3">
          <p className="text-[11px] font-bold text-[#B45309] uppercase tracking-wide">
            Set disposition
          </p>
          <p className="text-[11px] text-[#7C7C7C]">
            Maps returned stock into inventory buckets after inspection.
          </p>
          {pendingDisposition.map((item) => (
            <div key={item.id} className="flex items-center gap-2 justify-between">
              <div className="min-w-0 pr-2">
                <p className="text-[12px] font-semibold text-[#181725] truncate">
                  {item.orderItem.productName}
                </p>
                <p className="text-[10px] text-[#AEAEAE]">
                  Qty ×{item.approvedQty ?? item.requestedQty}
                </p>
              </div>
              <select
                value={dispositionDraft[item.id] ?? 'saleable'}
                onChange={(e) =>
                  setDispositionDraft((prev) => ({
                    ...prev,
                    [item.id]: e.target.value as ReturnDisposition,
                  }))
                }
                className="h-[36px] px-2 rounded-lg border border-[#EEEEEE] text-[12px] outline-none bg-white min-w-[130px]"
              >
                {RETURN_DISPOSITION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button
            type="button"
            disabled={busy}
            className={primary}
            onClick={() =>
              onAction({
                action: 'set_disposition',
                items: pendingDisposition.map((item) => ({
                  returnItemId: item.id,
                  disposition: dispositionDraft[item.id] ?? 'saleable',
                })),
              })
            }
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
            Apply disposition
          </button>
        </div>
      )}

      {canDisposition && allDispositioned && pendingDisposition.length === 0 && (
        <p className="text-[12px] text-emerald-700 font-semibold">Disposition recorded on all lines</p>
      )}

      {canResolve && (
        <div className="space-y-3 rounded-[10px] border border-[#EEEEEE] p-3">
          <p className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
            Resolution
          </p>
          <input
            type="number"
            min={0}
            step="0.01"
            value={resolutionAmount}
            onChange={(e) => setResolutionAmount(e.target.value)}
            placeholder={`Amount (order ${money(detail.order.totalAmount)})`}
            className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none"
          />
          <textarea
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            rows={2}
            placeholder="Resolution notes (optional)"
            className="w-full px-3 py-2 rounded-[10px] border border-[#EEEEEE] text-[13px] resize-none outline-none"
          />
          <div className="flex flex-wrap gap-2">
            {!detail.replacementOrderId && (
              <button
                type="button"
                disabled={busy}
                className={secondary}
                onClick={() =>
                  onAction({
                    action: 'generate_replacement',
                    notes: resolutionNotes.trim() || undefined,
                  })
                }
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                Generate replacement
              </button>
            )}
            {!detail.creditNoteNumber && (
              <button
                type="button"
                disabled={busy}
                className={secondary}
                onClick={() =>
                  onAction({
                    action: 'generate_credit_note',
                    amount: resolutionAmount ? Number(resolutionAmount) : undefined,
                    notes: resolutionNotes.trim() || undefined,
                  })
                }
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                Credit note
              </button>
            )}
            {detail.creditNoteNumber && (
              <button type="button" className={secondary} onClick={downloadCreditNote}>
                <FileText size={14} />
                Download {detail.creditNoteNumber}
              </button>
            )}
            {(!detail.resolutionType || detail.resolutionType === 'refund') && (
              <button
                type="button"
                disabled={busy}
                className={secondary}
                onClick={() =>
                  onAction({
                    action: 'process_refund',
                    amount: resolutionAmount ? Number(resolutionAmount) : undefined,
                    notes: resolutionNotes.trim() || undefined,
                  })
                }
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
                Process refund
              </button>
            )}
          </div>
          {detail.replacementOrder && (
            <p className="text-[12px] text-[#7C7C7C]">
              Replacement order{' '}
              <strong className="text-[#181725]">{detail.replacementOrder.orderNumber}</strong>
            </p>
          )}
          {detail.refundAmount != null && (
            <p className="text-[12px] text-[#7C7C7C]">
              Refund amount <strong className="text-[#181725]">{money(detail.refundAmount)}</strong>
            </p>
          )}
        </div>
      )}

      {canClose && (
        <button
          type="button"
          disabled={busy}
          className={secondary}
          onClick={() => onAction({ action: 'close' })}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
          Close return
        </button>
      )}
    </div>
  );
}
