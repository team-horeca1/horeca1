'use client';

import React from 'react';
import Link from 'next/link';

interface Product {
    id: string;
    name: string;
    image: string;
    soldBy: number;
    priceRange: string;
}

interface Category {
    title: string;
    subtitle: string;
    icon: string;
    products: Product[];
}

const CATEGORIES: Category[] = [
    {
        title: 'Fruits & Vegetables',
        subtitle: 'freshness guaranteed',
        icon: '/images/fruits-vegetables/vegetable-logo.png',
        products: [
            {
                id: '1001',
                name: 'Onion 1 kg',
                image: '/images/fruits-vegetables/onion.png',
                soldBy: 6,
                priceRange: 'Rs 14.99 - Rs 22.99'
            },
            {
                id: '1002',
                name: 'Coriander 200 gms Bunch',
                image: '/images/fruits-vegetables/corriander.png',
                soldBy: 6,
                priceRange: 'Rs 19 - Rs 30'
            }
        ]
    },
    {
        title: 'Dairy',
        subtitle: 'handpicked brands',
        icon: '/images/dairy/dairy-logo.png',
        products: [
            {
                id: '1003',
                name: 'Amul Butter 100 gms',
                image: '/images/dairy/amul-butter.png',
                soldBy: 8,
                priceRange: 'Rs 51.99 - Rs 59.99'
            },
            {
                id: '1004',
                name: 'Amul Cheese Block 400 gms',
                image: '/images/dairy/amul-cheese.png',
                soldBy: 8,
                priceRange: 'Rs 119 - Rs 135'
            }
        ]
    }
];

const ProductCard = ({ product }: { product: Product }) => (
    <div className="bg-white border border-gray-200 rounded-[16px] p-3 md:p-5 flex flex-col relative group transition-all duration-300 hover:shadow-md">
        {/* Share Button — custom SVG */}
        <button className="absolute right-3 top-3 z-10 text-gray-400 hover:opacity-70 transition-opacity">
            <img src="/images/share.svg" alt="share" className="w-[14px] h-[15px]" />
        </button>

        {/* Product Image */}
        <Link href={`/product/${product.id}`} className="w-full aspect-square md:aspect-auto md:h-[220px] flex items-center justify-center p-2 mb-2 overflow-hidden">
            <img
                src={product.image}
                alt={product.name}
                className="max-w-full max-h-full object-contain scale-[1.15]"
            />
        </Link>

        {/* Product Info */}
        <Link href={`/product/${product.id}`}>
            <h4 className="text-[14px] md:text-[15px] font-semibold text-[#1e293b] mb-2 leading-[100%] tracking-[0%] line-clamp-2 min-h-[28px] hover:text-[#53B175] transition-colors">
                {product.name}
            </h4>
        </Link>

        <div className="flex items-center gap-1.5 mb-2">
            <img src="/images/shop.svg" alt="shop" className="w-[11px] h-[13px]" />
            <span className="text-[10px] md:text-[12px] text-gray-400">
                Sold by: {product.soldBy} stores
            </span>
        </div>

        <p className="text-[12px] md:text-[14px] font-extrabold text-[#1e293b] mb-3 whitespace-nowrap">
            {product.priceRange} /- <span className="text-gray-400 font-bold text-[10px] md:text-[12px]">QTY</span>
        </p>

        <button className="w-full py-2 mt-auto bg-[#EAF6EF] rounded-full flex items-center justify-center gap-1.5 text-[#53B175] text-[11px] md:text-[13px] font-bold transition-all active:scale-95">
            Add To Cart
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
        </button>
    </div>
);

export function ProductCategories() {
    return (
        <section className="w-full py-6 md:py-10 bg-white">
            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                {CATEGORIES.map((category, idx) => (
                    <div key={idx} className={idx !== 0 ? 'mt-8 md:mt-14' : ''}>
                        {/* Category Header */}
                        <div className="flex items-center justify-between mb-4 md:mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-[44px] h-[44px] md:w-[52px] md:h-[52px] rounded-[12px] overflow-hidden">
                                    <img src={category.icon} alt={category.title} className="w-full h-full object-cover" />
                                </div>
                                <div>
                                    <h2 className="text-[20px] md:text-[22px] font-semibold text-[#1e293b]" style={{ lineHeight: '100%', letterSpacing: '0%' }}>
                                        {category.title}
                                    </h2>
                                    <p className="text-[12px] md:text-[14px] text-gray-400 font-medium mt-1">
                                        {category.subtitle}
                                    </p>
                                </div>
                            </div>
                            <Link
                                href={`/category/${category.title.toLowerCase().replace(/ & /g, '-').replace(/\s+/g, '-')}`}
                                className="text-[13px] md:text-[15px] font-semibold text-[#53B175] hover:opacity-80 transition-opacity"
                            >
                                See all
                            </Link>
                        </div>

                        {/* Product Cards — 2-column grid with equal heights */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 items-stretch">
                            {category.products.map((product, pIdx) => (
                                <ProductCard key={pIdx} product={product} />
                            ))}
                            {/* Duplicate cards for desktop to fill the 4-column grid */}
                            {category.products.map((product, pIdx) => (
                                <div key={`dup-${pIdx}`} className="hidden md:block">
                                    <ProductCard product={product} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
