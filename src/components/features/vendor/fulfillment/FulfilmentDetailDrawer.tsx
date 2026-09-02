'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Loader2, Package, Clock, Copy, Link2, ExternalLink, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { FulfilmentActionBody } from '@/modules/fulfillment/fulfillment.types';
import { FulfilmentProgress } from './FulfilmentProgress';
import { FulfilmentActions } from './FulfilmentActions';
import {
  copyText,
  customerLabel,
  deliveryStatusLabel,
  deliveryStatusStyle,
  fulfilmentOutletLabels,
  magicLinkAbsoluteUrl,
  type FulfilmentDetail,
} from './fulfillmentConstants';

interface Props {
  open: boolean;
  fulfilmentId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}

export function FulfilmentDetailDrawer({
  open,
  fulfilmentId,
  onClose,
  onUpdated,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<FulfilmentDetail | null>(null);

  const load = useCallback(async () => {
    if (!fulfilmentId || !open) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/vendor/fulfilments/${fulfilmentId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load');
      setDetail(json.data as FulfilmentDetail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [fulfilmentId, open, onClose]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (body: FulfilmentActionBody) => {
    if (!fulfilmentId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/vendor/fulfilments/${fulfilmentId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Action failed');
      toast.success(actionSuccessMessage(body.action));
      setDetail(json.data as FulfilmentDetail);
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const copyMagicLink = async (path: string) => {
    const ok = await copyText(magicLinkAbsoluteUrl(path));
    if (ok) toast.success('Delivery link copied');
    else toast.error('Could not copy link');
  };

  const visitMagicLink = (path: string) => {
    window.open(magicLinkAbsoluteUrl(path), '_blank', 'noopener,noreferrer');
  };

  const downloadPicklist = (orderId: string) => {
    window.open(`/api/v1/vendor/orders/${orderId}/picklist`, '_blank', 'noopener,noreferrer');
  };

  if (!open || !fulfilmentId) return null;

  return (
    <div className="fixed inset-0 z-[10002] flex justify-start">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
        <div className="flex items-center justify-between px-[clamp(1.25rem,3vw,2rem)] py-4 border-b border-[#EEEEEE]">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-[#181725] truncate">
              {detail?.order.orderNumber ?? detail?.fulfilmentNumber ?? 'Delivery'}
            </p>
            {detail && (
              <div className="mt-1">
                <span
                  className={cn(
                    'inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border',
                    deliveryStatusStyle(detail.status),
                  )}
                >
                  {deliveryStatusLabel(detail.status)}
                </span>
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[#F5F5F5]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-[clamp(1.25rem,3vw,2rem)] py-5">
          <div className="mx-auto w-full max-w-3xl space-y-5">
          {loading || !detail ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-[#0F766E]" size={28} />
            </div>
          ) : (
            <FulfilmentDetailBody
              detail={detail}
              busy={busy}
              onAction={runAction}
              onVisitMagicLink={visitMagicLink}
              onCopyMagicLink={copyMagicLink}
              onDownloadPicklist={downloadPicklist}
            />
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FulfilmentDetailBody({
  detail,
  busy,
  onAction,
  onVisitMagicLink,
  onCopyMagicLink,
  onDownloadPicklist,
}: {
  detail: FulfilmentDetail;
  busy: boolean;
  onAction: (body: FulfilmentActionBody) => Promise<void>;
  onVisitMagicLink: (path: string) => void;
  onCopyMagicLink: (path: string) => Promise<void>;
  onDownloadPicklist: (orderId: string) => void;
}) {
  const { deliver, fulfill } = fulfilmentOutletLabels(detail);

  return (
    <>
      <FulfilmentProgress status={detail.status} />

      <div className="text-[13px] space-y-1.5 bg-[#FAFAFA] rounded-[10px] p-3 border border-[#EEEEEE]">
        <p>
          <span className="text-[#7C7C7C]">Customer:</span>{' '}
          <strong>{customerLabel(detail.order)}</strong>
        </p>
        <p>
          <span className="text-[#7C7C7C]">Order:</span>{' '}
          <Link
            href={`/vendor/orders/${detail.order.id}`}
            className="font-bold text-[#0F766E] hover:underline"
          >
            {detail.order.orderNumber}
          </Link>
        </p>
        {deliver && (
          <p>
            <span className="text-[#7C7C7C]">Deliver:</span> <strong>{deliver}</strong>
          </p>
        )}
        {fulfill && (
          <p>
            <span className="text-[#7C7C7C]">Fulfill:</span>{' '}
            <strong className="text-primary">{fulfill}</strong>
          </p>
        )}
        <p>
          <span className="text-[#7C7C7C]">Payment:</span>{' '}
          <strong className="capitalize">
            {(detail.order.paymentMethod ?? '—').replace(/_/g, ' ')}
          </strong>
        </p>
        <p>
          <span className="text-[#7C7C7C]">Boy:</span>{' '}
          <strong>
            {detail.magicLink
              ? `${detail.magicLink.deliveryBoyName} · ${detail.magicLink.deliveryBoyPhone}`
              : detail.deliveryResource
                ? `${detail.deliveryResource.name}${
                    detail.deliveryResource.phone
                      ? ` · ${detail.deliveryResource.phone}`
                      : ''
                  }`
                : 'Unassigned'}
          </strong>
        </p>
        {detail.failedReason && (
          <p>
            <span className="text-[#7C7C7C]">Fail reason:</span>{' '}
            <strong className="text-rose-700">{detail.failedReason}</strong>
          </p>
        )}
      </div>

      {(detail.boyPortal || detail.magicLink) && (
        <div className="rounded-[10px] border border-[#0F766E]/25 bg-[#0F766E]/[0.04] p-3 space-y-2">
          <p className="text-[11px] font-bold text-[#0F766E] uppercase tracking-wide flex items-center gap-1">
            <Link2 size={12} />{' '}
            {detail.boyPortal ? 'Delivery boy portal link' : 'Delivery boy magic link'}
          </p>
          <p className="text-[12px] text-[#7C7C7C] break-all font-mono bg-white border border-[#EEEEEE] rounded-lg px-2 py-1.5">
            {magicLinkAbsoluteUrl((detail.boyPortal ?? detail.magicLink)!.path)}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onVisitMagicLink((detail.boyPortal ?? detail.magicLink)!.path)}
              className="h-[36px] rounded-[10px] border border-[#0F766E]/30 bg-white text-[#0F766E] text-[12px] font-bold hover:bg-[#0F766E]/5 flex items-center justify-center gap-1.5"
            >
              <ExternalLink size={13} /> Visit link
            </button>
            <button
              type="button"
              onClick={() => void onCopyMagicLink((detail.boyPortal ?? detail.magicLink)!.path)}
              className="h-[36px] rounded-[10px] bg-[#0F766E] text-white text-[12px] font-bold hover:bg-[#0D9488] flex items-center justify-center gap-1.5"
            >
              <Copy size={13} /> Copy link
            </button>
          </div>
          {detail.boyPortal && (
            <p className="text-[11px] text-[#7C7C7C]">
              Opens the boy’s full open-order list (then tap an order for OTP).
            </p>
          )}
          {!detail.boyPortal && detail.magicLink?.usedAt && (
            <p className="text-[11px] text-success font-semibold">
              Link used (delivery completed via OTP)
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => onDownloadPicklist(detail.order.id)}
        className="h-[40px] w-full rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold text-[#181725] hover:bg-[#F5F5F5] flex items-center justify-center gap-1.5"
      >
        <ClipboardList size={14} className="text-[#0F766E]" />
        Download picklist
      </button>

      <div>
        <h4 className="text-[12px] font-bold text-[#7C7C7C] uppercase mb-2 flex items-center gap-1">
          <Package size={14} /> Items
        </h4>
        <div className="border border-[#EEEEEE] rounded-[10px] divide-y divide-[#F5F5F5]">
          {detail.items.map((item) => (
            <div key={item.id} className="px-3 py-2.5 text-[13px]">
              <div className="flex justify-between gap-2">
                <span className="font-medium text-[#181725] pr-2">
                  {item.orderItem.productName}
                </span>
                <span className="font-bold shrink-0 text-[#0F766E]">
                  {item.packedQty || item.acceptedQty}×
                </span>
              </div>
              <p className="text-[11px] text-[#AEAEAE] mt-0.5">Qty {item.acceptedQty}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-[12px] font-bold text-[#7C7C7C] uppercase mb-2">Actions</h4>
        <FulfilmentActions detail={detail} busy={busy} onAction={onAction} />
      </div>

      <div>
        <h4 className="text-[12px] font-bold text-[#7C7C7C] uppercase mb-2 flex items-center gap-1">
          <Clock size={14} /> Timeline
        </h4>
        <ol className="space-y-2 border border-[#EEEEEE] rounded-[10px] p-3 max-h-[240px] overflow-y-auto">
          {[
            ...detail.deliveryEvents.map((e) => ({
              id: e.id,
              label: `Delivery · ${e.kind.replace(/_/g, ' ')}`,
              at: e.createdAt,
            })),
            ...detail.events.map((e) => ({
              id: e.id,
              label: e.action.replace(/^fulfilment\./, '').replace(/_/g, ' '),
              at: e.createdAt,
            })),
          ]
            .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
            .slice(0, 40)
            .map((ev) => (
              <li key={ev.id} className="flex justify-between gap-2 text-[12px]">
                <span className="font-medium text-[#181725] capitalize">{ev.label}</span>
                <span className="text-[#AEAEAE] shrink-0">
                  {new Date(ev.at).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          {detail.events.length === 0 && detail.deliveryEvents.length === 0 && (
            <li className="text-[12px] text-[#AEAEAE]">No events yet</li>
          )}
        </ol>
      </div>
    </>
  );
}

function actionSuccessMessage(action: FulfilmentActionBody['action']): string {
  switch (action) {
    case 'mark_packed':
      return 'Marked packed';
    case 'assign_and_dispatch':
      return 'Assigned and dispatched — magic link ready';
    case 'record_failed_delivery':
      return 'Failed delivery recorded';
    case 'reschedule_dispatch':
      return 'Rescheduled — ready to redispatch';
    case 'override_mark_delivered':
      return 'Override delivered';
    case 'mark_delivered':
      return 'Marked delivered';
    default:
      return 'Updated';
  }
}
