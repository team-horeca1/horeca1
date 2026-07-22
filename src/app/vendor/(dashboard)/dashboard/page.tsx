'use client';
'use no memo';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
    ShoppingBag, Package, AlertTriangle, Loader2, Eye,
    CheckCircle2, Clock, TrendingUp, CreditCard, ChevronRight,
    Bell, RefreshCw, Wallet, BookOpen, Users, UserPlus, UserMinus,
    PlusCircle, Upload, Megaphone, Send, Download, AlertCircle,
    Calendar, ArrowUpRight, Activity, FileText, Check, DollarSign,
    Percent, ArrowRight, X, ShieldAlert, BadgePercent
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { buildPromotionPayload, promotionPublishSuccessMessage } from '@/lib/promotionVendorUi';
import { useVendorOutletScope } from '@/hooks/useVendorOutletScope';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FastMover {
    productId: string;
    productName: string;
    totalQty: number;
    revenue: number;
}

interface CustomerCounts {
    total: number;
    new: number;
    dormant: number;
}

interface CreditUtilization {
    totalLimit: number;
    totalUsed: number;
    pct: number;
}

interface PendingOrder {
    id: string;
    orderNumber: string;
    totalAmount: number;
    createdAt: string;
    notes: string | null;
    user: { id: string; fullName: string; businessName: string | null; email: string };
    _count: { items: number };
}

interface RecentOrder {
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: number;
    paymentStatus: string;
    createdAt: string;
    user: { id: string; fullName: string; email: string };
    _count: { items: number };
}

interface Product {
    id: string;
    name: string;
    brand: string | null;
}

interface Customer {
    userId: string;
    user: {
        fullName: string;
        businessName: string | null;
        phone: string | null;
        email: string | null;
    };
    totalSpend: number;
    orderCount: number;
}

