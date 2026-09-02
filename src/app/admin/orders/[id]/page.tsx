'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
    ChevronLeft, 
    User, 
    Package, 
    MapPin, 
    Loader2, 
    AlertCircle,
    ShoppingBag,
    Landmark,
    Scissors,
    CornerDownRight,
    CheckCircle2,
    Calendar,
    Coins,
    RefreshCw,
    FileText,
    FileDown,
    Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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

interface OrderUser {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    businessName: string | null;
}

interface OrderItem {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
}

interface OrderPayment {
    id: string;
    amount: number;
    currency: string;
    status: string;
    method: string | null;
    razorpayPaymentId: string | null;
    createdAt: string;
}

interface DeliverySlot {
    id: string;
    dayOfWeek: string;
    slotStart: string;
    slotEnd: string;
}

interface CreditTxn {
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    createdAt: string;
}

interface OrderData {
    id: string;
    orderNumber: string;
    status: string;
    subtotal: number;
    deliveryFee: number;
    totalAmount: number;
    paymentStatus: string;
    deliveryAddressSnapshot: any;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    vendor: OrderVendor;
    user: OrderUser;
    items: OrderItem[];
    payments: OrderPayment[];
    deliverySlot: DeliverySlot | null;
    creditTxns: CreditTxn[];
}

const ORDER_STATUSES = [
    'pending',
    'confirmed',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
] as const;

