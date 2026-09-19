'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ShoppingCart, Star, Store, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Product {
    id: number;
    name: string;
    image: string;
    oldPrice: string;
    newPrice: string;
    rating: number;
    reviews: string;
    vendor: string;
    badge?: {
        text: string;
        type: 'sale' | 'best' | 'new';
    };
}

const PRODUCTS: Product[] = [
    {
        id: 1,
        name: 'O Organics Milk, Whole, Vitamin D',
        image: '/images/recom-product/product-img12.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        badge: { text: 'Sale 50%', type: 'sale' }
    },
    {
        id: 2,
        name: "Marcel's Modern Pantry Almond Unsweetened",
        image: '/images/recom-product/product-img11.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        badge: { text: 'Sale 50%', type: 'sale' }
    },
    {
        id: 3,
        name: 'O Organics Milk, Whole, Vitamin D',
        image: '/images/placeholders/no-product.svg',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        badge: { text: 'Sale 50%', type: 'sale' }
    },
    {
        id: 4,
        name: 'Whole Grains and Seeds Organic Bread',
        image: '/images/recom-product/product-img14.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        badge: { text: 'Best Sale', type: 'best' }
    },
    {
        id: 5,
        name: 'Lucerne Yogurt, Lowfat, Strawberry',
        image: '/images/recom-product/product-img15.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
    },
    {
        id: 6,
        name: 'Good & Gather Farmed Atlantic Salmon',
        image: '/images/recom-product/product-img17.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
    }
];

