'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, X, Star, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dal } from '@/lib/dal';
import type { Vendor, VendorProduct, VendorSummary, Category } from '@/types';
import { useCart } from '@/context/CartContext';
import { BrandStoreCard } from '@/components/features/brand/BrandStoreCard';

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

interface MobileSearchOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    /** @deprecated tabs were removed in favor of 3 stacked sections (Categories/Products/Vendors). Kept for API compat. */
    initialTab?: 'items' | 'vendors' | 'stores';
    initialQuery?: string;
}

export function MobileSearchOverlay({ isOpen, onClose, initialQuery = '' }: MobileSearchOverlayProps) {
    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const prevOpenRef = React.useRef(false);
    const { totalItems } = useCart();

    const [vendors, setVendors] = useState<Vendor[]>([]);
    // Vendors returned by the search API — these are vendors that actually carry the searched product
    const [searchResultVendors, setSearchResultVendors] = useState<VendorSummary[]>([]);
    // Categories matching the search query (derived from matched products on the server)
    const [searchResultCategories, setSearchResultCategories] = useState<Category[]>([]);
    const [searchResultBrands, setSearchResultBrands] = useState<SearchBrand[]>([]);

    useEffect(() => {
        dal.vendors.list().then((res) => setVendors(res.vendors)).catch(console.error);
    }, []);

    // Sync search query when overlay opens
    React.useEffect(() => {
        if (isOpen && !prevOpenRef.current) {
            setSearchQuery(initialQuery);
        }
        prevOpenRef.current = isOpen;
    }, [isOpen, initialQuery]);

    // Search products from API when user types
    const [filteredItems, setFilteredItems] = useState<VendorProduct[]>([]);

    useEffect(() => {
        if (!searchQuery.trim()) {
            queueMicrotask(() => {
                setFilteredItems([]);
                setSearchResultVendors([]);
                setSearchResultCategories([]);
                setSearchResultBrands([]);
            });
            return;
        }
        const timeout = setTimeout(() => {
            dal.search.query(searchQuery).then((res) => {
                setFilteredItems(res.products);
                // Use API-returned vendors (vendors that carry the searched product)
                setSearchResultVendors(res.vendors);
                setSearchResultCategories(res.categories);
                setSearchResultBrands(res.brands as SearchBrand[]);
            }).catch(() => {
                setFilteredItems([]);
                setSearchResultVendors([]);
                setSearchResultCategories([]);
                setSearchResultBrands([]);
            });
        }, 300); // debounce 300ms
        return () => clearTimeout(timeout);
    }, [searchQuery]);

    const filteredVendors = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return vendors;

        const cleanQuery = q.replace(/&/g, 'and').replace(/\s+/g, ' ');
        const STOP_WORDS = ['and', 'for', 'with', 'the', 'item', 'list', 'page'];
        const queryKeywords = cleanQuery.split(' ')
            .filter(word => word.length > 2 && !STOP_WORDS.includes(word));

        // Major category terms that should strictly require a catalog match
        const MAJOR_CATEGORIES = ['fruits', 'vegetables', 'dairy', 'oils', 'masala', 'chicken', 'meat', 'pulses', 'rice', 'bakery', 'frozen'];
        const isCategorySearch = queryKeywords.some(word => MAJOR_CATEGORIES.includes(word));

        return vendors.filter(v => {
            const vendorName = v.name.toLowerCase();
            const vendorDesc = (v.description || '').toLowerCase();
            const vendorTags = (v.categories || []).map(tag => tag.toLowerCase().replace(/&/g, 'and'));

            // 1. Store Name Match
            if (vendorName.includes(q)) return true;

            // 2. Description Match
            if (vendorDesc.includes(q)) return true;

            // 3. Tag Match
            const hasTagMatch = vendorTags.some(tag =>
                tag.includes(cleanQuery) ||
                (queryKeywords.length > 0 && queryKeywords.some(word => tag.includes(word)))
            );
            if (hasTagMatch) return true;

            return false;
        });
    }, [searchQuery, vendors]);

    // When user has typed a query, prefer vendors from the search API (they actually carry
    // the product). Fall back to client-side name/tag filtering for browse-without-query.
    const displayVendors = searchQuery.trim() ? searchResultVendors : filteredVendors;

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-[10000] flex flex-col md:items-center md:justify-center bg-black/40 md:bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={onClose}
        >
            {/* Main Overlay Container */}
            <div 
                className="w-full h-full md:h-[90vh] md:max-w-[95vw] md:rounded-[40px] bg-[#F8FAFC] flex flex-col overflow-hidden shadow-[0_32px_128px_rgba(0,0,0,0.18)] relative animate-in zoom-in-95 duration-500"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header/Search Input Section */}
                <div className="bg-white px-4 md:px-12 pt-4 md:pt-10 pb-0 shadow-sm border-b border-gray-100">
                    <div className="flex items-center gap-6 mb-6">
                        <button onClick={onClose} className="p-1 -ml-1 hover:bg-gray-100 rounded-full transition-colors md:hidden">
                            <ArrowLeft size={24} className="text-[#181725]" />
                        </button>
                        <button onClick={onClose} className="hidden md:flex p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors shrink-0">
                            <X size={24} className="text-gray-400" />
                        </button>
                        <div className="flex-1 relative">
                            <div className={cn(
                                "flex items-center gap-3 px-4 py-3 bg-[#F7F7F7] border rounded-2xl shadow-sm transition-all duration-300",
                                searchQuery ? "border-[#53B175] bg-white ring-1 ring-[#53B175]/10" : "border-gray-100"
                            )}>
                                <Search size={22} className={cn("transition-colors", searchQuery ? "text-[#53B175]" : "text-gray-400")} />
                                <input
                                    type="text"
                                    autoFocus
                                    value={searchQuery}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search for product, brand or store..."
                                    className="flex-1 bg-transparent text-[15px] md:text-[16px] text-[#181725] outline-none placeholder:text-gray-400 font-medium w-full"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600 shrink-0 cursor-pointer">
                                        <X size={20} />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                        <Link href="/cart" onClick={onClose} className="relative p-1">
                            <ShoppingCart size={20} className="text-[#181725]" />
                            {totalItems > 0 && (
                                <span className="absolute -top-1 -right-1 bg-[#53B175] text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full font-bold border border-white">
                                    {totalItems}
                                </span>
                            )}
                        </Link>
                    </div>
                </div>

                {/* Result summary chips — counts only, no tabs */}
                {searchQuery.trim() && (
                    <div className="flex items-center gap-4 pb-3.5 text-[13px] font-semibold text-gray-500">
                        <span>{searchResultCategories.length} categor{searchResultCategories.length === 1 ? 'y' : 'ies'}</span>
                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                        <span>{filteredItems.length} product{filteredItems.length === 1 ? '' : 's'}</span>
                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                        <span>{displayVendors.length} vendor{displayVendors.length === 1 ? '' : 's'}</span>
                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                        <span>{searchResultBrands.length} brand{searchResultBrands.length === 1 ? '' : 's'}</span>
                    </div>
                )}
            </div>

            {/* Results Section — 3 stacked blocks per UI/UX Notes #5 (Search-Based Journey):
                Category → Products → Vendors. No tabs — all visible at once. */}
            <div className="flex-1 overflow-y-auto p-4 md:p-12 space-y-3 md:space-y-6">
                {(() => {
                    const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                    const q = searchQuery.toLowerCase().trim();
                    const hasQuery = !!q;

                    // Vendor link target — clicking a vendor always lands on the unified
                    // Vendor Store (/vendor/[id]). If the search term matches a category the
                    // vendor sells, deep-link via ?cat=<slug> so the sub-category sidebar
                    // opens pre-selected. The Vendor Store is the single canonical buying
                    // surface per UI/UX Notes V2.2 ("vendor-first marketplace").
                    const buildVendorTarget = (vendor: VendorSummary) => {
                        const catMatch = vendor.categories.find(c => slugify(c) === slugify(q));
                        if (catMatch) return `/vendor/${vendor.id}?cat=${slugify(catMatch)}`;
                        return `/vendor/${vendor.id}`;
                    };

                    const renderVendorCard = (vendor: VendorSummary) => (
                        <Link
                            key={vendor.id}
                            href={buildVendorTarget(vendor)}
                            onClick={onClose}
                            className="flex items-center gap-4 p-5 md:p-6 bg-white rounded-[24px] border border-[#EEEEEE] active:scale-[0.98] transition-all hover:border-[#53B175]/30 hover:shadow-lg hover:shadow-gray-100 group"
                        >
                            <div className="w-[60px] h-[60px] md:w-[70px] md:h-[70px] min-w-[60px] md:min-w-[70px] rounded-[18px] border border-[#F2F2F2] flex items-center justify-center p-2.5 bg-white overflow-hidden relative shadow-sm">
                                <img src={vendor.logo} alt={vendor.name} className="max-w-full max-h-full object-contain group-hover:scale-110 transition-transform" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-[16px] md:text-[18px] font-bold text-[#181725] leading-tight mb-1 group-hover:text-[#53B175] transition-colors">{vendor.name}</h3>
                                <p className="text-[13px] md:text-[14px] text-[#7C7C7C] font-medium truncate">{vendor.categories.join(', ')}</p>
                            </div>
                            <div className="flex items-center gap-1.5 bg-[#53B175] text-white px-3 py-1.5 rounded-full shrink-0 shadow-sm shadow-green-100">
                                <Star size={14} className="fill-white text-white" />
                                <span className="text-[14px] font-bold">{vendor.rating}</span>
                            </div>
                        </Link>
                    );

                    // === Browse mode: no query → show all vendors ===
                    if (!hasQuery) {
                        return (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6 w-full">
                                {displayVendors.map(renderVendorCard)}
                            </div>
                        );
                    }

                    // === Search mode: categories / products / vendors / brands ===
                    const hasAny =
                        searchResultCategories.length > 0 ||
                        filteredItems.length > 0 ||
                        displayVendors.length > 0 ||
                        searchResultBrands.length > 0;

                    if (!hasAny) {
                        return (
                            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                                <div className="bg-gray-100 p-6 rounded-3xl mb-4">
                                    <Search size={40} className="text-gray-400" />
                                </div>
                                <p className="text-[#181725] font-bold text-xl">No results for &ldquo;{searchQuery}&rdquo;</p>
                                <p className="text-gray-400 text-[15px] mt-2">Try a different keyword or check the spelling</p>
                            </div>
                        );
                    }

                    return (
                        <>
                            {/* === BLOCK 1: CATEGORIES === */}
                            {searchResultCategories.length > 0 && (
                                <section className="bg-white rounded-[16px] p-5 shadow-sm border border-gray-50">
                                    <h2 className="text-[16px] font-bold text-[#181725] mb-4">Categories</h2>
                                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                                        {searchResultCategories.map((cat) => (
                                            <Link
                                                key={cat.id}
                                                href={`/category/${cat.slug}`}
                                                onClick={onClose}
                                                className="flex flex-col items-center gap-2 min-w-[90px] p-3 border border-[#EEEEEE] rounded-[16px] hover:border-[#53B175]/30 hover:bg-gray-50/50 transition-all active:scale-[0.97] group"
                                            >
                                                <div className="w-[56px] h-[56px] rounded-full bg-[#F7FBF8] flex items-center justify-center overflow-hidden border border-[#EEEEEE]">
                                                    <img src={cat.image || '/images/category/vegitable.png'} alt={cat.name} className="w-[70%] h-[70%] object-contain" />
                                                </div>
                                                <span className="text-[12px] font-bold text-[#181725] text-center leading-tight line-clamp-2 group-hover:text-[#53B175] transition-colors">
                                                    {cat.name}
                                                </span>
                                            </Link>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* === BLOCK 1b: BRANDS === */}
                            {searchResultBrands.length > 0 && (
                                <section className="bg-white rounded-[16px] p-5 shadow-sm border border-gray-50">
                                    <h2 className="text-[16px] font-bold text-[#181725] mb-4">Brands</h2>
                                    <div className="grid grid-cols-2 min-[500px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                        {searchResultBrands.map((b) => (
                                            <BrandStoreCard
                                                key={b.id}
                                                name={b.name}
                                                slug={b.slug}
                                                logoUrl={b.logoUrl ?? undefined}
                                                productImages={b.showcaseImages.length > 0 ? [b.showcaseImages[0]] : []}
                                                categories={b.categories}
                                                bgColor={b.bgColor ?? '#f0faf4'}
                                            />
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* === BLOCK 2: PRODUCTS === */}
                            {filteredItems.length > 0 && (
                                <section className="bg-white rounded-[16px] p-5 shadow-sm border border-gray-50">
                                    <h2 className="text-[16px] font-bold text-[#181725] mb-4">Products</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {filteredItems.slice(0, 6).map((item) => {
                                            const label = item.displayName || item.name;
                                            // Per UI/UX Notes #5: Search-based journey always ends at a Vendor Store.
                                            // Clicking a product opens its vendor's store with the product name
                                            // pre-filled in the in-store search, so user lands at "Select Vendor →
                                            // Vendor → Add Items" — never on a standalone product page.
                                            return (
                                            <Link
                                                key={item.id}
                                                href={`/vendor/${item.vendorId}?q=${encodeURIComponent(label)}`}
                                                onClick={onClose}
                                                className="flex items-center gap-4 p-4 border border-[#EEEEEE] rounded-[20px] active:scale-[0.98] transition-all hover:border-[#53B175]/30 hover:bg-gray-50/50 group w-full text-left"
                                            >
                                                <div className="w-[50px] h-[60px] flex items-center justify-center p-1 shrink-0 overflow-hidden bg-white rounded-lg">
                                                    <img src={item.images[0]} alt={label} className="max-w-full max-h-full object-contain group-hover:scale-110 transition-transform" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[15px] font-bold text-[#181725] leading-tight group-hover:text-[#53B175] transition-colors line-clamp-1">
                                                        {label}
                                                    </div>
                                                    <div className="text-[12px] text-gray-400 mt-1 font-medium truncate flex items-center gap-1">
                                                        <span className="text-[#53B175]">from</span>
                                                        <span className="truncate">{item.vendorName || item.category}</span>
                                                    </div>
                                                </div>
                                            </Link>
                                            );
                                        })}
                                    </div>
                                    {filteredItems.length > 6 && (
                                        <Link
                                            href={`/search?q=${encodeURIComponent(searchQuery)}`}
                                            onClick={onClose}
                                            className="mt-4 block text-center text-[13px] font-bold text-[#53B175] hover:underline"
                                        >
                                            View all {filteredItems.length} products →
                                        </Link>
                                    )}
                                </section>
                            )}

                            {/* === BLOCK 3: VENDORS === */}
                            {displayVendors.length > 0 && (
                                <section className="bg-white rounded-[16px] p-5 shadow-sm border border-gray-50">
                                    <h2 className="text-[16px] font-bold text-[#181725] mb-4">Vendors</h2>
                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
                                        {displayVendors.slice(0, 6).map(renderVendorCard)}
                                    </div>
                                </section>
                            )}
                        </>
                    );
                })()}
            </div>
            </div>
        </div>
    );
}
