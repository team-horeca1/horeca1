'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, RotateCcw, CheckCircle2, XCircle, Clock, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
    StatusTimeline,
    returnTimelineCurrentKey,
    returnTimelineStepsForStatus,
} from '@/components/features/finance/StatusTimeline';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReturnRequest {
    id: string;
    status: 'pending' | 'approved' | 'rejected' | 'refund_processing' | 'refunded' | 'resolved';
    reason: string;
    adminNote: string | null;
    refundAmount: string | null;
    resolutionType: 'refund' | 'credit_note' | 'replacement' | null;
    creditNoteNumber: string | null;
    creditNoteAmount: string | null;
    createdAt: string;
    order: { id: string; orderNumber: string; totalAmount: string };
    customer: { id: string; fullName: string; email: string; businessName?: string | null };
}

// ─── Review Modal ─────────────────────────────────────────────────────────────

function ReviewModal({
    request,
    onClose,
    onDone,
}: {
    request: ReturnRequest;
    onClose: () => void;
    onDone: (updated: ReturnRequest) => void;
}) {
    const [note, setNote] = useState('');
    const [refundAmount, setRefundAmount] = useState(String(Number(request.order.totalAmount)));
    const [creditNoteAmount, setCreditNoteAmount] = useState(String(Number(request.order.totalAmount)));
    const [replacementNotes, setReplacementNotes] = useState('');
    const [resolutionType, setResolutionType] = useState<'refund' | 'credit_note' | 'replacement'>('refund');
    const [action, setAction] = useState<'approved' | 'rejected' | null>(null);
    const [saving, setSaving] = useState(false);

    const noteTrimmed = note.trim();
    const canReject = noteTrimmed.length >= 10;

    const handleSubmit = async () => {
        if (!action) return;
        if (action === 'rejected' && !canReject) {
            toast.error('Add a note to the customer (at least 10 characters) before rejecting.');
            return;
        }
        setSaving(true);
        try {
            let adminNote = noteTrimmed || undefined;
            if (action === 'approved' && resolutionType === 'replacement' && replacementNotes.trim()) {
                adminNote = noteTrimmed
                    ? `${noteTrimmed}\n\nReplacement: ${replacementNotes.trim()}`
                    : `Replacement: ${replacementNotes.trim()}`;
            }
            const body: Record<string, unknown> = { status: action, adminNote };
            if (action === 'approved') {
                body.resolutionType = resolutionType;
                if (resolutionType === 'refund') {
                    body.refundAmount = parseFloat(refundAmount) || 0;
                } else if (resolutionType === 'credit_note') {
                    body.creditNoteAmount = parseFloat(creditNoteAmount) || 0;
                }
            }
            const res = await fetch(`/api/v1/vendor/returns/${request.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Failed');
            const updated = json.data as ReturnRequest;
            toast.success(
                updated.status === 'resolved'
                    ? `Return resolved (${resolutionType === 'credit_note' ? 'credit note' : 'replacement'})`
                    : `Return ${updated.status}`,
            );
            onDone({
                ...request,
                ...updated,
                status: updated.status,
                adminNote: updated.adminNote ?? adminNote ?? null,
                resolutionType: updated.resolutionType ?? (action === 'approved' ? resolutionType : request.resolutionType),
                refundAmount: updated.refundAmount != null ? String(updated.refundAmount) : request.refundAmount,
                creditNoteNumber: updated.creditNoteNumber ?? request.creditNoteNumber,
                creditNoteAmount: updated.creditNoteAmount != null ? String(updated.creditNoteAmount) : request.creditNoteAmount,
            });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-[480px]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#F5F5F5]">
                    <div>
                        <p className="text-[15px] font-bold text-[#181725]">Review Return — {request.order.orderNumber}</p>
                        <p className="text-[12px] text-[#AEAEAE]">{request.customer.fullName}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-[8px] hover:bg-[#F5F5F5]"><X size={15} className="text-[#7C7C7C]" /></button>
                </div>
                <div className="p-6 space-y-4">
                    {/* Customer reason */}
                    <div className="bg-[#FAFAFA] rounded-[10px] p-4">
                        <p className="text-[10px] font-bold text-[#AEAEAE] uppercase tracking-wide mb-1.5">Customer Reason</p>
                        <p className="text-[13px] text-[#181725]">{request.reason}</p>
                    </div>

                    {/* Action picker */}
                    <div>
                        <p className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide mb-2">Decision</p>
                        <div className="flex gap-2">
                            <button onClick={() => setAction('approved')}
                                className={cn('flex-1 h-[40px] rounded-[10px] text-[13px] font-bold border transition-all flex items-center justify-center gap-2',
                                    action === 'approved' ? 'bg-[#299E60] text-white border-[#299E60]' : 'bg-white text-[#7C7C7C] border-[#EEEEEE] hover:bg-[#EEF8F1]'
                                )}>
                                <CheckCircle2 size={14} /> Approve
                            </button>
                            <button onClick={() => setAction('rejected')}
                                className={cn('flex-1 h-[40px] rounded-[10px] text-[13px] font-bold border transition-all flex items-center justify-center gap-2',
                                    action === 'rejected' ? 'bg-[#E74C3C] text-white border-[#E74C3C]' : 'bg-white text-[#7C7C7C] border-[#EEEEEE] hover:bg-red-50'
                                )}>
                                <XCircle size={14} /> Reject
                            </button>
                        </div>
                    </div>

                    {/* Resolution type + conditional inputs — only when approving */}
                    {action === 'approved' && (
                        <>
                            {/* Resolution type selector */}
                            <div>
                                <p className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide mb-2">Resolution Type</p>
                                <div className="flex gap-2">
                                    {(['refund', 'credit_note', 'replacement'] as const).map(type => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => setResolutionType(type)}
                                            className={cn(
                                                'flex-1 h-[36px] rounded-[10px] text-[12px] font-bold border transition-all',
                                                resolutionType === type
                                                    ? 'bg-[#299E60] text-white border-[#299E60]'
                                                    : 'bg-white text-[#7C7C7C] border-[#EEEEEE] hover:bg-[#EEF8F1]'
                                            )}
                                        >
                                            {type === 'refund' ? 'Refund' : type === 'credit_note' ? 'Credit Note' : 'Replacement'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Refund amount */}
                            {resolutionType === 'refund' && (
                                <div>
                                    <label className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">Refund Amount (₹)</label>
                                    <input
                                        type="number"
                                        value={refundAmount}
                                        onChange={e => setRefundAmount(e.target.value)}
                                        className="mt-1.5 w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] font-bold outline-none focus:border-[#299E60]/50"
                                    />
                                    <p className="text-[11px] text-[#AEAEAE] mt-1">Order total: ₹{Number(request.order.totalAmount).toLocaleString('en-IN')}</p>
                                </div>
                            )}

                            {/* Credit note amount */}
                            {resolutionType === 'credit_note' && (
                                <div>
                                    <label className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">Credit Note Amount (₹)</label>
                                    <input
                                        type="number"
                                        value={creditNoteAmount}
                                        onChange={e => setCreditNoteAmount(e.target.value)}
                                        className="mt-1.5 w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] font-bold outline-none focus:border-[#299E60]/50"
                                    />
                                    <p className="text-[11px] text-[#AEAEAE] mt-1">Pre-filled from order total: ₹{Number(request.order.totalAmount).toLocaleString('en-IN')}</p>
                                </div>
                            )}

                            {/* Replacement dispatch notes */}
                            {resolutionType === 'replacement' && (
                                <div>
                                    <label className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">Replacement Dispatch Notes</label>
                                    <textarea
                                        value={replacementNotes}
                                        onChange={e => setReplacementNotes(e.target.value)}
                                        rows={2}
                                        placeholder="e.g. Replacement to be dispatched within 2 days..."
                                        className="mt-1.5 w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[13px] outline-none focus:border-[#299E60]/50 resize-none"
                                    />
                                </div>
                            )}
                        </>
                    )}

                    {/* Note — required on reject */}
                    <div>
                        <label className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
                            Note to customer {action === 'rejected' ? '(required)' : '(optional)'}
                        </label>
                        <textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            rows={2}
                            placeholder={action === 'rejected' ? 'Explain why you are rejecting (at least 10 characters)...' : 'Explain your decision...'}
                            className="mt-1.5 w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[13px] outline-none focus:border-[#299E60]/50 resize-none"
                        />
                        {action === 'rejected' && !canReject && (
                            <p className="text-[11px] text-[#AEAEAE] mt-1">At least 10 characters required to reject.</p>
                        )}
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button onClick={onClose} className="flex-1 h-[42px] rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold text-[#7C7C7C] hover:bg-[#F5F5F5] transition-all">Cancel</button>
                        <button
                            onClick={handleSubmit}
                            disabled={!action || saving || (action === 'rejected' && !canReject)}
                            className={cn(
                                'flex-1 h-[42px] rounded-[10px] text-[13px] font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50',
                                action === 'rejected' ? 'bg-[#E74C3C] hover:bg-[#d44234] text-white' : 'bg-[#299E60] hover:bg-[#238a54] text-white'
                            )}
                        >
                            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                            {action === 'approved'
                                ? resolutionType === 'credit_note' ? 'Approve & Issue Credit Note'
                                : resolutionType === 'replacement' ? 'Approve & Dispatch Replacement'
                                : 'Approve & Set Refund'
                                : action === 'rejected' ? 'Reject Return' : 'Select Decision'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected' | 'refunded' | 'resolved';

const STATUS_STYLE: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-600',
    approved: 'bg-[#EEF8F1] text-[#299E60]',
    rejected: 'bg-[#FFF0F0] text-[#E74C3C]',
    refund_processing: 'bg-blue-50 text-blue-600',
    refunded: 'bg-[#EEF8F1] text-[#299E60]',
    resolved: 'bg-blue-50 text-blue-600',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
    pending: <Clock size={11} />,
    approved: <CheckCircle2 size={11} />,
    rejected: <XCircle size={11} />,
    refund_processing: <Loader2 size={11} />,
    refunded: <CheckCircle2 size={11} />,
    resolved: <CheckCircle2 size={11} />,
};

export default function VendorReturnsPage() {
    const [returns, setReturns] = useState<ReturnRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<FilterTab>('all');
    const [reviewing, setReviewing] = useState<ReturnRequest | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const fetchReturns = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/vendor/returns');
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Failed to load returns');
            setReturns(json.data);
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'Failed to load returns');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchReturns(); }, [fetchReturns]);

    const handleDone = (updated: ReturnRequest) => {
        setReturns(prev => prev.map(r => (r.id !== updated.id ? r : { ...r, ...updated })));
        setReviewing(null);
    };

    const TABS: { key: FilterTab; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'pending', label: 'Pending' },
        { key: 'approved', label: 'Approved' },
        { key: 'refunded', label: 'Refunded' },
        { key: 'resolved', label: 'Resolved' },
        { key: 'rejected', label: 'Rejected' },
    ];

    const pendingCount = returns.filter(r => r.status === 'pending').length;
    const filtered = activeTab === 'all'
        ? returns
        : activeTab === 'refunded'
            ? returns.filter(r => r.status === 'refunded' || r.status === 'refund_processing')
            : returns.filter(r => r.status === activeTab);

    return (
        <div className="space-y-5 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-[24px] font-bold text-[#181725]">Customer Returns</h1>
                    <p className="text-[12px] text-[#AEAEAE]">Review return requests — refunds are processed by HoReCa1 after your approval</p>
                </div>
                {pendingCount > 0 && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-[10px] px-4 py-2.5">
                        <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                        <span className="text-[13px] font-bold text-amber-700">{pendingCount} pending review</span>
                    </div>
                )}
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-2">
                {TABS.map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className={cn(
                            'h-[34px] px-4 rounded-[8px] text-[12px] font-bold transition-all',
                            activeTab === tab.key
                                ? 'bg-[#299E60] text-white shadow-sm'
                                : 'bg-white border border-[#EEEEEE] text-[#7C7C7C] hover:border-[#299E60]/30'
                        )}>
                        {tab.label}
                        {tab.key === 'pending' && pendingCount > 0 && (
                            <span className={cn('ml-1.5 text-[10px] font-[900] px-1.5 py-0.5 rounded-full',
                                activeTab === tab.key ? 'bg-white/20' : 'bg-amber-100 text-amber-600'
                            )}>{pendingCount}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="animate-spin text-[#299E60]" size={28} />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 text-center">
                        <RotateCcw size={36} className="text-[#E5E7EB] mx-auto mb-3" />
                        <p className="text-[14px] font-bold text-[#AEAEAE]">
                            {activeTab === 'all' ? 'No return requests yet' : `No ${activeTab} returns`}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE]">
                                    <th className="px-5 py-3 text-left text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Order</th>
                                    <th className="px-5 py-3 text-left text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Customer</th>
                                    <th className="px-5 py-3 text-left text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Reason</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Date</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Resolution</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Status</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F5F5F5]">
                                {filtered.map(req => (
                                    <React.Fragment key={req.id}>
                                    <tr className={cn('hover:bg-[#FAFAFA] transition-colors cursor-pointer', req.status === 'pending' && 'bg-amber-50/20')}
                                        onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}>
                                        <td className="px-5 py-4">
                                            <p className="text-[13px] font-bold text-[#181725]">{req.order.orderNumber}</p>
                                            <p className="text-[11px] text-[#AEAEAE]">₹{Number(req.order.totalAmount).toLocaleString('en-IN')}</p>
                                        </td>
                                        <td className="px-5 py-4">
                                            <p className="text-[13px] font-bold text-[#181725]">{req.customer.fullName}</p>
                                            {req.customer.businessName && (
                                                <p className="text-[11px] text-[#AEAEAE]">{req.customer.businessName}</p>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 max-w-[220px]">
                                            <p className="text-[12px] text-[#7C7C7C] line-clamp-2">{req.reason}</p>
                                            {req.adminNote && (
                                                <p className="text-[11px] text-[#AEAEAE] mt-0.5 italic">{req.adminNote}</p>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 text-center text-[12px] text-[#AEAEAE]">
                                            {new Date(req.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            {(req.status === 'approved' || req.status === 'resolved') && req.resolutionType ? (
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className={cn(
                                                        'text-[10px] font-bold px-2 py-0.5 rounded-[5px] uppercase tracking-wide',
                                                        req.resolutionType === 'refund' ? 'bg-[#EEF8F1] text-[#299E60]'
                                                        : req.resolutionType === 'credit_note' ? 'bg-blue-50 text-blue-600'
                                                        : 'bg-amber-50 text-amber-600'
                                                    )}>
                                                        {req.resolutionType === 'credit_note' ? 'Credit Note' : req.resolutionType === 'replacement' ? 'Replacement' : 'Refund'}
                                                    </span>
                                                    {req.resolutionType === 'refund' && req.refundAmount && (
                                                        <span className="text-[12px] font-bold text-[#181725]">₹{Number(req.refundAmount).toLocaleString('en-IN')}</span>
                                                    )}
                                                    {req.resolutionType === 'credit_note' && req.creditNoteNumber && (
                                                        <span className="text-[10px] text-[#AEAEAE] font-mono">{req.creditNoteNumber}</span>
                                                    )}
                                                    {req.resolutionType === 'credit_note' && req.creditNoteAmount && (
                                                        <span className="text-[12px] font-bold text-blue-600">₹{Number(req.creditNoteAmount).toLocaleString('en-IN')}</span>
                                                    )}
                                                </div>
                                            ) : req.refundAmount ? (
                                                <span className="text-[13px] font-bold text-[#181725]">₹{Number(req.refundAmount).toLocaleString('en-IN')}</span>
                                            ) : (
                                                <span className="text-[13px] text-[#AEAEAE]">—</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span className={cn('inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-[6px] capitalize', STATUS_STYLE[req.status])}>
                                                {STATUS_ICON[req.status]}
                                                {req.status}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            {req.status === 'pending' ? (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setReviewing(req); }}
                                                    className="h-[30px] px-3 rounded-[7px] bg-[#181725] text-white text-[11px] font-bold hover:bg-[#2d2d40] transition-all"
                                                >
                                                    Review
                                                </button>
                                            ) : (
                                                <span className="text-[12px] text-[#7C7C7C] font-bold">
                                                    {expandedId === req.id ? 'Hide' : 'Timeline'}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                    {expandedId === req.id && (
                                        <tr className="bg-[#FAFAFA]">
                                            <td colSpan={7} className="px-5 py-4">
                                                <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide mb-3">Return progress</p>
                                                <StatusTimeline
                                                    steps={returnTimelineStepsForStatus(req.status)}
                                                    currentKey={returnTimelineCurrentKey(req.status)}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {!loading && filtered.length > 0 && (
                    <div className="px-5 py-3 border-t border-[#F5F5F5]">
                        <p className="text-[12px] text-[#AEAEAE]">{filtered.length} request{filtered.length !== 1 ? 's' : ''}</p>
                    </div>
                )}
            </div>

            {reviewing && (
                <ReviewModal
                    request={reviewing}
                    onClose={() => setReviewing(null)}
                    onDone={handleDone}
                />
            )}
        </div>
    );
}
