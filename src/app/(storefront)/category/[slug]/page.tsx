'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Search, Star, Clock, ShoppingBag, ChevronRight, LayoutGrid, Package } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { dal } from '@/lib/dal';
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

interface CatNode {
    id: string;
    name: string;
    slug: string;
    image?: string;
    children: CatNode[];
}

function parseCat(raw: Record<string, unknown>): CatNode {
    const childrenRaw = Array.isArray(raw.children) ? raw.children : [];
    return {
        id: String(raw.id ?? ''),
        name: String(raw.name ?? ''),
        slug: String(raw.slug ?? ''),
        image: (raw.imageUrl as string) || (raw.image as string) || undefined,
        children: childrenRaw
            .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
            .map(parseCat),
    };
}

function findBySlug(nodes: CatNode[], slug: string): { parent: CatNode; child: CatNode | null } | null {
    const needle = slug.toLowerCase();
    for (const parent of nodes) {
        if (parent.slug.toLowerCase() === needle) return { parent, child: null };
        const child = parent.children.find((c) => c.slug.toLowerCase() === needle);
        if (child) return { parent, child };
    }
    return null;
}

function CategoryVendorsContent() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string;

    const [tree, setTree] = useState<CatNode[]>([]);
    const [vendors, setVendors] = useState<VendorSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState<'relevance' | 'rating' | 'mov_low' | 'mov_high'>('relevance');
    const [servicingIds, setServicingIds] = useState<Set<string> | null>(null);

    const pincode = useDeliveryPincode();

    const match = useMemo(() => (slug ? findBySlug(tree, slug) : null), [tree, slug]);
    const activeParent = match?.parent ?? null;
    const activeChild = match?.child ?? null;
    const viewingParentTiles = Boolean(activeParent && !activeChild && activeParent.children.length > 0);
    const vendorCategoryId = activeChild?.id ?? (activeParent && activeParent.children.length === 0 ? activeParent.id : null);

    useEffect(() => {
        if (!slug) return;
        let cancelled = false;
        queueMicrotask(() => setLoading(true));

        (async () => {
            try {
                const raw = await dal.categories.listTree();
                if (cancelled) return;
                const nodes = raw.map((r) => parseCat(r as Record<string, unknown>)).filter((n) => n.id);
                setTree(nodes);

                const found = findBySlug(nodes, slug);
                const leafId =
                    found?.child?.id ??
                    (found?.parent && found.parent.children.length === 0 ? found.parent.id : null);

                if (leafId) {
                    const vendorList = await dal.categories.getVendors(leafId);
                    if (!cancelled) setVendors(vendorList as VendorSummary[]);
                } else if (!cancelled) {
                    setVendors([]);
                }
            } catch {
                if (!cancelled) {
                    setTree([]);
                    setVendors([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [slug]);

    useEffect(() => {
        if (!pincode || !/^\d{6}$/.test(pincode)) {
            queueMicrotask(() => setServicingIds(null));
            return;
        }
        let cancelled = false;
        dal.vendors
            .checkServiceability(pincode)
            .then((res) => {
                if (cancelled) return;
                setServicingIds(new Set(res.vendorIds ?? []));
            })
            .catch(() => {
                if (!cancelled) setServicingIds(null);
            });
        return () => {
            cancelled = true;
        };
    }, [pincode]);

    const displayVendors = useMemo(() => {
        const gated = servicingIds ? vendors.filter((v) => servicingIds.has(v.id)) : vendors;
        const sorted = [...gated];
        if (sortBy === 'rating') sorted.sort((a, b) => b.rating - a.rating);
        else if (sortBy === 'mov_low') sorted.sort((a, b) => a.minOrderValue - b.minOrderValue);
        else if (sortBy === 'mov_high') sorted.sort((a, b) => b.minOrderValue - a.minOrderValue);
        return sorted;
    }, [vendors, servicingIds, sortBy]);

    const displayName =
        activeChild?.name ||
        activeParent?.name ||
        slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="size-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="bg-background min-h-screen pb-24">
            <div className="md:hidden bg-white/95 backdrop-blur-md border-b border-divider px-4 py-4 flex items-center justify-between sticky top-0 z-40">
                <button type="button" onClick={() => router.back()} className="p-1">
                    <ArrowLeft size={22} className="text-text" strokeWidth={2} />
                </button>
                <h1 className="text-base font-bold text-primary truncate px-2">{displayName}</h1>
                <Link href="/search" className="p-1">
                    <Search size={22} className="text-text" strokeWidth={2} />
                </Link>
            </div>

            <div className="hidden md:block bg-white border-b border-divider">
                <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-8">
                    <div className="flex items-center gap-2 text-[13px] text-text-secondary mb-5 font-medium">
                        <Link href="/" className="hover:text-primary transition-colors">Home</Link>
                        <span>/</span>
                        <Link href="/category" className="hover:text-primary transition-colors">Categories</Link>
                        {activeChild && activeParent ? (
                            <>
                                <span>/</span>
                                <Link href={`/category/${activeParent.slug}`} className="hover:text-primary transition-colors">
                                    {activeParent.name}
                                </Link>
                            </>
                        ) : null}
                        <span>/</span>
                        <span className="text-text font-semibold">{displayName}</span>
                    </div>

                    <div className="flex items-center gap-5">
                        {(activeChild?.image || activeParent?.image) && (
                            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white ring-4 ring-white shadow-md shrink-0 relative">
                                <Image
                                    src={(activeChild?.image || activeParent?.image)!}
                                    alt={displayName}
                                    fill
                                    sizes="64px"
                                    className="object-cover"
                                />
                            </div>
                        )}
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight leading-none mb-1">
                                {displayName}
                            </h1>
                            <p className="text-sm text-text-secondary">
                                {viewingParentTiles
                                    ? `${activeParent?.children.length ?? 0} sub-categor${(activeParent?.children.length ?? 0) === 1 ? 'y' : 'ies'}`
                                    : `${vendors.length} wholesale vendor${vendors.length !== 1 ? 's' : ''} available`}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)] pt-4 md:pt-6">
                <div className="flex gap-2 md:gap-4 lg:gap-6 items-start">
                    {/* Same pattern as vendor store: parent rail only; click drills into sub-categories. */}
                    <aside className="w-[76px] md:w-[200px] lg:w-[260px] shrink-0 sticky top-24">
                        <div className="bg-white rounded-2xl border border-gray-100 p-1 md:p-3 shadow-sm max-h-[calc(100vh-120px)] overflow-y-auto">
                            <Link
                                href="/category"
                                className={cn(
                                    'w-full rounded-xl transition-all text-left flex flex-col items-center md:flex-row md:items-center md:justify-between px-1 md:px-3 py-3 md:py-2.5',
                                    !slug ? 'bg-primary-light' : 'hover:bg-gray-50',
                                )}
                            >
                                <div className="flex flex-col items-center md:flex-row md:items-center md:gap-3 min-w-0 w-full">
                                    <div className="w-12 h-12 md:w-9 md:h-9 rounded-lg flex items-center justify-center shrink-0 bg-white ring-2 ring-white shadow-sm border border-divider overflow-hidden">
                                        <LayoutGrid className="w-5 h-5 md:w-4 md:h-4 text-gray-400" strokeWidth={1.5} />
                                    </div>
                                    <span className="text-[10px] md:text-[13px] font-semibold md:font-bold leading-tight text-center md:text-left mt-1 md:mt-0 line-clamp-2 md:truncate w-full md:flex-1 text-[#181725]">
                                        All Categories
                                    </span>
                                </div>
                            </Link>

                            {tree.map((parent) => {
                                const isParentActive =
                                    activeParent?.id === parent.id ||
                                    parent.children.some((c) => c.id === activeChild?.id);
                                return (
                                    <Link
                                        key={parent.id}
                                        href={`/category/${parent.slug}`}
                                        className={cn(
                                            'w-full mt-1 rounded-xl transition-all text-left flex flex-col items-center md:flex-row md:items-center md:gap-3 px-1 md:px-3 py-2 md:py-2.5 min-w-0',
                                            isParentActive ? 'bg-primary-light' : 'hover:bg-gray-50',
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                'w-12 h-12 md:w-9 md:h-9 rounded-lg overflow-hidden relative shrink-0 bg-white ring-2 ring-white shadow-sm',
                                                isParentActive ? 'border border-primary/30' : 'border border-divider',
                                            )}
                                        >
                                            {parent.image ? (
                                                <Image
                                                    src={parent.image}
                                                    alt={parent.name}
                                                    fill
                                                    sizes="48px"
                                                    className="object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gray-50">
                                                    <Package size={16} className="text-gray-300" strokeWidth={1.5} />
                                                </div>
                                            )}
                                        </div>
                                        <span
                                            className={cn(
                                                'text-[10px] md:text-[13px] font-semibold md:font-bold leading-tight text-center md:text-left mt-1 md:mt-0 line-clamp-2 md:truncate w-full md:flex-1',
                                                isParentActive ? 'text-primary' : 'text-[#181725]',
                                            )}
                                        >
                                            {parent.name}
                                        </span>
                                        <span className="hidden md:inline text-[11px] font-bold text-gray-400 shrink-0 ml-auto">
                                            {parent.children.length || ''}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    </aside>

                    <div className="flex-1 min-w-0">
                        {viewingParentTiles && activeParent ? (
                            <div>
                                <h2 className="text-[clamp(1.1rem,2vw+0.5rem,1.6rem)] font-black text-[#181725] mb-4">
                                    {activeParent.name}
                                </h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                                    {activeParent.children.map((child) => (
                                        <Link
                                            key={child.id}
                                            href={`/category/${child.slug}`}
                                            className="group bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md hover:border-primary/40 transition-all flex flex-col items-center text-center"
                                        >
                                            <div className="w-20 h-20 rounded-xl bg-white ring-4 ring-white shadow-md overflow-hidden relative mb-3 border border-divider">
                                                {child.image ? (
                                                    <Image
                                                        src={child.image}
                                                        alt={child.name}
                                                        fill
                                                        sizes="80px"
                                                        className="object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-gray-50">
                                                        <Package size={28} className="text-gray-300" strokeWidth={1.5} />
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-[13px] font-bold text-[#181725] leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                                                {child.name}
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div>
                                {activeChild && activeParent ? (
                                    <div className="flex items-center gap-1.5 mb-3 text-[12px] font-bold">
                                        <Link
                                            href={`/category/${activeParent.slug}`}
                                            className="text-gray-400 hover:text-primary transition-colors"
                                        >
                                            {activeParent.name}
                                        </Link>
                                        <ChevronRight size={13} className="text-gray-300" strokeWidth={2.5} />
                                        <span className="text-[#181725]">{activeChild.name}</span>
                                    </div>
                                ) : null}

                                {vendors.length > 0 && (
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                        <p className="text-xs text-text-secondary">
                                            Showing {displayVendors.length} of {vendors.length} vendor
                                            {vendors.length !== 1 ? 's' : ''}
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

                                {displayVendors.length === 0 && vendorCategoryId ? (
                                    <div className="flex flex-col items-center justify-center py-24 text-center max-w-md mx-auto">
                                        <div className="size-16 rounded-full bg-primary-light flex items-center justify-center mb-4 text-primary">
                                            <ShoppingBag size={28} />
                                        </div>
                                        <h3 className="text-lg font-bold text-text mb-1">
                                            {vendors.length > 0 && servicingIds
                                                ? `No vendors deliver to ${pincode}`
                                                : 'No vendors yet'}
                                        </h3>
                                        <p className="text-text-secondary text-sm mb-4">
                                            {vendors.length > 0 && servicingIds
                                                ? `None of the ${vendors.length} vendor${vendors.length !== 1 ? 's' : ''} carrying ${displayName} currently deliver to your pincode.`
                                                : `No vendors carry ${displayName} products right now.`}
                                        </p>
                                        <Link
                                            href="/vendors"
                                            className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-colors"
                                        >
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
                                                        <div className="flex items-start justify-between gap-1 mb-1.5">
                                                            <h3 className="text-xs md:text-sm font-bold text-text leading-tight group-hover:text-primary transition-colors line-clamp-1">
                                                                {vendor.name}
                                                            </h3>
                                                            <div className="flex items-center gap-0.5 text-[11px] font-bold text-text shrink-0">
                                                                <Star size={11} className="fill-amber-400 text-amber-400" />
                                                                <span>{vendor.rating}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between text-[11px] text-text-secondary border-t border-divider pt-2 mt-2">
                                                            <div className="flex items-center gap-1 text-text-muted">
                                                                <Clock size={11} />
                                                                <span>{vendor.deliveryTime}</span>
                                                            </div>
                                                            <div className="font-semibold text-text">MOV ₹{vendor.minOrderValue}</div>
                                                        </div>
                                                    </div>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
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
