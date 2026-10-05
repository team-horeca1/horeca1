'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Star, Store, ShoppingCart } from 'lucide-react';
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
}

const ORGANIC_PRODUCTS: Product[] = [
    {
        id: 1,
        name: 'Taylor Farms Broccoli Florets Vegetables',
        image: '/images/organic/product-img20.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket'
    },
    {
        id: 2,
        name: 'Taylor Farms Broccoli Florets Vegetables',
        image: '/images/organic/product-img21.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket'
    },
    {
        id: 3,
        name: 'Taylor Farms Broccoli Florets Vegetables',
        image: '/images/organic/product-img22.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket'
    },
    {
        id: 4,
        name: 'Taylor Farms Broccoli Florets Vegetables',
        image: '/images/organic/product-img23.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket'
    },
    {
        id: 5,
        name: 'Taylor Farms Broccoli Florets Vegetables',
        image: '/images/organic/product-img24.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket'
    },
    {
        id: 6,
        name: 'Taylor Farms Broccoli Florets Vegetables',
        image: '/images/organic/product-img25.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket'
    },
    {
        id: 7,
        name: 'Taylor Farms Broccoli Florets Vegetables',
        image: '/images/organic/product-img20.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket'
    },
    {
        id: 8,
        name: 'Taylor Farms Broccoli Florets Vegetables',
        image: '/images/organic/product-img21.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket'
    }
];

export function OrganicFood() {
    const [isPaused, setIsPaused] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isPaused) return;

        const interval = setInterval(() => {
            if (scrollRef.current) {
                const maxScroll = scrollRef.current.scrollWidth - scrollRef.current.clientWidth;
                if (scrollRef.current.scrollLeft >= maxScroll - 10) {
                    scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
                } else {
                    scrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
                }
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [isPaused]);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const scrollAmount = 300;
            scrollRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    return (
        <section className="w-full pb-16 bg-white overflow-hidden">
            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-[24px] md:text-[32px] font-bold text-text">Organic Food</h2>
                    <div className="flex items-center gap-4">
                        <Link href="/categories" className="hidden md:block text-[14px] font-bold text-text-muted hover:text-primary transition-colors">
                            All Categories
                        </Link>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => scroll('left')}
                                className="w-10 h-10 rounded-full border border-gray-100 flex items-center justify-center text-text-muted hover:bg-primary hover:text-white transition-all shadow-sm"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <button
                                onClick={() => scroll('right')}
                                className="w-10 h-10 rounded-full border border-gray-100 flex items-center justify-center text-text-muted hover:bg-primary hover:text-white transition-all shadow-sm"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Carousel */}
                <div
                    className="relative"
                    onMouseEnter={() => setIsPaused(true)}
                    onMouseLeave={() => setIsPaused(false)}
                >
                    <div
                        ref={scrollRef}
                        className="flex gap-4 md:gap-5 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth pb-4"
                    >
                        {ORGANIC_PRODUCTS.map((product) => (
                            <Link
                                href={`/product/${product.id}`}
                                key={product.id}
                                className="flex-none w-[calc(50%-8px)] md:w-[calc(33.333%-14px)] lg:w-[calc(20%-16px)] xl:w-[calc(16.666%-17px)] bg-white rounded-2xl border border-[#CDC4BA] p-3 md:p-4 transition-all duration-300 hover:shadow-xl hover:shadow-gray-200/50 hover:border-primary flex flex-col group snap-start"
                            >
                                {/* Product Image */}
                                <div className="aspect-square bg-white rounded-xl mb-4 flex items-center justify-center overflow-hidden">
                                    <img
                                        src={product.image}
                                        alt={product.name}
                                        className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
                                    />
                                </div>

                                {/* Rating */}
                                <div className="flex items-center gap-1 mb-2">
                                    <span className="text-[11px] font-bold text-text">{product.rating}</span>
                                    <Star size={10} className="fill-[#ffb800] text-[#ffb800]" />
                                    <span className="text-[10px] text-text-muted">({product.reviews})</span>
                                </div>

                                {/* Title */}
                                <h3 className="text-[14px] font-bold text-text leading-tight mb-2 line-clamp-2 h-9 group-hover:text-primary transition-colors">
                                    {product.name}
                                </h3>

                                {/* Vendor */}
                                <div className="flex items-center gap-1.5 mb-4">
                                    <Store size={12} className="text-primary" />
                                    <span className="text-[11px] text-text-muted italic">{product.vendor}</span>
                                </div>

                                {/* Price & Add Button */}
                                <div className="mt-auto flex items-center justify-between gap-2">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] text-text-muted line-through mb-[-2px]">{product.oldPrice}</span>
                                        <div className="flex items-center gap-1">
                                            <span className="text-[14px] font-extrabold text-text">{product.newPrice}</span>
                                            <span className="text-[11px] text-text-muted">/Qty</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-[#e8f9e9] text-primary group-hover:bg-primary group-hover:text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-[12px] font-bold transition-all whitespace-nowrap">
                                        Add <ShoppingCart size={14} />
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
