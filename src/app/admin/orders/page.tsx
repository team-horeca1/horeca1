'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
    Search, 
    Loader2, 
    ShoppingBag, 
    Clock, 
    CheckCircle2, 
    IndianRupee, 
    Eye, 
    ChevronDown,
    Calendar,
    ArrowUpRight,
    ShoppingBasket
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AdminOrder {
    id: string;
    orderNumber: string;
    status: string;
    subtotal: number;
    totalAmount: number;
    paymentStatus: string;
    createdAt: string;
    vendor: { id: string; businessName: string };
    user: { id: string; fullName: string; email: string };
    items: { id: string; productName: string; quantity: number; unitPrice: number; totalPrice: number }[];
}

const STATUS_STYLE: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700 border-gray-200',
    delivered: 'bg-[#DCFCE7] text-[#16A34A] border-[#BBF7D0]',
    confirmed: 'bg-blue-50 text-blue-700 border-blue-100',
    processing: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    pending: 'bg-[#FFF8EB] text-[#D97706] border-[#FEF3C7]',
    ready_for_dispatch: 'bg-cyan-50 text-cyan-700 border-cyan-100',
    shipped: 'bg-purple-50 text-purple-700 border-purple-100',
    partially_delivered: 'bg-orange-50 text-orange-700 border-orange-100',
    returned: 'bg-rose-50 text-rose-700 border-rose-100',
    cancelled: 'bg-[#FDF2F2] text-[#EF4444] border-[#FEE2E2]',
};

const STATUS_OPTIONS = [
    'pending', 'confirmed', 'processing', 'ready_for_dispatch',
    'shipped', 'partially_delivered', 'delivered', 'returned', 'cancelled',
];

