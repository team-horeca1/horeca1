'use client';

import React from 'react';
import Link from 'next/link';
import { ShoppingCart, Star, Store } from 'lucide-react';
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
    sold: number;
    total: number;
}

const PRODUCTS: Product[] = [
    {
        id: 1,
        name: 'Taylor Farms Broccoli Florets Vegetables',
        image: '/images/product/brokali.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        sold: 18,
        total: 35
    },
    {
        id: 2,
        name: 'Fresh Red Beetroot Organic',
        image: '/images/product/product-img1.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        sold: 18,
        total: 35
    },
    {
        id: 3,
        name: 'Mixed Fresh Vegetables Harvest',
        image: '/images/product/product-img3.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        sold: 18,
        total: 35
    },
    {
        id: 4,
        name: 'Taylor Farms Broccoli Florets Vegetables',
        image: '/images/product/product-img5.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        sold: 18,
        total: 35
    },
    {
        id: 5,
        name: 'Sun-Maid Natural California Raisins',
        image: '/images/product/product-img5.png', // Reusing some images as placeholders if needed
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        sold: 18,
        total: 35
    },
    {
        id: 6,
        name: 'Doritos Nacho Cheese Tortilla Chips',
        image: '/images/product/product-img6.png',
        oldPrice: '$28.99',
        newPrice: '$14.99',
        rating: 4.8,
        reviews: '17k',
        vendor: 'By Lucky Supermarket',
        sold: 18,
        total: 35
    }
];

export function FeaturedProducts() {
    return (
        <section className="w-full pb-16 bg-white overflow-hidden">
            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                {/* Section Header - Styled like previous sections */}
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-[20px] md:text-[28px] font-bold text-text">Featured Products</h2>
                    <Link href="/shop" className="text-[14px] font-bold text-primary hover:underline">
                        View All
                    </Link>
                </div>

                {/* Products Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 md:gap-6">
                    {PRODUCTS.map((product) => (
                        <Link
                            href={`/product/${product.id}`}
                            key={product.id}
                            className="group bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 flex flex-col h-full"
                        >
                            {/* Product Image & Add Button */}
                            <div className="relative aspect-square mb-4 bg-gray-50 rounded-xl overflow-hidden p-0.5 flex items-center justify-center">
                                <img
                                    src={product.image}
                                    alt={product.name}
                                    className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110 scale-[1.2]"
                                />
                                <button className="absolute top-2 right-2 flex items-center gap-1.5 bg-[#e8f9e9] text-primary px-3 py-1.5 rounded-full text-[12px] font-bold hover:bg-primary hover:text-white transition-all shadow-sm">
                                    Add <ShoppingCart size={14} />
                                </button>
                            </div>

                            {/* Price */}
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[12px] text-text-muted line-through">{product.oldPrice}</span>
                                <span className="text-[16px] font-extrabold text-text">{product.newPrice}</span>
                                <span className="text-[12px] text-text-muted">/Qty</span>
                            </div>

                            {/* Rating */}
                            <div className="flex items-center gap-1 mb-2">
                                <Star size={14} className="fill-[#ffb800] text-[#ffb800]" />
                                <span className="text-[12px] font-bold text-text">{product.rating}</span>
                                <span className="text-[12px] text-text-muted">({product.reviews})</span>
                            </div>

                            {/* Title */}
                            <h3 className="text-[14px] font-bold text-text leading-tight mb-3 line-clamp-2 h-9 group-hover:text-primary transition-colors">
                                {product.name}
                            </h3>

                            {/* Vendor */}
                            <div className="flex items-center gap-2 mb-4">
                                <div className="p-1 bg-primary-light rounded">
                                    <Store size={12} className="text-primary" />
                                </div>
                                <span className="text-[11px] text-text-muted font-medium italic">{product.vendor}</span>
                            </div>

                            {/* Availability Progress */}
                            <div className="mt-auto">
                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                                    <div
                                        className="h-full bg-primary transition-all duration-300"
                                        style={{ width: `${(product.sold / product.total) * 100}%` }}
                                    />
                                </div>
                                <div className="flex justify-between items-center text-[11px] font-bold text-text">
                                    <span>Sold: {product.sold}/{product.total}</span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}
