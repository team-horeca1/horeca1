'use client';

import React, { useState } from 'react';
import { Copy, Check, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface UserHit {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    businessName: string | null;
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] font-medium focus:outline-none focus:border-[#53B175]';
const labelCls = 'block text-[11px] font-bold text-gray-500 mb-1';

const num = (v: string): number | undefined => {
    if (v.trim() === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};

export function PayoutInviteModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<UserHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState<UserHit | null>(null);
    const [amount, setAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [expiresInDays, setExpiresInDays] = useState('7');
    const [saving, setSaving] = useState(false);
    const [claimUrl, setClaimUrl] = useState<string | null>(null);
    const [trackingKey, setTrackingKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const search = async () => {
        if (!query.trim()) return;
        setSearching(true);
        try {
            const res = await fetch(`/api/v1/admin/users?search=${encodeURIComponent(query.trim())}&limit=8`);
            const json = await res.json();
            const users = (json?.data?.users ?? json?.data ?? []) as UserHit[];
            setHits(Array.isArray(users) ? users : []);
        } catch {
            setHits([]);
        } finally {
            setSearching(false);
        }
    };

    const submit = async () => {
        if (!num(amount)) {
            toast.error('Enter an amount');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/v1/admin/promotions/payout-invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: num(amount),
                    notes: notes.trim() || null,
                    userId: selected?.id ?? null,
                    expiresInDays: num(expiresInDays) ?? 7,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error?.message || 'Could not create payout link');
            const path = typeof json?.data?.claimUrl === 'string' ? json.data.claimUrl : `/payout/${json?.data?.token ?? ''}`;
            const url = path.startsWith('http') ? path : `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
            setClaimUrl(url);
            setTrackingKey(typeof json?.data?.trackingKey === 'string' ? json.data.trackingKey : null);
            onSaved();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not create payout link');
        } finally {
            setSaving(false);
        }
    };

    const copy = async () => {
        if (!claimUrl) return;
        try {
            await navigator.clipboard.writeText(claimUrl);
            setCopied(true);
            toast.success('Link copied');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Could not copy — select the URL instead');
        }
    };

    return (
        <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-[16px] font-bold text-[#181725]">{claimUrl ? 'Payout link ready' : 'Create UPI payout link'}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X size={18} /></button>
                </div>

                {claimUrl ? (
                    <div>
                        <p className="text-[12px] text-gray-500 font-medium mb-3">
                            Share this link. The recipient enters name + UPI ID only — the amount is locked on the invite.
                        </p>
                        <div className="flex gap-2">
                            <input className={cn(inputCls, 'font-mono text-[12px]')} readOnly value={claimUrl} />
                            <button onClick={copy} className="shrink-0 px-3 rounded-lg bg-[#181725] text-white cursor-pointer">
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                        </div>
                        {trackingKey && (
                            <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tracking ID</p>
                                    <p className="font-mono text-[13px] font-bold text-[#181725]">{trackingKey}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        try {
                                            await navigator.clipboard.writeText(trackingKey);
                                            toast.success('Tracking ID copied');
                                        } catch {
                                            toast.error('Could not copy');
                                        }
                                    }}
                                    className="shrink-0 px-3 py-1.5 rounded-lg border border-gray-200 text-[11px] font-bold text-[#181725] hover:bg-white cursor-pointer"
                                >
                                    Copy
                                </button>
                            </div>
                        )}
                        <p className="mt-3 text-[11px] text-gray-400">After they claim, the entry appears in this payouts table — Mark Paid + UTR as usual.</p>
                        <button onClick={onClose} className="mt-5 w-full py-2.5 rounded-xl bg-[#53B175] text-white text-[13px] font-bold hover:bg-[#48a068] cursor-pointer">
                            Done
                        </button>
                    </div>
                ) : (
                    <>
                        {selected ? (
                            <div className="flex items-center justify-between bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 mb-4">
                                <div className="min-w-0">
                                    <p className="text-[13px] font-bold text-[#181725] truncate">{selected.fullName || selected.businessName || '—'}</p>
                                    <p className="text-[11px] text-gray-500 truncate">{selected.phone || selected.email}</p>
                                </div>
                                <button onClick={() => setSelected(null)} className="text-[11px] font-bold text-red-500 hover:underline shrink-0 ml-3 cursor-pointer">Clear</button>
                            </div>
                        ) : (
                            <div className="mb-4">
                                <label className={labelCls}>Optional — attach to a user</label>
                                <div className="flex gap-2">
                                    <input className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} placeholder="Leave empty for an open link" />
                                    <button onClick={search} disabled={searching} className="shrink-0 px-3 rounded-lg bg-[#181725] text-white cursor-pointer disabled:opacity-50">
                                        {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                                    </button>
                                </div>
                                {hits.length > 0 && (
                                    <ul className="mt-2 border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-[200px] overflow-y-auto">
                                        {hits.map((u) => (
                                            <li key={u.id}>
                                                <button onClick={() => { setSelected(u); setHits([]); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer">
                                                    <p className="text-[12px] font-bold text-[#181725]">{u.fullName || u.businessName || '—'}</p>
                                                    <p className="text-[10px] text-gray-400">{u.phone || u.email}</p>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Amount (₹) *</label>
                                <input className={inputCls} type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
                            </div>
                            <div>
                                <label className={labelCls}>Expires in (days)</label>
                                <input className={inputCls} type="number" min="1" max="90" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} />
                            </div>
                            <div className="col-span-2">
                                <label className={labelCls}>Notes (internal)</label>
                                <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. influencer payout — August" />
                            </div>
                        </div>
                        <p className="mt-3 text-[11px] text-gray-400 font-medium">
                            Public claim page asks for name + UPI ID only. Amount is taken from this invite, not the form.
                        </p>
                        <button
                            onClick={submit}
                            disabled={saving}
                            className="mt-5 w-full py-2.5 rounded-xl bg-[#53B175] text-white text-[13px] font-bold hover:bg-[#48a068] disabled:opacity-50 transition-colors cursor-pointer"
                        >
                            {saving ? <Loader2 size={15} className="animate-spin mx-auto" /> : 'Create payout link'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
