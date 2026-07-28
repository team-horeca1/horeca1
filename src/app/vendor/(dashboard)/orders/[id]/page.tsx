'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import {
    ChevronLeft, User, Package, MapPin, Loader2, AlertCircle, Clock,
    CheckCircle2, XCircle, Printer, ChevronRight, AlertTriangle,
    Truck, ClipboardList, Minus, Plus, Info, ShoppingBag, Landmark,
    Calendar, FileText, FileDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FileClaimModal } from '@/components/features/vendor/FileClaimModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderUser {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    businessName: string | null;
}

interface SubstituteProduct {
    id: string;
    name: string;
    sku: string | null;
}

interface OrderItem {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    fulfilledQty: number;
    unitPrice: number;
    totalPrice: number;
    stockAvailable?: number;
    isLowStock?: boolean;
    substitutes?: SubstituteProduct[];
    product?: {
        imageUrl: string | null;
        sku: string | null;
        hsn: string | null;
        unit: string | null;
        packSize: string | null;
        taxPercent: number;
    };
}

interface OrderPayment {
    id: string;
    amount: number;
    status: string;
    method: string | null;
    createdAt: string;
}

interface OrderVendor {
    id: string;
    businessName: string;
    slug: string;
    logoUrl: string | null;
    addressLine: string | null;
    city: string | null;
    state: string | null;
    addressPincode: string | null;
}

