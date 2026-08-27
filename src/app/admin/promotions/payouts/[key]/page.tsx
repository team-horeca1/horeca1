'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MarkPaidModal } from '@/components/features/admin/promotions/MarkPaidModal';

type Detail = {
  trackingKey: string;
  kind: 'invite' | 'entry';
  id: string;
  inviteId: string | null;
  entryId: string | null;
  amount: number;
  notes: string | null;
  destination: 'wallet' | 'upi';
  source: string;
  status: string;
  upiId: string | null;
  paidReference: string | null;
  paidAt: string | null;
  creditedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  claimedAt: string | null;
  claimedName: string | null;
  user: { id: string; fullName: string; phone: string | null; email: string | null; businessName: string | null } | null;
  campaign: { id: string; name: string } | null;
  order: { id: string; orderNumber: string } | null;
  claimUrl: string | null;
  claimable: boolean;
};

const inr = (v: number) => `₹${Number(v).toLocaleString('en-IN')}`;
const fmt = (v: string | null) =>
  v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 pt-0.5">{label}</p>
      <div className="text-[13px] font-medium text-[#181725]">{children}</div>
    </div>
  );
}

export default function AdminPayoutDetailPage() {
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
        const res = await fetch(`/api/v1/admin/promotions/payouts/${encodeURIComponent(key)}`);
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
    if (!data?.entryId) return;
    setPaying(true);
    try {
      const res = await fetch(`/api/v1/admin/promotions/entries/${data.entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidReference: ref }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'Failed to mark paid');
      toast.success('Marked as paid');
      setPayOpen(false);
      router.refresh();
      const again = await fetch(`/api/v1/admin/promotions/payouts/${encodeURIComponent(key)}`);
      const againJson = await again.json();
      if (again.ok) setData(againJson.data as Detail);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark paid');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-3xl">
      <Link
        href="/admin/promotions?tab=payouts"
        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-gray-500 hover:text-[#181725] mb-5"
      >
        <ArrowLeft size={14} /> Back to Payouts & Grants
      </Link>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="text-[#53B175] animate-spin" />
        </div>
      ) : !data ? (
        <p className="text-[13px] text-gray-400">No payout found for this tracking ID.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Tracking ID</p>
              <button
                type="button"
                onClick={() => copy(data.trackingKey, 'id')}
                className="font-mono text-[clamp(1.1rem,2vw,1.4rem)] font-bold text-[#181725] hover:text-[#53B175] cursor-pointer"
              >
                {data.trackingKey}
              </button>
              <p className="text-[12px] text-gray-400 mt-1">{inr(data.amount)} · {data.destination === 'wallet' ? 'H1 Wallet' : 'UPI'}</p>
            </div>
            <span className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-bold',
              data.status === 'credited' || data.status === 'paid' ? 'bg-green-50 text-[#53B175]'
                : data.status === 'cancelled' || data.status === 'expired' ? 'bg-gray-100 text-gray-400'
                  : data.status === 'approved' ? 'bg-blue-50 text-blue-600'
                    : data.status === 'awaiting_claim' ? 'bg-purple-50 text-purple-600'
                      : 'bg-amber-50 text-amber-600',
            )}>
              {data.status === 'awaiting_claim' ? 'Awaiting claim' : data.status}
            </span>
          </div>

          {data.claimUrl && (
            <div className="mb-5 rounded-xl bg-gray-50 border border-gray-100 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                {data.claimable ? 'Payout claim URL' : 'Original claim URL'}
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={data.claimUrl}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-[12px] font-mono bg-white"
                />
                <button
                  type="button"
                  onClick={() => copy(data.claimUrl!, 'url')}
                  className="shrink-0 px-3 rounded-lg bg-[#181725] text-white cursor-pointer"
                >
                  {copied === 'url' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-gray-400">
                {data.claimable
                  ? 'Share this link if you forgot to copy it when creating the payout.'
                  : 'This link has already been claimed or is no longer active.'}
              </p>
            </div>
          )}

          <Row label="User">{data.user?.fullName || data.user?.businessName || (data.claimable ? 'Open payout link' : '—')}</Row>
          <Row label="Phone / email">{data.user?.phone || data.user?.email || '—'}</Row>
          <Row label="Notes">{data.notes || '—'}</Row>
          <Row label="Source">{data.source.replace(/_/g, ' ')}{data.order?.orderNumber ? ` · ${data.order.orderNumber}` : ''}{data.campaign?.name ? ` · ${data.campaign.name}` : ''}</Row>
          <Row label="UPI ID">{data.upiId || 'not claimed'}</Row>
          {data.claimedName ? <Row label="Claimed as">{data.claimedName}</Row> : null}
          <Row label="UTR">{data.paidReference || '—'}</Row>
          <Row label="Created">{fmt(data.createdAt)}</Row>
          {data.expiresAt ? <Row label="Expires">{fmt(data.expiresAt)}</Row> : null}
          {data.claimedAt ? <Row label="Claimed">{fmt(data.claimedAt)}</Row> : null}
          {data.paidAt ? <Row label="Paid">{fmt(data.paidAt)}</Row> : null}
          {data.creditedAt ? <Row label="Credited">{fmt(data.creditedAt)}</Row> : null}

          {data.status === 'approved' && data.destination === 'upi' && data.entryId && (
            <button
              type="button"
              disabled={paying}
              onClick={() => setPayOpen(true)}
              className="mt-5 w-full py-2.5 rounded-xl bg-[#53B175] text-white text-[13px] font-bold hover:bg-[#48a068] disabled:opacity-50 cursor-pointer"
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
