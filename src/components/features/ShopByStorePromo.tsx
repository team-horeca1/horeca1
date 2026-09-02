'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BrandStoreCard } from '@/components/features/brand/BrandStoreCard';
import { SectionHeader } from '@/components/ui/SectionHeader';

interface ApiBrand {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    banner: string | null;
    tagline: string | null;
    categories: string[];
    bgColor: string | null;
    showcaseImages: string[];
    productCount?: number;
}

export function ShopByStorePromo() {
    const [brands, setBrands] = useState<ApiBrand[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/v1/brands?limit=8')
            .then((r) => r.json())
            .then((d) => {
                setBrands(d.data?.brands ?? []);
                setHasMore(Boolean(d.data?.hasMore));
            })
            .catch(() => setBrands([]))
            .finally(() => setLoading(false));
    }, []);

    if (!loading && brands.length === 0) return null;

    return (
        <section className="w-full py-6 md:py-10 bg-white border-y border-divider">
            <div className="max-w-[var(--container-max)] mx-auto">
                <div className="px-4 md:px-[var(--container-padding)] mb-3 md:mb-4">
                    <SectionHeader
                        title="Brand Store"
                        subtitle="Shop direct from the source"
                        actionLabel="View all →"
                        actionHref="/brands"
                    />
                </div>

                {loading ? (
                    <div className="flex gap-2.5 overflow-hidden px-4 md:px-[var(--container-padding)]">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div
                                key={i}
                                className="w-[150px] md:w-[168px] h-[225px] md:h-[248px] bg-[#E9E3DD] rounded-[16px] animate-pulse shrink-0"
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex gap-2.5 md:gap-3 overflow-x-auto pb-2 px-4 md:px-[var(--container-padding)] no-scrollbar snap-x snap-mandatory">
                        {brands.map((brand) => (
                            <div key={brand.slug} className="snap-start shrink-0 w-[150px] md:w-[168px] lg:w-[180px]">
                                <BrandStoreCard
                                    name={brand.name}
                                    slug={brand.slug}
                                    logoUrl={brand.logo ?? undefined}
                                    productImages={brand.showcaseImages.length > 0 ? [brand.showcaseImages[0]] : []}
                                    categories={brand.categories}
                                    bgColor={brand.bgColor ?? '#6B1D2E'}
                                    productCount={brand.productCount}
                                />
                            </div>
                        ))}
                        {hasMore && (
                            <Link
                                href="/brands"
                                className="snap-start shrink-0 w-[72px] md:w-[80px] h-[225px] md:h-[248px] rounded-[16px] bg-[#E8DFD2] flex items-center justify-center"
                            >
                                <span className="text-[12px] font-semibold text-[#5A4A3D] [writing-mode:vertical-rl] rotate-180">
                                    More brands
                                </span>
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
