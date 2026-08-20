'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Store } from 'lucide-react';
import { BrandStoreCard } from '@/components/features/brand/BrandStoreCard';

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
    productCount: number;
}

interface Card {
    name: string;
    slug: string;
    logoUrl?: string;
    productImages: string[];
    categories: string[];
    bgColor: string;
}

export default function BrandsPage() {
    const router = useRouter();
    const [brands, setBrands] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/v1/brands?limit=100')
            .then(r => r.json())
            .then(d => {
                const apiBrands: ApiBrand[] = d.data?.brands ?? [];
                setBrands(apiBrands.map(b => ({
                    name: b.name,
                    slug: b.slug,
                    logoUrl: b.logo ?? undefined,
                    productImages: b.showcaseImages.length > 0 ? [b.showcaseImages[0]] : [],
                    categories: b.categories,
                    bgColor: b.bgColor ?? '#f0faf4',
                })));
            })
            .catch(() => setBrands([]))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="min-h-screen bg-[#F8F9FA]">
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.back()}
                            className="p-2.5 hover:bg-gray-100/80 rounded-2xl transition-all duration-300 group active:scale-95 shrink-0"
                        >
                            <ChevronLeft size={22} className="text-gray-700 group-hover:-translate-x-0.5 transition-transform" />
                        </button>
                        <h1 className="text-[22px] font-extrabold text-[#1A1C1E] tracking-tight">
                            All Brands
                        </h1>
                    </div>
                </div>
            </div>

            {/* Brand Grid */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
                {loading ? (
                    <div className="flex items-center justify-center py-32">
                        <div className="w-10 h-10 border-[3px] border-[#53B175]/10 border-t-[#53B175] rounded-full animate-spin" />
                    </div>
                ) : brands.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 text-center">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <Store size={32} className="text-gray-300" />
                        </div>
                        <h3 className="text-[18px] font-black text-[#181725] mb-1">No brands yet</h3>
                        <p className="text-gray-400 text-[14px] max-w-md">
                            Brand stores will appear here once approved brands list their canonical product catalogs. Check back soon.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 min-[500px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {brands.map((brand) => (
                            <BrandStoreCard key={brand.slug} {...brand} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
