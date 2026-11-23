'use client';

// Customer DiSCCO — Buy Now, Pay Later. Separate from H1 Wallet (/rewards).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { dueLabel } from '@/lib/creditDueLabel';
import { JournalStatement, type StatementRow } from '@/components/features/ledger/JournalStatement';
import { storeDisplayName } from '@/lib/storeDisplayName';

interface Txn {
  id: string;
  type: string;
  amount: string;
  note: string | null;
  createdAt: string;
}

interface CreditWallet {
  id: string;
  vendor: { id: string; businessName: string; displayName?: string | null } | null;
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
  return w.vendor ? storeDisplayName(w.vendor) : 'DiSCCO';
}

function isDiscco(w: CreditWallet) {
  return !w.vendor;
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
      description: 'Credit repayment',
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
          if (!v.ok || !vj.success) {
            if (vj.error?.code === 'CAPTURE_PENDING') {
              toast.message(vj.error.message || 'Payment is processing. Do not pay again.');
              return;
            }
            throw new Error(vj.error?.message || 'Could not verify payment');
          }
          toast.success('Payment received');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Payment verification failed');
        } finally {
          onDone();
        }
      },
      modal: { ondismiss: () => setBusy(false) },
      theme: { color: '#6B1D2E' },
      display: { offers: false },
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
  const [journalRows, setJournalRows] = useState<StatementRow[]>([]);
  const [journalSplit, setJournalSplit] = useState({ horeca1: '0.00', suppliers: '0.00' });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/v1/wallet').then((r) => r.json()),
      fetch('/api/v1/ledger/me').then((r) => r.json()).catch(() => null),
    ])
      .then(([j, ledger]) => {
        if (j.success) setWallets(j.data);
        if (ledger?.success && ledger.data?.credit) {
          setJournalSplit({ horeca1: ledger.data.credit.horeca1, suppliers: ledger.data.credit.suppliers });
          setJournalRows(ledger.data.credit.rows ?? []);
        }
      })
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
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  const discco = lines.filter(isDiscco);
  const supplier = lines.filter((w) => !isDiscco(w));
  const youOwe = lines.reduce((sum, w) => sum + Number(w.outstandingAmount), 0);

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <div className="max-w-3xl mx-auto px-[clamp(1rem,3vw,2rem)] pt-[clamp(1.5rem,4vw,3rem)] pb-28 lg:pb-[clamp(1.5rem,4vw,3rem)] space-y-8">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[clamp(1.6rem,2vw+0.8rem,2.1rem)] font-semibold tracking-tight text-[#1C1C1C]">DiSCCO</h1>
          </div>
          <Link href="/rewards" className="text-[13px] font-semibold text-primary shrink-0">Wallet</Link>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white border border-[#E9E3DD] px-4 py-4">
            <p className="text-[12px] font-medium text-[#667085]">You owe</p>
            <p className="mt-1 text-[clamp(1.35rem,2vw+0.5rem,1.75rem)] font-semibold tabular-nums text-[#1C1C1C]">{inr(youOwe)}</p>
          </div>
          <div className="rounded-2xl bg-[#6B1D2E] px-4 py-4 text-white">
            <p className="text-[12px] font-medium text-white/75">Lines</p>
            <p className="mt-1 text-[clamp(1.35rem,2vw+0.5rem,1.75rem)] font-semibold tabular-nums">{lines.length}</p>
          </div>
        </div>

        <p className="text-[13px] text-[#667085]">Journal outstanding · From Horeca1 ₹{journalSplit.horeca1} · From suppliers ₹{journalSplit.suppliers}. Repayment goes to Horeca1.</p>
        <JournalStatement title="Credit statement" rows={journalRows} empty="No credit journal lines yet. The totals above are still the live credit balances." />

        {overdueCount > 0 && (
          <p className="text-[13px] font-semibold text-rose-700">{overdueCount === 1 ? '1 payment is late.' : `${overdueCount} payments are late.`}</p>
        )}

        {lines.length === 0 && (
          <div className="rounded-2xl border border-[#E9E3DD] bg-white px-6 py-10 text-center">
            <p className="text-[16px] font-semibold text-[#1C1C1C]">No credit yet</p>
            <p className="mt-1 text-[13px] text-[#667085]">A supplier or Horeca1 has to give you a limit first.</p>
          </div>
        )}

        <CreditGroup title="From Horeca1" hint="You repay Horeca1" lines={discco} payingId={payingId} onRepay={(w, amount) => {
          void startRepayment(w.id, amount, load, (busy) => setPayingId(busy ? w.id : null));
        }} />
        <CreditGroup title="From suppliers" hint="You repay Horeca1. The supplier is paid after that cash arrives." lines={supplier} payingId={payingId} onRepay={(w, amount) => {
          void startRepayment(w.id, amount, load, (busy) => setPayingId(busy ? w.id : null));
        }} />
      </div>
    </div>
  );
}

function CreditGroup({
  title,
  hint,
  lines,
  payingId,
  onRepay,
}: {
  title: string;
  hint: string;
  lines: CreditWallet[];
  payingId: string | null;
  onRepay: (w: CreditWallet, amount: number) => void;
}) {
  if (lines.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-[#1C1C1C]">{title}</h2>
        <p className="text-[12px] text-[#667085]">{hint}</p>
      </div>
      {lines.map((w) => {
        const outstanding = Number(w.outstandingAmount);
        const reserved = Number(w.reservedAmount ?? 0);
        const due = dueLabel(w.currentDueDate, outstanding);
        const dueClass = due.tone === 'overdue' ? 'text-rose-600' : due.tone === 'soon' ? 'text-amber-700' : 'text-[#667085]';
        return (
          <article key={w.id} className="rounded-2xl border border-[#E9E3DD] bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-[16px] font-semibold text-[#1C1C1C]">{lineTitle(w)}</h3>
                  <StatusBadge status={w.status} />
                </div>
                <p className="mt-3 text-[12px] font-medium text-[#667085]">You can order</p>
                <p className="text-[clamp(1.4rem,2vw+0.5rem,1.8rem)] font-semibold tabular-nums tracking-tight text-[#1C1C1C]">{inr(w.availableCredit)}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                  {outstanding > 0 ? (
                    <span className="font-semibold text-rose-600 tabular-nums">You owe {inr(outstanding)}</span>
                  ) : reserved > 0 ? (
                    <span className="font-semibold text-amber-700 tabular-nums">{inr(reserved)} on open orders</span>
                  ) : (
                    <span className="text-[#667085]">Nothing owed</span>
                  )}
                  <span className={`font-medium ${dueClass}`}>
                    {outstanding > 0 ? due.text : reserved > 0 ? 'Pay after delivery' : ''}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {outstanding > 0 && (
                  <button
                    type="button"
                    disabled={payingId === w.id}
                    onClick={() => onRepay(w, outstanding)}
                    className="min-h-12 rounded-xl bg-primary px-4 text-[13px] font-semibold text-white hover:bg-[#5A1926] disabled:opacity-40"
                  >
                    {payingId === w.id ? 'Opening…' : 'Pay'}
                  </button>
                )}
                <Link href={`/wallet/${w.id}`} className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-primary">
                  Details <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
