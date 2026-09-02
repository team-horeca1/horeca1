'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Eye } from 'lucide-react';
import { parseImageMeta, getDisplayStyle } from '@/lib/imageMeta';

// Frontend-accurate previews for image uploads.
// Each variant matches the EXACT dimensions and shape used on the live site,
// so admin/brand owners see what the buyer will actually see — no guessing
// after upload, no jarring crops at the wrong aspect ratio.

export type ImagePreviewVariant =
    | 'brand-logo'        // Top-left rounded-square logo on BrandStoreCard (40x40)
    | 'brand-banner'      // The wide hero banner on the brand storefront
    | 'brand-card-top'    // Full-bleed brand store card cover (150x225)
    | 'product-square'    // Generic square product card image
    | 'vendor-cover';     // Wide vendor cover/cards

interface VariantConfig {
    label: string;
    width: number;
    height: number;
    shape: 'circle' | 'rounded' | 'rounded-top' | 'square';
    bg?: string;
    border?: boolean;
    fit?: 'cover' | 'contain';
}

const VARIANTS: Record<ImagePreviewVariant, VariantConfig> = {
    'brand-logo':       { label: 'Logo on brand card',     width: 40,  height: 40,  shape: 'rounded',      bg: '#fff',     border: true,  fit: 'contain' },
    'brand-banner':     { label: 'Storefront hero (4:1)',  width: 320, height: 80,  shape: 'rounded',      bg: '#6B1D2E',                  fit: 'cover'   },
    'brand-card-top':   { label: 'Brand store card',       width: 150, height: 225, shape: 'rounded',      bg: '#6B1D2E',                  fit: 'cover'   },
    'product-square':   { label: 'Product card image',     width: 200, height: 200, shape: 'rounded',      bg: '#fff',                     fit: 'contain' },
    'vendor-cover':     { label: 'Vendor card cover',      width: 280, height: 160, shape: 'rounded',      bg: '#fafafa',                  fit: 'cover'   },
};

export function ImagePreview({
    src,
    variant,
    showFrame = true,
    className,
}: {
    src: string | null | undefined;
    variant: ImagePreviewVariant;
    /** When false, just renders the image at the right shape with no label/border/caption. */
    showFrame?: boolean;
    className?: string;
}) {
    const cfg = VARIANTS[variant];
    const parsed = parseImageMeta(src);
    const metaStyle = parsed.src ? getDisplayStyle(parsed.meta) : {};

    const shapeClass =
        cfg.shape === 'circle' ? 'rounded-full' :
        cfg.shape === 'rounded' ? 'rounded-2xl' :
        cfg.shape === 'rounded-top' ? 'rounded-t-2xl' :
        'rounded-none';

    const inner = (
        <div
            className={cn(
                'relative overflow-hidden shrink-0',
                shapeClass,
                cfg.border && 'border-4 border-white shadow-md',
                !src && 'flex items-center justify-center text-gray-300',
            )}
            style={{ width: cfg.width, height: cfg.height, backgroundColor: cfg.bg }}
        >
            {parsed.src ? (
                <Image
                    src={parsed.src}
                    alt={cfg.label}
                    fill
                    sizes={`${cfg.width}px`}
                    className={cfg.fit === 'contain' ? 'object-contain p-2' : 'object-cover'}
                    style={metaStyle}
                />
            ) : (
                <Eye size={20} />
            )}
        </div>
    );

    if (!showFrame) return <div className={className}>{inner}</div>;

    return (
        <div className={cn('inline-flex flex-col gap-1.5', className)}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                <Eye size={10} /> {cfg.label}
            </p>
            {inner}
            <p className="text-[9px] text-gray-300">{cfg.width}×{cfg.height}px on the live page</p>
        </div>
    );
}

/** Convenience wrapper: stacks multiple preview variants vertically with a shared "Live Preview" header. */
export function ImagePreviewStack({
    items,
    title = 'Live preview',
}: {
    items: Array<{ src: string | null | undefined; variant: ImagePreviewVariant }>;
    title?: string;
}) {
    return (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-4">
            <p className="text-[12px] font-bold text-gray-700 flex items-center gap-1.5">
                <Eye size={12} className="text-[#53B175]" /> {title}
            </p>
            <div className="flex flex-wrap gap-4">
                {items.map((it, i) => (
                    <ImagePreview key={i} src={it.src} variant={it.variant} />
                ))}
            </div>
        </div>
    );
}
