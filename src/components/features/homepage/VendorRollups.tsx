'use client';

import React, { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, MapPin, Bookmark, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useAddress } from '@/context/AddressContext';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import type { Vendor } from '@/types';

const VENDOR_COVERS = [
    '/images/vendors/chad-peltola-BTvQ2ET_iKc-unsplash.webp',
    '/images/vendors/eryka-ragna-K5dvZHBJp3k-unsplash.webp',
    '/images/vendors/gioia-m-EGjfIKl_ZvE-unsplash.webp',
    '/images/vendors/kylle-pangan-LjpD-uW4dH0-unsplash.webp',
    '/images/vendors/m-veven-4oHtqbwy7Lo-unsplash.webp',
    '/images/vendors/sleeba-thomas-h-T2VPkw9Kw-unsplash.webp',
    '/images/vendors/young-kane-kSDOJRNol9E-unsplash.webp',
];

function VendorCard({ vendor, index }: { vendor: Vendor; index: number }) {
    const cover = VENDOR_COVERS[index % VENDOR_COVERS.length];
    const categoryPills = vendor.categories.slice(0, 4);
    const addressLine = vendor.address ? `${vendor.address.city}${vendor.address.state ? ', ' + vendor.address.state : ''}` : null;

    return (
        <Link
            href={`/vendor/${vendor.id}`}
            className="flex-none w-[260px] md:w-[300px] bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:-translate-y-1.5 transition-transform duration-300 group"
        >
            <div className="relative w-full h-[180px] md:h-[200px] overflow-hidden">
                <Image src={cover} alt={vendor.name} fill sizes="(max-width: 768px) 260px, 300px" className="object-cover" />
            </div>
            <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-[17px] md:text-[19px] font-extrabold text-[#111] line-clamp-1 leading-tight">{vendor.name}</h3>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="shrink-0 mt-0.5 text-gray-400 hover:text-[#53B175] transition-colors">
                        <Bookmark size={20} strokeWidth={1.5} />
                    </button>
                </div>
                <div className="flex items-center gap-2 text-[12px] md:text-[13px] text-gray-600 mb-2.5">
                    <div className="flex items-center gap-0.5 bg-[#53B175] text-white rounded-md px-1.5 py-0.5 text-[11px] font-bold shrink-0">
                        {vendor.rating} <Star size={10} fill="white" className="text-white" />
                    </div>
                    {vendor.minOrderValue > 0 && <span className="font-semibold text-gray-500 text-[12px]">MOV ₹{vendor.minOrderValue}</span>}
                </div>
                {categoryPills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2.5 h-[60px] content-start overflow-hidden">
                        {categoryPills.map((cat) => (
                            <span key={cat} className="text-[11px] font-semibold bg-gray-100 text-gray-700 rounded-full px-2.5 py-1">{cat}</span>
                        ))}
                    </div>
                )}
                {addressLine && (
                    <div className="flex items-center gap-1 text-[11px] md:text-[12px] text-gray-500">
                        <MapPin size={11} className="shrink-0 text-gray-500" />
                        <span className="truncate">{addressLine}</span>
                    </div>
                )}
            </div>
        </Link>
    );
}

