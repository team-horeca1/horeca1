'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { X, Check, ZoomIn, RotateCcw, Crosshair, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ImagePreview, type ImagePreviewVariant } from '@/components/ui/ImagePreview';
import { parseImageMeta, buildImageMetaUrl, getDisplayStyle, type ImageMeta } from '@/lib/imageMeta';

// Image editor modal that opens after upload.
//
// Left side  : the uploaded image. User clicks/drags to set focal point + slider for zoom.
//              Crosshair indicator shows where the focal point sits.
// Right side : live preview at the EXACT frontend dimensions (logo / banner / card etc.)
//              so the author sees the final result as they adjust.
//
// On Save, we encode the focal point + zoom in the URL fragment via buildImageMetaUrl
// (no schema change required) and call onSave(updatedUrl). Display code uses
// parseImageMeta to extract focal point and applies object-position + transform.

export function ImageEditorModal({
    open,
    src,
    variant,
    onSave,
    onCancel,
    title,
}: {
    open: boolean;
    /** The uploaded image URL (may already contain a meta fragment from a previous edit). */
    src: string | null;
    /** Frontend variant the right-side preview should match. */
    variant: ImagePreviewVariant;
    onSave: (urlWithMeta: string) => void;
    onCancel: () => void;
    title?: string;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [meta, setMeta] = useState<ImageMeta>({ x: 50, y: 50, zoom: 1 });
    const [imageLoaded, setImageLoaded] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [baseSrc, setBaseSrc] = useState<string>('');

    // Initialise meta from incoming URL (re-edit case)
    useEffect(() => {
        if (!src) return;
        const parsed = parseImageMeta(src);
        Promise.resolve().then(() => {
            setBaseSrc(parsed.src);
            setMeta(parsed.meta);
            setImageLoaded(false);
        });
    }, [src]);

    const updateFocalFromEvent = useCallback((clientX: number, clientY: number) => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = ((clientX - rect.left) / rect.width) * 100;
        const y = ((clientY - rect.top) / rect.height) * 100;
        setMeta(m => ({ ...m, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }));
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        setDragging(true);
        updateFocalFromEvent(e.clientX, e.clientY);
    };
    const handleMouseMove = (e: React.MouseEvent) => {
        if (dragging) updateFocalFromEvent(e.clientX, e.clientY);
    };
    const handleMouseUp = () => setDragging(false);

    // Touch support for mobile
    const handleTouch = (e: React.TouchEvent) => {
        const t = e.touches[0];
        if (t) updateFocalFromEvent(t.clientX, t.clientY);
    };

    const reset = () => setMeta({ x: 50, y: 50, zoom: 1 });

    const save = () => {
        if (!baseSrc) return;
        onSave(buildImageMetaUrl(baseSrc, meta));
    };

    if (!open) return null;

    const displayStyle = getDisplayStyle(meta);

    return (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl w-full max-w-[1000px] max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-[16px] font-bold text-[#181725] flex items-center gap-2">
                            <Crosshair size={16} className="text-primary" />
                            {title ?? 'Adjust image'}
                        </h3>
                        <p className="text-[12px] text-gray-500 mt-0.5">
                            Click or drag on the image to set the focal point. This is the part guaranteed to stay visible after auto-cropping.
                        </p>
                    </div>
                    <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-xl shrink-0">
                        <X size={18} />
                    </button>
                </div>

                {/* Body — left: editor, right: preview */}
                <div className="flex-1 grid lg:grid-cols-[1fr_320px] gap-0 overflow-hidden">
                    {/* Editor area */}
                    <div className="p-5 overflow-y-auto bg-gray-50">
                        {!baseSrc ? (
                            <div className="flex items-center justify-center h-[400px]">
                                <Loader2 size={24} className="animate-spin text-primary" />
                            </div>
                        ) : (
                            <>
                                <div
                                    ref={containerRef}
                                    onMouseDown={handleMouseDown}
                                    onMouseMove={handleMouseMove}
                                    onMouseUp={handleMouseUp}
                                    onMouseLeave={handleMouseUp}
                                    onTouchStart={handleTouch}
                                    onTouchMove={handleTouch}
                                    className={cn(
                                        'relative w-full h-[400px] bg-white border border-gray-200 rounded-xl overflow-hidden select-none',
                                        dragging ? 'cursor-grabbing' : 'cursor-crosshair',
                                    )}
                                >
                                    <Image
                                        src={baseSrc}
                                        alt="editing"
                                        fill
                                        sizes="640px"
                                        className="object-contain pointer-events-none"
                                        onLoad={() => setImageLoaded(true)}
                                        priority
                                    />
                                    {/* Focal-point crosshair */}
                                    {imageLoaded && (
                                        <>
                                            <div
                                                className="absolute pointer-events-none"
                                                style={{ left: `${meta.x}%`, top: `${meta.y}%`, transform: 'translate(-50%, -50%)' }}
                                            >
                                                <div className="w-10 h-10 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(107, 29, 46, )] bg-primary/30 flex items-center justify-center">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                                </div>
                                            </div>
                                            {/* Crosshair grid */}
                                            <div className="absolute pointer-events-none top-0 bottom-0 border-l border-white/40 border-dashed" style={{ left: `${meta.x}%` }} />
                                            <div className="absolute pointer-events-none left-0 right-0 border-t border-white/40 border-dashed" style={{ top: `${meta.y}%` }} />
                                        </>
                                    )}
                                </div>

                                {/* Controls */}
                                <div className="mt-4 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <ZoomIn size={14} className="text-gray-500 shrink-0" />
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-1">
                                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Zoom</label>
                                                <span className="text-[11px] font-bold text-[#181725]">{meta.zoom.toFixed(1)}×</span>
                                            </div>
                                            <input
                                                type="range"
                                                min={1}
                                                max={3}
                                                step={0.1}
                                                value={meta.zoom}
                                                onChange={(e) => setMeta(m => ({ ...m, zoom: Number(e.target.value) }))}
                                                className="w-full accent-primary"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={reset}
                                            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-gray-500 hover:text-primary hover:bg-white rounded-lg transition-colors"
                                        >
                                            <RotateCcw size={11} /> Reset
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <label className="font-bold text-gray-500 uppercase tracking-wider">Focal X</label>
                                                <span className="font-bold text-[#181725]">{Math.round(meta.x)}%</span>
                                            </div>
                                            <input type="range" min={0} max={100} value={meta.x}
                                                onChange={e => setMeta(m => ({ ...m, x: Number(e.target.value) }))}
                                                className="w-full accent-primary" />
                                        </div>
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <label className="font-bold text-gray-500 uppercase tracking-wider">Focal Y</label>
                                                <span className="font-bold text-[#181725]">{Math.round(meta.y)}%</span>
                                            </div>
                                            <input type="range" min={0} max={100} value={meta.y}
                                                onChange={e => setMeta(m => ({ ...m, y: Number(e.target.value) }))}
                                                className="w-full accent-primary" />
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Live preview side */}
                    <div className="border-l border-gray-100 p-5 bg-white overflow-y-auto">
                        <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-3">Live preview on website</p>
                        {baseSrc ? (
                            <PreviewWithMeta src={baseSrc} variant={variant} style={displayStyle} />
                        ) : (
                            <div className="text-[13px] text-gray-400 italic">Image not loaded</div>
                        )}
                        <div className="mt-5 p-3 bg-[#FAFAFA] border border-gray-100 rounded-xl">
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                The crosshair on the left marks the &ldquo;focal point&rdquo; — when the image is auto-cropped at different sizes across the site, this point stays in view. Drag it to whichever part of the image you want guaranteed visible.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
                    <button onClick={onCancel}
                        className="h-[36px] px-4 bg-gray-100 text-gray-700 rounded-lg text-[13px] font-bold hover:bg-gray-200">
                        Cancel
                    </button>
                    <button onClick={save} disabled={!baseSrc}
                        className="h-[36px] px-5 bg-primary text-white rounded-lg text-[13px] font-bold disabled:opacity-60 hover:bg-primary-dark flex items-center gap-1.5">
                        <Check size={14} /> Save image
                    </button>
                </div>
            </div>
        </div>
    );
}

// Live preview that overrides the inner image styles with the editor's meta.
function PreviewWithMeta({
    src,
    variant,
    style,
}: {
    src: string;
    variant: ImagePreviewVariant;
    style: React.CSSProperties;
}) {
    // ImagePreview already renders at the right shape + size. We need to inject our
    // focal/zoom styles onto the inner <Image>. Since ImagePreview uses Next/Image fill +
    // object-cover/contain via classNames, the cleanest hack is to render our own
    // matching wrapper here so the live preview reflects the user's adjustments in real time.
    const VARIANT_DIMS: Record<ImagePreviewVariant, { w: number; h: number; shape: string; bg: string; fit: 'cover' | 'contain'; border?: boolean }> = {
        'brand-logo':     { w: 40,  h: 40,  shape: 'rounded-[10px]',   bg: '#fff',     fit: 'contain', border: true },
        'brand-banner':   { w: 320, h: 80,  shape: 'rounded-2xl',      bg: '#6B1D2E',  fit: 'cover'  },
        'brand-card-top': { w: 150, h: 225, shape: 'rounded-[16px]',   bg: '#6B1D2E',  fit: 'cover'  },
        'product-square': { w: 200, h: 200, shape: 'rounded-2xl',      bg: '#fff',     fit: 'contain' },
        'vendor-cover':   { w: 280, h: 160, shape: 'rounded-2xl',      bg: '#fafafa',  fit: 'cover'  },
    };
    const cfg = VARIANT_DIMS[variant];
    return (
        <div className="space-y-2">
            <div
                className={cn('relative overflow-hidden mx-auto', cfg.shape, cfg.border && 'border-4 border-white shadow-md')}
                style={{ width: cfg.w, height: cfg.h, backgroundColor: cfg.bg }}
            >
                <Image
                    src={src}
                    alt="preview"
                    fill
                    sizes={`${cfg.w}px`}
                    className={cfg.fit === 'contain' ? 'object-contain p-1.5' : 'object-cover'}
                    style={style}
                />
            </div>
            <p className="text-[10px] text-gray-400 text-center">{cfg.w}×{cfg.h}px</p>
        </div>
    );
}
