'use client';

import React, { useState } from 'react';
import {
    Star,
    ClipboardList,
    CreditCard,
    Clock,
    Tag,
    BadgeCheck,
    ShoppingBag,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { toast } from 'sonner';
import { ShareButton } from '@/components/features/share/ShareButton';
import { vendorShareContent } from '@/lib/share-cards/types';
import { useStableSession } from '@/hooks/useStableSession';
import { cn } from '@/lib/utils';
import type { StoreHeroSlide, StorePromotion, Vendor } from '@/types';
import { PLACEHOLDERS } from '@/lib/constants';
import { parseImageMeta, supplierLogoSrc } from '@/lib/imageMeta';
import { OffersSheet } from '@/components/features/promo/OffersSheet';
import { Hero, type HeroContent } from '@/components/features/Hero';

function WhatsAppGlyph({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
            <path
                fill="currentColor"
                d="M12.04 2C6.58 2 2.15 6.4 2.15 11.84c0 1.74.46 3.44 1.33 4.94L2 22l5.37-1.4a10.1 10.1 0 0 0 4.67 1.14h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2zm5.76 14.16c-.24.68-1.4 1.25-1.94 1.33-.5.07-1.13.1-1.83-.11-.42-.14-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.93-4.36-.14-.2-1.16-1.54-1.16-2.94 0-1.4.73-2.08.99-2.36.26-.28.57-.35.76-.35h.55c.18 0 .42-.07.65.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.1.2-.14.31-.28.48-.14.16-.3.37-.42.5-.14.14-.29.29-.12.56.16.28.73 1.2 1.56 1.95 1.08.96 1.98 1.26 2.26 1.4.28.14.44.12.6-.07.16-.2.7-.81.88-1.09.18-.28.37-.23.61-.14.24.1 1.54.73 1.8.86.26.14.44.2.5.31.07.12.07.68-.17 1.36z"
            />
        </svg>
    );
}

function toHeroSlides(slides: StoreHeroSlide[] | undefined): HeroContent[] {
    return (slides ?? [])
        .filter((slide) => slide.desktopImageUrl || slide.mobileImageUrl)
        .map((slide) => {
            const desktop = slide.desktopImageUrl || slide.mobileImageUrl || undefined;
            const mobile = slide.mobileImageUrl || slide.desktopImageUrl || undefined;
            return {
                id: slide.id,
                eyebrow: slide.eyebrow,
                headline: slide.headline,
                ctaLabel: slide.ctaLabel,
                ctaHref: slide.ctaHref,
                showText: slide.showText,
                showCta: slide.showCta,
                copyAlignX: slide.copyAlignX,
                copyAlignY: slide.copyAlignY,
                copyOffsetX: slide.copyOffsetX,
                copyOffsetY: slide.copyOffsetY,
                showTextMobile: slide.showTextMobile,
                showCtaMobile: slide.showCtaMobile,
                copyAlignXMobile: slide.copyAlignXMobile,
                copyAlignYMobile: slide.copyAlignYMobile,
                copyOffsetXMobile: slide.copyOffsetXMobile,
                copyOffsetYMobile: slide.copyOffsetYMobile,
                desktopImageUrl: desktop,
                mobileImageUrl: mobile,
            };
        });
}

function formatDeliveryDate(nextDeliveryDate?: string | null): string {
    if (!nextDeliveryDate) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' }).replace(/,/g, '');
    }
    const [y, m, d] = nextDeliveryDate.split('-').map(Number);
    if (!y || !m || !d) return nextDeliveryDate;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' }).replace(/,/g, '');
}

