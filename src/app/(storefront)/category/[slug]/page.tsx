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
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="size-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="bg-background min-h-screen pb-24">

            {/* ── MOBILE HEADER ── */}
            <div className="md:hidden bg-white/95 backdrop-blur-md border-b border-divider px-4 py-4 flex items-center justify-between sticky top-0 z-40">
                <button type="button" onClick={() => router.back()} className="p-1">
                    <ArrowLeft size={22} className="text-text" strokeWidth={2} />
                </button>
                <h1 className="text-base font-bold text-primary truncate px-2">{displayName}</h1>
                <Link href="/search" className="p-1">
                    <Search size={22} className="text-text" strokeWidth={2} />
                </Link>
            </div>

            {/* ── DESKTOP HEADER ── */}
            <div className="hidden md:block bg-white border-b border-divider">
                <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-8">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 text-[13px] text-text-secondary mb-5 font-medium">
                        <Link href="/" className="hover:text-primary transition-colors">Home</Link>
                        <span>/</span>
                        <Link href="/category" className="hover:text-primary transition-colors">Categories</Link>
                        <span>/</span>
                        <span className="text-text font-semibold">{displayName}</span>
                    </div>

                    <div className="flex items-center gap-5">
                        {category?.image && (
                            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-ivory border border-divider shrink-0 flex items-center justify-center p-2">
                                <Image src={category.image} alt={displayName} width={56} height={56} className="object-contain" />
                            </div>
                        )}
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight leading-none mb-1">{displayName}</h1>
                            <p className="text-sm text-text-secondary">
                                {vendors.length} wholesale vendor{vendors.length !== 1 ? 's' : ''} available
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)] md:flex md:gap-8 md:items-start md:pt-6">

                {/* ── CATEGORY SIDEBAR (desktop) ── */}
                <aside className="hidden md:block w-[280px] shrink-0 sticky top-24">
                    <div className="bg-white rounded-2xl border border-divider p-4 shadow-cdl-1 overflow-hidden max-h-[calc(100vh-120px)] overflow-y-auto">
                        <div className="space-y-1">
                            {allCategories.map((cat) => {
                                const isActive = cat.slug === slug;
                                return (
                                    <Link
                                        key={cat.id}
                                        href={`/category/${cat.slug}`}
                                        className={cn(
                                            'flex items-center justify-between w-full p-2.5 rounded-xl transition-all group',
                                            isActive ? 'bg-primary-light text-primary font-bold' : 'hover:bg-ivory text-text'
                                        )}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={cn(
                                                'w-8 h-8 rounded-lg flex items-center justify-center border transition-all shrink-0',
                                                isActive
                                                    ? 'bg-white border-primary/30 shadow-sm'
                                                    : 'bg-ivory border-divider group-hover:bg-white group-hover:border-divider'
                                            )}>
                                                {cat.image && (
                                                    <Image src={cat.image} alt={cat.name} width={24} height={24} className="w-6 h-6 object-contain" />
                                                )}
                                            </div>
                                            <span className={cn(
                                                'text-sm font-semibold transition-colors truncate',
                                                isActive ? 'text-primary font-bold' : 'text-text group-hover:text-primary'
                                            )}>
                                                {cat.name}
                                            </span>
                                        </div>
                                        <ChevronDown size={16} className={cn(
                                            'text-text-muted transition-all shrink-0',
                                            isActive ? 'text-primary rotate-[-90deg]' : 'group-hover:text-text'
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
                                "flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap shrink-0 transition-all",
                                cat.slug === slug
                                    ? "bg-primary border-primary text-white shadow-cdl-1"
                                    : "bg-white border-divider text-text-secondary hover:border-primary/40 hover:text-primary"
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <p className="text-xs text-text-secondary">
                            Showing {displayVendors.length} of {vendors.length} vendor{vendors.length !== 1 ? 's' : ''}
                            {servicingIds ? ' delivering to your pincode' : ''}
                        </p>
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
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
                                        'shrink-0 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all',
                                        sortBy === opt.key
                                            ? 'bg-primary border-primary text-white shadow-cdl-1'
                                            : 'bg-white border-divider text-text-secondary hover:border-primary/40 hover:text-primary',
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
                    <div className="flex flex-col items-center justify-center py-24 text-center max-w-md mx-auto">
                        <div className="size-16 rounded-full bg-primary-light flex items-center justify-center mb-4 text-primary">
                            <ShoppingBag size={28} />
                        </div>
                        <h3 className="text-lg font-bold text-text mb-1">
                            {vendors.length > 0 && servicingIds ? `No vendors deliver to ${pincode}` : 'No vendors yet'}
                        </h3>
                        <p className="text-text-secondary text-sm mb-4">
                            {vendors.length > 0 && servicingIds
                                ? `None of the ${vendors.length} vendor${vendors.length !== 1 ? 's' : ''} carrying ${displayName} currently deliver to your pincode.`
                                : `No vendors carry ${displayName} products right now.`}
                        </p>
                        <Link href="/vendors" className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-colors">
                            Browse all vendors
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 pb-6">
                        {displayVendors.map((vendor, index) => {
                            const cover = VENDOR_COVERS[index % VENDOR_COVERS.length];
                            return (
                                <Link
                                    key={vendor.id}
                                    href={`/vendor/${vendor.slug}?cat=${slug}`}
                                    className="bg-white rounded-xl border border-divider overflow-hidden shadow-cdl-1 hover:shadow-cdl-2 hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-200 group flex flex-col justify-between"
                                >
                                    <div className="relative w-full h-[110px] md:h-[130px] overflow-hidden bg-ivory">
                                        <Image
                                            src={cover}
                                            alt={vendor.name}
                                            fill
                                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                    </div>

                                    <div className="p-3 flex flex-col flex-1 justify-between">
                                        <div>
                                            <div className="flex items-start justify-between gap-1 mb-1.5">
                                                <h3 className="text-xs md:text-sm font-bold text-text leading-tight group-hover:text-primary transition-colors line-clamp-1">
                                                    {vendor.name}
                                                </h3>
                                                <div className="flex items-center gap-0.5 text-[11px] font-bold text-text shrink-0">
                                                    <Star size={11} className="fill-amber-400 text-amber-400" />
                                                    <span>{vendor.rating}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between text-[11px] text-text-secondary border-t border-divider pt-2 mt-2">
                                            <div className="flex items-center gap-1 text-text-muted">
                                                <Clock size={11} />
                                                <span>{vendor.deliveryTime}</span>
                                            </div>
                                            <div className="font-semibold text-text">
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
