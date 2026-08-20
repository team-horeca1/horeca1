'use client';

// Customer credit wallet dashboard — H1 wallet + vendor credit lines, with
// outstanding/limit/due, repay-now (Razorpay), and transaction history.
import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Wallet as WalletIcon, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Txn { id: string; type: string; amount: string; balanceAfterTxn: string; note: string | null; createdAt: string }
interface CreditWallet {
  id: string;
  vendor: { id: string; businessName: string } | null;
  status: 'ACTIVE' | 'BLOCKED' | 'BLACKLISTED';
  creditLimit: string;
  availableCredit: string;
  usedCredit: string;
  outstandingAmount: string;
  currentDueDate: string | null;
  transactions: Txn[];
}

// Access Razorpay via a local cast (avoids re-declaring the global Window type,
// which is already augmented in cart/checkout pages).
interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
type RazorpayCtor = new (options: Record<string, unknown>) => { open: () => void };
const getRazorpayCtor = (): RazorpayCtor | undefined =>
  (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;

function inr(v: string | number) { return `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`; }

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

export default function WalletPage() {
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

  const repay = async (w: CreditWallet) => {
    const outstanding = Number(w.outstandingAmount);
    if (outstanding <= 0) return;
    setPayingId(w.id);
    try {
      const ok = await loadRazorpay();
      const RazorpayCtor = getRazorpayCtor();
      if (!ok || !RazorpayCtor) throw new Error('Could not load payment gateway');
      const res = await fetch('/api/v1/wallet/create-repayment-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletId: w.id, amount: outstanding }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || 'Could not start repayment');
      const { razorpayOrderId, amount, currency, keyId } = json.data;

      const rzp = new RazorpayCtor({
        key: keyId,
        order_id: razorpayOrderId,
        amount, currency,
        name: 'Horeca1',
        description: 'Credit wallet repayment',
        // Verify synchronously the instant Razorpay confirms payment — this is
        // what actually applies the repayment to the wallet. The webhook is only
        // a server-side backup and does NOT fire in test mode / on localhost.
        handler: async (resp: RazorpayHandlerResponse) => {
          try {
            const v = await fetch('/api/v1/wallet/verify-repayment', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              }),
            });
            const vj = await v.json();
            if (!v.ok || !vj.success) throw new Error(vj.error?.message || 'Could not verify payment');
            toast.success('Payment received — your wallet is updated');
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Payment verification failed — contact support if charged');
          } finally {
            load();
          }
        },
        modal: { ondismiss: () => setPayingId(null) },
        theme: { color: '#299e60' },
      });
      rzp.open();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Repayment failed');
    } finally {
      setPayingId(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="animate-spin text-[#299e60]" size={32} /></div>;
  }

  return (
    <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-8 space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <WalletIcon className="text-[#299e60]" size={24} />
          <h1 className="text-[clamp(20px,4vw,28px)] font-bold text-[#181725]">H1 / DiSCCO Credit</h1>
        </div>
        <p className="text-[13px] text-gray-400 font-medium mt-1">
          Pay-later credit lines (DiSCCO). Cashback lives in your <a href="/rewards" className="text-[#299e60] font-semibold hover:underline">H1 Wallet</a>.
        </p>
      </div>

      {wallets.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          <p className="text-[15px] font-semibold">No H1 / DiSCCO Credit line yet</p>
          <p className="text-[13px] mt-1">Credit unlocks after a few successful orders, or a vendor/admin can assign you a credit line.</p>
        </div>
      )}

      {wallets.map((w) => {
        const outstanding = Number(w.outstandingAmount);
        const overdue = w.currentDueDate ? new Date(w.currentDueDate) < new Date() : false;
        return (
          <div key={w.id} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="p-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">{w.vendor ? w.vendor.businessName : 'H1 / DiSCCO Credit'}</p>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Stat label="Credit Limit" value={inr(w.creditLimit)} />
                  <Stat label="Available" value={inr(w.availableCredit)} accent="green" />
                  <Stat label="Outstanding" value={inr(w.outstandingAmount)} accent={outstanding > 0 ? 'red' : undefined} />
                  <Stat label="Due Date" value={w.currentDueDate ? new Date(w.currentDueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'} accent={overdue ? 'red' : undefined} />
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {w.status === 'BLACKLISTED' && <span className="inline-flex items-center gap-1 text-[12px] font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-full"><AlertCircle size={13} /> Blacklisted</span>}
                {w.status === 'BLOCKED' && <span className="text-[12px] font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full">Blocked</span>}
                <button
                  onClick={() => repay(w)}
                  disabled={outstanding <= 0 || payingId === w.id}
                  className="bg-[#299e60] text-white text-[13px] font-bold px-5 py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#22844f] transition-colors"
                >
                  {payingId === w.id ? 'Opening…' : outstanding > 0 ? `Repay ${inr(outstanding)}` : 'Nothing due'}
                </button>
              </div>
            </div>
            {w.transactions.length > 0 && (
              <div className="border-t border-gray-100 bg-gray-50/40 px-5 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Recent activity</p>
                <div className="space-y-1.5 max-h-48 overflow-auto">
                  {w.transactions.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-[12px]">
                      <span className="text-gray-600">{t.note || t.type} <span className="text-gray-400">· {new Date(t.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span></span>
                      <span className={t.type === 'REPAYMENT' || t.type === 'REVERSAL' ? 'text-green-600 font-semibold' : 'text-[#181725] font-semibold'}>{inr(t.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'red' }) {
  const color = accent === 'green' ? 'text-[#299e60]' : accent === 'red' ? 'text-rose-600' : 'text-[#181725]';
  return (
    <div>
      <p className="text-[11px] text-gray-400 font-medium">{label}</p>
      <p className={`text-[16px] font-bold ${color}`}>{value}</p>
    </div>
  );
}
