'use client';

// Customer DiSCCO — Buy Now, Pay Later. Separate from H1 Wallet (/rewards).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronRight, CreditCard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { dueLabel } from '@/lib/creditDueLabel';

interface Txn {
  id: string;
  type: string;
  amount: string;
  note: string | null;
  createdAt: string;
}

interface CreditWallet {
  id: string;
  vendor: { id: string; businessName: string } | null;
  status: string;
  creditLimit: string;
  availableCredit: string;
  reservedAmount?: string;
  outstandingAmount: string;
  currentDueDate: string | null;
  transactions: Txn[];
}

interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
type RazorpayCtor = new (options: Record<string, unknown>) => { open: () => void };
const getRazorpayCtor = (): RazorpayCtor | undefined =>
  (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;

function inr(v: string | number) {
  return `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (getRazorpayCtor()) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function lineTitle(w: CreditWallet) {
  return w.vendor?.businessName ?? 'Horeca1 Credit';
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ACTIVE') return null;
  if (status === 'BLACKLISTED') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
        <AlertCircle size={11} /> Blacklisted
      </span>
    );
  }
  if (status === 'BLOCKED' || status === 'FROZEN') {
    return <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{status === 'FROZEN' ? 'Frozen' : 'Blocked'}</span>;
  }
  if (status === 'SUSPENDED' || status === 'EXPIRED' || status === 'CANCELLED') {
    return <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
  }
  return null;
}

async function startRepayment(
  walletId: string,
  amount: number,
  onDone: () => void,
  setBusy: (v: boolean) => void,
) {
  setBusy(true);
  try {
    const ok = await loadRazorpay();
    const RazorpayCtor = getRazorpayCtor();
    if (!ok || !RazorpayCtor) throw new Error('Could not load payment gateway');
    const res = await fetch('/api/v1/wallet/create-repayment-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, amount }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error?.message || 'Could not start repayment');
    const { razorpayOrderId, amount: paise, currency, keyId } = json.data;
    const amountPaise = Number(paise);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      throw new Error('Invalid repayment amount from server');
    }

    const rzp = new RazorpayCtor({
      key: keyId,
      order_id: razorpayOrderId,
      amount: amountPaise,
      currency,
      name: 'Horeca1',
      description: 'DiSCCO repayment',
      handler: async (resp: RazorpayHandlerResponse) => {
        try {
          const v = await fetch('/api/v1/wallet/verify-repayment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            }),
          });
          const vj = await v.json();
          if (!v.ok || !vj.success) throw new Error(vj.error?.message || 'Could not verify payment');
          toast.success('Payment received');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Payment verification failed');
        } finally {
          onDone();
        }
      },
      modal: { ondismiss: () => setBusy(false) },
      theme: { color: '#53B175' },
    });
    rzp.open();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Repayment failed');
  } finally {
    setBusy(false);
  }
}

export default function DisccoCreditPage() {
  const [wallets, setWallets] = useState<CreditWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/v1/wallet')
      .then((r) => r.json())
      .then((j) => { if (j.success) setWallets(j.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const lines = useMemo(
    () => [...wallets].sort((a, b) => Number(b.outstandingAmount) - Number(a.outstandingAmount)),
    [wallets],
  );

  const overdueCount = useMemo(
    () => lines.filter((w) => dueLabel(w.currentDueDate, Number(w.outstandingAmount)).tone === 'overdue').length,
    [lines],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-[#53B175]" size={28} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-[clamp(1rem,3vw,2rem)] py-[clamp(1.5rem,4vw,3rem)] space-y-6">
      <header>
        <div className="flex items-center gap-2.5">
          <CreditCard className="text-[#53B175]" size={22} strokeWidth={1.75} />
          <h1 className="text-[clamp(1.4rem,2vw+0.8rem,1.9rem)] font-bold text-[#181725]">DiSCCO</h1>
        </div>
        <p className="text-[14px] text-gray-500 font-medium mt-1">Buy Now, Pay Later</p>
        {overdueCount > 0 && (
          <p className="text-[13px] text-rose-600 font-semibold mt-2">
            {overdueCount} line{overdueCount === 1 ? '' : 's'} overdue
          </p>
        )}
      </header>

      {lines.length === 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
          <p className="text-[15px] font-semibold text-[#181725]">No DiSCCO credit yet</p>
          <p className="text-[13px] text-gray-500 mt-1">Ask your supplier to enable Buy Now, Pay Later for your account.</p>
        </div>
      )}

      <div className="space-y-3">
        {lines.map((w) => {
          const outstanding = Number(w.outstandingAmount);
          const due = dueLabel(w.currentDueDate, outstanding);
          const dueClass =
            due.tone === 'overdue' ? 'text-rose-600'
              : due.tone === 'soon' ? 'text-amber-700'
                : 'text-gray-500';

          return (
            <div key={w.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[16px] font-bold text-[#181725] truncate">{lineTitle(w)}</h2>
                    <StatusBadge status={w.status} />
                  </div>
                  <p className="text-[clamp(1.35rem,2vw+0.6rem,1.75rem)] font-bold text-[#181725] mt-2 tracking-tight">
                    {inr(w.availableCredit)}{' '}
                    <span className="text-[13px] font-medium text-gray-400">available</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                    {outstanding > 0 ? (
                      <span className="font-semibold text-rose-600">{inr(outstanding)} outstanding</span>
                    ) : (
                      <span className="text-gray-500">No outstanding</span>
                    )}
                    <span className={`font-medium ${dueClass}`}>{due.text}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {outstanding > 0 && (
                    <button
                      type="button"
                      disabled={payingId === w.id}
                      onClick={() => {
                        void startRepayment(w.id, outstanding, load, (busy) => setPayingId(busy ? w.id : null));
                      }}
                      className="bg-[#53B175] text-white text-[13px] font-bold px-4 py-2 rounded-xl disabled:opacity-40 hover:bg-[#469E66] transition-colors"
                    >
                      {payingId === w.id ? 'Opening…' : 'Repay'}
                    </button>
                  )}
                  <Link
                    href={`/wallet/${w.id}`}
                    className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-[#53B175] hover:underline"
                  >
                    View Credit <ChevronRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
