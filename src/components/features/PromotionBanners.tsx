'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const BANNERS = [
    {
        title: 'Everyday Fresh Meat',
        image: '/images/category/fish & meat.png',
        bgAsset: '/images/banner/meat-banner-bg.png',
        bgColor: '#f3f6e5',
        textColor: '#1a2b4b'
    },
    {
        title: 'Daily Fresh Vegetables',
        image: '/images/placeholders/no-category.svg',
        bgAsset: '/images/banner/vegitable-banner-bg.png',
        bgColor: '#dbf3dd',
        textColor: '#1a2b4b'
    },
    {
        title: 'Everyday Fresh Milk',
        image: '/images/category/milk.png',
        bgAsset: '/images/banner/milk-banner-bg.png',
        bgColor: '#f9eae3',
        textColor: '#1a2b4b'
    },
    {
        title: 'Everyday Fresh Fruits',
        image: '/images/category/fruits.png',
        bgAsset: '/images/banner/fruits-banner-bg.png',
        bgColor: '#ecf3df',
        textColor: '#1a2b4b'
    }
];

export function PromotionBanners() {
    return (
        <section className="w-full md:mt-6 pb-10 md:pb-16 bg-white overflow-hidden">
            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">

                {/* Mobile Header */}
                <div className="block md:hidden mb-5">
                    <h2 className="text-[0.9rem] font-[family-name:var(--font-inter)] font-[800] text-[#1e293b]">Everyday items</h2>
                </div>

                {/* Scrollable Container on Mobile, Grid on Desktop */}
                <div className="flex overflow-x-auto md:grid md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 no-scrollbar snap-x snap-mandatory ">
                    {BANNERS.map((banner, idx) => (
                        <div
                            key={idx}
                            className="relative min-w-[147px] w-[147px] h-[117.52px] md:min-w-0 md:w-full md:h-[180px] lg:h-[240px] flex-shrink-0 rounded-[18px] p-3 md:p-6 lg:p-8 overflow-hidden snap-start transition-transform duration-300 md:hover:shadow-lg flex flex-col justify-between"
                            style={{ backgroundColor: banner.bgColor }}
                        >
                            {/* Main Banner Image (Top-right asset) */}
                            <div
                                className="absolute right-0 top-0 w-[70%] h-full bg-no-repeat bg-right-top bg-contain pointer-events-none md:opacity-100"
                                style={{ backgroundImage: `url(${banner.bgAsset})` }}
                            />

                            {/* Content */}
                            <div className="relative z-20 flex flex-col items-start h-full">
                                <h3 className="text-[11px] md:text-[20px] lg:text-[26px] font-[800] text-[#1e293b] leading-[1.2] max-w-[85px] md:max-w-[180px] lg:max-w-[220px]" style={{ color: banner.textColor }}>
                                    <span className="md:hidden">
                                        {banner.title.split(' ')[0]}<br />
                                        {banner.title.split(' ').slice(1).join(' ')}
                                    </span>
                                    <span className="hidden md:inline">
                                        {banner.title}
                                    </span>
                                </h3>

                                <Link
                                    href="/shop"
                                    className="group flex items-center gap-1 md:gap-2 bg-[#5cb85c] hover:bg-[#4cae4c] md:bg-primary md:hover:bg-primary-dark text-white px-2.5 py-1.5 md:px-5 md:py-2.5 rounded-full md:rounded-lg text-[8.5px] md:text-sm font-bold transition-all mt-auto whitespace-nowrap w-fit md:shadow-md md:shadow-primary/20 md:hover:shadow-primary/30"
                                >
                                    Shop Now
                                    <ArrowRight className="w-2.5 h-2.5 md:w-4 md:h-4 transition-transform md:group-hover:translate-x-1" />
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </section>
    );
}
