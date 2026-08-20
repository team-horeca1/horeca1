'use client';

import React, { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Plus, Minus, ShoppingCart, ClipboardList, Home, ChevronRight, ChevronUp, ChevronDown, Building2, RotateCcw, AlertTriangle, FileText, X } from 'lucide-react';
import { dal } from '@/lib/dal';
import type { Vendor, VendorProduct, OrderList } from '@/types';
import { useCart } from '@/context/CartContext';
import { StickyCartBar } from '@/components/features/vendor/StickyCartBar';
import { toast } from 'sonner';

export default function OrderListDetailPage() {
    const router = useRouter();
    const params = useParams();
    const listId = params.id as string;
    const { addToCart, totalItems } = useCart();
    const [orderList, setOrderList] = useState<OrderList | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [vendorsList, setVendorsList] = useState<Vendor[]>([]);

    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [expandedVendors, setExpandedVendors] = useState<Record<string, boolean>>({});
    // Fresh per-product stock (productId -> stock) — refreshed periodically so others' purchases lower this in near real-time.
    const [freshStock, setFreshStock] = useState<Record<string, number>>({});

    const toggleVendor = (vendorId: string) => {
        setExpandedVendors(prev => ({ ...prev, [vendorId]: prev[vendorId] !== false ? false : true }));
    };
    const isExpanded = (vendorId: string) => expandedVendors[vendorId] !== false;

    // Load vendors from DAL
    React.useEffect(() => {
        dal.vendors.list()
            .then(result => setVendorsList(result.vendors))
            .catch(() => setVendorsList([]));
    }, []);

    React.useEffect(() => {
        // DB is the source of truth. Always fetch fresh so product price/stock
        // reflects current data, not whatever the cache last saw.
        dal.lists.getById(listId)
            .then((list) => {
                if (list) {
                    setOrderList({ ...list, items: list.items ?? [] });
                    setQuantities(Object.fromEntries((list.items || []).map((item) => [item.productId, item.defaultQty || 0])));
                }
                setIsLoading(false);
            })
            .catch(() => {
                setIsLoading(false);
            });
    }, [listId]);

    // Poll fresh stock every 30s + on focus, so other shoppers' purchases lower stock here too.
    React.useEffect(() => {
        if (!orderList) return;
        const vendorIds = Array.from(new Set((orderList.items ?? []).map(i => i.product?.vendorId).filter(Boolean) as string[]));
        if (vendorIds.length === 0) return;

        let cancelled = false;
        const refresh = async () => {
            try {
                const results = await Promise.all(vendorIds.map(vid => dal.vendors.getProducts(vid).catch(() => ({ products: [] as VendorProduct[] }))));
                if (cancelled) return;
                const map: Record<string, number> = {};
                results.forEach(r => {
                    r.products.forEach(p => { map[p.id] = p.stock; });
                });
                setFreshStock(map);
            } catch (err) {
                console.error('Stock refresh failed', err);
            }
        };

        refresh();
        const interval = setInterval(refresh, 30_000);
        const onFocus = () => refresh();
        window.addEventListener('focus', onFocus);
        return () => {
            cancelled = true;
            clearInterval(interval);
            window.removeEventListener('focus', onFocus);
        };
    }, [orderList]);

    // Resolve current stock — fresh poll value if available, else original product stock.
    const getStock = (productId: string, fallback: number) =>
        freshStock[productId] !== undefined ? freshStock[productId] : fallback;

    const stockOf = (productId: string): number => {
        const item = orderList?.items.find(i => i.productId === productId);
        return getStock(productId, item?.product?.stock ?? 0);
    };

    const updateQty = (productId: string, delta: number) => {
        setQuantities(prev => {
            const cap = stockOf(productId);
            const next = Math.max(0, (prev[productId] || 0) + delta);
            if (delta > 0 && next > cap) {
                toast.error(`Only ${cap} in stock`, { duration: 1500 });
                return { ...prev, [productId]: cap };
            }
            return { ...prev, [productId]: next };
        });
    };

    const setQty = (productId: string, val: number) => {
        const cap = stockOf(productId);
        const clamped = Math.min(cap, Math.max(0, val));
        if (val > cap) {
            toast.error(`Only ${cap} in stock`, { duration: 1500 });
        }
        setQuantities(prev => ({ ...prev, [productId]: clamped }));
    };

    const removeProduct = (productId: string) => {
        if (!orderList) return;
        const productName = orderList.items.find(i => i.productId === productId)?.product.name || 'Item';
        const nextItems = (orderList.items ?? []).filter(i => i.productId !== productId);
        const nextList: OrderList = { ...orderList, items: nextItems };
        setOrderList(nextList);
        setQuantities(prev => {
            const next = { ...prev };
            delete next[productId];
            return next;
        });

        // Persist to localStorage if list lives there
        const saved = localStorage.getItem('horeca_order_lists_all');
        if (saved) {
            try {
                const parsed: OrderList[] = JSON.parse(saved);
                const updated = parsed.map(l => l.id === orderList.id ? nextList : l);
                localStorage.setItem('horeca_order_lists_all', JSON.stringify(updated));
                window.dispatchEvent(new Event('storage'));
            } catch (e) {
                console.error('Failed to persist removal', e);
            }
        }

        toast.success(`${productName} removed from list`, { duration: 1500 });
    };

    const activeItems = useMemo(() => {
        return Object.entries(quantities).filter(([, qty]) => qty > 0);
    }, [quantities]);

    const totalAmount = useMemo(() => {
        if (!orderList) return 0;
        return activeItems.reduce((sum, [pid, qty]) => {
            const item = orderList.items.find(i => i.productId === pid);
            return sum + (item ? item.product.price * qty : 0);
        }, 0);
    }, [activeItems, orderList]);

    const handleFillLastQty = () => {
        if (!orderList) return;
        const newQtys = Object.fromEntries(
            (orderList.items ?? []).map(item => [item.productId, item.lastOrderedQty || item.defaultQty || 1])
        );
        setQuantities(newQtys);
        toast.info("Quantities filled based on last order", { duration: 1500 });
    };

    const handleAddAllToCart = async () => {
        if (!orderList) return;

        if (activeItems.length === 0) {
            toast.error("No items selected", {
                description: "Please select quantities for items or use 'Re-fill Last Qty' to add products.",
                duration: 3000,
            });
            return;
        }

        // Final stock validation — refetch live stock right before adding so concurrent buyers
        // can't push us past available inventory.
        const vendorIds = Array.from(new Set(activeItems.map(([pid]) => orderList.items.find(i => i.productId === pid)?.product?.vendorId).filter(Boolean) as string[]));
        const liveStock: Record<string, number> = { ...freshStock };
        try {
            const results = await Promise.all(vendorIds.map(vid => dal.vendors.getProducts(vid).catch(() => ({ products: [] as VendorProduct[] }))));
            results.forEach(r => r.products.forEach(p => { liveStock[p.id] = p.stock; }));
            setFreshStock(liveStock);
        } catch (err) {
            console.error('Pre-add stock refresh failed', err);
        }

        const oversold = activeItems.filter(([pid, qty]) => {
            const item = orderList.items.find(i => i.productId === pid);
            const cap = liveStock[pid] !== undefined ? liveStock[pid] : (item?.product?.stock ?? 0);
            return qty > cap;
        });

        if (oversold.length > 0) {
            toast.error("Some items are out of stock", {
                description: "Quantities have been adjusted to available stock. Please review and try again.",
                duration: 3500,
            });
            setQuantities(prev => {
                const next = { ...prev };
                oversold.forEach(([pid]) => {
                    const item = orderList.items.find(i => i.productId === pid);
                    next[pid] = liveStock[pid] !== undefined ? liveStock[pid] : (item?.product?.stock ?? 0);
                });
                return next;
            });
            return;
        }

        let itemsAdded = 0;
        activeItems.forEach(([pid, qty]) => {
            const item = orderList.items.find(i => i.productId === pid);
            if (item && qty > 0) {
                addToCart(item.product, qty);
                itemsAdded++;
            }
        });

        if (itemsAdded > 0) {
            // Update lastUsed in localStorage
            const saved = localStorage.getItem('horeca_order_lists_all');
            if (saved) {
                try {
                    const parsed: OrderList[] = JSON.parse(saved);
                    const updated = parsed.map((l) =>
                        l.id === orderList.id ? { ...l, lastUsed: new Date() } : l
                    );
                    localStorage.setItem('horeca_order_lists_all', JSON.stringify(updated));
                    
                    // Trigger storage event for other components (like Homepage)
                    window.dispatchEvent(new Event('storage'));
                } catch (e) {
                    console.error('Failed to update lastUsed', e);
                }
            }

            toast.success(`${orderList.name} added to cart!`, {
                description: `Successfully added ${itemsAdded} items to your cart.`,
                duration: 2500,
            });
            router.push('/cart');
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-10 h-10 border-4 border-[#299e60] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!orderList) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white p-6">
                <div className="text-center max-w-xs">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <ClipboardList size={40} className="text-gray-200" />
                    </div>
                    <h2 className="text-[20px] font-bold text-[#181725] mb-2">List not found</h2>
                    <p className="text-[14px] text-gray-400 font-medium mb-8">This list might have been deleted or is no longer available.</p>
                    <Link
                        href="/order-lists"
                        className="inline-block w-full bg-[#53B175] text-white py-4 rounded-2xl font-bold shadow-lg shadow-green-100"
                    >
                        Back to lists
                    </Link>
                </div>
            </div>
        );
    }

    // Group items by vendor
    const vendorGroups: { vendorId: string; vendorName: string; vendorLogo?: string; items: typeof orderList.items }[] = [];
    const seen = new Set<string>();
    (orderList.items ?? []).forEach(item => {
        const vid = item.product?.vendorId || orderList.vendorId;
        if (!seen.has(vid)) {
            seen.add(vid);
            // Lookup vendor details if missing from product
            const vendorInfo = vendorsList.find(v => v.id === vid);
            vendorGroups.push({
                vendorId: vid,
                vendorName: item.product?.vendorName || vendorInfo?.name || orderList.vendorName,
                vendorLogo: item.product?.vendorLogo || vendorInfo?.logo || orderList.vendorLogo,
                items: []
            });
        }
        vendorGroups.find(g => g.vendorId === vid)!.items.push(item);
    });

    const isMultiVendor = vendorGroups.length > 1;

    // Responsive vendor card layout (collapsible) — used on all devices.
    // Rendered as a function call (not a component) so it doesn't remount on every parent
    // re-render — keeps qty input focus while typing.
    const renderVendorCard = (group: typeof vendorGroups[0]) => {
        const expanded = isExpanded(group.vendorId);
        return (
            <div className="bg-white rounded-2xl border border-[#E2E2E2] overflow-hidden shadow-sm">
                {/* Vendor Header */}
                <div className="px-4 py-3 min-[340px]:px-7 min-[340px]:py-5 flex items-center justify-between bg-[#FAFAFA] border-b border-[#F0F0F0] cursor-pointer" onClick={() => toggleVendor(group.vendorId)}>
                    <div className="flex items-center gap-2 min-[340px]:gap-3 flex-1 min-w-0">
                        {group.vendorLogo && (
                            <div className="w-10 h-10 min-[340px]:w-14 min-[340px]:h-14 md:w-16 md:h-16 rounded-full overflow-hidden shrink-0 shadow-sm">
                                <img src={group.vendorLogo} alt="" className="w-full h-full object-cover" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <h3 className="text-[15px] min-[340px]:text-[17px] font-bold text-[#181725]">{group.vendorName}</h3>
                            <p className="text-[11px] min-[340px]:text-[13px] text-gray-400 font-medium">{group.items.length} item{group.items.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                    <button
                        className="w-8 h-8 min-[340px]:w-9 min-[340px]:h-9 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors shrink-0"
                    >
                        {expanded
                            ? <ChevronUp size={18} className="text-gray-500" strokeWidth={2.5} />
                            : <ChevronDown size={18} className="text-gray-500" strokeWidth={2.5} />}
                    </button>
                </div>

                {/* Items — collapsible */}
                {expanded && (
                    <div className="divide-y divide-[#F5F5F5] border-t border-[#F0F0F0]">
                        {(group.items ?? []).map((item) => {
                            const qty = quantities[item.productId] || 0;
                            const itemTotal = item.product.price * qty;
                            const stock = stockOf(item.productId);
                            const lowStock = stock > 0 && stock <= 5;
                            const oos = stock === 0;
                            const slabs = item.product.bulkPrices ?? [];
                            return (
                                <div key={item.productId} className="px-3 py-3 min-[340px]:px-5 min-[340px]:py-4 md:px-7 md:py-5 hover:bg-gray-50/40 transition-colors group">
                                    <div className="flex items-center gap-2 min-[340px]:gap-3 md:gap-5">
                                        {/* Image */}
                                        <div className="w-10 h-10 min-[340px]:w-14 min-[340px]:h-14 md:w-[72px] md:h-[72px] rounded-xl md:rounded-2xl bg-[#F7F8F7] flex items-center justify-center shrink-0 border border-gray-100 p-1 md:p-2 group-hover:border-primary/10 transition-colors">
                                            <img src={item.product.images[0] || '/images/recom-product/product-img10.png'} alt={item.product.name} className="max-w-full max-h-full object-contain" />
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-[12px] min-[340px]:text-[14px] md:text-[15px] font-bold text-[#181725] leading-snug line-clamp-2">{item.product.name}</h4>
                                            <p className="text-[10px] min-[340px]:text-[12px] md:text-[13px] text-gray-400 font-medium mt-0.5">{item.product.packSize || '1 pc'}</p>
                                            <div className="flex items-center flex-wrap gap-1.5 md:gap-2 mt-1">
                                                <div className="w-[4px] h-[4px] md:w-[6px] md:h-[6px] rounded-full bg-primary" />
                                                <span className="text-[9px] min-[340px]:text-[11px] md:text-[12px] text-gray-700 font-bold whitespace-nowrap">₹{item.product.price}/pc</span>
                                                <span className={`text-[9px] min-[340px]:text-[11px] md:text-[11px] font-bold whitespace-nowrap ${oos ? 'text-red-500' : lowStock ? 'text-orange-500' : 'text-gray-500'}`}>
                                                    · {oos ? 'Out of stock' : `Stock: ${stock}`}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Qty Controls */}
                                        <div className={`flex items-center gap-0 border border-gray-200 rounded-lg md:rounded-xl overflow-hidden shrink-0 ${oos ? 'opacity-50 pointer-events-none' : ''}`}>
                                            <button
                                                onClick={() => updateQty(item.productId, -1)}
                                                className="w-7 h-7 min-[340px]:w-8 min-[340px]:h-8 md:w-10 md:h-10 flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors"
                                            >
                                                <Minus className="w-3 h-3 min-[340px]:w-3.5 min-[340px]:h-3.5 md:w-4 md:h-4" strokeWidth={3} />
                                            </button>
                                            <div className="w-8 h-7 min-[340px]:w-10 min-[340px]:h-8 md:w-12 md:h-10 flex items-center justify-center border-x border-gray-200">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={stock}
                                                    value={qty}
                                                    onChange={(e) => setQty(item.productId, parseInt(e.target.value) || 0)}
                                                    className="w-full text-center text-[12px] md:text-[15px] font-bold text-[#181725] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-transparent"
                                                />
                                            </div>
                                            <button
                                                onClick={() => updateQty(item.productId, 1)}
                                                className="w-7 h-7 min-[340px]:w-8 min-[340px]:h-8 md:w-10 md:h-10 flex items-center justify-center text-primary hover:bg-green-50 transition-colors"
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

                                        {/* Remove product button — hidden on mobile */}
                                        <button
                                            onClick={() => removeProduct(item.productId)}
                                            className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                                            title="Remove from list"
                                        >
                                            <X size={16} strokeWidth={3} />
                                        </button>
                                    </div>

                                    {/* Bulk pricing slabs — clickable to set qty to slab.minQty */}
                                    {slabs.length > 0 && !oos && (
                                        <div className="flex flex-wrap gap-1.5 mt-2 md:mt-3 md:pl-[88px]">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider self-center">Bulk:</span>
                                            {slabs.map((slab, i) => {
                                                const active = qty >= slab.minQty;
                                                const exceedsStock = slab.minQty > stock;
                                                return (
                                                    <button
                                                        key={i}
                                                        type="button"
                                                        disabled={exceedsStock}
                                                        onClick={() => setQty(item.productId, Math.min(stock, slab.minQty))}
                                                        title={exceedsStock ? `Only ${stock} in stock` : `Set qty to ${slab.minQty}`}
                                                        className={`text-[10px] md:text-[11px] font-bold rounded-full px-2.5 py-1 transition-all border ${
                                                            exceedsStock
                                                                ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                                                                : active
                                                                    ? 'bg-[#53B175] border-[#53B175] text-white shadow-sm'
                                                                    : 'bg-[#F7FBF8] border-[#EAF5ED] text-[#1B5E20] hover:bg-[#53B175] hover:text-white hover:border-[#53B175]'
                                                        }`}
                                                    >
                                                        {slab.minQty}+ @ ₹{slab.price}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

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
                        <Link href="/order-lists" className="hover:text-primary transition-colors">Order Lists</Link>
                        <ChevronRight size={12} />
                        <span className="text-text font-semibold truncate">{orderList.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-[32px] font-black text-text tracking-tight leading-none mb-2">{orderList.name}</h1>
                            <p className="text-[16px] text-[#299e60] font-black flex items-center gap-2">
                                <Building2 size={18} />
                                {orderList.vendorName}
                            </p>
                        </div>
                        {/* Tablet/Mid-range desktop button (becomes redundant on lg due to sidebar) */}
                        <div className="lg:hidden">
                            <button
                                onClick={handleFillLastQty}
                                className="bg-white text-[#299e60] px-5 py-3 border border-[#299e60]/20 rounded-xl text-[14px] font-bold shadow-sm hover:bg-[#299e60]/5 transition-all flex items-center gap-2"
                            >
                                <RotateCcw size={16} />
                                Re-fill Last Qty
                            </button>
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
                                onClick={() => router.push('/order-lists')}
                                className="p-1 -ml-1 hover:bg-gray-50 rounded-full transition-colors shrink-0"
                            >
                                <ChevronLeft size={22} className="text-[#181725]" />
                            </button>
                            <div className="min-w-0">
                                <h1 className="text-[17px] min-[340px]:text-[19px] font-bold text-[#181725] truncate">{orderList.name}</h1>
                                <p className="text-[11px] min-[340px]:text-[13px] text-[#299e60] font-black mt-0.5 truncate">{orderList.vendorName}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={handleFillLastQty}
                                className="text-[11px] min-[340px]:text-[12px] font-bold text-[#299e60] px-2 min-[340px]:px-3 py-1.5 border border-[#299e60]/20 rounded-lg hover:bg-[#299e60]/5 transition-colors flex items-center gap-1 min-[340px]:gap-1.5"
                            >
                                <RotateCcw size={14} />
                                <span className="hidden min-[320px]:inline">Re-fill</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 px-4 pt-4 md:max-w-[var(--container-max)] md:mx-auto md:px-[var(--container-padding)] md:pt-8 md:w-full">
                <div className="md:grid md:grid-cols-1 lg:grid-cols-[1fr_400px] lg:gap-10 md:items-start">

                    {/* ===== LEFT COLUMN ===== */}
                    <div className="space-y-3 md:space-y-5">

                        {/* Responsive Vendor Cards (Collapsible) */}
                        <div className="space-y-4 md:space-y-5">
                            {vendorGroups.map(group => (
                                <React.Fragment key={group.vendorId}>{renderVendorCard(group)}</React.Fragment>
                            ))}
                        </div>
                    </div>

                    {/* ===== RIGHT COLUMN — Sticky Sidebar (desktop only) ===== */}
                    <div className="hidden lg:block sticky top-[80px] space-y-4">
                        {/* Re-fill Button */}
                        <button
                            onClick={handleFillLastQty}
                            className="w-full bg-white text-[#299e60] px-6 py-4 border-2 border-[#299e60]/15 rounded-2xl text-[15px] font-black shadow-sm hover:bg-[#299e60]/5 transition-all flex items-center justify-center gap-2"
                        >
                            <RotateCcw size={17} />
                            Re-fill Last Qty
                        </button>

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
                                    <span className="text-[15px] text-[#4C4F4D] font-medium">Items in list</span>
                                    <span className="text-[15px] font-black text-[#181725]">{orderList.items.length}</span>
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
                            className="w-full bg-[#53B175] text-white py-5 rounded-2xl font-bold text-[18px] transition-all hover:bg-[#48a068] active:scale-[0.98] shadow-lg shadow-[#53B175]/20 flex items-center justify-center gap-3"
                        >
                            <ShoppingCart size={22} strokeWidth={2.5} />
                            Add to Cart
                        </button>

                        {/* Safety Notice */}
                        <div className="bg-white rounded-2xl border border-[#E2E2E2] px-6 py-4 flex items-center gap-4">
                            <AlertTriangle size={24} className="text-[#555555] shrink-0" fill="#555555" stroke="white" strokeWidth={2.5} />
                            <p className="text-[13px] text-[#181725] font-bold leading-snug">
                                Safety is our top priority. We ensure standard quality & hygiene benchmarks.
                            </p>
                        </div>
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
                            <span className="text-[14px] text-[#4C4F4D] font-medium">Items in list</span>
                            <span className="text-[14px] font-black text-[#181725]">{orderList.items.length}</span>
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
                    className="w-full bg-[#53B175] text-white py-[18px] rounded-[16px] font-bold text-[18px] transition-all active:scale-[0.98] shadow-lg shadow-[#53B175]/20 flex items-center justify-center gap-3"
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
