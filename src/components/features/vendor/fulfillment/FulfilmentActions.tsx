'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Package,
  Truck,
  AlertTriangle,
  RotateCcw,
  UserPlus,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DELIVERY_FAIL_REASONS,
  DELIVERY_FAIL_REASON_LABELS,
  toDeliveryUiStatus,
  type DeliveryFailReason,
} from '@/modules/fulfillment/delivery.scope';
import type { FulfilmentActionBody } from '@/modules/fulfillment/fulfillment.types';
import type { FulfilmentDetail } from './fulfillmentConstants';
import {
  DeliveryBoySelect,
  deliveryBoyAssignFields,
  isDeliveryBoySelectionReady,
  type DeliveryBoySelection,
} from './DeliveryBoySelect';

interface Props {
  detail: FulfilmentDetail;
  busy: boolean;
  onAction: (body: FulfilmentActionBody) => Promise<void>;
}

export function FulfilmentActions({ detail, busy, onAction }: Props) {
  const ui = toDeliveryUiStatus(detail.status);
  const [boySelection, setBoySelection] = useState<DeliveryBoySelection>({ mode: 'none' });
  const [otp, setOtp] = useState('');
  const [failReason, setFailReason] = useState<DeliveryFailReason>('customer_not_available');
  const [failOther, setFailOther] = useState('');
  const [overrideNote, setOverrideNote] = useState('');

  const onBoyChange = useCallback((selection: DeliveryBoySelection) => {
    setBoySelection(selection);
  }, []);

  const btn =
    'h-[40px] px-4 rounded-[10px] text-[13px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50';
  const primary = cn(btn, 'bg-[#0F766E] text-white hover:bg-[#0D9488]');
  const secondary = cn(btn, 'border border-[#EEEEEE] text-[#181725] hover:bg-[#F5F5F5]');
  const danger = cn(btn, 'border border-rose-200 text-rose-600 hover:bg-rose-50');

  return (
    <div className="space-y-4">
      {ui === 'accepted' && (
        <button
          type="button"
          disabled={busy}
          className={primary}
          onClick={() => onAction({ action: 'mark_packed' })}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
          Mark packed
        </button>
      )}

      {ui === 'packed' && (
        <div className="space-y-2 rounded-[10px] border border-[#EEEEEE] p-3">
          <p className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide flex items-center gap-1">
            <UserPlus size={12} /> Assign delivery boy &amp; dispatch
          </p>
          <DeliveryBoySelect
            initialResourceId={detail.deliveryResource?.id}
            disabled={busy}
            onChange={onBoyChange}
          />
          <button
            type="button"
            disabled={busy || !isDeliveryBoySelectionReady(boySelection)}
            className={primary}
            onClick={() =>
              onAction({
                action: 'assign_and_dispatch',
                ...deliveryBoyAssignFields(boySelection),
              })
            }
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
            Assign &amp; dispatch
          </button>
        </div>
      )}

      {ui === 'dispatched' && (
        <>
          <div className="space-y-2 rounded-[10px] border border-[#EEEEEE] p-3">
            <p className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
              Mark delivered (OTP)
            </p>
            {detail.deliveryResource && (
              <p className="text-[12px] text-[#7C7C7C]">
                Boy: {detail.deliveryResource.name}
                {detail.deliveryResource.phone ? ` · ${detail.deliveryResource.phone}` : ''}
              </p>
            )}
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="Customer delivery OTP"
              maxLength={6}
              className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] tracking-widest outline-none"
            />
            <button
              type="button"
              disabled={busy || otp.trim().length < 4}
              className={primary}
              onClick={() => onAction({ action: 'mark_delivered', otp: otp.trim() })}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Mark delivered
            </button>
          </div>

          <div className="space-y-2 rounded-[10px] border border-rose-100 p-3 bg-rose-50/40">
            <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wide flex items-center gap-1">
              <AlertTriangle size={12} /> Record failed attempt
            </p>
            <select
              value={failReason}
              onChange={(e) => setFailReason(e.target.value as DeliveryFailReason)}
              className="w-full h-[40px] px-3 rounded-[10px] border border-rose-200 text-[13px] outline-none bg-white"
            >
              {DELIVERY_FAIL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {DELIVERY_FAIL_REASON_LABELS[r]}
                </option>
              ))}
            </select>
            {failReason === 'other' && (
              <textarea
                value={failOther}
                onChange={(e) => setFailOther(e.target.value)}
                rows={2}
                placeholder="Describe the reason"
                className="w-full px-3 py-2 rounded-[10px] border border-rose-200 text-[13px] resize-none outline-none"
              />
            )}
            <button
              type="button"
              disabled={
                busy || (failReason === 'other' && failOther.trim().length < 3)
              }
              className={danger}
              onClick={() =>
                onAction({
                  action: 'record_failed_delivery',
                  failedReason: failReason,
                  failedReasonOther:
                    failReason === 'other' ? failOther.trim() : undefined,
                })
              }
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
              Record failed delivery
            </button>
          </div>

          <div className="space-y-2 rounded-[10px] border border-amber-100 p-3 bg-amber-50/40">
            <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1">
              <ShieldAlert size={12} /> Override mark delivered
            </p>
            <p className="text-[11px] text-amber-700">
              Use when OTP cannot be completed. Requires an audit note.
            </p>
            <textarea
              value={overrideNote}
              onChange={(e) => setOverrideNote(e.target.value)}
              rows={2}
              placeholder="Why override? (required)"
              className="w-full px-3 py-2 rounded-[10px] border border-amber-200 text-[13px] resize-none outline-none"
            />
            <button
              type="button"
              disabled={busy || overrideNote.trim().length < 3}
              className={secondary}
              onClick={() =>
                onAction({
                  action: 'override_mark_delivered',
                  note: overrideNote.trim(),
                })
              }
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
              Override deliver
            </button>
          </div>
        </>
      )}

      {ui === 'delivery_attempt_failed' && (
        <>
          <div className="space-y-2 rounded-[10px] border border-[#EEEEEE] p-3">
            <p className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide flex items-center gap-1">
              <RotateCcw size={12} /> Reschedule dispatch
            </p>
            {detail.failedReason && (
              <p className="text-[12px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-2 py-1.5">
                {detail.failedReason}
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              className={primary}
              onClick={() => onAction({ action: 'reschedule_dispatch' })}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Reschedule (back to Packed)
            </button>
          </div>

          <div className="space-y-2 rounded-[10px] border border-amber-100 p-3 bg-amber-50/40">
            <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1">
              <ShieldAlert size={12} /> Override mark delivered
            </p>
            <textarea
              value={overrideNote}
              onChange={(e) => setOverrideNote(e.target.value)}
              rows={2}
              placeholder="Why override? (required)"
              className="w-full px-3 py-2 rounded-[10px] border border-amber-200 text-[13px] resize-none outline-none"
            />
            <button
              type="button"
              disabled={busy || overrideNote.trim().length < 3}
              className={secondary}
              onClick={() =>
                onAction({
                  action: 'override_mark_delivered',
                  note: overrideNote.trim(),
                })
              }
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
              Override deliver
            </button>
          </div>
        </>
      )}

      {ui === 'delivered' && (
        <p className="text-[13px] text-success font-semibold flex items-center gap-1.5">
          <CheckCircle2 size={16} /> Delivered
        </p>
      )}
    </div>
  );
}
