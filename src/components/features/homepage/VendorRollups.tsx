'use client';

import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useAddress } from '@/context/AddressContext';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import type { Vendor } from '@/types';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { VendorCard } from '@/components/features/homepage/VendorCardShared';

/** Frequently Ordered Vendors — top N vendors by order count for the logged-in user (last 90 days). */
export function FrequentlyOrderedVendors() {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const { status } = useSession();
    const { selectedAddress } = useAddress();
    const { currentOutlet } = useBusinessAccountSwitcher();
    const pincode = currentOutlet?.pincode ?? selectedAddress?.pincode;

    useEffect(() => {
        if (status !== 'authenticated') return;
        const params = new URLSearchParams({ sort: 'frequent', limit: '10' });
        if (pincode && /^\d{6}$/.test(pincode)) params.set('pincode', pincode);
        fetch(`/api/v1/vendors?${params.toString()}`)
            .then((r) => r.json())
            .then((d) => setVendors((d.data?.vendors || []).map((v: {
                id: string;
                businessName?: string;
                slug?: string;
                logoUrl?: string;
                rating?: number | string;
                minOrderValue?: number | string;
                creditEnabled?: boolean;
                categories?: string[];
                bannerUrl?: string;
                createdAt?: string;
                productCount?: number;
                isVerified?: boolean;
            }) => ({
                id: v.id,
                name: v.businessName || '',
                slug: v.slug || '',
                logo: v.logoUrl || '',
                rating: Number(v.rating) || 0,
                minOrderValue: Number(v.minOrderValue) || 0,
                creditEnabled: v.creditEnabled || false,
                categories: v.categories || [],
                isActive: true,
                deliverySchedule: '',
                deliveryTime: '',
                totalRatings: 0,
                coverImage: v.bannerUrl || '',
                description: '',
                createdAt: v.createdAt,
                productCount: v.productCount,
                isVerified: v.isVerified ?? true,
            }))))
            .catch(() => setVendors([]));
    }, [status, pincode]);

    const checkScroll = () => {
        if (scrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
            setCanScrollLeft(scrollLeft > 5);
            setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
        }
    };

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' });
            setTimeout(checkScroll, 350);
        }
    };

    if (vendors.length === 0) return null;

    return (
        <section className="w-full py-6 bg-white overflow-hidden">
            <div className="max-w-[var(--container-max)] mx-auto">
                <div className="px-4 md:px-[var(--container-padding)]">
                    <SectionHeader
                        title="Frequently Ordered"
                        subtitle="Vendors you restock from most often"
                        actionLabel="View all →"
                        actionHref="/vendors?sort=frequent"
                    />
                </div>
                <div className="relative w-full">
                    <button
                        type="button"
                        onClick={() => scroll('left')}
                        disabled={!canScrollLeft}
                        className="hidden md:flex absolute -left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white rounded-full shadow-[0_10px_30px_-5px_rgba(0,0,0,0.15)] items-center justify-center hover:scale-110 active:scale-95 transition-all border border-gray-100 disabled:opacity-20 disabled:cursor-not-allowed"
                        aria-label="Scroll left"
                    >
                        <ChevronLeft size={24} className="text-text" strokeWidth={2.5} />
                    </button>
                    <div ref={scrollRef} onScroll={checkScroll} className="overflow-x-auto no-scrollbar scroll-smooth w-full">
                        <div className="flex gap-4 md:gap-6 py-4 px-4 md:px-[var(--container-padding)] w-max">
                            {vendors.map((vendor, index) => (
                                <VendorCard key={vendor.id} vendor={vendor} index={index} />
                            ))}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => scroll('right')}
                        disabled={!canScrollRight}
                        className="hidden md:flex absolute -right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white rounded-full shadow-[0_10px_30px_-5px_rgba(0,0,0,0.15)] items-center justify-center hover:scale-110 active:scale-95 transition-all border border-gray-100 disabled:opacity-20 disabled:cursor-not-allowed"
                        aria-label="Scroll right"
                    >
                        <ChevronRight size={24} className="text-text" strokeWidth={2.5} />
                    </button>
                </div>
            </div>
        </section>
    );
}

