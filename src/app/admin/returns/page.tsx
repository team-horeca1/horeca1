'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, CheckCircle, XCircle, RefreshCw, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ReturnRequest {
    id: string;
    status: string;
    reason: string;
    refundAmount: string | number | null;
    resolutionType?: string | null;
    adminNote: string | null;
    createdAt: string;
    order: { orderNumber: string; totalAmount: string | number; paymentStatus: string; paymentMethod: string | null };
    customer: { fullName: string; email: string; phone: string | null };
}

const STATUS_STYLE: Record<string, string> = {
    pending:  'bg-amber-50 text-amber-700',
    approved: 'bg-green-50 text-green-700',
    rejected: 'bg-red-50 text-red-700',
    refund_processing: 'bg-blue-50 text-blue-700',
    refunded: 'bg-blue-50 text-blue-700',
    resolved: 'bg-indigo-50 text-indigo-700',
};

function fmt(v: string | number | null): string {
    if (v == null) return '—';
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return isNaN(n) ? '—' : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
}

export default function AdminReturnsPage() {
    const [returns, setReturns] = useState<ReturnRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [actionForm, setActionForm] = useState({ status: '', adminNote: '', refundAmount: '' });
    const [saving, setSaving] = useState(false);

    const fetchReturns = useCallback(async () => {
        setLoading(true);
        try {
            const url = `/api/v1/admin/returns?limit=100${statusFilter ? `&status=${statusFilter}` : ''}`;
            const res = await fetch(url);
            const json = await res.json();
            if (json.success) setReturns(json.data.returns);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [statusFilter]);

    useEffect(() => { fetchReturns(); }, [fetchReturns]);

    const selected = returns.find(r => r.id === selectedId) ?? null;

    const filtered = returns.filter(r =>
        r.customer.fullName.toLowerCase().includes(search.toLowerCase()) ||
        r.order.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.customer.email.toLowerCase().includes(search.toLowerCase())
    );

    const inputCls = 'w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] outline-none focus:border-[#299E60]/40';

    return (
        <div className="space-y-6 pb-10">
            <div>
                <h1 className="text-[28px] font-bold text-[#181725]">Return Requests</h1>
                <p className="text-[13px] text-[#7C7C7C] mt-1">Review and process customer return requests</p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by customer or order..."
                        className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] pl-9 pr-3 text-[13px] outline-none focus:border-[#299E60]/40"
                    />
                </div>
                <div className="relative">
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 pr-8 text-[13px] outline-none focus:border-[#299E60]/40 bg-white appearance-none"
                    >
                        <option value="">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="refund_processing">Refund processing</option>
                        <option value="resolved">Resolved</option>
                        <option value="rejected">Rejected</option>
                        <option value="refunded">Refunded</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#AEAEAE] pointer-events-none" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
                {/* List */}
                <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[#299E60]" /></div>
                    ) : filtered.length === 0 ? (
                        <div className="py-16 text-center text-[14px] text-[#AEAEAE]">No return requests found</div>
                    ) : (
                        <div className="divide-y divide-[#F5F5F5]">
                            {filtered.map(r => (
                                <button
                                    key={r.id}
                                    onClick={() => { setSelectedId(r.id); setActionForm({ status: r.status, adminNote: r.adminNote ?? '', refundAmount: r.refundAmount ? String(r.refundAmount) : '' }); }}
                                    className={cn('w-full text-left px-5 py-4 hover:bg-[#F9F9F9] transition-colors', selectedId === r.id && 'bg-[#F1FBF4]')}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="text-[13px] font-bold text-[#181725]">{r.customer.fullName}</p>
                                                <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-[5px]', STATUS_STYLE[r.status] ?? 'bg-gray-50 text-gray-600')}>
                                                    {r.status}
                                                </span>
                                            </div>
                                            <p className="text-[12px] text-[#7C7C7C]">Order #{r.order.orderNumber} · {fmt(r.order.totalAmount)}</p>
                                            <p className="text-[12px] text-[#AEAEAE] mt-0.5 line-clamp-1">{r.reason}</p>
                                        </div>
                                        <p className="text-[11px] text-[#AEAEAE] shrink-0">
                                            {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Detail + action panel */}
                {selected ? (
                    <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5 space-y-4 self-start">
                        <div>
                            <p className="text-[16px] font-bold text-[#181725]">{selected.customer.fullName}</p>
                            <p className="text-[12px] text-[#7C7C7C]">{selected.customer.email}</p>
                            {selected.customer.phone && <p className="text-[12px] text-[#7C7C7C]">{selected.customer.phone}</p>}
                        </div>

                        <div className="bg-[#F9F9F9] rounded-[10px] p-3 space-y-1">
                            <p className="text-[12px] font-bold text-[#181725]">Order #{selected.order.orderNumber}</p>
                            <p className="text-[12px] text-[#7C7C7C]">Total: {fmt(selected.order.totalAmount)}</p>
                            <p className="text-[12px] text-[#7C7C7C]">Payment: {selected.order.paymentMethod ?? '—'} · {selected.order.paymentStatus}</p>
                            {selected.status === 'approved' && (selected.resolutionType ?? 'refund') === 'refund' && (
                                <p className="text-[12px] font-bold text-[#299E60] mt-1">
                                    Amount due to customer: {fmt(selected.refundAmount ?? selected.order.totalAmount)}
                                </p>
                            )}
                            {selected.resolutionType && selected.resolutionType !== 'refund' && (
                                <p className="text-[12px] font-bold text-indigo-700 mt-1">
                                    Resolution: {selected.resolutionType.replace('_', ' ')}
                                </p>
                            )}
                        </div>

                        <div>
                            <p className="text-[12px] font-bold text-[#181725] mb-1">Customer reason</p>
                            <p className="text-[13px] text-[#4C4F4D] leading-relaxed">{selected.reason}</p>
                        </div>

                        <div className="space-y-3 border-t border-[#F5F5F5] pt-4">
                            {selected.status === 'pending' && (
                                <p className="text-[12px] text-amber-700 bg-amber-50 rounded-[8px] px-3 py-2">
                                    Waiting for vendor approval before you can process a refund.
                                </p>
                            )}
                            {selected.status === 'approved' && (selected.resolutionType ?? 'refund') === 'refund' && (
                                <>
                                    <div>
                                        <label className="block text-[12px] font-bold text-[#181725] mb-1">Refund amount (₹)</label>
                                        <input type="number" value={actionForm.refundAmount}
                                            onChange={e => setActionForm(f => ({ ...f, refundAmount: e.target.value }))}
                                            placeholder={String(selected.order.totalAmount)}
                                            className={inputCls} />
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-bold text-[#181725] mb-1">Admin note</label>
                                        <textarea value={actionForm.adminNote}
                                            onChange={e => setActionForm(f => ({ ...f, adminNote: e.target.value }))}
                                            rows={3} placeholder="Internal note for this refund"
                                            className="w-full border border-[#EEEEEE] rounded-[10px] px-3 py-2 text-[13px] outline-none focus:border-[#299E60]/40 resize-none" />
                                    </div>
                                </>
                            )}
                            {(selected.status === 'refunded' || selected.status === 'rejected' || selected.status === 'refund_processing' || selected.status === 'resolved') && (
                                <p className="text-[12px] text-[#7C7C7C]">This return is closed — no further action needed.</p>
                            )}
                            <div className="flex gap-2">
                                {selected.status === 'approved' && (selected.resolutionType ?? 'refund') === 'refund' && (
                                    <button
                                        onClick={async () => {
                                            setActionForm(f => ({ ...f, status: 'refunded' }));
                                            setSaving(true);
                                            try {
                                                const res = await fetch(`/api/v1/admin/returns/${selectedId}`, {
                                                    method: 'PATCH',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        status: 'refunded',
                                                        adminNote: actionForm.adminNote || undefined,
                                                        refundAmount: actionForm.refundAmount ? parseFloat(actionForm.refundAmount) : undefined,
                                                    }),
                                                });
                                                const json = await res.json();
                                                if (!json.success) throw new Error(json.error?.message || 'Failed');
                                                toast.success('Refund processed');
                                                setSelectedId(null);
                                                await fetchReturns();
                                            } catch (err) {
                                                toast.error(err instanceof Error ? err.message : 'Failed to update');
                                            } finally {
                                                setSaving(false);
                                            }
                                        }}
                                        disabled={saving}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#299E60] text-white text-[13px] font-bold rounded-[10px] disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                        Process refund
                                    </button>
                                )}
                                <button onClick={() => setSelectedId(null)}
                                    className="px-4 py-2.5 border border-[#EEEEEE] text-[13px] font-bold rounded-[10px] text-[#7C7C7C] hover:bg-[#F9F9F9]">
                                    <XCircle size={14} />
                                </button>
                                <button onClick={fetchReturns} title="Refresh"
                                    className="px-3 py-2.5 border border-[#EEEEEE] rounded-[10px] hover:bg-[#F9F9F9]">
                                    <RefreshCw size={14} className="text-[#AEAEAE]" />
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-8 text-center self-start">
                        <p className="text-[14px] text-[#AEAEAE]">Select a return request to review</p>
                    </div>
                )}
            </div>
        </div>
    );
}
