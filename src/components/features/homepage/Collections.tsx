'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { dal } from '@/lib/dal';
import { ChevronRight } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';

interface Collection {
    id: string;
    name: string;
    slug: string;
    description: string;
    image: string;
    category: string;
}

const COLLECTION_STYLE: Record<string, { image: string; category: string }> = {
    'weekend-specials': {
        image: '/images/collections/weekend.png',
        category: 'WEEKEND DEALS',
    },
    'kitchen-essentials': {
        image: '/images/collections/kitchen.png',
        category: 'KITCHEN & DINING',
    },
    'new-arrivals': {
        image: '/images/collections/new-arrivals.png',
        category: 'JUST ARRIVED',
    },
};

const FALLBACK_STYLE = {
    image: '/images/collections/kitchen.png',
    category: 'COLLECTION',
};

export function Collections() {
    const [collections, setCollections] = useState<Collection[]>([]);

    useEffect(() => {
        dal.collections.list().then((data) => {
            const mapped = data.map((c) => {
                const style = COLLECTION_STYLE[c.slug] || FALLBACK_STYLE;
                return {
                    id: c.id,
                    name: c.name,
                    slug: c.slug,
                    description: c.description || '',
                    image: c.imageUrl || style.image,
                    category: style.category,
                };
            });
            setCollections(mapped);
        }).catch(() => {});
    }, []);

    if (collections.length === 0) return null;

    return (
        <section className="w-full py-6 md:py-8 bg-background">
            <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
                <SectionHeader
                    title="Curated Collections"
                    subtitle="Wholesale bundles for commercial kitchens"
                    actionLabel="View all →"
                    actionHref="/collections"
                    className="mb-4 md:mb-5"
                />

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                    {collections.map((col) => (
                        <Link
                            key={col.id}
                            href={`/collections/${col.slug}`}
                            className="group block"
                        >
                            <CardInner col={col} />
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}

function CardInner({ col }: { col: Collection }) {
    return (
        <div className="relative rounded-2xl overflow-hidden aspect-[5/6] md:aspect-[16/9] shadow-cdl-1 group-hover:shadow-cdl-3 transition-shadow duration-300">
            {/* Image */}
            <img
                src={col.image}
                alt={col.name}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
            />

            {/* Warm dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#2d0912]/95 via-[#2d0912]/35 to-transparent" />

            {/* Category pill — frosted glass */}
            <div className="absolute top-2.5 left-2.5 md:top-4 md:left-4 z-10">
                <span className="inline-block px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-[8px] md:text-[10px] font-bold tracking-[0.14em] text-white uppercase border border-white/20">
                    {col.category}
                </span>
            </div>

            {/* Arrow button — CDL primary Burgundy */}
            <div className="absolute top-2.5 right-2.5 md:top-4 md:right-4 size-7 md:size-9 rounded-full bg-primary flex items-center justify-center z-10 group-hover:bg-primary-dark transition-colors shadow-cdl-2">
                <ChevronRight size={14} className="text-white md:!w-[18px] md:!h-[18px]" strokeWidth={2.5} />
            </div>

            {/* Title — bottom, clean white */}
            <div className="absolute inset-x-0 bottom-0 p-3 md:p-5 z-10">
                <h3 className="text-[14px] md:text-[20px] font-bold text-white leading-tight tracking-tight drop-shadow-sm">
                    {col.name}
                </h3>
                <p className="text-[10px] md:text-[12px] text-white/80 font-medium mt-0.5 md:mt-1 line-clamp-1">
                    {col.description}
                </p>
            </div>
        </div>
    );
}
