'use client';

// /rewards — Promo Engine Phase 1 customer surface.
// Shows the Rewards Wallet balance (spendable at checkout), every cashback
// earned (order cashback + direct incentives), and the "Grab your incentive"
// claim flow: UPI cashbacks ask for the user's UPI ID, then ops pays out.

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Gift, Wallet, Loader2, CheckCircle2, Clock, XCircle, IndianRupee, ArrowDownLeft, ArrowUpRight, Copy, Share2, Users } from 'lucide-react';

interface CashbackEntryRow {
    id: string;
    amount: string | number;
    destination: 'wallet' | 'upi';
    status: 'pending' | 'approved' | 'credited' | 'paid' | 'cancelled';
    source: 'order' | 'direct_grant';
    upiId: string | null;
    notes: string | null;
    createdAt: string;
    campaign: { name: string } | null;
    order: { orderNumber: string } | null;
}

interface WalletTxnRow {
    id: string;
    type: 'credit' | 'debit';
    amount: string | number;
    referenceType: string | null;
    notes: string | null;
    createdAt: string;
}

interface ReferralRewardRow {
    id?: string;
    side?: string;
    rewardType: string;
    rewardValue: string | number;
    createdAt?: string;
}

interface ReferralData {
    token: string;
    invitePath?: string;
    inviteUrl: string;
    referredCount: number;
    rewards: ReferralRewardRow[];
    referredBy: { name: string; createdAt: string; rewards: ReferralRewardRow[] } | null;
}

function publicInviteUrl(referral: ReferralData): string {
    if (typeof window !== 'undefined' && referral.token) {
        return `${window.location.origin}/invite/${referral.token}`;
    }
    if (referral.invitePath && typeof window !== 'undefined') {
        return `${window.location.origin}${referral.invitePath}`;
    }
    return referral.inviteUrl;
}

function formatProgramReward(type: string, value: string | number) {
    const n = Number(value);
    const inr = `₹${n.toLocaleString('en-IN')}`;
    if (type === 'wallet_credit') return `${inr} H1 Wallet credit`;
    if (type === 'cashback') return `${inr} cashback`;
    if (type === 'coupon_flat') return `${inr} coupon`;
    if (type === 'coupon_percentage') return `${n}% coupon`;
    if (type === 'free_delivery') return 'Free delivery';
    return inr;
}

const STATUS_META: Record<CashbackEntryRow['status'], { label: string; cls: string }> = {
    pending: { label: 'Pending delivery', cls: 'bg-amber-50 text-amber-600' },
    approved: { label: 'Ready to pay out', cls: 'bg-blue-50 text-blue-600' },
    credited: { label: 'In wallet', cls: 'bg-green-50 text-[#53B175]' },
    paid: { label: 'Paid to UPI', cls: 'bg-green-50 text-[#53B175]' },
    cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-400' },
};

