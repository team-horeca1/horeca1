'use client';

import React, { useState } from 'react';
import { Star, MapPin, Phone, Share2, ChevronLeft, Image as ImageIcon, Navigation, ClipboardList, CreditCard, Clock, Megaphone, Tag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { toast } from 'sonner';
import { useStableSession } from '@/hooks/useStableSession';
import { cn } from '@/lib/utils';
import type { Vendor, StorePromotion } from '@/types';
import { VENDOR_COVERS } from '@/components/features/homepage/VendorCardShared';
import { parseImageMeta, getDisplayStyle } from '@/lib/imageMeta';
import { OffersSheet } from '@/components/features/promo/OffersSheet';

interface VendorStoreHeaderProps {
    vendor: Vendor;
    activeTab: string;
    onTabChange: (tab: string) => void;
    storePromos?: Array<Pick<StorePromotion, 'id' | 'name' | 'badgeLabel' | 'type'>>;
}

export function VendorStoreHeader({ vendor, activeTab, onTabChange, storePromos = [] }: VendorStoreHeaderProps) {
    const router = useRouter();
    const { isAuthenticated } = useStableSession();
    const isLoggedIn = isAuthenticated;
    const [dealsOpen, setDealsOpen] = useState(false);
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
            {/* ── MOBILE HEADER — ivory / burgundy hero ── */}
            <div className="block md:hidden relative px-4 pt-4">
                <div className="relative w-full rounded-[20px] overflow-hidden bg-ivory border border-divider">
                    <button
                        onClick={() => router.back()}
                        className="absolute top-3 left-3 z-20 p-2 bg-white rounded-full shadow-sm border border-divider"
                        aria-label="Back"
                    >
                        <ChevronLeft size={18} strokeWidth={3} className="text-[#181725]" />
                    </button>
                    <div className="flex items-center px-5 py-6 pt-10">
                        <div className="flex-1 pr-2 min-w-0">
                            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                <span className="bg-primary text-white px-2 py-0.5 rounded-md flex items-center gap-1 text-[11px] font-bold shadow-sm">
                                    {vendor.rating} <Star size={10} fill="white" className="text-white" />
                                </span>
                                {vendor.deliverySchedule ? (
                                    <span className="text-[10px] text-primary font-bold uppercase tracking-tighter">
                                        <Clock size={10} className="inline mr-0.5" />{vendor.deliverySchedule}
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-primary font-bold uppercase tracking-tighter">Open till 8PM</span>
                                )}
                                {vendor.creditEnabled && (
                                    <span className="bg-primary-light text-primary text-[9px] font-bold px-1.5 py-0.5 rounded-lg flex items-center gap-0.5">
                                        <CreditCard size={9} strokeWidth={2.5} />Credit
                                    </span>
                                )}
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
                <div className="flex items-center gap-2.5 mt-4 overflow-x-auto no-scrollbar pb-1">
                    <button type="button" className="shrink-0 bg-ivory border border-divider px-3.5 py-2 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold text-text hover:bg-white transition-colors">
                        <Navigation size={15} className="text-primary" strokeWidth={2} />
                        Directions
                    </button>
                    <button type="button" className="shrink-0 p-2.5 bg-ivory border border-divider rounded-xl text-text hover:bg-white transition-colors" aria-label="Call">
                        <Phone size={16} className="text-primary" strokeWidth={2} />
                    </button>
                    <button type="button" onClick={handleShare} className="shrink-0 p-2.5 bg-ivory border border-divider rounded-xl text-text hover:bg-white transition-colors" aria-label="Share">
                        <Share2 size={16} className="text-primary" strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        onClick={handleMyListsClick}
                        className="shrink-0 bg-ivory border border-divider px-3.5 py-2 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold text-text hover:bg-white transition-colors"
                    >
                        <ClipboardList size={15} className="text-primary" strokeWidth={2} />
                        My Lists
                    </button>
                    <button
                        type="button"
                        onClick={() => setDealsOpen(true)}
                        className="shrink-0 bg-white border border-divider px-3.5 py-2 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold text-text shadow-sm hover:border-primary/40 transition-colors"
                    >
                        <Tag size={15} strokeWidth={2} className="text-primary" />
                        Deals
                        {storePromos.length > 0 && (
                            <span className="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                                {storePromos.length}
                            </span>
                        )}
                    </button>
                </div>

                {storePromos.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
                        {storePromos.map((p) => (
                            <div
                                key={p.id}
                                className="shrink-0 flex items-center gap-1.5 bg-primary-light border border-primary/20 text-primary px-3 py-1.5 rounded-full text-xs font-bold"
                            >
                                <Megaphone size={12} className="text-primary" />
                                {p.badgeLabel}
                            </div>
                        ))}
                    </div>
                )}

                {/* Mobile Tabs */}
                <div className="flex items-center gap-6 border-b border-divider mt-3 overflow-x-auto no-scrollbar">
                    {[
                        { key: 'all', label: 'Catalog' },
                        { key: 'deals', label: 'Deals' },
                        { key: 'orders', label: 'My Orders' },
                        { key: 'ratings', label: 'Ratings' },
                        { key: 'about', label: 'Info' }
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => onTabChange(tab.key)}
                            className={cn(
                                "pb-3 pt-2 text-xs font-bold transition-all relative shrink-0",
                                activeTab === tab.key ? "text-primary" : "text-text-muted hover:text-text"
                            )}
                        >
                            {tab.label}
                            {activeTab === tab.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── DESKTOP HEADER — compact Burgundy hero (matches CDL brand) ── */}
            <div className="hidden md:block max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                <div className="relative w-full h-[180px] lg:h-[220px] rounded-2xl overflow-hidden bg-gradient-to-r from-[#4A141F] via-[#6B1D2E] to-[#8B2C3E] flex items-center px-6 md:px-10 lg:px-16 shadow-cdl-2">
                    {/* Decorative circles */}
                    <div className="absolute left-0 top-0 w-full h-full opacity-10 pointer-events-none">
                        <svg width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="10%" cy="50%" r="150" stroke="white" strokeWidth="2" />
                            <circle cx="90%" cy="20%" r="80" stroke="white" strokeWidth="2" />
                        </svg>
                    </div>

                    {/* Back button */}
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="absolute top-4 left-4 p-2 bg-white/20 backdrop-blur-md rounded-full text-white z-20 hover:bg-white/30 transition"
                        aria-label="Back"
                    >
                        <ChevronLeft size={20} strokeWidth={2.5} />
                    </button>

                    {/* Content */}
                    <div className="flex items-center w-full relative z-10">
                        {/* Vendor logo */}
                        <div className="flex-shrink-0 mr-4 md:mr-8 lg:mr-10">
                            <div className="relative w-[110px] h-[110px] md:w-[130px] md:h-[130px] rounded-xl bg-white border-2 border-white/40 overflow-hidden shadow-cdl-2">
                                <Image src={heroImage} alt={vendor.name} fill className="object-contain p-2" style={heroImageStyle} priority />
                            </div>
                        </div>

                        {/* Title + badges */}
                        <div className="flex-grow flex flex-col items-start justify-center text-white min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span className="bg-white text-text px-2.5 py-0.5 rounded-md flex items-center gap-1 text-xs font-bold shadow-sm">
                                    {vendor.rating} <Star size={11} className="fill-amber-400 text-amber-400" />
                                </span>
                                {vendor.deliverySchedule ? (
                                    <span className="bg-white/15 backdrop-blur-sm border border-white/25 text-white text-[10px] md:text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md">
                                        {vendor.deliverySchedule}
                                    </span>
                                ) : (
                                    <span className="bg-white/15 backdrop-blur-sm border border-white/25 text-white text-[10px] md:text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md">
                                        Open till 8:00 PM
                                    </span>
                                )}
                                {vendor.creditEnabled && (
                                    <span className="bg-white/20 backdrop-blur-sm text-white border border-white/30 text-[10px] md:text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1">
                                        <CreditCard size={11} strokeWidth={2} /> DiSCCO Credit
                                    </span>
                                )}
                            </div>
                            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight tracking-tight text-white drop-shadow-sm line-clamp-1">
                                {vendor.name}
                            </h1>
                            <p className="text-xs md:text-sm font-medium text-white/80 mt-1 line-clamp-1">
                                {vendor.categories.slice(0, 3).join(' · ')}
                                {vendor.minOrderValue ? <> <span className="opacity-60">|</span> Min ₹{vendor.minOrderValue}</> : null}
                            </p>
                        </div>

                        {/* Right-side CTAs */}
                        <div className="flex-shrink-0 ml-4 hidden lg:flex flex-col items-stretch justify-center gap-2 w-[min(100%,200px)]">
                            <button
                                type="button"
                                onClick={() => {
                                    onTabChange('all');
                                    setTimeout(() => {
                                        window.scrollTo({ top: window.innerHeight * 0.45, behavior: 'smooth' });
                                    }, 50);
                                }}
                                className="w-full bg-white text-primary px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-bold shadow-md hover:bg-ivory transition-colors active:scale-95"
                            >
                                Start Ordering →
                            </button>
                            <button
                                type="button"
                                onClick={() => setDealsOpen(true)}
                                className="w-full bg-white/15 text-white px-4 py-2 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold border border-white/30 hover:bg-white/25 transition-colors"
                            >
                                <Tag size={14} strokeWidth={2} />
                                Deals &amp; Coupons
                                {storePromos.length > 0 && (
                                    <span className="min-w-[1.2rem] h-4 px-1 rounded-full bg-white text-primary text-[10px] font-bold flex items-center justify-center">
                                        {storePromos.length}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── INFO BAR ── */}
                <div className="flex items-center justify-between px-1 pt-4 pb-3 border-b border-divider">
                    <div className="flex items-center gap-2 min-w-0">
                        <MapPin size={16} className="text-primary shrink-0" strokeWidth={2} />
                        <span className="text-xs md:text-sm font-medium text-text-secondary truncate">
                            Plot No 114/3, Sector 5, Navi Mumbai
                        </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-4">
                        <button type="button" className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-ivory border border-divider text-xs font-semibold text-text hover:bg-primary-light hover:border-primary/40 hover:text-primary transition-all">
                            <Phone size={14} strokeWidth={2} />
                            Call Vendor
                        </button>
                        <button type="button" onClick={handleShare} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-ivory border border-divider text-xs font-semibold text-text hover:bg-primary-light hover:border-primary/40 hover:text-primary transition-all">
                            <Share2 size={14} strokeWidth={2} />
                            Share
                        </button>
                        <button
                            type="button"
                            onClick={handleMyListsClick}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-ivory border border-divider text-xs font-semibold text-text hover:bg-primary-light hover:border-primary/40 hover:text-primary transition-all"
                        >
                            <ClipboardList size={14} strokeWidth={2} />
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
                            type="button"
                            onClick={() => onTabChange(tab.key)}
                            className={cn(
                                "pb-3 pt-3 text-xs md:text-sm font-bold transition-all relative",
                                activeTab === tab.key || (activeTab === 'all' && tab.key === 'all')
                                    ? "text-primary font-bold"
                                    : "text-text-muted hover:text-text"
                            )}
                        >
                            {tab.label}
                            {(activeTab === tab.key || (activeTab === 'all' && tab.key === 'all')) && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <OffersSheet
                open={dealsOpen}
                onClose={() => setDealsOpen(false)}
                vendorId={vendor.id}
                vendorName={vendor.name}
            />
        </div>
    );
}
