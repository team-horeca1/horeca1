'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    Search,
    Plus,
    Minus,
    ShoppingCart,
    Star,
    ChevronRight,
    Heart,
    Share2,
    ShieldCheck,
    Truck
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

// --- Types ---
interface Product {
    id: number;
    name: string;
    category: string;
    image: string;
    gallery: string[];
    price: string;
    oldPrice: string;
    unit: string;
    description: string;
    rating: number;
    reviews: string;
}

// --- Mock Data ---
const PRODUCTS_DATA: Record<string, Product> = {
    '1': {
        id: 1,
        name: 'Fresh Carrot',
        category: 'vegetables',
        image: '/images/product/product-img1.png',
        gallery: [
            '/images/product/product-img1.png',
            '/images/product/product-img1.png',
            '/images/product/product-img1.png',
        ],
        price: '$ 15.99',
        oldPrice: '$ 16.99 kg',
        unit: '/Kg',
        description: 'The carrot is a root vegetable, most commonly observed as orange in color, though purple, black, red, white, and yellow cultivars exist, all of which are domesticated forms of the wild carrot, Daucus carota, native to Europe and Southwestern Asia.',
        rating: 4.8,
        reviews: '17k',
    },
    // Default fallback
    'default': {
        id: 0,
        name: 'Fresh Organic Product',
        category: 'organic',
        image: '/images/product/brokali.png',
        gallery: ['/images/product/brokali.png', '/images/product/brokali.png'],
        price: '$ 12.99',
        oldPrice: '$ 15.00',
        unit: '/Kg',
        description: 'Premium quality organic product sourced directly from local farms. Guarantees fresh taste and maximum nutrition for your healthy lifestyle.',
        rating: 4.9,
        reviews: '12k',
    }
};

const RELATED_PRODUCTS = [
    { id: 101, name: 'Fresh Red Chili', image: '/images/recom-product/product-img10.png', price: '$ 120.07', unit: '/kg' },
    { id: 102, name: 'Fresh Onion', image: '/images/recom-product/product-img11.png', price: '$ 88.65', unit: '/kg' },
    { id: 103, name: 'Fresh Garlic', image: '/images/recom-product/product-img12.png', price: '$ 45.20', unit: '/kg' },
];

