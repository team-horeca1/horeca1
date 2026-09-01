'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MarkPaidModal } from '@/components/features/admin/promotions/MarkPaidModal';

type LinkedUser = {
  id: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  businessName: string | null;
  hcidDisplay?: string | null;
};

type Detail = {
  trackingKey: string;
  inviteId: string;
  entryId: string | null;
  amount: number;
  notes: string | null;
  referenceNumber: string | null;
  destination: 'upi';
  status: string;
  upiId: string | null;
  paidReference: string | null;
  paidAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  claimedAt: string | null;
  claimedName: string | null;
  claimedBusinessName: string | null;
  user: LinkedUser | null;
  claimUrl: string | null;
  claimable: boolean;
};

const inr = (v: number) => `₹${Number(v).toLocaleString('en-IN')}`;
const fmt = (v: string | null) =>
  v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-x-3 items-baseline py-1.5 border-b border-gray-50 last:border-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <div className="text-[13px] font-medium text-[#181725] break-words">{children}</div>
    </div>
  );
}

export default function VendorPayoutDetailPage() {
  const params = useParams<{ key: string }>();
  const router = useRouter();
  const key = decodeURIComponent(params.key ?? '');
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<'url' | 'id' | null>(null);
  const [paying, setPaying] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/vendor/promotions/payouts/${encodeURIComponent(key)}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          toast.error(json?.error?.message || 'Payout not found');
          setData(null);
          return;
        }
        setData(json.data as Detail);
      } catch {
        if (!cancelled) toast.error('Could not load payout');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  const copy = async (value: string, which: 'url' | 'id') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      toast.success(which === 'url' ? 'Payout URL copied' : 'Tracking ID copied');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Could not copy');
    }
  };

  const markPaid = async (ref: string) => {
    if (!data?.inviteId) return;
    setPaying(true);
    try {
      const res = await fetch(`/api/v1/vendor/promotions/payout-invites/${data.inviteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidReference: ref }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'Failed to mark paid');
      toast.success('Marked as paid');
      setPayOpen(false);
      router.refresh();
      const again = await fetch(`/api/v1/vendor/promotions/payouts/${encodeURIComponent(key)}`);
      const againJson = await again.json();
      if (again.ok) setData(againJson.data as Detail);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark paid');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-xl">
      <Link
        href="/vendor/promotions?tab=payouts"
        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-gray-500 hover:text-[#181725] mb-4"
      >
        <ArrowLeft size={14} /> Back to Cashback UPI
      </Link>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="text-[#53B175] animate-spin" />
        </div>
      ) : !data ? (
        <p className="text-[13px] text-gray-400">No payout found for this tracking ID.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tracking ID</p>
              <button
                type="button"
                onClick={() => copy(data.trackingKey, 'id')}
                className="font-mono text-[15px] font-bold text-[#181725] hover:text-[#53B175] cursor-pointer"
              >
                {data.trackingKey}
              </button>
              <p className="text-[12px] text-gray-400">{inr(data.amount)} · UPI</p>
            </div>
            <span className={cn(
              'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold',
              data.status === 'paid' ? 'bg-green-50 text-[#53B175]'
                : data.status === 'cancelled' || data.status === 'expired' ? 'bg-gray-100 text-gray-400'
                  : data.status === 'approved' ? 'bg-blue-50 text-blue-600'
                    : data.status === 'awaiting_claim' ? 'bg-purple-50 text-purple-600'
                      : 'bg-amber-50 text-amber-600',
            )}>
              {data.status === 'awaiting_claim' ? 'To claim' : data.status === 'approved' ? 'To pay' : data.status}
            </span>
          </div>

          {data.claimUrl && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[100px] shrink-0">
                {data.claimable ? 'Claim link' : 'Link'}
              </span>
              <button
                type="button"
                onClick={() => copy(data.claimUrl!, 'url')}
                className="inline-flex items-center gap-1.5 min-w-0 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-bold text-[#181725] hover:border-[#53B175] cursor-pointer"
                title={data.claimUrl}
              >
                {copied === 'url' ? <Check size={12} /> : <Copy size={12} />}
                Copy link
              </button>
            </div>
          )}

          <Row label="Reference">{data.referenceNumber || '—'}</Row>
          {data.user ? (
            <>
              <Row label="Customer">
                {data.user.fullName || data.user.businessName || '—'}
              </Row>
              {data.user.businessName && data.user.fullName ? (
                <Row label="Biz">{data.user.businessName}</Row>
              ) : null}
              <Row label="Phone">{data.user.phone || '—'}</Row>
              <Row label="Email">{data.user.email || '—'}</Row>
              {data.user.hcidDisplay ? <Row label="HCID">{data.user.hcidDisplay}</Row> : null}
            </>
          ) : (
            <Row label="Customer">Not linked</Row>
          )}
          <Row label="Claim name">{data.claimedName || '—'}</Row>
          <Row label="Claim biz">{data.claimedBusinessName || '—'}</Row>
          <Row label="Message">{data.notes || '—'}</Row>
          <Row label="UPI ID">{data.upiId || 'not claimed'}</Row>
          <Row label="UTR">{data.paidReference || '—'}</Row>
          <Row label="Created">{fmt(data.createdAt)}</Row>
          {data.expiresAt ? <Row label="Expires">{fmt(data.expiresAt)}</Row> : null}
          {data.claimedAt ? <Row label="Claimed">{fmt(data.claimedAt)}</Row> : null}
          {data.paidAt ? <Row label="Paid">{fmt(data.paidAt)}</Row> : null}

          {data.status === 'approved' && data.entryId && (
            <button
              type="button"
              disabled={paying}
              onClick={() => setPayOpen(true)}
              className="mt-4 w-full py-2.5 rounded-xl bg-[#53B175] text-white text-[13px] font-bold hover:bg-[#48a068] disabled:opacity-50 cursor-pointer"
            >
              Mark Paid
            </button>
          )}
        </div>
      )}
      {payOpen && data?.entryId && (
        <MarkPaidModal
          amountLabel={inr(data.amount)}
          upiId={data.upiId}
          trackingKey={data.trackingKey}
          submitting={paying}
          onClose={() => {
            if (!paying) setPayOpen(false);
          }}
          onConfirm={(ref) => void markPaid(ref)}
        />
      )}
    </div>
  );
}