function getStatusBadgeClasses(status: string): string {
    switch (status) {
        case 'delivered':
        case 'confirmed':
            return 'bg-[#F8E8EC] text-[#6B1D2E] border-[#F8E8EC]';
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
            return 'bg-[#F8E8EC] text-[#6B1D2E] border-[#F8E8EC]';
        case 'pending':
            return 'bg-[#FFF8EB] text-[#D97706] border-[#FEF3C7]';
        case 'failed':
            return 'bg-[#FDF2F2] text-[#EF4444] border-[#FEE2E2]';
        default:
            return 'bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]';
    }
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatTime(time: string): string {
    if (!time) return 'N/A';
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours, 10);
    if (isNaN(h)) return time;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes || '00'} ${ampm}`;
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(amount);
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

export default function OrderDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const orderId = params.id as string;

    const [order, setOrder] = useState<OrderData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [selectedStatus, setSelectedStatus] = useState('');
    // Ops: edit quantities
    const [editedQty, setEditedQty] = useState<Record<string, number>>({});
    const [savingQty, setSavingQty] = useState(false);
    // Ops: split & reassign
    const [splitQty, setSplitQty] = useState<Record<string, number>>({});
    const [reassignTo, setReassignTo] = useState('');
    const [vendorOptions, setVendorOptions] = useState<{ id: string; businessName: string }[]>([]);
    const [opsBusy, setOpsBusy] = useState(false);
    const [emailingInvoice, setEmailingInvoice] = useState(false);

    useEffect(() => {
        fetch('/api/v1/admin/vendors?limit=200')
            .then((r) => r.json())
            .then((j) => {
                const list = (j?.data?.vendors ?? j?.data ?? []) as { id: string; businessName: string }[];
                setVendorOptions(list.map((v) => ({ id: v.id, businessName: v.businessName })));
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        async function fetchOrder() {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch(`/api/v1/admin/orders/${orderId}`);
                if (!res.ok) {
                    throw new Error(`Failed to fetch order (${res.status})`);
                }
                const json = await res.json();
                if (!json.success) {
                    throw new Error(json.message || 'Failed to fetch order');
                }
                setOrder(json.data);
                setSelectedStatus(json.data.status);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Something went wrong');
            } finally {
                setLoading(false);
            }
        }

        if (orderId) {
            fetchOrder();
        }
    }, [orderId]);

    async function handleStatusUpdate() {
        if (!order || selectedStatus === order.status) return;

        try {
            setUpdatingStatus(true);
            const res = await fetch(`/api/v1/admin/orders/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: selectedStatus }),
            });

            if (!res.ok) {
                throw new Error(`Failed to update status (${res.status})`);
            }

            const json = await res.json();
            if (!json.success) {
                throw new Error(json.message || 'Failed to update status');
            }

            setOrder((prev) => (prev ? { ...prev, status: selectedStatus } : prev));
            toast.success(`Order status updated successfully`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update status');
            setSelectedStatus(order.status);
        } finally {
            setUpdatingStatus(false);
        }
    }

    async function handleSaveQuantities() {
        if (!order) return;
        const lines = order.items
            .map((i) => ({ itemId: i.id, quantity: editedQty[i.id] ?? i.quantity }))
            .filter((l) => l.quantity !== order.items.find((i) => i.id === l.itemId)?.quantity);
        if (lines.length === 0) { toast.message('No quantity changes to save'); return; }
        try {
            setSavingQty(true);
            const res = await fetch(`/api/v1/admin/orders/${orderId}/modify`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lines }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error?.message || json.message || 'Failed to modify order');
            toast.success('Order quantities updated');
            window.location.reload();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to modify order');
        } finally {
            setSavingQty(false);
        }
    }

    async function handleSplit() {
        if (!order) return;
        const lines = order.items.map((i) => ({ itemId: i.id, quantity: splitQty[i.id] || 0 })).filter((l) => l.quantity > 0);
        if (lines.length === 0) { toast.message('Enter quantities to split off'); return; }
        try {
            setOpsBusy(true);
            const res = await fetch(`/api/v1/admin/orders/${orderId}/split`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error?.message || json.message || 'Failed to split order');
            toast.success(`Split into ${json.data?.childOrderNumber ?? 'a new order'}`);
            window.location.reload();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to split order');
        } finally { setOpsBusy(false); }
    }

    async function handleReassign() {
        if (!order || !reassignTo) return;
        try {
            setOpsBusy(true);
            const res = await fetch(`/api/v1/admin/orders/${orderId}/reassign`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newVendorId: reassignTo }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error?.message || json.message || 'Failed to reassign order');
            toast.success('Order reassigned');
            window.location.reload();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to reassign order');
        } finally { setOpsBusy(false); }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#6B1D2E]" />
                <span className="text-[13px] font-bold text-[#6B7280]">Loading order details...</span>
            </div>
        );
    }

    if (error || !order) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                <AlertCircle className="w-10 h-10 text-red-500" />
                <p className="text-[15px] font-medium text-[#4B4B4B]">{error || 'Order not found'}</p>
                <button
                    onClick={() => router.back()}
                    className="text-[14px] font-medium text-[#6B1D2E] hover:underline"
                >
                    Go back
                </button>
            </div>
        );
    }

    const paymentMethod = order.payments.length > 0 ? order.payments[0].method : null;

    return (
        <div className="space-y-6 pb-12 px-4 md:px-0">
            {/* Page Header */}
            <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-4">
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
                                {order.status}
                            </span>
                        </div>
                        <p className="text-[#6B7280] text-[12px] font-medium mt-1">ID: {order.orderNumber} &bull; Created at {formatDate(order.createdAt)}</p>
                    </div>
                </div>
            </div>

            {/* Main Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left side 2 columns: Cards and tables */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Information Cards (Customer, Deliver To, Order Info) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* Customer */}
                        <div className="bg-white rounded-[14px] border border-[#EEEEEE] p-5 shadow-sm flex flex-col justify-between">
                            <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-[10px] bg-[#F8E8EC] flex items-center justify-center text-[#6B1D2E] shrink-0 border border-[#F8E8EC]">
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

                        {/* Deliver To */}
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
                                        {order.deliverySlot.dayOfWeek} ({formatTime(order.deliverySlot.slotStart)} - {formatTime(order.deliverySlot.slotEnd)})
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Order Info */}
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
                                    {paymentMethod && (
                                        <p className="text-[12px] text-[#4B5563] font-semibold">
                                            <span className="text-[#9CA3AF] font-medium">Method:</span> {paymentMethod}
                                        </p>
                                    )}
                                </div>
                            </div>
                            {order.vendor && (
                                <div className="mt-3 pt-2 border-t border-[#F3F4F6] text-[12px] text-[#4B5563]">
                                    <span className="text-[10px] uppercase font-bold text-[#9CA3AF] block mb-1">Assigned Vendor:</span>
                                    <span className="font-bold text-[#6B1D2E] block truncate">{order.vendor.businessName}</span>
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

                    {/* Products Table Card */}
                    <div className="bg-white rounded-[16px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-[#EEEEEE] bg-[#FAFAFA]">
                            <h3 className="text-[14px] font-black text-[#111827] flex items-center gap-1.5">
                                <Package size={16} className="text-[#6B1D2E]" />
                                Products Sub-items List ({order.items.length})
                            </h3>
                        </div>

                        <div className="overflow-x-auto w-full">
                            <table className="w-full border-collapse text-left text-[13px]">
                                <thead>
                                    <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE] text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
                                        <th className="px-5 py-3 font-bold w-[60px] text-center">#</th>
                                        <th className="px-5 py-3 font-bold">Product Item</th>
                                        <th className="px-5 py-3 font-bold text-right w-[140px]">Unit Price</th>
                                        <th className="px-5 py-3 font-bold text-center w-[120px]">Quantity</th>
                                        <th className="px-5 py-3 font-bold text-right w-[140px]">Total Price</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#F3F4F6]">
                                    {order.items.map((item, idx) => (
                                        <tr key={item.id} className="hover:bg-[#F9FAFB]/30 transition-colors">
                                            <td className="px-5 py-4 text-center text-[12px] font-bold text-[#9CA3AF]">
                                                {idx + 1}
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="text-[13px] font-bold text-[#111827] block leading-tight">
                                                    {item.productName}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-right font-semibold text-[#4B5563]">
                                                {formatCurrency(item.unitPrice)}
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                {order.status === 'pending' ? (
                                                    <div className="inline-flex items-center">
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={editedQty[item.id] ?? item.quantity}
                                                            onChange={(e) => setEditedQty((prev) => ({ 
                                                                ...prev, 
                                                                [item.id]: Math.max(0, parseInt(e.target.value, 10) || 0) 
                                                            }))}
                                                            className="w-16 h-[30px] text-center border border-[#D1D5DB] rounded-[6px] text-[13px] font-bold outline-none focus:border-[#6B1D2E]"
                                                        />
                                                    </div>
                                                ) : (
                                                    <span className="font-extrabold text-[#111827] text-[13px]">{item.quantity}</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-right font-bold text-[#111827]">
                                                {formatCurrency(item.totalPrice)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Quantity modification warning / edit actions (pending only) */}
                        {order.status === 'pending' && (
                            <div className="p-4 bg-[#FFFBEB] border-t border-[#FDE68A] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-start gap-2 text-[12px] font-medium text-[#B45309]">
                                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                    <span>
                                        <strong>Auditor Action Required:</strong> Edit line quantities in table inputs above (setting 0 removes the product line).
                                    </span>
                                </div>
                                <button 
                                    onClick={handleSaveQuantities} 
                                    disabled={savingQty} 
                                    className="h-[34px] px-4 bg-[#6B1D2E] hover:bg-[#5A1926] text-white text-[12px] font-bold rounded-[8px] disabled:opacity-50 shrink-0 shadow-sm active:scale-97 transition-all flex items-center gap-1.5"
                                >
                                    {savingQty && <Loader2 size={12} className="animate-spin" />}
                                    Save Quantities
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Operational controls panel (Split Order & Reassign Vendor) */}
                    {order.status === 'pending' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                            {/* Split Order */}
                            <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm space-y-4 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center gap-2 border-b border-[#F3F4F6] pb-2 mb-3">
                                        <Scissors size={15} className="text-[#374151]" />
                                        <h4 className="text-[14px] font-black text-[#111827]">Split Off Order</h4>
                                    </div>
                                    <p className="text-[11px] text-[#6B7280] leading-relaxed mb-4">
                                        Move quantities of products below into a separate purchase order (remains with {order.vendor.businessName}).
                                    </p>
                                    <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                                        {order.items.map((i) => (
                                            <div key={i.id} className="flex items-center justify-between gap-2 bg-[#F9FAFB] p-2 rounded-lg border border-[#F3F4F6]">
                                                <span className="text-[12px] text-[#374151] font-semibold truncate max-w-[200px]" title={i.productName}>
                                                    {i.productName}
                                                </span>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <span className="text-[10px] text-[#9CA3AF] font-bold">Qty (Max {i.quantity}):</span>
                                                    <input 
                                                        type="number" 
                                                        min={0} 
                                                        max={i.quantity} 
                                                        value={splitQty[i.id] || 0}
                                                        onChange={(e) => setSplitQty((p) => ({ 
                                                            ...p, 
                                                            [i.id]: Math.max(0, Math.min(i.quantity, parseInt(e.target.value, 10) || 0)) 
                                                        }))}
                                                        className="w-14 h-[26px] text-center border border-[#D1D5DB] rounded-[4px] text-[11px] font-bold outline-none focus:border-[#6B1D2E]" 
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <button 
                                    onClick={handleSplit} 
                                    disabled={opsBusy} 
                                    className="h-[36px] w-full bg-[#181725] hover:bg-[#2A2B35] text-white text-[12px] font-bold rounded-[8px] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                                >
                                    {opsBusy && <Loader2 size={12} className="animate-spin" />}
                                    Create Split PO
                                </button>
                            </div>

                            {/* Reassign Vendor */}
                            <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm space-y-4 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center gap-2 border-b border-[#F3F4F6] pb-2 mb-3">
                                        <RefreshCw size={15} className="text-[#374151]" />
                                        <h4 className="text-[14px] font-black text-[#111827]">Reassign Vendor Partner</h4>
                                    </div>
                                    <p className="text-[11px] text-[#6B7280] leading-relaxed mb-4">
                                        Transfer this entire order to another commercial vendor partner. Fits matching inventory automatically.
                                    </p>
                                    
                                    <div className="space-y-1.5 pt-2">
                                        <label className="text-[10px] font-bold text-[#9CA3AF] uppercase">Select Eligible Vendor</label>
                                        <select 
                                            value={reassignTo} 
                                            onChange={(e) => setReassignTo(e.target.value)} 
                                            className="w-full h-[38px] border border-[#D1D5DB] bg-white rounded-[8px] px-3 text-[12px] font-semibold outline-none focus:border-[#6B1D2E]"
                                        >
                                            <option value="">Choose partner...</option>
                                            {vendorOptions.filter((v) => v.id !== order.vendor?.id).map((v) => (
                                                <option key={v.id} value={v.id}>{v.businessName}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleReassign} 
                                    disabled={opsBusy || !reassignTo} 
                                    className="h-[36px] w-full bg-[#181725] hover:bg-[#2A2B35] text-white text-[12px] font-bold rounded-[8px] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                                >
                                    {opsBusy && <Loader2 size={12} className="animate-spin" />}
                                    Reassign &amp; Re-route
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right side 1 column: Billing ledger, status overrides, and notes */}
                <div className="space-y-6">
                    {/* Status update selector card */}
                    <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm space-y-4">
                        <div className="border-b border-[#F3F4F6] pb-2">
                            <h4 className="text-[14px] font-black text-[#111827] flex items-center gap-1.5">
                                <CheckCircle2 size={15} className="text-[#6B1D2E]" />
                                Administrative Status Control
                            </h4>
                        </div>
                        
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-[#9CA3AF] uppercase">Set Order Status</label>
                                <select
                                    value={selectedStatus}
                                    onChange={(e) => setSelectedStatus(e.target.value)}
                                    disabled={updatingStatus}
                                    className="w-full h-[38px] px-3 bg-white border border-[#D1D5DB] rounded-[8px] text-[13px] font-bold text-[#374151] outline-none focus:border-[#6B1D2E] cursor-pointer"
                                >
                                    {ORDER_STATUSES.map((s) => (
                                        <option key={s} value={s}>
                                            {s.charAt(0).toUpperCase() + s.slice(1)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button
                                onClick={handleStatusUpdate}
                                disabled={updatingStatus || selectedStatus === order.status}
                                className={cn(
                                    'w-full h-[38px] rounded-[8px] text-[12px] font-bold transition-all shadow-sm flex items-center justify-center gap-1.5',
                                    selectedStatus === order.status
                                        ? 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed border border-[#E5E7EB]'
                                        : 'bg-[#6B1D2E] text-white hover:bg-[#5A1926] border border-[#6B1D2E] cursor-pointer'
                                )}
                            >
                                {updatingStatus ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    'Commit Status Update'
                                )}
                            </button>
                            
                            {selectedStatus !== order.status && (
                                <div className="text-[11px] text-[#B45309] bg-[#FFF8EB] border border-[#FEF3C7] p-2.5 rounded-lg flex items-center gap-1 font-bold">
                                    <CornerDownRight size={13} className="shrink-0" />
                                    <span>Transitions: {order.status} &rarr; {selectedStatus}</span>
                                </div>
                            )}
                        </div>
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
                                <span className="text-[#111827] font-bold">{formatCurrency(order.subtotal)}</span>
                            </div>
                            <div className="flex justify-between pb-3.5 border-b border-dashed border-[#D1D5DB]">
                                <span>Logistics Surcharge</span>
                                <span className="text-[#111827] font-bold">{formatCurrency(order.deliveryFee || 0)}</span>
                            </div>
                            <div className="flex justify-between items-center pt-1.5">
                                <span className="text-[14px] font-black text-[#111827]">Grand Total</span>
                                <span className="text-[20px] font-black text-[#111827]">{formatCurrency(order.totalAmount)}</span>
                            </div>
                        </div>

                        {order.paymentStatus === 'paid' && (
                            <div className="flex flex-col gap-2 pt-1 border-t border-[#E5E7EB]">
                                <a
                                    href={`/api/v1/admin/orders/${order.id}/invoice`}
                                    download
                                    className="w-full h-[38px] rounded-[8px] text-[12px] font-bold border border-[#6B1D2E]/40 text-[#6B1D2E] hover:bg-[#F8E8EC] transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <FileDown size={14} />
                                    Download Invoice
                                </a>
                                <button
                                    type="button"
                                    disabled={emailingInvoice || !order.user.email}
                                    onClick={async () => {
                                        setEmailingInvoice(true);
                                        try {
                                            const res = await fetch(`/api/v1/admin/orders/${order.id}/invoice?email=true`);
                                            const json = await res.json();
                                            if (!json.success) throw new Error(json.error?.message ?? 'Failed to email invoice');
                                            if (json.data?.emailed) {
                                                toast.success(`Invoice emailed to ${json.data.recipient}`);
                                            } else {
                                                toast.warning('SMTP not configured — use Download Invoice instead');
                                            }
                                        } catch (err) {
                                            toast.error(err instanceof Error ? err.message : 'Failed to email invoice');
                                        } finally {
                                            setEmailingInvoice(false);
                                        }
                                    }}
                                    className="w-full min-h-12 rounded-[12px] text-[13px] font-semibold bg-[#6B1D2E] text-white hover:bg-[#5A1926] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                                >
                                    {emailingInvoice ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                                    {emailingInvoice ? 'Sending…' : 'Email to Customer'}
                                </button>
                                {!order.user.email && (
                                    <p className="text-[10px] text-[#9CA3AF] text-center">Customer has no email on file</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Customer Notes */}
                    {order.notes && (
                        <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm space-y-2">
                            <h4 className="text-[13px] font-black text-[#111827] flex items-center gap-1">
                                <FileText size={14} className="text-[#9CA3AF]" />
                                Customer Dispatch Notes
                            </h4>
                            <p className="text-[12px] text-[#4B5563] font-semibold bg-[#FAFAFA] border border-[#F3F4F6] p-3 rounded-lg leading-relaxed">
                                {order.notes}
                            </p>
                        </div>
                    )}

                    {/* Credit Ledger transactions */}
                    {order.creditTxns.length > 0 && (
                        <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm space-y-3">
                            <div className="border-b border-[#F3F4F6] pb-2 flex items-center gap-1.5">
                                <Coins size={15} className="text-[#F59E0B]" />
                                <h4 className="text-[13px] font-black text-[#111827]">Credit Transactions</h4>
                            </div>
                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                {order.creditTxns.map((txn) => (
                                    <div
                                        key={txn.id}
                                        className="text-[12px] font-semibold py-2.5 border-b border-[#F3F4F6] last:border-0 flex flex-col gap-1.5"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={cn(
                                                'inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-wide',
                                                txn.type === 'credit'
                                                    ? 'bg-[#F8E8EC] border-[#6B1D2E]/10 text-[#6B1D2E]'
                                                    : 'bg-[#FDF2F2] border-[#EF4444]/10 text-[#EF4444]'
                                            )}>
                                                {txn.type}
                                            </span>
                                            <span className="text-[12px] font-bold text-[#111827]">{formatCurrency(txn.amount)}</span>
                                        </div>
                                        <div className="flex justify-between text-[10px] text-[#9CA3AF]">
                                            <span>{formatDate(txn.createdAt)}</span>
                                            <span>Balance After: {formatCurrency(txn.balanceAfter)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
