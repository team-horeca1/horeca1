'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, Loader2, MapPin, Package, Phone } from 'lucide-react';
import {
  DELIVERY_UI_STATUS_LABELS,
  DELIVERY_UI_STATUS_STYLE,
  type DeliveryUiStatus,
} from '@/modules/fulfillment/delivery.scope';
import { cn } from '@/lib/utils';

type PortalOrder = {
  fulfilmentId: string;
  orderId: string;
  orderNumber: string;
  status: DeliveryUiStatus;
  fulfilmentStatus: string;
  failedReason: string | null;
  paymentMethod: string | null;
  customerName: string;
  customerPhone: string | null;
  addressSummary: string | null;
  path: string;
};

type PortalList = {
  token: string;
  path: string;
  deliveryBoyName: string;
  deliveryBoyPhone: string | null;
  vendor: { name: string; logoUrl: string | null };
  orders: PortalOrder[];
};

function apiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const err = (payload as { error?: unknown }).error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return fallback;
}

export default function DeliveryBoyPortalList({ token }: { token: string }) {
  const [data, setData] = useState<PortalList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/delivery-boy-link/${encodeURIComponent(token)}`);
      const json = (await res.json()) as {
        success?: boolean;
        data?: PortalList;
        error?: unknown;
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(apiErrorMessage(json, 'Delivery boy link not found'));
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deliveries');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F7F6]">
        <Loader2 className="h-8 w-8 animate-spin text-[#0F766E]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F4F7F6] p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-600" />
        <p className="text-[16px] font-bold text-[#181725]">{error ?? 'Link not found'}</p>
        <p className="max-w-sm text-[13px] text-[#7C7C7C]">
          Ask the vendor to open Delivery Boy and share a new portal link.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F7F6] text-[#181725]" data-testid="delivery-boy-portal-list">
      <header className="border-b border-[#E5EBE9] bg-white">
        <div className="mx-auto max-w-lg px-[clamp(1rem,4vw,1.5rem)] py-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#0F766E]">
            Delivery runs
          </p>
          <h1 className="truncate text-[clamp(1.1rem,4vw,1.35rem)] font-black">
            {data.vendor.name}
          </h1>
          <p className="text-[12px] text-[#7C7C7C]">
            {data.deliveryBoyName}
            {data.deliveryBoyPhone ? ` · ${data.deliveryBoyPhone}` : ''}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-3 px-[clamp(1rem,4vw,1.5rem)] py-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-bold text-[#181725]">
            {data.orders.length} open {data.orders.length === 1 ? 'order' : 'orders'}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-[12px] font-bold text-[#0F766E]"
          >
            Refresh
          </button>
        </div>

        {data.orders.length === 0 ? (
          <div className="rounded-[12px] border border-[#E5EBE9] bg-white p-8 text-center">
            <Package className="mx-auto h-8 w-8 text-[#AEAEAE]" />
            <p className="mt-3 text-[14px] font-bold text-[#181725]">No open deliveries</p>
            <p className="mt-1 text-[12px] text-[#7C7C7C]">
              New assignments from the vendor will show up here.
            </p>
          </div>
        ) : (
          data.orders.map((order) => (
            <Link
              key={order.fulfilmentId}
              href={order.path}
              className="flex items-start gap-3 rounded-[12px] border border-[#E5EBE9] bg-white p-4 transition-colors hover:border-[#0F766E]/40"
              data-testid="delivery-boy-order-row"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-[14px] font-black tracking-wide">
                    {order.orderNumber}
                  </p>
                  <span
                    className={cn(
                      'rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase',
                      DELIVERY_UI_STATUS_STYLE[order.status],
                    )}
                  >
                    {DELIVERY_UI_STATUS_LABELS[order.status]}
                  </span>
                </div>
                <p className="mt-1 text-[14px] font-bold">{order.customerName}</p>
                {order.customerPhone && (
                  <p className="mt-0.5 flex items-center gap-1 text-[12px] text-[#3D3D3D]">
                    <Phone className="h-3 w-3 text-[#0F766E]" />
                    {order.customerPhone}
                  </p>
                )}
                {order.addressSummary && (
                  <p className="mt-1 flex items-start gap-1 text-[12px] leading-snug text-[#7C7C7C]">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#0F766E]" />
                    <span className="line-clamp-2">{order.addressSummary}</span>
                  </p>
                )}
                {order.failedReason && (
                  <p className="mt-1 text-[11px] font-semibold text-rose-700">
                    {order.failedReason}
                  </p>
                )}
              </div>
              <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[#AEAEAE]" />
            </Link>
          ))
        )}
      </main>
    </div>
  );
}