interface OrderData {
    id: string;
    orderNumber: string;
    status: string;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    promoDiscount: number;
    paymentMethod: string | null;
    paymentStatus: string;
    deliveryDate: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    acceptedAt: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
    deliveredAt: string | null;
    deliveryProofType: string | null;
    deliveryProofUrl: string | null;
    deliveryNotes: string | null;
    ewayBillNo: string | null;
    isPartial: boolean;
    deliveryAddressSnapshot: any;
    vendor: OrderVendor;
    user: OrderUser;
    items: OrderItem[];
    payments: OrderPayment[];
    deliverySlot: { dayOfWeek: string; slotStart: string; slotEnd: string } | null;
    events?: Array<{
        id: string;
        action: string;
        fromStatus: string | null;
        toStatus: string | null;
        payload: Record<string, unknown> | null;
        createdAt: string;
        actor: { id: string; fullName: string; email: string | null } | null;
    }>;
    cancelRequest?: {
        id: string;
        status: string;
        reason: string;
        vendorNote: string | null;
        createdAt: string;
    } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const STATUS_FLOW = ['pending', 'confirmed', 'processing', 'ready_for_dispatch', 'shipped', 'delivered'] as const;
const STATUS_LABELS: Record<string, string> = {
    draft: 'Draft',
    pending: 'Pending',
    confirmed: 'Accepted',
    processing: 'Packed',
    ready_for_dispatch: 'Ready for Dispatch',
    shipped: 'Dispatched',
    partially_delivered: 'Partially Delivered',
    delivered: 'Delivered',
    returned: 'Returned',
    cancelled: 'Cancelled',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(v: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(v);
}
function formatTime(t: string): string {
    const [hours, minutes] = t.split(':');
    const h = parseInt(hours, 10);
    return `${h % 12 || 12}:${minutes} ${h >= 12 ? 'PM' : 'AM'}`;
}
function formatDateTime(dt: string): string {
    return new Date(dt).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}
function getStatusIndex(status: string): number {
    return STATUS_FLOW.indexOf(status as typeof STATUS_FLOW[number]);
}

function getStatusBadgeClasses(status: string): string {
    switch (status) {
        case 'delivered':
        case 'confirmed':
            return 'bg-[#EEF8F1] text-[#299E60] border-[#D1FAE5]';
        case 'processing':
        case 'pending':
            return 'bg-[#FFF8EB] text-[#D97706] border-[#FEF3C7]';
        case 'shipped':
            return 'bg-[#E8F0FE] text-[#1A56DB] border-[#DBEAFE]';
        case 'cancelled':
            return 'bg-[#FDF2F2] text-[#EF4444] border-[#FEE2E2]';
        default:
            return 'bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]';
    }
}

function getPaymentStatusBadgeClasses(status: string): string {
    switch (status) {
        case 'paid':
            return 'bg-[#EEF8F1] text-[#299E60] border-[#D1FAE5]';
        case 'pending':
            return 'bg-[#FFF8EB] text-[#D97706] border-[#FEF3C7]';
        case 'failed':
            return 'bg-[#FDF2F2] text-[#EF4444] border-[#FEE2E2]';
        default:
            return 'bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]';
    }
}

function formatSnapshotAddress(snapshot: any): { address: string; pincode: string | null } {
    if (!snapshot) return { address: 'Not specified', pincode: null };
    const parts = [
        snapshot.flatInfo,
        snapshot.addressLine,
        snapshot.landmark ? `Near ${snapshot.landmark}` : null,
        snapshot.city,
        snapshot.state
    ].filter(Boolean);
    return {
        address: parts.length > 0 ? parts.join(', ') : 'Not specified',
        pincode: snapshot.pincode || null
    };
}

// ─── StatusTimeline ───────────────────────────────────────────────────────────

function OrderEventsPanel({
    events,
}: {
    events: NonNullable<OrderData['events']>;
}) {
    const [tab, setTab] = useState<'timeline' | 'status' | 'activity'>('timeline');

    const statusEvents = events.filter(
        (e) => e.action === 'status.changed' || e.action === 'order.auto_accepted' || e.action === 'order.cancelled',
    );
    const rows =
        tab === 'status' ? statusEvents :
            tab === 'activity' ? events :
                events;

    const ACTION_LABELS: Record<string, string> = {
        'order.created': 'Order created',
        'order.auto_accepted': 'Auto-accepted',
        'status.changed': 'Status changed',
        'item.qty_adjusted': 'Quantity adjusted',
        'item.rejected': 'Item rejected',
        'item.substituted': 'Item substituted',
        'order.partial_fulfilment': 'Partial fulfilment',
        'order.cancelled': 'Order cancelled',
        'cancel.requested': 'Cancellation requested',
        'cancel.approved': 'Cancellation approved',
        'cancel.rejected': 'Cancellation declined',
        'invoice.generated': 'Invoice generated',
    };

    return (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden print:hidden" data-testid="order-events-panel">
            <div className="px-5 py-3 border-b border-[#EEEEEE] flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[15px] font-bold text-[#181725]">Order history</h3>
                <div className="flex gap-1 flex-wrap">
                    {([
                        ['timeline', 'Timeline'],
                        ['status', 'Status History'],
                        ['activity', 'Activity Log'],
                    ] as const).map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setTab(id)}
                            className={cn(
                                'px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-colors',
                                tab === id ? 'bg-[#299E60] text-white' : 'bg-[#F5F5F5] text-[#7C7C7C] hover:bg-[#EEEEEE]',
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="p-4 max-h-[320px] overflow-y-auto space-y-2">
                {rows.length === 0 ? (
                    <p className="text-[13px] text-[#AEAEAE] py-4 text-center">No events recorded yet.</p>
                ) : (
                    rows.map((ev) => (
                        <div key={ev.id} className="flex gap-3 items-start border-b border-[#F5F5F5] last:border-0 pb-2 last:pb-0">
                            <div className="w-2 h-2 rounded-full bg-[#299E60] mt-1.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-semibold text-[#181725]">
                                    {ACTION_LABELS[ev.action] ?? ev.action}
                                    {ev.fromStatus && ev.toStatus && ev.fromStatus !== ev.toStatus && (
                                        <span className="font-normal text-[#7C7C7C]">
                                            {' '}({STATUS_LABELS[ev.fromStatus] ?? ev.fromStatus} → {STATUS_LABELS[ev.toStatus] ?? ev.toStatus})
                                        </span>
                                    )}
                                </p>
                                <p className="text-[11px] text-[#AEAEAE]">
                                    {formatDateTime(ev.createdAt)}
                                    {ev.actor?.fullName ? ` · ${ev.actor.fullName}` : ''}
                                </p>
                                {tab === 'activity' && ev.payload && (
                                    <p className="text-[11px] text-[#7C7C7C] mt-0.5 truncate">
                                        {typeof ev.payload.productName === 'string' ? String(ev.payload.productName) : ''}
                                        {typeof ev.payload.reason === 'string' ? ` — ${String(ev.payload.reason)}` : ''}
                                        {ev.payload.fromQty != null && ev.payload.toQty != null
                                            ? ` qty ${String(ev.payload.fromQty)} → ${String(ev.payload.toQty)}`
                                            : ''}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function CancelRequestBanner({
    request,
    onReviewed,
}: {
    request: NonNullable<OrderData['cancelRequest']>;
    onReviewed: () => void;
}) {
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    const review = async (status: 'approved' | 'rejected') => {
        setBusy(true);
        try {
            const res = await fetch(`/api/v1/vendor/cancel-requests/${request.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, vendorNote: note.trim() || undefined }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Review failed');
            toast.success(status === 'approved' ? 'Order cancelled for customer.' : 'Cancellation declined.');
            onReviewed();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className="bg-[#FFF8EB] border border-[#F59E0B]/40 rounded-[14px] p-5 space-y-3 print:hidden"
            data-testid="vendor-cancel-request-banner"
        >
            <div>
                <p className="text-[15px] font-bold text-[#181725]">Customer cancellation request</p>
                <p className="text-[13px] text-[#7C7C7C] mt-1">{request.reason}</p>
            </div>
            <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Optional note to customer..."
                data-testid="vendor-cancel-note"
                className="w-full border border-[#EEEEEE] rounded-[10px] px-3 py-2 text-[13px] outline-none focus:border-[#299E60]/40 resize-none bg-white"
            />
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={busy}
                    data-testid="approve-cancel-request"
                    onClick={() => review('approved')}
                    className="h-[40px] px-5 rounded-[10px] bg-[#E74C3C] text-white text-[13px] font-bold disabled:opacity-50"
                >
                    Approve cancel
                </button>
                <button
                    type="button"
                    disabled={busy}
                    data-testid="reject-cancel-request"
                    onClick={() => review('rejected')}
                    className="h-[40px] px-5 rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold text-[#7C7C7C] hover:bg-white disabled:opacity-50"
                >
                    Decline request
                </button>
            </div>
        </div>
    );
}

function StatusTimeline({
    status,
    createdAt,
    acceptedAt,
    onChangeStatus,
    disabled
}: {
    status: string;
    createdAt: string;
    acceptedAt: string | null;
    onChangeStatus: (status: string) => Promise<void>;
    disabled?: boolean;
}) {
    const currentIdx = getStatusIndex(status);
    const [updatingStep, setUpdatingStep] = useState<string | null>(null);

    if (status === 'cancelled') {
        return (
            <div className="bg-[#FFF0F0] border border-[#FFC9C9] rounded-[14px] p-4 flex items-center gap-3">
                <XCircle size={22} className="text-[#E74C3C] shrink-0" />
                <div>
                    <p className="text-[14px] font-bold text-[#E74C3C]">Order Cancelled</p>
                    <p className="text-[12px] text-[#7C7C7C]">Inventory has been released back to stock.</p>
                </div>
            </div>
        );
    }

    const handleStepClick = async (step: string) => {
        if (step === status || updatingStep || disabled) return;
        setUpdatingStep(step);
        try {
            await onChangeStatus(step);
        } catch (err) {
            // Error handling is managed by caller
        } finally {
            setUpdatingStep(null);
        }
    };

    return (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5">
            <div className="flex items-start justify-between relative">
                <div className="absolute top-[18px] left-[18px] right-[18px] h-[2px] bg-[#EEEEEE] -z-0" />
                <div
                    className="absolute top-[18px] left-[18px] h-[2px] bg-[#299E60] -z-0 transition-all duration-500"
                    style={{ width: currentIdx > 0 ? `${(currentIdx / (STATUS_FLOW.length - 1)) * 100}%` : '0%' }}
                />
                {STATUS_FLOW.map((step, idx) => {
                    const done = currentIdx > idx;
                    const current = currentIdx === idx;
                    const isUpdating = updatingStep === step;
                    const ts = idx === 0 ? createdAt : idx === 1 ? acceptedAt : null;
                    return (
                        <div
                            key={step}
                            onClick={() => handleStepClick(step)}
                            className={cn(
                                "flex flex-col items-center z-10 gap-1.5 min-w-0 transition-all select-none",
                                step !== status && !updatingStep && !disabled ? "cursor-pointer hover:scale-105" : "cursor-default"
                            )}
                        >
                            <div className={cn(
                                'w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all',
                                done ? 'bg-[#299E60] border-[#299E60]' :
                                    current ? 'bg-white border-[#299E60] ring-4 ring-[#299E60]/20' :
                                        'bg-white border-[#DDDDDD]',
                                isUpdating && 'ring-4 ring-yellow-400/30 border-yellow-400'
                            )}>
                                {isUpdating ? (
                                    <Loader2 size={16} className="animate-spin text-[#299E60]" />
                                ) : done ? (
                                    <CheckCircle2 size={18} className="text-white" />
                                ) : current ? (
                                    <div className="w-3 h-3 rounded-full bg-[#299E60] animate-pulse" />
                                ) : (
                                    <div className="w-3 h-3 rounded-full bg-[#DDDDDD]" />
                                )}
                            </div>
                            <div className="text-center">
                                <p className={cn('text-[11px] font-bold transition-colors', done || current ? 'text-[#181725]' : 'text-[#AEAEAE]', step !== status && !updatingStep && !disabled && "hover:text-[#299E60]")}>
                                    {STATUS_LABELS[step]}
                                </p>
                                {ts && (done || current) && (
                                    <p className="text-[10px] text-[#AEAEAE] whitespace-nowrap">
                                        {new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── ActionPanel ──────────────────────────────────────────────────────────────

function ActionPanel({ order, fulfilledQtys, adjustedTotal, isPartialAccept, onAction, onAccept }: {
    order: OrderData;
    fulfilledQtys: Record<string, number>;
    adjustedTotal: number;
    isPartialAccept: boolean;
    onAction: (status: string, reason?: string, proof?: { proofType?: string; proofUrl?: string; notes?: string }) => Promise<void>;
    onAccept: (qtys: Record<string, number>) => Promise<void>;
}) {
    const [rejecting, setRejecting] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [showProofModal, setShowProofModal] = useState(false);
    const [proofType, setProofType] = useState<'otp' | 'photo' | 'notes' | 'none'>('none');
    const [proofNotes, setProofNotes] = useState('');
    const [proofUrl, setProofUrl] = useState('');
    const [busy, setBusy] = useState(false);
    const reasonRef = useRef<HTMLTextAreaElement>(null);

    const run = async (status: string, reason?: string, proof?: { proofType?: string; proofUrl?: string; notes?: string }) => {
        setBusy(true);
        try { await onAction(status, reason, proof); }
        finally { setBusy(false); }
    };
    const runAccept = async () => {
        setBusy(true);
        try { await onAccept(fulfilledQtys); }
        finally { setBusy(false); }
    };

    useEffect(() => { if (rejecting) reasonRef.current?.focus(); }, [rejecting]);

    if (order.status === 'delivered' || order.status === 'cancelled') return null;

    const hint =
        order.status === 'pending'
            ? (isPartialAccept
                ? 'Save quantity adjustments (order stays Pending until you advance status). Cancel is still allowed.'
                : 'Auto-accepted on place. Adjust quantities, then Mark as Accepted or Packed. Cancel only while Pending.')
            : order.status === 'confirmed' || order.status === 'processing'
                ? 'Adjust quantities if needed, then advance fulfilment.'
                : order.status === 'shipped'
                    ? 'Confirm full or partial delivery with optional proof.'
                    : order.status === 'partially_delivered'
                        ? 'Complete remaining delivery when balance arrives.'
                        : 'Confirm delivery once the customer has received the goods.';

    return (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#EEEEEE] flex flex-col gap-1">
                <h3 className="text-[15px] font-bold text-[#181725]">Actions</h3>
                <span className="text-[12px] text-[#AEAEAE]">{hint}</span>
            </div>
            <div className="p-6">

                {/* Partial accept summary banner */}
                {order.status === 'pending' && isPartialAccept && (
                    <div className="mb-4 p-3 rounded-[10px] bg-[#FFF4E5] border border-[#F59E0B]/30 flex items-start gap-2.5">
                        <Info size={16} className="text-[#F59E0B] shrink-0 mt-0.5" />
                        <div className="text-[12px]">
                            <p className="font-bold text-[#976538]">Partial Fulfilment</p>
                            <p className="text-[#7C7C7C]">
                                You&apos;ve reduced quantities on some items. The customer will be notified.
                                Adjusted order value: <span className="font-bold text-[#181725]">{formatPrice(adjustedTotal)}</span>
                            </p>
                        </div>
                    </div>
                )}

                {/* Reject reason form */}
                {rejecting ? (
                    <div className="space-y-3">
                        <p className="text-[14px] font-bold text-[#181725]">Why are you rejecting this order?</p>
                        <textarea
                            ref={reasonRef}
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="e.g. Items out of stock, Delivery area not serviceable..."
                            rows={3}
                            className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-[#E74C3C]/50 resize-none"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => run('cancelled', rejectReason)}
                                disabled={busy || rejectReason.trim().length < 3}
                                className={cn(
                                    'h-[44px] px-6 rounded-[10px] text-[14px] font-bold transition-all flex items-center gap-2',
                                    rejectReason.trim().length >= 3 && !busy
                                        ? 'bg-[#E74C3C] text-white hover:bg-[#c0392b]'
                                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                )}
                            >
                                {busy ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                                Confirm Rejection
                            </button>
                            <button
                                onClick={() => { setRejecting(false); setRejectReason(''); }}
                                disabled={busy}
                                className="h-[44px] px-6 rounded-[10px] text-[14px] font-bold text-[#7C7C7C] hover:bg-[#F5F5F5] transition-all"
                            >
                                Go Back
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-3">
                        {/* Pending: save qty adjustments (no approval gate) */}
                        {order.status === 'pending' && isPartialAccept && (
                            <button
                                onClick={runAccept}
                                disabled={busy}
                                className="h-[48px] px-8 rounded-[12px] bg-[#299E60] text-white text-[15px] font-bold hover:bg-[#238a54] transition-all shadow-sm flex items-center gap-2 disabled:opacity-60"
                            >
                                {busy ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                Save Quantity Adjustments
                            </button>
                        )}
                        {order.status === 'pending' && (
                            <button
                                onClick={() => run('confirmed')}
                                disabled={busy}
                                className="h-[48px] px-6 rounded-[12px] border border-[#299E60] text-[#299E60] text-[14px] font-bold hover:bg-[#EEF8F1] transition-all flex items-center gap-2 disabled:opacity-60"
                            >
                                {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                Mark as Accepted
                            </button>
                        )}
                        {/* Mark as Packed from pending or accepted */}
                        {(order.status === 'pending' || order.status === 'confirmed') && (
                            <button
                                onClick={() => run('processing')}
                                disabled={busy}
                                className="h-[48px] px-8 rounded-[12px] bg-[#F59E0B] text-white text-[15px] font-bold hover:bg-[#D97706] transition-all shadow-sm flex items-center gap-2 disabled:opacity-60"
                            >
                                {busy ? <Loader2 size={18} className="animate-spin" /> : <ClipboardList size={18} />}
                                Mark as Packed
                            </button>
                        )}
                        {/* Ready for Dispatch */}
                        {order.status === 'processing' && (
                            <button
                                onClick={() => run('ready_for_dispatch')}
                                disabled={busy}
                                className="h-[48px] px-6 rounded-[12px] border border-[#0891B2] text-[#0891B2] text-[14px] font-bold hover:bg-cyan-50 flex items-center gap-2 disabled:opacity-60"
                            >
                                Ready for Dispatch
                            </button>
                        )}
                        {/* Mark as Dispatched */}
                        {(order.status === 'processing' || order.status === 'ready_for_dispatch') && (
                            <button
                                onClick={() => run('shipped')}
                                disabled={busy}
                                className="h-[48px] px-8 rounded-[12px] bg-[#3B82F6] text-white text-[15px] font-bold hover:bg-[#2563EB] transition-all shadow-sm flex items-center gap-2 disabled:opacity-60"
                            >
                                {busy ? <Loader2 size={18} className="animate-spin" /> : <Truck size={18} />}
                                Mark as Dispatched
                            </button>
                        )}
                        {/* Confirm Delivery (shipped) — opens proof modal */}
                        {order.status === 'shipped' && (
                            <>
                                <button
                                    onClick={() => setShowProofModal(true)}
                                    disabled={busy}
                                    className="h-[48px] px-8 rounded-[12px] bg-[#299E60] text-white text-[15px] font-bold hover:bg-[#238a54] transition-all shadow-sm flex items-center gap-2 disabled:opacity-60"
                                >
                                    {busy ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                    Confirm Delivery
                                </button>
                                <button
                                    onClick={() => run('partially_delivered')}
                                    disabled={busy}
                                    className="h-[48px] px-6 rounded-[12px] border border-[#F59E0B] text-[#976538] text-[14px] font-bold hover:bg-[#FFF4E5] flex items-center gap-2 disabled:opacity-60"
                                >
                                    Partial Delivery
                                </button>
                                {showProofModal && (
                                    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                                        <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-[420px]">
                                            <div className="px-6 py-4 border-b border-[#F5F5F5]">
                                                <p className="text-[15px] font-bold text-[#181725]">Delivery Proof</p>
                                                <p className="text-[12px] text-[#AEAEAE]">Optional — record how delivery was confirmed</p>
                                            </div>
                                            <div className="p-6 space-y-4">
                                                <div>
                                                    <p className="text-[11px] font-bold text-[#7C7C7C] uppercase mb-2">Proof Type</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {(['none', 'otp', 'photo', 'notes'] as const).map(t => (
                                                            <button key={t} onClick={() => setProofType(t)}
                                                                className={cn('py-2.5 rounded-[10px] border text-[12px] font-semibold transition-colors',
                                                                    proofType === t ? 'border-[#299E60] bg-[#EEF8F1] text-[#299E60]' : 'border-[#EEEEEE] text-[#7C7C7C] hover:bg-[#F5F5F5]')}>
                                                                {t === 'none' ? 'No Proof' : t === 'otp' ? 'OTP Verified' : t === 'photo' ? 'Photo Taken' : 'Notes Only'}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                {(proofType === 'notes' || proofType === 'otp') && (
                                                    <div>
                                                        <label className="block text-[11px] font-bold text-[#7C7C7C] uppercase mb-1">
                                                            {proofType === 'otp' ? 'OTP Code / Reference' : 'Delivery Notes'}
                                                        </label>
                                                        <input type="text" value={proofNotes} onChange={e => setProofNotes(e.target.value)}
                                                            placeholder={proofType === 'otp' ? 'Enter OTP used' : 'e.g. Left at reception'}
                                                            className="w-full h-[38px] px-3 rounded-[10px] border border-[#EEEEEE] text-[12px] outline-none focus:border-[#299E60]/50" />
                                                    </div>
                                                )}
                                                {proofType === 'photo' && (
                                                    <div>
                                                        <label className="block text-[11px] font-bold text-[#7C7C7C] uppercase mb-1">Photo URL (ImageKit)</label>
                                                        <input type="url" value={proofUrl} onChange={e => setProofUrl(e.target.value)}
                                                            placeholder="https://..."
                                                            className="w-full h-[38px] px-3 rounded-[10px] border border-[#EEEEEE] text-[12px] outline-none focus:border-[#299E60]/50" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="px-6 py-4 border-t border-[#F5F5F5] flex gap-3 justify-end">
                                                <button onClick={() => setShowProofModal(false)}
                                                    className="h-[38px] px-4 rounded-[10px] border border-[#EEEEEE] text-[13px] text-[#7C7C7C] hover:bg-[#F5F5F5]">
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setShowProofModal(false);
                                                        run('delivered', undefined, {
                                                            proofType: proofType !== 'none' ? proofType : undefined,
                                                            proofUrl: proofUrl.trim() || undefined,
                                                            notes: proofNotes.trim() || undefined,
                                                        });
                                                    }}
                                                    disabled={busy}
                                                    className="h-[38px] px-5 rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54] disabled:opacity-50 flex items-center gap-2">
                                                    {busy && <Loader2 size={12} className="animate-spin" />}
                                                    Confirm Delivery
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                        {order.status === 'partially_delivered' && (
                            <button
                                onClick={() => setShowProofModal(true)}
                                disabled={busy}
                                className="h-[48px] px-8 rounded-[12px] bg-[#299E60] text-white text-[15px] font-bold hover:bg-[#238a54] flex items-center gap-2 disabled:opacity-60"
                            >
                                Complete Delivery
                            </button>
                        )}
                        {['confirmed', 'processing', 'ready_for_dispatch'].includes(order.status) && (
                            <button
                                onClick={runAccept}
                                disabled={busy}
                                className="h-[48px] px-6 rounded-[12px] border border-[#4F46E5] text-[#4F46E5] text-[14px] font-bold hover:bg-indigo-50 flex items-center gap-2 disabled:opacity-60"
                            >
                                Save Quantity Changes
                            </button>
                        )}
                        {/* Reject / Cancel — Rule 12: pending only */}
                        {order.status === 'pending' && (
                            <button
                                onClick={() => setRejecting(true)}
                                disabled={busy}
                                className="h-[48px] px-6 rounded-[12px] text-[14px] font-bold transition-all flex items-center gap-2 disabled:opacity-60 bg-[#FFF0F0] text-[#E74C3C] hover:bg-[#FFE0E0]"
                            >
                                <XCircle size={16} />
                                Cancel Order
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── PrintPicklist ────────────────────────────────────────────────────────────

function PrintPicklist({ order }: { order: OrderData }) {
    const totalQty = order.items.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <>
            {/* Print media override — hide everything except #picklist */}
            <style>{`
                @media print {
                    body > * { display: none !important; }
                    #picklist { display: block !important; }
                }
            `}</style>

            <div id="picklist" className="hidden print:block font-mono text-[12px] text-black bg-white p-8">
                {/* Header */}
                <div className="border-b-2 border-black pb-3 mb-4">
                    <h1 className="text-[18px] font-bold tracking-tight">
                        PICK SLIP — {order.orderNumber}
                    </h1>
                    <div className="flex justify-between mt-1 text-[11px]">
                        <span>Date: {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                        <span>Status: {STATUS_LABELS[order.status] ?? order.status}</span>
                    </div>
                </div>

                {/* Deliver To */}
                <div className="mb-4">
                    <p className="font-bold underline mb-1">Deliver To:</p>
                    <p>{order.user.fullName}</p>
                    {order.user.businessName && <p>{order.user.businessName}</p>}
                    {order.user.phone && <p>{order.user.phone}</p>}
                    {order.user.email && <p>{order.user.email}</p>}
                    {order.deliverySlot && (
                        <p className="mt-1">
                            Delivery Slot: {DAY_NAMES[Number(order.deliverySlot.dayOfWeek)] || `Day ${order.deliverySlot.dayOfWeek}`}
                            {' '}{formatTime(order.deliverySlot.slotStart)} – {formatTime(order.deliverySlot.slotEnd)}
                        </p>
                    )}
                    {order.deliveryDate && (
                        <p>Delivery Date: {new Date(order.deliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                    )}
                </div>

                {/* Items table */}
                <table className="w-full border-collapse border border-black text-[11px] mb-4">
                    <thead>
                        <tr className="border border-black">
                            <th className="border border-black px-2 py-1 text-left w-6">#</th>
                            <th className="border border-black px-2 py-1 text-left">Product Name</th>
                            <th className="border border-black px-2 py-1 text-left w-20">SKU</th>
                            <th className="border border-black px-2 py-1 text-left w-20">Pack Size</th>
                            <th className="border border-black px-2 py-1 text-center w-14">Qty</th>
                            <th className="border border-black px-2 py-1 text-center w-16">✓ Picked</th>
                        </tr>
                    </thead>
                    <tbody>
                        {order.items.map((item, idx) => (
                            <tr key={item.id} className="border border-black">
                                <td className="border border-black px-2 py-1 text-center">{idx + 1}</td>
                                <td className="border border-black px-2 py-1">{item.productName}</td>
                                <td className="border border-black px-2 py-1">{item.product?.sku ?? '—'}</td>
                                <td className="border border-black px-2 py-1">
                                    {item.product?.packSize
                                        ? `${item.product.packSize}${item.product.unit ? ` ${item.product.unit}` : ''}`
                                        : '—'}
                                </td>
                                <td className="border border-black px-2 py-1 text-center font-bold">{item.quantity}</td>
                                <td className="border border-black px-2 py-1 text-center">
                                    <div className="w-4 h-4 border border-black inline-block" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Totals row */}
                <div className="border border-black p-2 mb-6 text-[11px] flex gap-8">
                    <span>Total Items: <strong>{order.items.length}</strong></span>
                    <span>Total Qty: <strong>{totalQty}</strong></span>
                    <span>Order Value: <strong>{formatPrice(order.totalAmount)}</strong></span>
                </div>

                {/* Notes */}
                {order.notes && (
                    <div className="mb-4 text-[11px]">
                        <span className="font-bold">Customer Notes: </span>{order.notes}
                    </div>
                )}

                {/* Signature line */}
                <div className="border-t border-black pt-4 mt-6 grid grid-cols-3 gap-8 text-[11px]">
                    <div>
                        <p className="mb-6">Packed by:</p>
                        <div className="border-b border-black" />
                    </div>
                    <div>
                        <p className="mb-6">Date:</p>
                        <div className="border-b border-black" />
                    </div>
                    <div>
                        <p className="mb-6">Signature:</p>
                        <div className="border-b border-black" />
                    </div>
                </div>
            </div>
        </>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function VendorOrderDetailPage() {
    const params = useParams();
    const router = useRouter();
    const orderId = params.id as string;

    const [order, setOrder] = useState<OrderData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fulfilledQtys, setFulfilledQtys] = useState<Record<string, number>>({});
    const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
    const [ewayBill, setEwayBill] = useState('');
    const [ewaySaving, setEwaySaving] = useState(false);
    const [showClaimModal, setShowClaimModal] = useState(false);
    const [itemsExpanded, setItemsExpanded] = useState(true);
    const [creatingPicklist, setCreatingPicklist] = useState(false);
    const [printingPicklist, setPrintingPicklist] = useState(false);

    const ensurePicklist = async (): Promise<{ id: string; orderId: string; status: string; reused?: boolean }> => {
        const res = await fetch('/api/v1/vendor/warehouse/picklists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: order!.id }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message || 'Failed to create picklist');
        return json.data;
    };

    const openPicklistPrint = async (picklistId: string, picklistStatus: string) => {
        if (picklistStatus === 'draft') {
            await fetch(`/api/v1/vendor/warehouse/picklists/${picklistId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'printed' }),
            });
        }
        window.open(`/api/v1/vendor/orders/${orderId}/picklist`, '_blank');
    };

    const createPicklist = async () => {
        if (!order) return;
        setCreatingPicklist(true);
        try {
            const data = await ensurePicklist();
            await openPicklistPrint(data.id, data.status);
            toast.success(
                data.reused ? 'Picklist ready (existing)' : 'Picklist created',
                {
                    action: {
                        label: 'Open in Warehouse',
                        onClick: () => router.push(`/vendor/warehouse?tab=picklists&open=${data.id}`),
                    },
                },
            );
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to create picklist');
        } finally {
            setCreatingPicklist(false);
        }
    };

    const printPicklist = async () => {
        if (!order) return;
        setPrintingPicklist(true);
        try {
            const data = await ensurePicklist();
            await openPicklistPrint(data.id, data.status);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to print picklist');
        } finally {
            setPrintingPicklist(false);
        }
    };

    const fetchOrder = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/v1/vendor/orders/${orderId}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Failed to load order');
            setOrder(json.data);
            setEwayBill(json.data.ewayBillNo ?? '');
            const init: Record<string, number> = {};
            for (const item of json.data.items as OrderItem[]) {
                init[item.id] = item.fulfilledQty ?? item.quantity;
            }
            setFulfilledQtys(init);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    useEffect(() => { fetchOrder(); }, [fetchOrder]);

    // Derived state for partial-fulfilment indicators
    const isPartialAccept = !!order && order.status === 'pending' && order.items.some(
        (item) => {
            const current = item.fulfilledQty > 0 ? item.fulfilledQty : item.quantity;
            return (fulfilledQtys[item.id] ?? current) !== current;
        },
    );
    const isAmendDirty = order && ['confirmed', 'processing', 'ready_for_dispatch'].includes(order.status) && order.items.some(
        item => (fulfilledQtys[item.id] ?? item.fulfilledQty ?? item.quantity) !== (item.fulfilledQty ?? item.quantity)
    );
    const adjustedTotal = order?.items.reduce((sum, item) => {
        const fulfilled = fulfilledQtys[item.id] ?? item.quantity;
        const proportion = item.quantity > 0 ? fulfilled / item.quantity : 0;
        return sum + Number(item.totalPrice) * proportion;
    }, 0) ?? 0;

    const handleAction = useCallback(async (
        status: string,
        reason?: string,
        proof?: { proofType?: string; proofUrl?: string; notes?: string }
    ) => {
        if (!order) return;
        try {
            const res = await fetch(`/api/v1/vendor/orders/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, reason, proof }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Update failed');
            await fetchOrder();
            toast.success(
                status === 'cancelled' ? 'Order cancelled. Inventory released.' :
                    status === 'delivered' ? 'Delivery confirmed!' :
                        `Order marked as ${STATUS_LABELS[status] ?? status}.`
            );
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Action failed');
            throw err;
        }
    }, [order, orderId, fetchOrder]);

    const handleTimelineStatusChange = useCallback(async (status: string) => {
        await handleAction(status);
    }, [handleAction]);

    const handleAccept = useCallback(async (qtys: Record<string, number>) => {
        if (!order) return;
        try {
            const zeroWithoutReason = order.items.filter((item) => {
                const q = qtys[item.id] ?? item.quantity;
                return q === 0 && !(rejectReasons[item.id]?.trim());
            });
            if (zeroWithoutReason.length > 0) {
                throw new Error('Enter a rejection reason for each line set to quantity 0.');
            }
            const items = order.items.map(item => ({
                itemId: item.id,
                fulfilledQty: qtys[item.id] ?? item.quantity,
                ...(qtys[item.id] === 0 && rejectReasons[item.id]
                    ? { reason: rejectReasons[item.id].trim() }
                    : {}),
            }));
            const isAmend = order.status !== 'pending';
            const res = await fetch(`/api/v1/vendor/orders/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items, ...(isAmend ? { mode: 'amend' } : {}) }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Accept failed');
            await fetchOrder();
            toast.success(
                isAmend
                    ? 'Order quantities updated.'
                    : 'Quantity adjustments saved. Order remains Pending until you advance status.',
            );
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Accept failed');
            throw err;
        }
    }, [order, orderId, fetchOrder, rejectReasons]);

    const applySubstitute = async (itemId: string, substituteProductId: string) => {
        try {
            const res = await fetch(`/api/v1/vendor/orders/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'substitute',
                    itemId,
                    substituteProductId,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Substitute failed');
            await fetchOrder();
            toast.success('Substitute applied.');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Substitute failed');
        }
    };

    const saveEwayBill = async () => {
        if (!ewayBill.trim()) return;
        setEwaySaving(true);
        try {
            const res = await fetch(`/api/v1/vendor/orders/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ewayBillNo: ewayBill.trim() }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Save failed');
setOrder(prev => prev ? { ...prev, ewayBillNo: ewayBill.trim() } : prev);
            toast.success('E-Way Bill number saved.');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setEwaySaving(false);
        }
    };

    const setFulfilledQty = (itemId: string, qty: number, max: number) => {
        setFulfilledQtys(prev => ({ ...prev, [itemId]: Math.max(0, Math.min(qty, max)) }));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 size={36} className="animate-spin text-[#299E60]" />
            </div>
        );
    }
    if (error || !order) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
                <AlertCircle size={36} className="text-red-400" />
                <p className="text-[16px] font-bold text-[#7C7C7C]">{error || 'Order not found'}</p>
                <button onClick={() => router.back()} className="text-[14px] font-bold text-[#299E60] hover:underline">Go Back</button>
            </div>
        );
    }

    const isPending = order.status === 'pending';
    const isAmendable = ['confirmed', 'processing', 'ready_for_dispatch'].includes(order.status);
    const canEditQty = isPending || isAmendable;
    const canFileClaim = ['delivered', 'partially_delivered'].includes(order.status);
    const canCreatePicklist = ['confirmed', 'processing', 'ready_for_dispatch', 'shipped'].includes(order.status);

    return (
        <div className="space-y-6 pb-12 px-4 md:px-0">

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EEEEEE] pb-4 print:hidden">
                <div className="flex items-center gap-3 text-[13px] text-[#6B7280]">
                    <button
                        onClick={() => router.back()}
                        className="w-[34px] h-[34px] rounded-[10px] bg-white border border-[#E5E7EB] flex items-center justify-center hover:bg-[#F9FAFB] transition-all shadow-sm shrink-0 active:scale-95"
                    >
                        <ChevronLeft size={16} className="text-[#374151]" />
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h1 className="text-[20px] font-black text-[#111827] leading-none">Order Details</h1>
                            <span className={cn(
                                'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border',
                                getStatusBadgeClasses(order.status)
                            )}>
                                {STATUS_LABELS[order.status] ?? order.status}
                            </span>
                            {order.isPartial && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border bg-[#FFF4E5] text-[#976538]">Partial</span>
                            )}
                        </div>
                        <p className="text-[#6B7280] text-[12px] font-medium mt-1">ID: {order.orderNumber} &bull; Placed at {formatDateTime(order.createdAt)}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    {canCreatePicklist && (
                        <button
                            type="button"
                            onClick={createPicklist}
                            disabled={creatingPicklist}
                            className="h-[34px] px-4 rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold text-[#7C7C7C] hover:bg-[#F5F5F5] flex items-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                        >
                            {creatingPicklist ? <Loader2 size={15} className="animate-spin" /> : <ClipboardList size={15} />}
                            Create picklist
                        </button>
                    )}
                    {(['confirmed', 'processing', 'shipped'] as const).includes(order.status as 'confirmed' | 'processing' | 'shipped') && (
                        <button
                            type="button"
                            onClick={printPicklist}
                            disabled={printingPicklist}
                            className="h-[34px] px-4 rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold text-[#7C7C7C] hover:bg-[#F5F5F5] flex items-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                        >
                            {printingPicklist ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
                            Print Picklist
                        </button>
                    )}
                    {canFileClaim && (
                        <button
                            type="button"
                            onClick={() => setShowClaimModal(true)}
                            className="h-[34px] px-4 rounded-[10px] bg-[#181725] text-white text-[13px] font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                        >
                            <FileText size={15} />
                            File claim
                        </button>
                    )}
                </div>
            </div>

            <FileClaimModal
                open={showClaimModal}
                onClose={() => setShowClaimModal(false)}
                orderId={order.id}
                orderNumber={order.orderNumber}
                onCreated={() => router.push('/vendor/claims')}
            />

            {/* Print picklist — only rendered in DOM for confirmed/processing/shipped so
                the @media print style tag is present when the user prints */}
            {(['confirmed', 'processing', 'shipped'] as const).includes(order.status as 'confirmed' | 'processing' | 'shipped') && (
                <PrintPicklist order={order} />
            )}

            {/* Status Timeline */}
            <div className="print:hidden">
                <StatusTimeline 
                    status={order.status} 
                    createdAt={order.createdAt} 
                    acceptedAt={order.acceptedAt} 
                    onChangeStatus={handleTimelineStatusChange}
                />
            </div>

            <OrderEventsPanel events={order.events ?? []} />

            {order.cancelRequest?.status === 'pending' && order.status === 'pending' && (
                <CancelRequestBanner
                    request={order.cancelRequest}
                    onReviewed={() => fetchOrder()}
                />
            )}

            {/* Delivery proof banner */}
            {order.status === 'delivered' && (order.deliveryProofType || order.deliveredAt) && (
                <div className="bg-[#EEF8F1] border border-[#299E60]/20 rounded-[14px] p-5 flex gap-3 print:hidden">
                    <CheckCircle2 size={18} className="text-[#299E60] shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                        <p className="text-[13px] font-bold text-[#181725]">Delivery Confirmed</p>
                        {order.deliveredAt && (
                            <p className="text-[12px] text-[#7C7C7C]">
                                {new Date(order.deliveredAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        )}
                        {order.deliveryProofType && (
                            <p className="text-[12px] text-[#7C7C7C]">Proof: <span className="font-semibold capitalize">{order.deliveryProofType.replace('_', ' ')}</span></p>
                        )}
                        {order.deliveryNotes && (
                            <p className="text-[12px] text-[#7C7C7C]">{order.deliveryNotes}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Rejection reason banner */}
            {order.status === 'cancelled' && order.rejectionReason && (
                <div className="bg-[#FFF8ED] border border-[#FFDCB3] rounded-[14px] p-5 flex gap-3 print:hidden">
                    <AlertTriangle size={18} className="text-[#F59E0B] shrink-0 mt-0.5" />
                    <div>
                        <p className="text-[13px] font-bold text-[#181725]">Rejection Reason</p>
                        <p className="text-[13px] text-[#7C7C7C] mt-0.5">{order.rejectionReason}</p>
                    </div>
                </div>
            )}

            {/* Mobile action panel — stacked above content */}
            <div className="lg:hidden print:hidden">
                <ActionPanel
                    order={order}
                    fulfilledQtys={fulfilledQtys}
                    adjustedTotal={adjustedTotal}
                    isPartialAccept={!!isPartialAccept}
                    onAction={handleAction}
                    onAccept={handleAccept}
                />
            </div>

            {/* Main Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left side 2 columns: Cards and tables */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Information Cards (Customer, Delivery Destination, Finance & Vendor) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* Customer Profile */}
                        <div className="bg-white rounded-[14px] border border-[#EEEEEE] p-5 shadow-sm flex flex-col justify-between">
                            <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-[10px] bg-[#EEF8F1] flex items-center justify-center text-[#299E60] shrink-0 border border-[#D1FAE5]">
                                    <User size={16} />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-[13px] font-black text-[#111827] uppercase tracking-wider mb-1">Customer Profile</h4>
                                    <p className="text-[13px] font-bold text-[#374151] truncate">{order.user.fullName}</p>
                                    <p className="text-[12px] text-[#6B7280] truncate font-medium mt-0.5">{order.user.email}</p>
                                    {order.user.phone && <p className="text-[11px] text-[#9CA3AF] font-semibold font-mono mt-0.5">{order.user.phone}</p>}
                                </div>
                            </div>
                            {order.user.businessName && (
                                <div className="mt-3 pt-2 border-t border-[#F3F4F6]">
                                    <span className="text-[10px] uppercase font-bold text-[#9CA3AF]">Business:</span>
                                    <span className="text-[12px] font-semibold text-[#4B5563] block truncate">{order.user.businessName}</span>
                                </div>
                            )}
                        </div>

                        {/* Delivery Destination */}
                        <div className="bg-white rounded-[14px] border border-[#EEEEEE] p-5 shadow-sm flex flex-col justify-between">
                            <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-[10px] bg-[#EFF6FF] flex items-center justify-center text-[#3B82F6] shrink-0 border border-[#DBEAFE]">
                                    <MapPin size={16} />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-[13px] font-black text-[#111827] uppercase tracking-wider mb-1">Delivery Destination</h4>
                                    {(() => {
                                        const snapAddr = formatSnapshotAddress(order.deliveryAddressSnapshot);
                                        return (
                                            <>
                                                <p className="text-[12px] font-semibold text-[#4B5563] line-clamp-2 leading-relaxed">{snapAddr.address}</p>
                                                {snapAddr.pincode && (
                                                    <p className="text-[11px] font-bold text-[#374151] mt-1 inline-block bg-[#F3F4F6] px-1.5 py-0.5 rounded">Pin: {snapAddr.pincode}</p>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                            {order.deliverySlot && (
                                <div className="mt-3 pt-2 border-t border-[#F3F4F6]">
                                    <span className="text-[10px] uppercase font-bold text-[#9CA3AF] flex items-center gap-1">
                                        <Calendar size={10} /> Delivery Slot:
                                    </span>
                                    <span className="text-[11px] font-semibold text-[#4B5563] block mt-0.5">
                                        {DAY_NAMES[Number(order.deliverySlot.dayOfWeek)] || `Day ${order.deliverySlot.dayOfWeek}`} ({formatTime(order.deliverySlot.slotStart)} - {formatTime(order.deliverySlot.slotEnd)})
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Finance & Vendor */}
                        <div className="bg-white rounded-[14px] border border-[#EEEEEE] p-5 shadow-sm flex flex-col justify-between">
                            <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-[10px] bg-[#FFF8EB] flex items-center justify-center text-[#D97706] shrink-0 border border-[#FEF3C7]">
                                    <ShoppingBag size={16} />
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <h4 className="text-[13px] font-black text-[#111827] uppercase tracking-wider mb-1">Finance &amp; Vendor</h4>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] text-[#6B7280] font-medium">Payment:</span>
                                        <span className={cn(
                                            'inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase border',
                                            getPaymentStatusBadgeClasses(order.paymentStatus)
                                        )}>
                                            {order.paymentStatus}
                                        </span>
                                    </div>
                                    {order.paymentMethod && (
                                        <p className="text-[12px] text-[#4B5563] font-semibold">
                                            <span className="text-[#9CA3AF] font-medium">Method:</span> {order.paymentMethod}
                                        </p>
                                    )}
                                </div>
                            </div>
                            {order.vendor && (
                                <div className="mt-3 pt-2 border-t border-[#F3F4F6] text-[12px] text-[#4B5563]">
                                    <span className="text-[10px] uppercase font-bold text-[#9CA3AF] block mb-1">Vendor Partner:</span>
                                    <span className="font-bold text-[#299E60] block truncate">{order.vendor.businessName}</span>
                                    {(() => {
                                        const vendorAddress = [
                                            order.vendor.addressLine,
                                            order.vendor.city,
                                            order.vendor.state
                                        ].filter(Boolean).join(', ');
                                        const vendorPincode = order.vendor.addressPincode;
                                        return vendorAddress ? (
                                            <p className="text-[11px] text-[#6B7280] font-medium leading-relaxed mt-1">
                                                {vendorAddress}{vendorPincode ? ` - ${vendorPincode}` : ''}
                                            </p>
                                        ) : (
                                            <p className="text-[11px] text-[#9CA3AF] font-medium mt-1">No address specified</p>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Order Items Table Card */}
                    <div className="bg-white rounded-[16px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setItemsExpanded((p) => !p)}
                            className="md:hidden w-full px-5 py-4 border-b border-[#EEEEEE] bg-[#FAFAFA] flex items-center justify-between"
                        >
                            <h3 className="text-[14px] font-black text-[#111827] flex items-center gap-1.5">
                                <Package size={16} className="text-[#299E60]" />
                                Products ({order.items.length})
                            </h3>
                            <ChevronRight size={16} className={cn('text-[#AEAEAE] transition-transform', itemsExpanded && 'rotate-90')} />
                        </button>
                        <div className="hidden md:flex px-5 py-4 border-b border-[#EEEEEE] bg-[#FAFAFA] items-center justify-between">
                            <h3 className="text-[14px] font-black text-[#111827] flex items-center gap-1.5">
                                <Package size={16} className="text-[#299E60]" />
                                Products Sub-items List ({order.items.length})
                            </h3>
                            {isPending && (
                                <span className="text-[11px] text-[#AEAEAE]">
                                    Adjust &quot;Fulfil&quot; qty to ship less than ordered
                                </span>
                            )}
                        </div>

                        {/* Mobile card list */}
                        <div className={cn('md:hidden divide-y divide-[#F3F4F6]', !itemsExpanded && 'hidden')}>
                            {order.items.map((item) => {
                                const fulfilled = canEditQty ? (fulfilledQtys[item.id] ?? item.fulfilledQty ?? item.quantity) : item.fulfilledQty;
                                const isReduced = canEditQty && fulfilled < item.quantity;
                                return (
                                    <div key={item.id} className="p-4 space-y-2">
                                        <div className="flex justify-between gap-2">
                                            <p className="text-[13px] font-bold text-[#111827]">{item.productName}</p>
                                            <p className="text-[13px] font-bold text-[#111827] shrink-0">{formatPrice(item.totalPrice)}</p>
                                        </div>
                                        <p className="text-[11px] text-[#7C7C7C]">Qty {item.quantity} · {formatPrice(item.unitPrice)} each</p>
                                        {isPending && item.isLowStock && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-[8px] px-3 py-2 text-[11px] text-amber-900">
                                                <p className="font-bold flex items-center gap-1"><AlertTriangle size={12} /> Only {item.stockAvailable ?? 0} in stock</p>
                                                {(item.substitutes?.length ?? 0) > 0 && (
                                                    <div className="mt-1 space-y-1">
                                                        <p>Suggest: {item.substitutes!.map((s) => s.name).join(', ')}</p>
                                                        {order.status === 'pending' && item.substitutes!.map((s) => (
                                                            <button
                                                                key={s.id}
                                                                type="button"
                                                                data-testid={`apply-sub-${item.id}-${s.id}`}
                                                                onClick={() => applySubstitute(item.id, s.id)}
                                                                className="block text-[#299E60] font-bold underline"
                                                            >
                                                                Apply {s.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setFulfilledQty(item.id, Math.min(item.stockAvailable ?? 0, item.quantity), item.quantity)}
                                                    className="mt-1.5 text-[#299E60] font-bold"
                                                >
                                                    Accept {Math.min(item.stockAvailable ?? 0, item.quantity)} only
                                                </button>
                                            </div>
                                        )}
                                        {canEditQty && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] font-bold text-[#7C7C7C]">Fulfil:</span>
                                                <button type="button" onClick={() => setFulfilledQty(item.id, fulfilled - 1, item.quantity)} className="w-7 h-7 rounded border border-[#EEEEEE] flex items-center justify-center"><Minus size={12} /></button>
                                                <span className="text-[13px] font-bold w-8 text-center">{fulfilled}</span>
                                                <button type="button" onClick={() => setFulfilledQty(item.id, fulfilled + 1, item.quantity)} className="w-7 h-7 rounded border border-[#EEEEEE] flex items-center justify-center"><Plus size={12} /></button>
                                                {isReduced && <span className="text-[10px] text-amber-700 font-bold">partial</span>}
                                            </div>
                                        )}
                                        {canEditQty && fulfilled === 0 && (
                                            <input
                                                type="text"
                                                data-testid={`reject-reason-${item.id}`}
                                                placeholder="Rejection reason (required)"
                                                value={rejectReasons[item.id] ?? ''}
                                                onChange={(e) => setRejectReasons((p) => ({ ...p, [item.id]: e.target.value }))}
                                                className="w-full mt-1 h-[34px] px-2 rounded-[8px] border border-red-200 text-[12px] outline-none"
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="hidden md:block overflow-x-auto w-full">
                            <table className="w-full border-collapse text-left text-[13px]">
                                <thead>
                                    <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE] text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
                                        <th className="px-5 py-3 font-bold">Product Item</th>
                                        <th className="px-5 py-3 font-bold text-center">SKU / HSN</th>
                                        <th className="px-5 py-3 font-bold text-right">Unit Price</th>
                                        <th className="px-5 py-3 font-bold text-center">Ordered</th>
                                        {canEditQty && (
                                            <th className="px-5 py-3 font-bold text-center text-[#976538]">Fulfil</th>
                                        )}
                                        <th className="px-5 py-3 font-bold text-center print:hidden">GST</th>
                                        <th className="px-5 py-3 font-bold text-right">Total Price</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#F3F4F6]">
                                    {order.items.map((item) => {
                                        const taxPct = Number(item.product?.taxPercent ?? 0);
                                        const itemGST = taxPct > 0
                                            ? Number(item.totalPrice) - (Number(item.totalPrice) / (1 + taxPct / 100))
                                            : 0;
                                        const fulfilled = canEditQty ? (fulfilledQtys[item.id] ?? item.fulfilledQty ?? item.quantity) : item.fulfilledQty;
                                        const isReduced = canEditQty && fulfilled < item.quantity;
                                        const isSkipped = canEditQty && fulfilled === 0;

                                        return (
                                            <tr key={item.id} className={cn(
                                                'hover:bg-[#F9FAFB]/30 transition-colors',
                                                isSkipped && canEditQty ? 'opacity-40' : ''
                                            )}>
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-3">
                                                        {item.product?.imageUrl ? (
                                                            <div className="w-10 h-10 rounded-[8px] overflow-hidden bg-[#F1F4F9] shrink-0 relative print:hidden">
                                                                <Image src={item.product.imageUrl} alt={item.productName} fill className="object-cover" />
                                                            </div>
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-[8px] bg-[#F1F4F9] shrink-0 flex items-center justify-center print:hidden">
                                                                <Package size={16} className="text-[#AEAEAE]" />
                                                            </div>
                                                        )}
                                                        <div>
                                                            <p className="text-[13px] font-bold text-[#111827] block leading-tight">{item.productName}</p>
                                                            {item.product?.packSize && (
                                                                <p className="text-[11px] text-[#7C7C7C] font-semibold mt-0.5">
                                                                    {item.product.packSize}{item.product.unit ? ` · ${item.product.unit}` : ''}
                                                                </p>
                                                            )}
                                                            {isPending && item.isLowStock && (
                                                                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-[8px] px-2.5 py-1.5 text-[11px] text-amber-900 max-w-[280px]">
                                                                    <p className="font-bold flex items-center gap-1">
                                                                        <AlertTriangle size={11} />
                                                                        Only {item.stockAvailable ?? 0} available
                                                                    </p>
                                                                    {(item.substitutes?.length ?? 0) > 0 && (
                                                                        <div className="mt-0.5 space-y-1">
                                                                            <p>Suggest: {item.substitutes!.map((s) => s.name).join(', ')}</p>
                                                                            {order.status === 'pending' && item.substitutes!.map((s) => (
                                                                                <button
                                                                                    key={s.id}
                                                                                    type="button"
                                                                                    data-testid={`apply-sub-desk-${item.id}-${s.id}`}
                                                                                    onClick={() => applySubstitute(item.id, s.id)}
                                                                                    className="block text-[#299E60] font-bold underline text-[11px]"
                                                                                >
                                                                                    Apply {s.name}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setFulfilledQty(item.id, Math.min(item.stockAvailable ?? 0, item.quantity), item.quantity)}
                                                                        className="mt-1 text-[#299E60] font-bold hover:underline"
                                                                    >
                                                                        Accept {Math.min(item.stockAvailable ?? 0, item.quantity)} only
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                    <div className="text-[11px] text-[#7C7C7C] font-semibold">
                                                        {item.product?.sku && <p className="font-bold">{item.product.sku}</p>}
                                                        {item.product?.hsn && <p>HSN: {item.product.hsn}</p>}
                                                        {!item.product?.sku && !item.product?.hsn && <span className="text-[#DDDDDD]">—</span>}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-right font-semibold text-[#4B5563]">
                                                    {formatPrice(item.unitPrice)}
                                                </td>
                                                <td className="px-5 py-4 text-center font-extrabold text-[#111827]">
                                                    {item.quantity}
                                                </td>
                                                
                                                {/* Fulfil qty editor — only visible on pending orders */}
                                                {canEditQty && (
                                                    <td className="px-5 py-4 text-center">
                                                        <div className="inline-flex items-center gap-1">
                                                            <button
                                                                onClick={() => setFulfilledQty(item.id, (fulfilledQtys[item.id] ?? item.quantity) - 1, item.quantity)}
                                                                className="w-7 h-7 rounded-[6px] border border-[#EEEEEE] flex items-center justify-center hover:bg-[#F5F5F5] text-[#7C7C7C] transition-colors active:scale-95"
                                                            >
                                                                <Minus size={12} />
                                                            </button>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={item.quantity}
                                                                value={fulfilledQtys[item.id] ?? item.quantity}
                                                                onChange={(e) => setFulfilledQty(item.id, parseInt(e.target.value) || 0, item.quantity)}
                                                                className={cn(
                                                                    'w-12 h-7 text-center text-[13px] font-bold rounded-[6px] border outline-none',
                                                                    isSkipped ? 'border-[#E74C3C] text-[#E74C3C] bg-[#FFF0F0]' :
                                                                        isReduced ? 'border-[#F59E0B] text-[#976538] bg-[#FFF4E5]' :
                                                                            'border-[#299E60] text-[#299E60] bg-[#F0FBF5]'
                                                                )}
                                                            />
                                                            <button
                                                                onClick={() => setFulfilledQty(item.id, (fulfilledQtys[item.id] ?? item.quantity) + 1, item.quantity)}
                                                                className="w-7 h-7 rounded-[6px] border border-[#EEEEEE] flex items-center justify-center hover:bg-[#F5F5F5] text-[#7C7C7C] transition-colors active:scale-95"
                                                            >
                                                                <Plus size={12} />
                                                            </button>
                                                        </div>
                                                        {isReduced && !isSkipped && (
                                                            <p className="text-[10px] text-[#976538] mt-0.5 font-bold">of {item.quantity}</p>
                                                        )}
                                                        {isSkipped && (
                                                            <p className="text-[10px] text-[#E74C3C] mt-0.5 font-bold">skipped</p>
                                                        )}
                                                        {isSkipped && (
                                                            <input
                                                                type="text"
                                                                data-testid={`reject-reason-desk-${item.id}`}
                                                                placeholder="Rejection reason"
                                                                value={rejectReasons[item.id] ?? ''}
                                                                onChange={(e) => setRejectReasons((p) => ({ ...p, [item.id]: e.target.value }))}
                                                                className="mt-1 w-full max-w-[140px] mx-auto h-[28px] px-1.5 rounded border border-red-200 text-[10px] outline-none"
                                                            />
                                                        )}
                                                    </td>
                                                )}

                                                <td className="px-5 py-4 text-center text-[11px] text-[#7C7C7C] font-semibold print:hidden">
                                                    {taxPct > 0 ? (
                                                        <div><p className="font-bold">{taxPct}%</p><p>{formatPrice(itemGST)}</p></div>
                                                    ) : <span className="text-[#DDDDDD]">—</span>}
                                                </td>
                                                <td className="px-5 py-4 text-right font-bold text-[#111827]">
                                                    {isPending && isReduced
                                                        ? <div>
                                                            <p className="text-[#976538]">{formatPrice(Number(item.totalPrice) * (fulfilled / item.quantity))}</p>
                                                            <p className="text-[11px] text-[#AEAEAE] line-through font-normal">{formatPrice(item.totalPrice)}</p>
                                                        </div>
                                                        : formatPrice(item.totalPrice)
                                                    }
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right side 1 column: Actions panel, Billing ledger, status overrides, and notes */}
                <div className="space-y-6">
                    {/* Action Panel — desktop only (mobile shown above) */}
                    <div className="print:hidden hidden lg:block">
                        <ActionPanel
                            order={order}
                            fulfilledQtys={fulfilledQtys}
                            adjustedTotal={adjustedTotal}
                            isPartialAccept={!!isPartialAccept}
                            onAction={handleAction}
                            onAccept={handleAccept}
                        />
                    </div>

                    {/* Invoice ledger box */}
                    <div className="bg-[#FAFAFA] rounded-[16px] border border-[#E5E7EB] p-5 space-y-4 shadow-inner">
                        <div className="border-b border-[#E5E7EB] pb-2">
                            <h4 className="text-[14px] font-black text-[#111827] flex items-center gap-1.5">
                                <Landmark size={15} className="text-[#4B5563]" />
                                Billing Invoice Summary
                            </h4>
                        </div>
                        
                        <div className="space-y-3.5 text-[13px] font-medium text-[#4B5563]">
                            <div className="flex justify-between">
                                <span>Cart Subtotal</span>
                                <span className="text-[#111827] font-bold">{formatPrice(order.subtotal)}</span>
                            </div>
                            {order.promoDiscount > 0 && (
                                <div className="flex justify-between text-[#299E60]">
                                    <span>Promo Discount</span>
                                    <span className="font-bold">−{formatPrice(order.promoDiscount)}</span>
                                </div>
                            )}
                            {Number(order.taxAmount) > 0 && (
                                <div className="flex justify-between">
                                    <span>GST / Tax</span>
                                    <span className="text-[#111827] font-bold">{formatPrice(Number(order.taxAmount))}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center pt-1.5 border-t border-dashed border-[#D1D5DB]">
                                <span className="text-[14px] font-black text-[#111827]">Grand Total</span>
                                <span className="text-[20px] font-black text-[#299E60]">{formatPrice(order.totalAmount)}</span>
                            </div>
                            {isPartialAccept && (
                                <div className="flex justify-between text-[#976538] pt-1 border-t border-dashed border-[#D1D5DB]">
                                    <span>Adjusted Total</span>
                                    <span className="font-bold">{formatPrice(adjustedTotal)}</span>
                                </div>
                            )}
                        </div>

                        {order.paymentStatus === 'paid' && (
                            <a
                                href={`/api/v1/vendor/orders/${order.id}/invoice`}
                                download
                                className="w-full h-[38px] rounded-[8px] text-[12px] font-bold border border-[#299E60]/40 text-[#299E60] hover:bg-[#EEF8F1] transition-colors flex items-center justify-center gap-1.5"
                            >
                                <FileDown size={14} />
                                Download Invoice
                            </a>
                        )}
                    </div>

                    {/* E-Way Bill Box */}
                    {((order.status === 'processing' || order.status === 'shipped') || order.ewayBillNo) && (
                        <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm space-y-4">
                            <div className="border-b border-[#F3F4F6] pb-2">
                                <h4 className="text-[14px] font-black text-[#111827] flex items-center gap-1.5">
                                    <FileText size={15} className="text-[#3B82F6]" />
                                    E-Way Bill Information
                                </h4>
                            </div>
                            {order.ewayBillNo && !['processing'].includes(order.status) ? (
                                <p className="text-[13px] font-bold text-[#181725]">{order.ewayBillNo}</p>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={ewayBill}
                                            onChange={e => setEwayBill(e.target.value)}
                                            placeholder="Enter E-Way Bill no."
                                            className="flex-1 h-[38px] px-3 rounded-[8px] border border-[#D1D5DB] text-[13px] outline-none focus:border-[#299E60]/50"
                                        />
                                        <button
                                            onClick={saveEwayBill}
                                            disabled={ewaySaving || !ewayBill.trim()}
                                            className="h-[38px] px-4 rounded-[8px] bg-[#299E60] hover:bg-[#238a54] text-white text-[13px] font-bold disabled:opacity-40 transition-colors"
                                        >
                                            {ewaySaving ? '...' : 'Save'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Customer Notes ────────────────────────────────── */}
            {order.notes && (
                <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5">
                    <h3 className="text-[14px] font-bold text-[#181725] mb-2">Customer Notes</h3>
                    <p className="text-[13px] text-[#7C7C7C]">{order.notes}</p>
                </div>
            )}
        </div>
    );
}
