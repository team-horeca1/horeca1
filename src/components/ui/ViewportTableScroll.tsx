'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type Metrics = {
    visible: boolean;
    barLeft: number;
    barWidth: number;
    trackWidth: number;
    thumbWidth: number;
    thumbLeft: number;
    atStart: boolean;
    atEnd: boolean;
};

const BAR_CHROME = 84;

function thumbWidthFor(trackWidth: number, clientWidth: number, scrollWidth: number): number {
    if (trackWidth <= 0 || scrollWidth <= 0) return 0;
    const raw = (clientWidth / scrollWidth) * trackWidth;
    const minThumb = Math.min(56, trackWidth);
    const maxThumb = Math.min(trackWidth, 112);
    return Math.min(maxThumb, Math.max(minThumb, raw));
}

/**
 * Horizontal scroller with a floating pill fixed to the bottom of the viewport.
 * The pill stays with the screen while the table rows scroll, and only spans
 * a short track so it does not read as a second browser scrollbar.
 */
export function ViewportTableScroll({ children }: { children: React.ReactNode }) {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ pointerId: number; startX: number; startScroll: number } | null>(null);
    const [dragging, setDragging] = useState(false);
    const [metrics, setMetrics] = useState<Metrics>({
        visible: false,
        barLeft: 0,
        barWidth: 0,
        trackWidth: 0,
        thumbWidth: 0,
        thumbLeft: 0,
        atStart: true,
        atEnd: true,
    });

    const measure = useCallback(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const overflow = el.scrollWidth - el.clientWidth;
        const onScreen = rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0;
        const visible = overflow > 1 && onScreen;
        const barWidth = Math.round(Math.min(440, Math.max(220, rect.width - 32)));
        const barLeft = Math.round(rect.left + (rect.width - barWidth) / 2);
        const estimatedTrack = Math.max(40, barWidth - BAR_CHROME);
        const trackWidth = trackRef.current && visible
            ? Math.round(trackRef.current.clientWidth) || estimatedTrack
            : estimatedTrack;
        const thumbWidth = visible ? Math.round(thumbWidthFor(trackWidth, el.clientWidth, el.scrollWidth)) : 0;
        const maxThumb = Math.max(0, trackWidth - thumbWidth);
        const thumbLeft = overflow > 1 && maxThumb > 0 ? Math.round((el.scrollLeft / overflow) * maxThumb) : 0;
        const atStart = el.scrollLeft <= 1;
        const atEnd = el.scrollLeft >= overflow - 1;
        setMetrics((prev) => {
            if (
                prev.visible === visible
                && prev.barLeft === barLeft
                && prev.barWidth === barWidth
                && prev.trackWidth === trackWidth
                && prev.thumbWidth === thumbWidth
                && prev.thumbLeft === thumbLeft
                && prev.atStart === atStart
                && prev.atEnd === atEnd
            ) {
                return prev;
            }
            return { visible, barLeft, barWidth, trackWidth, thumbWidth, thumbLeft, atStart, atEnd };
        });
    }, []);

    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        let frame = 0;
        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        };
        schedule();
        el.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule);
        const observer = new ResizeObserver(schedule);
        observer.observe(el);
        const table = el.firstElementChild;
        if (table) observer.observe(table);
        return () => {
            cancelAnimationFrame(frame);
            el.removeEventListener('scroll', schedule);
            window.removeEventListener('scroll', schedule);
            window.removeEventListener('resize', schedule);
            observer.disconnect();
        };
    }, [measure]);

    useEffect(() => {
        if (!metrics.visible) return;
        measure();
    }, [metrics.visible, measure]);

    const scrollFromThumb = (nextThumbLeft: number) => {
        const el = scrollerRef.current;
        const track = trackRef.current;
        if (!el || !track) return;
        const overflow = el.scrollWidth - el.clientWidth;
        const thumbWidth = thumbWidthFor(track.clientWidth, el.clientWidth, el.scrollWidth);
        const maxThumb = Math.max(0, track.clientWidth - thumbWidth);
        el.scrollLeft = maxThumb <= 0 ? 0 : (nextThumbLeft / maxThumb) * overflow;
    };

    const nudge = (direction: -1 | 1) => {
        const el = scrollerRef.current;
        if (!el) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollBy({
            left: direction * Math.round(el.clientWidth * 0.72),
            behavior: reduce ? 'auto' : 'smooth',
        });
    };

    const onTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        const track = event.currentTarget;
        const el = scrollerRef.current;
        if (!el) return;
        const thumbWidth = thumbWidthFor(track.clientWidth, el.clientWidth, el.scrollWidth);
        const maxThumb = Math.max(0, track.clientWidth - thumbWidth);
        const clickX = event.clientX - track.getBoundingClientRect().left;
        scrollFromThumb(Math.min(maxThumb, Math.max(0, clickX - thumbWidth / 2)));
    };

    const onThumbPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const el = scrollerRef.current;
        if (!el) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startScroll: el.scrollLeft };
        setDragging(true);
    };

    const onThumbPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const el = scrollerRef.current;
        const track = trackRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !el || !track) return;
        const overflow = el.scrollWidth - el.clientWidth;
        const thumbWidth = thumbWidthFor(track.clientWidth, el.clientWidth, el.scrollWidth);
        const maxThumb = Math.max(1, track.clientWidth - thumbWidth);
        const dx = event.clientX - drag.startX;
        el.scrollLeft = drag.startScroll + dx * (overflow / maxThumb);
    };

    const onThumbPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        setDragging(false);
    };

    const maxThumbTravel = Math.max(0, metrics.trackWidth - metrics.thumbWidth);
    const valueNow = maxThumbTravel > 0 ? Math.round((metrics.thumbLeft / maxThumbTravel) * 100) : 0;

    const arrowClass = 'flex size-8 shrink-0 items-center justify-center rounded-full text-[#1C1C1C] transition-colors hover:bg-[#F8E8EC] disabled:pointer-events-none disabled:text-[#D1D5DB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6B1D2E]';

    return (
        <>
            <div
                ref={scrollerRef}
                className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
                {children}
            </div>
            {metrics.visible && (
                <div
                    className="fixed z-40 flex h-11 items-center gap-1 rounded-full border border-[#E9E3DD] bg-white/95 px-1.5 shadow-[0_10px_28px_rgba(28,28,28,0.14)] backdrop-blur-md bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-5"
                    style={{ left: metrics.barLeft, width: metrics.barWidth }}
                >
                    <button
                        type="button"
                        className={arrowClass}
                        aria-label="Scroll columns left"
                        disabled={metrics.atStart}
                        onClick={() => nudge(-1)}
                    >
                        <ChevronLeft size={16} strokeWidth={2.25} />
                    </button>
                    <div
                        ref={trackRef}
                        role="scrollbar"
                        tabIndex={0}
                        aria-orientation="horizontal"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={valueNow}
                        aria-label="Drag to see more columns"
                        onPointerDown={onTrackPointerDown}
                        onKeyDown={(event) => {
                            if (event.key === 'ArrowLeft') {
                                event.preventDefault();
                                nudge(-1);
                            } else if (event.key === 'ArrowRight') {
                                event.preventDefault();
                                nudge(1);
                            }
                        }}
                        className="relative h-8 min-w-0 flex-1 cursor-pointer rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6B1D2E]"
                    >
                        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#E9E3DD]" />
                        <div
                            className="absolute top-0 h-8 cursor-grab touch-none active:cursor-grabbing"
                            style={{ width: metrics.thumbWidth, transform: `translateX(${metrics.thumbLeft}px)` }}
                            onPointerDown={onThumbPointerDown}
                            onPointerMove={onThumbPointerMove}
                            onPointerUp={onThumbPointerUp}
                            onPointerCancel={onThumbPointerUp}
                        >
                            <div
                                className={cn(
                                    'pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full transition-[height,background-color] duration-150',
                                    dragging ? 'h-2 bg-[#6B1D2E]' : 'h-1.5 bg-[#1C1C1C]',
                                )}
                            />
                        </div>
                    </div>
                    <button
                        type="button"
                        className={arrowClass}
                        aria-label="Scroll columns right"
                        disabled={metrics.atEnd}
                        onClick={() => nudge(1)}
                    >
                        <ChevronRight size={16} strokeWidth={2.25} />
                    </button>
                </div>
            )}
        </>
    );
}
