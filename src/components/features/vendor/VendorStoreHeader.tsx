'use client';

import React, { useState } from 'react';
import { Star, MapPin, Phone, Share2, ChevronLeft, Navigation, ClipboardList, CreditCard, Clock, Megaphone, Tag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { toast } from 'sonner';
import { shareCard } from '@/lib/share-cards/shareClient';
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
        const url = `${window.location.origin}/vendor/${vendor.id}`;
        const result = await shareCard({
            title: vendor.name,
            text: `Check out ${vendor.name} on Horeca1`,
            url,
            imageUrl: `/api/og/vendor/${vendor.id}?format=square`,
        });
        if (result === 'copied') toast.success('Link copied to clipboard!');
    };

    const handleWhatsAppShare = () => {
        const url = `${window.location.origin}/vendor/${vendor.id}`;
        const text = `Check out ${vendor.name} on Horeca1\n${url}`;
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    };

    const locationLine = [vendor.address?.city, vendor.address?.state].filter(Boolean).join(', ')
        || vendor.categories.slice(0, 2).join(' · ');

    return (
        <div className="w-full bg-white md:bg-white md:pb-6 md:pt-4">
            {/* ── MOBILE HEADER — banner + overlapping logo + WhatsApp ── */}
            <div className="block md:hidden">
                <div className="relative">
                    <div className="relative h-[88px] overflow-hidden bg-primary">
                        <Image
                            src={coverImage}
                            alt=""
                            fill
                            className="object-cover opacity-35"
                            sizes="100vw"
                            priority
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-primary/40" />
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="absolute top-3 left-3 z-20 size-9 bg-white rounded-full shadow-sm border border-divider flex items-center justify-center"
                            aria-label="Back"
                        >
                            <ChevronLeft size={18} strokeWidth={3} className="text-[#181725]" />
                        </button>
                        <button
                            type="button"
                            onClick={handleWhatsAppShare}
                            className="absolute top-3 right-3 z-20 size-9 bg-white rounded-full shadow-sm flex items-center justify-center"
                            aria-label="Share on WhatsApp"
                        >
                            <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
                                <path
                                    fill="#25D366"
                                    d="M17.47 14.38c-.28-.14-1.64-.81-1.9-.9-.25-.1-.44-.14-.62.14-.19.28-.71.9-.87 1.08-.16.19-.32.21-.6.07-.28-.14-1.18-.43-2.25-1.39-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.32.42-.48.14-.16.19-.28.28-.46.1-.19.05-.35-.02-.49-.07-.14-.62-1.49-.85-2.04-.22-.53-.45-.46-.62-.47h-.53c-.19 0-.49.07-.74.35-.25.28-.97.95-.97 2.31s1 2.68 1.13 2.86c.14.19 1.96 2.99 4.75 4.19.66.29 1.18.46 1.59.58.67.21 1.27.18 1.75.11.53-.08 1.64-.67 1.87-1.32.23-.65.23-1.2.16-1.32-.07-.11-.25-.18-.53-.32Z"
                                />
                                <path
                                    fill="#25D366"
                                    d="M12.04 2C6.58 2 2.15 6.43 2.15 11.89c0 1.75.46 3.45 1.34 4.95L2 22l5.3-1.39a9.86 9.86 0 0 0 4.74 1.21h.01c5.46 0 9.89-4.43 9.89-9.89C22 6.43 17.5 2 12.04 2Zm0 18.07h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.14.82.84-3.06-.2-.31a8.18 8.18 0 0 1-1.26-4.37c0-4.53 3.69-8.21 8.23-8.21 4.54 0 8.24 3.68 8.24 8.21 0 4.54-3.7 8.25-8.22 8.25Z"
                                />
                            </svg>
                        </button>
                        <p className="absolute top-1/2 -translate-y-1/2 left-14 right-14 text-[11px] text-white/90 font-medium line-clamp-1 z-10">
                            {locationLine}
                        </p>
                    </div>

                    <div className="px-3 flex items-start gap-3">
                        <div className="relative size-16 -mt-7 rounded-xl overflow-hidden bg-white border border-divider shadow-sm shrink-0 z-10">
                            <Image
                                src={heroImage}
                                alt={vendor.name}
                                fill
                                className="object-contain p-1.5"
                                style={heroImageStyle}
                                priority
                            />
                        </div>
                        <div className="min-w-0 flex-1 pt-1.5">
                            <h1 className="text-[18px] font-extrabold text-[#0f172a] leading-tight line-clamp-1 text-balance">
                                {vendor.name}
                                {vendor.isVerified ? (
                                    <span className="ml-1 text-primary align-middle" aria-label="Verified">✓</span>
                                ) : null}
                            </h1>
                        </div>
                    </div>

                    <div className="px-3 mt-2 space-y-2">
                        <p className="text-[12px] text-text-secondary font-medium flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-0.5 tabular-nums">
                                <Star size={11} className="text-primary fill-primary" />
                                {vendor.rating}
                                {vendor.totalRatings ? (
                                    <span className="text-text-muted">({vendor.totalRatings.toLocaleString('en-IN')})</span>
                                ) : null}
                            </span>
                            {vendor.productCount ? (
                                <>
                                    <span className="text-divider">·</span>
                                    <span className="tabular-nums">{vendor.productCount.toLocaleString('en-IN')}+ products</span>
                                </>
                            ) : null}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {vendor.creditEnabled && (
                                <span className="inline-flex items-center gap-1 bg-ivory border border-divider text-text text-[10px] font-semibold px-2 py-1 rounded-full">
                                    <CreditCard size={10} className="text-primary" strokeWidth={2.5} />
                                    Credit
                                </span>
                            )}
                            <span className="inline-flex items-center bg-ivory border border-divider text-text text-[10px] font-semibold px-2 py-1 rounded-full tabular-nums">
                                MOV ₹{vendor.minOrderValue.toLocaleString('en-IN')}
                            </span>
                            <span className="inline-flex items-center gap-1 bg-ivory border border-divider text-text text-[10px] font-semibold px-2 py-1 rounded-full">
                                <Clock size={10} className="text-primary" />
                                {vendor.deliverySchedule || 'Next day'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Operational Action Pills (below hero) */}
                <div className="grid grid-cols-4 w-48 mx-auto mt-2 mb-1 relative z-20">
                    <button type="button" className="hidden">
                        <Navigation size={15} className="text-primary" strokeWidth={2} />
                        Directions
                    </button>
                    <button type="button" className="size-10 mx-auto rounded-lg text-primary hover:bg-ivory transition-colors flex items-center justify-center" aria-label="Call vendor">
                        <Phone size={16} className="text-primary" strokeWidth={2} />
                    </button>
                    <button type="button" onClick={handleShare} className="size-10 mx-auto rounded-lg text-primary hover:bg-ivory transition-colors flex items-center justify-center" aria-label="Share vendor">
                        <Share2 size={16} className="text-primary" strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        onClick={handleMyListsClick}
                        className="size-10 mx-auto rounded-lg text-primary hover:bg-ivory transition-colors flex items-center justify-center"
                        aria-label="My lists"
                    >
                        <ClipboardList size={15} className="text-primary" strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setDealsOpen(true)}
                        className="size-10 mx-auto rounded-lg text-primary hover:bg-ivory transition-colors flex items-center justify-center"
                        aria-label="Store deals"
                    >
                        <Tag size={15} strokeWidth={2} className="text-primary" />
                        {storePromos.length > 0 && (
                            <span className="absolute sr-only">
                                {storePromos.length}
                            </span>
                        )}
                    </button>
                </div>

                {storePromos.length > 0 && (
                    <div className="mt-2 px-3 flex gap-2 overflow-x-auto no-scrollbar">
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
                <div className="grid grid-cols-4 border-b border-divider overflow-hidden">
                    {[
                        { key: 'all', label: 'Catalog' },
                        { key: 'orders', label: 'My Orders' },
                        { key: 'ratings', label: 'Ratings' },
                        { key: 'about', label: 'Info' }
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => onTabChange(tab.key)}
                            className={cn(
                                "min-w-0 px-1 pb-2 pt-1 text-[10px] font-semibold text-center transition-colors relative",
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
                        <button type="button" onClick={handleShare} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-ivory border border-divider text-xs font-semibold text-text hover:bg-primary-light hover:border-primary/40 hover:text-primary transition-all" aria-label="Share vendor">
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
