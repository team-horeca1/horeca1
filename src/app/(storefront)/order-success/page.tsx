'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Clock, Store, ShoppingCart, FileDown, ArrowRight, Home, Package } from 'lucide-react';

interface OrderSummary {
    id: string;
    orderNumber: string;
    vendorId: string;
    vendorName: string;
    totalAmount: number;
    savings: number;
    itemCount: number;
    status: string;
    deliverySlot?: string;
}

export default function OrderSuccessPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const orderIds = searchParams?.get('ids')?.split(',') || [];
    const lastVendorId = searchParams?.get('vendor') || '';

    const [orders, setOrders] = useState<OrderSummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (orderIds.length === 0) { Promise.resolve().then(() => setLoading(false)); return; }
        Promise.all(orderIds.map(id =>
            fetch(`/api/v1/orders/${id}`).then(r => r.json())
        ))
            .then(results => {
                const summaries: OrderSummary[] = results
                    .filter((r) => r?.success && r.data)
                    .map(r => {
                    const d = r.data;
                    return {
                        id: d.id,
                        orderNumber: d.orderNumber,
                        vendorId: d.vendor?.id || d.vendorId,
                        vendorName: d.vendor?.businessName || d.vendorName || 'Vendor',
                        totalAmount: Number(d.totalAmount) || 0,
                        savings: (Number(d.promoDiscount) || 0) + (Number(d.couponDiscount) || 0) + (Number(d.walletApplied) || 0),
                        itemCount: d.items?.length || 0,
                        status: d.status || 'pending',
                        deliverySlot: d.deliverySlot?.slotStart ? `${d.deliverySlot.slotStart}` : undefined,
                    };
                });
                setOrders(summaries);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [orderIds.length]);

    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
            {/* Success Icon */}
            <div className="w-[120px] h-[120px] md:w-[150px] md:h-[150px] bg-primary/10 rounded-full flex items-center justify-center mb-8 md:mb-10 relative">
                <div className="absolute inset-0 bg-primary/5 rounded-full animate-ping duration-[2000ms]" />
                <CheckCircle2 size={60} className="text-primary relative z-10 md:!w-20 md:!h-20" strokeWidth={3} />
            </div>

            <h1 className="text-[28px] md:text-[40px] font-black text-[#181725] leading-tight mb-4 tracking-tight text-center">
                Order{orders.length > 1 ? 's' : ''} Placed!
            </h1>
            <p className="text-[16px] md:text-[18px] text-[#7C7C7C] font-medium mb-8 max-w-[450px] text-center">
                Your purchase order{orders.length > 1 ? 's have' : ' has'} been sent to the vendor{orders.length > 1 ? 's' : ''}.
                {orders.length > 1 ? ' Each will be processed separately.' : ''}
            </p>

            {/* Order Summaries */}
            {loading ? (
                <div className="w-full max-w-[500px] space-y-3 mb-8">
                    {[1,2].map(i => (
                        <div key={i} className="bg-gray-50 rounded-2xl p-5 animate-pulse h-24" />
                    ))}
                </div>
            ) : orders.length > 0 ? (
                <div className="w-full max-w-[500px] space-y-3 mb-8">
                    {orders.map((order) => (
                        <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider">{order.orderNumber}</span>
                                <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                    <Clock size={10} />
                                    Pending Vendor Confirmation
                                </span>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                                <Store size={14} className="text-primary" />
                                <p className="text-[14px] font-black text-[#181725]">{order.vendorName}</p>
                            </div>
                            <div className="flex items-center gap-4 text-[11px] text-gray-500 font-medium">
                                <span className="flex items-center gap-1"><Package size={11} />{order.itemCount} items</span>
                                <span>₹{Number(order.totalAmount).toLocaleString('en-IN')}</span>
                                {order.deliverySlot && (
                                    <span className="flex items-center gap-1"><Clock size={11} />{order.deliverySlot}</span>
                                )}
                            </div>
                            {order.savings > 0 && (
                                <p className="mt-2 text-[11px] font-bold text-success">
                                    You saved ₹{Number(order.savings).toLocaleString('en-IN')} on this order
                                </p>
                            )}
                            <Link
                                href={`/api/v1/orders/${order.id}/invoice`}
                                className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black text-primary hover:text-primary-dark transition-colors"
                            >
                                <FileDown size={12} /> Download Invoice
                            </Link>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center text-gray-400 mb-8">
                    <p className="text-[14px] font-medium">Order details will appear here.</p>
                </div>
            )}

            {/* CTAs */}
            <div className="w-full max-w-[400px] flex flex-col gap-3">
                <Link
                    href={lastVendorId ? `/vendor/${lastVendorId}` : '/vendors'}
                    className="w-full bg-primary text-white py-[18px] md:py-[22px] rounded-[18px] font-black text-[16px] shadow-xl shadow-green-100/80 hover:bg-primary-dark transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2"
                >
                    <ShoppingCart size={18} />
                    Place Another Order
                </Link>
                <Link
                    href="/orders"
                    className="w-full border-2 border-gray-200 text-[#181725] font-black text-[16px] py-4 rounded-[18px] hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                    <ArrowRight size={18} />
                    View My Orders
                </Link>
                <Link
                    href="/"
                    className="text-[#7C7C7C] font-bold text-[14px] py-3 hover:text-gray-600 transition-colors flex items-center justify-center gap-1"
                >
                    <Home size={14} />
                    Back to Home
                </Link>
            </div>
        </div>
    );
}
