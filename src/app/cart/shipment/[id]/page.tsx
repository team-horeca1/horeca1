'use client';

import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Search, ChevronRight, Plus, Minus, FileText, AlertTriangle, Home } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import Link from 'next/link';

const SavingsDemo = 131;

export default function ShipmentDetailPage() {
    const router = useRouter();
    const { id } = useParams();
    const { groups, removeFromCart, adjustQuantity } = useCart();

    const shipment = React.useMemo(() => {
        if (id === 'cart-shipment') {
            const allItems = groups.flatMap(g =>
                g.items
                    .filter(item => !!item.product)
                    .map(item => ({
                        id: String(item.productId || (item.product && item.product.id)),
                        vendorId: g.vendorId,
                        name: item.product.name,
                        size: item.product.packSize || '1 pc',
                        pcs: item.quantity,
                        price: item.product.price || 0,
                        image: (item.product.images && item.product.images[0]) || '/images/recom-product/product-img10.png',
                    }))
            );
            return {
                id: 'cart-shipment',
                vendor: 'Your Cart',
                vendorId: 'cart',
                items: allItems,
            };
        }

        const targetGroup = groups.find(g => g.vendorId === id);
        if (targetGroup) {
            return {
                id: targetGroup.vendorId,
                vendor: targetGroup.vendorName,
                vendorId: targetGroup.vendorId,
                items: targetGroup.items.map(item => ({
                    id: String(item.productId),
                    vendorId: targetGroup.vendorId,
                    name: item.product.name,
                    size: item.product.packSize || '1 pc',
                    pcs: item.quantity,
                    price: item.product.price || 0,
                    image: item.product.images[0] || '/images/recom-product/product-img10.png',
                }))
            };
        }

        return {
            id: 'unknown',
            vendor: 'Unknown Vendor',
            vendorId: 'unknown',
            items: []
        };
    }, [id, groups]);

    const handleQuantityChange = (itemId: string, _vendorId: string, delta: number, currentPcs: number) => {
        const newQty = currentPcs + delta;
        if (newQty <= 0) {
            removeFromCart(itemId);
        } else {
            adjustQuantity(itemId, delta);
        }
    };

    const itemTotal = shipment.items.reduce((sum, item) => sum + item.price * item.pcs, 0);
    const totalPay = itemTotal;
    const minOrder = 600;
    const shortfall = minOrder - itemTotal;

    const handleProceedToPay = () => {
        // Hand off to the cart's real payment flow — the cart page will pre-select only this
        // vendor (via ?vendor=<id>) and jump straight to the Razorpay/COD payment screen
        // (via ?step=payment). This keeps order creation, payment popup, and signature verify
        // logic in one place.
        if (shipment.vendorId === 'cart') {
            router.push(`/cart?step=payment`);
            return;
        }
        router.push(`/cart?vendor=${encodeURIComponent(shipment.vendorId)}&step=payment`);
    };

    if (shipment.items.length === 0) {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
                <div className="w-full h-[12px] bg-[#53B175] fixed top-0" />
                <img src="/images/empty-cart.png" alt="Empty Cart" className="w-[180px] mb-8 opacity-20" />
                <h2 className="text-[20px] font-bold text-[#181725] mb-2">No items in this shipment</h2>
                <p className="text-[#7C7C7C] text-center mb-8">This vendor&apos;s shipment is empty. Start adding some products!</p>
                <button onClick={() => router.push('/')} className="bg-[#53B175] text-white px-12 py-4 rounded-xl font-bold hover:bg-[#48a068] transition-colors">
                    Start Shopping
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F9F9F9] flex flex-col pb-28 md:pb-16 font-sans">
            {/* Top Branding Bar */}
            <div className="w-full h-[12px] bg-[#53B175] sticky top-0 z-[110] md:hidden" />

            {/* Mobile Header */}
            <header className="md:hidden flex items-center justify-between px-4 h-[60px] bg-white border-b border-[#EEEEEE] sticky top-[12px] z-[100]">
                <button onClick={() => router.back()} className="p-2 -ml-2">
                    <ArrowLeft size={24} className="text-[#181725]" />
                </button>
                <h1 className="text-[20px] font-bold text-[#181725]">Cart</h1>
                <button className="p-2 -mr-2">
                    <Search size={24} className="text-[#181725]" strokeWidth={1.5} />
                </button>
            </header>

            {/* Desktop Header */}
            <div className="hidden md:block bg-[#F7F8FA] border-b border-gray-100">
                <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-5">
                    <div className="flex items-center gap-2 text-[13px] text-text-muted mb-3">
                        <Link href="/" className="hover:text-primary transition-colors flex items-center gap-1"><Home size={14} /><span>Home</span></Link>
                        <ChevronRight size={12} />
                        <Link href="/cart" className="hover:text-primary transition-colors">Cart</Link>
                        <ChevronRight size={12} />
                        <span className="text-text font-semibold">{shipment.vendor}</span>
                    </div>
                    <h1 className="text-[28px] font-black text-text tracking-tight">Shipment Details</h1>
                </div>
            </div>

            {/* Content Container */}
            <div className="flex-1 px-4 py-4 space-y-4 md:max-w-[var(--container-max)] md:mx-auto md:px-[var(--container-padding)] md:pt-8 md:w-full">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 lg:gap-10 items-start">
                    {/* Left Column - Items */}
                    <div className="space-y-4 md:space-y-5">
                        {/* Store Header Card */}
                        <div className="bg-white rounded-[12px] md:rounded-2xl border border-[#E2E2E2] p-4 md:px-7 md:py-5 flex items-start justify-between">
                            <div className="flex-1 pr-4">
                                <h3 className="text-[17px] md:text-[20px] font-bold text-[#181725] leading-tight">{shipment.vendor}</h3>
                                <p className="text-[12px] md:text-[13px] text-[#7C7C7C] font-medium mt-1 leading-tight">
                                    Items from this vendor will be packed separately
                                </p>
                            </div>
                            <button className="flex items-center gap-1.5 border border-[#EEEEEE] px-3 py-1 rounded-full text-[11px] md:text-[12px] font-bold text-[#181725] bg-white whitespace-nowrap shadow-sm active:scale-95 hover:border-primary/30 hover:text-primary transition-all">
                                Visit store <ChevronRight size={13} strokeWidth={3} />
                            </button>
                        </div>

                        {/* Mobile + Tablet Items Card */}
                        <div className="lg:hidden bg-white rounded-[12px] border border-[#E2E2E2] overflow-hidden">
                            <div className="divide-y divide-[#F2F3F2]">
                                {shipment.items.map((item) => (
                                    <div key={item.id} className="p-4 flex items-start gap-4">
                                        <div className="flex items-center">
                                            <div className="w-[68px] h-[68px] rounded-full bg-white flex items-center justify-center shrink-0">
                                                <img src={item.image} alt={item.name} className="max-w-full max-h-full object-contain" />
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between">
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="text-[16px] font-bold text-[#181725] leading-tight">{item.name}</h4>
                                                    <p className="text-[12px] text-[#7C7C7C] font-medium mt-1">{item.size} * {item.pcs} pc</p>
                                                    <p className="text-[11px] text-[#53B175] font-bold mt-1">From {shipment.vendor}</p>
                                                </div>
                                                <div className="text-right pl-2 shrink-0">
                                                    <span className="text-[15px] font-bold text-[#181725]">₹{item.price}/pc</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-end mt-2">
                                                <div className="flex items-center border border-[#E2E2E2] rounded-full px-2 py-0.5 bg-white scale-90 origin-right">
                                                    <button
                                                        onClick={() => handleQuantityChange(item.id, item.vendorId, -1, item.pcs)}
                                                        className="w-[28px] h-[28px] flex items-center justify-center text-[#53B175] active:scale-75 transition-transform"
                                                    >
                                                        <Minus size={16} strokeWidth={3} />
                                                    </button>
                                                    <div className="w-[24px] flex items-center justify-center">
                                                        <span className="text-[14px] font-bold text-[#181725]">{item.pcs}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => handleQuantityChange(item.id, item.vendorId, 1, item.pcs)}
                                                        className="w-[28px] h-[28px] flex items-center justify-center text-[#53B175] active:scale-75 transition-transform"
                                                    >
                                                        <Plus size={16} strokeWidth={3} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Desktop Items - Full Width Inline Layout */}
                        <div className="hidden lg:block bg-white rounded-2xl border border-[#E2E2E2] overflow-hidden shadow-sm">
                            <div className="divide-y divide-[#F5F5F5]">
                                {shipment.items.map((item) => (
                                    <div key={item.id} className="px-7 py-5 flex items-center gap-5 hover:bg-gray-50/40 transition-colors group">
                                        {/* Product Image */}
                                        <div className="w-[72px] h-[72px] rounded-2xl bg-[#F7F8F7] flex items-center justify-center shrink-0 border border-gray-100 p-2 group-hover:border-primary/10 transition-colors">
                                            <img src={item.image} alt={item.name} className="max-w-full max-h-full object-contain" />
                                        </div>

                                        {/* Product Info */}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-[15px] font-bold text-[#181725] leading-snug line-clamp-1">{item.name}</h4>
                                            <p className="text-[13px] text-gray-400 font-medium mt-0.5">{item.size} · {item.pcs} pc</p>
                                            <p className="text-[12px] text-primary font-bold mt-0.5">From {shipment.vendor}</p>
                                        </div>

                                        {/* Quantity Controls */}
                                        <div className="flex items-center gap-0 border border-gray-200 rounded-xl overflow-hidden shrink-0">
                                            <button
                                                onClick={() => handleQuantityChange(item.id, item.vendorId, -1, item.pcs)}
                                                className="w-10 h-10 flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors"
                                            >
                                                <Minus size={16} strokeWidth={2.5} />
                                            </button>
                                            <div className="w-10 h-10 flex items-center justify-center border-x border-gray-200">
                                                <span className="text-[15px] font-bold text-[#181725]">{item.pcs}</span>
                                            </div>
                                            <button
                                                onClick={() => handleQuantityChange(item.id, item.vendorId, 1, item.pcs)}
                                                className="w-10 h-10 flex items-center justify-center text-primary hover:bg-green-50 transition-colors"
                                            >
                                                <Plus size={16} strokeWidth={2.5} />
                                            </button>
                                        </div>

                                        {/* Price */}
                                        <div className="text-right shrink-0 w-[80px]">
                                            <span className="text-[16px] font-black text-[#181725]">₹{(item.price * item.pcs).toFixed(0)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Minimum Order Warning - Mobile + Tablet */}
                        <div className="lg:hidden bg-white rounded-[10px] border border-[#E2E2E2] px-4 py-3 flex items-center gap-3">
                            <AlertTriangle size={24} className="text-[#555555] shrink-0" fill="#555555" stroke="white" strokeWidth={2.5} />
                            <p className="text-[12px] text-[#181725] font-bold leading-snug">
                                Minimum order for selected items is ₹600. Add <span className="text-[#181725] font-black">₹{Math.max(0, Math.round(shortfall))}</span> more to proceed.
                            </p>
                        </div>
                    </div>

                    {/* Right Column - Bill Summary (Desktop) */}
                    <div className="hidden lg:block sticky top-[80px] space-y-5">
                        <div className="bg-white rounded-2xl border border-[#E2E2E2] overflow-hidden shadow-sm">
                            <div className="px-7 py-5 flex items-center gap-3 border-b border-[#F0F0F0]">
                                <div className="w-[38px] h-[38px] rounded-xl border border-[#E2E2E2] flex items-center justify-center shrink-0 bg-gray-50">
                                    <FileText size={18} className="text-[#181725]" />
                                </div>
                                <span className="text-[17px] font-bold text-[#181725]">Bill Summary</span>
                            </div>
                            <div className="px-7 py-6 space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-[15px] text-[#4C4F4D] font-medium">Item Total</span>
                                    <span className="text-[15px] font-bold text-[#181725]">₹ {itemTotal}</span>
                                </div>
                            </div>
                            <div className="px-7 pb-6">
                                <div className="border-t border-dashed border-[#D0D0D0] pt-5">
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-[18px] font-bold text-[#181725]">To Pay</span>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[24px] font-black text-[#181725]">₹ {totalPay.toFixed(2)}</span>
                                            <span className="text-[12px] text-[#7C7C7C] font-semibold line-through">₹{(totalPay + SavingsDemo).toFixed(0)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleProceedToPay}
                            className="w-full bg-[#53B175] text-white py-5 rounded-2xl font-bold text-[18px] transition-all hover:bg-[#48a068] active:scale-[0.98] shadow-lg shadow-[#53B175]/20 flex items-center justify-center gap-2"
                        >
                            Proceed to pay · ₹{totalPay.toFixed(0)}
                        </button>

                        <div className="bg-white rounded-2xl border border-[#E2E2E2] px-6 py-4 flex items-center gap-4">
                            <AlertTriangle size={24} className="text-[#555555] shrink-0" fill="#555555" stroke="white" strokeWidth={2.5} />
                            <p className="text-[13px] text-[#181725] font-bold leading-snug">
                                Minimum order for selected items is ₹600. Add <span className="text-[#181725] font-black">₹{Math.max(0, Math.round(shortfall))}</span> more to proceed.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Mobile + Tablet Bill Summary */}
                <div className="lg:hidden bg-white rounded-[12px] border border-[#E2E2E2] shadow-sm">
                    <div className="px-4 py-4 flex items-center gap-3 border-b border-[#F2F3F2]">
                        <div className="w-[38px] h-[38px] border border-[#EEEEEE] rounded-[10px] flex items-center justify-center bg-white">
                            <FileText size={20} className="text-[#181725]" strokeWidth={2} />
                        </div>
                        <h3 className="text-[17px] font-bold text-[#181725]">Bill Summary</h3>
                    </div>
                    <div className="px-5 py-4 space-y-3.5">
                        <div className="flex justify-between items-center text-[14px] font-medium text-[#7C7C7C]">
                            <span>Item Total</span>
                            <span className="text-[#181725] font-bold">₹ {itemTotal}</span>
                        </div>
                        <div className="pt-2">
                            <div className="border-t border-dashed border-[#CFCECE] w-full" />
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-[16px] font-bold text-[#181725]">To Pay</span>
                            <div className="text-right">
                                <div className="text-[18px] font-black text-[#181725]">₹ {totalPay.toFixed(2)}</div>
                                <div className="text-[11px] text-[#7C7C7C] font-semibold line-through">₹{(totalPay + SavingsDemo).toFixed(0)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sticky Bottom Action - Mobile + Tablet */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-[#F2F3F2] z-[100]">
                <button
                    onClick={handleProceedToPay}
                    className="w-full bg-[#53B175] text-white py-[18px] rounded-[18px] font-bold text-[18px] transition-all active:scale-[0.98] shadow-lg shadow-[#53B175]/20"
                >
                    Proceed to pay · ₹{totalPay.toFixed(0)}
                </button>
            </div>
        </div>
    );
}
