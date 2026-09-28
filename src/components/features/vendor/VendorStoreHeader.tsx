'use client';

import React, { useState } from 'react';
import { Star, MapPin, Phone, ChevronLeft, ClipboardList, CreditCard, Clock, Megaphone, Tag } from 'lucide-react';
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
    
    const handleMyListsClick = (e: React.MouseEvent) => {
        if (!isLoggedIn) {
            e.preventDefault();
            toast.error('Please log in to view your order lists');
            return;
        }
        router.push(`/order-lists?vendorId=${vendor.id}`);
    };

    const shareContent = vendorShareContent({
        id: vendor.id,
        name: vendor.name,
        image: vendor.logo || vendor.coverImage || null,
    });

    const startOrdering = () => {
        onTabChange('all');
        setTimeout(() => {
            window.scrollTo({ top: window.innerHeight * 0.45, behavior: 'smooth' });
        }, 50);
    };

    return (
        <div className="w-full bg-white md:pb-6">
            <div className="hidden md:block max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] pt-4">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="inline-flex size-10 items-center justify-center rounded-full border border-divider bg-white text-primary shadow-sm"
                    aria-label="Back"
                >
                    <ChevronLeft size={20} strokeWidth={2.5} />
                </button>
            </div>

            {heroSlides.length > 0 ? (
                <Hero slides={heroSlides} chrome="page" heading="h2" />
            ) : null}

            {/* ── MOBILE — name and actions sit under the slider ── */}
            <div className="block md:hidden">
                <div className="px-3 pt-3 flex items-end gap-3">
                    <div className="flex h-16 max-w-[148px] shrink-0 items-center rounded-[14px] bg-white border border-divider px-2 shadow-sm">
                        {logoSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoSrc} alt={vendor.name} className="h-12 w-auto max-w-full object-contain" />
                        ) : (
                            <div className="relative size-12">
                                <Image src={coverSrc} alt={vendor.name} fill className="object-cover" priority />
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 flex-1 pb-1.5">
                        <div className="flex items-center gap-1.5">
                            <h1 className="min-w-0 flex-1 text-[16px] font-semibold text-text leading-none line-clamp-1">
                                {vendor.name}
                                {vendor.isVerified ? (
                                    <span className="ml-1 text-primary align-middle" aria-label="Verified">✓</span>
                                ) : null}
                            </h1>
                            <div className="flex items-center gap-1 shrink-0 mt-1">
                                <ShareButton content={shareContent} variant="icon" className="size-9" />
                                <button
                                    type="button"
                                    onClick={() => onTabChange('about')}
                                    className="size-9 rounded-full bg-white border border-divider shadow-sm flex items-center justify-center"
                                    aria-label="Call or contact vendor"
                                >
                                    <Phone size={15} className="text-primary" strokeWidth={2} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <p className="px-3 mt-1 text-[11px] text-text-secondary font-medium flex items-center gap-1 min-w-0 overflow-hidden">
                    <span className="inline-flex items-center gap-0.5 tabular-nums shrink-0">
                        <Star size={11} className="text-primary fill-primary" />
                        {vendor.rating}
                    </span>
                    {vendor.productCount ? (
                        <span className="truncate">
                            <span className="text-text-muted"> · </span>
                            {vendor.productCount.toLocaleString('en-IN')}+ products
                        </span>
                    ) : null}
                    <span className="text-text-muted shrink-0">·</span>
                    {vendor.creditEnabled && (
                        <span className="inline-flex items-center gap-0.5 shrink-0">
                            <CreditCard size={11} className="text-primary" strokeWidth={2} />
                            Credit
                            <span className="text-text-muted"> · </span>
                        </span>
                    )}
                    <span className="tabular-nums shrink-0">MOV ₹{vendor.minOrderValue.toLocaleString('en-IN')}</span>
                    <span className="text-text-muted shrink-0">·</span>
                    <span className="inline-flex items-center gap-0.5 truncate min-w-0">
                        <Clock size={11} className="text-primary shrink-0" />
                        <span className="truncate">{vendor.deliverySchedule || 'Next day'}</span>
                    </span>
                </p>

                <div className="mt-3 px-3 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={startOrdering}
                        className="min-h-12 rounded-xl bg-primary text-white text-[13px] font-semibold"
                    >
                        Start Ordering
                    </button>
                    <button
                        type="button"
                        onClick={() => setDealsOpen(true)}
                        className="min-h-12 rounded-xl border border-divider bg-white text-[13px] font-semibold text-text inline-flex items-center justify-center gap-1.5"
                    >
                        <Tag size={14} strokeWidth={2} />
                        Deals
                        {storePromos.length > 0 ? (
                            <span className="min-w-[1.2rem] h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                                {storePromos.length}
                            </span>
                        ) : null}
                    </button>
                </div>

                {storePromos.length > 0 && (
                    <div className="mt-2 px-3 flex gap-2 overflow-x-auto no-scrollbar">
                        {storePromos.map((p) => (
                            <div
                                key={p.id}
                                className="shrink-0 flex items-center gap-1.5 bg-primary-light border border-primary/20 text-primary px-3 py-1.5 rounded-full text-xs font-semibold"
                            >
                                <Megaphone size={12} className="text-primary" />
                                {p.badgeLabel}
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-center border-b border-divider mt-1">
                    {[
                        { key: 'all', label: 'Catalog' },
                        { key: 'orders', label: 'Orders' },
                        { key: 'ratings', label: 'Ratings' },
                        { key: 'about', label: 'Info' },
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => onTabChange(tab.key)}
                            className={cn(
                                'flex-1 h-8 px-1 text-[12px] font-semibold text-center relative',
                                activeTab === tab.key ? 'text-primary' : 'text-text-muted',
                            )}
                        >
                            {tab.label}
                            {activeTab === tab.key && (
                                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="hidden md:block max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                <div className="flex items-center gap-5 pt-4">
                    <div className="flex h-[88px] max-w-[280px] shrink-0 items-center rounded-xl bg-white border border-divider px-3 shadow-sm">
                        {logoSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoSrc} alt={vendor.name} className="h-[64px] w-auto max-w-full object-contain" />
                        ) : (
                            <div className="relative size-[64px]">
                                <Image src={coverSrc} alt={vendor.name} fill className="object-cover" priority />
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className="bg-ivory border border-divider text-text px-2.5 py-0.5 rounded-md flex items-center gap-1 text-xs font-bold">
                                {vendor.rating} <Star size={11} className="fill-amber-400 text-amber-400" />
                            </span>
                            <span className="bg-ivory border border-divider text-text-secondary text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md">
                                {vendor.deliverySchedule || 'Next day'}
                            </span>
                            {vendor.creditEnabled && (
                                <span className="bg-primary-light text-primary border border-primary/20 text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1">
                                    <CreditCard size={11} strokeWidth={2} /> DiSCCO Credit
                                </span>
                            )}
                        </div>
                        <h1 className="text-[clamp(1.5rem,2vw,2.25rem)] font-bold leading-tight text-text line-clamp-1">
                            {vendor.name}
                        </h1>
                        <p className="text-sm font-medium text-text-secondary mt-1 line-clamp-1">
                            {vendor.categories.slice(0, 3).join(' · ')}
                            {vendor.minOrderValue ? <> <span className="opacity-60">|</span> Min ₹{vendor.minOrderValue}</> : null}
                        </p>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={startOrdering}
                        className="min-h-12 px-5 rounded-xl bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark"
                    >
                        Start Ordering
                    </button>
                    <button
                        type="button"
                        onClick={() => setDealsOpen(true)}
                        className="min-h-12 px-5 rounded-xl border border-divider bg-white text-[13px] font-semibold text-text inline-flex items-center gap-2 hover:bg-ivory"
                    >
                        <Tag size={14} strokeWidth={2} />
                        Deals &amp; Coupons
                        {storePromos.length > 0 && (
                            <span className="min-w-[1.2rem] h-5 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                                {storePromos.length}
                            </span>
                        )}
                    </button>
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
                        <ShareButton content={shareContent} variant="chip" label="Share" />
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
