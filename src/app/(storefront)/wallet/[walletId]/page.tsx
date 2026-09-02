'use client';

// DiSCCO credit line detail — one supplier (or Horeca1) line.
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { dueLabel } from '@/lib/creditDueLabel';

interface Txn {
  id: string;
  type: string;
  amount: string;
  balanceAfterTxn: string;
  note: string | null;
  createdAt: string;
  referenceId?: string | null;
}

interface Repayment {
  id: string;
  amount: string;
  status: string;
  repaymentMethod: string;
  createdAt: string;
}

interface Penalty {
  id: string;
  type: string;
  amount: string;
  appliedDate: string;
  status: string;
}

interface CreditTerms {
  repaymentMode: string;
  billingModel: string;
  creditTenureDays: number;
  gracePeriodDays: number;
  interestRatePct: number;
  interestFrequencyDays: number;
  penaltyAmount: number;
  penaltyFrequencyDays: number;
  blacklistDays: number;
}

interface CreditWallet {
  id: string;
  vendor: { id: string; businessName: string } | null;
  status: string;
  creditLimit: string;
  availableCredit: string;
  usedCredit: string;
  reservedAmount?: string;
  outstandingAmount: string;
  currentDueDate: string | null;
  lastUtilizationDate?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  overdueDays?: number;
  transactions: Txn[];
  repayments?: Repayment[];
  penalties?: Penalty[];
  terms?: CreditTerms;
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

function txnLabel(type: string) {
  switch (type) {
    case 'CREDIT_ASSIGN': return 'Credit assigned';
    case 'ORDER_DEBIT': return 'Order reserved';
    case 'DELIVERY_CONVERT': return 'Order delivered';
    case 'REPAYMENT': return 'Repayment';
    case 'PENALTY': return 'Penalty / interest';
    case 'REVERSAL': return 'Released';
    default: return type;
  }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DisccoCreditDetailPage() {
  const params = useParams();
  const walletId = typeof params?.walletId === 'string' ? params.walletId : '';
  const [wallet, setWallet] = useState<CreditWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');

  const load = useCallback(() => {
    if (!walletId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/wallet/${walletId}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || !j.success) throw new Error(j.error?.message || 'Credit not found');
        setWallet(j.data);
        const o = Number(j.data.outstandingAmount);
        setAmount(o > 0 ? String(o) : '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [walletId]);

  useEffect(() => { load(); }, [load]);

  const repay = async () => {
    if (!wallet) return;
    const outstanding = Number(wallet.outstandingAmount);
    const parsed = Number(amount);
    if (!(parsed > 0) || parsed > outstanding) {
      toast.error('Enter an amount up to the outstanding balance');
      return;
    }
    setPaying(true);
    try {
      const ok = await loadRazorpay();
      const RazorpayCtor = getRazorpayCtor();
      if (!ok || !RazorpayCtor) throw new Error('Could not load payment gateway');
      const res = await fetch('/api/v1/wallet/create-repayment-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletId: wallet.id, amount: parsed }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || 'Could not start repayment');
      const { razorpayOrderId, amount: paise, currency, keyId } = json.data;
      const amountPaise = Number(paise);
      if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
        throw new Error('Invalid repayment amount from server');
      }
      const title = wallet.vendor?.businessName ?? 'Horeca1 Credit';

      const rzp = new RazorpayCtor({
        key: keyId,
        order_id: razorpayOrderId,
        amount: amountPaise,
        currency,
        name: 'Horeca1',
        description: `DiSCCO · ${title}`,
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
            toast.error(e instanceof Error ? e.message : 'Verification failed');
          } finally {
            load();
          }
        },
        modal: { ondismiss: () => setPaying(false) },
        theme: { color: '#6B1D2E' },
      });
      rzp.open();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Repayment failed');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  if (error || !wallet) {
    return (
      <div className="max-w-2xl mx-auto px-[clamp(1rem,3vw,2rem)] py-12 text-center space-y-3">
        <AlertCircle className="mx-auto text-rose-500" size={28} />
        <p className="text-[15px] font-semibold text-[#181725]">{error || 'Credit not found'}</p>
        <Link href="/wallet" className="text-[13px] font-semibold text-primary hover:underline">Back to DiSCCO</Link>
      </div>
    );
  }

  const outstanding = Number(wallet.outstandingAmount);
  const due = dueLabel(wallet.currentDueDate, outstanding);
  const title = wallet.vendor?.businessName ?? 'Horeca1 Credit';
  const terms = wallet.terms;
  const dueClass =
    due.tone === 'overdue' ? 'text-rose-600'
      : due.tone === 'soon' ? 'text-amber-700'
        : 'text-gray-500';

  return (
    <div className="max-w-3xl mx-auto px-[clamp(1rem,3vw,2rem)] py-[clamp(1.5rem,4vw,3rem)] space-y-6">
      <Link href="/wallet" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 hover:text-primary">
        <ArrowLeft size={14} /> DiSCCO
      </Link>

      <header>
        <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide">Buy Now, Pay Later</p>
        <h1 className="text-[clamp(1.4rem,2vw+0.8rem,1.9rem)] font-bold text-[#181725] mt-1">{title}</h1>
        <p className="text-[clamp(1.6rem,2.5vw+0.8rem,2.2rem)] font-bold text-[#181725] mt-3 tracking-tight">
          {inr(wallet.availableCredit)}
        </p>
        <p className="text-[13px] text-gray-500 font-medium">Available credit</p>
        <p className={`mt-2 text-[13px] font-semibold ${dueClass}`}>{due.text}</p>
      </header>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Status" value={wallet.status.charAt(0) + wallet.status.slice(1).toLowerCase()} />
        <Field label="Credit limit" value={inr(wallet.creditLimit)} />
        <Field label="Utilized" value={inr(wallet.usedCredit)} />
        <Field label="Reserved" value={inr(wallet.reservedAmount ?? 0)} />
        <Field label="Outstanding" value={inr(wallet.outstandingAmount)} accent={outstanding > 0 ? 'red' : undefined} />
        <Field label="Due date" value={fmtDate(wallet.currentDueDate)} accent={due.tone === 'overdue' ? 'red' : undefined} />
      </div>

      {terms && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-3">
          <h2 className="text-[15px] font-bold text-[#181725]">Credit terms</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Repayment" value={terms.repaymentMode.replace(/_/g, ' ').toLowerCase()} />
            <Field label="Billing" value={terms.billingModel.replace(/_/g, ' ').toLowerCase()} />
            <Field label="Tenure" value={`${terms.creditTenureDays} days`} />
            <Field label="Grace period" value={`${terms.gracePeriodDays} days`} />
            <Field label="Interest" value={`${terms.interestRatePct}% / ${terms.interestFrequencyDays}d`} />
            <Field label="Late fee" value={`${inr(terms.penaltyAmount)} / ${terms.penaltyFrequencyDays}d`} />
          </div>
        </div>
      )}

      {outstanding <= 0 && Number(wallet.reservedAmount ?? 0) > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
          <h2 className="text-[15px] font-bold text-[#181725]">Pay after delivery</h2>
          <p className="text-[13px] text-gray-600 mt-1">
            {inr(wallet.reservedAmount ?? 0)} is reserved on orders that are not delivered yet.
            The Pay now button appears once those orders convert to outstanding.
          </p>
        </div>
      )}

      {outstanding > 0 && (
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5 space-y-3">
          <h2 className="text-[15px] font-bold text-[#181725]">Repay</h2>
          <p className="text-[13px] text-gray-600">
            Outstanding {inr(outstanding)}
            {wallet.currentDueDate ? ` · Due ${fmtDate(wallet.currentDueDate)}` : ''}
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[140px]">
              <label className="text-[11px] font-medium text-gray-400">Amount</label>
              <input
                type="number"
                min={1}
                max={outstanding}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <button
              type="button"
              onClick={() => setAmount(String(outstanding))}
              className="text-[12px] font-bold text-primary px-2 py-2.5 hover:underline"
            >
              Pay full
            </button>
            <button
              type="button"
              onClick={() => void repay()}
              disabled={paying}
              className="bg-primary text-white text-[13px] font-bold px-5 py-2.5 rounded-xl disabled:opacity-40 hover:bg-primary-dark shadow-sm shadow-primary/20"
            >
              {paying ? 'Opening…' : 'Pay now'}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50">
          <h2 className="text-[15px] font-bold text-[#181725]">Transactions</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {wallet.transactions.length === 0 && (
            <p className="px-5 py-6 text-[13px] text-gray-400">No transactions yet.</p>
          )}
          {wallet.transactions.map((t) => (
            <div key={t.id} className="px-5 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#181725]">{t.note || txnLabel(t.type)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {new Date(t.createdAt).toLocaleString('en-IN')}
                </p>
              </div>
              <p className={`text-[13px] font-bold shrink-0 ${t.type === 'REPAYMENT' || t.type === 'REVERSAL' ? 'text-success' : 'text-[#181725]'}`}>
                {inr(t.amount)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {(wallet.repayments?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-2">
          <h2 className="text-[15px] font-bold text-[#181725]">Repayments</h2>
          {wallet.repayments!.map((r) => (
            <div key={r.id} className="flex justify-between text-[13px]">
              <span className="text-gray-600">{fmtDate(r.createdAt)} · {r.status}</span>
              <span className="font-semibold text-success">{inr(r.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {(wallet.penalties?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-2">
          <h2 className="text-[15px] font-bold text-[#181725]">Fees</h2>
          {wallet.penalties!.map((p) => (
            <div key={p.id} className="flex justify-between text-[13px]">
              <span className="text-gray-600">{fmtDate(p.appliedDate)} · {p.type}</span>
              <span className="font-semibold text-rose-600">{inr(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'red' }) {
  const color = accent === 'green' ? 'text-success' : accent === 'red' ? 'text-rose-600' : 'text-[#181725]';
  return (
    <div>
      <p className="text-[11px] text-gray-400 font-medium">{label}</p>
      <p className={`text-[14px] font-bold capitalize ${color}`}>{value}</p>
    </div>
  );
}
