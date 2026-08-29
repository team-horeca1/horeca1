'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, IndianRupee, Loader2, XCircle } from 'lucide-react';

type Preview = {
  amount: number;
  notes: string | null;
  claimed: boolean;
  expired: boolean;
  status: string;
  expiresAt: string | null;
  trackingKey: string | null;
};

type View = 'loading' | 'form' | 'done' | 'error';

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

export default function PayoutClaimClient({ token }: { token: string }) {
  const [view, setView] = useState<View>('loading');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/promotions/payout/${encodeURIComponent(token)}`);
        const payload: unknown = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setMessage(apiErrorMessage(payload, 'This payout link is not valid.'));
          setView('error');
          return;
        }
        const data = (payload as { data: Preview }).data;
        setPreview(data);
        if (data.claimed) {
          setMessage('This payout has already been claimed.');
          setView('error');
          return;
        }
        if (data.expired || data.status !== 'pending') {
          setMessage(data.expired ? 'This payout link has expired.' : 'This payout link is no longer active.');
          setView('error');
          return;
        }
        setView('form');
      } catch {
        if (!cancelled) {
          setMessage('Could not load this payout link. Please try again.');
          setView('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage('');
    try {
      const res = await fetch(`/api/v1/promotions/payout/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          businessName: businessName.trim(),
          upiId: upiId.trim(),
        }),
      });
      const payload: unknown = await res.json();
      if (!res.ok) {
        setMessage(apiErrorMessage(payload, 'Could not submit this claim.'));
        setSubmitting(false);
        return;
      }
      const claimedKey = (payload as { data?: { trackingKey?: string | null } }).data?.trackingKey;
      if (claimedKey) {
        setPreview((prev) => (prev ? { ...prev, trackingKey: claimedKey } : prev));
      }
      setView('done');
    } catch {
      setMessage('Could not submit this claim. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-[clamp(0.75rem,4vw,1.25rem)] py-[clamp(1rem,5vw,2.5rem)]">
      <div className="rounded-2xl bg-white p-[clamp(1rem,3vw,1.5rem)] shadow-sm ring-1 ring-gray-100">
        {view === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-10 text-[#7C7C7C]">
            <Loader2 className="h-8 w-8 animate-spin text-[#53B175]" />
            <p>Loading payout…</p>
          </div>
        )}

        {view === 'error' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <XCircle className="h-10 w-10 text-red-500" />
            <h1 className="text-[clamp(1.25rem,3vw,1.75rem)] font-semibold text-[#181725]">Payout unavailable</h1>
            <p className="text-[#7C7C7C]">{message}</p>
          </div>
        )}

        {view === 'done' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-[#53B175]" />
            <h1 className="text-[clamp(1.25rem,3vw,1.75rem)] font-semibold text-[#181725]">Claim received</h1>
            <p className="text-[#7C7C7C]">
              We will transfer ₹{preview ? preview.amount.toLocaleString('en-IN') : ''} to your UPI ID after confirmation.
            </p>
            {preview?.trackingKey ? (
              <p className="rounded-xl bg-gray-50 px-4 py-2 font-mono text-sm font-bold text-[#181725]">
                Tracking ID: {preview.trackingKey}
              </p>
            ) : null}
          </div>
        )}

        {view === 'form' && preview && (
          <form onSubmit={onSubmit} className="space-y-4">
            {preview.notes ? (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-900">{preview.notes}</p>
            ) : null}
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50">
                <IndianRupee className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-[#7C7C7C]">Amount</p>
                <p className="text-[clamp(1.5rem,4vw,2rem)] font-semibold text-[#181725]">
                  ₹{preview.amount.toLocaleString('en-IN')}
                </p>
              </div>
            </div>
            <label className="block text-left">
              <span className="mb-1.5 block text-sm font-medium text-[#181725]">First name</span>
              <input
                required
                maxLength={255}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none focus:border-[#53B175]"
                autoComplete="given-name"
              />
            </label>
            <label className="block text-left">
              <span className="mb-1.5 block text-sm font-medium text-[#181725]">Business name</span>
              <input
                required
                maxLength={255}
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none focus:border-[#53B175]"
                autoComplete="organization"
              />
            </label>
            <label className="block text-left">
              <span className="mb-1.5 block text-sm font-medium text-[#181725]">UPI ID</span>
              <input
                required
                maxLength={100}
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="name@upi"
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none focus:border-[#53B175]"
                autoComplete="off"
                inputMode="email"
              />
            </label>
            {message ? <p className="text-sm text-red-600">{message}</p> : null}
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center rounded-2xl bg-[#53B175] px-6 py-3 font-medium text-white disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Submit'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
