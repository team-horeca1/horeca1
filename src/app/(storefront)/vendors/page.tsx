'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ArrowUpDown, Star, TrendingUp, Sparkles, Building2 } from 'lucide-react';
import { dal } from '@/lib/dal';
import type { Vendor } from '@/types';
import { VendorCard } from '@/components/features/homepage/VendorCardShared';
import { cn } from '@/lib/utils';

type SortOption = 'all' | 'rating' | 'frequent' | 'mov_asc' | 'name_asc';

const SORT_TABS: { id: SortOption; label: string; icon?: React.ElementType }[] = [
    { id: 'all', label: 'All Suppliers' },
    { id: 'rating', label: 'Top Rated', icon: Star },
    { id: 'frequent', label: 'Frequently Ordered', icon: TrendingUp },
    { id: 'mov_asc', label: 'Min Order: Low → High', icon: ArrowUpDown },
    { id: 'name_asc', label: 'Name (A–Z)' },
];

function VendorsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialSort = (searchParams.get('sort') as SortOption) || 'all';

    const [allVendors, setAllVendors] = useState<Vendor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeSort, setActiveSort] = useState<SortOption>(
        SORT_TABS.some((t) => t.id === initialSort) ? initialSort : 'all'
    );

    useEffect(() => {
        dal.vendors.list()
            .then(({ vendors }) => setAllVendors(vendors))
            .catch((err) => console.error('Failed to load vendors:', err))
            .finally(() => setIsLoading(false));
    }, []);

    const handleSortChange = (sortId: SortOption) => {
        setActiveSort(sortId);
        const params = new URLSearchParams(searchParams.toString());
        if (sortId === 'all') {
            params.delete('sort');
        } else {
            params.set('sort', sortId);
        }
        const query = params.toString();
        router.replace(`/vendors${query ? `?${query}` : ''}`, { scroll: false });
    };

    const sortedVendors = useMemo(() => {
        const copy = [...allVendors];
        switch (activeSort) {
            case 'rating':
                return copy.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
            case 'frequent':
                return copy.sort((a, b) => ((b.totalRatings ?? 0) + (b.productCount ?? 0)) - ((a.totalRatings ?? 0) + (a.productCount ?? 0)));
            case 'mov_asc':
                return copy.sort((a, b) => (a.minOrderValue || 0) - (b.minOrderValue || 0));
            case 'name_asc':
                return copy.sort((a, b) => a.name.localeCompare(b.name));
            case 'all':
            default:
                return copy;
        }
    }, [allVendors, activeSort]);

    return (
        <div className="min-h-screen bg-background">
            {/* Header & Breadcrumb */}
            <div className="bg-white/95 backdrop-blur-md sticky top-0 z-40 border-b border-divider">
                <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)] py-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                            <button
                                type="button"
                                onClick={() => router.push('/')}
                                className="size-10 rounded-xl bg-[#F8F7F4] hover:bg-white border border-[#ECE8E1] hover:border-primary/40 flex items-center justify-center text-text transition-all group active:scale-95 shadow-sm shrink-0"
                                aria-label="Go back"
                            >
                                <ChevronLeft size={20} className="text-text group-hover:-translate-x-0.5 transition-transform" strokeWidth={2.4} />
                            </button>
                            <div className="min-w-0">
                                <h1 className="text-xl lg:text-2xl font-bold text-primary tracking-tight">
                                    Suppliers
                                </h1>
                                <p className="text-xs md:text-sm text-text-secondary mt-0.5">
                                    {isLoading ? 'Loading...' : `${sortedVendors.length} suppliers`}
                                </p>
                            </div>
                        </div>

                        {/* Sort selector for desktop / mobile */}
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 shrink-0">
                            {SORT_TABS.map((tab) => {
                                const isActive = activeSort === tab.id;
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => handleSortChange(tab.id)}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 shrink-0 cursor-pointer",
                                            isActive
                                                ? "bg-primary text-white shadow-cdl-1"
                                                : "bg-white border border-divider text-text-secondary hover:border-primary/40 hover:text-primary"
                                        )}
                                    >
                                        {Icon && <Icon size={13} className={isActive ? "text-white" : "text-text-muted"} />}
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Vendor Grid Container */}
            <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)] py-6 md:py-8 pb-32">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-3">
                        <div className="size-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
                        <span className="text-xs font-medium text-text-secondary">Finding verified suppliers...</span>
                    </div>
                ) : sortedVendors.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center max-w-md mx-auto">
                        <div className="size-16 rounded-full bg-primary-light flex items-center justify-center mb-4 text-primary">
                            <Building2 size={28} />
                        </div>
                        <h2 className="text-lg font-bold text-text mb-1">No Suppliers Found</h2>
                        <p className="text-sm text-text-secondary mb-6">
                            No verified suppliers currently match this sorting criteria. Try resetting the filters.
                        </p>
                        <button
                            type="button"
                            onClick={() => handleSortChange('all')}
                            className="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-colors"
                        >
                            Reset Sorting
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-6">
                        {sortedVendors.map((vendor, index) => (
                            <VendorCard key={vendor.id} vendor={vendor} index={index} fluid priority={index < 4} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function VendorsPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-background flex items-center justify-center">
                    <div className="size-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
            }
        >
            <VendorsContent />
        </Suspense>
    );
}
