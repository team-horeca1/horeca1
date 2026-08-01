'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MapPin,
  Package,
  Phone,
  XCircle,
} from 'lucide-react';
import {
  RETURN_PICKUP_FAIL_REASONS,
  RETURN_PICKUP_FAIL_REASON_LABELS,
  type ReturnPickupFailReason,
  type ReturnStatus,
} from '@/modules/return/return.types';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  pickup_scheduled: 'Pickup Scheduled',
  goods_received: 'Goods Received',
  inspection_completed: 'Inspection Done',
  closed: 'Closed',
};

type PublicReturnPickupView = {
  token: string;
  path: string;
  expiresAt: string;
  revokedAt: string | null;
  usedAt: string | null;
  deliveryBoyName: string | null;
  deliveryBoyPhone: string | null;
  status: ReturnStatus;
  canRequestOtp: boolean;
  canComplete: boolean;
  canFail: boolean;
  vendor: { name: string; logoUrl: string | null };
  returnRequest: {
    id: string;
    status: ReturnStatus;
    pickupAt: string | null;
    invoiceNumber: string | null;
    order: { id: string; orderNumber: string };
    customer: { name: string; phone: string | null; email: string | null };
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
      sku: string | null;
      unit: string | null;
      imageUrl: string | null;
    }>;
  };
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

