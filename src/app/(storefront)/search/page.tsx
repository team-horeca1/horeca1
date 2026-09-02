'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Search, ArrowLeft, Star, Clock, CreditCard, Package, ChevronRight } from 'lucide-react';
import { dal } from '@/lib/dal';
import type { VendorProduct, VendorSummary, Category } from '@/types';
import { StickyCartBar } from '@/components/features/vendor/StickyCartBar';
import { VendorProductCard } from '@/components/features/vendor/VendorProductCard';
import { BrandStoreCard } from '@/components/features/brand/BrandStoreCard';
import { useDeliveryPincode } from '@/hooks/useDeliveryPincode';
import { cn } from '@/lib/utils';

interface SearchBrand {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    bannerUrl: string | null;
    tagline: string | null;
    categories: string[];
    bgColor: string | null;
    showcaseImages: string[];
}

function SearchPageContent() {
    const searchParams = useSearchParams();
    const initialQuery = searchParams.get('q') || '';
    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState<{ products: VendorProduct[]; vendors: VendorSummary[]; categories: Category[]; brands: SearchBrand[] }>({ products: [], vendors: [], categories: [], brands: [] });
    const [tab, setTab] = useState<'all' | 'vendors' | 'products'>('all');
    const [sort, setSort] = useState<'relevance' | 'price_asc' | 'price_desc'>('relevance');
    const [servicingIds, setServicingIds] = useState<Set<string> | null>(null);

    const pincode = useDeliveryPincode();

    useEffect(() => {
        if (!pincode || !/^\d{6}$/.test(pincode)) {
            Promise.resolve().then(() => setServicingIds(null));
            return;
        }
        let cancelled = false;
        dal.vendors
            .checkServiceability(pincode)
            .then((res) => {
                if (cancelled) return;
                setServicingIds(new Set(res.vendorIds ?? []));
            })
            .catch(() => { if (!cancelled) setServicingIds(null); });
        return () => { cancelled = true; };
    }, [pincode]);

    useEffect(() => {
        setQuery(initialQuery);
    }, [initialQuery]);

    useEffect(() => {
        if (!query.trim()) {
            Promise.resolve().then(() => setResults({ products: [], vendors: [], categories: [], brands: [] }));
            return;
        }

        let cancelled = false;
        let retried = false;

        const run = () => {
            dal.search.query(query).then((data) => {
                if (cancelled) return;
                const empty =
                    data.products.length === 0 &&
                    data.vendors.length === 0 &&
                    data.categories.length === 0 &&
                    (data.brands?.length ?? 0) === 0;
                // One retry when empty — covers race before pincode/index warm (AUD-007)
                if (empty && !retried) {
                    retried = true;
                    window.setTimeout(run, 350);
                    return;
                }
                setResults({
                    products: data.products,
                    vendors: data.vendors,
                    categories: data.categories,
                    brands: data.brands as SearchBrand[],
                });
            }).catch(() => {
                if (cancelled) return;
                if (!retried) {
                    retried = true;
                    window.setTimeout(run, 350);
                    return;
                }
                setResults({ products: [], vendors: [], categories: [], brands: [] });
            });
        };
        run();

        return () => { cancelled = true; };
    }, [query]);

    const displayVendors = useMemo(
        () => (servicingIds ? results.vendors.filter(v => servicingIds.has(v.id)) : results.vendors),
        [results.vendors, servicingIds],
    );

    const displayProducts = useMemo(() => {
        let list = servicingIds ? results.products.filter(p => servicingIds.has(p.vendorId)) : results.products;
        if (sort === 'price_asc') list = [...list].sort((a, b) => a.price - b.price);
        else if (sort === 'price_desc') list = [...list].sort((a, b) => b.price - a.price);
        return list;
    }, [results.products, servicingIds, sort]);

    const hasResults = displayProducts.length > 0 || displayVendors.length > 0 || results.categories.length > 0 || results.brands.length > 0;
    const showVendors = tab === 'all' || tab === 'vendors';
    const showProducts = tab === 'all' || tab === 'products';

    return (
        <div className="min-h-screen bg-background pb-24">
            {/* Search Header */}
            <div className="bg-white/95 backdrop-blur-md sticky top-0 z-40 border-b border-divider shadow-cdl-1">
                <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)] py-3">
                    <div className="flex items-center gap-3">
                        <Link href="/" className="shrink-0 p-1.5 hover:bg-ivory rounded-lg transition-colors">
                            <ArrowLeft size={20} className="text-text" />
                        </Link>
                        <div className="relative flex-1">
                            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                            <input
                                type="text"
                                placeholder="Search wholesale products, vendors, categories..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                autoFocus
                                className="w-full pl-9 pr-4 py-2.5 bg-ivory/50 border border-divider rounded-xl text-xs md:text-sm font-medium text-text placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {query.trim() && hasResults && (
                <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)] pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                        {([
                            { key: 'all', label: `All (${displayVendors.length + displayProducts.length + results.categories.length})` },
                            { key: 'vendors', label: `Suppliers (${displayVendors.length})` },
                            { key: 'products', label: `Products (${displayProducts.length})` },
                        ] as const).map(opt => (
                            <button
                                key={opt.key}
                                type="button"
                                onClick={() => setTab(opt.key)}
                                className={cn(
                                    'shrink-0 px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all',
                                    tab === opt.key
                                        ? 'bg-primary border-primary text-white shadow-cdl-1'
                                        : 'bg-white border-divider text-text-secondary hover:border-primary/40 hover:text-primary',
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    {showProducts && (
                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value as typeof sort)}
                            className="shrink-0 px-3 py-1.5 rounded-full border border-divider bg-white text-xs font-semibold text-text focus:outline-none focus:border-primary cursor-pointer"
                        >
                            <option value="relevance">Sort: Relevance</option>
                            <option value="price_asc">Price: Low → High</option>
                            <option value="price_desc">Price: High → Low</option>
                        </select>
                    )}
                </div>
            )}

            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-4">
                {!query.trim() ? (
                    <div className="text-center py-16">
                        <p className="text-[48px] mb-3">🔍</p>
                        <p className="text-[16px] font-bold text-gray-700">Search for products or vendors</p>
                        <p className="text-[13px] text-gray-400 mt-1">Try &quot;cheese&quot;, &quot;dairy&quot;, or &quot;Sharad&quot;</p>
                    </div>
                ) : !hasResults ? (
                    <div className="text-center py-16">
                        <p className="text-[48px] mb-3">😕</p>
                        <p className="text-[16px] font-bold text-gray-700">No results for &quot;{query}&quot;</p>
                        <p className="text-[13px] text-gray-400 mt-1">Try searching with different keywords</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {servicingIds && pincode && (
                            <p className="text-[12px] text-gray-500 font-semibold">
                                Filtered to vendors delivering to pincode {pincode}
                            </p>
                        )}
                        {/* == BRANDS BLOCK == */}
                        {tab === 'all' && results.brands.length > 0 && (
                            <section>
                                <h2 className="text-[15px] font-bold text-[#181725] mb-3">Brands</h2>
                                <div className="grid grid-cols-2 min-[500px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                    {results.brands.map((b) => (
                                        <BrandStoreCard
                                            key={b.id}
                                            name={b.name}
                                            slug={b.slug}
                                            logoUrl={b.logoUrl ?? undefined}
                                            productImages={b.showcaseImages.length > 0 ? [b.showcaseImages[0]] : []}
                                            categories={b.categories}
                                            bgColor={b.bgColor ?? '#6B1D2E'}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* == VENDORS BLOCK (Primary Path — shown first per V2.2) == */}
                        {showVendors && displayVendors.length > 0 && (
                            <section>
                                <h2 className="text-[15px] font-bold text-[#181725] mb-3">Vendors</h2>
                                <div className="space-y-3">
                                    {displayVendors.map((vendor) => {
                                        const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                                        const categoryMatch = vendor.categories.find(c => slugify(c) === slugify(query));
                                        // Unified Vendor Store URL: ?cat=<slug> deep-links into the
                                        // sub-category sidebar (no separate /category/<vendor>/<cat> page).
                                        const vendorPath = categoryMatch
                                            ? `/vendor/${vendor.id}?cat=${slugify(categoryMatch)}`
                                            : `/vendor/${vendor.id}`;
                                            
                                        return (
                                            <Link
                                                key={vendor.id}
                                                href={vendorPath}
                                                className="flex items-center gap-4 bg-white rounded-2xl p-4 border border-gray-100 hover:shadow-lg hover:shadow-gray-100/50 transition-all group"
                                            >
                                                <div className="w-14 h-14 bg-gray-50 rounded-xl flex items-center justify-center p-2 shrink-0 border border-gray-100 relative overflow-hidden">
                                                    <Image src={vendor.logo || '/placeholder.png'} alt={vendor.name} fill className="object-contain group-hover:scale-110 transition-transform" sizes="56px" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[14px] font-bold text-[#181725]">{vendor.name}</p>
                                                    <p className="text-[11px] text-gray-400 font-medium mt-0.5 line-clamp-1">
                                                        {vendor.categories.join(', ')}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        <div className="flex items-center gap-0.5 text-[10px] font-bold text-green-600">
                                                            <Star size={10} fill="currentColor" />
                                                            {vendor.rating}
                                                        </div>
                                                        <div className="flex items-center gap-0.5 text-[10px] font-semibold text-blue-600">
                                                            <Clock size={10} />
                                                            {vendor.deliveryTime}
                                                        </div>
                                                        <div className="flex items-center gap-0.5 text-[10px] font-semibold text-orange-600">
                                                            <Package size={10} />
                                                            Min ₹{vendor.minOrderValue}
                                                        </div>
                                                        {vendor.creditEnabled && (
                                                            <div className="flex items-center gap-0.5 text-[10px] font-semibold text-purple-600">
                                                                <CreditCard size={10} />
                                                                Credit
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <ChevronRight size={18} className="text-gray-300 shrink-0" />
                                            </Link>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* == PRODUCTS BLOCK (Quick Access — secondary per V2.2) == */}
                        {showProducts && displayProducts.length > 0 && (
                            <section>
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-[18px] font-bold text-[#181725]">Quick Access Products</h2>
                                    <span className="text-[13px] font-semibold text-gray-400">From vendors above</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
                                    {(tab === 'products' ? displayProducts : displayProducts.slice(0, 6)).map((product) => (
                                        <VendorProductCard key={product.id} product={product} />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* == CATEGORIES BLOCK == */}
                        {tab === 'all' && results.categories.length > 0 && (
                            <section>
                                <h2 className="text-[15px] font-bold text-[#181725] mb-3">Categories</h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {results.categories.map((cat) => (
                                        <Link
                                            key={cat.id}
                                            href={`/category/${cat.slug}`}
                                            className="flex items-center gap-3 bg-white rounded-xl p-3 border border-gray-100 hover:shadow-md transition-all"
                                        >
                                            <span className="text-[24px]">{cat.icon}</span>
                                            <div>
                                                <p className="text-[13px] font-bold text-[#181725]">{cat.name}</p>
                                                <p className="text-[10px] text-gray-400 font-medium">{cat.itemCount} items</p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>

            <StickyCartBar />
        </div>
    );
}

export default function SearchPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-white animate-pulse" />}>
            <SearchPageContent />
        </Suspense>
    );
}
