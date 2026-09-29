'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag, BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseImageMeta, getDisplayStyle } from '@/lib/imageMeta';
import { ShareButton } from '@/components/features/share/ShareButton';
import { brandShareContent } from '@/lib/share-cards/types';

interface BrandStoreCardProps {
    name: string;
    slug: string;
    logoUrl?: string;
    productImages?: string[];
    categories?: string[];
    bgColor?: string;
    productCount?: number;
    className?: string;
}

export function BrandStoreCard({
    name,
    slug,
    logoUrl,
    productImages = [],
    categories = [],
    bgColor = '#6B1D2E',
    productCount,
    className,
}: BrandStoreCardProps) {
    const { src: img, meta: imgMeta } = parseImageMeta(productImages[0]);
    const imgStyle = getDisplayStyle(imgMeta);
    const { src: logoSrc, meta: logoMeta } = parseImageMeta(logoUrl);
    const logoStyle = getDisplayStyle(logoMeta);
    const cover = img || logoSrc;
    const categoryLine = categories.slice(0, 2).join(' · ');
    const shareContent = brandShareContent({
        slug,
        name,
        image: logoSrc || cover || null,
    });

    return (
        <Link
            href={`/brand/${slug}`}
            className={cn(
                'group relative isolate flex flex-col justify-between overflow-hidden',
                'h-[235px] md:h-[260px] w-full rounded-2xl',
                'bg-white border border-black/[0.06] shadow-cdl-1 hover:shadow-cdl-2 hover:-translate-y-1',
                'transition-all duration-300',
                className,
            )}
        >
            {/* Background Image / Cover */}
            <div className="absolute inset-0" style={{ backgroundColor: bgColor || '#6B1D2E' }}>
                {cover ? (
                    <Image
                        src={cover}
                        alt={name}
                        fill
                        unoptimized
                        className="object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                        style={img ? imgStyle : logoStyle}
                    />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary-dark" />
                )}
            </div>

            {/* Dark scrim only along the bottom so the photo stays bright on top */}
            <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black/85 via-black/35 to-transparent pointer-events-none" />

            <div className="relative z-10 p-2.5 flex items-start justify-end">
                <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                    <ShareButton
                        content={shareContent}
                        variant="icon"
                        className="size-7.5 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-md text-white border border-white/20 flex items-center justify-center transition-all active:scale-90 shadow-xs"
                    />
                </div>
            </div>

            {/* Bottom Info: Title + Category + Product Count Pill */}
            <div className="relative z-10 p-3 pt-0 text-white mt-auto">
                <h3 className="text-[13px] md:text-[14px] font-bold leading-snug line-clamp-2 !text-white text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] tracking-tight">
                    {name}
                    <span className="inline-flex items-center text-blue-400 ml-1 align-baseline translate-y-[1px]" title="Verified Brand">
                        <BadgeCheck size={13} className="fill-blue-500 text-white inline" />
                    </span>
                </h3>

                {categoryLine ? (
                    <p className="text-[11px] text-white/80 font-medium leading-tight line-clamp-1 mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                        {categoryLine}
                    </p>
                ) : null}

                {typeof productCount === 'number' && productCount > 0 ? (
                    <div className="mt-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/20 backdrop-blur-md border border-white/30 px-2 py-0.5 text-[10px] md:text-[10.5px] font-semibold text-white tracking-wide shadow-2xs">
                            <ShoppingBag size={10} className="text-white/80" />
                            <span>{productCount} {productCount === 1 ? 'item' : 'items'}</span>
                        </span>
                    </div>
                ) : null}
            </div>
        </Link>
    );
}

