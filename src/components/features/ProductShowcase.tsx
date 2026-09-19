'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Star, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCart } from '@/context/CartContext';
import type { VendorProduct } from '@/types';

// --- Types ---
interface Product {
    id: number;
    name: string;
    image: string;
    oldPrice: string;
    newPrice: string;
    rating: number;
    reviews: string;
}

interface ColumnData {
    title: string;
    products: Product[];
}

// --- Data ---
const ALL_PRODUCTS: Product[] = [
    { id: 1, name: 'Green Broccoli', image: '/images/product/brokali.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 2, name: 'Fresh Carrots', image: '/images/product/product-img1.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 3, name: 'Organic Almonds', image: '/images/placeholders/no-product.svg', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 4, name: 'Sweet Oranges', image: '/images/product/product-img5.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 5, name: 'Fresh Lettuce', image: '/images/product/product-img6.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 6, name: 'Red Apple', image: '/images/placeholders/no-product.svg', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 7, name: 'Snack Pack', image: '/images/recom-product/product-img11.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 8, name: 'Granola', image: '/images/recom-product/product-img12.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 9, name: 'Mixed Nuts', image: '/images/recom-product/product-img14.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 10, name: 'Avocado', image: '/images/recom-product/product-img15.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 11, name: 'Strawberry', image: '/images/recom-product/product-img16.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 12, name: 'Blueberry', image: '/images/recom-product/product-img17.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 13, name: 'Silk Milk', image: '/images/organic/product-img20.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 14, name: 'SunButter', image: '/images/organic/product-img21.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 15, name: 'Hemp Hearts', image: '/images/organic/product-img22.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 16, name: 'Red Hill', image: '/images/organic/product-img23.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 17, name: 'Granola Mix', image: '/images/organic/product-img24.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
    { id: 18, name: 'Romaine', image: '/images/organic/product-img25.png', oldPrice: '$28.99', newPrice: '$1500.00', rating: 4.8, reviews: '17k' },
];

// Helper to shuffle or pick ranges
const getProducts = (start: number, count: number) => {
    const subset = [];
    const source = [...ALL_PRODUCTS];
    for (let i = 0; i < count; i++) {
        subset.push(source[(start + i) % source.length]);
    }
    return subset;
};

// 12 products per column to have 3 slides of 4 items each
const COLUMNS: ColumnData[] = [
    { title: 'Featured Products', products: getProducts(0, 12) },
    { title: 'Top Selling Products', products: getProducts(5, 12) },
    { title: 'On-sale Products', products: getProducts(10, 12) },
    { title: 'Top Rated Products', products: getProducts(15, 12) },
];

// --- Sub-Component for Individual Column ---
function ProductColumn({ title, products, globalIndex }: {
    title: string;
    products: Product[];
    globalIndex: number;
}) {
    // Local manual override state
    const [manualIndex, setManualIndex] = useState<number | null>(null);
    const [isHovered, setIsHovered] = useState(false);

    const { addToCart } = useCart();
    const [addedId, setAddedId] = useState<number | null>(null);

    const handleAddToCart = (e: React.MouseEvent, product: Product) => {
        e.preventDefault();
        e.stopPropagation();
        addToCart(product as unknown as VendorProduct);
        setAddedId(product.id);
        setTimeout(() => setAddedId(null), 2000);
    };

    // Timer ref to clear manual override
    const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Group products into chunks of 4 (Slides)
    const ITEMS_PER_SLIDE = 4;
    const slides = [];
    for (let i = 0; i < products.length; i += ITEMS_PER_SLIDE) {
        slides.push(products.slice(i, i + ITEMS_PER_SLIDE));
    }
    const maxIndex = slides.length - 1;

    // Use manual index if active, otherwise use global synced index
    // Also pause updates if hovered (optional, or just rely on global pause? 
    // User requested "sync auto together", so sticking to global usually nice, 
    // but if hovered, we might want to pause. 
    // Let's settle on: Display manual if set, else display global.
    const currentIndex = manualIndex !== null ? manualIndex : globalIndex;

    const handleManualChange = (newIndex: number) => {
        // Clear conflicting timers
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

        // Normalize index
        let resolvedIndex = newIndex;
        if (resolvedIndex > maxIndex) resolvedIndex = 0;
        if (resolvedIndex < 0) resolvedIndex = maxIndex;

        setManualIndex(resolvedIndex);

        // Set timer to re-sync (snap back to global) after 8 seconds of no interaction
        resetTimerRef.current = setTimeout(() => {
            setManualIndex(null);
        }, 8000);
    };

    return (
        <div
            className="flex flex-col"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Header */}
            <div className="bg-[#e8fbe8] rounded-t-2xl px-6 py-4 flex items-center justify-between mb-4">
                <div className="relative">
                    <h3 className="text-[18px] font-bold text-text relative z-10">{title}</h3>
                    {/* Green underline effect */}
                    <div className="absolute -bottom-1 left-0 w-12 h-0.5 bg-primary"></div>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={() => handleManualChange(currentIndex - 1)}
                        className="w-8 h-8 rounded-full bg-white/50 hover:bg-white text-text-muted hover:text-primary flex items-center justify-center transition-all"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button
                        onClick={() => handleManualChange(currentIndex + 1)}
                        className="w-8 h-8 rounded-full bg-white/50 hover:bg-white text-text-muted hover:text-primary flex items-center justify-center transition-all"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {/* Carousel Container (Horizontal Scroll) */}
            <div className="overflow-hidden relative">
                <div
                    className="flex transition-transform duration-500 ease-in-out"
                    style={{ transform: `translateX(-${currentIndex * 100}%)` }}
                >
                    {slides.map((slide, slideIdx) => (
                        <div key={slideIdx} className="w-full flex-shrink-0 flex flex-col gap-4">
                            {slide.map((product) => (
                                <Link
                                    href={`/product/${product.id}`}
                                    key={product.id}
                                    className="h-[90px] flex items-center gap-4 p-2 rounded-xl hover:bg-gray-50 transition-colors group cursor-pointer border border-transparent hover:border-gray-100"
                                >
                                    {/* Image */}
                                    <div className="w-[70px] h-[70px] bg-[#f7f7f8] rounded-lg p-2 flex items-center justify-center shrink-0">
                                        <img
                                            src={product.image}
                                            alt={product.name}
                                            className="w-full h-full object-contain mix-blend-multiply group-hover:scale-110 transition-transform duration-300"
                                            loading="lazy"
                                        />
                                    </div>

                                    {/* Content */}
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1 mb-1">
                                            <span className="text-[12px] font-bold text-text">{product.rating}</span>
                                            <Star size={10} className="fill-[#ffb800] text-[#ffb800]" />
                                            <span className="text-[10px] text-text-muted">({product.reviews})</span>
                                        </div>

                                        <h4 className="text-[14px] font-bold text-text leading-tight mb-1 group-hover:text-primary transition-colors line-clamp-1">
                                            {product.name}
                                        </h4>

                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[15px] font-extrabold text-text">{product.newPrice}</span>
                                                <span className="text-[11px] text-text-muted line-through">{product.oldPrice}</span>
                                            </div>

                                            <button
                                                onClick={(e) => handleAddToCart(e, product)}
                                                className={cn(
                                                    "w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-sm active:scale-90",
                                                    addedId === product.id
                                                        ? "bg-primary text-white"
                                                        : "bg-primary/10 text-primary hover:bg-primary hover:text-white"
                                                )}
                                            >
                                                {addedId === product.id ? <Check size={14} /> : <Plus size={14} />}
                                            </button>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// --- Main Component ---
export function ProductShowcase() {
    // Global State for default sync
    const [globalIndex, setGlobalIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    // We have 12 items / 4 per slide = 3 slides total (Index 0 to 2)
    const maxIndex = 2;

    useEffect(() => {
        if (isPaused) return;

        const interval = setInterval(() => {
            setGlobalIndex((prev) => (prev + 1 > maxIndex ? 0 : prev + 1));
        }, 4000);

        return () => clearInterval(interval);
    }, [isPaused, maxIndex]);

    return (
        <section
            className="w-full pb-16 bg-white overflow-hidden"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
        >
            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {COLUMNS.map((col, idx) => (
                        <div
                            key={idx}
                            className={idx === 0 ? "block" : "hidden md:block"}
                        >
                            <ProductColumn
                                title={col.title}
                                products={col.products}
                                globalIndex={globalIndex}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