export default function RewardsPage() {
    const { status: sessionStatus } = useSession();
    const [loading, setLoading] = useState(true);
    const [balance, setBalance] = useState(0);
    const [entries, setEntries] = useState<CashbackEntryRow[]>([]);
    const [txns, setTxns] = useState<WalletTxnRow[]>([]);
    const [referral, setReferral] = useState<ReferralData | null>(null);
    const [copying, setCopying] = useState(false);
    const [claimingId, setClaimingId] = useState<string | null>(null);
    const [upiInput, setUpiInput] = useState('');
    const [claimBusy, setClaimBusy] = useState(false);
    const [claimError, setClaimError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            fetch('/api/v1/promotions/rewards').then((r) => r.json()),
            fetch('/api/v1/promotions/referral').then((r) => r.json()).catch(() => null),
        ])
            .then(([rewardsJson, referralJson]: [
                { success?: boolean; data?: { walletBalance: number; entries: CashbackEntryRow[]; walletTransactions: WalletTxnRow[] } },
                { success?: boolean; data?: ReferralData } | null,
            ]) => {
                if (rewardsJson?.success && rewardsJson.data) {
                    setBalance(Number(rewardsJson.data.walletBalance) || 0);
                    setEntries(rewardsJson.data.entries ?? []);
                    setTxns(rewardsJson.data.walletTransactions ?? []);
                }
                if (referralJson?.success && referralJson.data) {
                    setReferral(referralJson.data);
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (sessionStatus !== 'authenticated') return;
        load();
    }, [sessionStatus, load]);

    const submitClaim = async (entryId: string) => {
        setClaimBusy(true);
        setClaimError(null);
        try {
            const res = await fetch(`/api/v1/promotions/rewards/${entryId}/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ upiId: upiInput.trim() }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error?.message || 'Could not save UPI ID');
            setClaimingId(null);
            setUpiInput('');
            load();
        } catch (err) {
            setClaimError(err instanceof Error ? err.message : 'Could not save UPI ID');
        } finally {
            setClaimBusy(false);
        }
    };

    if (sessionStatus === 'unauthenticated') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50/50 px-4">
                <div className="text-center">
                    <Gift size={40} className="text-[#53B175] mx-auto mb-3" strokeWidth={1.5} />
                    <p className="text-[18px] font-bold text-gray-800 mb-2">Sign in to see your rewards</p>
                    <Link href="/login" className="text-[14px] text-[#53B175] font-semibold hover:underline">Sign in</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50/50">
            <div className="max-w-3xl mx-auto px-[clamp(1rem,3vw,2rem)] py-[clamp(1.5rem,4vw,3rem)]">
                <h1 className="text-[clamp(1.4rem,2vw+0.8rem,1.9rem)] font-bold text-[#181725] mb-1">H1 Wallet</h1>

                {/* Wallet balance card */}
                <div className="bg-[#181725] rounded-2xl p-6 mb-6 text-white relative overflow-hidden">
                    <div className="flex items-center gap-2 text-white/60 text-[12px] font-bold uppercase tracking-wider mb-2">
                        <Wallet size={14} strokeWidth={1.5} /> H1 Wallet
                    </div>
                    <p className="text-[clamp(1.8rem,3vw+1rem,2.6rem)] font-black tracking-tight">
                        ₹{balance.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[13px] text-white/55 font-medium mt-1">Available to spend</p>
                </div>

                {referral && (
                    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
                        <div className="flex items-center gap-2 mb-1">
                            <Users size={16} className="text-[#53B175]" strokeWidth={2} />
                            <h2 className="text-[15px] font-bold text-[#181725]">Invite friends</h2>
                        </div>
                        <p className="text-[12px] text-gray-400 font-medium mb-3">
                            Share your unique link. Rewards credit to your H1 Wallet.
                        </p>
                        <div className="flex gap-2">
                            <input
                                readOnly
                                value={publicInviteUrl(referral)}
                                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 text-[12px] font-semibold text-[#181725] bg-gray-50"
                            />
                            <button
                                type="button"
                                disabled={copying}
                                onClick={async () => {
                                    setCopying(true);
                                    try {
                                        await navigator.clipboard.writeText(publicInviteUrl(referral));
                                        toast.success('Invite link copied');
                                    } catch {
                                        toast.error('Could not copy link');
                                    } finally {
                                        setCopying(false);
                                    }
                                }}
                                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#53B175] text-white text-[12px] font-bold hover:bg-[#48a068] cursor-pointer"
                            >
                                <Copy size={13} strokeWidth={2.5} />
                                Copy
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const url = publicInviteUrl(referral);
                                    if (typeof navigator.share === 'function') {
                                        void navigator.share({
                                            title: 'Join me on HoReCa Hub',
                                            text: 'Order supplies on HoReCa Hub with my invite',
                                            url,
                                        }).catch(() => {});
                                        return;
                                    }
                                    void navigator.clipboard.writeText(url)
                                        .then(() => toast.success('Invite link copied'))
                                        .catch(() => toast.error('Could not copy link'));
                                }}
                                className="shrink-0 p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
                                aria-label="Share invite"
                            >
                                <Share2 size={15} strokeWidth={2} />
                            </button>
                        </div>
                        <p className="text-[12px] text-gray-500 font-medium mt-3">
                            {referral.referredCount === 0
                                ? 'No referrals yet.'
                                : `${referral.referredCount} friend${referral.referredCount === 1 ? '' : 's'} joined with your link.`}
                        </p>
                        {referral.rewards.length > 0 && (
                            <ul className="mt-2 space-y-1">
                                {referral.rewards.map((r) => (
                                    <li key={r.id ?? `${r.rewardType}-${r.createdAt}`} className="text-[12px] text-[#53B175] font-semibold">
                                        + {formatProgramReward(r.rewardType, r.rewardValue)}
                                        {r.createdAt ? ` · ${new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : ''}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {referral.referredBy && (
                            <p className="text-[12px] text-gray-400 font-medium mt-3">
                                You joined via {referral.referredBy.name}
                                {referral.referredBy.rewards.length > 0
                                    ? ` — ${referral.referredBy.rewards.map((r) => formatProgramReward(r.rewardType, r.rewardValue)).join(', ')}`
                                    : ''}
                                .
                            </p>
                        )}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={28} className="text-[#53B175] animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* Cashback entries */}
                        <h2 className="text-[15px] font-bold text-[#181725] mb-3">Cashback & Incentives</h2>
                        {entries.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center mb-8">
                                <Gift size={32} className="text-gray-300 mx-auto mb-2" strokeWidth={1.5} />
                                <p className="text-[13px] text-gray-400 font-medium">No cashback yet — keep ordering to earn rewards.</p>
                            </div>
                        ) : (
                            <div className="space-y-3 mb-8">
                                {entries.map((e) => {
                                    const meta = STATUS_META[e.status];
                                    const needsUpi = e.destination === 'upi' && !e.upiId && (e.status === 'pending' || e.status === 'approved');
                                    return (
                                        <div key={e.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-[14px] font-bold text-[#181725]">
                                                        ₹{Number(e.amount).toLocaleString('en-IN')}
                                                        <span className="text-gray-400 font-medium text-[12px]">
                                                            {' '}· {e.source === 'direct_grant' ? 'Incentive from Horeca1' : e.campaign?.name ?? 'Order cashback'}
                                                        </span>
                                                    </p>
                                                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                                                        {e.order?.orderNumber ? `${e.order.orderNumber} · ` : ''}
                                                        {new Date(e.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        {e.destination === 'upi' && e.upiId ? ` · UPI: ${e.upiId}` : ''}
                                                    </p>
                                                </div>
                                                <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${meta.cls}`}>
                                                    {e.status === 'credited' || e.status === 'paid' ? <CheckCircle2 size={11} strokeWidth={1.5} /> : e.status === 'cancelled' ? <XCircle size={11} strokeWidth={1.5} /> : <Clock size={11} strokeWidth={1.5} />}
                                                    {meta.label}
                                                </span>
                                            </div>

                                            {needsUpi && (
                                                claimingId === e.id ? (
                                                    <div className="mt-3 flex gap-2">
                                                        <input
                                                            value={upiInput}
                                                            onChange={(ev) => { setUpiInput(ev.target.value); setClaimError(null); }}
                                                            placeholder="yourname@upi"
                                                            className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 text-[13px] font-semibold focus:outline-none focus:border-[#53B175]"
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={claimBusy || !upiInput.trim()}
                                                            onClick={() => submitClaim(e.id)}
                                                            className="shrink-0 px-4 py-2 rounded-xl bg-[#53B175] text-white text-[12px] font-bold disabled:bg-gray-200 disabled:text-gray-400 hover:bg-[#48a068] transition-colors cursor-pointer"
                                                        >
                                                            {claimBusy ? <Loader2 size={13} className="animate-spin" /> : 'Save UPI'}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => { setClaimingId(e.id); setUpiInput(''); setClaimError(null); }}
                                                        className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-green-50 text-[#53B175] text-[12px] font-bold hover:bg-green-100 transition-colors cursor-pointer"
                                                    >
                                                        <IndianRupee size={13} strokeWidth={1.5} /> Grab your incentive — add UPI ID
                                                    </button>
                                                )
                                            )}
                                            {claimingId === e.id && claimError && (
                                                <p className="text-[11px] font-bold text-red-500 mt-1.5">{claimError}</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Wallet ledger */}
                        <h2 className="text-[15px] font-bold text-[#181725] mb-3">Wallet Activity</h2>
                        {txns.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
                                <p className="text-[13px] text-gray-400 font-medium">No wallet activity yet.</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
                                {txns.map((t) => (
                                    <div key={t.id} className="flex items-center justify-between px-4 py-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${t.type === 'credit' ? 'bg-green-50' : 'bg-red-50'}`}>
                                                {t.type === 'credit'
                                                    ? <ArrowDownLeft size={14} className="text-[#53B175]" strokeWidth={1.5} />
                                                    : <ArrowUpRight size={14} className="text-red-500" strokeWidth={1.5} />}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-bold text-[#181725] truncate">{t.notes || (t.type === 'credit' ? 'Credit' : 'Debit')}</p>
                                                <p className="text-[11px] text-gray-400 font-medium">
                                                    {new Date(t.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </p>
                                            </div>
                                        </div>
                                        <span className={`text-[13px] font-bold shrink-0 ${t.type === 'credit' ? 'text-[#53B175]' : 'text-red-500'}`}>
                                            {t.type === 'credit' ? '+' : '−'}₹{Number(t.amount).toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