function StoreBannerIdentity({
    vendor,
    logoSrc,
    coverSrc,
    scrim,
}: {
    vendor: Vendor;
    logoSrc: string;
    coverSrc: string;
    scrim: boolean;
}) {
    const hasRating = vendor.rating && Number(vendor.rating) > 0;
    return (
        <div
            className={cn(
                'pointer-events-none absolute inset-0 z-10 hidden items-center gap-4 rounded-[20px] px-6 md:flex',
                scrim
                    ? 'bg-gradient-to-r from-black/85 via-black/45 to-transparent'
                    : 'bg-gradient-to-r from-black/75 via-black/35 to-transparent',
            )}
        >
            <div className="flex h-[80px] w-[80px] shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-cdl-2 ring-2 ring-white/20">
                {logoSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoSrc} alt={vendor.name} className="h-full w-full object-contain" />
                ) : (
                    <div className="relative size-full rounded-xl overflow-hidden">
                        <Image src={coverSrc} alt="" fill className="object-cover" />
                    </div>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    {hasRating ? (
                        <span className="flex items-center gap-1 rounded-full border border-white/30 bg-white/20 backdrop-blur-xs px-2.5 py-0.5 text-xs font-bold text-white">
                            <Star size={11} className="fill-amber-400 text-amber-400" /> {vendor.rating}
                        </span>
                    ) : null}
                    {vendor.creditEnabled ? (
                        <span className="flex items-center gap-1 rounded-full border border-purple-300/40 bg-purple-500/25 backdrop-blur-xs px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-purple-200">
                            <CreditCard size={11} strokeWidth={2} /> DiSCCO Credit
                        </span>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    <h1 className="line-clamp-1 text-[clamp(1.5rem,2.2vw,2.25rem)] font-extrabold leading-tight text-white tracking-tight drop-shadow-sm">
                        {vendor.name}
                    </h1>
                    {vendor.isVerified ? (
                        <span className="inline-flex items-center text-blue-400 shrink-0" title="Verified Supplier">
                            <BadgeCheck size={22} className="fill-blue-500 text-white" />
                        </span>
                    ) : null}
                </div>
                {vendor.categories && vendor.categories.length > 0 ? (
                    <p className="mt-1 line-clamp-1 text-sm font-medium text-white/85">
                        {vendor.categories.slice(0, 4).join(' · ')}
                    </p>
                ) : null}
            </div>
        </div>
    );
}

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
    const heroSlides = toHeroSlides(vendor.heroSlides);
    const logoSrc = vendor.logo ? supplierLogoSrc(vendor.logo) : '';
    const coverSrc = parseImageMeta(vendor.coverImage || PLACEHOLDERS.vendor).src;
    const deliveryDateDisplay = formatDeliveryDate(vendor.nextDeliveryDate);
    
    const handleMyListsClick = (e: React.MouseEvent) => {
        if (!isLoggedIn) {
            e.preventDefault();
            toast.error('Please log in to view your order lists');
            return;
        }
        router.push(`/order-lists?vendorId=${vendor.id}`);
    };

    const handleWhatsAppClick = () => {
        const rawPhone = vendor.phone || (vendor as { user?: { phone?: string } })?.user?.phone;
        if (!rawPhone || !rawPhone.trim()) {
            toast.error(`WhatsApp contact is not available for ${vendor.name}`);
            return;
        }
        const phone = rawPhone.trim();
        const digits = phone.replace(/[^0-9]/g, '');
        const cleanPhone = digits.length === 10 ? `91${digits}` : digits;
        const text = encodeURIComponent(`Hi ${vendor.name}, I am contacting you from Horeca1.`);
        const waUrl = `https://wa.me/${cleanPhone}?text=${text}`;

        try {
            window.open(waUrl, '_blank', 'noopener,noreferrer');
        } catch {
            window.location.href = waUrl;
        }
    };

    const shareContent = vendorShareContent({
        id: vendor.id,
        slug: vendor.slug,
        name: vendor.name,
        image: vendor.coverImage || vendor.logo || null,
    });

    return (
        <div className="w-full md:bg-white md:pb-6">
            {heroSlides.length > 0 ? (
                <Hero
                    slides={heroSlides}
                    chrome="page"
                    heading="h2"
                    overlay={(
                        <StoreBannerIdentity
                            vendor={vendor}
                            logoSrc={logoSrc}
                            coverSrc={coverSrc}
                            scrim
                        />
                    )}
                />
            ) : (
                <section className="w-full pt-2 pb-2 md:pt-3 md:pb-4">
                    <div className="mx-auto max-w-[var(--container-max)] px-3 md:px-[var(--container-padding)]">
                        <div className="relative h-[160px] sm:h-[190px] md:h-[240px] overflow-hidden rounded-2xl md:rounded-[20px] bg-[#4A141F] shadow-cdl-1 md:shadow-cdl-2">
                            {coverSrc ? (
                                <Image
                                    src={coverSrc}
                                    alt={vendor.name}
                                    fill
                                    priority
                                    className="object-cover"
                                />
                            ) : null}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/20 to-transparent md:hidden" />
                            <StoreBannerIdentity
                                vendor={vendor}
                                logoSrc={logoSrc}
                                coverSrc={coverSrc}
                                scrim={false}
                            />
                        </div>
                    </div>
                </section>
            )}

            {/* Mobile identity sheet - full-width sheet overlapping the banner */}
            <div className="md:hidden relative z-20 -mt-6 w-full bg-white rounded-t-3xl pt-4 px-4 pb-2.5 border-t border-divider/60 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                {/* Top: Avatar, Name, Verified, Actions */}
                <div className="flex items-start gap-3">
                        <div className="relative size-14 shrink-0 rounded-xl overflow-hidden bg-white p-1 border border-divider shadow-xs ring-2 ring-white flex items-center justify-center">
                            {logoSrc ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logoSrc} alt={vendor.name} className="h-full w-full object-contain" />
                            ) : (
                                <div className="relative size-full rounded-lg overflow-hidden">
                                    <Image src={coverSrc} alt={vendor.name} fill className="object-cover" />
                                </div>
                            )}
                        </div>

                        <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex items-center gap-1.5">
                                <h1 className="text-[15px] font-bold text-text tracking-tight leading-snug line-clamp-2">
                                    {vendor.name}
                                </h1>
                                {vendor.isVerified ? (
                                    <span className="inline-flex items-center shrink-0" title="Verified Supplier">
                                        <BadgeCheck size={16} className="fill-blue-500 text-white" />
                                    </span>
                                ) : null}
                            </div>
                            <p className="text-[11px] font-medium text-text-secondary truncate mt-0.5">
                                {vendor.categories && vendor.categories.length > 0
                                    ? vendor.categories.slice(0, 3).join(' • ')
                                    : 'Verified B2B HoReCa Supplier'}
                            </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                            <ShareButton
                                content={shareContent}
                                variant="icon"
                                className="size-8 rounded-full bg-[#FAF7F2] hover:bg-gray-100 border border-divider text-text-secondary flex items-center justify-center transition-all active:scale-90 shadow-2xs"
                            />
                            <button
                                type="button"
                                onClick={handleWhatsAppClick}
                                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#FAF7F2] hover:bg-emerald-50 border border-divider hover:border-emerald-200 text-[#25D366] transition-all active:scale-90 shadow-2xs"
                                aria-label={`Chat with ${vendor.name} on WhatsApp`}
                                title={`Chat with ${vendor.name} on WhatsApp`}
                            >
                                <WhatsAppGlyph className="size-4" />
                            </button>
                        </div>
                    </div>

                    {/* Middle: Micro-Stats Row */}
                    <div className="mt-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                        {vendor.rating && Number(vendor.rating) > 0 ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50/90 border border-amber-200/80 px-2 py-0.5 text-[10.5px] font-bold text-amber-900">
                                <Star size={10.5} className="fill-amber-400 text-amber-500" />
                                <span>{vendor.rating}</span>
                                {vendor.totalRatings ? (
                                    <span className="font-normal text-amber-700">({vendor.totalRatings})</span>
                                ) : null}
                            </span>
                        ) : null}

                        {vendor.productCount ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FAF7F2] border border-divider px-2 py-0.5 text-[10.5px] font-medium text-text-secondary">
                                <ShoppingBag size={10.5} className="text-text-muted" />
                                <span>{vendor.productCount.toLocaleString('en-IN')}+ items</span>
                            </span>
                        ) : null}

                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FAF7F2] border border-divider px-2 py-0.5 text-[10.5px] font-medium text-text-secondary">
                            {vendor.minOrderValue <= 0 ? (
                                <span className="text-emerald-700 font-semibold">No Min. Order</span>
                            ) : (
                                <span>Min. ₹{vendor.minOrderValue.toLocaleString('en-IN')}</span>
                            )}
                        </span>

                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50/80 border border-blue-200/60 px-2 py-0.5 text-[10.5px] font-medium text-blue-900">
                            <Clock size={10.5} className="text-blue-600 shrink-0" />
                            <span className="truncate max-w-[125px]">{deliveryDateDisplay}</span>
                        </span>

                        {vendor.creditEnabled ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-purple-50 border border-purple-200/70 px-2 py-0.5 text-[10.5px] font-semibold text-purple-800">
                                <CreditCard size={10.5} className="text-purple-600" />
                                Credit
                            </span>
                        ) : null}

                        {storePromos.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => setDealsOpen(true)}
                                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-primary-light to-[#fce4ec] border border-primary/30 px-2.5 py-0.5 text-[10.5px] font-bold text-primary active:scale-95 shadow-2xs"
                            >
                                <Tag size={10} className="fill-primary/20 text-primary" strokeWidth={2.5} />
                                <span>{storePromos.length} {storePromos.length === 1 ? 'Deal' : 'Deals'}</span>
                                <span className="text-[10px]">&rsaquo;</span>
                            </button>
                        ) : null}
                    </div>

                    {/* Bottom: Modern Segmented Navigation Tabs (commented out for now) */}
                    {/*
                    <div className="mt-3 pt-2.5 border-t border-divider/70">
                        <div className="grid grid-cols-4 gap-1 p-0.5 rounded-xl bg-[#F6F3EE] border border-divider/60">
                            {[
                                { key: 'all', label: 'Catalog' },
                                { key: 'orders', label: 'Orders' },
                                { key: 'ratings', label: 'Ratings' },
                                { key: 'about', label: 'Info' },
                            ].map((tab) => {
                                const isActive = activeTab === tab.key || (activeTab === 'all' && tab.key === 'all');
                                return (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => onTabChange(tab.key)}
                                        className={cn(
                                            'h-8.5 rounded-lg text-[12px] font-semibold transition-all duration-150 flex items-center justify-center active:scale-98',
                                            isActive
                                                ? 'bg-primary text-white shadow-xs font-bold'
                                                : 'text-text-muted hover:text-text hover:bg-white/60'
                                        )}
                                    >
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    */}
                </div>

            <div className="hidden md:block max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                {/* Desktop Action Band: Deals, Quick Order List, Share, Call Vendor, MOV, Next Delivery */}
                <div className="pt-3 pb-1">
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-[#FAF7F2] border border-divider/80 shadow-[0_2px_8px_rgba(37,24,0,0.03)]">
                        {/* Left: Action Buttons */}
                        <div className="flex items-center flex-wrap gap-2.5">
                            {/* 1. Deals & Coupons */}
                            <button
                                type="button"
                                onClick={() => setDealsOpen(true)}
                                className="h-10 px-4 rounded-xl border border-primary/30 bg-white text-xs font-bold text-primary inline-flex items-center gap-2 hover:bg-primary-light/60 hover:border-primary/50 transition-all shadow-2xs active:scale-98 cursor-pointer"
                                title="View Deals & Coupons"
                            >
                                <Tag size={14} strokeWidth={2.25} className="text-primary" />
                                <span>Deals &amp; Coupons</span>
                                {storePromos.length > 0 && (
                                    <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center">
                                        {storePromos.length}
                                    </span>
                                )}
                            </button>

                            {/* 2. Quick Order List */}
                            <button
                                type="button"
                                onClick={handleMyListsClick}
                                className="h-10 px-4 rounded-xl border border-divider bg-white text-xs font-semibold text-text inline-flex items-center gap-2 hover:bg-[#FAF5EE] hover:border-primary/30 hover:text-primary transition-all shadow-2xs active:scale-98 cursor-pointer"
                                title="Quick Order List"
                            >
                                <ClipboardList size={14} strokeWidth={2} className="text-text-secondary" />
                                <span>Quick Order List</span>
                            </button>

                            {/* 3. Share */}
                            <ShareButton
                                content={shareContent}
                                variant="chip"
                                label="Share"
                                className="h-10 px-4 rounded-xl border border-divider bg-white text-xs font-semibold text-text inline-flex items-center gap-2 hover:bg-[#FAF5EE] hover:border-primary/30 hover:text-primary transition-all shadow-2xs active:scale-98 cursor-pointer"
                            />

                            {/* 4. WhatsApp */}
                            <button
                                type="button"
                                onClick={handleWhatsAppClick}
                                className="size-10 rounded-xl border border-divider bg-white text-[#25D366] inline-flex items-center justify-center hover:bg-emerald-50 hover:border-emerald-300 transition-all shadow-2xs active:scale-98 cursor-pointer"
                                aria-label={`Chat with ${vendor.name} on WhatsApp`}
                                title={`Chat with ${vendor.name} on WhatsApp`}
                            >
                                <WhatsAppGlyph className="size-5" />
                            </button>
                        </div>

                        {/* Right: MOV & Next Delivery */}
                        <div className="flex items-center flex-wrap gap-2 shrink-0">
                            {/* Min Order Value */}
                            <div className="h-10 px-3.5 rounded-xl border border-divider bg-white text-xs inline-flex items-center gap-1.5 shadow-2xs whitespace-nowrap">
                                <span className="font-semibold text-text-secondary">Min. order value:</span>
                                <span className="font-bold text-emerald-700">
                                    {vendor.minOrderValue <= 0 ? 'Rs. 0' : `Rs. ${vendor.minOrderValue.toLocaleString('en-IN')}`}
                                </span>
                            </div>

                            {/* Next Delivery */}
                            <div className="h-10 px-3.5 rounded-xl border border-divider bg-white text-xs inline-flex items-center gap-1.5 shadow-2xs whitespace-nowrap">
                                <span className="font-semibold text-text-secondary">Next delivery:</span>
                                <span className="font-bold text-emerald-700">
                                    {deliveryDateDisplay}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── TABS (commented out for now) ── */}
                {/*
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
                */}
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