/** Frequently Ordered Vendors — top N vendors by order count for the logged-in user (last 90 days). */
export function FrequentlyOrderedVendors() {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const { status } = useSession();
    const { selectedAddress } = useAddress();
    // V2.2: prefer the active outlet pincode (logged-in) over legacy selected address.
    // Endpoint here is /vendors?sort=frequent (no pincode filter on the server side),
    // but we keep the resolution centralized so any future filter wires up cleanly.
    const { currentOutlet } = useBusinessAccountSwitcher();
    const pincode = currentOutlet?.pincode ?? selectedAddress?.pincode;

    useEffect(() => {
        if (status !== 'authenticated') return;
        const params = new URLSearchParams({ sort: 'frequent', limit: '10' });
        if (pincode && /^\d{6}$/.test(pincode)) params.set('pincode', pincode);
        fetch(`/api/v1/vendors?${params.toString()}`)
            .then(r => r.json())
            .then(d => setVendors((d.data?.vendors || []).map((v: { id: string; businessName?: string; slug?: string; logoUrl?: string; rating?: number | string; minOrderValue?: number | string; creditEnabled?: boolean; categories?: string[]; bannerUrl?: string }) => ({
                id: v.id,
                name: v.businessName || '',
                slug: v.slug || '',
                logo: v.logoUrl || '',
                rating: Number(v.rating) || 0,
                minOrderValue: Number(v.minOrderValue) || 0,
                creditEnabled: v.creditEnabled || false,
                categories: v.categories || [],
                isActive: true,
                deliverySchedule: '',
                deliveryTime: '',
                totalRatings: 0,
                coverImage: v.bannerUrl || '',
                description: '',
            }))))
            .catch(() => setVendors([]));
    }, [status, pincode]);

    const checkScroll = () => {
        if (scrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
            setCanScrollLeft(scrollLeft > 5);
            setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
        }
    };

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' });
            setTimeout(checkScroll, 350);
        }
    };

    if (vendors.length === 0) return null;

    return (
        <section className="w-full py-6 bg-white overflow-hidden">
            <div className="max-w-[var(--container-max)] mx-auto">
                <div className="flex items-center justify-between mb-6 px-6 md:px-[var(--container-padding)]">
                    <h2 className="text-[18px] md:text-[22px] lg:text-[24px] font-[900] text-[#181725] tracking-tight flex items-center gap-2">
                        <TrendingUp size={22} className="text-[#53B175]" />
                        Frequently Ordered
                    </h2>
                    <Link href="/vendors?sort=frequent" className="flex items-center gap-1 text-[#53B175] font-black text-sm hover:gap-2 transition-all cursor-pointer group">
                        See All
                        <ChevronRight size={14} strokeWidth={3} className="group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                </div>
                <div className="relative w-full">
                    <button onClick={() => scroll('left')} disabled={!canScrollLeft}
                        className="hidden md:flex absolute -left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white rounded-full shadow-[0_10px_30px_-5px_rgba(0,0,0,0.15)] items-center justify-center hover:scale-110 active:scale-95 transition-all border border-gray-100 disabled:opacity-20 disabled:cursor-not-allowed">
                        <ChevronLeft size={24} className="text-[#181725]" strokeWidth={2.5} />
                    </button>
                    <div ref={scrollRef} onScroll={checkScroll} className="overflow-x-auto no-scrollbar scroll-smooth w-full">
                        <div className="flex gap-4 md:gap-6 py-4 px-6 md:px-[var(--container-padding)] w-max">
                            {vendors.map((vendor, index) => (
                                <VendorCard key={vendor.id} vendor={vendor} index={index} />
                            ))}
                        </div>
                    </div>
                    <button onClick={() => scroll('right')} disabled={!canScrollRight}
                        className="hidden md:flex absolute -right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white rounded-full shadow-[0_10px_30px_-5px_rgba(0,0,0,0.15)] items-center justify-center hover:scale-110 active:scale-95 transition-all border border-gray-100 disabled:opacity-20 disabled:cursor-not-allowed">
                        <ChevronRight size={24} className="text-[#181725]" strokeWidth={2.5} />
                    </button>
                </div>
            </div>
        </section>
    );
}

