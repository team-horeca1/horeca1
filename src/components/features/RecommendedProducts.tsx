'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, Star, Store, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCart } from '@/context/CartContext';
import type { VendorProduct } from '@/types';

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

const CATEGORIES = [
    'All', 'Grocery', 'Fruits', 'Juices', 'Vegetables', 'Snacks', 'Organic Foods'
];

const PRODUCTS: Product[] = [
    {
        id: 1,
        name: 'C-500 Antioxidant Protect Dietary Supplement',
        image: '/images/placeholders/no-product.svg',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
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
        image: '/images/recom-product/product-img12.png',
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
        name: 'Nature Valley Whole Grain Oats and Honey Protein',
        image: '/images/recom-product/product-img16.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        badge: { text: 'Sale 50%', type: 'sale' }
    },
    {
        id: 7,
        name: 'C-500 Antioxidant Protect Dietary Supplement',
        image: '/images/recom-product/product-img7.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
    },
    {
        id: 8,
        name: 'C-500 Antioxidant Protect Dietary Supplement',
        image: '/images/recom-product/product-img8.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        badge: { text: 'Sale 50%', type: 'sale' }
    },
    {
        id: 9,
        name: 'C-500 Antioxidant Protect Dietary Supplement',
        image: '/images/recom-product/product-img9.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        badge: { text: 'New', type: 'new' }
    },
    {
        id: 10,
        name: 'Good & Gather Farmed Atlantic Salmon',
        image: '/images/recom-product/product-img17.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        badge: { text: 'Sale 50%', type: 'sale' }
    },
    {
        id: 11,
        name: 'Market Pantry 41/50 Raw Tail-Off Large Raw Shrimp',
        image: '/images/recom-product/product-img18.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        badge: { text: 'Sale 50%', type: 'sale' }
    },
    {
        id: 12,
        name: 'Tropicana 100% Juice, Orange, No Pulp',
        image: '/images/recom-product/product-img11.png', // Reusing one for placeholder if needed
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        badge: { text: 'New', type: 'new' }
    }
];

export function RecommendedProducts() {
    const [activeCategory, setActiveCategory] = useState('All');
    const { addToCart } = useCart();
    const [addedId, setAddedId] = useState<number | null>(null);

    const handleAddToCart = (e: React.MouseEvent, product: Product) => {
        e.preventDefault();
        addToCart(product as unknown as VendorProduct);
        setAddedId(product.id);
        setTimeout(() => setAddedId(null), 2000);
    };

    return (
        <section className="w-full pb-16 bg-white overflow-hidden">
            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                {/* Header with Categories */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
                    <h2 className="text-[24px] md:text-[32px] font-bold text-text">Recommended for you</h2>

                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 lg:pb-0">
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={cn(
                                    "whitespace-nowrap px-4 py-2 rounded-full text-[14px] font-medium transition-all",
                                    activeCategory === cat
                                        ? "bg-primary text-white"
                                        : "text-text-muted hover:text-primary"
                                )}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Products Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 md:gap-5">
                    {PRODUCTS.map((product) => (
                        <Link
                            href={`/product/${product.id}`}
                            key={product.id}
                            className="group bg-white rounded-2xl border border-gray-100 p-4 transition-all duration-300 hover:shadow-xl hover:shadow-gray-200/50 flex flex-col h-full relative"
                        >
                            {/* Badge */}
                            {product.badge && (
                                <div className={cn(
                                    "absolute top-4 left-4 z-10 px-2 py-0.5 rounded text-[10px] font-bold text-white",
                                    product.badge.type === 'sale' && "bg-[#ef4444]",
                                    product.badge.type === 'best' && "bg-[#3b82f6]",
                                    product.badge.type === 'new' && "bg-[#f59e0b]"
                                )}>
                                    {product.badge.text}
                                </div>
                            )}

                            {/* Image */}
                            <div className="aspect-square mb-4 bg-gray-50/50 rounded-xl p-0.5 flex items-center justify-center overflow-hidden">
                                <img
                                    src={product.image}
                                    alt={product.name}
                                    className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110 scale-[1.2]"
                                />
                            </div>

                            {/* Title */}
                            <h3 className="text-[14px] font-bold text-text leading-tight mb-2 line-clamp-2 h-9">
                                {product.name}
                            </h3>

                            {/* Vendor */}
                            <div className="flex items-center gap-1.5 mb-3">
                                <Store size={12} className="text-primary" />
                                <span className="text-[11px] text-text-muted italic">{product.vendor}</span>
                            </div>

                            {/* Price */}
                            <div className="flex items-baseline gap-2 mb-2">
                                <span className="text-[15px] font-extrabold text-text">{product.newPrice}</span>
                                <span className="text-[11px] text-text-muted">/Qty</span>
                                <span className="text-[11px] text-text-muted line-through ml-auto">{product.oldPrice}</span>
                            </div>

                            {/* Rating */}
                            <div className="flex items-center gap-1 mb-4">
                                <span className="text-[11px] font-bold text-text">{product.rating}</span>
                                <Star size={10} className="fill-[#ffb800] text-[#ffb800]" />
                                <span className="text-[11px] text-text-muted">({product.reviews})</span>
                            </div>

                            {/* Add To Cart Button */}
                            <button
                                onClick={(e) => handleAddToCart(e, product)}
                                className={cn(
                                    "mt-auto w-full flex items-center justify-center gap-2 py-2.5 rounded-full text-[13px] font-bold transition-all border border-transparent shadow-sm",
                                    addedId === product.id
                                        ? "bg-primary text-white"
                                        : "bg-[#e8f9e9] text-primary hover:bg-primary hover:text-white"
                                )}
                            >
                                {addedId === product.id ? (
                                    <>Added <Check size={14} /></>
                                ) : (
                                    <>Add To Cart <ShoppingCart size={14} /></>
                                )}
                            </button>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}
