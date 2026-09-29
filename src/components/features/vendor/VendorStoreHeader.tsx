'use client';

import React, { useState } from 'react';
import {
    Star,
    MapPin,
    Phone,
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
import type { Address, StoreHeroSlide, StorePromotion, Vendor } from '@/types';
import { PLACEHOLDERS } from '@/lib/constants';
import { parseImageMeta, supplierLogoSrc } from '@/lib/imageMeta';
import { OffersSheet } from '@/components/features/promo/OffersSheet';
import { Hero, type HeroContent } from '@/components/features/Hero';

function formatVendorAddress(address?: Address): string {
    if (!address) return '';
    const parts = [address.line1, address.line2, address.city, address.state, address.postalCode || address.pincode]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part));
    const unique: string[] = [];
    for (const part of parts) {
        const folded = part.toLowerCase();
        if (unique.some((prev) => prev.toLowerCase().includes(folded))) continue;
        unique.push(part);
    }
    return unique.join(', ');
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
                    <span className="flex items-center gap-1 rounded-full border border-white/30 bg-white/20 backdrop-blur-xs px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-white">
                        <Clock size={11} /> {vendor.deliverySchedule || 'Next day'}
                    </span>
                    {vendor.minOrderValue <= 0 ? (
                        <span className="rounded-full border border-emerald-400/40 bg-emerald-500/25 backdrop-blur-xs px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200">
                            No Min. Order
                        </span>
                    ) : (
                        <span className="rounded-full border border-white/30 bg-white/20 backdrop-blur-xs px-2.5 py-0.5 text-[11px] font-semibold text-white">
                            Min. ₹{vendor.minOrderValue.toLocaleString('en-IN')}
                        </span>
                    )}
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
                {vendor.categories.length > 0 ? (
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
    const addressLabel = formatVendorAddress(vendor.address);
    
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

            {/* Mobile identity card - elevates over the banner for depth and polish */}
            <div className="md:hidden relative z-20 px-3 -mt-6">
                <div className="rounded-2xl bg-white p-3.5 shadow-[0_4px_20px_rgba(37,24,0,0.07)] border border-divider/70">
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
                                onClick={() => onTabChange('about')}
                                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-light hover:bg-primary/20 border border-primary/20 text-primary transition-all active:scale-90 shadow-2xs"
                                aria-label="Call or view vendor info"
                                title="Vendor Info & Contact"
                            >
                                <Phone size={13} strokeWidth={2.25} />
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
                            <span className="truncate max-w-[125px]">{vendor.deliverySchedule || 'Next day'}</span>
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
            </div>

            <div className="hidden md:block max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                <div className="mt-1 flex flex-wrap gap-2">
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
                <div className="flex items-center justify-between gap-3 px-1 pt-4 pb-3 border-b border-divider">
                    {addressLabel ? (
                        <div className="flex items-center gap-2 min-w-0">
                            <MapPin size={16} className="text-primary shrink-0" strokeWidth={2} />
                            <span className="text-xs md:text-sm font-medium text-text-secondary truncate">
                                {addressLabel}
                            </span>
                        </div>
                    ) : null}

                    <div className="flex items-center gap-2 shrink-0 ml-auto">
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
