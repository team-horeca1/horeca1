'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, Eye, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PayoutInviteModal } from '@/components/features/admin/promotions/PayoutInviteModal';
import { MarkPaidModal } from '@/components/features/admin/promotions/MarkPaidModal';

export type PayoutInviteRow = {
    id: string;
    trackingKey: string | null;
    referenceNumber: string | null;
    amount: number;
    notes: string | null;
    claimUrl: string;
    claimedName: string | null;
    claimedBusinessName: string | null;
    claimedUpiId: string | null;
    claimedAt: string | null;
    createdAt: string;
    status: 'awaiting_claim' | 'approved' | 'paid' | 'cancelled' | 'expired';
    entryId: string | null;
    paidReference: string | null;
};

const thCls = 'px-2.5 py-2 text-left text-[10px] uppercase tracking-wider font-bold text-gray-400 whitespace-nowrap';
const tdCls = 'px-2.5 py-2 text-[12px] font-medium text-gray-700 align-middle';
const inr = (v: number) => `₹${Number(v).toLocaleString('en-IN')}`;
const fmtDate = (v: string | null) =>
    v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';

function statusLabel(status: PayoutInviteRow['status']) {
    if (status === 'awaiting_claim') return 'To claim';
    if (status === 'approved') return 'To pay';
    if (status === 'paid') return 'Paid';
    if (status === 'cancelled') return 'Cancelled';
    return 'Expired';
}

