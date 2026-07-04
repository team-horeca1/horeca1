'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Loader2, Eye, CheckCircle2, ChevronRight, ChevronLeft, AlertTriangle, Download, X, ChevronDown, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VendorOrder {
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: number;
    paymentStatus: string;
    createdAt: string;
    user: { fullName: string; email: string; businessName?: string };
    _count?: { items: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700 border-gray-200',
    delivered: 'bg-[#EEF8F1] text-[#299E60] border-[#D1FAE5]',
    confirmed: 'bg-blue-50 text-blue-700 border-blue-100',
    processing: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    pending: 'bg-[#FFF8EB] text-[#D97706] border-[#FEF3C7]',
    ready_for_dispatch: 'bg-cyan-50 text-cyan-700 border-cyan-100',
    shipped: 'bg-purple-50 text-purple-700 border-purple-100',
    partially_delivered: 'bg-orange-50 text-orange-700 border-orange-100',
    returned: 'bg-rose-50 text-rose-700 border-rose-100',
    cancelled: 'bg-[#FDF2F2] text-[#EF4444] border-[#FEE2E2]',
};

const PAYMENT_STYLE: Record<string, string> = {
    paid: 'bg-[#EEF8F1] text-[#299E60]',
    unpaid: 'bg-[#FFF4E5] text-[#976538]',
    partial: 'bg-blue-50 text-blue-600',
    refunded: 'bg-[#F3F4F6] text-[#6B7280]',
};

const STATUS_LABELS: Record<string, string> = {
    draft: 'Draft',
    pending: 'Pending Approval',
    confirmed: 'Accepted',
    processing: 'Packing',
    ready_for_dispatch: 'Ready for Dispatch',
    shipped: 'Out for Delivery',
    partially_delivered: 'Partially Delivered',
    delivered: 'Delivered',
    returned: 'Returned',
    cancelled: 'Cancelled',
};

const STATUS_OPTIONS = [
    'pending', 'confirmed', 'processing', 'ready_for_dispatch',
    'shipped', 'partially_delivered', 'delivered', 'returned', 'cancelled',
];

const STATUS_TABS = ['all', 'pending', 'confirmed', 'processing', 'ready_for_dispatch', 'shipped', 'partially_delivered', 'delivered', 'returned', 'cancelled'] as const;
const PAGE_SIZE = 20;

function isOverSLA(dateStr: string): boolean {
    return Date.now() - new Date(dateStr).getTime() > 2 * 60 * 60 * 1000;
}

