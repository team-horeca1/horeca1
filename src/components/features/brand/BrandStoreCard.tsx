'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { parseImageMeta, getDisplayStyle } from '@/lib/imageMeta';

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
    const categoryLine = categories.slice(0, 3).join(' · ');

    return (
        <Link
            href={`/brand/${slug}`}
            className={cn(
                'group relative isolate flex flex-col overflow-hidden',
                'h-[225px] md:h-[248px] w-full rounded-[16px]',
                'shadow-cdl-1 hover:shadow-cdl-2 hover:-translate-y-0.5',
                'transition-all duration-200',
                className,
            )}
        >
            <div className="absolute inset-0" style={{ backgroundColor: bgColor || '#6B1D2E' }}>
                {cover ? (
                    <Image
                        src={cover}
                        alt=""
                        fill
                        sizes="(max-width: 768px) 160px, 200px"
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        style={img ? imgStyle : logoStyle}
                    />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary-pressed" />
                )}
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />

            <div className="absolute top-2.5 left-2.5 z-10 size-10 md:size-11 rounded-[10px] bg-white shadow-cdl-1 overflow-hidden flex items-center justify-center">
                {logoSrc ? (
                    <Image
                        src={logoSrc}
                        alt={name}
                        width={44}
                        height={44}
                        className="object-contain w-full h-full p-1"
                        style={logoStyle}
                    />
                ) : (
                    <span className="text-[15px] font-bold text-primary select-none">{name[0]}</span>
                )}
            </div>

            <div className="relative z-10 mt-auto p-3 text-white">
                <h3 className="text-[13px] md:text-[15px] font-bold leading-tight line-clamp-1">{name}</h3>
                {categoryLine ? (
                    <p className="text-[11px] text-white/85 leading-snug line-clamp-1 mt-0.5">{categoryLine}</p>
                ) : null}
                {typeof productCount === 'number' && productCount > 0 ? (
                    <p className="text-[10px] text-white/70 mt-0.5">
                        {productCount} {productCount === 1 ? 'product' : 'products'}
                    </p>
                ) : null}
                <span className="mt-2 inline-flex min-h-8 items-center px-3 rounded-full bg-white text-[#1C1C1C] text-[11px] font-semibold">
                    Explore Store
                </span>
            </div>
        </Link>
    );
}