function rowMatches(row: PayoutInviteRow, q: string): boolean {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return [
        row.referenceNumber,
        row.notes,
        row.claimedName,
        row.claimedBusinessName,
        row.claimedUpiId,
        row.trackingKey,
        row.claimUrl,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
}

export function CashbackUpiPanel({
    listUrl,
    createUrl,
    detailHref,
    markPaidUrl,
}: {
    listUrl: string;
    createUrl: string;
    detailHref: (trackingKey: string) => string;
    markPaidUrl: (row: PayoutInviteRow) => string | null;
}) {
    const [rows, setRows] = useState<PayoutInviteRow[]>([]);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [payTarget, setPayTarget] = useState<PayoutInviteRow | null>(null);
    const [paying, setPaying] = useState(false);

    const load = useCallback(async (status: string, q: string) => {
        setRefreshing(true);
        try {
            const params = new URLSearchParams();
            if (!q && status) params.set('status', status);
            if (q) params.set('search', q);
            const qs = params.toString() ? `?${params.toString()}` : '';
            const res = await fetch(`${listUrl}${qs}`);
            const json = await res.json();
            if (json?.success) setRows(json.data?.invites ?? []);
            else toast.error(json?.error?.message || 'Failed to load payouts');
        } catch {
            toast.error('Failed to load payouts');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [listUrl]);

    useEffect(() => {
        const t = window.setTimeout(() => {
            Promise.resolve().then(() => setQuery(search.trim()));
        }, 300);
        return () => window.clearTimeout(t);
    }, [search]);

    useEffect(() => {
        void load(statusFilter, query);
    }, [statusFilter, query, load]);

    const visible = useMemo(() => {
        const q = search.trim();
        if (!q || q === query) return rows;
        return rows.filter((r) => rowMatches(r, q));
    }, [rows, search, query]);

    const copyLink = async (url: string) => {
        const absolute = url.startsWith('http') ? url : `${window.location.origin}${url}`;
        try {
            await navigator.clipboard.writeText(absolute);
            toast.success('Link copied');
        } catch {
            toast.error('Could not copy');
        }
    };

    const confirmMarkPaid = async (ref: string) => {
        if (!payTarget) return;
        const url = markPaidUrl(payTarget);
        if (!url) return;
        setPaying(true);
        try {
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paidReference: ref }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error?.message || 'Failed to mark paid');
            toast.success('Marked as paid');
            setPayTarget(null);
            void load(statusFilter, query);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to mark paid');
        } finally {
            setPaying(false);
        }
    };

    return (
        <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {['awaiting_claim', 'approved', 'paid', 'cancelled', ''].map((s) => (
                        <button
                            key={s || 'all'}
                            onClick={() => {
                                setSearch('');
                                Promise.resolve().then(() => setQuery(''));
                                setStatusFilter(s);
                            }}
                            className={cn(
                                'px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer',
                                !search.trim() && statusFilter === s ? 'bg-[#181725] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                            )}
                        >
                            {s === '' ? 'All' : s === 'awaiting_claim' ? 'To claim' : s === 'approved' ? 'To pay' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
                <div className="relative w-[min(100%,220px)] ml-auto">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') Promise.resolve().then(() => setQuery(search.trim()));
                        }}
                        placeholder="Search ref, name, UPI…"
                        aria-label="Search payouts"
                        className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium focus:outline-none focus:border-[#53B175]"
                    />
                    {refreshing ? (
                        <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#53B175] animate-spin" />
                    ) : search ? (
                        <button
                            type="button"
                            onClick={() => {
                                setSearch('');
                                Promise.resolve().then(() => setQuery(''));
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                            aria-label="Clear search"
                        >
                            <X size={13} />
                        </button>
                    ) : null}
                </div>
                <button
                    onClick={() => setInviteOpen(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#53B175] text-white text-[11px] font-bold hover:bg-[#48a068] transition-colors cursor-pointer"
                >
                    + Create link
                </button>
            </div>
            {search.trim() ? (
                <p className="text-[11px] text-gray-400 font-medium mb-2">Searching all statuses for “{search.trim()}”</p>
            ) : null}

            <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50/80 border-b border-gray-100">
                        <tr>
                            <th className={thCls}>Reference</th>
                            <th className={thCls}>Amount</th>
                            <th className={cn(thCls, 'w-[1%] max-w-[10rem]')}>Message</th>
                            <th className={cn(thCls, 'w-[1%]')}>Link</th>
                            <th className={thCls}>Name / business</th>
                            <th className={thCls}>UPI ID</th>
                            <th className={thCls}>Filled</th>
                            <th className={thCls}>Created</th>
                            <th className={thCls}>Status</th>
                            <th className={cn(thCls, 'w-[1%] sticky right-0 bg-gray-50 z-[1] text-right pr-3 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.08)]')}>Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {(refreshing || loading) && visible.length === 0 && (
                            <tr><td colSpan={10} className="px-3 py-14 text-center"><Loader2 size={24} className="text-[#53B175] animate-spin mx-auto" /></td></tr>
                        )}
                        {!refreshing && !loading && visible.length === 0 && (
                            <tr>
                                <td colSpan={10} className="px-3 py-8 text-center text-[13px] text-gray-400">
                                    {search.trim() && search.trim() !== query
                                        ? 'Searching…'
                                        : search.trim()
                                            ? 'No payouts match that search.'
                                            : 'Nothing here for this filter.'}
                                </td>
                            </tr>
                        )}
                        {visible.map((e) => (
                            <tr key={e.id} className="group hover:bg-gray-50/60">
                                <td className={cn(tdCls, 'font-mono font-bold text-[#181725] truncate')} title={e.referenceNumber ?? undefined}>
                                    {e.referenceNumber || '—'}
                                </td>
                                <td className={cn(tdCls, 'font-bold text-[#181725] tabular-nums')}>{inr(e.amount)}</td>
                                <td className={cn(tdCls, 'max-w-[10rem]')}>
                                    {e.notes ? <span className="block max-w-[10rem] truncate" title={e.notes}>{e.notes}</span> : <span className="text-gray-300">—</span>}
                                </td>
                                <td className={cn(tdCls, 'px-1.5')}>
                                    <button
                                        type="button"
                                        onClick={() => void copyLink(e.claimUrl)}
                                        className="inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] font-bold text-[#181725] hover:border-[#53B175] hover:text-[#53B175] cursor-pointer"
                                        title={e.claimUrl}
                                    >
                                        <Copy size={11} /> Copy
                                    </button>
                                </td>
                                <td className={tdCls}>
                                    {e.claimedName || e.claimedBusinessName ? (
                                        <div className="min-w-0">
                                            <p className="font-bold text-[#181725] truncate leading-tight">{e.claimedName || '—'}</p>
                                            <p className="text-[10px] text-gray-400 truncate leading-tight">{e.claimedBusinessName || '—'}</p>
                                        </div>
                                    ) : <span className="text-gray-300">—</span>}
                                </td>
                                <td className={cn(tdCls, 'truncate')} title={e.claimedUpiId ?? undefined}>
                                    {e.claimedUpiId ?? <span className="text-gray-300">—</span>}
                                </td>
                                <td className={cn(tdCls, 'text-gray-500')}>{fmtDate(e.claimedAt)}</td>
                                <td className={cn(tdCls, 'text-gray-500')}>{fmtDate(e.createdAt)}</td>
                                <td className={tdCls}>
                                    <span className={cn(
                                        'inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                                        e.status === 'paid' ? 'bg-green-50 text-[#53B175]'
                                            : e.status === 'cancelled' || e.status === 'expired' ? 'bg-gray-100 text-gray-400'
                                                : e.status === 'approved' ? 'bg-blue-50 text-blue-600'
                                                    : 'bg-purple-50 text-purple-600',
                                    )}>
                                        {statusLabel(e.status)}
                                    </span>
                                </td>
                                <td className={cn(tdCls, 'sticky right-0 bg-white group-hover:bg-gray-50 text-right pr-3 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.08)]')}>
                                    <div className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
                                        {e.trackingKey && (
                                            <Link
                                                href={detailHref(e.trackingKey)}
                                                className="inline-flex shrink-0 items-center gap-1 px-2 py-1 rounded-md border border-gray-200 text-[11px] font-bold text-[#181725] hover:bg-gray-50"
                                            >
                                                <Eye size={12} /> View
                                            </Link>
                                        )}
                                        {e.status === 'approved' && e.entryId && markPaidUrl(e) && (
                                            <button
                                                onClick={() => setPayTarget(e)}
                                                className="shrink-0 whitespace-nowrap px-2.5 py-1 rounded-md bg-[#53B175] text-white text-[11px] font-bold hover:bg-[#48a068] cursor-pointer"
                                            >
                                                Mark Paid
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {inviteOpen && (
                <PayoutInviteModal
                    createUrl={createUrl}
                    onClose={() => setInviteOpen(false)}
                    onSaved={() => void load(statusFilter, query)}
                />
            )}
            {payTarget && (
                <MarkPaidModal
                    amountLabel={inr(payTarget.amount)}
                    upiId={payTarget.claimedUpiId}
                    trackingKey={payTarget.trackingKey}
                    submitting={paying}
                    onClose={() => {
                        if (!paying) setPayTarget(null);
                    }}
                    onConfirm={(ref) => void confirmMarkPaid(ref)}
                />
            )}
        </>
    );
}