/** Top Rated Vendors — vendors with rating >= 4.5 AND orderCount >= 10, filtered by serviceability. */
export function TopRatedVendors() {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const { selectedAddress } = useAddress();
    const { currentOutlet } = useBusinessAccountSwitcher();
    const pincode = currentOutlet?.pincode ?? selectedAddress?.pincode;

    useEffect(() => {
        const params = new URLSearchParams({ sort: 'rating', limit: '10' });
        if (pincode && /^\d{6}$/.test(pincode)) params.set('pincode', pincode);
        fetch(`/api/v1/vendors?${params.toString()}`)
            .then((r) => r.json())
            .then((d) => setVendors((d.data?.vendors || []).map((v: {
                id: string;
                businessName?: string;
                slug?: string;
                logoUrl?: string;
                rating?: number | string;
                minOrderValue?: number | string;
                creditEnabled?: boolean;
                categories?: string[];
                bannerUrl?: string;
                createdAt?: string;
                productCount?: number;
                isVerified?: boolean;
            }) => ({
                id: v.id,
                name: v.businessName || '',
                slug: v.slug || '',
                logo: v.logoUrl || '',
                rating: Number(v.rating) || 0,
                minOrderValue: Number(v.minOrderValue) || 0,
                creditEnabled: v.creditEnabled || false,
                categories: v.categories || [],
                isActive: true,
                deliverySchedule: '',
                deliveryTime: '',
                totalRatings: 0,
                coverImage: v.bannerUrl || '',
                description: '',
                createdAt: v.createdAt,
                productCount: v.productCount,
                isVerified: v.isVerified ?? true,
            }))))
            .catch(() => setVendors([]));
    }, [pincode]);

    const checkScroll = () => {
        if (scrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
            setCanScrollLeft(scrollLeft > 5);
            setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
        }
    };

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' });
            setTimeout(checkScroll, 350);
        }
    };

    if (vendors.length === 0) return null;

    return (
        <section className="w-full py-6 bg-white overflow-hidden">
            <div className="max-w-[var(--container-max)] mx-auto">
                <div className="px-4 md:px-[var(--container-padding)]">
                    <SectionHeader
                        title="Popular Suppliers Near You"
                        actionLabel="View all →"
                        actionHref="/vendors?sort=rating"
                    />
                </div>
                <div className="relative w-full">
                    <button
                        type="button"
                        onClick={() => scroll('left')}
                        disabled={!canScrollLeft}
                        className="hidden md:flex absolute -left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white rounded-full shadow-[0_10px_30px_-5px_rgba(0,0,0,0.15)] items-center justify-center hover:scale-110 active:scale-95 transition-all border border-gray-100 disabled:opacity-20 disabled:cursor-not-allowed"
                        aria-label="Scroll left"
                    >
                        <ChevronLeft size={24} className="text-text" strokeWidth={2.5} />
                    </button>
                    <div ref={scrollRef} onScroll={checkScroll} className="overflow-x-auto no-scrollbar scroll-smooth w-full">
                        <div className="flex gap-4 md:gap-6 py-4 px-4 md:px-[var(--container-padding)] w-max">
                            {vendors.map((vendor, index) => (
                                <VendorCard key={vendor.id} vendor={vendor} index={index} />
                            ))}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => scroll('right')}
                        disabled={!canScrollRight}
                        className="hidden md:flex absolute -right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white rounded-full shadow-[0_10px_30px_-5px_rgba(0,0,0,0.15)] items-center justify-center hover:scale-110 active:scale-95 transition-all border border-gray-100 disabled:opacity-20 disabled:cursor-not-allowed"
                        aria-label="Scroll right"
                    >
                        <ChevronRight size={24} className="text-text" strokeWidth={2.5} />
                    </button>
                </div>
            </div>
        </section>
    );
}