export default function OrdersPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [orders, setOrders] = useState<AdminOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const updateOrderStatus = async (orderId: string, newStatus: string) => {
        const prev = orders.find(o => o.id === orderId)?.status;
        if (!prev || prev === newStatus) return;
        setBusyId(orderId);
        setOrders(os => os.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        try {
            const res = await fetch(`/api/v1/admin/orders/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error?.message || json.message || 'Failed to update status');
            toast.success(`Order set to ${newStatus.replace(/_/g, ' ')}`);
        } catch (e) {
            setOrders(os => os.map(o => o.id === orderId ? { ...o, status: prev } : o));
            toast.error(e instanceof Error ? e.message : 'Failed to update status');
        } finally {
            setBusyId(null);
        }
    };

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => {
            setLoading(true);
            const url = new URL('/api/v1/admin/orders', window.location.origin);
            url.searchParams.set('limit', '50');
            if (searchQuery.trim()) url.searchParams.set('q', searchQuery.trim());
            fetch(url.toString())
                .then(res => res.json())
                .then(json => { if (!cancelled && json.success) setOrders(json.data.orders); })
                .catch(console.error)
                .finally(() => { if (!cancelled) setLoading(false); });
        }, searchQuery ? 300 : 0);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [searchQuery]);

    // Summary calculations
    const totalOrdersCount = orders.length;
    const pendingOrdersCount = orders.filter(o => o.status === 'pending' || o.status === 'confirmed').length;
    const deliveredCount = orders.filter(o => o.status === 'delivered').length;
    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

    return (
        <div className="space-y-5 lg:space-y-8">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-divider pb-4">
                <div>
                    <h1 className="text-[clamp(1.25rem,4vw,1.875rem)] font-semibold text-[#111827] text-balance mb-1">Orders Registry</h1>
                    <p className="text-[#667085] text-[13px] lg:text-[14px] font-medium text-pretty">Monitor purchase requests, shipment status, and order details</p>
                </div>

                <div className="relative w-full md:w-[260px]">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={16} />
                    <input
                        type="text"
                        placeholder="Search Order Number..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-12 w-full bg-white border border-divider rounded-[12px] pl-10 pr-4 text-[13px] outline-none placeholder:text-[#9CA3AF] font-medium focus:border-primary"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
                {/* Stat 1: Total Orders */}
                <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[12px] bg-[#F8E8EC] flex items-center justify-center text-[#6B1D2E]">
                        <ShoppingBag size={22} />
                    </div>
                    <div>
                        <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">Total POs</span>
                        <span className="text-[22px] font-black text-[#1F2937] leading-none mt-1 inline-block">{totalOrdersCount}</span>
                    </div>
                </div>

                {/* Stat 2: Pending Processing */}
                <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[12px] bg-[#FFF8EB] flex items-center justify-center text-[#D97706]">
                        <Clock size={22} />
                    </div>
                    <div>
                        <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">Pending Queue</span>
                        <span className="text-[22px] font-black text-[#1F2937] leading-none mt-1 inline-block">{pendingOrdersCount}</span>
                    </div>
                </div>

                {/* Stat 3: Delivered Orders */}
                <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-[12px] bg-[#DCFCE7] flex items-center justify-center text-[#16A34A]">
                        <CheckCircle2 size={22} />
                    </div>
                    <div>
                        <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">Delivered</span>
                        <span className="text-[22px] font-black text-[#1F2937] leading-none mt-1 inline-block">{deliveredCount}</span>
                    </div>
                </div>

                {/* Stat 4: Revenue Value */}
                <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[12px] bg-[#FDF2F2] flex items-center justify-center text-[#EF4444]">
                        <IndianRupee size={22} />
                    </div>
                    <div>
                        <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">Total Value</span>
                        <span className="text-[20px] font-black text-[#1F2937] leading-none mt-1.5 inline-block">
                            ₹{totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                    </div>
                </div>
            </div>

            {/* Orders Table Container */}
            <div className="bg-white rounded-[16px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-[#EEEEEE] flex items-center justify-between">
                    <h3 className="text-[16px] font-extrabold text-[#111827] flex items-center gap-2">
                        <ShoppingBasket size={18} className="text-primary" />
                        All Orders
                    </h3>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                        <Loader2 className="animate-spin text-primary" size={36} />
                        <span className="text-[13px] font-bold text-[#6B7280]">Loading orders registry...</span>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="p-20 text-center bg-white">
                        <ShoppingBag size={40} className="text-[#D1D5DB] mx-auto mb-3" />
                        <h4 className="text-[15px] font-bold text-[#374151]">No orders found</h4>
                        <p className="text-[13px] text-[#9CA3AF] mt-1">
                            {searchQuery ? `No orders matched search query "${searchQuery}"` : 'No orders recorded yet.'}
                        </p>
                    </div>
                ) : (
                <>
                <div className="md:hidden divide-y divide-divider">
                    {orders.map((order) => (
                        <Link
                            key={order.id}
                            href={`/admin/orders/${order.id}`}
                            className="block p-4 active:bg-ivory"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[14px] font-bold text-[#111827] tabular-nums">{order.orderNumber}</p>
                                    <p className="text-[13px] text-[#667085] truncate mt-0.5">{order.user.fullName}</p>
                                    <p className="text-[12px] text-[#6B7280] truncate">{order.vendor.businessName}</p>
                                </div>
                                <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase', STATUS_STYLE[order.status] || 'bg-gray-100 text-gray-700')}>
                                    {order.status.replace(/_/g, ' ')}
                                </span>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                                <p className="text-[14px] font-bold text-[#111827] tabular-nums">₹{Number(order.totalAmount).toLocaleString('en-IN')}</p>
                                <p className="text-[12px] text-[#6B7280]">{new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                            </div>
                        </Link>
                    ))}
                </div>
                <div className="hidden md:block overflow-x-auto w-full">
                    <table className="w-full border-collapse text-left text-[13px] min-w-[1000px]">
                        <thead>
                            <tr className="bg-[#F9FAFB] border-b border-[#EEEEEE] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                                <th className="px-6 py-4 font-bold text-center w-[160px]">Order ID</th>
                                <th className="px-6 py-4 font-bold min-w-[200px]">Customer</th>
                                <th className="px-6 py-4 font-bold min-w-[200px]">Vendor Partner</th>
                                <th className="px-6 py-4 font-bold w-[120px] text-right">Total Amount</th>
                                <th className="px-6 py-4 font-bold w-[150px] text-center">Date Created</th>
                                <th className="px-6 py-4 font-bold w-[180px] text-center">Status</th>
                                <th className="px-6 py-4 font-bold text-right pr-8 w-[180px]">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F3F4F6]">
                            {orders.map((order) => (
                                <tr key={order.id} className="group hover:bg-[#F9FAFB]/50 transition-colors">
                                    {/* Order ID */}
                                    <td className="px-6 py-4 text-center font-bold text-[#111827] text-[13px] font-mono">
                                        {order.orderNumber}
                                    </td>

                                    {/* Customer */}
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-[13px] font-bold text-[#374151]">{order.user.fullName}</span>
                                            <span className="text-[11px] text-[#9CA3AF] font-medium max-w-[180px] truncate">{order.user.email}</span>
                                        </div>
                                    </td>

                                    {/* Vendor Partner */}
                                    <td className="px-6 py-4">
                                        <span className="text-[13px] font-semibold text-[#374151]">{order.vendor.businessName}</span>
                                    </td>

                                    {/* Total */}
                                    <td className="px-6 py-4 text-right font-black text-[#111827] text-[14px]">
                                        ₹{Number(order.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                                    </td>

                                    {/* Date */}
                                    <td className="px-6 py-4 text-center">
                                        <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#4B5563]">
                                            <Calendar size={13} className="text-[#9CA3AF]" />
                                            <span>
                                                {new Date(order.createdAt).toLocaleDateString('en-IN', { 
                                                    day: '2-digit', 
                                                    month: 'short', 
                                                    year: 'numeric' 
                                                })}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Status Inline Select Pill */}
                                    <td className="px-6 py-4 text-center">
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
                                                            {order.status.replace(/_/g, ' ')}
                                                        </option>
                                                    )}
                                                    {STATUS_OPTIONS.map((s) => (
                                                        <option key={s} value={s} className="bg-white text-gray-800 capitalize">
                                                            {s.replace(/_/g, ' ')}
                                                        </option>
                                                    ))}
                                                </select>
                                                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                                            </div>
                                            {busyId === order.id && (
                                                <Loader2 size={13} className="animate-spin text-primary ml-1.5 shrink-0" />
                                            )}
                                        </div>
                                    </td>

                                    {/* Actions */}
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end pr-2">
                                            <Link 
                                                href={`/admin/orders/${order.id}`} 
                                                className="min-h-12 px-3.5 bg-primary-light border border-primary/20 hover:bg-primary hover:text-white text-primary text-[12px] font-semibold rounded-[10px] flex items-center justify-center gap-1 whitespace-nowrap"
                                            >
                                                <Eye size={13} />
                                                <span>View Details</span>
                                                <ArrowUpRight size={11} className="opacity-65" />
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                </>
                )}
            </div>
        </div>
    );
}
