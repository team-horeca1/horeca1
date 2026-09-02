'use client';

import React, { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dal } from '@/lib/dal';
import type { Vendor } from '@/types';

export function ShopByStoreAlt() {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    const [vendors, setVendors] = useState<Vendor[]>([]);

    useEffect(() => {
        dal.vendors.list().then((res) => setVendors(res.vendors)).catch(console.error);
    }, []);

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
                left: direction === 'left' ? -300 : 300,
                behavior: 'smooth',
            });
            setTimeout(checkScroll, 350);
        }
    };

    const displayVendors = vendors.slice(0, 12);

    // Offer colors cycling
    const offerColors = ['text-red-500', 'text-red-500', 'text-red-500', 'text-red-500'];

    return (
        <section className="w-full py-6 bg-white overflow-hidden">
            <div className="max-w-[var(--container-max)] mx-auto">
                {/* Section Header */}
                <div className="flex items-center justify-between mb-5 px-6 md:px-[var(--container-padding)]">
                    <h2 className="text-[16px] md:text-[18px] lg:text-[22px] font-bold text-[#181725]">
                        Shop By Store
                    </h2>
                    <span className="text-[12px] font-semibold text-primary cursor-pointer hover:underline transition-all">See all</span>
                </div>

                {/* Scrolling Area (Inside max-w) */}
                <div className="relative">
                    {canScrollLeft && (
                        <button
                            onClick={() => scroll('left')}
                            className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full shadow-lg border border-gray-100 items-center justify-center hover:bg-white hover:scale-110 transition-all cursor-pointer"
                        >
                            <ChevronLeft size={20} className="text-gray-600" />
                        </button>
                    )}

                    <div className="overflow-x-auto no-scrollbar scroll-smooth">
                        <div
                            ref={scrollRef}
                            onScroll={checkScroll}
                            className="flex gap-6 md:gap-9 py-4 px-6 md:px-[var(--container-padding)] w-max"
                        >
                        {displayVendors.map((vendor, index) => {
                            // Custom image class per vendor
                            let imgClass = "w-full h-full object-cover";
                            if (vendor.id === 'v3') {
                                imgClass = "w-full h-full object-cover scale-[1.2]";
                            } else if (vendor.id === 'v7') {
                                imgClass = "w-full h-full object-contain scale-[0.85]";
                            }

                            return (
                                <Link
                                    key={`alt-${vendor.id}-${index}`}
                                    href={`/vendor/${vendor.id}`}
                                    className="flex-none flex flex-col items-center group w-[90px] md:w-[110px]"
                                >
                                    {/* Logo Circle - white bg, subtle border, no hover effects */}
                                    <div className="w-[90px] h-[90px] md:w-[110px] md:h-[110px] rounded-full bg-white border border-gray-100 flex items-center justify-center mb-2.5 overflow-hidden shadow-sm">
                                        <img
                                            src={vendor.logo}
                                            alt={vendor.name}
                                            className={imgClass}
                                            loading="lazy"
                                        />
                                    </div>

                                    {/* Vendor Name */}
                                    <h3 className="text-[#111] text-[13px] md:text-[15px] font-bold text-center leading-tight line-clamp-1 w-full">
                                        {vendor.name}
                                    </h3>

                                    {/* Discount */}
                                    <span className={`${offerColors[index % offerColors.length]} text-[11px] md:text-[13px] font-bold mt-0.5 text-center`}>
                                        Flat {20 + (index % 4) * 5}% OFF
                                    </span>
                                </Link>
                            );
                        })}
                        </div>
                    </div>

                    {canScrollRight && (
                        <button
                            onClick={() => scroll('right')}
                            className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full shadow-lg border border-gray-100 items-center justify-center hover:bg-white hover:scale-110 transition-all cursor-pointer"
                        >
                            <ChevronRight size={20} className="text-gray-600" />
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
}