function formatINR(v: number) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(v);
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function VendorOrdersPage() {
    const searchParams = useSearchParams();
    const router = useRouter();

    // Read initial status from URL (e.g., ?status=pending from dashboard)
    const initialStatus = searchParams.get('status') || 'all';

    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<string>(initialStatus);
    const [orders, setOrders] = useState<VendorOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [paymentStatusFilter, setPaymentStatusFilter] = useState('');

    // Cursors stack for "back" pagination
    const [cursorStack, setCursorStack] = useState<string[]>([]);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchOrders = useCallback((opts: { tab: string; q: string; cur?: string | null; silent?: boolean; from?: string; to?: string; payment?: string }) => {
        if (!opts.silent) setLoading(true);
        const url = new URL('/api/v1/vendor/orders', window.location.origin);
        url.searchParams.set('limit', String(PAGE_SIZE));
        if (opts.tab !== 'all') url.searchParams.set('status', opts.tab);
        if (opts.q.trim()) url.searchParams.set('search', opts.q.trim());
        if (opts.cur) url.searchParams.set('cursor', opts.cur);
        if (opts.from) url.searchParams.set('dateFrom', opts.from);
        if (opts.to) url.searchParams.set('dateTo', opts.to);
        if (opts.payment) url.searchParams.set('paymentStatus', opts.payment);

        fetch(url.toString())
            .then(res => res.json())
            .then(json => {
                if (json.success) {
                    setOrders(json.data.orders);
                    setCursor(json.data.nextCursor);
                    setHasMore(json.data.hasMore);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    // Re-fetch when tab changes (immediate)
    useEffect(() => {
        setCursorStack([]);
        fetchOrders({ tab: activeTab, q: searchQuery, from: dateFrom, to: dateTo, payment: paymentStatusFilter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // Debounce search
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setCursorStack([]);
            fetchOrders({ tab: activeTab, q: searchQuery, from: dateFrom, to: dateTo, payment: paymentStatusFilter });
        }, 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery]);

    // Re-fetch when date/payment filters change
    useEffect(() => {
        setCursorStack([]);
        fetchOrders({ tab: activeTab, q: searchQuery, from: dateFrom, to: dateTo, payment: paymentStatusFilter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateFrom, dateTo, paymentStatusFilter]);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        setSearchQuery('');
        // Sync URL
        const params = new URLSearchParams(searchParams.toString());
        if (tab === 'all') params.delete('status');
        else params.set('status', tab);
        router.replace(`/vendor/orders?${params.toString()}`, { scroll: false });
    };

    const handleNextPage = () => {
        if (!cursor) return;
        setCursorStack(prev => [...prev, orders[0]?.id ?? '']);
        fetchOrders({ tab: activeTab, q: searchQuery, cur: cursor, from: dateFrom, to: dateTo, payment: paymentStatusFilter });
    };

    const handlePrevPage = () => {
        const stack = [...cursorStack];
        stack.pop();
        setCursorStack(stack);
        fetchOrders({ tab: activeTab, q: searchQuery, cur: stack[stack.length - 1] ?? null, from: dateFrom, to: dateTo, payment: paymentStatusFilter });
    };

    const updateOrderStatus = async (orderId: string, newStatus: string) => {
        const prev = orders.find(o => o.id === orderId)?.status;
        if (!prev || prev === newStatus) return;
        setBusyId(orderId);
        setOrders(os => os.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        try {
            const res = await fetch(`/api/v1/vendor/orders/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus, force: true }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error?.message || json.message || 'Failed to update status');
            toast.success(`Order set to ${STATUS_LABELS[newStatus] || newStatus.replace(/_/g, ' ')}`);
        } catch (err: unknown) {
            setOrders(os => os.map(o => o.id === orderId ? { ...o, status: prev } : o));
            toast.error(err instanceof Error ? err.message : 'Failed to update status');
        } finally {
            setBusyId(null);
        }
    };

    const isFirstPage = cursorStack.length === 0;
    const today = new Date().toISOString().slice(0, 10);
    const hasActiveFilters = dateFrom || dateTo || paymentStatusFilter;

    const clearFilters = () => {
        setDateFrom('');
        setDateTo('');
        setPaymentStatusFilter('');
    };

    const exportCsv = () => {
        if (orders.length === 0) return;
        const rows = [
            ['Order Number', 'Customer', 'Business', 'Items', 'Amount (₹)', 'Date', 'Payment Status', 'Order Status'],
            ...orders.map(o => [
                o.orderNumber,
                o.user.fullName,
                o.user.businessName ?? '',
                String(o._count?.items ?? ''),
                String(Number(o.totalAmount).toFixed(2)),
                new Date(o.createdAt).toLocaleDateString('en-IN'),
                o.paymentStatus,
                o.status,
            ]),
        ];
        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orders-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-5 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[24px] font-bold text-[#181725]">Orders</h1>
                    <p className="text-[12px] text-[#AEAEAE]">Manage and fulfil customer orders</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative w-full max-w-[260px]">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#AEAEAE]" size={15} />
                        <input
                            type="text"
                            placeholder="Search order / customer..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-[40px] w-full bg-white border border-[#EEEEEE] rounded-[10px] pl-10 pr-4 text-[13px] outline-none placeholder:text-[#AEAEAE] focus:border-[#299E60]/40 shadow-sm"
                        />
                    </div>
                    <button
                        onClick={exportCsv}
                        disabled={orders.length === 0}
                        title="Export current view as CSV"
                        className="h-[40px] px-3 rounded-[10px] bg-white border border-[#EEEEEE] text-[#7C7C7C] hover:bg-[#F5F5F5] disabled:opacity-50 flex items-center gap-1.5 text-[12px] font-semibold shadow-sm shrink-0"
                    >
                        <Download size={14} />
                        Export
                    </button>
                </div>
            </div>

            {/* Status Tabs */}
            <div className="flex items-center gap-2 flex-wrap">
                {STATUS_TABS.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => handleTabChange(tab)}
                        className={cn(
                            'px-4 py-2 rounded-[10px] text-[13px] font-bold capitalize transition-all',
                            activeTab === tab
                                ? 'bg-[#299E60] text-white shadow-sm shadow-[#299E60]/30'
                                : 'bg-white text-[#7C7C7C] border border-[#EEEEEE] hover:border-[#299E60]/30'
                        )}
                    >
                        {tab.replace(/_/g, ' ')}
                    </button>
                ))}
            </div>

            {/* Filter controls */}
            <div className="flex items-center gap-3 flex-wrap">
                <input
                    type="date"
                    value={dateFrom}
                    max={today}
                    onChange={e => setDateFrom(e.target.value)}
                    title="From date"
                    className="h-[36px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] text-[#181725] outline-none focus:border-[#299E60]/40 bg-white shadow-sm"
                />
                <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    max={today}
                    onChange={e => setDateTo(e.target.value)}
                    title="To date"
                    className="h-[36px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] text-[#181725] outline-none focus:border-[#299E60]/40 bg-white shadow-sm"
                />
                <select
                    value={paymentStatusFilter}
                    onChange={e => setPaymentStatusFilter(e.target.value)}
                    className="h-[36px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] text-[#7C7C7C] outline-none focus:border-[#299E60]/40 bg-white shadow-sm"
                >
                    <option value="">All Payments</option>
                    <option value="paid">Paid</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partial</option>
                    <option value="refunded">Refunded</option>
                </select>
                {hasActiveFilters && (
                    <button
                        onClick={clearFilters}
                        className="h-[36px] px-3 rounded-[10px] border border-[#EEEEEE] bg-white text-[12px] font-bold text-[#7C7C7C] hover:bg-[#F5F5F5] flex items-center gap-1.5 transition-all"
                    >
                        <X size={12} />
                        Clear
                    </button>
                )}
            </div>

            {/* Table — desktop */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="animate-spin text-[#299E60]" size={28} />
                    </div>
                ) : (
                    <>
                    <div className="md:hidden divide-y divide-[#F5F5F5] p-3 space-y-3">
                        {orders.length === 0 ? (
                            <p className="py-12 text-center text-[14px] text-[#AEAEAE]">
                                {searchQuery ? `No orders matching "${searchQuery}"` : `No ${activeTab === 'all' ? '' : activeTab + ' '}orders`}
                            </p>
                        ) : orders.map((order) => (
                            <Link
                                key={order.id}
                                href={`/vendor/orders/${order.id}`}
                                className="block bg-[#FAFAFA] rounded-[12px] border border-[#EEEEEE] p-4 space-y-2"
                            >
                                <div className="flex justify-between items-start gap-2">
                                    <p className="text-[14px] font-bold text-[#181725]">{order.orderNumber}</p>
                                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-[6px] uppercase', STATUS_STYLE[order.status] || 'bg-gray-100')}>
                                        {STATUS_LABELS[order.status] ?? order.status}
                                    </span>
                                </div>
                                <p className="text-[12px] text-[#7C7C7C]">{order.user.fullName}</p>
                                <div className="flex justify-between text-[13px] font-bold">
                                    <span className="text-[#AEAEAE]">{new Date(order.createdAt).toLocaleDateString('en-IN')}</span>
                                    <span>{formatINR(Number(order.totalAmount))}</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE]">
                                    <th className="px-5 py-3 text-left text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Order</th>
                                    <th className="px-5 py-3 text-left text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Customer</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Items</th>
                                    <th className="px-5 py-3 text-right text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Amount</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Date</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Payment</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Status</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F5F5F5]">
                                {orders.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-16 text-center text-[14px] text-[#AEAEAE]">
                                            {searchQuery ? `No orders matching "${searchQuery}"` : `No ${activeTab === 'all' ? '' : activeTab + ' '}orders`}
                                        </td>
                                    </tr>
                                ) : orders.map((order) => {
                                    const overSLA = order.status === 'pending' && isOverSLA(order.createdAt);
                                    return (
                                        <tr
                                            key={order.id}
                                            className={cn(
                                                'hover:bg-[#FAFAFA] transition-colors',
                                                overSLA && 'bg-[#FFF9F0]'
                                            )}
                                        >
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2">
                                                    {overSLA && (
                                                        <AlertTriangle size={13} className="text-[#E74C3C] shrink-0" />
                                                    )}
                                                    <Link
                                                        href={`/vendor/orders/${order.id}`}
                                                        className="text-[13px] font-bold text-[#181725] hover:text-[#299E60] transition-colors"
                                                    >
                                                        {order.orderNumber}
                                                    </Link>
                                                </div>
                                                {overSLA && (
                                                    <p className="text-[10px] text-[#E74C3C] font-bold mt-0.5">Overdue — needs action</p>
                                                )}
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="text-[13px] font-bold text-[#181725]">{order.user.fullName}</p>
                                                {order.user.businessName && (
                                                    <p className="text-[11px] text-[#AEAEAE]">{order.user.businessName}</p>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-center text-[12px] text-[#AEAEAE] font-medium">
                                                {order._count?.items ?? '—'}
                                            </td>
                                            <td className="px-5 py-4 text-right text-[13px] font-bold text-[#181725]">
                                                {formatINR(Number(order.totalAmount))}
                                            </td>
                                            <td className="px-5 py-4 text-center text-[12px] text-[#AEAEAE]">
                                                {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <span className={cn(
                                                    'text-[11px] font-bold px-2.5 py-1 rounded-[6px] uppercase',
                                                    PAYMENT_STYLE[order.paymentStatus] || 'bg-gray-100 text-gray-500'
                                                )}>
                                                    {order.paymentStatus}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <div className="flex justify-center items-center">
                                                    <div className="relative inline-block">
                                                        <select
                                                            value={order.status}
                                                            disabled={busyId === order.id}
                                                            onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                                                            className={cn(
                                                                "cursor-pointer rounded-[8px] text-[11px] font-black uppercase tracking-wider pl-3.5 pr-8 py-2 outline-none border border-transparent appearance-none disabled:opacity-50 transition-all shadow-sm",
                                                                STATUS_STYLE[order.status] || 'bg-gray-100 text-gray-700 border-gray-200'
                                                            )}
                                                        >
                                                            {!STATUS_OPTIONS.includes(order.status) && (
                                                                <option value={order.status} disabled className="bg-white text-gray-800 capitalize">
                                                                    {STATUS_LABELS[order.status] || order.status.replace(/_/g, ' ')}
                                                                </option>
                                                            )}
                                                            {STATUS_OPTIONS.map((s) => (
                                                                <option key={s} value={s} className="bg-white text-gray-800 capitalize">
                                                                    {STATUS_LABELS[s] || s.replace(/_/g, ' ')}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                                                    </div>
                                                    {busyId === order.id && (
                                                        <Loader2 size={13} className="animate-spin text-[#299E60] ml-1.5 shrink-0" />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <div className="flex justify-center">
                                                    <Link
                                                        href={`/vendor/orders/${order.id}`}
                                                        className="h-[34px] px-3.5 bg-[#EEF8F1] border border-[#299E60]/10 hover:bg-[#D1FAE5] text-[#299E60] text-[12px] font-bold rounded-[8px] transition-all flex items-center justify-center gap-1 shadow-sm active:scale-97 whitespace-nowrap"
                                                    >
                                                        <Eye size={13} />
                                                        <span>View Details</span>
                                                        <ArrowUpRight size={11} className="opacity-65" />
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    </>
                )}

                {/* Pagination */}
                {!loading && (orders.length > 0 || !isFirstPage) && (
                    <div className="px-5 py-3 border-t border-[#F5F5F5] flex items-center justify-between">
                        <p className="text-[12px] text-[#AEAEAE]">
                            Showing {orders.length} order{orders.length !== 1 ? 's' : ''}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handlePrevPage}
                                disabled={isFirstPage}
                                className="h-8 w-8 rounded-[8px] border border-[#EEEEEE] flex items-center justify-center text-[#7C7C7C] hover:bg-[#F5F5F5] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronLeft size={15} />
                            </button>
                            <button
                                onClick={handleNextPage}
                                disabled={!hasMore}
                                className="h-8 w-8 rounded-[8px] border border-[#EEEEEE] flex items-center justify-center text-[#7C7C7C] hover:bg-[#F5F5F5] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronRight size={15} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
