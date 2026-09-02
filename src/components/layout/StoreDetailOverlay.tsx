'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, Search, Star, ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MobileBottomNav } from './MobileBottomNav';

interface StoreDetailOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    store: {
        id: number;
        name: string;
        category: string;
        rating: number;
        image: string;
    } | null;
}

const CATEGORIES = ['Bestsaller', 'Dairy', 'Fruits', 'Vegetable', 'Bavarage', 'Snacks'];

const STORE_ITEMS = [
    {
        id: 1,
        name: 'Bell Pepper Red',
        weight: '200 gms',
        price: 5.22,
        originalPrice: 7.99,
        image: 'https://cdn.pixabay.com/photo/2016/08/11/23/25/red-bell-pepper-1587217_1280.jpg'
    },
    {
        id: 2,
        name: 'Banana',
        weight: '6 pcs',
        price: 2.50,
        originalPrice: 5.99,
        image: 'https://cdn.pixabay.com/photo/2018/09/24/20/12/bananas-3700718_1280.jpg'
    },
    {
        id: 3,
        name: 'Brinjal Black',
        weight: '250 gms',
        price: 3.99,
        originalPrice: 4.99,
        image: 'https://cdn.pixabay.com/photo/2012/03/01/01/05/eggplant-20092_1280.jpg'
    },
    {
        id: 4,
        name: 'Bell Pepper Red',
        weight: '200 gms',
        price: 5.22,
        originalPrice: 7.99,
        image: 'https://cdn.pixabay.com/photo/2016/08/11/23/25/red-bell-pepper-1587217_1280.jpg'
    },
    {
        id: 5,
        name: 'Banana',
        weight: '6 pcs',
        price: 2.50,
        originalPrice: 5.99,
        image: 'https://cdn.pixabay.com/photo/2018/09/24/20/12/bananas-3700718_1280.jpg'
    },
];

export function StoreDetailOverlay({ isOpen, onClose, store }: StoreDetailOverlayProps) {
    const [activeCategory, setActiveCategory] = useState('Bestsaller');
    const [searchQuery, setSearchQuery] = useState('');

    if (!isOpen || !store) return null;

    return (
        <div className="fixed inset-0 z-[11000] bg-white flex flex-col md:hidden animate-in fade-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-white sticky top-0 z-10 border-b border-gray-50">
                <button onClick={onClose} className="p-1 -ml-1">
                    <ArrowLeft size={24} className="text-gray-700" />
                </button>
                <h2 className="text-lg font-bold text-gray-800">{store.name}</h2>
                <button className="p-1 -mr-1">
                    <Search size={22} className="text-gray-700" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto pb-20">
                {/* Store Info Card */}
                <div className="p-4">
                    <div className="p-4 border border-gray-100 rounded-lg shadow-sm bg-white">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">{store.name}</h3>
                                <p className="text-sm text-gray-500">{store.category}</p>
                            </div>
                            <button className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 rounded-lg text-sm text-gray-600 font-medium border border-gray-100">
                                Change store <ChevronDown size={16} />
                            </button>
                        </div>
                        <div className="flex items-center gap-4 mt-3">
                            <div className="flex items-center gap-1 bg-primary text-white text-[12px] px-2 py-0.5 rounded-full font-bold">
                                <Star size={12} fill="currentColor" />
                                <span>{store.rating}</span>
                            </div>
                            <span className="text-xs text-gray-400 font-medium">Review : 1.2k</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 font-medium">Min order - $1.11</p>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="px-4 mb-4">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-lg w-full">
                        <Search size={20} className="text-gray-400 shrink-0" />
                        <input
                            type="text"
                            placeholder="Search for items in the store...."
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {/* Categories */}
                <div className="flex items-center gap-4 px-4 overflow-x-auto no-scrollbar border-b border-gray-50 bg-white sticky top-[65px] z-10">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={cn(
                                "flex-shrink-0 py-3 text-sm font-bold transition-all relative",
                                activeCategory === cat ? "text-primary" : "text-gray-400"
                            )}
                        >
                            {cat}
                            {activeCategory === cat && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Item List */}
                <div className="flex flex-col">
                    {STORE_ITEMS.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-4 p-4 bg-white border-b border-gray-50">
                            <div className="w-20 h-20 shrink-0 bg-gray-50 rounded-xl overflow-hidden border border-gray-100 p-1 relative">
                                <Image src={item.image} alt={item.name} fill className="object-contain" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-bold text-gray-800">{item.name}</h3>
                                <p className="text-xs text-gray-400 mt-0.5">{item.weight}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-sm font-extrabold text-[#1a1a1a]">$ {item.price.toFixed(2)} {item.weight.split(' ')[1]}</span>
                                    <span className="text-[10px] text-gray-400 line-through">$ {item.originalPrice.toFixed(2)} {item.weight.split(' ')[1]}</span>
                                </div>
                            </div>
                            <button className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-primary font-bold text-xs hover:bg-gray-50 transition-colors shadow-sm">
                                <Plus size={14} className="stroke-[3]" />
                                <span>ADD</span>
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bottom Nav */}
            <MobileBottomNav />
        </div>
    );
}
