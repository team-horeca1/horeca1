'use client';

import React from 'react';
import { Star, MapPin, Phone, Share2, ChevronLeft, Image as ImageIcon, Navigation, ClipboardList, CreditCard, Clock, Megaphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import type { Vendor, StorePromotion } from '@/types';
import { VENDOR_COVERS } from '@/components/features/homepage/VendorCardShared';
import { parseImageMeta, getDisplayStyle } from '@/lib/imageMeta';

interface VendorStoreHeaderProps {
    vendor: Vendor;
    activeTab: string;
    onTabChange: (tab: string) => void;
    storePromos?: Array<Pick<StorePromotion, 'id' | 'name' | 'badgeLabel' | 'type'>>;
}

export function VendorStoreHeader({ vendor, activeTab, onTabChange, storePromos = [] }: VendorStoreHeaderProps) {
    const router = useRouter();
    const { status } = useSession();
    const isLoggedIn = status === 'authenticated';
    const coverIndex = Math.abs(vendor.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % VENDOR_COVERS.length;
    const coverImage = vendor.coverImage || VENDOR_COVERS[coverIndex];
    // The detail page hero box renders the vendor's LOGO, not their card cover.
    // Falls back to the cover image if no logo was uploaded.
    const heroImage = vendor.logo || coverImage;
    // Apply the saved focal point + zoom so a wide logo is cropped to the part
    // the vendor chose in the Adjust modal — same behavior as the brand-logo
    // live preview circle (object-cover that fills the frame).
    const heroImageStyle = getDisplayStyle(parseImageMeta(heroImage).meta);
    
    const handleMyListsClick = (e: React.MouseEvent) => {
        if (!isLoggedIn) {
            e.preventDefault();
            toast.error('Please log in to view your order lists');
            return;
        }
        router.push(`/order-lists?vendorId=${vendor.id}`);
    };

    const handleShare = async () => {
        const shareData = {
            title: vendor.name,
            text: `Check out ${vendor.name} on Horeca1`,
            url: window.location.href,
        };
        try {
            if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(window.location.href);
                toast.success('Link copied to clipboard!');
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="w-full bg-white md:bg-white md:pb-6 md:pt-4">
            {/* ── MOBILE HEADER — compact light-green hero (matches homepage mobile) ── */}
            <div className="block md:hidden relative px-4 pt-4">
                <div
                    className="relative w-full rounded-[20px] overflow-hidden"
                    style={{ backgroundColor: '#eff9f0' }}
                >
                    <button
                        onClick={() => router.back()}
                        className="absolute top-3 left-3 z-20 p-2 bg-white/80 backdrop-blur-md rounded-full shadow-sm"
                        aria-label="Back"
                    >
                        <ChevronLeft size={18} strokeWidth={3} className="text-[#181725]" />
                    </button>
                    <div className="flex items-center px-5 py-6 pt-10">
                        <div className="flex-1 pr-2 min-w-0">
                            <div className="flex items-center gap-1.5 mb-2">
                                <span className="bg-[#1C8C44] text-white px-2 py-0.5 rounded-md flex items-center gap-1 text-[11px] font-black shadow-sm">
                                    {vendor.rating} <Star size={10} fill="white" className="text-white" />
                                </span>
                                {vendor.deliverySchedule ? <span className="text-[10px] text-[#1C8C44] font-black uppercase tracking-tighter"><Clock size={10} className="inline mr-0.5" />{vendor.deliverySchedule}</span> : <span className="text-[10px] text-[#1C8C44] font-black uppercase tracking-tighter">Open till 8PM</span>}
                        {vendor.creditEnabled && <span className="bg-[#F3E5F5]/80 text-[#7B1FA2] text-[9px] font-black px-1.5 py-0.5 rounded-lg flex items-center gap-0.5"><CreditCard size={9} strokeWidth={2.5} />Credit</span>}
                            </div>
                            <h1 className="text-[20px] font-[900] text-[#0f172a] leading-[1.15] mb-1 line-clamp-2">
                                {vendor.name}
                            </h1>
                            <p className="text-[11px] text-gray-500 font-medium leading-[1.4] line-clamp-2 mb-1.5">
                                {vendor.categories.slice(0, 3).join(' · ')}
                            </p>
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-wide">
                                Min ₹{vendor.minOrderValue}
                            </p>
                        </div>
                        <div className="flex-shrink-0 w-[38%] max-w-[120px] relative">
                            <div className="w-full aspect-square rounded-[14px] overflow-hidden bg-white border border-white/60 shadow-sm relative">
                                <Image
                                    src={heroImage}
                                    alt={vendor.name}
                                    fill
                                    className="object-contain p-2"
                                    style={heroImageStyle}
                                    priority
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Operational Action Pills (below hero) */}
                <div className="flex items-center gap-3 mt-4 overflow-x-auto no-scrollbar pb-1">
                    <button className="shrink-0 bg-gray-50 border border-gray-100 px-4 py-2 rounded-2xl flex items-center justify-center gap-2 text-[13px] font-black text-gray-800">
                        <Navigation size={16} className="text-[#53B175]" strokeWidth={3} />
                        Directions
                    </button>
                    <button className="shrink-0 p-3 bg-gray-50 border border-gray-100 rounded-2xl text-gray-800">
                        <Phone size={18} className="text-[#53B175]" strokeWidth={3} />
                    </button>
                    <button onClick={handleShare} className="shrink-0 p-3 bg-gray-50 border border-gray-100 rounded-2xl text-gray-800">
                        <Share2 size={18} className="text-[#53B175]" strokeWidth={3} />
                    </button>
                    <button
                        onClick={handleMyListsClick}
                        className="shrink-0 bg-gray-50 border border-gray-100 px-4 py-2 rounded-2xl flex items-center justify-center gap-2 text-[13px] font-black text-gray-800"
                    >
                        <ClipboardList size={16} className="text-[#53B175]" strokeWidth={3} />
                        My Lists
                    </button>
                </div>

                {storePromos.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
                        {storePromos.map((p) => (
                            <div
                                key={p.id}
                                className="shrink-0 flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 text-emerald-800 px-3 py-1.5 rounded-full text-[11px] font-bold"
                            >
                                <Megaphone size={12} className="text-emerald-600" />
                                {p.badgeLabel}
                            </div>
                        ))}
                    </div>
                )}

                {/* Mobile Tabs */}
                <div className="flex items-center gap-6 border-b border-gray-100 mt-3 overflow-x-auto no-scrollbar">
                    {[
                        { key: 'all', label: 'Catalog' },
                        { key: 'deals', label: 'Deals' },
                        { key: 'orders', label: 'My Orders' },
                        { key: 'ratings', label: 'Ratings' },
                        { key: 'about', label: 'Info' }
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => onTabChange(tab.key)}
                            className={cn(
                                "pb-3 pt-2 text-[14px] font-black transition-all relative shrink-0",
                                activeTab === tab.key ? "text-[#53B175]" : "text-gray-400"
                            )}
                        >
                            {tab.label}
                            {activeTab === tab.key && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#53B175] rounded-full" />}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── DESKTOP HEADER — compact green-gradient hero (matches homepage hero) ── */}
            <div className="hidden md:block max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                <div className="relative w-full h-[180px] lg:h-[220px] rounded-[32px] md:rounded-[40px] overflow-hidden bg-gradient-to-r from-[#22844f] via-[#299e60] to-[#22c55e] flex items-center px-6 md:px-10 lg:px-16 shadow-lg">
                    {/* Decorative circles (same as homepage hero) */}
                    <div className="absolute left-0 top-0 w-full h-full opacity-10 pointer-events-none">
                        <svg width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="10%" cy="50%" r="150" stroke="white" strokeWidth="2" />
                            <circle cx="90%" cy="20%" r="80" stroke="white" strokeWidth="2" />
                        </svg>
                    </div>

                    {/* Back button */}
                    <button
                        onClick={() => router.back()}
                        className="absolute top-4 left-4 p-2 bg-white/20 backdrop-blur-md rounded-full text-white z-20 hover:bg-white/30 transition"
                        aria-label="Back"
                    >
                        <ChevronLeft size={20} strokeWidth={3} />
                    </button>

                    {/* Top-right: gallery badge */}
                    <div className="absolute top-4 right-5 z-20">
                        <div className="bg-white/20 backdrop-blur-md text-white px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-[12px] font-black border border-white/25">
                            <ImageIcon size={13} />
                            5/15
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex items-center w-full relative z-10">
                        {/* Vendor logo */}
                        <div className="flex-shrink-0 mr-4 md:mr-8 lg:mr-12">
                            <div className="relative w-[110px] h-[110px] md:w-[140px] md:h-[140px] lg:w-[170px] lg:h-[170px] rounded-[20px] md:rounded-[24px] bg-white border-2 border-white/30 overflow-hidden shadow-2xl">
                                <Image src={heroImage} alt={vendor.name} fill className="object-contain p-2" style={heroImageStyle} priority />
                            </div>
                        </div>

                        {/* Title + badges */}
                        <div className="flex-grow flex flex-col items-start justify-center text-white min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span className="bg-white text-[#181725] px-2.5 py-1 rounded-lg flex items-center gap-1 text-[12px] font-black shadow-md">
                                    {vendor.rating} <Star size={11} fill="#FBC02D" className="text-[#FBC02D]" />
                                </span>
                                {vendor.deliverySchedule ? <span className="bg-white/15 backdrop-blur-sm border border-white/25 text-white text-[10px] md:text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg">{vendor.deliverySchedule}</span> : <span className="bg-white/15 backdrop-blur-sm border border-white/25 text-white text-[10px] md:text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg">Open till 8:00 PM</span>}
                                {vendor.creditEnabled && <span className="bg-[#F3E5F5]/80 backdrop-blur-sm text-[#7B1FA2] text-[10px] md:text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg flex items-center gap-1"><CreditCard size={11} strokeWidth={2.5} />Credit Available</span>}
                            </div>
                            <h1 className="text-[1.6rem] md:text-[2rem] lg:text-[2.8rem] font-[900] leading-[1.05] tracking-tight drop-shadow-md line-clamp-1">
                                {vendor.name}
                            </h1>
                            <p className="text-[0.75rem] md:text-[0.85rem] lg:text-[0.95rem] font-medium opacity-90 mt-1 line-clamp-1">
                                {vendor.categories.slice(0, 3).join(' · ')}
                                {vendor.minOrderValue ? <> <span className="opacity-60">|</span> Min ₹{vendor.minOrderValue}</> : null}
                            </p>
                        </div>

                        {/* Right-side CTA stack */}
                        <div className="flex-shrink-0 ml-4 hidden lg:flex flex-col items-end gap-2">
                            {vendor.deliverySchedule && (
                                <span className="bg-white/15 backdrop-blur-sm border border-white/25 text-white text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                                    🚚 Next: {vendor.deliverySchedule}
                                </span>
                            )}
                            <button
                                onClick={() => {
                                    onTabChange('all');
                                    setTimeout(() => {
                                        window.scrollTo({ top: window.innerHeight * 0.45, behavior: 'smooth' });
                                    }, 50);
                                }}
                                className="bg-[#181725] text-white px-7 py-3 rounded-2xl flex items-center gap-2 text-[1rem] font-bold hover:scale-105 transition-all shadow-xl whitespace-nowrap"
                            >
                                Start Ordering
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── INFO BAR — address left, actions right ── */}
                <div className="flex items-center justify-between px-1 pt-5 pb-4 border-b border-gray-100">
                    {/* Left: address */}
                    <div className="flex items-center gap-2 min-w-0">
                        <MapPin size={16} className="text-[#53B175] shrink-0" strokeWidth={2.5} />
                        <span className="text-[14px] font-medium text-gray-500 truncate">
                            Plot No 114/3, Sector 5, Navi Mumbai
                        </span>
                    </div>

                    {/* Right: action buttons */}
                    <div className="flex items-center gap-2.5 shrink-0 ml-6">
                        <button className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gray-50 border border-gray-100 text-[13px] font-black text-gray-700 hover:bg-[#53B175]/5 hover:border-[#53B175]/40 hover:text-[#53B175] transition-all duration-200">
                            <Phone size={15} strokeWidth={2.5} />
                            Call Vendor
                        </button>
                        <button onClick={handleShare} className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gray-50 border border-gray-100 text-[13px] font-black text-gray-700 hover:bg-[#53B175]/5 hover:border-[#53B175]/40 hover:text-[#53B175] transition-all duration-200">
                            <Share2 size={15} strokeWidth={2.5} />
                            Share
                        </button>
                        <button
                            onClick={handleMyListsClick}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gray-50 border border-gray-100 text-[13px] font-black text-gray-700 hover:bg-[#53B175]/5 hover:border-[#53B175]/40 hover:text-[#53B175] transition-all duration-200"
                        >
                            <ClipboardList size={15} strokeWidth={2.5} />
                            My Lists
                        </button>
                    </div>
                </div>

                {/* ── TABS ── */}
                <div className="flex items-center gap-8 overflow-x-auto no-scrollbar">
                    {[
                        { key: 'all', label: 'Catalog' },
                        { key: 'deals', label: 'Deals' },
                        { key: 'orders', label: 'My Orders' },
                        { key: 'ratings', label: 'Ratings' },
                        { key: 'about', label: 'About' }
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => onTabChange(tab.key)}
                            className={cn(
                                "pb-3 pt-3 text-[15px] font-bold transition-all relative",
                                activeTab === tab.key || (activeTab === 'all' && tab.key === 'all')
                                    ? "text-[#53B175]"
                                    : "text-gray-400 hover:text-gray-700"
                            )}
                        >
                            {tab.label}
                            {(activeTab === tab.key || (activeTab === 'all' && tab.key === 'all')) && (
                                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#53B175] rounded-full" />
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
