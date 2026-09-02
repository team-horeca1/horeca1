'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { VendorStoreHeader } from '@/components/features/vendor/VendorStoreHeader';
import { VendorCatalogNav } from '@/components/features/vendor/VendorCatalogNav';
import { VendorProductCard } from '@/components/features/vendor/VendorProductCard';
import { StickyCartBar } from '@/components/features/vendor/StickyCartBar';
import { dal } from '@/lib/dal';
import { cn } from '@/lib/utils';
import { buildCategoryTree, filterProductsByCatalogTab } from '@/lib/categoryTree';
import { useCart } from '@/context/CartContext';
import { useDeliveryPincode } from '@/hooks/useDeliveryPincode';
import type { Vendor, VendorProduct } from '@/types';
import { Package, Star, CheckCircle, Clock, ChevronRight, LayoutGrid, CreditCard } from 'lucide-react';
import Image from 'next/image';

interface VendorOrder {
    id?: string;
    vendorId?: string;
    vendor?: { id: string };
    createdAt?: string;
    date?: string;
    totalAmount?: number;
    price?: number;
    items?: Array<{ name?: string; productName?: string; productId?: string; product?: { id: string }; quantity?: number }>;
}

export default function VendorStorePage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const vendorId = params.id as string;
    const { status: sessionStatus } = useSession();
    const { addToCart } = useCart();
    const deliveryPincode = useDeliveryPincode();
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [products, setProducts] = useState<VendorProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [productsError, setProductsError] = useState<string | null>(null);
    const [reloadToken, setReloadToken] = useState(0);
    // Pre-fill active tab from ?cat= param (deep-link from search overlay / category page).
    // ?cat=mayo-sauces → activeTab='cat:Mayo & Sauces' once products load (slug → name match below).
    const initialCatSlug = searchParams?.get('cat') || '';
    const [activeTab, setActiveTab] = useState(initialCatSlug ? `cat:${initialCatSlug}` : 'all');
    // Pre-fill search from ?q= param (e.g. navigating from search overlay with a specific product)
    const [searchQuery, setSearchQuery] = useState(() => searchParams?.get('q') || '');
    const [prevOrders, setPrevOrders] = useState<VendorOrder[]>([]);
    const [reviewsData, setReviewsData] = useState<{
        reviews: Array<{ id: string; rating: number; comment?: string; createdAt: string; reviewerName: string }>;
        distribution: Record<string, number>;
        totalCount: number;
    } | null>(null);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [prevOrderedProducts, setPrevOrderedProducts] = useState<VendorProduct[]>([]);
    const [prevOrderedLoading, setPrevOrderedLoading] = useState(false);
    const [vendorCredit, setVendorCredit] = useState<{ limit: number; available: number } | null>(null);
    const [storePromos, setStorePromos] = useState<Array<{ id: string; name: string; badgeLabel: string; type: 'pct_discount' | 'flat_discount' }>>([]);

    // Grid (2-up) vs list (1-up) product layout. Persisted per-browser so power
    // buyers don't have to re-pick on every visit.
    const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
    useEffect(() => {
        const saved = localStorage.getItem('horeca_vendor_layout');
        if (saved === 'grid' || saved === 'list') setLayoutMode(saved);
    }, []);
    const updateLayoutMode = useCallback((mode: 'grid' | 'list') => {
        setLayoutMode(mode);
        try { localStorage.setItem('horeca_vendor_layout', mode); } catch { /* quota / privacy mode */ }
    }, []);

    // Ensure page starts at the top on entry
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, [vendorId]);

    // Fetch vendor + products (AUD-002: allSettled so products failure doesn't hang / wipe vendor)
    useEffect(() => {
        if (!vendorId) return;
        let cancelled = false;
        Promise.resolve().then(() => {
            if (!cancelled) {
                setLoading(true);
                setProductsError(null);
            }
        });
        const pin = deliveryPincode;

        Promise.allSettled([
            dal.vendors.getById(vendorId),
            dal.vendors.getProducts(vendorId, { limit: 200, pincode: pin }),
            fetch(`/api/v1/vendors/${vendorId}/store-promotions`).then((r) => r.json()).catch(() => ({ success: false })),
        ]).then(([vRes, pRes, promoRes]) => {
            if (cancelled) return;
            if (vRes.status === 'fulfilled') {
                setVendor(vRes.value);
            } else {
                console.error(vRes.reason);
                setVendor(null);
            }
            if (pRes.status === 'fulfilled') {
                setProducts(pRes.value.products);
                setProductsError(null);
            } else {
                console.error(pRes.reason);
                setProducts([]);
                setProductsError(
                    pRes.reason instanceof Error ? pRes.reason.message : 'Failed to load products'
                );
            }
            if (promoRes.status === 'fulfilled') {
                const promosRes = promoRes.value as { success?: boolean; data?: unknown };
                if (promosRes?.success && Array.isArray(promosRes.data)) {
                    setStorePromos(promosRes.data as Array<{ id: string; name: string; badgeLabel: string; type: 'pct_discount' | 'flat_discount' }>);
                }
            }
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });

        return () => { cancelled = true; };
    }, [vendorId, deliveryPincode, reloadToken]);

    useEffect(() => {
        if (sessionStatus !== 'authenticated' || !vendorId) return;
        fetch('/api/v1/wallet')
            .then((r) => r.json())
            .then((j) => {
                if (!j.success || !Array.isArray(j.data)) return;
                type W = { vendorId: string | null; creditLimit: string | number; outstandingAmount: string | number; status: string };
                const w = (j.data as W[]).find((x) => x.vendorId === vendorId && x.status === 'ACTIVE');
                if (!w) return;
                const limit = Number(w.creditLimit);
                const outstanding = Number(w.outstandingAmount);
                setVendorCredit({ limit, available: Math.max(0, limit - outstanding) });
            })
            .catch(() => {});
    }, [sessionStatus, vendorId]);

    // Track recently viewed vendor for "Continue Ordering" section
    useEffect(() => {
        if (!vendor) return;
        try {
            const KEY = 'horeca_recently_viewed';
            const saved = localStorage.getItem(KEY);
            let entries: Array<{ vendorId: string; vendorName: string; vendorLogo: string; viewedProducts: unknown[]; viewedAt: number }> = [];
            if (saved) entries = JSON.parse(saved);

            const existing = entries.find((e) => e.vendorId === vendor.id);
            const existingProducts = existing?.viewedProducts || [];
            const mergedProducts = existingProducts;

            entries = entries.filter((e) => e.vendorId !== vendor.id);
            entries.unshift({
                vendorId: vendor.id,
                vendorName: vendor.name,
                vendorLogo: vendor.logo,
                viewedProducts: mergedProducts.slice(0, 20),
                viewedAt: Date.now(),
            });
            if (entries.length > 20) entries = entries.slice(0, 20);
            localStorage.setItem(KEY, JSON.stringify(entries));
        } catch (e) {
            console.error('Failed to save recently viewed vendor:', e);
        }
    }, [vendor]);

    // Fetch previous orders from this vendor when "orders" tab activated
    const loadPrevOrders = useCallback(async () => {
        if (sessionStatus !== 'authenticated' || !vendorId) return;
        try {
            const res = await fetch('/api/v1/orders');
            const json = await res.json();
            const vendorOrders = (json.data || json.orders || []).filter((o: VendorOrder) =>
                o.vendorId === vendorId || o.vendor?.id === vendorId
            );
            setPrevOrders(vendorOrders);
        } catch { setPrevOrders([]); }
    }, [vendorId, sessionStatus]);

    // Refetch previously-ordered when delivery pin changes (stock visibility depends on pin).
    useEffect(() => {
        setPrevOrderedProducts([]);
    }, [deliveryPincode, vendorId]);

    useEffect(() => {
        if (activeTab === 'orders') Promise.resolve().then(() => loadPrevOrders());
        if (activeTab === 'prev-ordered' && !prevOrderedLoading && prevOrderedProducts.length === 0) {
            Promise.resolve().then(async () => {
                setPrevOrderedLoading(true);
                try {
                    const res = await fetch(`/api/v1/vendors/${vendorId}/previously-ordered`);
                    const json = await res.json();
                    setPrevOrderedProducts((json.data || json.items || []).map((p: { id: string; name: string; basePrice?: number | string; price?: number | string; imageUrl?: string; categoryName?: string; packSize?: string; lastOrderedQty?: number; lastOrderedDate?: string; stock?: number; qty_available?: number }) => {
                        const fromCatalog = products.find((c) => c.id === p.id);
                        const stock = fromCatalog?.stock
                            ?? (typeof p.qty_available === 'number' ? p.qty_available : undefined)
                            ?? (typeof p.stock === 'number' ? p.stock : 0);
                        return {
                            ...p,
                            id: p.id,
                            name: p.name,
                            price: Number(p.basePrice || p.price) || 0,
                            images: p.imageUrl ? [p.imageUrl] : [],
                            category: p.categoryName || '',
                            packSize: p.packSize || '1 unit',
                            unit: 'unit',
                            stock,
                            isActive: true,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            vendorId: vendorId,
                            vendorName: vendor?.name || '',
                            vendorLogo: vendor?.logo || '',
                            bulkPrices: [],
                            creditBadge: false,
                            minOrderQuantity: 1,
                            frequentlyOrdered: true,
                            isDeal: false,
                            description: '',
                            lastOrderedQty: p.lastOrderedQty,
                            lastOrderedDate: p.lastOrderedDate,
                        } as VendorProduct;
                    }));
                } catch { setPrevOrderedProducts([]); }
                finally { setPrevOrderedLoading(false); }
            });
        }
    }, [activeTab, loadPrevOrders, products, deliveryPincode, vendorId, vendor?.name, vendor?.logo, prevOrderedLoading, prevOrderedProducts.length]);

    // Load reviews when ratings tab is activated
    useEffect(() => {
        if (activeTab !== 'ratings' || !vendorId || reviewsData) return;
        Promise.resolve().then(() => setReviewsLoading(true));
        dal.reviews.getVendorReviews(vendorId)
            .then(data => setReviewsData(data))
            .catch(() => setReviewsData({ reviews: [], distribution: {}, totalCount: 0 }))
            .finally(() => setReviewsLoading(false));
    }, [activeTab, vendorId, reviewsData]);

    // Convert ?cat=<slug> to the matching category NAME once products load.
    // activeTab stores the actual category name (used by the filter below), but URLs use slugs.
    useEffect(() => {
        if (!initialCatSlug || products.length === 0) return;
        if (!activeTab.startsWith('cat:')) return;
        const current = activeTab.slice(4);
        // If activeTab is already a real category OR parent-category name (not the raw slug), nothing to do.
        if (products.some(p => p.category === current || p.categoryParentName === current)) return;
        const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const slug = slugify(initialCatSlug);
        // Prefer a sub-category match (shows products); fall back to a parent match (shows sub-category tiles).
        const subMatch = products.find(p => slugify(p.category) === slug);
        if (subMatch) { setActiveTab(`cat:${subMatch.category}`); return; }
        const parentMatch = products.find(p => p.categoryParentName && slugify(p.categoryParentName) === slug);
        if (parentMatch?.categoryParentName) setActiveTab(`cat:${parentMatch.categoryParentName}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [products, initialCatSlug]);

    // Hierarchical category tree the vendor actually sells.
    const vendorCategoryTree = useMemo(
        () => buildCategoryTree(products),
        [products],
    );

    // Drill-down state derived from activeTab.
    // Left rail = top-level categories (parents). Selecting a parent shows its
    // sub-category TILES on the right; selecting a sub-category shows its products.
    // Items are only ever mapped to sub-categories, so a parent never shows products directly.
    const activeCatName = activeTab.startsWith('cat:') ? activeTab.slice(4) : '';
    const activeParentNode = useMemo(
        () => vendorCategoryTree.find(p => p.name === activeCatName && p.children.length > 0),
        [vendorCategoryTree, activeCatName],
    );
    const parentOfActiveSub = useMemo(
        () => vendorCategoryTree.find(p => p.children.some(c => c.name === activeCatName)),
        [vendorCategoryTree, activeCatName],
    );
    // Show the sub-category grid when a parent (with children) is selected and the user isn't searching.
    const showSubcategoryTiles = !searchQuery.trim() && !!activeParentNode;

    const filteredProducts = useMemo(() => {
        let result = products;

        // Filter by tab
        if (activeTab === 'frequent') {
            result = result.filter(p => p.frequentlyOrdered);
        } else if (activeTab === 'deals') {
            result = result.filter(p => p.isDeal);
        } else if (activeTab === 'prev-ordered') {
            result = prevOrderedProducts;
        } else if (activeTab.startsWith('cat:')) {
            result = filterProductsByCatalogTab(result, activeTab);
        }

        // Filter by search (include brand displayName; guard nullish fields)
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(p =>
                (p.name ?? '').toLowerCase().includes(q) ||
                (p.displayName ?? '').toLowerCase().includes(q) ||
                (p.brandName ?? '').toLowerCase().includes(q) ||
                (p.sku ?? '').toLowerCase().includes(q) ||
                (p.category ?? '').toLowerCase().includes(q) ||
                (p.description ?? '').toLowerCase().includes(q) ||
                (p.tags ?? []).some(t => t.toLowerCase().includes(q))
            );
        }

        // Keep zero-stock products visible (VendorProductCard shows Out / grayed UI).
        // Surface in-stock items first so buyers see available SKUs before sold-out ones.
        return [...result].sort((a, b) => {
            const aOut = (a.stock ?? 0) <= 0 ? 1 : 0;
            const bOut = (b.stock ?? 0) <= 0 ? 1 : 0;
            return aOut - bOut;
        });
    }, [products, activeTab, searchQuery, prevOrderedProducts]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-[14px] text-gray-500">Loading store...</p>
                </div>
            </div>
        );
    }

    if (!vendor) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <p className="text-[20px] font-bold text-gray-800 mb-2">Vendor not found</p>
                    <p className="text-[14px] text-gray-500">The vendor you are looking for does not exist.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50/50 pb-24">
            {/* Vendor Header */}
            <VendorStoreHeader 
                vendor={vendor} 
                activeTab={activeTab}
                onTabChange={setActiveTab}
                storePromos={storePromos}
            />

            {productsError && (
                <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-[13px] text-amber-900">
                            Couldn’t load products{productsError ? `: ${productsError}` : ''}.
                        </p>
                        <button
                            type="button"
                            onClick={() => setReloadToken((t) => t + 1)}
                            className="rounded-lg bg-amber-900 px-3 py-1.5 text-[12px] font-semibold text-white"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {vendorCredit && vendorCredit.limit > 0 && (
                <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] pt-3">
                    <div className="flex items-center gap-3 bg-purple-50 border border-purple-100 rounded-xl px-4 py-3">
                        <CreditCard size={18} className="text-purple-600 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[13px] font-bold text-purple-900">DiSCCO · {vendor.name}</p>
                            <p className="text-[12px] text-purple-700">
                                ₹{vendorCredit.available.toLocaleString('en-IN')} available · Buy Now, Pay Later
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* The hierarchical Categories >> Sub-Categories sidebar (rendered inside
                the main content block below) covers category nav at every breakpoint,
                so the horizontal CategoryShowcase strip is no longer needed on mobile. */}
            {activeTab !== 'ratings' && activeTab !== 'about' && activeTab !== 'orders' && (
                <VendorCatalogNav
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    categories={vendor.categories}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    layoutMode={layoutMode}
                    onLayoutModeChange={updateLayoutMode}
                />
            )}

            {/* Main Content Area */}
            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] pb-8 pt-2">
                {activeTab === 'orders' ? (
                    <div className="max-w-2xl mx-auto space-y-4 py-4">
                        <h3 className="text-[18px] font-black text-[#181725] mb-4">My Previous Orders</h3>
                        {sessionStatus !== 'authenticated' ? (
                            <div className="text-center py-16 text-gray-400 font-bold">Please log in to see your orders from this vendor.</div>
                        ) : prevOrders.length === 0 ? (
                            <div className="text-center py-16 text-gray-400 font-bold">No previous orders from this vendor yet.</div>
                        ) : (
                            prevOrders.map((order) => (
                                <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <p className="text-[13px] font-black text-[#181725]">Order #{order.id?.slice(-8)}</p>
                                            <p className="text-[12px] text-gray-400 font-medium mt-0.5">{order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN') : order.date}</p>
                                        </div>
                                        <span className="text-[13px] font-black text-primary">₹{order.totalAmount || order.price}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                        {(order.items || []).slice(0, 4).map((item, i: number) => (
                                            <span key={i} className="text-[11px] font-bold text-gray-500 bg-gray-50 px-2 py-1 rounded-lg">{item.name || item.productName}</span>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => {
                                            (order.items || []).forEach((item) => {
                                                const productId = item.productId || item.product?.id;
                                                if (!productId) return;
                                                const found = products.find(p => p.id === productId);
                                                if (found) addToCart(found, item.quantity || 1);
                                            });
                                        }}
                                        className="w-full py-2.5 bg-primary text-white rounded-xl text-[13px] font-black hover:bg-primary-dark transition-colors shadow-sm shadow-primary/20"
                                    >
                                        Reorder All Items
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                ) : activeTab === 'all' || activeTab === 'deals' || activeTab === 'frequent' || activeTab === 'prev-ordered' || activeTab.startsWith('cat:') ? (
                    <div className="flex gap-2 md:gap-4 lg:gap-6 items-start">
                        {/* ── LEFT RAIL: TOP-LEVEL CATEGORIES ONLY (parents).
                              Selecting a parent drills into its sub-categories on the right.
                              Mobile (<md): Hyperpure-style vertical tile rail (~76px), image-on-top + label-below.
                              Desktop (md+): row list with image + label + count. ── */}
                        <aside className="w-[76px] md:w-[200px] lg:w-[260px] shrink-0 sticky top-24">
                            <div className="bg-white rounded-2xl border border-gray-100 p-1 md:p-3 shadow-sm">
                                {/* All Products entry */}
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('all')}
                                    className={cn(
                                        "w-full rounded-xl transition-all text-left flex flex-col items-center md:flex-row md:items-center md:justify-between px-1 md:px-3 py-3 md:py-2.5",
                                        activeTab === 'all' ? "bg-primary-light" : "hover:bg-gray-50"
                                    )}
                                >
                                    <div className="flex flex-col items-center md:flex-row md:items-center md:gap-3 min-w-0 w-full">
                                        <div className={cn(
                                            "w-12 h-12 md:w-9 md:h-9 rounded-lg flex items-center justify-center transition-all shrink-0",
                                            activeTab === 'all' ? "bg-white border border-primary/30 shadow-sm" : "bg-gray-50"
                                        )}>
                                            <LayoutGrid className={cn('w-5 h-5 md:w-4 md:h-4', activeTab === 'all' ? 'text-primary' : 'text-gray-400')} strokeWidth={1.5} />
                                        </div>
                                        <span className={cn(
                                            "text-[10px] md:text-[13px] font-semibold md:font-bold leading-tight text-center md:text-left mt-1 md:mt-0 line-clamp-2 md:line-clamp-none md:truncate w-full md:flex-1",
                                            activeTab === 'all' ? "text-primary" : "text-[#181725]"
                                        )}>
                                            All Products
                                        </span>
                                    </div>
                                    <span className="hidden md:inline text-[11px] font-bold text-gray-400 shrink-0 ml-2">{products.length}</span>
                                </button>

                                {vendorCategoryTree.map((parent) => {
                                    // Highlight the parent both when it is selected AND when one of its
                                    // sub-categories is active, so the rail tracks the drill-down.
                                    const isParentActive = activeTab === `cat:${parent.name}` || parent.children.some(c => activeTab === `cat:${c.name}`);
                                    return (
                                        <button
                                            key={parent.id}
                                            type="button"
                                            onClick={() => {
                                                setActiveTab(`cat:${parent.name}`);
                                            }}
                                            className={cn(
                                                "w-full mt-1 rounded-xl transition-all text-left flex flex-col items-center md:flex-row md:items-center md:gap-3 px-1 md:px-3 py-2 md:py-2.5 min-w-0",
                                                isParentActive ? "bg-primary-light" : "hover:bg-gray-50"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-12 h-12 md:w-9 md:h-9 rounded-lg flex items-center justify-center overflow-hidden relative transition-all shrink-0",
                                                isParentActive ? "bg-white border border-primary/30 shadow-sm" : "bg-gray-50"
                                            )}>
                                                {parent.image ? (
                                                    <Image src={parent.image} alt={parent.name} width={36} height={36} className="object-contain w-full h-full p-1" />
                                                ) : (
                                                    <Package size={16} className="text-gray-300" strokeWidth={1.5} />
                                                )}
                                            </div>
                                            <span className={cn(
                                                "text-[10px] md:text-[13px] font-semibold md:font-bold leading-tight text-center md:text-left mt-1 md:mt-0 line-clamp-2 md:line-clamp-none md:truncate w-full md:flex-1",
                                                isParentActive ? "text-primary" : "text-[#181725]"
                                            )}>
                                                {parent.name}
                                            </span>
                                            <span className="hidden md:inline text-[11px] font-bold text-gray-400 shrink-0 ml-auto">{parent.count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>

                        {/* ── RIGHT: SUB-CATEGORY TILES (parent selected) → PRODUCTS (sub-category selected / All / search) ── */}
                        <div className="flex-1 min-w-0">
                            {showSubcategoryTiles && activeParentNode ? (
                                <div>
                                    <h2 className="text-[clamp(1.1rem,2vw+0.5rem,1.6rem)] font-black text-[#181725] mb-4">{activeParentNode.name}</h2>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                                        {activeParentNode.children.map((child) => (
                                            <button
                                                key={child.id}
                                                type="button"
                                                onClick={() => setActiveTab(`cat:${child.name}`)}
                                                className="group bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md hover:border-primary/40 transition-all flex flex-col items-center text-center"
                                            >
                                                <div className="w-20 h-20 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden mb-3">
                                                    {child.image ? (
                                                        <Image src={child.image} alt={child.name} width={64} height={64} className="object-contain w-full h-full p-1.5" />
                                                    ) : (
                                                        <Package size={28} className="text-gray-300" strokeWidth={1.5} />
                                                    )}
                                                </div>
                                                <span className="text-[13px] font-bold text-[#181725] leading-tight line-clamp-2 group-hover:text-primary transition-colors">{child.name}</span>
                                                <span className="text-[11px] font-bold text-gray-400 mt-1">{child.count} {child.count === 1 ? 'item' : 'items'}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    {/* Breadcrumb back to the sub-category tiles when viewing a sub-category's products */}
                                    {parentOfActiveSub && (
                                        <div className="flex items-center gap-1.5 mb-3 text-[12px] font-bold">
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab(`cat:${parentOfActiveSub.name}`)}
                                                className="text-gray-400 hover:text-primary transition-colors"
                                            >
                                                {parentOfActiveSub.name}
                                            </button>
                                            <ChevronRight size={13} className="text-gray-300" strokeWidth={2.5} />
                                            <span className="text-[#181725]">{activeCatName}</span>
                                        </div>
                                    )}
                                    {filteredProducts.length > 0 ? (
                                        <div className={cn(
                                            layoutMode === 'grid'
                                                ? 'grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 md:gap-4 lg:gap-5'
                                                : 'flex flex-col gap-3 md:gap-4'
                                        )}>
                                            {filteredProducts.map((product) => (
                                                <VendorProductCard key={product.id} product={product} variant={layoutMode} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-24 text-center">
                                            <div className="p-6 bg-gray-50 rounded-full mb-4">
                                                <Package className="text-gray-300" size={48} strokeWidth={1.5} />
                                            </div>
                                            <h3 className="text-[20px] font-black text-[#181725]">No items found</h3>
                                            <p className="text-gray-400 font-bold mt-1">Try adjusting your search or filters</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ) : activeTab === 'ratings' ? (
                    <div className="max-w-4xl mx-auto space-y-8">
                        {reviewsLoading ? (
                            <div className="flex items-center justify-center py-16">
                                <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
                            </div>
                        ) : (
                            <>
                                {/* Rating Summary Card */}
                                <div className="bg-white rounded-[32px] border border-gray-100 p-8 flex flex-col md:flex-row items-center gap-10 shadow-sm">
                                    <div className="text-center md:text-left flex flex-col items-center md:items-start">
                                        <span className="text-[64px] font-[1000] text-[#181725] leading-none mb-2">{vendor.rating}</span>
                                        <div className="flex items-center gap-1 mb-2">
                                            {[1, 2, 3, 4, 5].map((s) => (
                                                <Star key={s} size={20} fill={s <= Math.floor(Number(vendor.rating)) ? "#FBC02D" : "none"} className={s <= Math.floor(Number(vendor.rating)) ? "text-[#FBC02D]" : "text-gray-200"} />
                                            ))}
                                        </div>
                                        <p className="text-gray-400 font-bold uppercase text-[12px] tracking-widest">
                                            Based on {(reviewsData?.totalCount ?? vendor.totalRatings ?? 0).toLocaleString('en-IN')} reviews
                                        </p>
                                    </div>

                                    <div className="flex-1 w-full space-y-3">
                                        {[5, 4, 3, 2, 1].map((s) => {
                                            const pct = reviewsData?.distribution?.[s] ?? 0;
                                            return (
                                                <div key={s} className="flex items-center gap-4">
                                                    <span className="text-[14px] font-black w-4">{s}</span>
                                                    <div className="flex-1 h-2.5 bg-gray-50 rounded-full overflow-hidden">
                                                        <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <span className="text-[13px] font-bold text-gray-400 w-10 text-right">{pct}%</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Reviews */}
                                {reviewsData && reviewsData.reviews.length > 0 ? (
                                    <div className="space-y-6">
                                        {reviewsData.reviews.map((review) => (
                                            <div key={review.id} className="bg-white rounded-[28px] border border-gray-100 p-6 shadow-sm">
                                                <div className="flex justify-between items-center mb-3">
                                                    <span className="font-black text-[16px] text-[#181725]">{review.reviewerName}</span>
                                                    <span className="text-gray-400 font-bold text-[12px]">
                                                        {new Date(review.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1 mb-3">
                                                    {[1, 2, 3, 4, 5].map((s) => (
                                                        <Star key={s} size={14} fill={s <= review.rating ? "#FBC02D" : "none"} className={s <= review.rating ? "text-[#FBC02D]" : "text-gray-200"} />
                                                    ))}
                                                </div>
                                                {review.comment && (
                                                    <p className="text-gray-600 font-medium leading-relaxed">{review.comment}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-gray-400 font-bold">
                                        No reviews yet. Be the first to review!
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    <div className="max-w-4xl mx-auto space-y-8">
                        {/* Vendor About Section */}
                        <div className="bg-white rounded-[32px] border border-gray-100 p-10 space-y-8 shadow-sm">
                            <div className="space-y-4">
                                <h2 className="text-[24px] font-black text-[#181725]">Our Mission</h2>
                                <p className="text-gray-600 font-medium text-[16px] leading-[1.6]">
                                    {vendor.description || `${vendor.name} is a leading B2B supplier specializing in premium HoReCa solutions across Navi Mumbai. We pride ourselves on direct-from-source procurement, ensuring that every product in our catalog meets the highest standards of safety and quality.`}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="p-6 bg-gray-50/50 rounded-[24px] border border-gray-100 text-center">
                                    <div className="bg-white p-3 rounded-2xl w-fit mx-auto mb-4 shadow-sm text-success">
                                        <CheckCircle size={24} strokeWidth={2.5} />
                                    </div>
                                    <h4 className="font-black text-[14px] text-gray-800 uppercase tracking-tight">Verified</h4>
                                    <p className="text-gray-400 text-[12px] font-bold mt-1 uppercase">ISO Certified Supply Chain</p>
                                </div>
                                <div className="p-6 bg-gray-50/50 rounded-[24px] border border-gray-100 text-center">
                                    <div className="bg-white p-3 rounded-2xl w-fit mx-auto mb-4 shadow-sm text-primary">
                                        <Clock size={24} strokeWidth={2.5} />
                                    </div>
                                    <h4 className="font-black text-[14px] text-gray-800 uppercase tracking-tight">Fastest Ships</h4>
                                    <p className="text-gray-400 text-[12px] font-bold mt-1 uppercase">Next Day Promised</p>
                                </div>
                                <div className="p-6 bg-gray-50/50 rounded-[24px] border border-gray-100 text-center">
                                    <div className="bg-white p-3 rounded-2xl w-fit mx-auto mb-4 shadow-sm text-primary">
                                        <Package size={24} strokeWidth={2.5} />
                                    </div>
                                    <h4 className="font-black text-[14px] text-gray-800 uppercase tracking-tight">Bulk Ready</h4>
                                    <p className="text-gray-400 text-[12px] font-bold mt-1 uppercase">Inventory Tracked Live</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Sticky Cart Bar */}
            <StickyCartBar />
        </div>
    );
}