export default function ReturnPickupLinkClient({ token }: { token: string }) {
  const [data, setData] = useState<PublicReturnPickupView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState<string[]>([...EMPTY_OTP]);
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [failReason, setFailReason] = useState<ReturnPickupFailReason>('customer_not_available');
  const [failOther, setFailOther] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);

  const otpCode = otp.join('');
  const otpReady = /^\d{4}$/.test(otpCode);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/return-pickup-link/${encodeURIComponent(token)}`);
      const json = (await res.json()) as {
        success?: boolean;
        data?: PublicReturnPickupView;
        error?: unknown;
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(apiErrorMessage(json, 'Return pickup link not found'));
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pickup');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const refreshQuiet = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/return-pickup-link/${encodeURIComponent(token)}`);
      const json = (await res.json()) as {
        success?: boolean;
        data?: PublicReturnPickupView;
        error?: unknown;
      };
      if (!res.ok || !json.success || !json.data) return;
      setData(json.data);
      if (!json.data.canComplete && !json.data.canFail) {
        setMode('view');
      }
    } catch {
      /* keep current UI */
    }
  }, [token]);

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
      const res = await fetch(
        `/api/v1/return-pickup-link/${encodeURIComponent(token)}/request-otp`,
        { method: 'POST' },
      );
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
      const res = await fetch(
        `/api/v1/return-pickup-link/${encodeURIComponent(token)}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp: otpCode }),
        },
      );
      const json = (await res.json()) as {
        success?: boolean;
        data?: PublicReturnPickupView;
        error?: unknown;
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(apiErrorMessage(json, 'Could not complete pickup'));
      }
      setData(json.data);
      setMode('view');
      clearOtp();
      void refreshQuiet();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not complete pickup');
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
      const res = await fetch(
        `/api/v1/return-pickup-link/${encodeURIComponent(token)}/fail`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            failedReason: failReason,
            ...(failReason === 'other' ? { failedReasonOther: failOther.trim() } : {}),
          }),
        },
      );
      const json = (await res.json()) as {
        success?: boolean;
        data?: PublicReturnPickupView;
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
        <Loader2 className="h-8 w-8 animate-spin text-[#B45309]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F4F7F6] p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-600" />
        <p className="text-[16px] font-bold text-[#181725]">{error ?? 'Link not found'}</p>
        <p className="max-w-sm text-[13px] text-[#7C7C7C]">
          Ask the vendor to open Returns and share a new pickup link.
        </p>
      </div>
    );
  }

  const statusLabel = STATUS_LABELS[data.status] ?? data.status;
  const received = data.status === 'goods_received' || data.status === 'inspection_completed' || data.status === 'closed' || !!data.usedAt;

  return (
    <div className="min-h-screen bg-[#F4F7F6] text-[#181725]" data-testid="return-pickup-link-page">
      <header className="border-b border-[#E5EBE9] bg-white">
        <div className="mx-auto max-w-lg px-[clamp(1rem,4vw,1.5rem)] py-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#B45309]">
            Return pickup
          </p>
          <h1 className="truncate text-[clamp(1.1rem,4vw,1.35rem)] font-black">
            {data.vendor.name}
          </h1>
          {(data.deliveryBoyName || data.deliveryBoyPhone) && (
            <p className="text-[12px] text-[#7C7C7C]">
              {data.deliveryBoyName ? `For ${data.deliveryBoyName}` : 'Delivery partner'}
              {data.deliveryBoyPhone ? ` · ${data.deliveryBoyPhone}` : ''}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-[clamp(1rem,4vw,1.5rem)] py-5">
        <section className="rounded-[12px] border border-[#E5EBE9] bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#7C7C7C]">
            Return · Order
          </p>
          <p className="mt-1 font-mono text-[clamp(1.25rem,5vw,1.75rem)] font-black tracking-wide">
            {data.returnRequest.order.orderNumber}
          </p>
          <p className="mt-2 text-[15px] font-bold">{data.returnRequest.customer.name}</p>
          {data.returnRequest.customer.phone && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#3D3D3D]">
              <Phone className="h-3.5 w-3.5 text-[#B45309]" />
              {data.returnRequest.customer.phone}
            </p>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-snug text-[#3D3D3D]">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B45309]" />
            <span>{data.returnRequest.address.full || 'Address not specified'}</span>
          </p>
          <p className="mt-3 text-[12px] text-[#7C7C7C]">
            Status: <strong className="text-[#181725]">{statusLabel}</strong>
            {data.returnRequest.pickupAt
              ? ` · Pickup ${new Date(data.returnRequest.pickupAt).toLocaleString('en-IN')}`
              : ''}
          </p>
        </section>

        {received && (
          <div className="flex items-center gap-2 rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            Goods received
          </div>
        )}

        {data.revokedAt && !received && (
          <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            <p className="font-bold">This link was revoked</p>
            <p className="mt-1 text-[12px]">
              Ask the vendor for a new return pickup link.
            </p>
          </div>
        )}

        <section className="rounded-[12px] border border-[#E5EBE9] bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-[#B45309]" />
            <h2 className="text-[14px] font-bold">Return items</h2>
          </div>
          <ul className="divide-y divide-[#F0F0F0]">
            {data.returnRequest.items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold leading-snug">{item.productName}</p>
                  {(item.sku || item.unit) && (
                    <p className="mt-0.5 text-[11px] text-[#7C7C7C]">
                      {[item.sku, item.unit].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-[13px] font-bold tabular-nums">×{item.qty}</p>
              </li>
            ))}
          </ul>
        </section>

        {actionError && (
          <p className="rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-800">
            {actionError}
          </p>
        )}

        <section className="space-y-3">
          {mode === 'view' && data.canComplete && (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void startComplete()}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[#B45309] px-4 text-[14px] font-bold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Complete pickup
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setActionError(null);
                  setMode('fail');
                }}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border border-rose-200 bg-white px-4 text-[14px] font-bold text-rose-700 disabled:opacity-60"
              >
                Pickup failed
              </button>
            </div>
          )}

          {mode === 'otp' && (
            <div className="space-y-3 rounded-[12px] border border-[#E5EBE9] bg-white p-4">
              <p className="text-[13px] font-bold">Enter customer OTP</p>
              <p className="text-[12px] text-[#7C7C7C]">
                Code sent to {otpSentTo ?? 'customer phone'}. Ask the customer to read it aloud.
              </p>
              <div className="flex justify-center gap-2">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      otpRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={4}
                    value={digit}
                    onChange={(e) => handleOtpInput(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e.key)}
                    className="h-12 w-11 rounded-[10px] border border-[#EEEEEE] text-center text-[18px] font-black outline-none focus:border-[#B45309]/50"
                  />
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy || !otpReady}
                  onClick={() => void submitComplete()}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#B45309] px-4 text-[13px] font-bold text-white disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Confirm received
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startComplete()}
                  className="inline-flex h-11 items-center justify-center rounded-[12px] border border-[#EEEEEE] px-4 text-[13px] font-bold text-[#3D3D3D] disabled:opacity-60"
                >
                  Resend OTP
                </button>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  clearOtp();
                  setMode('view');
                  setActionError(null);
                }}
                className="w-full text-center text-[12px] font-semibold text-[#7C7C7C]"
              >
                Cancel
              </button>
            </div>
          )}

          {mode === 'fail' && (
            <div className="space-y-3 rounded-[12px] border border-rose-100 bg-white p-4">
              <p className="flex items-center gap-2 text-[13px] font-bold text-rose-800">
                <XCircle className="h-4 w-4" />
                Why did pickup fail?
              </p>
              <div className="space-y-1.5">
                {RETURN_PICKUP_FAIL_REASONS.map((reason) => (
                  <label
                    key={reason}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-[13px]',
                      failReason === reason
                        ? 'border-[#B45309] bg-[#B45309]/5 font-semibold'
                        : 'border-[#EEEEEE]',
                    )}
                  >
                    <input
                      type="radio"
                      name="failReason"
                      checked={failReason === reason}
                      onChange={() => setFailReason(reason)}
                      className="accent-[#B45309]"
                    />
                    {RETURN_PICKUP_FAIL_REASON_LABELS[reason]}
                  </label>
                ))}
              </div>
              {failReason === 'other' && (
                <textarea
                  value={failOther}
                  onChange={(e) => setFailOther(e.target.value)}
                  rows={2}
                  placeholder="Describe the reason"
                  className="w-full rounded-[10px] border border-[#EEEEEE] px-3 py-2 text-[13px] outline-none"
                />
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitFail()}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[12px] bg-rose-600 px-4 text-[13px] font-bold text-white disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Submit failure
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setMode('view');
                    setActionError(null);
                  }}
                  className="h-11 rounded-[12px] border border-[#EEEEEE] px-4 text-[13px] font-bold"
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
