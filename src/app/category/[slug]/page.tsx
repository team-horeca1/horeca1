'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Search, Star, Clock, ShoppingBag, ChevronDown } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { dal } from '@/lib/dal';
import type { Category } from '@/types';
import { VENDOR_COVERS } from '@/components/features/homepage/VendorCardShared';
import { StickyCartBar } from '@/components/features/vendor/StickyCartBar';
import { useDeliveryPincode } from '@/hooks/useDeliveryPincode';

interface VendorSummary {
    id: string;
    name: string;
    slug: string;
    logo: string;
    rating: number;
    deliveryTime: string;
    minOrderValue: number;
    categories: string[];
}

function CategoryVendorsContent() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string;

    const [category, setCategory] = useState<Category | null>(null);
    const [allCategories, setAllCategories] = useState<Category[]>([]);
    const [vendors, setVendors] = useState<VendorSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState<'relevance' | 'rating' | 'mov_low' | 'mov_high'>('relevance');
    const [servicingIds, setServicingIds] = useState<Set<string> | null>(null);

    const pincode = useDeliveryPincode();

    useEffect(() => {
        if (!slug) return;

        Promise.resolve()
            .then(() => setLoading(true))
            .then(() => dal.categories.list())
            .then(async (cats) => {
                setAllCategories(cats);
                const found = cats.find(c =>
                    c.slug === slug ||
                    c.slug.toLowerCase() === slug.toLowerCase() ||
                    c.name.toLowerCase().replace(/\s+/g, '-') === slug.toLowerCase()
                );
                setCategory(found || null);
                if (found) {
                    const vendorList = await dal.categories.getVendors(found.id);
                    setVendors(vendorList as VendorSummary[]);
                }
            })
            .catch(() => { setCategory(null); setVendors([]); })
            .finally(() => setLoading(false));
    }, [slug]);

    // Pincode serviceability gate — only show vendors that deliver to the user's pincode.
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

    const displayVendors = useMemo(() => {
        const gated = servicingIds ? vendors.filter(v => servicingIds.has(v.id)) : vendors;
        const sorted = [...gated];
        if (sortBy === 'rating') sorted.sort((a, b) => b.rating - a.rating);
        else if (sortBy === 'mov_low') sorted.sort((a, b) => a.minOrderValue - b.minOrderValue);
        else if (sortBy === 'mov_high') sorted.sort((a, b) => b.minOrderValue - a.minOrderValue);
        return sorted;
    }, [vendors, servicingIds, sortBy]);

    const displayName = category?.name || slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="w-8 h-8 border-2 border-[#53B175] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="bg-gray-50/50 min-h-screen pb-24">

            {/* ── MOBILE HEADER ── */}
            <div className="md:hidden bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between sticky top-0 z-40">
                <button onClick={() => router.back()} className="p-1">
                    <ArrowLeft size={22} className="text-[#181725]" strokeWidth={2.5} />
                </button>
                <h1 className="text-[17px] font-black text-[#181725]">{displayName}</h1>
                <Link href="/search" className="p-1">
                    <Search size={22} className="text-[#181725]" strokeWidth={2.5} />
                </Link>
            </div>

            {/* ── DESKTOP HEADER ── */}
            <div className="hidden md:block bg-white border-b border-gray-100">
                <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-8">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 text-[13px] text-gray-400 mb-5 font-medium">
                        <Link href="/" className="hover:text-[#53B175] transition-colors">Home</Link>
                        <span>/</span>
                        <span className="text-[#181725] font-semibold">{displayName}</span>
                    </div>

                    <div className="flex items-center gap-5">
                        {category?.image && (
                            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 shrink-0 flex items-center justify-center p-2">
                                <Image src={category.image} alt={displayName} width={56} height={56} className="object-contain" />
                            </div>
                        )}
                        <div>
                            <h1 className="text-[32px] font-[1000] text-[#181725] tracking-tighter leading-none mb-1">{displayName}</h1>
                            <p className="text-[14px] text-gray-400 font-medium">
                                {vendors.length} vendor{vendors.length !== 1 ? 's' : ''} available
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)] md:flex md:gap-8 md:items-start md:pt-6">

                {/* ── CATEGORY SIDEBAR (desktop) ── */}
                <aside className="hidden md:block w-[280px] shrink-0 sticky top-24">
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm overflow-hidden max-h-[calc(100vh-120px)] overflow-y-auto">
                        <div className="space-y-1">
                            {allCategories.map((cat) => {
                                const isActive = cat.slug === slug;
                                return (
                                    <Link
                                        key={cat.id}
                                        href={`/category/${cat.slug}`}
                                        className={cn(
                                            'flex items-center justify-between w-full p-3 rounded-xl transition-all group',
                                            isActive ? 'bg-[#53B175]/10' : 'hover:bg-gray-50'
                                        )}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={cn(
                                                'w-8 h-8 rounded-lg flex items-center justify-center border transition-all shrink-0',
                                                isActive
                                                    ? 'bg-white border-[#53B175]/20 shadow-sm'
                                                    : 'bg-gray-50 border-transparent group-hover:bg-white group-hover:border-gray-100'
                                            )}>
                                                {cat.image && (
                                                    <Image src={cat.image} alt={cat.name} width={24} height={24} className="w-6 h-6 object-contain" />
                                                )}
                                            </div>
                                            <span className={cn(
                                                'text-[14px] font-bold transition-colors truncate',
                                                isActive ? 'text-[#53B175]' : 'text-[#181725]'
                                            )}>
                                                {cat.name}
                                            </span>
                                        </div>
                                        <ChevronDown size={16} className={cn(
                                            'text-gray-300 transition-all shrink-0',
                                            isActive ? 'text-[#53B175] rotate-[-90deg]' : 'group-hover:text-gray-400'
                                        )} />
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </aside>

                {/* ── MAIN CONTENT ── */}
                <div className="flex-1 min-w-0">

                {/* ── CATEGORY TABS (mobile horizontal scroll) ── */}
                <div className="md:hidden flex gap-2 overflow-x-auto no-scrollbar py-4">
                    {allCategories.map((cat) => (
                        <Link
                            key={cat.id}
                            href={`/category/${cat.slug}`}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-full border text-[13px] font-bold whitespace-nowrap shrink-0 transition-all",
                                cat.slug === slug
                                    ? "bg-[#53B175] border-[#53B175] text-white shadow-lg shadow-green-500/20"
                                    : "bg-white border-gray-100 text-gray-600 hover:border-[#53B175]/40 hover:text-[#53B175]"
                            )}
                        >
                            {cat.image && (
                                <Image src={cat.image} alt={cat.name} width={18} height={18} className="object-contain" />
                            )}
                            {cat.name}
                        </Link>
                    ))}
                </div>

                {/* ── SORT BAR ── */}
                {vendors.length > 0 && (
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <p className="text-[12px] md:text-[13px] text-gray-500 font-semibold">
                            {displayVendors.length} of {vendors.length} vendor{vendors.length !== 1 ? 's' : ''}
                            {servicingIds ? ' serviceable in your pincode' : ''}
                        </p>
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                            {[
                                { key: 'relevance', label: 'Relevance' },
                                { key: 'rating', label: 'Top Rated' },
                                { key: 'mov_low', label: 'MOV: Low → High' },
                                { key: 'mov_high', label: 'MOV: High → Low' },
                            ].map((opt) => (
                                <button
                                    key={opt.key}
                                    type="button"
                                    onClick={() => setSortBy(opt.key as typeof sortBy)}
                                    className={cn(
                                        'shrink-0 px-3 py-1.5 rounded-full border text-[12px] font-bold transition-all',
                                        sortBy === opt.key
                                            ? 'bg-[#53B175] border-[#53B175] text-white'
                                            : 'bg-white border-gray-200 text-gray-600 hover:border-[#53B175]/40 hover:text-[#53B175]',
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── VENDOR LIST ── */}
                {displayVendors.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 text-center">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <ShoppingBag size={32} className="text-gray-300" />
                        </div>
                        <h3 className="text-[18px] font-black text-[#181725] mb-1">
                            {vendors.length > 0 && servicingIds ? `No vendors deliver to ${pincode}` : 'No vendors yet'}
                        </h3>
                        <p className="text-gray-400 text-[14px]">
                            {vendors.length > 0 && servicingIds
                                ? `None of the ${vendors.length} vendor${vendors.length !== 1 ? 's' : ''} carrying ${displayName} currently deliver to your pincode.`
                                : `No vendors carry ${displayName} products right now.`}
                        </p>
                        <Link href="/vendors" className="mt-4 text-[#53B175] font-bold text-[14px]">Browse all vendors</Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 pb-6">
                        {displayVendors.map((vendor, index) => {
                            const cover = VENDOR_COVERS[index % VENDOR_COVERS.length];
                            const addressLine = null; // real address not available on VendorSummary
                            return (
                                <Link
                                    key={vendor.id}
                                    href={`/vendor/${vendor.slug}?cat=${slug}`}
                                    className="bg-white rounded-[16px] border border-gray-100 overflow-hidden shadow-sm hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 group"
                                >
                                    <div className="relative w-full h-[110px] md:h-[130px] overflow-hidden">
                                        <Image
                                            src={cover}
                                            alt={vendor.name}
                                            fill
                                            className="object-cover group-hover:scale-105 transition-transform duration-700"
                                        />
                                    </div>

                                    <div className="p-2.5 md:p-3">
                                        <div className="flex items-start justify-between gap-1 mb-1">
                                            <h3 className="text-[13px] font-extrabold text-[#181725] leading-tight group-hover:text-[#53B175] transition-colors line-clamp-1">
                                                {vendor.name}
                                            </h3>
                                            <div className="flex items-center gap-0.5 bg-[#53B175] text-white px-1.5 py-0.5 rounded-md text-[10px] font-black shrink-0">
                                                {vendor.rating} <Star size={9} fill="white" className="text-white" />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold border-t border-gray-50 pt-2 mt-2">
                                            <div className="flex items-center gap-0.5">
                                                <Clock size={10} className="text-[#53B175]" />
                                                {vendor.deliveryTime}
                                            </div>
                                            <div className="ml-auto text-[#181725] font-black text-[10px]">
                                                MOV ₹{vendor.minOrderValue}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
                </div>
            </div>

            <StickyCartBar />
        </div>
    );
}

export default function CategoryPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-white animate-pulse" />}>
            <CategoryVendorsContent />
        </Suspense>
    );
}