export default function ProductDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const product = PRODUCTS_DATA[id] || PRODUCTS_DATA['default'];

    const [quantity, setQuantity] = useState(1);
    const [activeTab, setActiveTab] = useState<'description' | 'nutrition'>('description');
    const [currentImageIdx, setCurrentImageIdx] = useState(0);

    const handleBack = () => {
        router.back();
    };

    return (
        <div className="bg-white min-h-screen pb-32">
            {/* ==================== MOBILE DETAIL PAGE (DETTO) ==================== */}
            <div className="md:hidden">
                {/* Image Section with Header Overlay */}
                <div className="relative w-full aspect-[4/3.5] bg-gray-50 overflow-hidden">
                    {/* Header Icons Overlay */}
                    <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 pt-8">
                        <button
                            onClick={handleBack}
                            className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white"
                        >
                            <ArrowLeft size={24} strokeWidth={2.5} />
                        </button>
                        <button className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white">
                            <Search size={22} strokeWidth={2.5} />
                        </button>
                    </div>

                    {/* Main Image Slider */}
                    <div className="w-full h-full">
                        <img
                            src={product.image}
                            alt={product.name}
                            className="w-full h-full object-cover"
                        />
                    </div>

                    {/* Dot Indicators */}
                    <div className="absolute bottom-12 left-0 right-0 flex justify-center gap-1.5 z-20">
                        {product.gallery.map((_, idx) => (
                            <div
                                key={idx}
                                className={cn(
                                    "h-1.5 rounded-full transition-all duration-300",
                                    idx === currentImageIdx ? "w-6 bg-white" : "w-1.5 bg-white/50"
                                )}
                            />
                        ))}
                    </div>
                </div>

                {/* Content Card (Overlaps Image) */}
                <div className="relative -mt-10 z-30 bg-white rounded-t-[40px] px-6 pt-8 min-h-[500px]">
                    {/* Category Tag */}
                    <span className="inline-block px-3 py-1 rounded-[8px] bg-[#e9f7ef] text-[#2ca36a] text-[12px] font-[700] mb-4 lowercase">
                        {product.category}
                    </span>

                    {/* Title */}
                    <h1 className="text-[28px] font-[800] text-[#1e293b] leading-tight mb-3 font-[family-name:var(--font-inter)]">
                        {product.name}
                    </h1>

                    {/* Price Area */}
                    <div className="flex items-center gap-3 mb-8">
                        <div className="flex items-baseline gap-1">
                            <span className="text-[22px] font-[800] text-[#2ca36a] tracking-tight">{product.price}</span>
                            <span className="text-[14px] font-[600] text-[#64748b]">{product.unit}</span>
                        </div>
                        <span className="text-[14px] text-[#94a3b8] line-through font-medium">
                            {product.oldPrice}
                        </span>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-12 border-b border-gray-100 mb-6">
                        <button
                            onClick={() => setActiveTab('description')}
                            className={cn(
                                "pb-4 text-[16px] font-[700] transition-all relative",
                                activeTab === 'description' ? "text-[#2ca36a]" : "text-[#94a3b8]"
                            )}
                        >
                            Description
                            {activeTab === 'description' && (
                                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#2ca36a] rounded-t-full" />
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('nutrition')}
                            className={cn(
                                "pb-4 text-[16px] font-[700] transition-all relative",
                                activeTab === 'nutrition' ? "text-[#2ca36a]" : "text-[#94a3b8]"
                            )}
                        >
                            Nutrition facts
                            {activeTab === 'nutrition' && (
                                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#2ca36a] rounded-t-full" />
                            )}
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="mb-10 text-[14px] leading-[1.66] text-[#64748b] font-medium font-[family-name:var(--font-inter)]">
                        {activeTab === 'description' ? product.description : "Nutritional information details go here..."}
                    </div>

                    {/* Related Products Section */}
                    <div className="mb-12">
                        <h3 className="text-[18px] font-[800] text-[#1e293b] mb-5 font-[family-name:var(--font-inter)]">
                            Related Product
                        </h3>
                        <div className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-4">
                            {RELATED_PRODUCTS.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex-none w-[240px] bg-white rounded-[24px] border border-gray-100/60 p-3 shadow-sm flex items-center gap-4 snap-start active:bg-gray-50 transition-colors"
                                >
                                    <div className="w-[80px] h-[70px] bg-[#f7f8f7] rounded-[16px] overflow-hidden flex-shrink-0">
                                        <img src={item.image} alt={item.name} className="w-full h-full object-contain p-2" />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <h4 className="text-[14px] font-[800] text-[#1e293b] leading-tight mb-1 truncate">
                                            {item.name}
                                        </h4>
                                        <div className="flex items-baseline gap-0.5">
                                            <span className="text-[14px] font-[800] text-[#2ca36a] tracking-tight">{item.price}</span>
                                            <span className="text-[10px] font-[600] text-[#64748b]">{item.unit}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* Dots for related products (static for UI demo) */}
                        <div className="flex justify-start gap-1.5 px-4 mt-2">
                            <div className="w-5 h-1.5 bg-[#2ca36a] rounded-full" />
                            <div className="w-1.5 h-1.5 bg-gray-200 rounded-full" />
                            <div className="w-1.5 h-1.5 bg-gray-200 rounded-full" />
                            <div className="w-1.5 h-1.5 bg-gray-200 rounded-full" />
                            <div className="w-1.5 h-1.5 bg-gray-200 rounded-full" />
                        </div>
                    </div>
                </div>

                {/* Fixed Bottom Action Bar */}
                <div className="fixed bottom-0 left-0 right-0 z-[100] bg-white border-t border-gray-100 px-6 py-5 flex items-center justify-between gap-4 safe-area-bottom">
                    {/* Quantity Selector */}
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            className="w-[42px] h-[42px] rounded-lg border border-gray-100 flex items-center justify-center text-[#2ca36a]"
                        >
                            <Minus size={20} strokeWidth={2.5} />
                        </button>
                        <div className="w-[50px] h-[42px] rounded-lg bg-[#e9f7ef] flex items-center justify-center text-[18px] font-[700] text-[#1e293b]">
                            {quantity}
                        </div>
                        <button
                            onClick={() => setQuantity(quantity + 1)}
                            className="w-[42px] h-[42px] rounded-lg border border-gray-100 flex items-center justify-center text-[#2ca36a]"
                        >
                            <Plus size={20} strokeWidth={2.5} />
                        </button>
                    </div>

                    {/* Add to Cart Button */}
                    <button className="flex-1 h-[54px] bg-[#2ca36a] hover:bg-[#238c5a] text-white rounded-2xl flex items-center justify-center gap-2 font-[800] text-[16px] transition-all transform active:scale-[0.98] shadow-lg shadow-[#2ca36a]/20">
                        Add to Cart
                    </button>
                </div>
            </div>

            {/* ==================== DESKTOP SECTION (MODERN IDEA) ==================== */}
            <div className="hidden md:block max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-12">
                <div className="flex flex-col lg:flex-row gap-12">
                    {/* Left: Product Images */}
                    <div className="flex-1 space-y-6">
                        <div className="aspect-square rounded-3xl overflow-hidden bg-gray-50 border border-gray-100 p-12">
                            <img src={product.image} alt={product.name} className="w-full h-full object-contain" />
                        </div>
                        <div className="grid grid-cols-4 gap-4">
                            {product.gallery.map((img, idx) => (
                                <div key={idx} className="aspect-square rounded-2xl overflow-hidden border border-gray-100 cursor-pointer hover:border-primary transition-all p-4 bg-gray-50">
                                    <img src={img} alt="" className="w-full h-full object-contain" />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Product Details */}
                    <div className="flex-1">
                        <div className="flex items-center gap-2 text-[14px] text-text-muted mb-6">
                            <Link href="/" className="hover:text-primary transition-colors">Home</Link>
                            <span>/</span>
                            <Link href="/shop" className="hover:text-primary transition-colors">Products</Link>
                            <span>/</span>
                            <span className="text-text font-semibold capitalize">{product.category}</span>
                        </div>

                        <h1 className="text-[42px] font-black text-[#1a2b4b] mb-4">{product.name}</h1>

                        <div className="flex items-center gap-4 mb-8">
                            <div className="flex items-center gap-1.5 bg-yellow-400/10 px-3 py-1 rounded-full">
                                <Star size={16} className="fill-yellow-400 text-yellow-400" />
                                <span className="text-[14px] font-bold text-text">{product.rating}</span>
                                <span className="text-[12px] text-text-muted font-medium">({product.reviews} reviews)</span>
                            </div>
                            <div className="w-px h-4 bg-gray-200" />
                            <span className="text-[14px] font-bold text-primary">In Stock</span>
                        </div>

                        <div className="flex items-baseline gap-4 mb-10">
                            <span className="text-[36px] font-black text-primary">{product.price}</span>
                            <span className="text-[18px] text-text-muted line-through font-bold opacity-50">{product.oldPrice}</span>
                        </div>

                        <p className="text-[16px] text-text-muted leading-relaxed mb-10 border-b border-gray-100 pb-10 font-medium">
                            {product.description}
                        </p>

                        <div className="flex items-center gap-6 mb-12">
                            <div className="flex items-center border border-gray-200 rounded-2xl overflow-hidden h-14 bg-gray-50/50">
                                <button
                                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                    className="px-6 hover:bg-white text-text-muted transition-colors border-r border-gray-100"
                                >
                                    <Minus size={20} />
                                </button>
                                <div className="w-16 flex items-center justify-center font-black text-[20px]">{quantity}</div>
                                <button
                                    onClick={() => setQuantity(quantity + 1)}
                                    className="px-6 hover:bg-white text-text-muted transition-colors border-l border-gray-100"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                            <button className="flex-1 h-14 bg-primary hover:bg-primary-dark text-white rounded-2xl flex items-center justify-center gap-3 font-bold text-[18px] transition-all shadow-xl shadow-primary/20">
                                <ShoppingCart size={22} /> Add To Cart
                            </button>
                            <button className="w-14 h-14 border border-gray-200 rounded-2xl flex items-center justify-center text-text-muted hover:text-red-500 hover:border-red-100 hover:bg-red-50 transition-all">
                                <Heart size={24} />
                            </button>
                        </div>

                        {/* Feature Points */}
                        <div className="grid grid-cols-2 gap-6 p-8 bg-[#f8fff8] rounded-[32px] border border-primary/10">
                            {[
                                { icon: Truck, title: 'Free Delivery', desc: 'Orders over $50' },
                                { icon: ShieldCheck, title: 'Secure Payment', desc: '100% processing' },
                                { icon: Share2, title: 'Easy Returns', desc: '30 days policy' },
                                { icon: Star, title: 'Quality Choice', desc: 'Sourced directly' },
                            ].map((spec, i) => (
                                <div key={i} className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-primary shadow-sm">
                                        <spec.icon size={22} />
                                    </div>
                                    <div>
                                        <h4 className="text-[15px] font-bold text-text leading-tight">{spec.title}</h4>
                                        <p className="text-[12px] text-text-muted font-medium">{spec.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .safe-area-bottom {
                    padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));
                }
            `}</style>
        </div>
    );
}
