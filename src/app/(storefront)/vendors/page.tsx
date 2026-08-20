'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { dal } from '@/lib/dal';
import type { Vendor } from '@/types';
import { VendorCard } from '@/components/features/homepage/VendorCardShared';

export default function VendorsPage() {
    const router = useRouter();
    const [allVendors, setAllVendors] = useState<Vendor[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        dal.vendors.list()
            .then(({ vendors }) => setAllVendors(vendors))
            .catch((err) => console.error('Failed to load vendors:', err))
            .finally(() => setIsLoading(false));
    }, []);

    return (
        <div className="min-h-screen bg-[#F8F9FA]">
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => router.push('/')} 
                            className="p-2.5 hover:bg-gray-100/80 rounded-2xl transition-all duration-300 group active:scale-95 shrink-0"
                        >
                            <ChevronLeft size={22} className="text-gray-700 group-hover:-translate-x-0.5 transition-transform" />
                        </button>
                        <h1 className="text-[22px] font-extrabold text-[#1A1C1E] tracking-tight">
                            All Vendors
                        </h1>
                    </div>
                </div>
            </div>

            {/* Vendor Grid */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
                {isLoading ? (
                    <div className="flex items-center justify-center py-32">
                        <div className="w-10 h-10 border-[3px] border-[#22844f]/10 border-t-[#22844f] rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 min-[500px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {allVendors.map((vendor, index) => (
                            <VendorCard key={vendor.id} vendor={vendor} index={index} fluid priority={index < 5} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
