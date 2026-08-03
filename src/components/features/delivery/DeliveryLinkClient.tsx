'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MapPin,
  Package,
  Phone,
  Printer,
  XCircle,
} from 'lucide-react';
import {
  DELIVERY_FAIL_REASONS,
  DELIVERY_FAIL_REASON_LABELS,
  DELIVERY_UI_STATUS_LABELS,
  type DeliveryFailReason,
  type DeliveryUiStatus,
} from '@/modules/fulfillment/delivery.scope';
import {
  buildPicklistHtml,
  openPicklistPrintWindow,
} from '@/lib/print/picklistHtml';
import { cn } from '@/lib/utils';

type PublicDeliveryView = {
  token: string;
  path: string;
  listPath?: string;
  expiresAt: string;
  revokedAt: string | null;
  usedAt: string | null;
  deliveryBoyName: string;
  deliveryBoyPhone: string;
  status: DeliveryUiStatus;
  fulfilmentStatus: string;
  failedReason: string | null;
  canRequestOtp: boolean;
  canComplete: boolean;
  canFail: boolean;
  vendor: { name: string; logoUrl: string | null };
  order: {
    id: string;
    orderNumber: string;
    status: string;
    deliveryDate: string | null;
    paymentMethod: string | null;
    totalAmount: string;
    deliveredAt: string | null;
    customer: {
      name: string;
      phone: string | null;
      email: string | null;
    };
    address: {
      label: string | null;
      lines: string[];
      pincode: string | null;
      full: string;
    };
    items: Array<{
      id: string;
      productName: string;
      qty: number;
      packedQty: number;
      sku: string | null;
      unit: string | null;
      imageUrl: string | null;
    }>;
  };
  dispatch: {
    id: string;
    status: string;
    driverName: string | null;
    dispatchedAt: string | null;
    deliveredAt: string | null;
  } | null;
};

type Mode = 'view' | 'otp' | 'fail';

const EMPTY_OTP = ['', '', '', ''] as const;

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

type DeliveryLinkClientProps = {
  token: string;
  /** When set, uses boy-portal APIs (/delivery-boy-link/:token/:fulfilmentId). */
  fulfilmentId?: string;
};

