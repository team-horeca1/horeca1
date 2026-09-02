'use client';

import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dal } from '@/lib/dal';
import { useAddress } from '@/context/AddressContext';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import type { Vendor } from '@/types';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { VendorCard } from '@/components/features/homepage/VendorCardShared';

export function NearbyVendors() {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [servicingIds, setServicingIds] = useState<Set<string> | null>(null);
    const { selectedAddress } = useAddress();
    // V2.2: when the customer has an active outlet, that outlet's pincode is the
    // single source of truth. Fall back to the localStorage-backed address pincode
    // only for guests (and for logged-in users while the outlet pincode is loading).
    const { currentOutlet } = useBusinessAccountSwitcher();
    const pincode = currentOutlet?.pincode ?? selectedAddress?.pincode;

    useEffect(() => {
        dal.vendors.list().then((res) => setVendors(res.vendors)).catch(console.error);
    }, []);

    // Pincode serviceability gate — fetch vendor ids that service the user's pincode.
    // If pincode is unknown, render the full list (no gate).
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
                if (cancelled) return;
                setServicingIds(null); // fall back to unfiltered on error
            });
        return () => {
            cancelled = true;
        };
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
            scrollRef.current.scrollBy({
                left: direction === 'left' ? -320 : 320,
                behavior: 'smooth',
            });
            setTimeout(checkScroll, 350);
        }
    };

    const filteredVendors = servicingIds ? vendors.filter((v) => servicingIds.has(v.id)) : vendors;
    const displayVendors = filteredVendors.slice(0, 10);

    return (
        <section id="vendors" className="w-full py-6 bg-white overflow-hidden">
            <div className="max-w-[var(--container-max)] mx-auto">
                <div className="px-4 md:px-[var(--container-padding)]">
                    <SectionHeader
                        title="Shop by Vendor"
                        subtitle={pincode ? `Verified suppliers delivering to ${pincode}` : 'Explore verified hospitality suppliers'}
                        actionLabel="View all →"
                        actionHref="/vendors"
                    />
                </div>

                {/* Horizontal Scroll Cards with Side Arrows */}
                <div className="relative w-full">
                    <button
                        onClick={() => scroll('left')}
                        disabled={!canScrollLeft}
                        className="hidden md:flex absolute -left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white rounded-full shadow-[0_10px_30px_-5px_rgba(0,0,0,0.15)] flex items-center justify-center hover:scale-110 active:scale-95 transition-all border border-gray-100 disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        <ChevronLeft size={24} className="text-[#181725]" strokeWidth={2.5} />
                    </button>

                    <div
                        ref={scrollRef}
                        onScroll={checkScroll}
                        className="overflow-x-auto no-scrollbar scroll-smooth w-full"
                    >
                        <div className="flex gap-4 md:gap-6 py-4 px-6 md:px-[var(--container-padding)] w-max">
                            {displayVendors.map((vendor, index) => (
                                <VendorCard key={vendor.id} vendor={vendor} index={index} />
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={() => scroll('right')}
                        disabled={!canScrollRight}
                        className="hidden md:flex absolute -right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white rounded-full shadow-[0_10px_30px_-5px_rgba(0,0,0,0.15)] flex items-center justify-center hover:scale-110 active:scale-95 transition-all border border-gray-100 disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        <ChevronRight size={24} className="text-[#181725]" strokeWidth={2.5} />
                    </button>
                </div>
            </div>
        </section>
    );
}