export function HotDeals() {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isPaused, setIsPaused] = useState(false);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const container = scrollRef.current;
            const scrollAmount = 300;
            container.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    // Auto-scroll logic
    useEffect(() => {
        if (isPaused) return;

        const interval = setInterval(() => {
            if (scrollRef.current) {
                const container = scrollRef.current;
                const maxScroll = container.scrollWidth - container.clientWidth;

                if (container.scrollLeft >= maxScroll - 5) {
                    container.scrollTo({ left: 0, behavior: 'smooth' });
                } else {
                    container.scrollBy({ left: 300, behavior: 'smooth' });
                }
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [isPaused]);

    return (
        <section className="w-full pb-16 bg-white overflow-hidden">
            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-[24px] md:text-[32px] font-bold text-text">Hot Deals Todays</h2>
                    <div className="flex items-center gap-4">
                        <Link href="/shop" className="hidden sm:block text-[14px] font-bold text-text-muted hover:text-primary transition-colors">
                            View All Deals
                        </Link>
                        <div className="flex gap-2">
                            <button
                                onClick={() => scroll('left')}
                                className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-gray-100 flex items-center justify-center text-text-muted hover:text-primary transition-all bg-white shadow-sm"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <button
                                onClick={() => scroll('right')}
                                className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-gray-100 flex items-center justify-center text-text-muted hover:text-primary transition-all bg-white shadow-sm"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col xl:flex-row gap-6 items-stretch">
                    {/* Left Banner */}
                    <div className="w-full xl:w-[330px] shrink-0 rounded-[24px] overflow-hidden bg-[#2ca36a] relative flex flex-col items-center justify-center text-center p-6 md:p-8 group">
                        {/* Background Wave Pattern - Matching Banner 2 */}
                        <div
                            className="absolute inset-0 opacity-20 pointer-events-none mix-blend-soft-light"
                            style={{
                                backgroundImage: "url('/images/banner2/banner-pattern-bg.png')",
                                backgroundSize: 'cover',
                                backgroundPosition: 'center'
                            }}
                        />

                        <div className="relative z-10 w-full max-w-[170px] md:max-w-[210px] mb-4 md:mb-6 transition-transform duration-500 group-hover:scale-105">
                            <img
                                src="/images/hotdeals/hot-deals-img.png"
                                alt="Fresh Vegetables"
                                className="w-full h-auto drop-shadow-2xl"
                            />
                        </div>

                        <h3 className="relative z-10 text-[24px] md:text-[32px] font-extrabold text-white mb-4 md:mb-6 leading-tight">
                            Fresh Vegetables
                        </h3>

                        <Link
                            href="/shop"
                            className="relative z-10 bg-[#ff6b00] hover:bg-[#e66000] text-white px-6 md:px-10 py-2.5 md:py-3.5 rounded-full font-bold text-[13px] md:text-[15px] flex items-center gap-2 transition-all shadow-lg"
                        >
                            Shop Now
                            <ArrowRight size={18} />
                        </Link>
                    </div>

                    {/* Right Carousel */}
                    <div
                        className="flex-1 min-w-0"
                        onMouseEnter={() => setIsPaused(true)}
                        onMouseLeave={() => setIsPaused(false)}
                    >
                        <div
                            ref={scrollRef}
                            className="flex gap-4 md:gap-5 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth pb-1"
                        >
                            {PRODUCTS.map((product) => (
                                <Link
                                    href={`/product/${product.id}`}
                                    key={product.id}
                                    className="flex-none w-[calc(50%-8px)] md:w-[calc(33.333%-14px)] xl:w-[calc(25%-15px)] bg-white rounded-2xl border border-gray-100 p-3 md:p-4 transition-all duration-300 hover:shadow-xl hover:shadow-gray-200/50 flex flex-col h-full relative snap-start"
                                >
                                    {/* Badge */}
                                    {product.badge && (
                                        <div className={cn(
                                            "absolute top-3 left-3 z-10 px-2 py-0.5 rounded text-[9px] font-bold text-white",
                                            product.badge.type === 'sale' && "bg-[#ef4444]",
                                            product.badge.type === 'best' && "bg-[#3b82f6]",
                                            product.badge.type === 'new' && "bg-[#f59e0b]"
                                        )}>
                                            {product.badge.text}
                                        </div>
                                    )}

                                    {/* Image */}
                                    <div className="aspect-square mb-3 md:mb-4 bg-gray-50/50 rounded-xl p-3 md:p-4 flex items-center justify-center overflow-hidden">
                                        <img
                                            src={product.image}
                                            alt={product.name}
                                            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
                                        />
                                    </div>

                                    {/* Title */}
                                    <h3 className="text-[13px] md:text-[14px] font-bold text-text leading-tight mb-2 line-clamp-2 h-9">
                                        {product.name}
                                    </h3>

                                    {/* Vendor */}
                                    <div className="flex items-center gap-1.5 mb-2 md:mb-3">
                                        <Store size={12} className="text-primary" />
                                        <span className="text-[10px] md:text-[11px] text-text-muted italic">{product.vendor}</span>
                                    </div>

                                    {/* Price */}
                                    <div className="flex items-baseline gap-2 mb-2">
                                        <span className="text-[13px] md:text-[15px] font-extrabold text-text">{product.newPrice}</span>
                                        <span className="text-[10px] md:text-[11px] text-text-muted">/Qty</span>
                                        <span className="text-[10px] md:text-[11px] text-text-muted line-through ml-auto">{product.oldPrice}</span>
                                    </div>

                                    {/* Rating */}
                                    <div className="flex items-center gap-1 mb-3 md:mb-4">
                                        <span className="text-[10px] md:text-[11px] font-bold text-text">{product.rating}</span>
                                        <Star size={10} className="fill-[#ffb800] text-[#ffb800]" />
                                        <span className="text-[10px] md:text-[11px] text-text-muted">({product.reviews})</span>
                                    </div>

                                    {/* Add To Cart Button */}
                                    <button className="mt-auto w-full flex items-center justify-center gap-2 bg-[#e8f9e9] text-primary hover:bg-primary hover:text-white py-2 md:py-2.5 rounded-full text-[12px] md:text-[13px] font-bold transition-all border border-transparent shadow-sm">
                                        Add To Cart <ShoppingCart size={14} />
                                    </button>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