export default function DeliveryLinkClient({ token, fulfilmentId }: DeliveryLinkClientProps) {
  const apiBase = fulfilmentId
    ? `/api/v1/delivery-boy-link/${encodeURIComponent(token)}/${encodeURIComponent(fulfilmentId)}`
    : `/api/v1/delivery-link/${encodeURIComponent(token)}`;

  const [data, setData] = useState<PublicDeliveryView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState<string[]>([...EMPTY_OTP]);
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [failReason, setFailReason] = useState<DeliveryFailReason>('customer_not_available');
  const [failOther, setFailOther] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);

  const otpCode = otp.join('');
  const otpReady = /^\d{4}$/.test(otpCode);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiBase);
      const json = (await res.json()) as { success?: boolean; data?: PublicDeliveryView; error?: unknown };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(apiErrorMessage(json, 'Delivery link not found'));
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load delivery');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  /** Sync view from server without full-page spinner. */
  const refreshQuiet = useCallback(async () => {
    try {
      const res = await fetch(apiBase);
      const json = (await res.json()) as { success?: boolean; data?: PublicDeliveryView; error?: unknown };
      if (!res.ok || !json.success || !json.data) return;
      setData(json.data);
      if (!json.data.canComplete && !json.data.canFail) {
        setMode('view');
      }
    } catch {
      /* keep current UI */
    }
  }, [apiBase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (mode === 'otp') {
      const t = window.setTimeout(() => otpRefs.current[0]?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [mode]);

  function clearOtp() {
    setOtp([...EMPTY_OTP]);
  }

  function handleOtpInput(i: number, value: string) {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 4);
      const next = ['', '', '', ''];
      for (let j = 0; j < digits.length; j++) next[j] = digits[j]!;
      setOtp(next);
      setActionError(null);
      otpRefs.current[Math.min(digits.length, 3)]?.focus();
      return;
    }
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[i] = digit;
    setOtp(next);
    setActionError(null);
    if (digit && i < 3) otpRefs.current[i + 1]?.focus();
  }

  function handleOtpKeyDown(i: number, key: string) {
    if (key === 'Backspace' && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
  }

  async function startComplete() {
    if (!data?.canRequestOtp) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/request-otp`, { method: 'POST' });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { customerPhoneMasked?: string | null };
        error?: unknown;
      };
      if (!res.ok || !json.success) {
        throw new Error(apiErrorMessage(json, 'Could not send OTP'));
      }
      setOtpSentTo(json.data?.customerPhoneMasked ?? null);
      clearOtp();
      setMode('otp');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not send OTP');
    } finally {
      setBusy(false);
    }
  }

  async function submitComplete() {
    if (!otpReady) {
      setActionError('Enter the 4-digit OTP from the customer');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp: otpCode }),
        });
      const json = (await res.json()) as {
        success?: boolean;
        data?: PublicDeliveryView;
        error?: unknown;
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(apiErrorMessage(json, 'Could not complete delivery'));
      }
      setData(json.data);
      setMode('view');
      clearOtp();
      void refreshQuiet();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not complete delivery');
      clearOtp();
      otpRefs.current[0]?.focus();
      void refreshQuiet();
    } finally {
      setBusy(false);
    }
  }

  async function submitFail() {
    if (failReason === 'other' && !failOther.trim()) {
      setActionError('Please describe the reason');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/fail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            failedReason: failReason,
            ...(failReason === 'other' ? { failedReasonOther: failOther.trim() } : {}),
          }),
        });
      const json = (await res.json()) as {
        success?: boolean;
        data?: PublicDeliveryView;
        error?: unknown;
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(apiErrorMessage(json, 'Could not record failure'));
      }
      setData(json.data);
      setMode('view');
      void refreshQuiet();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not record failure');
      void refreshQuiet();
    } finally {
      setBusy(false);
    }
  }

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
          Ask the vendor to open Delivery and share a new dispatch link.
        </p>
      </div>
    );
  }

  const statusLabel = DELIVERY_UI_STATUS_LABELS[data.status] ?? data.status;
  const view = data;

  function printPicklist() {
    const html = buildPicklistHtml({
      orderNumber: view.order.orderNumber,
      customerName: view.order.customer.name,
      customerPhone: view.order.customer.phone,
      address: view.order.address.full || null,
      autoPrint: true,
      items: view.order.items.map((item) => ({
        productName: item.productName,
        sku: item.sku,
        pack: item.unit,
        qty: item.qty,
      })),
    });
    const opened = openPicklistPrintWindow(html);
    if (!opened) {
      setActionError('Allow pop-ups to print the picklist');
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F7F6] text-[#181725]" data-testid="delivery-link-page">
      <header className="border-b border-[#E5EBE9] bg-white">
        <div className="mx-auto max-w-lg px-[clamp(1rem,4vw,1.5rem)] py-4">
          {data.listPath && (
            <Link
              href={data.listPath}
              className="mb-2 inline-flex items-center gap-1 text-[12px] font-bold text-[#0F766E]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All orders
            </Link>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#0F766E]">
                Delivery
              </p>
              <h1 className="truncate text-[clamp(1.1rem,4vw,1.35rem)] font-black">
                {data.vendor.name}
              </h1>
              <p className="text-[12px] text-[#7C7C7C]">
                For {data.deliveryBoyName}
                {data.deliveryBoyPhone ? ` · ${data.deliveryBoyPhone}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={printPicklist}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#D5E5E1] bg-white px-3 text-[12px] font-bold text-[#0F766E]"
              data-testid="delivery-link-print"
            >
              <Printer className="h-3.5 w-3.5" />
              Picklist
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-[clamp(1rem,4vw,1.5rem)] py-5">
        <section
          className="rounded-[12px] border border-[#E5EBE9] bg-white p-4"
          data-testid="delivery-link-label"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#7C7C7C]">
            Order
          </p>
          <p className="mt-1 font-mono text-[clamp(1.25rem,5vw,1.75rem)] font-black tracking-wide">
            {data.order.orderNumber}
          </p>
          <p className="mt-2 text-[15px] font-bold">{data.order.customer.name}</p>
          {data.order.customer.phone && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#3D3D3D]">
              <Phone className="h-3.5 w-3.5 text-[#0F766E]" />
              {data.order.customer.phone}
            </p>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-snug text-[#3D3D3D]">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0F766E]" />
            <span>
              {data.order.address.full || 'Address not specified'}
            </span>
          </p>
          <p className="mt-3 text-[12px] text-[#7C7C7C]">
            Status: <strong className="text-[#181725]">{statusLabel}</strong>
            {data.order.paymentMethod
              ? ` · ${data.order.paymentMethod.replace(/_/g, ' ')}`
              : ''}
          </p>
        </section>

        {(data.status === 'delivered' || data.usedAt) && (
          <div
            className="flex items-center gap-2 rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-bold text-emerald-800"
            data-testid="delivery-link-delivered"
          >
            <CheckCircle2 className="h-4 w-4" />
            Delivered
            {data.order.deliveredAt
              ? ` · ${new Date(data.order.deliveredAt).toLocaleString('en-IN')}`
              : ''}
          </div>
        )}

        {data.status === 'delivery_attempt_failed' && (
          <div
            className="rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900"
            data-testid="delivery-link-failed"
          >
            <p className="flex items-center gap-2 font-bold">
              <XCircle className="h-4 w-4" />
              Delivery attempt failed
            </p>
            {data.failedReason && (
              <p className="mt-1 text-[12px]">{data.failedReason}</p>
            )}
            <p className="mt-2 text-[12px] text-rose-800/80">
              Complete is disabled until the vendor redispatches.
            </p>
          </div>
        )}

        {data.revokedAt && data.status !== 'delivered' && (
          <div
            className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900"
            data-testid="delivery-link-revoked"
          >
            <p className="font-bold">This link was revoked</p>
            <p className="mt-1 text-[12px]">
              The vendor redispatched this order. Ask them for the new delivery link.
            </p>
          </div>
        )}

        <section className="rounded-[12px] border border-[#E5EBE9] bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-[#0F766E]" />
            <h2 className="text-[14px] font-bold">Products</h2>
          </div>
          <ul className="divide-y divide-[#F0F0F0]">
            {data.order.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold leading-snug">{item.productName}</p>
                  {(item.sku || item.unit) && (
                    <p className="mt-0.5 text-[11px] text-[#7C7C7C]">
                      {[item.sku, item.unit].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-[13px] font-bold tabular-nums">
                  ×{item.qty}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {actionError && (
          <p className="rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-800 print:hidden">
            {actionError}
          </p>
        )}

        {/* Actions — screen only */}
        <section className="space-y-3 print:hidden">
          {mode === 'view' && data.canComplete && (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void startComplete()}
                data-testid="delivery-link-complete"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[#0F766E] px-4 text-[14px] font-bold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Complete delivery
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setActionError(null);
                  setMode('fail');
                }}
                data-testid="delivery-link-fail-open"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border border-rose-200 bg-white px-4 text-[14px] font-bold text-rose-700 disabled:opacity-60"
              >
                Fail attempt
              </button>
            </div>
          )}

          {mode === 'otp' && (
            <div className="space-y-3 rounded-[12px] border border-[#D5E5E1] bg-white p-4">
              <p className="text-[13px] font-semibold">
                Enter the 4-digit OTP sent to the customer
                {otpSentTo ? ` (${otpSentTo})` : ''}
              </p>
              <div
                className="flex justify-center gap-2.5 sm:gap-3"
                data-testid="delivery-link-otp-input"
              >
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      otpRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={4}
                    value={digit}
                    disabled={busy}
                    aria-label={`OTP digit ${i + 1}`}
                    onChange={(e) => handleOtpInput(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e.key)}
                    className={cn(
                      'h-[clamp(3rem,12vw,3.5rem)] w-[clamp(2.75rem,11vw,3.25rem)] rounded-[12px] border-2 text-center text-[clamp(1.25rem,5vw,1.5rem)] font-extrabold outline-none transition-all',
                      digit
                        ? 'border-[#0F766E] bg-[#0F766E]/5 text-[#0F766E]'
                        : 'border-[#DDDDDD] bg-white text-[#181725]',
                      'focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/20',
                      busy && 'cursor-not-allowed opacity-60',
                    )}
                  />
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy || !otpReady}
                  onClick={() => void submitComplete()}
                  data-testid="delivery-link-otp-submit"
                  className="inline-flex h-11 items-center justify-center rounded-[10px] bg-[#0F766E] text-[13px] font-bold text-white disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm delivered'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startComplete()}
                  className="inline-flex h-11 items-center justify-center rounded-[10px] border border-[#DDDDDD] text-[13px] font-bold text-[#3D3D3D] disabled:opacity-60"
                >
                  Resend OTP
                </button>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setMode('view');
                  setActionError(null);
                  clearOtp();
                }}
                className="w-full text-center text-[12px] font-semibold text-[#7C7C7C]"
              >
                Cancel
              </button>
            </div>
          )}

          {mode === 'fail' && data.canFail && (
            <div className="space-y-3 rounded-[12px] border border-rose-200 bg-white p-4">
              <p className="text-[13px] font-bold text-rose-900">Why did delivery fail?</p>
              <div className="space-y-2">
                {DELIVERY_FAIL_REASONS.map((reason) => (
                  <label
                    key={reason}
                    className="flex cursor-pointer items-center gap-2 rounded-[8px] border border-[#EEEEEE] px-3 py-2 text-[13px] has-[:checked]:border-[#0F766E] has-[:checked]:bg-[#0F766E]/5"
                  >
                    <input
                      type="radio"
                      name="fail-reason"
                      checked={failReason === reason}
                      onChange={() => setFailReason(reason)}
                      className="accent-[#0F766E]"
                    />
                    {DELIVERY_FAIL_REASON_LABELS[reason]}
                  </label>
                ))}
              </div>
              {failReason === 'other' && (
                <textarea
                  value={failOther}
                  onChange={(e) => setFailOther(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Describe the reason"
                  data-testid="delivery-link-fail-other"
                  className="w-full rounded-[10px] border border-[#DDDDDD] px-3 py-2 text-[13px] outline-none focus:border-[#0F766E]"
                />
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitFail()}
                  data-testid="delivery-link-fail-submit"
                  className="inline-flex h-11 items-center justify-center rounded-[10px] bg-rose-600 text-[13px] font-bold text-white disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm fail'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setMode('view');
                    setActionError(null);
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-[10px] border border-[#DDDDDD] text-[13px] font-bold text-[#3D3D3D]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
