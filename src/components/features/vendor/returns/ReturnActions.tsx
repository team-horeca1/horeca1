'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  PackageCheck,
  Truck,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toReturnUiStatus, type ReturnActionBody, type ReturnDisposition } from '@/modules/return/return.types';
import {
  DeliveryBoySelect,
  deliveryBoyAssignFields,
  isDeliveryBoySelectionReady,
  type DeliveryBoySelection,
} from '@/components/features/vendor/fulfillment/DeliveryBoySelect';
import {
  RETURN_DISPOSITION_OPTIONS,
  copyText,
  isAwaitingReview,
  money,
  pickupLinkAbsoluteUrl,
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

/** Approved-state path picker — one primary action at a time. */
type ApprovedPath = 'choose' | 'credit_note' | 'pickup' | 'skip';

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
  const ui = toReturnUiStatus(status);
  const [adminNote, setAdminNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [decisionDraft, setDecisionDraft] = useState<DecisionDraft>(() =>
    buildDecisionDraft(detail.items),
  );
  const [boySelection, setBoySelection] = useState<DeliveryBoySelection>({ mode: 'none' });
  const [skipReason, setSkipReason] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [showReceiveOverride, setShowReceiveOverride] = useState(false);
  const [receiveOtp, setReceiveOtp] = useState('');
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [rejectGoodsReason, setRejectGoodsReason] = useState('');
  const [dispositionDraft, setDispositionDraft] = useState<DispositionDraft>(() =>
    buildDispositionDraft(detail.items),
  );

  const onBoyChange = useCallback((selection: DeliveryBoySelection) => {
    setBoySelection(selection);
  }, []);
  const [resolutionAmount, setResolutionAmount] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [approvedPath, setApprovedPath] = useState<ApprovedPath>(() =>
    detail.pickupSkippedAt ? 'credit_note' : 'choose',
  );

  useEffect(() => {
    Promise.resolve().then(() => {
      setDecisionDraft(buildDecisionDraft(detail.items));
      setDispositionDraft(buildDispositionDraft(detail.items));
      setApprovedPath(detail.pickupSkippedAt ? 'credit_note' : 'choose');
      setShowReceiveOverride(false);
    });
  }, [detail]);

  const btn =
    'h-[40px] px-4 rounded-[10px] text-[13px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 w-full sm:w-auto';
  const primary = cn(btn, 'bg-[#B45309] text-white hover:bg-[#92400E]');
  const secondary = cn(btn, 'border border-[#EEEEEE] text-[#181725] hover:bg-[#F5F5F5]');
  const danger = cn(btn, 'border border-rose-200 text-rose-600 hover:bg-rose-50');

  const awaiting = isAwaitingReview(status);
  const hasCn = !!detail.creditNoteNumber;
  const skipped = !!detail.pickupSkippedAt;
  const canResolveApproved = ui === 'approved' && !hasCn;
  const canReceive = ui === 'pickup';
  const showPickupLink = ui === 'pickup' && !!detail.pickupLink?.path;
  const canInspect = status === 'goods_received';
  const inspectionFailed = detail.inspection?.passed === false;
  const canDisposition = status === 'inspection_completed' && !inspectionFailed;
  const canRejectGoodsAfterInspect = status === 'inspection_completed' && inspectionFailed;
  const canCnAfterDisposition =
    status === 'inspection_completed' && !inspectionFailed && !hasCn;

  const pendingDisposition = dispositionEligible(detail.items);
  const allDispositioned =
    detail.items
      .filter((i) => i.decision === 'approved' || i.decision === 'partial')
      .filter((i) => (i.approvedQty ?? i.requestedQty) > 0)
      .every((i) => !!i.disposition);

  const canClose =
    ui === 'rejected' ||
    (hasCn &&
      (ui === 'approved' ||
        ui === 'pickup' ||
        ui === 'received'));

  const copyPickupLink = async () => {
    const portal = detail.boyPortal;
    const path = portal?.path ?? detail.pickupLink?.path;
    if (!path) return;
    const url = portal?.url || detail.pickupLink?.url || pickupLinkAbsoluteUrl(path);
    const ok = await copyText(url);
    if (ok) {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    }
  };

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

  const creditNoteForm = (
    <div className="space-y-2 rounded-[10px] border border-[#EEEEEE] p-3">
      <p className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide flex items-center gap-1">
        <FileText size={12} /> Credit note (wallet)
      </p>
      {skipped && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
          Pickup skipped{detail.pickupSkipReason ? `: ${detail.pickupSkipReason}` : ''}. Credits
          wallet without inventory.
        </p>
      )}
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
        placeholder="Notes (optional)"
        className="w-full px-3 py-2 rounded-[10px] border border-[#EEEEEE] text-[13px] resize-none outline-none"
      />
      <button
        type="button"
        disabled={busy}
        className={primary}
        onClick={() =>
          onAction({
            action: 'generate_credit_note',
            amount: resolutionAmount ? Number(resolutionAmount) : undefined,
            notes: resolutionNotes.trim() || undefined,
          })
        }
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
        Generate credit note
      </button>
    </div>
  );

  if (ui === 'closed') {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-emerald-700 font-semibold flex items-center gap-1.5">
          <CheckCircle2 size={16} /> Return closed
        </p>
        {hasCn && (
          <button type="button" className={secondary} onClick={downloadCreditNote}>
            <FileText size={14} />
            Download {detail.creditNoteNumber}
          </button>
        )}
      </div>
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
                    <p className="text-[10px] text-[#AEAEAE]">Requested ×{item.requestedQty}</p>
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
                                      ? Math.max(
                                          1,
                                          Math.min(
                                            (prev[item.id]?.approvedQty ?? item.requestedQty) - 1,
                                            item.requestedQty - 1,
                                          ),
                                        )
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

      {/* Approved: exactly CN | Pickup, Skip secondary — one path expanded */}
      {canResolveApproved && approvedPath === 'choose' && (
        <div className="space-y-3">
          <p className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
            Next step
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              className={cn(primary, 'flex-col h-auto py-3 sm:w-full')}
              onClick={() => setApprovedPath('credit_note')}
            >
              <FileText size={16} />
              Credit note
              <span className="text-[10px] font-semibold opacity-90">Credits H1 wallet</span>
            </button>
            <button
              type="button"
              disabled={busy}
              className={cn(primary, 'flex-col h-auto py-3 sm:w-full')}
              onClick={() => setApprovedPath('pickup')}
            >
              <Truck size={16} />
              Initiate pickup
              <span className="text-[10px] font-semibold opacity-90">Copy magic link for boy</span>
            </button>
          </div>
          <button
            type="button"
            disabled={busy}
            className="text-[12px] font-semibold text-[#7C7C7C] hover:text-[#B45309] underline-offset-2 hover:underline"
            onClick={() => setApprovedPath('skip')}
          >
            Skip pickup (expensive / no physical accept)
          </button>
        </div>
      )}

      {canResolveApproved && approvedPath === 'credit_note' && (
        <div className="space-y-2">
          {!skipped && (
            <button
              type="button"
              className="text-[12px] font-semibold text-[#7C7C7C] hover:text-[#B45309]"
              onClick={() => setApprovedPath('choose')}
            >
              ← Back
            </button>
          )}
          {creditNoteForm}
        </div>
      )}

      {canResolveApproved && approvedPath === 'pickup' && (
        <div className="space-y-2">
          <button
            type="button"
            className="text-[12px] font-semibold text-[#7C7C7C] hover:text-[#B45309]"
            onClick={() => setApprovedPath('choose')}
          >
            ← Back
          </button>
          <div className="space-y-2 rounded-[10px] border border-[#EEEEEE] p-3">
            <p className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide flex items-center gap-1">
              <Truck size={12} /> Assign pickup
            </p>
            <DeliveryBoySelect
              disabled={busy}
              accentClassName="focus:border-[#B45309]/40"
              onChange={onBoyChange}
            />
            <button
              type="button"
              disabled={busy || !isDeliveryBoySelectionReady(boySelection)}
              className={primary}
              onClick={() =>
                onAction({
                  action: 'schedule_pickup',
                  ...deliveryBoyAssignFields(boySelection),
                })
              }
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
              Assign &amp; get magic link
            </button>
            <p className="text-[11px] text-[#AEAEAE]">
              Pickup appears on the boy&apos;s shared portal link. OTP is sent only when they
              tap Complete pickup — not now.
            </p>
          </div>
        </div>
      )}

      {canResolveApproved && approvedPath === 'skip' && (
        <div className="space-y-2">
          <button
            type="button"
            className="text-[12px] font-semibold text-[#7C7C7C] hover:text-[#B45309]"
            onClick={() => setApprovedPath('choose')}
          >
            ← Back
          </button>
          <div className="space-y-2 rounded-[10px] border border-dashed border-[#DDDDDD] p-3">
            <p className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
              Skip pickup
            </p>
            <p className="text-[11px] text-[#AEAEAE]">
              No physical accept — then generate credit note without inventory.
            </p>
            <textarea
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              rows={2}
              placeholder="Reason (min 10 characters)"
              className="w-full px-3 py-2 rounded-[10px] border border-[#EEEEEE] text-[13px] resize-none outline-none"
            />
            <button
              type="button"
              disabled={busy || skipReason.trim().length < 10}
              className={secondary}
              onClick={() => onAction({ action: 'skip_pickup', reason: skipReason.trim() })}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              Confirm skip pickup
            </button>
          </div>
        </div>
      )}

      {/* Pickup scheduled: shared boy portal (+ per-pickup deep link) */}
      {showPickupLink && detail.pickupLink && (
        <div className="rounded-[10px] border border-[#B45309]/25 bg-[#B45309]/[0.04] p-3 space-y-2">
          <p className="text-[11px] font-bold text-[#B45309] uppercase tracking-wide flex items-center gap-1">
            <Link2 size={12} />{' '}
            {detail.boyPortal ? 'Delivery boy portal' : 'Pickup magic link'}
          </p>
          {(detail.pickupLink.deliveryBoyName || detail.pickupLink.deliveryBoyPhone) && (
            <p className="text-[12px] text-[#7C7C7C]">
              Boy:{' '}
              {[detail.pickupLink.deliveryBoyName, detail.pickupLink.deliveryBoyPhone]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <p className="text-[12px] text-[#7C7C7C] break-all font-mono bg-white border border-[#EEEEEE] rounded-lg px-2 py-1.5">
            {pickupLinkAbsoluteUrl(
              (detail.boyPortal ?? detail.pickupLink).path,
            )}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={
                detail.boyPortal?.url ||
                detail.pickupLink.url ||
                pickupLinkAbsoluteUrl((detail.boyPortal ?? detail.pickupLink).path)
              }
              target="_blank"
              rel="noreferrer"
              className="h-[36px] rounded-[10px] border border-[#B45309]/30 bg-white text-[#B45309] text-[12px] font-bold hover:bg-[#B45309]/5 flex items-center justify-center gap-1.5 no-underline"
            >
              <ExternalLink size={13} /> Visit link
            </a>
            <button
              type="button"
              onClick={() => void copyPickupLink()}
              className="h-[36px] rounded-[10px] bg-[#B45309] text-white text-[12px] font-bold hover:bg-[#92400E] flex items-center justify-center gap-1.5"
            >
              <Copy size={13} /> {linkCopied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <p className="text-[11px] text-[#AEAEAE]">
            {detail.boyPortal
              ? 'Boy opens the portal to see deliveries and this pickup together. Completing pickup sends the customer OTP.'
              : 'Boy opens the link and taps Complete pickup — that sends the customer OTP.'}
          </p>
          {detail.pickupLink.usedAt && (
            <p className="text-[11px] text-emerald-700 font-semibold">
              Link used (pickup completed via OTP)
            </p>
          )}
        </div>
      )}

      {canReceive && (
        <div className="space-y-2">
          {!showReceiveOverride ? (
            <button
              type="button"
              className="text-[12px] font-semibold text-[#7C7C7C] hover:text-[#B45309] underline-offset-2 hover:underline"
              onClick={() => setShowReceiveOverride(true)}
            >
              Override: mark goods received (OTP)
            </button>
          ) : (
            <div className="space-y-2 rounded-[10px] border border-[#EEEEEE] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide flex items-center gap-1">
                  <PackageCheck size={12} /> Receive override
                </p>
                <button
                  type="button"
                  className="text-[11px] font-semibold text-[#AEAEAE]"
                  onClick={() => setShowReceiveOverride(false)}
                >
                  Hide
                </button>
              </div>
              <button
                type="button"
                disabled={busy}
                className={cn(secondary, 'w-full')}
                onClick={() => onAction({ action: 'resend_pickup_otp' })}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                Send OTP to customer
              </button>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                value={receiveOtp}
                onChange={(e) => setReceiveOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4-digit customer OTP"
                className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#B45309]/40 tracking-widest"
              />
              <button
                type="button"
                disabled={busy || receiveOtp.length !== 4}
                className={primary}
                onClick={() => onAction({ action: 'mark_goods_received', otp: receiveOtp })}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
                Mark goods received
              </button>
            </div>
          )}
        </div>
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

      {canDisposition && allDispositioned && pendingDisposition.length === 0 && !hasCn && (
        <p className="text-[12px] text-emerald-700 font-semibold">Disposition recorded on all lines</p>
      )}

      {canCnAfterDisposition && allDispositioned && creditNoteForm}

      {hasCn && (
        <button type="button" className={secondary} onClick={downloadCreditNote}>
          <FileText size={14} />
          Download {detail.creditNoteNumber}
        </button>
      )}

      {canClose && (
        <button
          type="button"
          disabled={busy}
          className={hasCn ? primary : secondary}
          onClick={() => onAction({ action: 'close' })}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
          Close return
        </button>
      )}
    </div>
  );
}