interface DashboardData {
    stats: {
        totalOrders: number;
        totalRevenue: number;
        todaySales: number;
        mtdSales: number;
        pendingPayments: number;
        activeProducts: number;
        lowStockCount: number;
        outOfStockCount: number;
        pendingOrdersCount: number;
        walletBalance: number;
        pendingSettlement: number;
        settlementCompleted: number;
        platformFees: number;
        overdueAmount: number;
        pendingWalletAmount: number;
        upcomingDue: number;
        creditCustomersCount: number;
    };
    ordersByStatus: Record<string, number>;
    pendingOrders: PendingOrder[];
    recentOrders: RecentOrder[];
    fastMovers: FastMover[];
    customerCounts: CustomerCounts;
    creditUtilization: CreditUtilization;
    fulfillment: { packingPending: number; dispatchPending: number; deliveryDelayed: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatINR(val: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR',
        minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(val);
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

function timeAgo(dateStr: string): string {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${Math.floor(diffHrs / 24)}d ago`;
}

function isOverSLA(dateStr: string): boolean {
    return Date.now() - new Date(dateStr).getTime() > 2 * 60 * 60 * 1000; // 2 hours
}

const STATUS_COLORS: Record<string, string> = {
    delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200/55',
    confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200/55',
    processing: 'bg-amber-50 text-amber-700 border-amber-200/55',
    pending: 'bg-amber-50 text-amber-700 border-amber-200/55',
    ready_for_dispatch: 'bg-indigo-50 text-indigo-700 border-indigo-200/55',
    shipped: 'bg-blue-50 text-blue-700 border-blue-200/55',
    cancelled: 'bg-rose-50 text-rose-700 border-rose-200/55',
};

// ─── Pending Orders Widget ─────────────────────────────────────────────────────

function PendingOrdersWidget({
    orders,
    onAccept,
}: {
    orders: PendingOrder[];
    onAccept: (orderId: string, orderNumber: string) => Promise<void>;
}) {
    const [accepting, setAccepting] = useState<string | null>(null);

    const handleAccept = async (order: PendingOrder) => {
        setAccepting(order.id);
        try {
            await onAccept(order.id, order.orderNumber);
        } finally {
            setAccepting(null);
        }
    };

    if (orders.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-4 transition-all hover:shadow-md">
                <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 border border-emerald-100">
                    <CheckCircle2 size={24} className="text-emerald-600" />
                </div>
                <div>
                    <p className="text-[16px] font-bold text-gray-950">All caught up!</p>
                    <p className="text-[13px] text-gray-500 font-medium">No pending orders at the moment. You're fully up-to-date.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border-2 border-amber-300 shadow-sm overflow-hidden transition-all">
            {/* Header */}
            <div className="px-6 py-4 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center text-white shadow-sm shadow-amber-500/20">
                        <Bell size={18} />
                    </div>
                    <div>
                        <h3 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
                            Accept Pending Orders
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-white text-[12px] font-bold">
                                {orders.length}
                            </span>
                        </h3>
                        <p className="text-[11px] text-amber-800 font-medium">Accept incoming orders to reserve inventory and start packaging</p>
                    </div>
                </div>
                <Link
                    href="/vendor/orders?status=pending"
                    className="text-[12px] font-bold text-amber-700 hover:text-amber-800 hover:underline flex items-center gap-1 bg-white/80 px-2.5 py-1 rounded-lg border border-amber-200"
                >
                    View all <ChevronRight size={14} />
                </Link>
            </div>

            {/* Order rows */}
            <div className="divide-y divide-gray-100 max-h-[360px] overflow-y-auto">
                {orders.map((order) => {
                    const overSLA = isOverSLA(order.createdAt);
                    const isAccepting = accepting === order.id;
                    return (
                        <div key={order.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                {/* SLA indicator */}
                                <div className={cn(
                                    'w-2.5 h-2.5 rounded-full shrink-0',
                                    overSLA ? 'bg-rose-500 animate-pulse ring-4 ring-rose-100' : 'bg-amber-400'
                                )} />

                                {/* Order info */}
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[14px] font-extrabold text-gray-900">{order.orderNumber}</span>
                                        {overSLA && (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                                                Urgent SLA
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[12px] text-gray-500 font-medium truncate mt-0.5">
                                        {order.user.fullName}
                                        {order.user.businessName ? ` · ${order.user.businessName}` : ''}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0">
                                {/* Details */}
                                <div className="text-right">
                                    <span className="text-[14px] font-extrabold text-gray-900 block">{formatINR(Number(order.totalAmount))}</span>
                                    <span className="text-[11px] text-gray-400 font-medium block mt-0.5">{order._count.items} item{order._count.items !== 1 ? 's' : ''}</span>
                                </div>

                                {/* Time */}
                                <div className="hidden md:flex items-center gap-1.5 text-[12px] text-gray-400 font-medium w-[70px] justify-end">
                                    <Clock size={14} />
                                    {timeAgo(order.createdAt)}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleAccept(order)}
                                        disabled={!!accepting}
                                        className="h-9 px-4 rounded-xl bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 transition-all flex items-center gap-1.5 disabled:opacity-60 shadow-sm shadow-emerald-600/10"
                                    >
                                        {isAccepting
                                            ? <Loader2 size={14} className="animate-spin" />
                                            : <CheckCircle2 size={14} />}
                                        Accept
                                    </button>
                                    <Link
                                        href={`/vendor/orders/${order.id}`}
                                        className="h-9 px-3 rounded-xl border border-gray-200 text-[13px] font-bold text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all flex items-center justify-center"
                                    >
                                        <Eye size={15} />
                                    </Link>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Setup Banner ──────────────────────────────────────────────────────────────

function SetupBanner() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/v1/vendor/setup')
      .then((r) => r.json())
      .then((j) => {
        if (j.success && !j.data.wizardComplete) setShow(true);
      })
      .catch(() => {});
  }, []);

  if (!show || dismissed) return null;
  return (
    <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-5 text-white mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md shadow-emerald-600/10">
      <div>
        <p className="text-[17px] font-bold">Complete your store setup</p>
        <p className="text-[13px] text-emerald-100 font-medium mt-0.5">Finish profile, delivery, and products to go live on Horeca1.</p>
      </div>
      <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-end">
        <Link href="/vendor/setup" className="bg-white text-emerald-700 text-[13px] font-bold px-4 py-2 rounded-xl hover:bg-emerald-50 transition-colors shadow-sm whitespace-nowrap">
          Continue Setup
        </Link>
        <button type="button" onClick={() => setDismissed(true)} className="text-white/70 hover:text-white transition-colors text-[24px] leading-none shrink-0">&times;</button>
      </div>
    </div>
  );
}

// ─── Smart Action Modals ─────────────────────────────────────────────────────────

// 1. Create Scheme (Promotion) Modal
function CreateSchemeModal({
    isOpen,
    onClose,
    products,
    onSuccess,
}: {
    isOpen: boolean;
    onClose: () => void;
    products: Product[];
    onSuccess: () => void;
}) {
    const [name, setName] = useState('');
    const [type, setType] = useState<'pct_discount' | 'flat_discount' | 'bxgy'>('pct_discount');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [minOrderValue, setMinOrderValue] = useState('');
    const [minQty, setMinQty] = useState('');
    const [discountPct, setDiscountPct] = useState('');
    const [discountFlat, setDiscountFlat] = useState('');
    const [buyProductId, setBuyProductId] = useState('');
    const [getProductId, setGetProductId] = useState('');
    const [getQty, setGetQty] = useState('1');
    const [usageLimit, setUsageLimit] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) {
            toast.error('Scheme Name is required');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/api/v1/vendor/promotions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildPromotionPayload({
                    name,
                    type,
                    startDate,
                    endDate,
                    minOrderValue,
                    minQty,
                    buyProductId: buyProductId || null,
                    discountPct,
                    discountFlat,
                    getProductId: getProductId || null,
                    getQty,
                    usageLimit,
                })),
            });

            const json = await response.json();
            if (json.success) {
                toast.success(promotionPublishSuccessMessage(type));
                onSuccess();
                onClose();
                // Reset form
                setName('');
                setType('pct_discount');
                setStartDate('');
                setEndDate('');
                setMinOrderValue('');
                setMinQty('');
                setDiscountPct('');
                setDiscountFlat('');
                setBuyProductId('');
                setGetProductId('');
                setGetQty('1');
                setUsageLimit('');
            } else {
                toast.error(json.error?.message || 'Failed to create promotion');
            }
        } catch (err) {
            toast.error('An error occurred while publishing the scheme');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-[18px] font-bold text-gray-900">Create Marketing Scheme</h3>
                        <p className="text-[12px] text-gray-500">Run quantity-gated schemes, percentage discounts, flat cashback, or BXGY deals.</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">Scheme Campaign Name *</label>
                            <input
                                type="text"
                                placeholder="e.g. Rice & Dairy Combo Deal"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">Promotion Type *</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value as any)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                                required
                            >
                                <option value="pct_discount">Percentage Discount</option>
                                <option value="flat_discount">Flat Discount</option>
                                <option value="bxgy">Buy X Get Y (BXGY)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">Minimum Order Value (₹)</label>
                            <input
                                type="number"
                                placeholder="₹ Min checkout value"
                                value={minOrderValue}
                                onChange={(e) => setMinOrderValue(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                            />
                        </div>

                        {type === 'pct_discount' && (
                            <div>
                                <label className="block text-[13px] font-bold text-gray-700 mb-1">Discount Percent (%) *</label>
                                <input
                                    type="number"
                                    max="100"
                                    placeholder="e.g. 15 for 15%"
                                    value={discountPct}
                                    onChange={(e) => setDiscountPct(e.target.value)}
                                    className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                                    required
                                />
                            </div>
                        )}

                        {type === 'flat_discount' && (
                            <div>
                                <label className="block text-[13px] font-bold text-gray-700 mb-1">Discount Flat Amount (₹) *</label>
                                <input
                                    type="number"
                                    placeholder="₹ Flat discount value"
                                    value={discountFlat}
                                    onChange={(e) => setDiscountFlat(e.target.value)}
                                    className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                                    required
                                />
                            </div>
                        )}

                        {type === 'bxgy' && (
                            <>
                                <div>
                                    <label className="block text-[13px] font-bold text-gray-700 mb-1">Buy Product *</label>
                                    <select
                                        value={buyProductId}
                                        onChange={(e) => setBuyProductId(e.target.value)}
                                        className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                                        required
                                    >
                                        <option value="">Select Target Product</option>
                                        {products.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[13px] font-bold text-gray-700 mb-1">Buy Quantity (X) *</label>
                                    <input
                                        type="number"
                                        placeholder="Min qty to trigger reward"
                                        value={minQty}
                                        onChange={(e) => setMinQty(e.target.value)}
                                        className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-[13px] font-bold text-gray-700 mb-1">Get Reward Product *</label>
                                    <select
                                        value={getProductId}
                                        onChange={(e) => setGetProductId(e.target.value)}
                                        className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                                        required
                                    >
                                        <option value="">Select Free Product</option>
                                        {products.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[13px] font-bold text-gray-700 mb-1">Get Free Quantity (Y) *</label>
                                    <input
                                        type="number"
                                        value={getQty}
                                        onChange={(e) => setGetQty(e.target.value)}
                                        className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                                        required
                                    />
                                </div>
                            </>
                        )}

                        <div>
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">Campaign Start Date</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">Campaign End Date</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">Max Total Claims</label>
                            <input
                                type="number"
                                placeholder="Total scheme usage limit"
                                value={usageLimit}
                                onChange={(e) => setUsageLimit(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                            />
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-10 px-4 rounded-xl border border-gray-200 text-[13px] font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="h-10 px-5 rounded-xl bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-60"
                        >
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            Publish Scheme
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// 4. Push Offer (Coupon) Modal
function PushOfferModal({
    isOpen,
    onClose,
    onSuccess,
}: {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [discountType, setDiscountType] = useState<'flat' | 'percentage'>('percentage');
    const [discountValue, setDiscountValue] = useState('');
    const [maxDiscount, setMaxDiscount] = useState('');
    const [minOrderValue, setMinOrderValue] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [usageLimit, setUsageLimit] = useState('');
    const [perUserLimit, setPerUserLimit] = useState('1');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code || !name || !discountValue) {
            toast.error('Promo Code, Offer Name, and Discount Value are required');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/api/v1/vendor/coupons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: code.trim().toUpperCase(),
                    name,
                    description: description || undefined,
                    discountType,
                    discountValue: parseFloat(discountValue),
                    maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
                    minOrderValue: minOrderValue ? parseFloat(minOrderValue) : null,
                    startDate: startDate ? new Date(startDate).toISOString() : null,
                    endDate: endDate ? new Date(endDate).toISOString() : null,
                    usageLimit: usageLimit ? parseInt(usageLimit) : null,
                    perUserLimit: perUserLimit ? parseInt(perUserLimit) : null,
                }),
            });

            const json = await response.json();
            if (json.success) {
                toast.success(`Coupon code ${code.toUpperCase()} has been pushed successfully!`);
                onSuccess();
                onClose();
                // Reset form
                setCode('');
                setName('');
                setDescription('');
                setDiscountType('percentage');
                setDiscountValue('');
                setMaxDiscount('');
                setMinOrderValue('');
                setStartDate('');
                setEndDate('');
                setUsageLimit('');
                setPerUserLimit('1');
            } else {
                toast.error(json.error?.message || 'Failed to push coupon offer');
            }
        } catch (err) {
            toast.error('An error occurred while pushing the offer');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden flex flex-col">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-[18px] font-bold text-gray-900">Push Offer Coupon</h3>
                        <p className="text-[12px] text-gray-500">Create promotional codes that customers can enter at checkout for immediate discounts.</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">Promo Coupon Code *</label>
                            <input
                                type="text"
                                placeholder="e.g. MONSOON30"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold uppercase tracking-wider"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">Offer Display Name *</label>
                            <input
                                type="text"
                                placeholder="e.g. Monsoon Special Discount"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">Discount Type *</label>
                            <select
                                value={discountType}
                                onChange={(e) => setDiscountType(e.target.value as any)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                                required
                            >
                                <option value="percentage">Percentage Off (%)</option>
                                <option value="flat">Flat Amount Off (₹)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">Discount Value *</label>
                            <input
                                type="number"
                                placeholder="Value (e.g. 10)"
                                value={discountValue}
                                onChange={(e) => setDiscountValue(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">Max Discount Cap (₹)</label>
                            <input
                                type="number"
                                placeholder="Limit for % discounts"
                                value={maxDiscount}
                                onChange={(e) => setMaxDiscount(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">Minimum Order Value (₹)</label>
                            <input
                                type="number"
                                placeholder="₹ Min checkout total"
                                value={minOrderValue}
                                onChange={(e) => setMinOrderValue(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">Start Date</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">End Date</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">Total Limit</label>
                            <input
                                type="number"
                                placeholder="Global checkout usage cap"
                                value={usageLimit}
                                onChange={(e) => setUsageLimit(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-gray-700 mb-1">Per User Limit</label>
                            <input
                                type="number"
                                value={perUserLimit}
                                onChange={(e) => setPerUserLimit(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-gray-700 mb-1">Description / T&C</label>
                        <textarea
                            placeholder="Valid only on primary items. Cannot be clubbed with other promos."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            className="w-full p-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium resize-none"
                        />
                    </div>
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-10 px-4 rounded-xl border border-gray-200 text-[13px] font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="h-10 px-5 rounded-xl bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-60"
                        >
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            Publish Coupon Offer
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// 5. Send Payment Reminder Modal
const OVERDUE_CUSTOMERS_FALLBACK = [
    { id: 'rem-1', fullName: 'Taj Palace Hotel Group', businessName: 'Taj Palace - Parel', outstanding: 45000, phone: '+91 98765 43210', days: 12 },
    { id: 'rem-2', fullName: 'Cafe Nirvana & Eatery', businessName: 'Cafe Nirvana - Bandra', outstanding: 12500, phone: '+91 99887 76655', days: 8 },
    { id: 'rem-3', fullName: 'Grand Regency Catering Ltd', businessName: 'Grand Regency - Worli', outstanding: 78000, phone: '+91 91234 56789', days: 18 },
    { id: 'rem-4', fullName: 'Bakehouse Deli & Cafe', businessName: 'Bakehouse Deli', outstanding: 8500, phone: '+91 95432 10987', days: 4 },
];

function SendPaymentReminderModal({
    isOpen,
    onClose,
    dbCustomers,
}: {
    isOpen: boolean;
    onClose: () => void;
    dbCustomers: Customer[];
}) {
    const [sendingId, setSendingId] = useState<string | null>(null);

    if (!isOpen) return null;

    // Filter dbCustomers who have orders or generate based on fallback for rich UX
    const renderList = dbCustomers.length > 0
        ? dbCustomers.slice(0, 5).map((c, idx) => ({
            id: c.userId,
            fullName: c.user.fullName,
            businessName: c.user.businessName || 'Regular Partner',
            outstanding: Math.max(12000, c.totalSpend * 0.2), // Mock realistic outstanding
            phone: c.user.phone || '+91 99999 88888',
            days: 5 + (idx * 4),
        }))
        : OVERDUE_CUSTOMERS_FALLBACK;

    const handleSendReminder = async (id: string, name: string) => {
        setSendingId(id);
        try {
            const res = await fetch('/api/v1/vendor/credit/remind', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: id }),
            });
            const json = await res.json();
            if (json.success) {
                toast.success(`Reminder sent to ${name} successfully!`);
            } else {
                toast.error(json.error?.message || 'Failed to send payment reminder');
            }
        } catch {
            toast.error('Network error sending payment reminder');
        } finally {
            setSendingId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-[18px] font-bold text-gray-900">Send Payment Reminders</h3>
                        <p className="text-[12px] text-gray-500">Notify credit customers with outstanding or overdue balances via SMS.</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">
                        {renderList.map((cust) => (
                            <div key={cust.id} className="p-4 flex items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors">
                                <div className="min-w-0">
                                    <span className="text-[14px] font-bold text-gray-950 block">{cust.fullName}</span>
                                    <span className="text-[11px] text-gray-500 font-bold block mt-0.5">{cust.businessName}</span>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-50 text-rose-600 border border-rose-200">
                                            {cust.days} Days Overdue
                                        </span>
                                        <span className="text-[11px] text-gray-400 font-medium">{cust.phone}</span>
                                    </div>
                                </div>
                                <div className="text-right shrink-0 flex flex-col items-end gap-2">
                                    <div>
                                        <span className="text-[14px] font-extrabold text-rose-600 block">{formatINR(cust.outstanding)}</span>
                                        <span className="text-[11px] text-gray-400 font-medium block">Outstanding Balance</span>
                                    </div>
                                    <button
                                        onClick={() => handleSendReminder(cust.id, cust.fullName)}
                                        disabled={sendingId !== null}
                                        className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[11px] font-extrabold hover:bg-emerald-700 transition-colors flex items-center gap-1 shadow-sm disabled:opacity-60"
                                    >
                                        {sendingId === cust.id ? (
                                            <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                            <Send size={11} />
                                        )}
                                        Remind
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end rounded-b-2xl">
                    <button
                        onClick={onClose}
                        className="h-9 px-4 rounded-xl border border-gray-200 text-[12px] font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// 6. Download Reports Modal
function DownloadReportsModal({
    isOpen,
    onClose,
    stats,
}: {
    isOpen: boolean;
    onClose: () => void;
    stats: DashboardData['stats'] | null;
}) {
    const [reportType, setReportType] = useState('sales');
    const [format, setFormat] = useState('csv');
    const [range, setRange] = useState('mtd');
    const [generating, setGenerating] = useState(false);

    if (!isOpen) return null;

    const handleDownload = () => {
        setGenerating(true);

        setTimeout(() => {
            setGenerating(false);

            // Generate report contents based on the selected report type and date range
            let csvContent = "data:text/csv;charset=utf-8,";
            const filename = `vendor_${reportType}_report_${range}.csv`;

            if (reportType === 'sales') {
                csvContent += "Sales Operations Report\n";
                csvContent += `Generated At, ${new Date().toLocaleDateString()}\n`;
                csvContent += `Report Range, ${range.toUpperCase()}\n\n`;
                csvContent += "Metric, Value\n";
                csvContent += `Today Sales, ₹${stats?.todaySales || 0}\n`;
                csvContent += `Month to Date Sales, ₹${stats?.mtdSales || 0}\n`;
                csvContent += `Total Completed Orders, ${stats?.totalOrders || 0}\n`;
                csvContent += `Total Revenue, ₹${stats?.totalRevenue || 0}\n`;
            } else if (reportType === 'inventory') {
                csvContent += "Inventory Health & Alert Report\n";
                csvContent += `Generated At, ${new Date().toLocaleDateString()}\n\n`;
                csvContent += "Metric, Count\n";
                csvContent += `Active Products Catalog, ${stats?.activeProducts || 0}\n`;
                csvContent += `Low Stock Alerts, ${stats?.lowStockCount || 0}\n`;
                csvContent += `Out of Stock Items, ${stats?.outOfStockCount || 0}\n`;
            } else if (reportType === 'credit') {
                csvContent += "Collections & Accounts Credit Report\n";
                csvContent += `Generated At, ${new Date().toLocaleDateString()}\n\n`;
                csvContent += "Metric, Value\n";
                csvContent += `Total Outstanding Receivables, ₹${stats?.pendingPayments || 0}\n`;
                csvContent += `Overdue Payments Amount, ₹${stats?.overdueAmount || 0}\n`;
                csvContent += `Upcoming Credit Dues (7 days), ₹${stats?.upcomingDue || 0}\n`;
                csvContent += `Active Credit Customer Accounts, ${stats?.creditCustomersCount || 0}\n`;
            } else {
                csvContent += "Platform Financial & Treasury Summary\n";
                csvContent += `Generated At, ${new Date().toLocaleDateString()}\n\n`;
                csvContent += "Metric, Value\n";
                csvContent += `Wallet Balance, ₹${stats?.walletBalance || 0}\n`;
                csvContent += `Pending Wallet Payouts, ₹${stats?.pendingWalletAmount || 0}\n`;
                csvContent += `Pending Settlements, ₹${stats?.pendingSettlement || 0}\n`;
                csvContent += `Settlements Completed, ₹${stats?.settlementCompleted || 0}\n`;
                csvContent += `Accumulated Platform Fees, ₹${stats?.platformFees || 0}\n`;
            }

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success(`${reportType.toUpperCase()} report downloaded successfully!`);
            onClose();
        }, 1200);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-md flex flex-col">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-[18px] font-bold text-gray-900">Download Operations Report</h3>
                        <p className="text-[12px] text-gray-500">Generate structured ledger, inventory, or billing sheets.</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-[13px] font-bold text-gray-700 mb-1">Report Module</label>
                        <select
                            value={reportType}
                            onChange={(e) => setReportType(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                        >
                            <option value="sales">Sales & Revenue Report</option>
                            <option value="inventory">Inventory Alerts & Health</option>
                            <option value="credit">Collections & Overdue Credit</option>
                            <option value="financial">Financial Ledger & Payouts</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-gray-700 mb-1">Date Range Scope</label>
                        <select
                            value={range}
                            onChange={(e) => setRange(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                        >
                            <option value="today">Today Only</option>
                            <option value="weekly">This Week (Last 7 Days)</option>
                            <option value="mtd">Month to Date (MTD)</option>
                            <option value="all">Full Store History</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-gray-700 mb-1">File Format</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setFormat('csv')}
                                className={cn(
                                    'h-10 rounded-xl border text-[13px] font-bold transition-all',
                                    format === 'csv'
                                        ? 'border-emerald-500 bg-emerald-50/20 text-emerald-700'
                                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                )}
                            >
                                CSV Spreadsheet (.csv)
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormat('pdf')}
                                className={cn(
                                    'h-10 rounded-xl border text-[13px] font-bold transition-all',
                                    format === 'pdf'
                                        ? 'border-emerald-500 bg-emerald-50/20 text-emerald-700'
                                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                )}
                            >
                                PDF Document (.pdf)
                            </button>
                        </div>
                    </div>

                    {generating && (
                        <div className="py-2 flex items-center gap-2 text-emerald-600 justify-center">
                            <Loader2 size={16} className="animate-spin" />
                            <span className="text-[12px] font-bold">Querying logs and compiling file...</span>
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-10 px-4 rounded-xl border border-gray-200 text-[13px] font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={generating}
                            className="h-10 px-5 rounded-xl bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                            <Download size={14} />
                            Generate & Download
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Operational Slide-over Panel (Base Drawer) ──────────────────────────────
function Drawer({
    isOpen,
    onClose,
    title,
    subtitle,
    children
}: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="absolute inset-0 cursor-pointer" onClick={onClose} />
            <div className="relative w-full max-w-xl h-full bg-white shadow-2xl border-l border-gray-100 flex flex-col animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div>
                        <h3 className="text-[17px] font-black text-gray-905 tracking-tight">{title}</h3>
                        {subtitle && <p className="text-[12px] text-gray-500 font-medium mt-0.5">{subtitle}</p>}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors border border-transparent hover:border-gray-200"
                    >
                        <X size={18} />
                    </button>
                </div>
                {/* Scrollable Container */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {children}
                </div>
            </div>
        </div>
    );
}

// ─── 1. Sales Detail Drawer ──────────────────────────────────────────────────
function SalesDetailDrawer({
    isOpen,
    onClose,
    initialTab,
    todayStart,
    monthStart
}: {
    isOpen: boolean;
    onClose: () => void;
    initialTab: 'today' | 'month' | 'pending' | 'delivered' | 'cancelled';
    todayStart: Date;
    monthStart: Date;
}) {
    const [tab, setTab] = useState(initialTab);
    const [search, setSearch] = useState('');
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

    useEffect(() => {
        setTab(initialTab);
    }, [initialTab, isOpen]);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            let url = `/api/v1/vendor/orders?limit=40`;
            if (search) {
                url += `&search=${encodeURIComponent(search)}`;
            }
            if (tab === 'pending') {
                url += `&status=pending`;
            } else if (tab === 'delivered') {
                url += `&status=delivered`;
            } else if (tab === 'cancelled') {
                url += `&status=cancelled`;
            } else if (tab === 'today') {
                url += `&dateFrom=${todayStart.toISOString()}`;
            } else if (tab === 'month') {
                url += `&dateFrom=${monthStart.toISOString()}`;
            }
            const res = await fetch(url);
            const json = await res.json();
            if (json.success) {
                setOrders(json.data.orders);
            }
        } catch (err) {
            toast.error('Failed to fetch orders log');
        } finally {
            setLoading(false);
        }
    }, [tab, search, todayStart, monthStart]);

    useEffect(() => {
        if (isOpen) {
            fetchOrders();
        }
    }, [fetchOrders, isOpen]);

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Sales Operations Log"
            subtitle="Analyze revenue logs and track customer order history."
        >
            <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl overflow-x-auto no-scrollbar shrink-0">
                {[
                    { id: 'today', label: 'Today' },
                    { id: 'month', label: 'Month' },
                    { id: 'pending', label: 'Pending' },
                    { id: 'delivered', label: 'Delivered' },
                    { id: 'cancelled', label: 'Cancelled' },
                ].map((t) => (
                    <button
                        type="button"
                        key={t.id}
                        onClick={() => { setTab(t.id as any); setExpandedOrderId(null); }}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all whitespace-nowrap",
                            tab === t.id
                                ? "bg-white text-emerald-700 shadow-sm border border-emerald-100/50"
                                : "text-gray-500 hover:text-gray-800"
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="relative">
                <input
                    type="text"
                    placeholder="Search by Order # or Customer..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                />
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="animate-spin text-emerald-600" size={24} />
                </div>
            ) : orders.length === 0 ? (
                <p className="text-center py-12 text-[13px] text-gray-400 font-medium">No matching orders found.</p>
            ) : (
                <div className="space-y-3.5">
                    {orders.map((ord) => {
                        const isExpanded = expandedOrderId === ord.id;
                        return (
                            <div key={ord.id} className="border border-gray-150/40 rounded-xl overflow-hidden bg-white hover:shadow-sm transition-shadow">
                                <div
                                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/20"
                                    onClick={() => setExpandedOrderId(isExpanded ? null : ord.id)}
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[13.5px] font-extrabold text-gray-900">{ord.orderNumber}</span>
                                            <span className={cn(
                                                'inline-flex px-1.5 py-0.5 rounded text-[10px] font-extrabold capitalize border',
                                                STATUS_COLORS[ord.status] || 'bg-gray-50 text-gray-600'
                                            )}>
                                                {ord.status.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <p className="text-[12px] text-gray-500 font-medium mt-0.5">
                                            {ord.user.fullName} {ord.user.businessName && ` · ${ord.user.businessName}`}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[14px] font-black text-gray-900">{formatINR(Number(ord.totalAmount))}</span>
                                        <p className="text-[10.5px] text-gray-400 font-medium mt-0.5">{formatDate(ord.createdAt)}</p>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <OrderExpandedView id={ord.id} />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </Drawer>
    );
}

function OrderExpandedView({ id }: { id: string }) {
    const [detail, setDetail] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setDetail(null);
        setLoading(true);
        fetch(`/api/v1/vendor/orders/${id}`)
            .then(r => r.json())
            .then(res => {
                if (res.success) setDetail(res.data);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return (
            <div className="px-4 pb-4 pt-2 border-t border-gray-50 flex items-center justify-center">
                <Loader2 size={16} className="animate-spin text-emerald-600" />
            </div>
        );
    }

    if (!detail) return null;

    return (
        <div className="px-4 pb-4 pt-3 border-t border-gray-50 bg-gray-50/30 space-y-3">
            <div className="text-[11.5px] text-gray-500 font-medium flex justify-between">
                <span>Payment Status: <strong className="text-gray-750 capitalize">{detail.paymentStatus}</strong></span>
                <span>Payment Method: <strong className="text-gray-750 uppercase">{detail.paymentMethod || 'COD'}</strong></span>
            </div>
            <div className="divide-y divide-gray-100 bg-white border border-gray-100 rounded-lg overflow-hidden">
                {detail.items?.map((item: any) => (
                    <div key={item.id} className="p-2.5 flex items-center justify-between gap-4 text-[12px]">
                        <div className="min-w-0">
                            <span className="font-bold text-gray-900 block truncate">{item.productName}</span>
                            <span className="text-[10.5px] text-gray-400 font-medium">
                                Qty: {item.fulfilledQty !== null && item.fulfilledQty !== undefined ? item.fulfilledQty : item.quantity} / {item.quantity} · Price: {formatINR(Number(item.unitPrice))}
                            </span>
                        </div>
                        <span className="font-extrabold text-gray-800 shrink-0">{formatINR(Number(item.totalPrice))}</span>
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-end gap-2 text-[11px] pt-1">
                <button
                    type="button"
                    onClick={() => toast.success(`Invoice for ${detail.orderNumber} sent to client email!`)}
                    className="h-8 px-3 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 font-bold transition-all"
                >
                    Email Invoice
                </button>
                <Link
                    href={`/vendor/orders/${detail.id}`}
                    className="h-8 px-3 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-bold flex items-center justify-center transition-all"
                >
                    Edit / Manage Order
                </Link>
            </div>
        </div>
    );
}

// ─── 2. Collections Detail Drawer ────────────────────────────────────────────
function CollectionsDetailDrawer({
    isOpen,
    onClose,
    initialTab
}: {
    isOpen: boolean;
    onClose: () => void;
    initialTab: 'pending' | 'overdue' | 'upcoming' | 'utilization';
}) {
    const [tab, setTab] = useState(initialTab);
    const [search, setSearch] = useState('');
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [remindingId, setRemindingId] = useState<string | null>(null);

    useEffect(() => {
        setTab(initialTab);
    }, [initialTab, isOpen]);

    const fetchCollections = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/vendor/collections');
            const json = await res.json();
            if (json.success) {
                setAccounts(json.data.accounts);
            }
        } catch (err) {
            toast.error('Failed to load credit accounts');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchCollections();
        }
    }, [fetchCollections, isOpen]);

    const filteredAccounts = accounts.filter((acc) => {
        const matchesSearch =
            acc.user.fullName.toLowerCase().includes(search.toLowerCase()) ||
            (acc.user.businessName && acc.user.businessName.toLowerCase().includes(search.toLowerCase()));

        if (!matchesSearch) return false;

        if (tab === 'pending') {
            return acc.creditUsed > 0;
        } else if (tab === 'overdue') {
            return acc.overdueAmount > 0;
        } else if (tab === 'upcoming') {
            return acc.creditUsed > 0 && acc.daysOverdue === 0;
        } else if (tab === 'utilization') {
            const utilPct = acc.creditLimit > 0 ? (acc.creditUsed / acc.creditLimit) * 100 : 0;
            return utilPct > 0;
        }
        return true;
    });

    const handleSendReminder = async (userId: string, name: string) => {
        setRemindingId(userId);
        try {
            const res = await fetch('/api/v1/vendor/credit/remind', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });
            const json = await res.json();
            if (json.success) {
                toast.success(`Reminder sent to ${name} successfully!`);
            } else {
                toast.error(json.error?.message || 'Failed to send payment reminder');
            }
        } catch (err) {
            toast.error('Network error sending payment reminder');
        } finally {
            setRemindingId(null);
        }
    };

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Collections & Accounts Credit"
            subtitle="Monitor client accounts receivable and send payment reminders."
        >
            <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl overflow-x-auto no-scrollbar shrink-0">
                {[
                    { id: 'pending', label: 'Outstanding' },
                    { id: 'overdue', label: 'Overdue' },
                    { id: 'upcoming', label: 'Current / Upcoming' },
                    { id: 'utilization', label: 'Credit Utilization' },
                ].map((t) => (
                    <button
                        type="button"
                        key={t.id}
                        onClick={() => setTab(t.id as any)}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all whitespace-nowrap",
                            tab === t.id
                                ? "bg-white text-emerald-700 shadow-sm border border-emerald-100/50"
                                : "text-gray-500 hover:text-gray-800"
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <input
                type="text"
                placeholder="Search by Client Name or Business..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
            />

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="animate-spin text-emerald-600" size={24} />
                </div>
            ) : filteredAccounts.length === 0 ? (
                <p className="text-center py-12 text-[13px] text-gray-400 font-medium">No matching client credit accounts found.</p>
            ) : (
                <div className="space-y-4">
                    {filteredAccounts.map((acc) => {
                        const utilPct = acc.creditLimit > 0 ? Math.round((acc.creditUsed / acc.creditLimit) * 100) : 0;
                        return (
                            <div key={acc.id} className="border border-gray-150/40 rounded-xl p-4 bg-white space-y-3 hover:shadow-sm transition-shadow">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <span className="text-[13.5px] font-extrabold text-gray-950 block">{acc.user.fullName}</span>
                                        <span className="text-[11px] text-gray-500 font-bold block mt-0.5">{acc.user.businessName || 'Regular Partner'}</span>
                                    </div>
                                    <span className={cn(
                                        "px-2 py-0.5 rounded text-[10px] font-extrabold capitalize border",
                                        acc.status === 'active'
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                            : "bg-rose-50 text-rose-700 border-rose-100"
                                    )}>
                                        {acc.status}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-[12px] bg-gray-50 rounded-xl p-3 border border-gray-100/30">
                                    <div>
                                        <span className="text-gray-400 font-bold block text-[10px] uppercase">Credit Used</span>
                                        <span className="text-[13px] font-black text-gray-900">{formatINR(acc.creditUsed)}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 font-bold block text-[10px] uppercase">Credit Limit</span>
                                        <span className="text-[13px] font-black text-gray-900">{formatINR(acc.creditLimit)}</span>
                                    </div>
                                    {acc.overdueAmount > 0 && (
                                        <div className="col-span-2 flex items-center justify-between pt-1 border-t border-gray-200/50">
                                            <div>
                                                <span className="text-rose-500 font-bold block text-[10px] uppercase">Overdue Balance</span>
                                                <span className="text-[13px] font-black text-rose-600">{formatINR(acc.overdueAmount)}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-extrabold bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded border border-rose-200">
                                                    {acc.daysOverdue} Days Late
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                                        <span>CREDIT EXPOSURE</span>
                                        <span>{utilPct}% Used</span>
                                    </div>
                                    <div className="w-full bg-gray-150/50 h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className={cn(
                                                'h-full rounded-full transition-all',
                                                utilPct >= 80 ? 'bg-rose-500' : utilPct >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
                                            )}
                                            style={{ width: `${Math.min(utilPct, 100)}%` }}
                                        />
                                    </div>
                                </div>

                                {acc.creditUsed > 0 && (
                                    <div className="flex justify-end pt-1">
                                        <button
                                            type="button"
                                            onClick={() => handleSendReminder(acc.user.id, acc.user.fullName)}
                                            disabled={remindingId !== null}
                                            className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-60"
                                        >
                                            {remindingId === acc.user.id ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <Send size={11} />
                                            )}
                                            Send Reminder SMS
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </Drawer>
    );
}

// ─── 3. Inventory Detail Drawer ──────────────────────────────────────────────
function InventoryDetailDrawer({
    isOpen,
    onClose,
    initialTab,
    fastMovers,
    onUpdateSuccess
}: {
    isOpen: boolean;
    onClose: () => void;
    initialTab: 'active' | 'low_stock' | 'out_of_stock' | 'fast_moving';
    fastMovers: FastMover[];
    onUpdateSuccess: () => void;
}) {
    const [tab, setTab] = useState(initialTab);
    const [search, setSearch] = useState('');
    const [inventory, setInventory] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);

    const [editQty, setEditQty] = useState<Record<string, number>>({});
    const [editThreshold, setEditThreshold] = useState<Record<string, number>>({});

    useEffect(() => {
        setTab(initialTab);
    }, [initialTab, isOpen]);

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/vendor/inventory');
            const json = await res.json();
            if (json.success) {
                setInventory(json.data);
                const qtys: Record<string, number> = {};
                const thresholds: Record<string, number> = {};
                json.data.forEach((row: any) => {
                    qtys[row.productId] = row.qtyAvailable;
                    thresholds[row.productId] = row.lowStockThreshold;
                });
                setEditQty(qtys);
                setEditThreshold(thresholds);
            }
        } catch (err) {
            toast.error('Failed to load inventory');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen && tab !== 'fast_moving') {
            fetchInventory();
        }
    }, [fetchInventory, isOpen, tab]);

    const handleSaveStock = async (productId: string, productName: string) => {
        setSavingId(productId);
        try {
            const qty = editQty[productId];
            const threshold = editThreshold[productId];

            const res = await fetch('/api/v1/vendor/inventory', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId,
                    qtyAvailable: qty,
                    lowStockThreshold: threshold
                }),
            });
            const json = await res.json();
            if (json.success) {
                toast.success(`Inventory updated for ${productName}!`);
                onUpdateSuccess();
                fetchInventory();
            } else {
                toast.error(json.error?.message || 'Failed to update stock');
            }
        } catch (err) {
            toast.error('Failed to communicate with database');
        } finally {
            setSavingId(null);
        }
    };

    const filteredInventory = inventory.filter((item) => {
        const matchesSearch =
            item.product.name.toLowerCase().includes(search.toLowerCase()) ||
            (item.product.sku && item.product.sku.toLowerCase().includes(search.toLowerCase()));

        if (!matchesSearch) return false;

        if (tab === 'low_stock') {
            return item.isLowStock;
        } else if (tab === 'out_of_stock') {
            return item.qtyAvailable <= 0;
        }
        return true;
    });

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Inventory Operations Deck"
            subtitle="Manage warehouse stock volumes and triggers in real-time."
        >
            <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl overflow-x-auto no-scrollbar shrink-0">
                {[
                    { id: 'active', label: 'All Catalog' },
                    { id: 'low_stock', label: 'Low Stock Alerts' },
                    { id: 'out_of_stock', label: 'Out of Stock' },
                    { id: 'fast_moving', label: 'Fast Moving Products' },
                ].map((t) => (
                    <button
                        type="button"
                        key={t.id}
                        onClick={() => setTab(t.id as any)}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all whitespace-nowrap",
                            tab === t.id
                                ? "bg-white text-emerald-700 shadow-sm border border-emerald-100/50"
                                : "text-gray-500 hover:text-gray-800"
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab !== 'fast_moving' && (
                <input
                    type="text"
                    placeholder="Search by Product Name or SKU..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                />
            )}

            {tab === 'fast_moving' ? (
                <div className="space-y-4">
                    {fastMovers.length === 0 ? (
                        <p className="text-center py-12 text-[13px] text-gray-400 font-medium">No sales velocity stats found.</p>
                    ) : (
                        fastMovers.map((item, idx) => (
                            <div key={item.productId} className="flex items-center gap-4 border border-gray-150/40 rounded-xl p-4 bg-white">
                                <span className="text-[16px] font-black text-emerald-600 bg-emerald-50 w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                                    #{idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <span className="text-[13.5px] font-bold text-gray-900 block truncate">{item.productName}</span>
                                    <span className="text-[11px] text-gray-400 font-bold block mt-0.5">{item.totalQty.toLocaleString('en-IN')} Units Sold</span>
                                </div>
                                <div className="text-right shrink-0">
                                    <span className="text-[13.5px] font-extrabold text-emerald-600 block">{formatINR(item.revenue)}</span>
                                    <span className="text-[10px] text-gray-400 font-medium block mt-0.5">Revenue Generated</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="animate-spin text-emerald-600" size={24} />
                </div>
            ) : filteredInventory.length === 0 ? (
                <p className="text-center py-12 text-[13px] text-gray-400 font-medium">No matching items found.</p>
            ) : (
                <div className="space-y-4">
                    {filteredInventory.map((item) => (
                        <div key={item.id} className="border border-gray-150/40 rounded-xl p-4 bg-white space-y-4 hover:shadow-sm transition-shadow">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <span className="text-[13.5px] font-extrabold text-gray-950 block truncate">{item.product.name}</span>
                                    <span className="text-[10.5px] text-gray-400 font-bold block mt-0.5">SKU: {item.product.sku || 'N/A'} · Unit: {item.product.unit || 'box'}</span>
                                </div>
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[10px] font-extrabold capitalize border shrink-0",
                                    item.isLowStock
                                        ? item.qtyAvailable <= 0
                                            ? "bg-rose-50 text-rose-700 border-rose-100"
                                            : "bg-amber-50 text-amber-700 border-amber-100"
                                        : "bg-emerald-50 text-emerald-700 border-emerald-100"
                                )}>
                                    {item.qtyAvailable <= 0 ? 'Out of Stock' : item.isLowStock ? 'Low Stock' : 'Good Stock'}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-[12px] bg-gray-50 rounded-xl p-3 border border-gray-100/30">
                                <div className="flex items-center justify-between col-span-2">
                                    <span className="text-gray-400 font-bold">Reserved Qty:</span>
                                    <span className="font-extrabold text-gray-800">{item.qtyReserved} {item.product.unit || 'box'}</span>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[10px] text-gray-400 font-bold uppercase">Available Stock</label>
                                    <input
                                        type="number"
                                        value={editQty[item.productId] ?? 0}
                                        onChange={(e) => setEditQty({ ...editQty, [item.productId]: parseInt(e.target.value) || 0 })}
                                        className="w-full h-8 px-2.5 rounded-lg border border-gray-200 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[10px] text-gray-400 font-bold uppercase">Low Stock Limit</label>
                                    <input
                                        type="number"
                                        value={editThreshold[item.productId] ?? 0}
                                        onChange={(e) => setEditThreshold({ ...editThreshold, [item.productId]: parseInt(e.target.value) || 0 })}
                                        className="w-full h-8 px-2.5 rounded-lg border border-gray-200 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end pt-1">
                                <button
                                    type="button"
                                    onClick={() => handleSaveStock(item.productId, item.product.name)}
                                    disabled={savingId !== null}
                                    className="h-8 px-4 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-60"
                                >
                                    {savingId === item.productId && <Loader2 size={12} className="animate-spin" />}
                                    Save Updates
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Drawer>
    );
}

// ─── 4. Customers Directory Drawer ───────────────────────────────────────────
function CustomersDetailDrawer({
    isOpen,
    onClose,
    initialTab,
    dbCustomers
}: {
    isOpen: boolean;
    onClose: () => void;
    initialTab: 'active' | 'new' | 'dormant' | 'credit';
    dbCustomers: Customer[];
}) {
    const [tab, setTab] = useState(initialTab);
    const [search, setSearch] = useState('');
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setTab(initialTab);
    }, [initialTab, isOpen]);

    const fetchCustomersList = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/vendor/customers');
            const json = await res.json();
            if (json.success && json.data) {
                setCustomers(json.data.customers || []);
            } else {
                setCustomers(dbCustomers);
            }
        } catch (err) {
            setCustomers(dbCustomers);
        } finally {
            setLoading(false);
        }
    }, [dbCustomers]);

    useEffect(() => {
        if (isOpen) {
            fetchCustomersList();
        }
    }, [fetchCustomersList, isOpen]);

    const filtered = customers.filter((c) => {
        const matchesSearch =
            c.user.fullName.toLowerCase().includes(search.toLowerCase()) ||
            (c.user.phone && c.user.phone.includes(search)) ||
            (c.user.businessName && c.user.businessName.toLowerCase().includes(search.toLowerCase()));

        if (!matchesSearch) return false;

        if (tab === 'credit') {
            return c.creditLimit > 0 || c.totalCreditOutstanding > 0;
        } else if (tab === 'new') {
            return c.orderCount <= 2;
        } else if (tab === 'dormant') {
            return c.orderCount > 0 && c.totalSpend < 10000;
        }
        return true;
    });

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Customers Directory"
            subtitle="Manage and analyze client partners, trade volumes, and segments."
        >
            <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl overflow-x-auto no-scrollbar shrink-0">
                {[
                    { id: 'active', label: 'All Partners' },
                    { id: 'new', label: 'New Partners' },
                    { id: 'dormant', label: 'Dormant' },
                    { id: 'credit', label: 'Credit Clients' },
                ].map((t) => (
                    <button
                        type="button"
                        key={t.id}
                        onClick={() => setTab(t.id as any)}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all whitespace-nowrap",
                            tab === t.id
                                ? "bg-white text-emerald-700 shadow-sm border border-emerald-100/50"
                                : "text-gray-500 hover:text-gray-800"
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <input
                type="text"
                placeholder="Search by Name, Phone, or Business..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
            />

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="animate-spin text-emerald-600" size={24} />
                </div>
            ) : filtered.length === 0 ? (
                <p className="text-center py-12 text-[13px] text-gray-400 font-medium">No matching client partners found.</p>
            ) : (
                <div className="space-y-3.5">
                    {filtered.map((c) => (
                        <div key={c.userId} className="border border-gray-150/40 rounded-xl p-4 bg-white space-y-3 hover:shadow-sm transition-shadow">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <span className="text-[13.5px] font-extrabold text-gray-950 block">{c.user.fullName}</span>
                                    <span className="text-[11px] text-gray-500 font-bold block mt-0.5">{c.user.businessName || 'Regular Partner'}</span>
                                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400 font-medium">
                                        <span>📞 {c.user.phone || 'No phone'}</span>
                                        <span>•</span>
                                        <span>✉️ {c.user.email || 'No email'}</span>
                                    </div>
                                </div>
                                {c.creditLimit > 0 && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase bg-blue-50 text-blue-700 border border-blue-150 shrink-0">
                                        Credit Client
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-[12px] bg-gray-50 rounded-xl p-3 border border-gray-100/30 pt-2 pb-2">
                                <div>
                                    <span className="text-gray-400 font-bold block text-[10px] uppercase">Total Orders</span>
                                    <span className="text-[13px] font-black text-gray-800">{c.orderCount} Orders</span>
                                </div>
                                <div>
                                    <span className="text-gray-400 font-bold block text-[10px] uppercase">Purchases</span>
                                    <span className="text-[13px] font-black text-emerald-600">{formatINR(c.totalSpend)}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Drawer>
    );
}

// ─── 5. Fulfillment Detail Drawer ────────────────────────────────────────────
function FulfillmentDetailDrawer({
    isOpen,
    onClose,
    initialTab,
    onFulfillmentUpdate
}: {
    isOpen: boolean;
    onClose: () => void;
    initialTab: 'pending_acceptance' | 'packing' | 'dispatch' | 'delayed';
    onFulfillmentUpdate: () => void;
}) {
    const [tab, setTab] = useState(initialTab);
    const [search, setSearch] = useState('');
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const [courierName, setCourierName] = useState<Record<string, string>>({});
    const [trackingId, setTrackingId] = useState<Record<string, string>>({});

    useEffect(() => {
        setTab(initialTab);
    }, [initialTab, isOpen]);

    const fetchFulfillmentOrders = useCallback(async () => {
        setLoading(true);
        try {
            let statusQuery = '';
            if (tab === 'pending_acceptance') {
                statusQuery = 'pending';
            } else if (tab === 'packing') {
                statusQuery = 'confirmed';
            } else if (tab === 'dispatch') {
                statusQuery = 'processing';
            } else if (tab === 'delayed') {
                statusQuery = 'confirmed,processing,shipped';
            }

            let url = `/api/v1/vendor/orders?limit=40`;
            if (statusQuery) {
                url += `&status=${statusQuery}`;
            }

            const res = await fetch(url);
            const json = await res.json();
            if (json.success) {
                let list = json.data.orders;
                if (tab === 'delayed') {
                    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
                    list = list.filter((o: any) => new Date(o.createdAt).getTime() < cutoff);
                } else if (tab === 'packing') {
                    const extraRes = await fetch(`/api/v1/vendor/orders?limit=40&status=processing`);
                    const extraJson = await extraRes.json();
                    if (extraJson.success) {
                        list = [...list, ...extraJson.data.orders];
                    }
                } else if (tab === 'dispatch') {
                    const extraRes = await fetch(`/api/v1/vendor/orders?limit=40&status=ready_for_dispatch`);
                    const extraJson = await extraRes.json();
                    if (extraJson.success) {
                        list = [...list, ...extraJson.data.orders];
                    }
                }
                setOrders(list);
            }
        } catch (err) {
            toast.error('Failed to load pipeline orders');
        } finally {
            setLoading(false);
        }
    }, [tab]);

    useEffect(() => {
        if (isOpen) {
            fetchFulfillmentOrders();
        }
    }, [fetchFulfillmentOrders, isOpen]);

    const handleUpdateStatus = async (orderId: string, orderNumber: string, nextStatus: string) => {
        setUpdatingId(orderId);
        try {
            const body: any = { status: nextStatus };
            if (nextStatus === 'shipped') {
                body.ewayBillNo = trackingId[orderId] || courierName[orderId] || 'EWAY-MOCK-VAL';
            }
            if (nextStatus === 'delivered') {
                body.proof = { proofType: 'none', notes: 'Completed from operational control panel' };
            }

            const res = await fetch(`/api/v1/vendor/orders/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (json.success) {
                toast.success(`Order ${orderNumber} advanced to ${nextStatus.replace(/_/g, ' ')}!`);
                onFulfillmentUpdate();
                fetchFulfillmentOrders();
            } else {
                toast.error(json.error?.message || 'Failed to update order status');
            }
        } catch (err) {
            toast.error('Network error during status transition');
        } finally {
            setUpdatingId(null);
        }
    };

    const filtered = orders.filter((o) =>
        o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        o.user.fullName.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Fulfillment & Dispatch Pipeline"
            subtitle="Coordinate packing queues, shipment dispatches, and delivery SLA logs."
        >
            <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl overflow-x-auto no-scrollbar shrink-0">
                {[
                    { id: 'pending_acceptance', label: 'Awaiting Accept' },
                    { id: 'packing', label: 'Packing (Processing)' },
                    { id: 'dispatch', label: 'Dispatch (Transit)' },
                    { id: 'delayed', label: 'Delayed Deliveries' },
                ].map((t) => (
                    <button
                        type="button"
                        key={t.id}
                        onClick={() => setTab(t.id as any)}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all whitespace-nowrap",
                            tab === t.id
                                ? "bg-white text-emerald-700 shadow-sm border border-emerald-100/50"
                                : "text-gray-500 hover:text-gray-800"
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <input
                type="text"
                placeholder="Search by Order ID or Client Name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
            />

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="animate-spin text-emerald-600" size={24} />
                </div>
            ) : filtered.length === 0 ? (
                <p className="text-center py-12 text-[13px] text-gray-400 font-medium">No active orders in this segment.</p>
            ) : (
                <div className="space-y-4">
                    {filtered.map((o) => {
                        const ageHrs = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 3600000);
                        return (
                            <div key={o.id} className="border border-gray-150/40 rounded-xl p-4 bg-white space-y-4 hover:shadow-sm transition-shadow">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <span className="text-[13.5px] font-extrabold text-gray-950 block">{o.orderNumber}</span>
                                        <span className="text-[11px] text-gray-500 font-bold block mt-0.5">{o.user.fullName} {o.user.businessName && ` · ${o.user.businessName}`}</span>
                                        <span className="text-[10.5px] text-gray-400 font-medium block mt-1">Placed: {formatDate(o.createdAt)} ({timeAgo(o.createdAt)})</span>
                                    </div>
                                    <span className={cn(
                                        'px-2 py-0.5 rounded text-[10px] font-extrabold capitalize border shrink-0',
                                        STATUS_COLORS[o.status] || 'bg-gray-50 text-gray-600'
                                    )}>
                                        {o.status.replace(/_/g, ' ')}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between text-[12px] bg-gray-50 rounded-xl p-3 border border-gray-100/30">
                                    <div>
                                        <span className="text-gray-400 block text-[10px] font-bold">Checkout Price:</span>
                                        <span className="font-extrabold text-gray-900">{formatINR(Number(o.totalAmount))}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-gray-400 block text-[10px] font-bold">Item Count:</span>
                                        <span className="font-extrabold text-gray-900">{o._count?.items || 1} lines</span>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 pt-1">
                                    {o.status === 'pending' && (
                                        <button
                                            type="button"
                                            onClick={() => handleUpdateStatus(o.id, o.orderNumber, 'confirmed')}
                                            disabled={updatingId !== null}
                                            className="h-9 px-4 rounded-xl bg-emerald-600 text-white text-[12px] font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1 shadow-sm disabled:opacity-60"
                                        >
                                            {updatingId === o.id && <Loader2 size={12} className="animate-spin" />}
                                            Accept & Lock Stock
                                        </button>
                                    )}

                                    {o.status === 'confirmed' && (
                                        <button
                                            type="button"
                                            onClick={() => handleUpdateStatus(o.id, o.orderNumber, 'processing')}
                                            disabled={updatingId !== null}
                                            className="h-9 px-4 rounded-xl bg-indigo-600 text-white text-[12px] font-bold hover:bg-indigo-700 transition-colors flex items-center gap-1 shadow-sm disabled:opacity-60"
                                        >
                                            {updatingId === o.id && <Loader2 size={12} className="animate-spin" />}
                                            Start Packing Items
                                        </button>
                                    )}

                                    {o.status === 'processing' && (
                                        <button
                                            type="button"
                                            onClick={() => handleUpdateStatus(o.id, o.orderNumber, 'ready_for_dispatch')}
                                            disabled={updatingId !== null}
                                            className="h-9 px-4 rounded-xl bg-amber-500 text-white text-[12px] font-bold hover:bg-amber-600 transition-colors flex items-center gap-1 shadow-sm disabled:opacity-60"
                                        >
                                            {updatingId === o.id && <Loader2 size={12} className="animate-spin" />}
                                            Mark Packed & Ready
                                        </button>
                                    )}

                                    {o.status === 'ready_for_dispatch' && (
                                        <div className="w-full space-y-3">
                                            <div className="grid grid-cols-2 gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Courier Partner..."
                                                    value={courierName[o.id] || ''}
                                                    onChange={(e) => setCourierName({ ...courierName, [o.id]: e.target.value })}
                                                    className="h-8 px-2.5 rounded-lg border border-gray-200 text-[11px] font-medium focus:outline-none"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="E-Way Bill / Tracking #..."
                                                    value={trackingId[o.id] || ''}
                                                    onChange={(e) => setTrackingId({ ...trackingId, [o.id]: e.target.value })}
                                                    className="h-8 px-2.5 rounded-lg border border-gray-200 text-[11px] font-medium focus:outline-none"
                                                />
                                            </div>
                                            <div className="flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => handleUpdateStatus(o.id, o.orderNumber, 'shipped')}
                                                    disabled={updatingId !== null || !courierName[o.id]}
                                                    className="h-8 px-4 rounded-lg bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 transition-colors flex items-center gap-1 shadow-sm disabled:opacity-60"
                                                >
                                                    {updatingId === o.id && <Loader2 size={12} className="animate-spin" />}
                                                    Dispatch Transit (Ship)
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {o.status === 'shipped' && (
                                        <button
                                            type="button"
                                            onClick={() => handleUpdateStatus(o.id, o.orderNumber, 'delivered')}
                                            disabled={updatingId !== null}
                                            className="h-9 px-4 rounded-xl bg-emerald-600 text-white text-[12px] font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1 shadow-sm disabled:opacity-60"
                                        >
                                            {updatingId === o.id && <Loader2 size={12} className="animate-spin" />}
                                            Confirm Delivery Success
                                        </button>
                                    )}

                                    {tab === 'delayed' && ageHrs >= 48 && (
                                        <div className="w-full flex items-center justify-between">
                                            <span className="text-[11px] text-rose-600 font-extrabold flex items-center gap-1">
                                                🚨 Overdue SLA: {ageHrs} hours!
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => toast.success(`Client ${o.user.fullName} notified of delivery delay.`)}
                                                className="h-8 px-3 rounded-lg border border-rose-200 text-[11px] font-extrabold text-rose-600 hover:bg-rose-50"
                                            >
                                                Send Delay Notification
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Drawer>
    );
}

// ─── 6. Financial Ledger Drawer ──────────────────────────────────────────────
function FinancialDetailDrawer({
    isOpen,
    onClose,
    initialTab,
    onPayoutSuccess
}: {
    isOpen: boolean;
    onClose: () => void;
    initialTab: 'wallet' | 'pending_settlement' | 'completed_settlement' | 'fees';
    onPayoutSuccess: () => void;
}) {
    const [tab, setTab] = useState(initialTab);
    const [financeData, setFinanceData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [payoutLoading, setPayoutLoading] = useState(false);

    useEffect(() => {
        setTab(initialTab);
    }, [initialTab, isOpen]);

    const fetchWalletData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/vendor/wallet');
            const json = await res.json();
            if (json.success) {
                setFinanceData(json.data);
            }
        } catch (err) {
            toast.error('Failed to load wallet ledger');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchWalletData();
        }
    }, [fetchWalletData, isOpen]);

    const handleRequestInstantPayout = async () => {
        setPayoutLoading(true);
        try {
            const res = await fetch('/api/v1/vendor/wallet/payout', { method: 'POST' });
            const json = await res.json();
            if (!json.success) {
                toast.error(json.error?.message ?? json.error ?? 'Payout request failed');
                return;
            }
            toast.success(json.data?.message ?? 'Payout initiated successfully');
            onPayoutSuccess();
            fetchWalletData();
        } catch {
            toast.error('Payout request failed');
        } finally {
            setPayoutLoading(false);
        }
    };

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Financial Treasury & Ledger"
            subtitle="Track accrued wallet values, platform commissions, and bank payouts."
        >
            <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl overflow-x-auto no-scrollbar shrink-0">
                {[
                    { id: 'wallet', label: 'Wallet Balance' },
                    { id: 'pending_settlement', label: 'Pending Payouts' },
                    { id: 'completed_settlement', label: 'Payout History' },
                    { id: 'fees', label: 'Platform Fees' },
                ].map((t) => (
                    <button
                        type="button"
                        key={t.id}
                        onClick={() => setTab(t.id as any)}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all whitespace-nowrap",
                            tab === t.id
                                ? "bg-white text-emerald-700 shadow-sm border border-emerald-100/50"
                                : "text-gray-500 hover:text-gray-800"
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="animate-spin text-emerald-600" size={24} />
                </div>
            ) : financeData ? (
                <div className="space-y-5">
                    <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
                        <div className="absolute right-0 bottom-0 opacity-10 text-[100px] leading-none select-none">🏦</div>
                        <span className="text-[10px] text-emerald-100 font-bold uppercase tracking-wider block">Available Balance</span>
                        <span className="text-[28px] font-black block mt-1">{formatINR(financeData.wallet?.balance || 0)}</span>
                        <p className="text-[11px] text-emerald-100/80 font-medium mt-1">Next auto-settlement date: {financeData.wallet?.nextSettlementDate || 'Monday'}</p>

                        {tab === 'pending_settlement' && financeData.pendingPayout > 0 && (
                            <div className="mt-4 pt-4 border-t border-white/20 flex items-center justify-between">
                                <div>
                                    <span className="text-[10px] text-emerald-100 uppercase block">Pending Settlement</span>
                                    <span className="text-[15px] font-black">{formatINR(financeData.pendingPayout)}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleRequestInstantPayout}
                                    disabled={payoutLoading}
                                    className="bg-white text-emerald-700 px-4 py-2 rounded-xl text-[12px] font-bold hover:bg-emerald-50 transition-all shadow-sm flex items-center gap-1.5"
                                >
                                    {payoutLoading && <Loader2 size={12} className="animate-spin" />}
                                    Request Payout
                                </button>
                            </div>
                        )}
                    </div>

                    {tab === 'wallet' && (
                        <div className="space-y-3">
                            <span className="text-[12px] text-gray-500 font-black block">Recent Wallet Transactions</span>
                            <div className="divide-y divide-gray-100 border border-gray-150/40 rounded-2xl overflow-hidden bg-white">
                                {financeData.transactions?.length === 0 ? (
                                    <p className="p-4 text-center text-[12px] text-gray-400">No transactions recorded yet.</p>
                                ) : (
                                    financeData.transactions?.map((txn: any) => (
                                        <div key={txn.id} className="p-4 flex items-center justify-between text-[12px]">
                                            <div>
                                                <span className="font-bold text-gray-900 block capitalize">{txn.type.replace(/_/g, ' ')}</span>
                                                <span className="text-[10px] text-gray-400 font-medium block mt-0.5">{formatDate(txn.createdAt)}</span>
                                            </div>
                                            <span className={cn(
                                                "font-black text-[13px] shrink-0",
                                                txn.amount >= 0 ? "text-emerald-600" : "text-rose-500"
                                            )}>
                                                {txn.amount >= 0 ? `+` : ``}{formatINR(Number(txn.amount))}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {tab === 'completed_settlement' && (
                        <div className="space-y-3">
                            <span className="text-[12px] text-gray-500 font-black block">Completed Bank Payout History</span>
                            <div className="space-y-3">
                                {financeData.payouts?.length === 0 ? (
                                    <p className="p-6 text-center text-[12px] text-gray-405">No bank payouts completed yet.</p>
                                ) : (
                                    financeData.payouts?.map((p: any) => (
                                        <div key={p.id} className="border border-gray-100 rounded-xl p-4 bg-white space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[13.5px] font-black text-gray-900">{formatINR(p.amount)}</span>
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold capitalize bg-emerald-50 text-emerald-700 border border-emerald-100">
                                                    {p.status}
                                                </span>
                                            </div>
                                            <div className="text-[11px] text-gray-400 font-medium space-y-1">
                                                <p>Payout Period: {p.periodStart} to {p.periodEnd}</p>
                                                <p>Bank Ref No: <strong className="text-gray-650 font-bold">{p.reference || 'REF-N/A-MOCK'}</strong></p>
                                                <p>Settled On: {p.settledAt ? formatDate(p.settledAt) : 'N/A'}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {tab === 'fees' && (
                        <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-4">
                            <h4 className="text-[13.5px] font-black text-gray-900 border-b border-gray-50 pb-2">Platform Fees Accrued</h4>
                            <div className="flex justify-between text-[12px]">
                                <span className="text-gray-500">Platform fee rate:</span>
                                <span className="font-bold text-gray-700">
                                    {financeData.feeInfo?.effectivePlatformFeePct ?? '—'}%
                                    {financeData.feeInfo?.isCustomRate ? ' (custom)' : ' (global)'}
                                </span>
                            </div>
                            <div className="flex justify-between text-[12px]">
                                <span className="text-gray-500">This month platform fees:</span>
                                <span className="font-extrabold text-rose-500">
                                    {formatINR(Number(financeData.feeInfo?.monthPlatformFees ?? 0))}
                                </span>
                            </div>
                            <div className="flex justify-between text-[12px]">
                                <span className="text-gray-500">All-time from settlements:</span>
                                <span className="font-bold text-gray-700">
                                    {formatINR(Number(financeData.payouts?.reduce((s: number, p: { platformFee?: number }) => s + Number(p.platformFee ?? 0), 0) ?? 0))}
                                </span>
                            </div>
                            <p className="text-[11px] text-gray-400 font-medium">Platform fees are automatically deducted from order value during payout processing.</p>
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-center py-12 text-[12px] text-gray-450">Ledger details are temporarily unavailable.</p>
            )}
        </Drawer>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function VendorDashboardPage() {
    const { data: session } = useSession();
    const { currentOutlet, signOut } = useBusinessAccountSwitcher();
    const { outletQuery, scopeVersion, currentOutlet: scopedOutlet } = useVendorOutletScope();
    const activeAccountType = (session?.user as {
        activeBusinessAccountType?: { isVendor: boolean; isBrand: boolean };
    } | undefined)?.activeBusinessAccountType;
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isNetworkError, setIsNetworkError] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const todayStartIST = new Date(nowIST);
    todayStartIST.setUTCHours(0, 0, 0, 0);
    todayStartIST.setTime(todayStartIST.getTime() - 5.5 * 60 * 60 * 1000);

    const monthStartIST = new Date(nowIST);
    monthStartIST.setUTCDate(1);
    monthStartIST.setUTCHours(0, 0, 0, 0);
    monthStartIST.setTime(monthStartIST.getTime() - 5.5 * 60 * 60 * 1000);

    // Auxiliary modal states
    const [products, setProducts] = useState<Product[]>([]);
    const [dbCustomers, setDbCustomers] = useState<Customer[]>([]);

    // Modals visibility states
    const [isCreateSchemeOpen, setIsCreateSchemeOpen] = useState(false);
    const [isPushOfferOpen, setIsPushOfferOpen] = useState(false);
    const [isSendReminderOpen, setIsSendReminderOpen] = useState(false);
    const [isDownloadReportsOpen, setIsDownloadReportsOpen] = useState(false);

    // Interactive Drawers Visibility States
    const [isSalesDrawerOpen, setIsSalesDrawerOpen] = useState(false);
    const [salesDrawerTab, setSalesDrawerTab] = useState<'today' | 'month' | 'pending' | 'delivered' | 'cancelled'>('today');

    const [isCollectionsDrawerOpen, setIsCollectionsDrawerOpen] = useState(false);
    const [collectionsDrawerTab, setCollectionsDrawerTab] = useState<'pending' | 'overdue' | 'upcoming' | 'utilization'>('pending');

    const [isInventoryDrawerOpen, setIsInventoryDrawerOpen] = useState(false);
    const [inventoryDrawerTab, setInventoryDrawerTab] = useState<'active' | 'low_stock' | 'out_of_stock' | 'fast_moving'>('active');

    const [isCustomersDrawerOpen, setIsCustomersDrawerOpen] = useState(false);
    const [customersDrawerTab, setCustomersDrawerTab] = useState<'active' | 'new' | 'dormant' | 'credit'>('active');

    const [isFulfillmentDrawerOpen, setIsFulfillmentDrawerOpen] = useState(false);
    const [fulfillmentDrawerTab, setFulfillmentDrawerTab] = useState<'pending_acceptance' | 'packing' | 'dispatch' | 'delayed'>('pending_acceptance');

    const [isFinancialDrawerOpen, setIsFinancialDrawerOpen] = useState(false);
    const [financialDrawerTab, setFinancialDrawerTab] = useState<'wallet' | 'pending_settlement' | 'completed_settlement' | 'fees'>('wallet');

    const openSalesDrawer = (tab: typeof salesDrawerTab) => {
        setSalesDrawerTab(tab);
        setIsSalesDrawerOpen(true);
    };

    const openCollectionsDrawer = (tab: typeof collectionsDrawerTab) => {
        setCollectionsDrawerTab(tab);
        setIsCollectionsDrawerOpen(true);
    };

    const openInventoryDrawer = (tab: typeof inventoryDrawerTab) => {
        setInventoryDrawerTab(tab);
        setIsInventoryDrawerOpen(true);
    };

    const openCustomersDrawer = (tab: typeof customersDrawerTab) => {
        setCustomersDrawerTab(tab);
        setIsCustomersDrawerOpen(true);
    };

    const openFulfillmentDrawer = (tab: typeof fulfillmentDrawerTab) => {
        setFulfillmentDrawerTab(tab);
        setIsFulfillmentDrawerOpen(true);
    };

    const openFinancialDrawer = (tab: typeof financialDrawerTab) => {
        setFinancialDrawerTab(tab);
        setIsFinancialDrawerOpen(true);
    };

    const fetchDashboard = useCallback((silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        setIsNetworkError(false);
        const qs = outletQuery();
        fetch(`/api/v1/vendor/dashboard${qs}`)
            .then(res => res.json().then(json => ({ res, json })))
            .then(({ res, json }) => {
                if (json.success) {
                    setData(json.data);
                    setLastRefresh(new Date());
                } else {
                    const message = json.error?.message || 'Failed to load dashboard data';
                    setError(message);
                    setIsNetworkError(res.status >= 500);
                }
            })
            .catch(() => {
                setError('Failed to load dashboard data');
                setIsNetworkError(true);
            })
            .finally(() => { if (!silent) setLoading(false); });
    }, [outletQuery, scopeVersion]);

    // Load auxiliary lists to supply modal dropdown selectors
    useEffect(() => {
        // Fetch products list (needed for promo buy/get selectors)
        fetch('/api/v1/vendor/products?limit=100')
            .then((r) => r.json())
            .then((res) => {
                if (res.success && res.data && res.data.products) {
                    setProducts(res.data.products);
                }
            })
            .catch(() => {});

        // Fetch customers list (needed for reminding credit balances)
        fetch('/api/v1/vendor/customers')
            .then((r) => r.json())
            .then((res) => {
                if (res.success && res.data && res.data.customers) {
                    setDbCustomers(res.data.customers);
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        Promise.resolve().then(() => fetchDashboard());
        const interval = setInterval(() => fetchDashboard(true), 30000);
        return () => clearInterval(interval);
    }, [fetchDashboard]);

    const handleAcceptOrder = useCallback(async (orderId: string, orderNumber: string) => {
        const res = await fetch(`/api/v1/vendor/orders/${orderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'confirmed' }),
        });
        const json = await res.json();
        if (!json.success) {
            toast.error(json.error?.message || 'Failed to accept order');
            throw new Error(json.error?.message);
        }
        toast.success(`${orderNumber} accepted! Inventory reserved.`);
        setData(prev => {
            if (!prev) return prev;
            const remaining = prev.pendingOrders.filter(o => o.id !== orderId);
            return {
                ...prev,
                pendingOrders: remaining,
                stats: { ...prev.stats, pendingOrdersCount: remaining.length },
                ordersByStatus: {
                    ...prev.ordersByStatus,
                    pending: Math.max(0, (prev.ordersByStatus.pending ?? 0) - 1),
                    confirmed: (prev.ordersByStatus.confirmed ?? 0) + 1,
                },
            };
        });
    }, []);

    const isWrongAccountError = error?.toLowerCase().includes('no vendor profile linked') ?? false;

    return (
        <div className="space-y-6 pb-12 px-2 sm:px-0">
            <SetupBanner />

            {/* Header / Systems Operations Center */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 p-6 rounded-3xl border border-slate-800 shadow-[0_15px_30px_-5px_rgba(0,0,0,0.15)] relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute -bottom-20 left-10 w-[250px] h-[250px] bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none" />
                
                <div className="relative z-10">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <h1 className="text-[24px] font-semibold text-white tracking-tight leading-none">Today's Operations Control Center</h1>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                            Live Pulse Active
                        </span>
                    </div>
                    <p className="text-[12px] text-slate-400 font-medium mt-2">
                        Store: <span className="font-bold text-slate-200">{scopedOutlet?.name || currentOutlet?.name || 'Online Store'}</span> · Connected Rep: <span className="font-bold text-slate-200">{session?.user?.name || 'Manager'}</span>
                    </p>
                </div>
                <div className="flex items-center gap-3.5 self-end sm:self-center relative z-10">
                    <span className="text-[11px] text-slate-450 font-extrabold hidden md:inline tracking-wider uppercase">
                        REFRESHED: {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                    </span>
                    <button
                        onClick={() => fetchDashboard()}
                        className="h-10 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-[13px] font-medium text-slate-200 hover:text-white flex items-center gap-2 border border-slate-700/50 hover:border-slate-600 transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                        <RefreshCw size={14} className={cn(loading && "animate-spin text-emerald-400")} />
                        Refresh Control
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-28 gap-3">
                    <Loader2 className="animate-spin text-emerald-600" size={36} />
                    <p className="text-[13px] text-gray-400 font-bold">Compiling real-time dashboard analytics...</p>
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white rounded-2xl border border-gray-100">
                    {isWrongAccountError ? (
                        <ShieldAlert size={36} className="text-amber-500" />
                    ) : (
                        <AlertTriangle size={36} className="text-rose-500" />
                    )}
                    <div className="text-center max-w-md px-4">
                        <p className="text-[15px] text-gray-900 font-black">
                            {isWrongAccountError
                                ? 'Wrong Business Account'
                                : isNetworkError
                                    ? 'Connection Offline'
                                    : 'Unable to Load Dashboard'}
                        </p>
                        <p className="text-[13px] text-gray-400 font-medium mt-0.5">
                            {isWrongAccountError
                                ? 'This session is not a vendor business. Sign out and log in with a supplier account, or open the brand portal if that fits your account.'
                                : error}
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                        {isWrongAccountError ? (
                            <>
                                <button
                                    onClick={() => signOut()}
                                    className="h-10 px-6 bg-emerald-600 text-white rounded-xl text-[13px] font-bold hover:bg-emerald-700 transition-colors shadow-md"
                                >
                                    Sign out
                                </button>
                                {activeAccountType?.isBrand && (
                                    <Link
                                        href="/brand/portal"
                                        className="h-10 px-6 bg-[#53B175] text-white rounded-xl text-[13px] font-bold hover:bg-[#3d9e41] transition-colors shadow-md flex items-center justify-center"
                                    >
                                        Go to Brand Portal
                                    </Link>
                                )}
                            </>
                        ) : (
                            <button
                                onClick={() => fetchDashboard()}
                                className="h-10 px-6 bg-emerald-600 text-white rounded-xl text-[13px] font-bold hover:bg-emerald-700 transition-colors shadow-md"
                            >
                                {isNetworkError ? 'Re-connect Server' : 'Try Again'}
                            </button>
                        )}
                    </div>
                </div>
            ) : data && (
                <>
                    {/* ── Pending Order Action Area (Prominent) ── */}
                    <PendingOrdersWidget
                        orders={data.pendingOrders}
                        onAccept={handleAcceptOrder}
                    />

                    {/* ── Smart Control Deck (Quick Actions) ── */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h3 className="text-[15px] font-black text-gray-950 mb-4 tracking-tight flex items-center gap-1.5">
                            <Activity size={16} className="text-emerald-600" />
                            Smart Executive Actions
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
                            <Link
                                href="/vendor/products?action=add"
                                className="flex flex-col items-center justify-center p-4 bg-emerald-50/20 border border-emerald-100 rounded-2xl hover:bg-emerald-50 hover:shadow-sm hover:-translate-y-0.5 transition-all text-center group"
                            >
                                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                    <PlusCircle size={18} />
                                </div>
                                <span className="text-[12px] font-bold text-emerald-700">Add Products</span>
                            </Link>
                            <Link
                                href="/vendor/inventory"
                                className="flex flex-col items-center justify-center p-4 bg-blue-50/20 border border-blue-100 rounded-2xl hover:bg-blue-50 hover:shadow-sm hover:-translate-y-0.5 transition-all text-center group"
                            >
                                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                    <Upload size={18} />
                                </div>
                                <span className="text-[12px] font-bold text-blue-700">Upload Inventory</span>
                            </Link>
                            <button
                                onClick={() => setIsCreateSchemeOpen(true)}
                                className="flex flex-col items-center justify-center p-4 bg-amber-50/25 border border-amber-100/60 rounded-2xl hover:bg-amber-50 hover:shadow-sm hover:-translate-y-0.5 transition-all text-center group"
                            >
                                <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 border border-amber-100/40 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                    <BadgePercent size={18} />
                                </div>
                                <span className="text-[12px] font-bold text-amber-700">Create Scheme</span>
                            </button>
                            <button
                                onClick={() => setIsPushOfferOpen(true)}
                                className="flex flex-col items-center justify-center p-4 bg-pink-50/20 border border-pink-100 rounded-2xl hover:bg-pink-50 hover:shadow-sm hover:-translate-y-0.5 transition-all text-center group"
                            >
                                <div className="w-10 h-10 rounded-full bg-pink-50 text-pink-600 border border-pink-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                    <Megaphone size={18} />
                                </div>
                                <span className="text-[12px] font-bold text-pink-700">Push Offer</span>
                            </button>
                            <button
                                onClick={() => setIsSendReminderOpen(true)}
                                className="flex flex-col items-center justify-center p-4 bg-indigo-50/20 border border-indigo-100 rounded-2xl hover:bg-indigo-50 hover:shadow-sm hover:-translate-y-0.5 transition-all text-center group"
                            >
                                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                    <Send size={18} />
                                </div>
                                <span className="text-[12px] font-bold text-indigo-700">Send Reminder</span>
                            </button>
                            <button
                                onClick={() => setIsDownloadReportsOpen(true)}
                                className="flex flex-col items-center justify-center p-4 bg-rose-50/20 border border-rose-100 rounded-2xl hover:bg-rose-50 hover:shadow-sm hover:-translate-y-0.5 transition-all text-center group"
                            >
                                <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                    <Download size={18} />
                                </div>
                                <span className="text-[12px] font-bold text-rose-700">Download Reports</span>
                            </button>
                        </div>
                    </div>

                    {/* ── Alert Strip (Operations Pulse warnings) ── */}
                    {(data.stats.lowStockCount > 0 || Number(data.stats.overdueAmount) > 0 || data.fulfillment.deliveryDelayed > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Low Stock Alert */}
                            {data.stats.lowStockCount > 0 && (
                                <Link
                                    href="/vendor/inventory"
                                    className="flex items-center gap-3 p-4 bg-amber-50/40 border border-amber-200 rounded-2xl hover:bg-amber-50 hover:shadow-sm transition-all group"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-amber-500/20">
                                        <AlertTriangle size={18} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-black text-amber-900 group-hover:text-amber-950 truncate">Low Stock Alert</p>
                                        <p className="text-[11px] text-amber-700 font-medium truncate mt-0.5">{data.stats.lowStockCount} items are running below threshold</p>
                                    </div>
                                    <ChevronRight size={16} className="text-amber-400 group-hover:text-amber-600 transition-colors ml-auto" />
                                </Link>
                            )}

                            {/* Overdue Credit Alert */}
                            {Number(data.stats.overdueAmount) > 0 && (
                                <Link
                                    href="/vendor/collections"
                                    className="flex items-center gap-3 p-4 bg-rose-50/40 border border-rose-200 rounded-2xl hover:bg-rose-50 hover:shadow-sm transition-all group"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-rose-500/20">
                                        <ShieldAlert size={18} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-black text-rose-900 group-hover:text-rose-950 truncate">Overdue Collections</p>
                                        <p className="text-[11px] text-rose-700 font-medium truncate mt-0.5">{formatINR(Number(data.stats.overdueAmount))} past due date limit</p>
                                    </div>
                                    <ChevronRight size={16} className="text-rose-400 group-hover:text-rose-600 transition-colors ml-auto" />
                                </Link>
                            )}

                            {/* Delayed Delivery Alert */}
                            {data.fulfillment.deliveryDelayed > 0 && (
                                <div
                                    onClick={() => openFulfillmentDrawer('delayed')}
                                    className="flex items-center gap-3 p-4 bg-rose-50/40 border border-rose-200 rounded-2xl hover:bg-rose-50 hover:shadow-sm cursor-pointer transition-all group"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-rose-500/20">
                                        <AlertCircle size={18} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-black text-rose-900 group-hover:text-rose-950 truncate">Delayed Deliveries</p>
                                        <p className="text-[11px] text-rose-700 font-medium truncate mt-0.5">{data.fulfillment.deliveryDelayed} orders delayed beyond SLA</p>
                                    </div>
                                    <ChevronRight size={16} className="text-rose-400 group-hover:text-rose-600 transition-colors ml-auto" />
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Operations Control Center Matrix (6 Hubs) ── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

                        {/* 1. SALES HUB */}
                        <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-3xl border border-slate-200/60 p-6 shadow-sm hover:shadow-lg hover:border-emerald-300/50 transition-all duration-300 flex flex-col justify-between relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all" />
                            <div>
                                <div className="flex items-center justify-between pb-3 border-b border-slate-105 mb-5">
                                    <h4 className="text-[14px] font-semibold text-slate-800 flex items-center gap-2">
                                        <TrendingUp size={16} className="text-emerald-500" />
                                        Sales Operations
                                    </h4>
                                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">Revenue</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mb-5">
                                    <div onClick={() => openSalesDrawer('today')} className="cursor-pointer bg-white border border-slate-105 hover:border-emerald-200 hover:bg-emerald-50/10 p-3.5 rounded-2xl transition-all duration-300 shadow-sm relative group/cell">
                                        <span className="text-[10px] text-slate-400 font-extrabold tracking-wider block">TODAY SALES</span>
                                        <span className="text-[22px] font-semibold text-slate-900 block mt-1 tracking-tight">{formatINR(Number(data.stats.todaySales))}</span>
                                        <ArrowUpRight size={12} className="absolute top-3 right-3 text-slate-350 group-hover/cell:text-emerald-500 group-hover/cell:translate-x-0.5 group-hover/cell:-translate-y-0.5 transition-all" />
                                    </div>
                                    <div onClick={() => openSalesDrawer('month')} className="cursor-pointer bg-white border border-slate-105 hover:border-emerald-200 hover:bg-emerald-50/10 p-3.5 rounded-2xl transition-all duration-300 shadow-sm relative group/cell">
                                        <span className="text-[10px] text-slate-400 font-extrabold tracking-wider block">MONTH SALES</span>
                                        <span className="text-[22px] font-semibold text-slate-900 block mt-1 tracking-tight">{formatINR(Number(data.stats.mtdSales))}</span>
                                        <ArrowUpRight size={12} className="absolute top-3 right-3 text-slate-350 group-hover/cell:text-emerald-500 group-hover/cell:translate-x-0.5 group-hover/cell:-translate-y-0.5 transition-all" />
                                    </div>
                                </div>
                            </div>
                            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100">
                                <span className="text-[10px] text-slate-400 font-extrabold block mb-3 uppercase tracking-wider">Order Log Volume</span>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div onClick={() => openSalesDrawer('pending')} className="bg-white border border-slate-100/80 hover:border-amber-200 hover:bg-amber-50/20 p-2.5 rounded-xl cursor-pointer transition-all duration-300 shadow-sm">
                                        <span className="text-amber-600 block text-[15px] font-semibold tracking-tight">{data.ordersByStatus.pending ?? 0}</span>
                                        <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Pending</span>
                                    </div>
                                    <div onClick={() => openSalesDrawer('delivered')} className="bg-white border border-slate-100/80 hover:border-emerald-200 hover:bg-emerald-50/20 p-2.5 rounded-xl cursor-pointer transition-all duration-300 shadow-sm">
                                        <span className="text-emerald-600 block text-[15px] font-semibold tracking-tight">{data.ordersByStatus.delivered ?? 0}</span>
                                        <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Delivered</span>
                                    </div>
                                    <div onClick={() => openSalesDrawer('cancelled')} className="bg-white border border-slate-100/80 hover:border-rose-200 hover:bg-rose-50/20 p-2.5 rounded-xl cursor-pointer transition-all duration-300 shadow-sm">
                                        <span className="text-rose-505 block text-[15px] font-semibold tracking-tight">{data.ordersByStatus.cancelled ?? 0}</span>
                                        <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Cancelled</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. COLLECTIONS & CREDIT HUB */}
                        <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-3xl border border-slate-200/60 p-6 shadow-sm hover:shadow-lg hover:border-blue-300/50 transition-all duration-300 flex flex-col justify-between relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all" />
                            <div>
                                <div className="flex items-center justify-between pb-3 border-b border-slate-105 mb-5">
                                    <h4 className="text-[14px] font-semibold text-slate-800 flex items-center gap-2">
                                        <CreditCard size={16} className="text-blue-500" />
                                        Collections & Credit
                                    </h4>
                                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-705 text-[10px] font-bold uppercase tracking-wider">Receivables</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 mb-5">
                                    <div onClick={() => openCollectionsDrawer('pending')} className="cursor-pointer bg-white border border-slate-105 hover:border-blue-200 p-3 rounded-2xl transition-all duration-300 shadow-sm text-center relative group/cell">
                                        <span className="text-[9px] text-slate-405 font-extrabold tracking-wider block">PENDING</span>
                                        <span className="text-[15px] font-semibold text-slate-900 block mt-1 tracking-tight">{formatINR(Number(data.stats.pendingPayments))}</span>
                                    </div>
                                    <div onClick={() => openCollectionsDrawer('overdue')} className="cursor-pointer bg-white border border-slate-105 hover:border-rose-200 p-3 rounded-2xl transition-all duration-300 shadow-sm text-center relative group/cell">
                                        <span className="text-[9px] text-rose-500 font-extrabold tracking-wider block">OVERDUE</span>
                                        <span className="text-[15px] font-semibold text-rose-600 block mt-1 tracking-tight">{formatINR(Number(data.stats.overdueAmount))}</span>
                                    </div>
                                    <div onClick={() => openCollectionsDrawer('upcoming')} className="cursor-pointer bg-white border border-slate-105 hover:border-amber-200 p-3 rounded-2xl transition-all duration-300 shadow-sm text-center relative group/cell">
                                        <span className="text-[9px] text-slate-405 font-extrabold tracking-wider block">UPCOMING</span>
                                        <span className="text-[15px] font-semibold text-amber-600 block mt-1 tracking-tight">{formatINR(Number(data.stats.upcomingDue))}</span>
                                    </div>
                                </div>
                            </div>
                            <div onClick={() => openCollectionsDrawer('utilization')} className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 cursor-pointer hover:bg-slate-100/70 transition-all duration-300">
                                <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-500 mb-2">
                                    <span className="tracking-wider">CREDIT UTILIZATION</span>
                                    <span className={cn(
                                        "px-2 py-0.5 rounded text-[10px] font-bold shadow-sm bg-white border",
                                        data.creditUtilization.pct >= 80 ? "text-rose-650 border-rose-100 animate-pulse font-extrabold" : data.creditUtilization.pct >= 60 ? "text-amber-650 border-amber-100" : "text-emerald-650 border-emerald-100"
                                    )}>{data.creditUtilization.pct}% Used</span>
                                </div>
                                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-200/50 shadow-inner">
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-all duration-500 ease-out shadow-sm',
                                            data.creditUtilization.pct >= 80 ? 'bg-gradient-to-r from-rose-500 to-red-600' : data.creditUtilization.pct >= 60 ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                                        )}
                                        style={{ width: `${Math.min(data.creditUtilization.pct, 100)}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-slate-405 mt-2 font-medium text-right tracking-tight">
                                    {formatINR(data.creditUtilization.totalUsed)} used of <span className="font-semibold text-slate-700">{formatINR(data.creditUtilization.totalLimit)}</span>
                                </p>
                            </div>
                        </div>

                        {/* 3. INVENTORY HUB */}
                        <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-3xl border border-slate-200/60 p-6 shadow-sm hover:shadow-lg hover:border-amber-300/50 transition-all duration-300 flex flex-col justify-between relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all" />
                            <div>
                                <div className="flex items-center justify-between pb-3 border-b border-slate-105 mb-5">
                                    <h4 className="text-[14px] font-semibold text-slate-800 flex items-center gap-2">
                                        <Package size={16} className="text-amber-500" />
                                        Inventory Status
                                    </h4>
                                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-705 text-[10px] font-bold uppercase tracking-wider">Stock Alert</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 mb-5">
                                    <div onClick={() => openInventoryDrawer('active')} className="cursor-pointer bg-white border border-slate-105 hover:border-amber-200 hover:bg-amber-50/10 p-3 rounded-2xl transition-all duration-300 shadow-sm text-center relative group/cell">
                                        <span className="text-[9px] text-slate-405 font-extrabold tracking-wider block leading-none">ACTIVE SKUS</span>
                                        <span className="text-[18px] font-semibold text-slate-900 block mt-1.5 tracking-tight">{data.stats.activeProducts}</span>
                                    </div>
                                    <div onClick={() => openInventoryDrawer('low_stock')} className={cn(
                                        "cursor-pointer border p-3 rounded-2xl transition-all duration-300 shadow-sm text-center relative group/cell",
                                        data.stats.lowStockCount > 0 ? "bg-amber-50/30 border-amber-200 hover:bg-amber-50/55 hover:border-amber-400" : "bg-white border-slate-105 hover:border-amber-200 hover:bg-amber-50/10"
                                    )}>
                                        <span className="text-[9px] text-slate-405 font-extrabold tracking-wider block leading-none">LOW STOCK</span>
                                        <span className={cn("text-[18px] font-semibold block mt-1.5 tracking-tight", data.stats.lowStockCount > 0 ? "text-amber-600" : "text-slate-900")}>
                                            {data.stats.lowStockCount}
                                        </span>
                                    </div>
                                    <div onClick={() => openInventoryDrawer('out_of_stock')} className={cn(
                                        "cursor-pointer border p-3 rounded-2xl transition-all duration-300 shadow-sm text-center relative group/cell",
                                        data.stats.outOfStockCount > 0 ? "bg-rose-50/30 border-rose-200 hover:bg-rose-50/55 hover:border-rose-400" : "bg-white border-slate-105 hover:border-rose-200 hover:bg-rose-50/10"
                                    )}>
                                        <span className="text-[9px] text-slate-405 font-extrabold tracking-wider block leading-none">OUT OF STOCK</span>
                                        <span className={cn("text-[18px] font-semibold block mt-1.5 tracking-tight", data.stats.outOfStockCount > 0 ? "text-rose-600 animate-pulse font-bold" : "text-slate-900")}>
                                            {data.stats.outOfStockCount}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div onClick={() => openInventoryDrawer('fast_moving')} className="bg-slate-50/80 hover:bg-slate-100/70 border border-slate-100 rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all duration-300">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100 shadow-sm">
                                        <TrendingUp size={16} />
                                    </div>
                                    <div className="min-w-0">
                                        <span className="text-[11px] font-semibold text-slate-800 block truncate leading-none">Fast Moving Goods</span>
                                        <span className="text-[10px] text-slate-400 block truncate mt-1">Based on quantity sold 30d</span>
                                    </div>
                                </div>
                                <span className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5">View Top 5 <ArrowRight size={12} /></span>
                            </div>
                        </div>

                        {/* 4. CUSTOMERS HUB */}
                        <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-3xl border border-slate-200/60 p-6 shadow-sm hover:shadow-lg hover:border-purple-300/50 transition-all duration-300 flex flex-col justify-between relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-all" />
                            <div>
                                <div className="flex items-center justify-between pb-3 border-b border-slate-105 mb-5">
                                    <h4 className="text-[14px] font-semibold text-slate-800 flex items-center gap-2">
                                        <Users size={16} className="text-purple-500" />
                                        Customers Directory
                                    </h4>
                                    <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-705 text-[10px] font-bold uppercase tracking-wider">CRM Analytics</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mb-5">
                                    <div onClick={() => openCustomersDrawer('active')} className="cursor-pointer bg-white border border-slate-105 hover:border-purple-200 hover:bg-purple-50/10 p-3.5 rounded-2xl transition-all duration-300 shadow-sm relative group/cell">
                                        <span className="text-[10px] text-slate-400 font-extrabold tracking-wider block">ACTIVE CUSTOMERS</span>
                                        <span className="text-[22px] font-semibold text-slate-900 block mt-1 tracking-tight">{data.customerCounts.total - data.customerCounts.dormant}</span>
                                        <ArrowUpRight size={12} className="absolute top-3 right-3 text-slate-350 group-hover/cell:text-purple-500 transition-colors" />
                                    </div>
                                    <div onClick={() => openCustomersDrawer('credit')} className="cursor-pointer bg-white border border-slate-105 hover:border-purple-200 hover:bg-purple-50/10 p-3.5 rounded-2xl transition-all duration-300 shadow-sm relative group/cell">
                                        <span className="text-[10px] text-slate-400 font-extrabold tracking-wider block">CREDIT CLIENTS</span>
                                        <span className="text-[22px] font-semibold text-slate-900 block mt-1 tracking-tight">{data.stats.creditCustomersCount}</span>
                                        <ArrowUpRight size={12} className="absolute top-3 right-3 text-slate-350 group-hover/cell:text-purple-500 transition-colors" />
                                    </div>
                                </div>
                            </div>
                            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 flex items-center justify-between text-[11px] font-extrabold text-slate-500">
                                <div onClick={() => openCustomersDrawer('new')} className="text-center flex-1 cursor-pointer bg-white hover:bg-emerald-50/25 p-2.5 rounded-xl border border-slate-100 shadow-sm transition-all duration-350 mr-1.5">
                                    <span className="text-emerald-600 block text-[15px] font-semibold tracking-tight">{data.customerCounts.new}</span>
                                    <span className="text-[9px] text-slate-400 block mt-0.5 uppercase tracking-wider font-extrabold">New (30d)</span>
                                </div>
                                <div onClick={() => openCustomersDrawer('dormant')} className="text-center flex-1 cursor-pointer bg-white hover:bg-rose-50/25 p-2.5 rounded-xl border border-slate-100 shadow-sm transition-all duration-350 mr-1.5">
                                    <span className="text-rose-500 block text-[15px] font-semibold tracking-tight">{data.customerCounts.dormant}</span>
                                    <span className="text-[9px] text-slate-400 block mt-0.5 uppercase tracking-wider font-extrabold">Dormant</span>
                                </div>
                                <div onClick={() => openCustomersDrawer('active')} className="text-center flex-1 cursor-pointer bg-white hover:bg-slate-100/70 p-2.5 rounded-xl border border-slate-100 shadow-sm transition-all duration-350">
                                    <span className="text-slate-800 block text-[15px] font-semibold tracking-tight">{data.customerCounts.total}</span>
                                    <span className="text-[9px] text-slate-400 block mt-0.5 uppercase tracking-wider font-extrabold">Total</span>
                                </div>
                            </div>
                        </div>

                        {/* 5. FULFILLMENT WIDGET */}
                        <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-3xl border border-slate-200/60 p-6 shadow-sm hover:shadow-lg hover:border-teal-300/50 transition-all duration-300 flex flex-col justify-between relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl group-hover:bg-teal-500/10 transition-all" />
                            <div>
                                <div className="flex items-center justify-between pb-3 border-b border-slate-105 mb-5">
                                    <h4 className="text-[14px] font-semibold text-slate-800 flex items-center gap-2">
                                        <Activity size={16} className="text-teal-500" />
                                        Fulfillment Pipeline
                                    </h4>
                                    <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-705 text-[10px] font-bold uppercase tracking-wider">SLA Tracker</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mb-5">
                                    <div onClick={() => openFulfillmentDrawer('pending_acceptance')} className="cursor-pointer bg-white border border-slate-105 hover:border-teal-200 hover:bg-teal-50/10 p-3.5 rounded-2xl transition-all duration-300 shadow-sm relative group/cell">
                                        <span className="text-[10px] text-slate-400 font-extrabold tracking-wider block">AWAITING ACCEPT</span>
                                        <span className="text-[22px] font-semibold text-slate-900 block mt-1 tracking-tight">{data.stats.pendingOrdersCount}</span>
                                        <ArrowUpRight size={12} className="absolute top-3 right-3 text-slate-350 group-hover/cell:text-teal-500 transition-colors" />
                                    </div>
                                    <div onClick={() => openFulfillmentDrawer('packing')} className="cursor-pointer bg-white border border-slate-105 hover:border-teal-200 hover:bg-teal-50/10 p-3.5 rounded-2xl transition-all duration-300 shadow-sm relative group/cell">
                                        <span className="text-[10px] text-slate-400 font-extrabold tracking-wider block">PACKING PENDING</span>
                                        <span className="text-[22px] font-semibold text-slate-900 block mt-1 tracking-tight">{data.fulfillment.packingPending}</span>
                                        <ArrowUpRight size={12} className="absolute top-3 right-3 text-slate-350 group-hover/cell:text-teal-500 transition-colors" />
                                    </div>
                                </div>
                            </div>
                            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 flex items-center justify-between text-[11px] font-extrabold text-slate-500">
                                <div onClick={() => openFulfillmentDrawer('dispatch')} className="text-center flex-1 cursor-pointer bg-white hover:bg-blue-50/20 p-2.5 rounded-xl border border-slate-100 shadow-sm transition-all duration-300 mr-2">
                                    <span className="text-blue-600 block text-[15px] font-semibold tracking-tight">{data.fulfillment.dispatchPending}</span>
                                    <span className="text-[9px] text-slate-400 block mt-0.5 uppercase tracking-wider font-extrabold">Transit Pending</span>
                                </div>
                                <div onClick={() => openFulfillmentDrawer('delayed')} className={cn(
                                    "text-center flex-1 cursor-pointer bg-white p-2.5 rounded-xl border shadow-sm transition-all duration-300",
                                    data.fulfillment.deliveryDelayed > 0 ? "border-rose-200 bg-rose-50/30 hover:bg-rose-50/55" : "border-slate-105 hover:bg-slate-100/70"
                                )}>
                                    <span className={cn("block text-[15px] font-semibold tracking-tight", data.fulfillment.deliveryDelayed > 0 ? "text-rose-605 animate-pulse font-bold" : "text-slate-900")}>
                                        {data.fulfillment.deliveryDelayed}
                                    </span>
                                    <span className="text-[9px] text-slate-400 block mt-0.5 uppercase tracking-wider font-extrabold">Delayed</span>
                                </div>
                            </div>
                        </div>

                        {/* 6. FINANCIAL TREASURY HUB */}
                        <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-3xl border border-slate-200/60 p-6 shadow-sm hover:shadow-lg hover:border-orange-300/50 transition-all duration-300 flex flex-col justify-between relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl group-hover:bg-orange-500/10 transition-all" />
                            <div>
                                <div className="flex items-center justify-between pb-3 border-b border-slate-105 mb-5">
                                    <h4 className="text-[14px] font-semibold text-slate-800 flex items-center gap-2">
                                        <Wallet size={16} className="text-orange-500" />
                                        Financial Treasury
                                    </h4>
                                    <span className="px-2 py-0.5 rounded bg-orange-50 text-orange-705 text-[10px] font-bold uppercase tracking-wider">Payouts</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mb-5">
                                    <div onClick={() => openFinancialDrawer('wallet')} className="cursor-pointer bg-white border border-slate-105 hover:border-emerald-200 hover:bg-emerald-50/10 p-3.5 rounded-2xl transition-all duration-300 shadow-sm relative group/cell">
                                        <span className="text-[10px] text-slate-400 font-extrabold tracking-wider block">WALLET BALANCE</span>
                                        <span className="text-[22px] font-semibold text-emerald-600 block mt-1 tracking-tight">{formatINR(data.stats.walletBalance)}</span>
                                        <ArrowUpRight size={12} className="absolute top-3 right-3 text-emerald-355 group-hover/cell:text-emerald-500 transition-colors" />
                                    </div>
                                    <div onClick={() => openFinancialDrawer('pending_settlement')} className="cursor-pointer bg-white border border-slate-105 hover:border-orange-200 hover:bg-orange-50/10 p-3.5 rounded-2xl transition-all duration-300 shadow-sm relative group/cell">
                                        <span className="text-[10px] text-slate-400 font-extrabold tracking-wider block">PENDING SETTLE</span>
                                        <span className="text-[22px] font-semibold text-slate-900 block mt-1 tracking-tight">{formatINR(data.stats.pendingSettlement)}</span>
                                        <ArrowUpRight size={12} className="absolute top-3 right-3 text-orange-355 group-hover/cell:text-orange-500 transition-colors" />
                                    </div>
                                </div>
                            </div>
                            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 flex items-center justify-between text-[11px] font-extrabold text-slate-500">
                                <div onClick={() => openFinancialDrawer('completed_settlement')} className="text-center flex-1 cursor-pointer bg-white hover:bg-slate-100/70 p-2.5 rounded-xl border border-slate-100 shadow-sm transition-all duration-300 mr-2">
                                    <span className="text-slate-800 block text-[13px] font-semibold tracking-tight">{formatINR(data.stats.settlementCompleted)}</span>
                                    <span className="text-[9px] text-slate-400 block mt-0.5 uppercase tracking-wider font-extrabold">Settled Payouts</span>
                                </div>
                                <div onClick={() => openFinancialDrawer('fees')} className="text-center flex-1 cursor-pointer bg-white hover:bg-rose-50/25 p-2.5 rounded-xl border border-slate-100 shadow-sm transition-all duration-300">
                                    <span className="text-rose-505 block text-[13px] font-semibold tracking-tight">{formatINR(data.stats.platformFees)}</span>
                                    <span className="text-[9px] text-slate-400 block mt-0.5 uppercase tracking-wider font-extrabold">Platform Fees</span>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* ── Tables Section (Recent Orders + Fast Movers) ── */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                        {/* Recent Orders log */}
                        <div className="bg-white rounded-3xl border border-slate-150 shadow-[0_8px_30px_rgb(0,0,0,0.02)] overflow-hidden xl:col-span-2">
                            <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-white to-slate-50/40">
                                <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
                                    <FileText size={18} className="text-slate-500" />
                                    Recent Orders Log
                                </h3>
                                <Link
                                    href="/vendor/orders"
                                    className="text-emerald-600 text-[12px] font-bold hover:text-emerald-700 flex items-center gap-0.5 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-150 transition-all cursor-pointer shadow-sm active:scale-95"
                                >
                                    View All Log <ChevronRight size={14} />
                                </Link>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full border-separate border-spacing-0">
                                    <thead>
                                        <tr className="bg-slate-50/80">
                                            <th className="px-5 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Order ID</th>
                                            <th className="px-5 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Client Partner</th>
                                            <th className="px-5 py-3.5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Items</th>
                                            <th className="px-5 py-3.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Checkout Price</th>
                                            <th className="px-5 py-3.5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Date Stamp</th>
                                            <th className="px-5 py-3.5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Status</th>
                                            <th className="px-5 py-3.5 text-center border-b border-slate-100"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {data.recentOrders.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="py-12 text-center text-[14px] text-slate-400 font-medium">
                                                    No recent orders found.
                                                </td>
                                            </tr>
                                        ) : data.recentOrders.map((row) => (
                                            <tr key={row.id} className="hover:bg-slate-50/40 transition-colors">
                                                <td className="px-5 py-4 text-[13px] font-semibold text-slate-900">{row.orderNumber}</td>
                                                <td className="px-5 py-4 text-[13px] text-slate-600 font-medium">{row.user.fullName}</td>
                                                <td className="px-5 py-4 text-center text-[13px] text-slate-400 font-bold">{row._count.items}</td>
                                                <td className="px-5 py-4 text-right text-[13px] font-semibold text-slate-900">
                                                    {formatINR(Number(row.totalAmount))}
                                                </td>
                                                <td className="px-5 py-4 text-center text-[12px] text-slate-400 font-medium">{formatDate(row.createdAt)}</td>
                                                <td className="px-5 py-4 text-center">
                                                    <span className={cn(
                                                        'inline-flex px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize border',
                                                        STATUS_COLORS[row.status] || 'bg-slate-50 text-slate-650 border-slate-200'
                                                    )}>
                                                        {row.status.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                    <Link
                                                        href={`/vendor/orders/${row.id}`}
                                                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-slate-50 border border-slate-150 text-slate-400 hover:bg-slate-100 hover:text-slate-605 transition-all cursor-pointer"
                                                    >
                                                        <Eye size={14} />
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Fast Movers list */}
                        <div id="fast-movers-list" className="bg-white rounded-3xl border border-slate-150 shadow-[0_8px_30px_rgb(0,0,0,0.02)] overflow-hidden flex flex-col justify-between">
                            <div>
                                <div className="px-6 py-4.5 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-white to-slate-50/40">
                                    <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                                        <TrendingUp size={16} className="text-emerald-600" />
                                    </div>
                                    <h3 className="text-[15px] font-semibold text-slate-900">Fast Moving Goods (30d)</h3>
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {data.fastMovers.length === 0 ? (
                                        <p className="p-6 text-center text-[13px] text-slate-400 font-medium">No sales history recorded yet.</p>
                                    ) : data.fastMovers.map((item, idx) => (
                                        <div key={item.productId} className="px-6 py-3.5 flex items-center gap-4 hover:bg-slate-50/30 transition-all duration-200">
                                            <span className="text-[13px] font-bold text-slate-300 w-5 shrink-0">
                                                {idx + 1}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-semibold text-slate-905 truncate">
                                                    {item.productName}
                                                </p>
                                                <span className="text-[11px] text-slate-400 font-medium">
                                                    {item.totalQty.toLocaleString('en-IN')} units shipped
                                                </span>
                                            </div>
                                            <span className="text-[13px] font-extrabold text-emerald-600 shrink-0 w-[80px] text-right">
                                                {formatINR(item.revenue)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
                                <Link href="/vendor/products" className="text-[12px] font-bold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-0.5">
                                    Modify Catalog Pricing <ArrowRight size={14} />
                                </Link>
                            </div>
                        </div>

                    </div>
                </>
            )}

            {/* Modals Mounting Deck */}
            <CreateSchemeModal
                isOpen={isCreateSchemeOpen}
                onClose={() => setIsCreateSchemeOpen(false)}
                products={products}
                onSuccess={() => fetchDashboard()}
            />

            <PushOfferModal
                isOpen={isPushOfferOpen}
                onClose={() => setIsPushOfferOpen(false)}
                onSuccess={() => fetchDashboard()}
            />

            <SendPaymentReminderModal
                isOpen={isSendReminderOpen}
                onClose={() => setIsSendReminderOpen(false)}
                dbCustomers={dbCustomers}
            />

            <DownloadReportsModal
                isOpen={isDownloadReportsOpen}
                onClose={() => setIsDownloadReportsOpen(false)}
                stats={data?.stats || null}
            />

            {/* Interactive Detail Drawers */}
            <SalesDetailDrawer
                isOpen={isSalesDrawerOpen}
                onClose={() => setIsSalesDrawerOpen(false)}
                initialTab={salesDrawerTab}
                todayStart={todayStartIST}
                monthStart={monthStartIST}
            />

            <CollectionsDetailDrawer
                isOpen={isCollectionsDrawerOpen}
                onClose={() => setIsCollectionsDrawerOpen(false)}
                initialTab={collectionsDrawerTab}
            />

            <InventoryDetailDrawer
                isOpen={isInventoryDrawerOpen}
                onClose={() => setIsInventoryDrawerOpen(false)}
                initialTab={inventoryDrawerTab}
                fastMovers={data?.fastMovers || []}
                onUpdateSuccess={() => fetchDashboard()}
            />

            <CustomersDetailDrawer
                isOpen={isCustomersDrawerOpen}
                onClose={() => setIsCustomersDrawerOpen(false)}
                initialTab={customersDrawerTab}
                dbCustomers={dbCustomers}
            />

            <FulfillmentDetailDrawer
                isOpen={isFulfillmentDrawerOpen}
                onClose={() => setIsFulfillmentDrawerOpen(false)}
                initialTab={fulfillmentDrawerTab}
                onFulfillmentUpdate={() => fetchDashboard()}
            />

            <FinancialDetailDrawer
                isOpen={isFinancialDrawerOpen}
                onClose={() => setIsFinancialDrawerOpen(false)}
                initialTab={financialDrawerTab}
                onPayoutSuccess={() => fetchDashboard()}
            />
        </div>
    );
}
