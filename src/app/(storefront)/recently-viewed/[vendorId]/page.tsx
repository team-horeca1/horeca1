'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Plus, Minus, ShoppingCart, Eye, Home, ChevronRight, ChevronUp, ChevronDown, Building2, X, FileText, AlertTriangle } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { StickyCartBar } from '@/components/features/vendor/StickyCartBar';
import { toast } from 'sonner';
import type { VendorProduct } from '@/types';

interface ViewedProduct {
    id: string;
    name: string;
    image: string;
    price: number;
    unit: string;
}

export default function RecentlyViewedPage() {
    const router = useRouter();
    const params = useParams();
    const vendorId = params.vendorId as string;
    const { addToCart, groups, updateQuantity } = useCart();

    const [products, setProducts] = useState<ViewedProduct[]>([]);
    const [vendorName, setVendorName] = useState('');
    const [vendorLogo, setVendorLogo] = useState('');
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [expandedVendors, setExpandedVendors] = useState<Record<string, boolean>>({});

    const toggleVendor = (vid: string) => {
        setExpandedVendors(prev => ({ ...prev, [vid]: prev[vid] !== false ? false : true }));
    };
    const isExpanded = (vid: string) => expandedVendors[vid] !== false;

    // No blocking spinner — empty state first paint; hydrate from localStorage (AUD-001)
    useEffect(() => {
        try {
            const saved = localStorage.getItem('horeca_recently_viewed');
            if (!saved) {
                setProducts([]);
                setVendorName('');
                setVendorLogo('');
                setQuantities({});
                return;
            }
            const entries = JSON.parse(saved) as Array<{
                vendorId: string;
                vendorName?: string;
                vendorLogo?: string;
                viewedProducts?: ViewedProduct[];
            }>;
            const entry = entries.find((e) => e.vendorId === vendorId);
            if (!entry) {
                setProducts([]);
                setVendorName('');
                setVendorLogo('');
                setQuantities({});
                return;
            }
            const viewedProducts = entry.viewedProducts || [];
            setVendorName(entry.vendorName || 'Vendor');
            setVendorLogo(entry.vendorLogo || '');
            setProducts(viewedProducts);
            setQuantities(Object.fromEntries(viewedProducts.map((p) => [p.id, 1])));
        } catch (e) {
            console.error('Failed to load recently viewed:', e);
            setProducts([]);
        }
    }, [vendorId]);

    const updateQty = (productId: string, delta: number) => {
        setQuantities(prev => ({
            ...prev,
            [productId]: Math.max(0, (prev[productId] || 0) + delta),
        }));
    };

    const setQty = (productId: string, val: number) => {
        setQuantities(prev => ({ ...prev, [productId]: Math.max(0, val) }));
    };

    const activeItems = useMemo(() => {
        return Object.entries(quantities).filter(([, qty]) => qty > 0);
    }, [quantities]);

    const totalAmount = useMemo(() => {
        return activeItems.reduce((sum, [pid, qty]) => {
            const product = products.find(p => p.id === pid);
            return sum + (product ? product.price * qty : 0);
        }, 0);
    }, [activeItems, products]);

    const handleAddAllToCart = () => {
        if (activeItems.length === 0) {
            toast.error("No items selected", {
                description: "Please select quantities for items you want to add to cart.",
                duration: 3000,
            });
            return;
        }

        let itemsAdded = 0;
        activeItems.forEach(([pid, qty]) => {
            const product = products.find(p => p.id === pid);
            if (product && qty > 0) {
                const vendorProduct: VendorProduct = {
                    id: product.id,
                    vendorId: vendorId,
                    vendorName: vendorName,
                    name: product.name,
                    description: '',
                    category: '',
                    price: product.price,
                    images: [product.image],
                    packSize: product.unit,
                    unit: product.unit,
                    stock: 100,
                    isActive: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    bulkPrices: [],
                    creditBadge: false,
                    minOrderQuantity: 1,
                };
                addToCart(vendorProduct, qty);
                itemsAdded++;
            }
        });

        if (itemsAdded > 0) {
            toast.success(`Added to cart!`, {
                description: `Successfully added ${itemsAdded} items from ${vendorName} to your cart.`,
                duration: 2500,
            });
            router.push('/cart');
        }
    };

    if (products.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white p-6">
                <div className="text-center max-w-xs">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Eye size={40} className="text-gray-200" />
                    </div>
                    <h2 className="text-[20px] font-bold text-[#181725] mb-2">No recently viewed items</h2>
                    <p className="text-[14px] text-gray-400 font-medium mb-8">Browse vendor stores to see your recently viewed products here.</p>
                    <Link
                        href="/"
                        className="inline-block w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-green-100 text-center"
                    >
                        Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F2F3F2] flex flex-col pb-32 lg:pb-16">

            {/* Desktop Header */}
            <div className="hidden md:block bg-[#F7F8FA] border-b border-gray-100">
                <div className="md:max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-6">
                    <div className="flex items-center gap-2 text-[13px] text-text-muted mb-3">
                        <Link href="/" className="hover:text-primary transition-colors flex items-center gap-1">
                            <Home size={14} />
                            <span>Home</span>
                        </Link>
                        <ChevronRight size={12} />
                        <span className="text-text font-semibold truncate">Recently Viewed</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-[32px] font-black text-text tracking-tight leading-none mb-2">Recently Viewed</h1>
                            <p className="text-[16px] text-primary font-black flex items-center gap-2">
                                <Building2 size={18} />
                                {vendorName}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Header */}
            <div className="md:hidden bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 min-w-0">
                            <button
                                onClick={() => router.back()}
                                className="p-1 -ml-1 hover:bg-gray-50 rounded-full transition-colors shrink-0"
                            >
                                <ChevronLeft size={22} className="text-[#181725]" />
                            </button>
                            <div className="min-w-0">
                                <h1 className="text-[17px] min-[340px]:text-[19px] font-bold text-[#181725] truncate">Recently Viewed</h1>
                                <p className="text-[11px] min-[340px]:text-[13px] text-[#8b5cf6] font-black mt-0.5 truncate">{vendorName}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 px-4 pt-4 md:max-w-[var(--container-max)] md:mx-auto md:px-[var(--container-padding)] md:pt-8 md:w-full">
                <div className="md:grid md:grid-cols-1 lg:grid-cols-[1fr_400px] lg:gap-10 md:items-start">

                    {/* ===== LEFT COLUMN — Product List ===== */}
                    <div className="space-y-3 md:space-y-5">
                        <div className="bg-white rounded-2xl border border-[#E2E2E2] overflow-hidden shadow-sm">
                            {/* Vendor Header */}
                            <div
                                className="px-4 py-3 min-[340px]:px-7 min-[340px]:py-5 flex items-center justify-between bg-[#FAFAFA] border-b border-[#F0F0F0] cursor-pointer"
                                onClick={() => toggleVendor(vendorId)}
                            >
                                <div className="flex items-center gap-2 min-[340px]:gap-3 flex-1 min-w-0">
                                    {vendorLogo && (
                                        <div className="w-10 h-10 min-[340px]:w-14 min-[340px]:h-14 md:w-16 md:h-16 rounded-full overflow-hidden shrink-0 shadow-sm">
                                            <img src={vendorLogo} alt="" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <h3 className="text-[15px] min-[340px]:text-[17px] font-bold text-[#181725]">{vendorName}</h3>
                                        <p className="text-[11px] min-[340px]:text-[13px] text-gray-400 font-medium">{products.length} item{products.length !== 1 ? 's' : ''}</p>
                                    </div>
                                </div>
                                <button className="w-8 h-8 min-[340px]:w-9 min-[340px]:h-9 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors shrink-0">
                                    {isExpanded(vendorId)
                                        ? <ChevronUp size={18} className="text-gray-500" strokeWidth={2.5} />
                                        : <ChevronDown size={18} className="text-gray-500" strokeWidth={2.5} />}
                                </button>
                            </div>

                            {/* Items — collapsible */}
                            {isExpanded(vendorId) && (
                                <div className="divide-y divide-[#F5F5F5] border-t border-[#F0F0F0]">
                                    {products.map((product) => {
                                        const qty = quantities[product.id] || 0;
                                        const itemTotal = product.price * qty;
                                        return (
                                            <div key={product.id} className="px-3 py-3 min-[340px]:px-5 min-[340px]:py-4 md:px-7 md:py-5 flex items-center gap-2 min-[340px]:gap-3 md:gap-5 hover:bg-gray-50/40 transition-colors group">
                                                {/* Image */}
                                                <div className="w-10 h-10 min-[340px]:w-14 min-[340px]:h-14 md:w-[72px] md:h-[72px] rounded-xl md:rounded-2xl bg-[#F7F8F7] flex items-center justify-center shrink-0 border border-gray-100 p-1 md:p-2 group-hover:border-primary/10 transition-colors">
                                                    <img src={product.image || '/images/recom-product/product-img10.png'} alt={product.name} className="max-w-full max-h-full object-contain" />
                                                </div>

                                                {/* Info */}
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-[12px] min-[340px]:text-[14px] md:text-[15px] font-bold text-[#181725] leading-snug line-clamp-2">{product.name}</h4>
                                                    <p className="text-[10px] min-[340px]:text-[12px] md:text-[13px] text-gray-400 font-medium mt-0.5">{product.unit || '1 pc'}</p>
                                                    <div className="flex items-center gap-1.5 md:gap-2 mt-1">
                                                        <div className="w-[4px] h-[4px] md:w-[6px] md:h-[6px] rounded-full bg-primary" />
                                                        <span className="text-[9px] min-[340px]:text-[11px] md:text-[12px] text-gray-400 font-medium whitespace-nowrap">₹{product.price}/pc</span>
                                                    </div>
                                                </div>

                                                {/* Qty Controls */}
                                                <div className="flex items-center gap-0 border border-gray-200 rounded-lg md:rounded-xl overflow-hidden shrink-0">
                                                    <button
                                                        onClick={() => updateQty(product.id, -1)}
                                                        className="w-7 h-7 min-[340px]:w-8 min-[340px]:h-8 md:w-10 md:h-10 flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors"
                                                    >
                                                        <Minus className="w-3 h-3 min-[340px]:w-3.5 min-[340px]:h-3.5 md:w-4 md:h-4" strokeWidth={3} />
                                                    </button>
                                                    <div className="w-8 h-7 min-[340px]:w-10 min-[340px]:h-8 md:w-12 md:h-10 flex items-center justify-center border-x border-gray-200">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={qty}
                                                            onChange={(e) => setQty(product.id, parseInt(e.target.value) || 0)}
                                                            className="w-full text-center text-[12px] md:text-[15px] font-bold text-[#181725] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-transparent"
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={() => updateQty(product.id, 1)}
                                                        className="w-7 h-7 min-[340px]:w-8 min-[340px]:h-8 md:w-10 md:h-10 flex items-center justify-center text-primary hover:bg-primary-light transition-colors"
                                                    >
                                                        <Plus className="w-3 h-3 min-[340px]:w-3.5 min-[340px]:h-3.5 md:w-4 md:h-4" strokeWidth={2.5} />
                                                    </button>
                                                </div>

                                                {/* Total — hidden on mobile */}
                                                <div className="hidden md:block text-right shrink-0 w-[90px]">
                                                    <span className={`text-[16px] font-black ${qty > 0 ? 'text-[#181725]' : 'text-gray-400'}`}>
                                                        {qty > 0 ? `₹${itemTotal.toLocaleString('en-IN')}` : '—'}
                                                    </span>
                                                </div>

                                                {/* Clear qty button — hidden on mobile */}
                                                <button
                                                    onClick={() => setQty(product.id, 0)}
                                                    className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                                                    title="Clear quantity"
                                                >
                                                    <X size={16} strokeWidth={3} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ===== RIGHT COLUMN — Sticky Sidebar (desktop only) ===== */}
                    <div className="hidden lg:block sticky top-[80px] space-y-4">
                        {/* Order Summary Card */}
                        <div className="bg-white rounded-2xl border border-[#E2E2E2] overflow-hidden shadow-sm">
                            <div className="px-7 py-5 flex items-center gap-3 border-b border-[#F0F0F0]">
                                <div className="w-[38px] h-[38px] rounded-xl border border-[#E2E2E2] flex items-center justify-center shrink-0 bg-gray-50">
                                    <FileText size={18} className="text-[#181725]" />
                                </div>
                                <span className="text-[17px] font-bold text-[#181725]">Order Summary</span>
                            </div>

                            <div className="px-7 py-6 space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-[15px] text-[#4C4F4D] font-medium">Items viewed</span>
                                    <span className="text-[15px] font-black text-[#181725]">{products.length}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[15px] text-[#4C4F4D] font-medium">Selected</span>
                                    <span className="text-[15px] font-black text-[#181725]">{activeItems.length} item{activeItems.length !== 1 ? 's' : ''}</span>
                                </div>
                            </div>

                            <div className="px-7 pb-6">
                                <div className="border-t border-dashed border-[#D0D0D0] pt-5">
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-[18px] font-bold text-[#181725]">Total</span>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[24px] font-black text-[#181725]">
                                                {activeItems.length > 0 ? `₹${totalAmount.toLocaleString('en-IN')}` : '₹0'}
                                            </span>
                                            {activeItems.length === 0 && (
                                                <span className="text-[12px] text-gray-400 font-medium mt-0.5">Set quantities above</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Add to Cart Button */}
                        <button
                            onClick={handleAddAllToCart}
                            className="w-full bg-primary text-white py-5 rounded-2xl font-bold text-[18px] transition-all hover:bg-primary-dark active:scale-[0.98] shadow-lg shadow-primary/20 flex items-center justify-center gap-3"
                        >
                            <ShoppingCart size={22} strokeWidth={2.5} />
                            Add to Cart
                        </button>

                        {/* Browse Vendor */}
                        <Link
                            href={`/vendor/${vendorId}`}
                            className="block w-full bg-white text-[#8b5cf6] px-6 py-4 border-2 border-[#8b5cf6]/15 rounded-2xl text-[15px] font-black shadow-sm hover:bg-[#8b5cf6]/5 transition-all text-center"
                        >
                            Browse {vendorName}&apos;s Store →
                        </Link>
                    </div>
                </div>

                {/* Mobile Bill Summary */}
                <div className="lg:hidden mt-3 bg-white rounded-[16px] border border-[#CFCECE] overflow-hidden">
                    <div className="p-4 flex items-center gap-3 border-b border-[#F0F0F0]">
                        <div className="w-[34px] h-[34px] rounded-[8px] border border-[#E2E2E2] flex items-center justify-center shrink-0">
                            <FileText size={16} className="text-[#181725]" />
                        </div>
                        <span className="text-[15px] font-bold text-[#181725]">Order Summary</span>
                    </div>
                    <div className="px-5 pt-5 pb-2 space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-[14px] text-[#4C4F4D] font-medium">Items viewed</span>
                            <span className="text-[14px] font-black text-[#181725]">{products.length}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-[14px] text-[#4C4F4D] font-medium">Selected</span>
                            <span className="text-[14px] font-black text-[#181725]">{activeItems.length} item{activeItems.length !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div className="px-5 pb-5 pt-2">
                        <div className="border-t border-dashed border-[#D0D0D0] pt-4">
                            <div className="flex justify-between items-baseline">
                                <span className="text-[16px] font-bold text-[#181725]">Total</span>
                                <span className="text-[20px] font-extrabold text-[#181725]">
                                    {activeItems.length > 0 ? `₹${totalAmount.toLocaleString('en-IN')}` : '₹0'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Fixed Bottom CTA — Mobile + Tablet */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 px-5 pb-6 pt-3 bg-gradient-to-t from-white via-white to-transparent z-50">
                <button
                    onClick={handleAddAllToCart}
                    className="w-full bg-primary text-white py-[18px] rounded-[16px] font-bold text-[18px] transition-all active:scale-[0.98] shadow-lg shadow-primary/20 flex items-center justify-center gap-3"
                >
                    <ShoppingCart size={22} strokeWidth={2.5} />
                    Add to Cart
                    {activeItems.length > 0 && (
                        <span className="bg-white/20 px-2.5 py-0.5 rounded-full text-[14px]">{activeItems.length}</span>
                    )}
                </button>
            </div>
        </div>
    );
}
