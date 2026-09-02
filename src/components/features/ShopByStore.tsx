'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { dal } from '@/lib/dal';
import type { Vendor } from '@/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function ShopByStore() {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [isMobileExpanded, setIsMobileExpanded] = useState(false);
    const [isDesktopExpanded, setIsDesktopExpanded] = useState(false);
    const desktopScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        dal.vendors.list().then((res) => setVendors(res.vendors)).catch(console.error);
    }, []);

    // Duplicate vendors for desktop to fill horizontal scroll without empty space
    const desktopVendors = [...vendors, ...vendors, ...vendors];

    const scrollLeft = () => {
        desktopScrollRef.current?.scrollBy({ left: -400, behavior: 'smooth' });
    };

    const scrollRight = () => {
        desktopScrollRef.current?.scrollBy({ left: 400, behavior: 'smooth' });
    };



    return (
        <section className="w-full pt-4 pb-2 bg-white overflow-hidden">
            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-[16px] md:text-[20px] lg:text-[22px] font-[700] text-[#181725]">Shop By Store</h2>
                    {/* Mobile toggle */}
                    <button
                        onClick={() => setIsMobileExpanded(!isMobileExpanded)}
                        className="text-[13px] font-semibold text-primary hover:opacity-80 transition-opacity md:hidden cursor-pointer"
                    >
                        {isMobileExpanded ? "Show Less" : "See All"}
                    </button>
                    {/* Desktop toggle */}
                    <button
                        onClick={() => setIsDesktopExpanded(!isDesktopExpanded)}
                        className="hidden md:block text-[15px] font-semibold text-primary hover:opacity-80 transition-opacity cursor-pointer"
                    >
                        {isDesktopExpanded ? "Show Less" : "See All"}
                    </button>
                </div>

                {/* Mobile: collapsed = 2-row horizontal scroll, expanded = wrapping grid */}
                {isMobileExpanded ? (
                    <div className="md:hidden grid grid-cols-4 sm:grid-cols-4 gap-x-3 gap-y-6 pb-4">
                        {vendors.map((vendor, index) => (
                            <StoreCard key={`mob-exp-${vendor.id}-${index}`} vendor={vendor} />
                        ))}
                    </div>
                ) : (
                    <div className="md:hidden grid grid-rows-2 grid-flow-col overflow-x-auto auto-cols-[90px] gap-x-3 gap-y-6 no-scrollbar pb-4">
                        {vendors.map((vendor, index) => (
                            <StoreCard key={`mob-scr-${vendor.id}-${index}`} vendor={vendor} />
                        ))}
                    </div>
                )}

                {/* Desktop: collapsed = 2-row horizontal scroll, expanded = wrapping grid */}
                <div className="hidden md:block relative group/scroll">
                    {!isDesktopExpanded && (
                        <button
                            onClick={scrollLeft}
                            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-9 h-9 bg-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform border border-gray-100 opacity-0 group-hover/scroll:opacity-100"
                        >
                            <ChevronLeft size={18} className="text-gray-500" />
                        </button>
                    )}

                    {isDesktopExpanded ? (
                        <div className="grid grid-cols-[repeat(auto-fill,120px)] lg:grid-cols-[repeat(auto-fill,130px)] justify-between gap-x-5 gap-y-6 pb-4">
                            {desktopVendors.map((vendor, index) => (
                                <StoreCard key={`desk-exp-${vendor.id}-${index}`} vendor={vendor} />
                            ))}
                        </div>
                    ) : (
                        <div
                            ref={desktopScrollRef}
                            className="grid grid-rows-2 grid-flow-col overflow-x-auto auto-cols-[120px] lg:auto-cols-[130px] gap-x-5 gap-y-6 no-scrollbar pb-4 scroll-smooth"
                        >
                            {desktopVendors.map((vendor, index) => (
                                <StoreCard key={`desk-scr-${vendor.id}-${index}`} vendor={vendor} />
                            ))}
                        </div>
                    )}

                    {!isDesktopExpanded && (
                        <button
                            onClick={scrollRight}
                            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-9 h-9 bg-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform border border-gray-100 opacity-0 group-hover/scroll:opacity-100"
                        >
                            <ChevronRight size={18} className="text-gray-500" />
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
}

const StoreCard = ({ vendor }: { vendor: Vendor }) => {
    const isCircular = vendor.id === 'v2';
    const categoriesLabel = vendor.categories.slice(0, 2).join(', ') +
        (vendor.categories.length > 2 ? `, ${vendor.categories.length - 2}+` : '');
    return (
        <div className="flex flex-col items-center w-full">
            <Link
                href={`/vendor/${vendor.id}`}
                className="w-full flex flex-col items-center group"
            >
                <img
                    src={vendor.logo}
                    alt={vendor.name}
                    className={cn(
                        "w-[85px] h-[85px] md:w-[100px] md:h-[100px] mb-3 object-cover transition-all duration-300 active:scale-95 group-hover:scale-105",
                        isCircular ? "rounded-full" : "rounded-2xl"
                    )}
                />
                <div className="text-center w-full px-0.5">
                    <h3 className="text-[14px] md:text-[16px] font-bold text-[#181725] mb-0.5 leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                        {vendor.name}
                    </h3>
                    <p className="text-[10px] md:text-[11px] text-[#7C7C7C] font-medium leading-tight line-clamp-2">
                        {categoriesLabel}
                    </p>
                </div>
            </Link>
        </div>
    );
};