/** Top Rated Vendors — vendors with rating >= 4.5 AND orderCount >= 10, filtered by serviceability. */
export function TopRatedVendors() {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const { selectedAddress } = useAddress();
    // V2.2: prefer the active outlet pincode (logged-in) over legacy selected address.
    const { currentOutlet } = useBusinessAccountSwitcher();
    const pincode = currentOutlet?.pincode ?? selectedAddress?.pincode;

    useEffect(() => {
        const params = new URLSearchParams({ sort: 'rating', limit: '10' });
        if (pincode) params.set('pincode', pincode);
        fetch(`/api/v1/vendors?${params}`)
            .then(r => r.json())
            .then(d => setVendors((d.data?.vendors || []).map((v: { id: string; businessName?: string; slug?: string; logoUrl?: string; rating?: number | string; minOrderValue?: number | string; creditEnabled?: boolean; categories?: string[]; bannerUrl?: string }) => ({
                id: v.id,
                name: v.businessName || '',
                slug: v.slug || '',
                logo: v.logoUrl || '',
                rating: Number(v.rating) || 0,
                minOrderValue: Number(v.minOrderValue) || 0,
                creditEnabled: v.creditEnabled || false,
                categories: v.categories || [],
                isActive: true,
                deliverySchedule: '',
                deliveryTime: '',
                totalRatings: 0,
                coverImage: v.bannerUrl || '',
                description: '',
            }))))
            .catch(() => setVendors([]));
    }, [pincode]);

    const checkScroll = () => {
        if (scrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
            setCanScrollLeft(scrollLeft > 5);
            setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
        }
    };

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' });
            setTimeout(checkScroll, 350);
        }
    };

    if (vendors.length === 0) return null;

    return (
        <section className="w-full py-8 overflow-hidden">
            {/* 3D card CSS */}
            <style>{`
                .tr-card-parent { perspective: 1000px; }
                .tr-card {
                    padding-top: 44px;
                    border: 1.5px solid #b2dfc3;
                    transform-style: preserve-3d;
                    background:
                        linear-gradient(135deg, transparent 18.75%, rgba(83,177,117,0.10) 0 31.25%, transparent 0),
                        repeating-linear-gradient(45deg, rgba(83,177,117,0.09) -6.25% 6.25%, #f0faf4 0 18.75%);
                    background-size: 50px 50px;
                    background-color: #f0faf4;
                    width: 100%;
                    box-shadow: rgba(83,177,117,0.18) 0px 20px 24px -8px;
                    transition: all 0.5s ease-in-out;
                }
                .tr-card:hover {
                    background-position: -80px 80px, -80px 80px;
                    transform: rotate3d(0.5, 1, 0, 25deg);
                    box-shadow: rgba(83,177,117,0.32) 0px 32px 36px -8px;
                }
                .tr-content {
                    background: #53B175;
                    transform-style: preserve-3d;
                    transition: all 0.5s ease-in-out;
                    padding: 14px 16px 16px 16px;
                    /* Equal-height cards: flex column with min-height + CTA pinned to bottom. */
                    display: flex;
                    flex-direction: column;
                    min-height: 150px;
                }
                .tr-cta-wrap {
                    margin-top: auto; /* pushes the CTA to the bottom regardless of content above */
                }
                .tr-title {
                    display: block;
                    color: #fff;
                    font-size: 15px;
                    font-weight: 900;
                    line-height: 1.2;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    transition: all 0.5s ease-in-out;
                    transform: translate3d(0, 0, 40px);
                }
                .tr-title:hover { transform: translate3d(0, 0, 55px); }
                .tr-cats {
                    margin-top: 6px;
                    font-size: 10px;
                    font-weight: 700;
                    color: rgba(255,255,255,0.88);
                    transition: all 0.5s ease-in-out;
                    transform: translate3d(0, 0, 25px);
                }
                .tr-cats:hover { transform: translate3d(0, 0, 50px); }
                .tr-cta {
                    cursor: pointer;
                    margin-top: 10px;
                    display: inline-block;
                    font-weight: 900;
                    font-size: 9px;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    color: #53B175;
                    background: #fff;
                    padding: 5px 10px;
                    transition: all 0.5s ease-in-out;
                    transform: translate3d(0, 0, 18px);
                }
                .tr-cta:hover { transform: translate3d(0, 0, 55px); }
                .tr-badge {
                    position: absolute;
                    top: 18px;
                    right: 18px;
                    width: 52px;
                    height: 52px;
                    background: #fff;
                    border: 1.5px solid #b2dfc3;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 2px;
                    transform: translate3d(0, 0, 70px);
                    box-shadow: rgba(83,177,117,0.18) 0px 12px 10px -8px;
                    transition: all 0.5s ease-in-out;
                }
                .tr-badge-rank {
                    display: block;
                    text-align: center;
                    color: #53B175;
                    font-size: 8px;
                    font-weight: 700;
                    letter-spacing: 0.05em;
                }
                .tr-badge-num {
                    display: block;
                    text-align: center;
                    font-size: 18px;
                    font-weight: 900;
                    color: #181725;
                    line-height: 1;
                }
                .tr-logo {
                    position: absolute;
                    top: 14px;
                    left: 16px;
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    overflow: hidden;
                    border: 2px solid #fff;
                    background: #fff;
                    transform: translate3d(0, 0, 60px);
                    box-shadow: rgba(83,177,117,0.22) 0px 6px 12px -4px;
                    transition: all 0.5s ease-in-out;
                }
            `}</style>

            <div className="max-w-[var(--container-max)] mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 px-6 md:px-[var(--container-padding)]">
                    <h2
                        aria-label="Top Rated"
                        className="text-[18px] md:text-[22px] lg:text-[24px] font-black text-[#181725] tracking-tight flex items-center gap-2.5"
                    >
                        <div
                            aria-hidden
                            className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#53B175] to-[#299e60] flex items-center justify-center shadow-md shadow-green-200/50"
                        >
                            <Star size={16} fill="white" className="text-white" />
                        </div>
                        <span>Top Rated</span>
                    </h2>
                    <Link href="/vendors?sort=rating" className="flex items-center gap-1 text-[#53B175] font-black text-sm hover:gap-2 transition-all cursor-pointer group">
                        See All
                        <ChevronRight size={14} strokeWidth={3} className="group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                </div>

                {/* Scrollable cards */}
                <div className="relative w-full">
                    <button onClick={() => scroll('left')} disabled={!canScrollLeft}
                        className="hidden md:flex absolute -left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white rounded-full shadow-[0_10px_30px_-5px_rgba(0,0,0,0.15)] items-center justify-center hover:scale-110 active:scale-95 transition-all border border-gray-100 disabled:opacity-20 disabled:cursor-not-allowed">
                        <ChevronLeft size={24} className="text-[#181725]" strokeWidth={2.5} />
                    </button>
                    <div ref={scrollRef} onScroll={checkScroll} className="overflow-x-auto no-scrollbar scroll-smooth w-full">
                        <div className="flex gap-6 py-6 px-6 md:px-[var(--container-padding)] w-max items-start">
                            {vendors.map((vendor, index) => {
                                const ratingNum = Number(vendor.rating);
                                const cover = VENDOR_COVERS[index % VENDOR_COVERS.length];
                                const rank = index + 1;
                                return (
                                    <Link key={vendor.id} href={`/vendor/${vendor.id}`}
                                        className="tr-card-parent flex-none w-[220px]"
                                    >
                                        <div className="tr-card relative">
                                            {/* Floating logo — top-left */}
                                            <div className="tr-logo">
                                                <Image
                                                    src={vendor.logo || cover}
                                                    alt={vendor.name}
                                                    fill
                                                    sizes="36px"
                                                    className="object-cover"
                                                />
                                            </div>

                                            {/* Floating rank/rating badge — top-right */}
                                            <div className="tr-badge">
                                                <span className="tr-badge-rank">RANK</span>
                                                <span className="tr-badge-num">#{rank}</span>
                                                {ratingNum > 0 && (
                                                    <span className="tr-badge-rank" style={{ fontSize: '9px' }}>
                                                        ★ {ratingNum.toFixed(1)}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Green content box */}
                                            <div className="tr-content">
                                                <span className="tr-title">{vendor.name}</span>
                                                {vendor.categories.length > 0 && (
                                                    <p className="tr-cats">
                                                        {vendor.categories.slice(0, 3).join(' · ')}
                                                    </p>
                                                )}
                                                {vendor.minOrderValue > 0 && (
                                                    <p className="tr-cats">MOV ₹{vendor.minOrderValue}</p>
                                                )}
                                                <div className="tr-cta-wrap">
                                                    <span className="tr-cta">Visit Store →</span>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                    <button onClick={() => scroll('right')} disabled={!canScrollRight}
                        className="hidden md:flex absolute -right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white rounded-full shadow-[0_10px_30px_-5px_rgba(0,0,0,0.15)] items-center justify-center hover:scale-110 active:scale-95 transition-all border border-gray-100 disabled:opacity-20 disabled:cursor-not-allowed">
                        <ChevronRight size={24} className="text-[#181725]" strokeWidth={2.5} />
                    </button>
                </div>
            </div>
        </section>
    );
}
