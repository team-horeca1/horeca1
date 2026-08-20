'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Star, Home, Package, LogIn, X, Loader2, Store, Clock, CheckCircle2, XCircle, Truck, Trash2, RotateCcw, ListPlus } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { dal } from '@/lib/dal';
import { cn } from '@/lib/utils';

interface ApiOrderItem {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: string | number;
    totalPrice: string | number;
    product?: { imageUrl: string | null; images: string[] } | null;
}

interface ApiOrderVendor {
    id: string;
    businessName: string;
    slug: string;
    logoUrl: string | null;
}

interface ApiOrder {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    paymentMethod: string | null;
    subtotal: string | number;
    totalAmount: string | number;
    createdAt: string;
    vendor: ApiOrderVendor;
    items: ApiOrderItem[];
    review?: { rating: number } | null;
    payments?: Array<{ id: string; status: string; razorpayPaymentId?: string }>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    draft:                { label: 'Draft',               color: 'text-gray-600',    bg: 'bg-gray-100',   icon: <Clock size={10} /> },
    pending:              { label: 'Pending',             color: 'text-amber-600',   bg: 'bg-amber-50',   icon: <Clock size={10} /> },
    confirmed:            { label: 'Accepted',            color: 'text-blue-600',    bg: 'bg-blue-50',    icon: <CheckCircle2 size={10} /> },
    processing:           { label: 'Packing',             color: 'text-indigo-600',  bg: 'bg-indigo-50',  icon: <Loader2 size={10} /> },
    ready_for_dispatch:   { label: 'Ready for Dispatch',  color: 'text-cyan-600',    bg: 'bg-cyan-50',    icon: <Package size={10} /> },
    shipped:              { label: 'Out for Delivery',    color: 'text-purple-600',  bg: 'bg-purple-50',  icon: <Truck size={10} /> },
    partially_delivered:  { label: 'Partially Delivered', color: 'text-orange-600',  bg: 'bg-orange-50',  icon: <Truck size={10} /> },
    delivered:            { label: 'Delivered',           color: 'text-green-600',   bg: 'bg-green-50',   icon: <CheckCircle2 size={10} /> },
    returned:             { label: 'Returned',            color: 'text-rose-600',    bg: 'bg-rose-50',    icon: <XCircle size={10} /> },
    cancelled:            { label: 'Cancelled',           color: 'text-red-500',     bg: 'bg-red-50',     icon: <XCircle size={10} /> },
};

const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
    unpaid:   { label: 'Unpaid',   color: 'text-red-500' },
    paid:     { label: 'Paid',     color: 'text-green-600' },
    partial:  { label: 'Partial',  color: 'text-amber-500' },
    refunded: { label: 'Refunded', color: 'text-gray-400' },
};

// Zoho-style status filter tabs across the top of the list.
const FILTER_TABS: Array<{ key: string | null; label: string }> = [
    { key: null,         label: 'All Orders' },
    { key: 'draft',      label: 'Drafts' },
    { key: 'pending',    label: 'Pending' },
    { key: 'confirmed',  label: 'Accepted' },
    { key: 'shipped',    label: 'Out for Delivery' },
    { key: 'delivered',  label: 'Delivered' },
    { key: 'cancelled',  label: 'Cancelled' },
];

function getProductImage(item: ApiOrderItem): string | null {
    return item.product?.imageUrl || item.product?.images?.[0] || null;
}

function formatAmount(val: string | number): string {
    const n = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(n) ? '—' : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return iso; }
}

function StatusChip({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'text-gray-500', bg: 'bg-gray-100', icon: null };
    return (
        <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wide whitespace-nowrap', cfg.bg, cfg.color)}>
            {cfg.icon}
            {cfg.label}
        </span>
    );
}

function OrdersPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const statusParam = searchParams.get('status') || undefined;
    const { data: session, status: sessionStatus } = useSession();
    const isLoggedIn = sessionStatus === 'authenticated';
    // !session so a background session revalidation doesn't re-flash the
    // skeleton or refetch the list while the user is mid-action.
    const isLoading = sessionStatus === 'loading' && !session;
    const [orders, setOrders] = React.useState<ApiOrder[]>([]);
    const [ordersLoading, setOrdersLoading] = React.useState(true);
    const [ratingModal, setRatingModal] = React.useState<{ orderId: string } | null>(null);
    const [selectedStars, setSelectedStars] = React.useState(0);
    const [ratingComment, setRatingComment] = React.useState('');
    const [isSubmittingRating, setIsSubmittingRating] = React.useState(false);
    const [deletingOrderId, setDeletingOrderId] = React.useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = React.useState<{ orderId: string; isDraft: boolean } | null>(null);

    React.useEffect(() => {
        if (isLoading) return;
        if (!isLoggedIn) { setOrdersLoading(false); return; }
        setOrdersLoading(true);
        dal.orders.list({ status: statusParam })
            .then(r => setOrders((r.orders || []) as ApiOrder[]))
            .catch(() => setOrders([]))
            .finally(() => setOrdersLoading(false));
    }, [isLoggedIn, isLoading, statusParam]);

    const setFilter = (key: string | null) => {
        router.push(key ? `/orders?status=${key}` : '/orders');
    };

    const handleSaveAsOrderList = async (order: ApiOrder, e?: React.MouseEvent) => {
        e?.stopPropagation();
        try {
            const vendorId = order.vendor?.id;
            if (!vendorId) { toast.error('Could not determine vendor'); return; }
            const res = await fetch('/api/v1/lists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: `${order.orderNumber} List`, vendorId }),
            });
            const json = await res.json();
            const listId = json.data?.id;
            if (!listId) throw new Error('No list ID');
            for (const item of order.items) {
                await fetch(`/api/v1/lists/${listId}/items`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ productId: item.productId, vendorId, defaultQty: item.quantity }),
                });
            }
            toast.success('Saved as Order List!');
        } catch { toast.error('Failed to save as order list'); }
    };

    const handleOrderAgain = async (order: ApiOrder, e?: React.MouseEvent) => {
        e?.stopPropagation();
        // Use the server reorder endpoint — it re-resolves current prices +
        // availability and adds to the active outlet cart, instead of matching
        // against a stale client-side product list.
        try {
            const res = await fetch(`/api/v1/orders/${order.id}/reorder`, { method: 'POST' });
            const json = await res.json();
            if (!res.ok || !json.success) {
                toast.error(json.error?.message || 'Could not reorder');
                return;
            }
            const added = json.data?.added?.length ?? 0;
            const skipped = json.data?.skipped?.length ?? 0;
            if (added > 0) {
                toast.success(`${added} item${added > 1 ? 's' : ''} added to cart${skipped ? ` · ${skipped} unavailable` : ''}`);
                window.location.href = '/cart';
            } else {
                toast.error(skipped ? 'Those items are no longer available' : 'Nothing to reorder');
            }
        } catch {
            toast.error('Could not reorder');
        }
    };

    const handleDeleteOrder = (orderId: string, isDraft: boolean, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setDeleteConfirm({ orderId, isDraft });
    };

    const confirmDeleteOrder = async () => {
        if (!deleteConfirm) return;
        const { orderId, isDraft } = deleteConfirm;
        setDeletingOrderId(orderId);
        setDeleteConfirm(null);
        try {
            await dal.orders.delete(orderId);
            setOrders(prev => prev.filter(o => o.id !== orderId));
            toast.success(isDraft ? 'Draft order deleted' : 'Order history removed');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Could not delete order');
        } finally {
            setDeletingOrderId(null);
        }
    };

    const openRatingModal = (orderId: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setSelectedStars(0); setRatingComment(''); setRatingModal({ orderId });
    };

    const handleSubmitRating = async () => {
        if (!ratingModal || selectedStars === 0) return;
        setIsSubmittingRating(true);
        try {
            await dal.reviews.submit(ratingModal.orderId, selectedStars, ratingComment || undefined);
            setOrders(prev => prev.map(o =>
                o.id === ratingModal.orderId ? { ...o, review: { rating: selectedStars } } : o
            ));
            toast.success('Review submitted!');
            setRatingModal(null);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to submit review');
        } finally {
            setIsSubmittingRating(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F2F3F2]">
            {/* Mobile Header */}
            <div className="md:hidden sticky top-0 z-40 bg-white border-b border-gray-100 px-4 h-14 flex items-center">
                <button onClick={() => router.push('/')} className="p-2 -ml-2">
                    <ChevronLeft size={22} className="text-[#181725]" />
                </button>
                <h1 className="text-[17px] font-bold text-[#181725] absolute left-1/2 -translate-x-1/2">
                    {statusParam === 'draft' ? 'Draft Orders' : 'My Orders'}
                </h1>
            </div>

            {/* Desktop Header */}
            <div className="hidden md:block bg-white border-b border-gray-100">
                <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-5">
                    <div className="flex items-center gap-2 text-[13px] text-gray-400 mb-3">
                        <Link href="/" className="hover:text-[#53B175] flex items-center gap-1 transition-colors">
                            <Home size={14} /><span>Home</span>
                        </Link>
                        <ChevronRight size={12} />
                        <span className="text-[#181725] font-semibold">
                            {statusParam === 'draft' ? 'Draft Orders' : 'My Orders'}
                        </span>
                    </div>
                    <h1 className="text-[28px] font-black text-[#181725] tracking-tight flex items-center gap-3">
                        <Package size={26} className="text-[#53B175]" />
                        {statusParam === 'draft' ? 'Draft Orders' : 'My Orders'}
                    </h1>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)] py-5 md:py-8 pb-28">
                {/* Status filter tabs (Zoho-style list filters) */}
                {isLoggedIn && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4">
                        {FILTER_TABS.map(tab => {
                            const active = (statusParam ?? null) === tab.key;
                            return (
                                <button
                                    key={tab.label}
                                    onClick={() => setFilter(tab.key)}
                                    className={cn(
                                        'shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-colors border',
                                        active
                                            ? 'bg-[#53B175] text-white border-[#53B175]'
                                            : 'bg-white text-gray-500 border-gray-200 hover:border-[#53B175] hover:text-[#53B175]'
                                    )}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                )}

                {(isLoading || ordersLoading) ? (
                    <div className="flex flex-col items-center justify-center py-24">
                        <div className="w-10 h-10 border-4 border-gray-200 border-t-[#53B175] rounded-full animate-spin mb-5" />
                        <p className="text-[14px] text-gray-400 font-medium">Loading orders...</p>
                    </div>
                ) : !isLoggedIn ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-5">
                            <LogIn size={36} className="text-gray-300" strokeWidth={1.5} />
                        </div>
                        <h2 className="text-[20px] font-bold text-[#181725] mb-2">Sign in to view orders</h2>
                        <p className="text-[14px] text-gray-400 font-medium mb-8 max-w-[240px]">
                            Log in to see your order history and reorder items.
                        </p>
                        <button onClick={() => router.push('/login')}
                            className="px-8 py-3 bg-[#53B175] text-white font-bold rounded-2xl shadow-lg shadow-green-200/50 hover:bg-[#48a068]">
                            Log In
                        </button>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-5">
                            <Package size={36} className="text-gray-300" strokeWidth={1.5} />
                        </div>
                        <h2 className="text-[20px] font-bold text-[#181725] mb-2">
                            {statusParam === 'draft' ? 'No draft orders' : 'No orders yet'}
                        </h2>
                        <p className="text-[14px] text-gray-400 font-medium mb-8 max-w-[220px]">
                            {statusParam === 'draft'
                                ? 'You do not have any saved draft purchase orders.'
                                : 'Start shopping to see your orders here.'
                            }
                        </p>
                        <button onClick={() => router.push('/')}
                            className="px-8 py-3 bg-[#53B175] text-white font-bold rounded-2xl shadow-lg shadow-green-200/50 hover:bg-[#48a068]">
                            Browse Vendors
                        </button>
                    </div>
                ) : (
                    <>
                        {/* ── DESKTOP: Zoho-style list/table view ── */}
                        <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50/80">
                                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">Order #</th>
                                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">Date</th>
                                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">Vendor</th>
                                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">Items</th>
                                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400 text-right">Amount</th>
                                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">Payment</th>
                                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">Status</th>
                                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.map(order => {
                                        const paymentCfg = PAYMENT_STATUS[order.paymentStatus] ?? { label: order.paymentStatus, color: 'text-gray-400' };
                                        const hasReview = !!(order.review?.rating);
                                        const isDraft = order.status === 'draft';
                                        return (
                                            <tr
                                                key={order.id}
                                                onClick={() => router.push(`/orders/${order.id}`)}
                                                className="border-b border-gray-50 last:border-0 hover:bg-green-50/30 cursor-pointer transition-colors group"
                                            >
                                                <td className="px-4 py-3">
                                                    <span className="text-[13px] font-black text-[#181725] group-hover:text-[#53B175] transition-colors">{order.orderNumber}</span>
                                                    {hasReview && (
                                                        <span className="flex items-center gap-0.5 mt-0.5">
                                                            {[1,2,3,4,5].map(s => (
                                                                <Star key={s} size={9}
                                                                    className={s <= (order.review?.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200 fill-none'} />
                                                            ))}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-[12px] text-gray-500 font-medium whitespace-nowrap">{formatDate(order.createdAt)}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden relative">
                                                            {order.vendor?.logoUrl
                                                                ? <Image src={order.vendor.logoUrl} alt={order.vendor.businessName} fill className="object-contain p-0.5" sizes="28px" />
                                                                : <Store size={12} className="text-gray-400" />
                                                            }
                                                        </div>
                                                        <span className="text-[12px] font-bold text-[#181725] truncate max-w-[160px]">{order.vendor?.businessName || 'Vendor'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1">
                                                        {order.items.slice(0, 3).map((item, idx) => {
                                                            const img = getProductImage(item);
                                                            return (
                                                                <div key={idx} className="w-7 h-7 rounded-md border border-gray-100 bg-gray-50 shrink-0 relative overflow-hidden" title={item.productName}>
                                                                    {img
                                                                        ? <Image src={img} alt={item.productName} fill className="object-contain p-0.5" sizes="28px" />
                                                                        : <Package size={11} className="text-gray-300 absolute inset-0 m-auto" />
                                                                    }
                                                                </div>
                                                            );
                                                        })}
                                                        <span className="text-[11px] text-gray-400 font-bold ml-1 whitespace-nowrap">
                                                            {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className="text-[13px] font-black text-[#181725]">{formatAmount(order.totalAmount)}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={cn('text-[11px] font-bold', paymentCfg.color)}>{paymentCfg.label}</span>
                                                </td>
                                                <td className="px-4 py-3"><StatusChip status={order.status} /></td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                                                        {isDraft ? (
                                                            <>
                                                                <button
                                                                    onClick={() => router.push(`/checkout?draft=${order.id}`)}
                                                                    className="px-3 py-1.5 rounded-lg bg-[#53B175] text-white text-[11px] font-black hover:bg-[#48a068] transition-colors whitespace-nowrap"
                                                                >
                                                                    Submit
                                                                </button>
                                                                <button
                                                                    onClick={(e) => handleDeleteOrder(order.id, true, e)}
                                                                    disabled={deletingOrderId === order.id}
                                                                    title="Delete draft"
                                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-colors"
                                                                >
                                                                    {deletingOrderId === order.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                {order.status === 'delivered' && !hasReview && (
                                                                    <button onClick={(e) => openRatingModal(order.id, e)} title="Rate order"
                                                                        className="p-1.5 rounded-lg text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 transition-colors">
                                                                        <Star size={14} />
                                                                    </button>
                                                                )}
                                                                <button onClick={(e) => handleSaveAsOrderList(order, e)} title="Save as list"
                                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-[#53B175] hover:bg-green-50 transition-colors">
                                                                    <ListPlus size={14} />
                                                                </button>
                                                                <button onClick={(e) => handleOrderAgain(order, e)} title="Reorder"
                                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-[#53B175] hover:bg-green-50 transition-colors">
                                                                    <RotateCcw size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => handleDeleteOrder(order.id, false, e)}
                                                                    disabled={deletingOrderId === order.id}
                                                                    title="Remove from history"
                                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-colors"
                                                                >
                                                                    {deletingOrderId === order.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* ── MOBILE: compact list rows ── */}
                        <div className="md:hidden space-y-2.5">
                            {orders.map(order => {
                                const paymentCfg = PAYMENT_STATUS[order.paymentStatus] ?? { label: order.paymentStatus, color: 'text-gray-400' };
                                const hasReview = !!(order.review?.rating);
                                const isDraft = order.status === 'draft';
                                return (
                                    <div
                                        key={order.id}
                                        onClick={() => router.push(`/orders/${order.id}`)}
                                        className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 cursor-pointer active:bg-gray-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden relative">
                                                {order.vendor?.logoUrl
                                                    ? <Image src={order.vendor.logoUrl} alt={order.vendor.businessName} fill className="object-contain p-1" sizes="36px" />
                                                    : <Store size={14} className="text-gray-400" />
                                                }
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-[13px] font-black text-[#181725] truncate">{order.orderNumber}</p>
                                                    <span className="text-[13px] font-black text-[#53B175] whitespace-nowrap">{formatAmount(order.totalAmount)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2 mt-0.5">
                                                    <p className="text-[11px] text-gray-400 font-medium truncate">
                                                        {order.vendor?.businessName || 'Vendor'} · {formatDate(order.createdAt)} · {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                                                    </p>
                                                    <span className={cn('text-[10px] font-bold whitespace-nowrap', paymentCfg.color)}>{paymentCfg.label}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-50" onClick={e => e.stopPropagation()}>
                                            <StatusChip status={order.status} />
                                            <div className="flex items-center gap-1">
                                                {isDraft ? (
                                                    <>
                                                        <button
                                                            onClick={() => router.push(`/checkout?draft=${order.id}`)}
                                                            className="px-3 py-1.5 rounded-lg bg-[#53B175] text-white text-[11px] font-black"
                                                        >
                                                            Submit
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleDeleteOrder(order.id, true, e)}
                                                            disabled={deletingOrderId === order.id}
                                                            className="p-1.5 rounded-lg text-gray-400 active:text-rose-600 disabled:opacity-50"
                                                        >
                                                            {deletingOrderId === order.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        {order.status === 'delivered' && !hasReview && (
                                                            <button onClick={(e) => openRatingModal(order.id, e)}
                                                                className="p-1.5 rounded-lg text-gray-400 active:text-yellow-500">
                                                                <Star size={15} />
                                                            </button>
                                                        )}
                                                        <button onClick={(e) => handleSaveAsOrderList(order, e)}
                                                            className="p-1.5 rounded-lg text-gray-400 active:text-[#53B175]">
                                                            <ListPlus size={15} />
                                                        </button>
                                                        <button onClick={(e) => handleOrderAgain(order, e)}
                                                            className="p-1.5 rounded-lg text-gray-400 active:text-[#53B175]">
                                                            <RotateCcw size={15} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleDeleteOrder(order.id, false, e)}
                                                            disabled={deletingOrderId === order.id}
                                                            className="p-1.5 rounded-lg text-gray-400 active:text-rose-600 disabled:opacity-50"
                                                        >
                                                            {deletingOrderId === order.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* ── RATING MODAL ── */}
            {ratingModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-[28px] w-full max-w-sm p-6 shadow-2xl max-h-[calc(100vh-2rem)] overflow-y-auto">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-[18px] font-black text-[#181725]">Rate Your Order</h3>
                            <button onClick={() => setRatingModal(null)}
                                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                                <X size={16} className="text-gray-500" />
                            </button>
                        </div>
                        <div className="flex items-center justify-center gap-3 mb-4">
                            {[1,2,3,4,5].map(s => (
                                <button key={s} onClick={() => setSelectedStars(s)} className="transition-transform active:scale-90">
                                    <Star size={36} className={s <= selectedStars ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200 fill-none'} />
                                </button>
                            ))}
                        </div>
                        <p className="text-center text-[13px] font-bold text-gray-400 mb-4">
                            {['Tap to rate','Very Poor','Poor','Average','Good','Excellent!'][selectedStars]}
                        </p>
                        <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)}
                            maxLength={200} placeholder="Add a comment (optional)..." rows={3}
                            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-[13px] text-[#181725] placeholder-gray-300 resize-none focus:outline-none focus:border-[#53B175] transition-colors mb-4" />
                        <button onClick={handleSubmitRating} disabled={selectedStars === 0 || isSubmittingRating}
                            className={cn('w-full py-3.5 rounded-2xl text-[14px] font-black flex items-center justify-center gap-2 transition-all',
                                selectedStars > 0 && !isSubmittingRating
                                    ? 'bg-[#53B175] text-white shadow-lg shadow-green-200/50 hover:bg-[#48a068]'
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed')}>
                            {isSubmittingRating ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : 'Submit Review'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── DELETE CONFIRMATION MODAL ── */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-[28px] w-full max-w-sm p-6 shadow-2xl max-h-[calc(100vh-2rem)] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[18px] font-black text-[#181725]">
                                {deleteConfirm.isDraft ? 'Delete Draft Order?' : 'Remove from History?'}
                            </h3>
                            <button onClick={() => setDeleteConfirm(null)}
                                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                                <X size={16} className="text-gray-500" />
                            </button>
                        </div>
                        <div className="flex flex-col items-center text-center py-4">
                            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-4 text-rose-500">
                                <Trash2 size={32} />
                            </div>
                            <p className="text-[14px] text-gray-500 font-medium leading-relaxed">
                                {deleteConfirm.isDraft
                                    ? 'Are you sure you want to delete this draft order? This action cannot be undone.'
                                    : 'Are you sure you want to remove this order from your history? This will not cancel the order if it is in progress.'}
                            </p>
                        </div>
                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 py-3.5 rounded-2xl text-[14px] font-bold bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteOrder}
                                className="flex-1 py-3.5 rounded-2xl text-[14px] font-black bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-200/50 transition-all"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}

export default function OrderHistoryPage() {
    return (
        <React.Suspense fallback={
            <div className="min-h-screen bg-[#F2F3F2] flex flex-col items-center justify-center">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-[#53B175] rounded-full animate-spin mb-5" />
                <p className="text-[14px] text-gray-400 font-medium">Loading...</p>
            </div>
        }>
            <OrdersPageContent />
        </React.Suspense>
    );
}
