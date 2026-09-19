'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCart } from '@/context/CartContext';
import type { VendorProduct } from '@/types';

interface FlashSaleProduct {
    id: number;
    name: string;
    weight: string;
    price: number;
    originalPrice: number;
    discount: number;
    image: string;
}

const FLASH_SALE_PRODUCTS: FlashSaleProduct[] = [
    {
        id: 1,
        name: 'Chicken breast frozen',
        weight: '450-500gr /pack',
        price: 30.00,
        originalPrice: 36.00,
        discount: 30,
        image: '/images/product/product-img1.png'
    },
    {
        id: 2,
        name: 'Daily Fresh Veggies',
        weight: '450-500gr /pack',
        price: 30.00,
        originalPrice: 36.00,
        discount: 35,
        image: '/images/placeholders/no-product.svg'
    },
    {
        id: 3,
        name: 'Beef meat slice for soup',
        weight: '450-500gr /pack',
        price: 30.00,
        originalPrice: 36.00,
        discount: 20,
        image: '/images/recom-product/product-img7.png'
    },
    {
        id: 4,
        name: 'Fresh Salmon Fillet',
        weight: '250-300gr /pack',
        price: 45.00,
        originalPrice: 55.00,
        discount: 15,
        image: '/images/placeholders/no-product.svg'
    },
    {
        id: 5,
        name: 'Organic Broccoli',
        weight: '500gr /pack',
        price: 15.00,
        originalPrice: 20.00,
        discount: 25,
        image: '/images/product/brokali.png'
    },
    {
        id: 6,
        name: 'Red Bell Pepper',
        weight: '1kg /pack',
        price: 25.00,
        originalPrice: 35.00,
        discount: 28,
        image: '/images/recom-product/product-img12.png'
    }
];

export function FlashSaleBanner() {
    const { addToCart } = useCart();
    const [addedId, setAddedId] = React.useState<number | null>(null);

    const handleAddToCart = (e: React.MouseEvent, product: FlashSaleProduct) => {
        e.preventDefault();
        e.stopPropagation();
        addToCart(product as unknown as VendorProduct);
        setAddedId(product.id);
        setTimeout(() => setAddedId(null), 2000);
    };

    return (
        <section className="w-full py-5 md:py-12 bg-[#d4e6cd] mb-6 md:mb-10">
            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                {/* Header */}
                <div className="flex items-center justify-between mb-4 md:mb-8">
                    <div className="flex items-center gap-2">
                        <h2 className="text-[0.9rem] md:text-[1.5rem] font-[800] md:font-bold text-[#1e293b]">
                            Flash sale 🔥
                        </h2>
                    </div>
                    <Link href="/flash-sale" className="flex items-center gap-1 text-[#5cb85c] font-black md:font-bold text-sm md:text-base">
                        See all <ChevronRight size={18} />
                    </Link>
                </div>

                {/* Products Grid/Scroll */}
                <div className="flex overflow-x-auto md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6 no-scrollbar pb-4 snap-x snap-mandatory">
                    {FLASH_SALE_PRODUCTS.map((product) => (
                        <Link
                            href={`/product/${product.id}`}
                            key={product.id}
                            className="relative min-w-[130px] md:min-w-0 bg-white rounded-[20px] p-2.5 md:p-4 flex flex-col snap-start shadow-sm active:bg-gray-50 transition-colors"
                        >
                            {/* Image & Discount Badge */}
                            <div className="relative w-full aspect-square rounded-[15px] overflow-hidden bg-[#f8f8f8] mb-2 p-3 flex items-center justify-center">
                                <img
                                    src={product.image}
                                    alt={product.name}
                                    className="w-full h-full object-contain transition-transform duration-300 hover:scale-110"
                                />
                                <div className="absolute top-0 right-0 bg-[#ff4d4d] text-white px-1.5 py-0.5 text-[9px] md:text-[12px] font-bold rounded-bl-[12px] z-20">
                                    {product.discount}%
                                </div>
                            </div>

                            {/* Info */}
                            <div className="flex flex-col flex-1">
                                <h3 className="text-[12px] md:text-[16px] font-[900] md:font-bold text-[#1e293b] leading-tight mb-0.5 line-clamp-2 h-8 md:h-9">
                                    {product.name}
                                </h3>
                                <p className="text-[9px] md:text-[12px] text-gray-400 mb-2 font-medium">
                                    {product.weight}
                                </p>

                                <div className="mt-auto flex items-center justify-between">
                                    <div className="flex flex-col xl:flex-row xl:items-center xl:gap-2">
                                        <span className="text-[13px] md:text-[18px] font-[900] md:font-bold text-[#1e293b]">
                                            ${product.price.toFixed(2)}
                                        </span>
                                        <span className="text-[9px] md:text-[12px] text-red-500/80 line-through">
                                            ${product.originalPrice.toFixed(2)}
                                        </span>
                                    </div>
                                    <button
                                        onClick={(e) => handleAddToCart(e, product)}
                                        className={cn(
                                            "w-6 h-6 md:w-9 md:h-9 rounded-full flex items-center justify-center transition-all border-none shadow-sm active:scale-90",
                                            addedId === product.id
                                                ? "bg-primary text-white"
                                                : "bg-[#d4e6cd] text-[#5cb85c] hover:bg-[#5cb85c] hover:text-white"
                                        )}
                                    >
                                        {addedId === product.id ? (
                                            <Check size={14} strokeWidth={3} />
                                        ) : (
                                            <Plus size={14} strokeWidth={3} />
                                        )}
                                    </button>
                                </div>
                            </div>
                        </Link>
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
