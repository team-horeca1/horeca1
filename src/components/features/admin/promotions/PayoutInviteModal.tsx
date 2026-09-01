'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] font-medium focus:outline-none focus:border-[#53B175]';
const labelCls = 'block text-[11px] font-bold text-gray-500 mb-1';

const num = (v: string): number | undefined => {
    if (v.trim() === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};

interface UserHit {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    businessName: string | null;
    hcidDisplay?: string | null;
}

function userLabel(u: UserHit): string {
    return u.fullName || u.businessName || u.email || u.phone || '—';
}

function userSub(u: UserHit): string {
    return [u.phone, u.email, u.hcidDisplay].filter(Boolean).join(' · ');
}

export function PayoutInviteModal({
    createUrl,
    onClose,
    onSaved,
    enableCustomerSearch = false,
}: {
    createUrl: string;
    onClose: () => void;
    onSaved: () => void;
    enableCustomerSearch?: boolean;
}) {
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<UserHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<UserHit | null>(null);
    const [referenceNumber, setReferenceNumber] = useState('');
    const [amount, setAmount] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [claimUrl, setClaimUrl] = useState<string | null>(null);
    const [trackingKey, setTrackingKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!enableCustomerSearch || selected) return;
        const q = query.trim();
        if (q.length < 1) {
            setHits([]);
            setSearching(false);
            return;
        }
        let cancelled = false;
        setSearching(true);
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/v1/admin/users?search=${encodeURIComponent(q)}&limit=8`);
                const json = await res.json();
                const users = (json?.data?.users ?? json?.data ?? []) as UserHit[];
                if (!cancelled) {
                    setHits(Array.isArray(users) ? users : []);
                    setOpen(true);
                }
            } catch {
                if (!cancelled) setHits([]);
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [query, enableCustomerSearch, selected]);

    useEffect(() => {
        const close = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const submit = async () => {
        if (!num(amount)) {
            toast.error('Enter an amount');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(createUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: num(amount),
                    notes: message.trim() || null,
                    referenceNumber: referenceNumber.trim() || null,
                    userId: selected?.id ?? null,
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
                            Share this link. The recipient enters first name, business name, and UPI ID — the amount is locked.
                        </p>
                        <div className="flex gap-2">
                            <input className={cn(inputCls, 'font-mono text-[12px]')} readOnly value={claimUrl} />
                            <button onClick={copy} className="shrink-0 px-3 rounded-lg bg-[#181725] text-white cursor-pointer">
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                        </div>
                        {trackingKey && (
                            <div className="mt-3 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tracking ID</p>
                                <p className="font-mono text-[13px] font-bold text-[#181725]">{trackingKey}</p>
                            </div>
                        )}
                        <button onClick={onClose} className="mt-5 w-full py-2.5 rounded-xl bg-[#53B175] text-white text-[13px] font-bold hover:bg-[#48a068] cursor-pointer">
                            Done
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="space-y-3">
                            {enableCustomerSearch && (
                                selected ? (
                                    <div className="flex items-center justify-between bg-green-50 border border-green-100 rounded-xl px-3 py-2.5">
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-bold text-[#181725] truncate">{userLabel(selected)}</p>
                                            <p className="text-[11px] text-gray-500 truncate">{userSub(selected)}</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setSelected(null);
                                                setQuery('');
                                                setHits([]);
                                            }}
                                            className="text-[11px] font-bold text-red-500 hover:underline shrink-0 ml-3 cursor-pointer"
                                        >
                                            Change
                                        </button>
                                    </div>
                                ) : (
                                    <div ref={boxRef} className="relative">
                                        <label className={labelCls}>Customer</label>
                                        <div className="relative">
                                            <input
                                                className={cn(inputCls, searching && 'pr-9')}
                                                value={query}
                                                onChange={(e) => {
                                                    setQuery(e.target.value);
                                                    setOpen(true);
                                                }}
                                                onFocus={() => {
                                                    if (query.trim() || hits.length > 0) setOpen(true);
                                                }}
                                                placeholder="Name / phone / email / HCID"
                                                autoComplete="off"
                                            />
                                            {searching && (
                                                <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
                                            )}
                                        </div>
                                        {open && query.trim().length > 0 && (
                                            <ul className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-[220px] overflow-y-auto divide-y divide-gray-50">
                                                {searching && hits.length === 0 ? (
                                                    <li className="px-3 py-2.5 text-[12px] text-gray-400 flex items-center gap-2">
                                                        <Loader2 size={13} className="animate-spin" /> Searching…
                                                    </li>
                                                ) : hits.length > 0 ? (
                                                    hits.map((u) => (
                                                        <li key={u.id}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelected(u);
                                                                    setHits([]);
                                                                    setQuery('');
                                                                    setOpen(false);
                                                                }}
                                                                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
                                                            >
                                                                <p className="text-[12px] font-bold text-[#181725]">{userLabel(u)}</p>
                                                                <p className="text-[10px] text-gray-400 truncate">{userSub(u) || '—'}</p>
                                                            </button>
                                                        </li>
                                                    ))
                                                ) : (
                                                    <li className="px-3 py-2.5 text-[12px] text-gray-400">No matches found</li>
                                                )}
                                            </ul>
                                        )}
                                    </div>
                                )
                            )}
                            <div>
                                <label className={labelCls}>Reference number</label>
                                <input className={inputCls} value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Your own ref" />
                            </div>
                            <div>
                                <label className={labelCls}>Amount (₹) *</label>
                                <input className={inputCls} type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
                            </div>
                            <div>
                                <label className={labelCls}>Message</label>
                                <textarea
                                    className={cn(inputCls, 'min-h-[88px] resize-y')}
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    maxLength={500}
                                    placeholder="Shown on the claim page"
                                />
                            </div>
                        </div>
                        <p className="mt-3 text-[11px] text-gray-400 font-medium">
                            This link does not expire. Amount is taken from this invite, not the form.
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
