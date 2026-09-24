'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDisplayStyle, parseImageMeta } from '@/lib/imageMeta';
import {
  HERO_FALLBACK,
  isSafeHeroHref,
  trimHeroCopy,
  type HeroAlignX,
  type HeroAlignY,
} from '@/modules/homepage/homepage-hero.constants';

export type HeroLayout = 'responsive' | 'mobile' | 'desktop';
export type HeroChrome = 'page' | 'card';

export type HeroContent = {
  id?: string;
  eyebrow?: string;
  headline?: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** Desktop visibility and placement (also used when layout is forced to desktop). */
  showText?: boolean;
  showCta?: boolean;
  copyAlignX?: HeroAlignX;
  copyAlignY?: HeroAlignY;
  copyOffsetX?: number;
  copyOffsetY?: number;
  /** Mobile visibility and placement. */
  showTextMobile?: boolean;
  showCtaMobile?: boolean;
  copyAlignXMobile?: HeroAlignX;
  copyAlignYMobile?: HeroAlignY;
  copyOffsetXMobile?: number;
  copyOffsetYMobile?: number;
  desktopImageUrl?: string;
  mobileImageUrl?: string;
};

export type HeroProps = {
  /** Multi-slide storefront. When set, overrides the single-slide fields below. */
  slides?: HeroContent[];
  /** Single-slide fields — used for admin preview and as fallback when slides is empty. */
  eyebrow?: string;
  headline?: string;
  ctaLabel?: string;
  ctaHref?: string;
  showText?: boolean;
  showCta?: boolean;
  copyAlignX?: HeroAlignX;
  copyAlignY?: HeroAlignY;
  copyOffsetX?: number;
  copyOffsetY?: number;
  showTextMobile?: boolean;
  showCtaMobile?: boolean;
  copyAlignXMobile?: HeroAlignX;
  copyAlignYMobile?: HeroAlignY;
  copyOffsetXMobile?: number;
  copyOffsetYMobile?: number;
  desktopImageUrl?: string;
  mobileImageUrl?: string;
  /** `responsive` follows the viewport. Force `mobile` or `desktop` for admin preview. */
  layout?: HeroLayout;
  /** `page` wraps with homepage padding. `card` is the banner only (admin preview). */
  chrome?: HeroChrome;
  /** Storefront desktop uses h1. Pass h2 when this banner is not the page title. */
  heading?: 'h1' | 'h2';
};

const AUTOPLAY_MS = 5000;

type Phase = 'primary' | 'fallback' | 'off';

function initialPhase(url: string, fallbackUrl: string): Phase {
  if (parseImageMeta(url).src) return 'primary';
  if (parseImageMeta(fallbackUrl).src) return 'fallback';
  return 'off';
}

function HeroMedia({
  url,
  fallbackUrl,
  sizes,
  priority,
  alt,
}: {
  url: string;
  fallbackUrl: string;
  sizes: string;
  priority: boolean;
  alt: string;
}) {
  const [phase, setPhase] = useState<Phase>(() => initialPhase(url, fallbackUrl));
  const active = phase === 'primary' ? url : fallbackUrl;
  const parsed = parseImageMeta(active);

  if (phase === 'off' || !parsed.src) return null;

  return (
    <div className="absolute inset-0 overflow-hidden">
      <Image
        src={parsed.src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
        style={getDisplayStyle(parsed.meta)}
        onError={() => {
          setPhase((current) => {
            if (current !== 'primary') return 'off';
            const primarySrc = parseImageMeta(url).src;
            const fallbackSrc = parseImageMeta(fallbackUrl).src;
            if (fallbackSrc && fallbackSrc !== primarySrc) return 'fallback';
            return 'off';
          });
        }}
      />
    </div>
  );
}

function HeroHeading({
  as,
  className,
  children,
}: {
  as: 'h1' | 'h2';
  className: string;
  children: React.ReactNode;
}) {
  const Tag = as;
  return <Tag className={className}>{children}</Tag>;
}

function HeroCta({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className: string;
}) {
  return (
    <Link href={href} className={className}>
      {label}
      <ArrowRight size={15} strokeWidth={2.4} className="group-hover:translate-x-1 transition-transform" />
    </Link>
  );
}

const ctaClass =
  'group inline-flex items-center justify-center gap-2 rounded-xl bg-white text-primary font-semibold shadow-md transition-all hover:bg-ivory hover:shadow-lg active:scale-[0.97]';

const textAlignClass: Record<HeroAlignX, string> = {
  left: 'text-left items-start',
  center: 'text-center items-center',
  right: 'text-right items-end',
};

const ctaSelfClass: Record<HeroAlignX, string> = {
  left: 'self-start',
  center: 'self-center',
  right: 'self-end',
};

function originTransform(alignX: HeroAlignX): string {
  if (alignX === 'center') return 'translate(-50%, 0)';
  if (alignX === 'right') return 'translate(-100%, 0)';
  return 'translate(0, 0)';
}

function HeroBanner({
  imageUrl,
  fallbackUrl,
  sizes,
  priority,
  frameClassName,
  copyPadClassName,
  ctaClassName,
  headlineClassName,
  eyebrow,
  headline,
  ctaLabel,
  ctaHref,
  heading,
  showText,
  showCta,
  copyAlignX,
  copyOffsetX,
  copyOffsetY,
}: {
  imageUrl: string;
  fallbackUrl: string;
  sizes: string;
  priority: boolean;
  frameClassName: string;
  copyPadClassName: string;
  ctaClassName: string;
  headlineClassName: string;
  eyebrow: string;
  headline: string;
  ctaLabel: string;
  ctaHref: string;
  heading: 'h1' | 'h2';
  showText: boolean;
  showCta: boolean;
  copyAlignX: HeroAlignX;
  copyOffsetX: number;
  copyOffsetY: number;
}) {
  const eyebrowText = showText ? trimHeroCopy(eyebrow) : '';
  const headlineText = showText ? trimHeroCopy(headline) : '';
  const labelText = ctaLabel.trim();
  const showButton = showCta && labelText.length > 0 && isSafeHeroHref(ctaHref);
  const hasCopy = Boolean(eyebrowText || headlineText || showButton);

  return (
    <div
      className={cn(
        'relative isolate overflow-hidden bg-[#4A141F] [container-type:inline-size]',
        frameClassName,
      )}
    >
      <HeroMedia
        key={imageUrl}
        url={imageUrl}
        fallbackUrl={fallbackUrl}
        sizes={sizes}
        priority={priority}
        alt={hasCopy ? '' : headlineText || 'Homepage banner'}
      />
      {hasCopy && (
        <div
          className={cn(
            'absolute z-10 flex max-w-[78%] flex-col',
            textAlignClass[copyAlignX],
            copyPadClassName,
          )}
          style={{
            left: `${copyOffsetX}%`,
            top: `${copyOffsetY}%`,
            transform: originTransform(copyAlignX),
          }}
        >
          {eyebrowText && (
            <p className="mb-1.5 whitespace-pre-line text-[11px] font-semibold uppercase leading-snug tracking-[0.14em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
              {eyebrowText}
            </p>
          )}
          {headlineText && (
            <HeroHeading
              as={heading}
              className={cn(
                'mb-3 whitespace-pre-line font-bold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]',
                headlineClassName,
              )}
            >
              {headlineText}
            </HeroHeading>
          )}
          {showButton && (
            <HeroCta
              href={ctaHref.trim()}
              label={labelText}
              className={cn(ctaClass, ctaSelfClass[copyAlignX], ctaClassName)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SlidePair({
  slide,
  layout,
  priority,
  desktopHeading,
  mobileHeading,
}: {
  slide: HeroContent;
  layout: HeroLayout;
  priority: boolean;
  desktopHeading: 'h1' | 'h2';
  mobileHeading: 'h1' | 'h2';
}) {
  const showMobile = layout === 'mobile' || layout === 'responsive';
  const showDesktop = layout === 'desktop' || layout === 'responsive';

  const eyebrow = slide.eyebrow ?? HERO_FALLBACK.eyebrow;
  const headline = slide.headline ?? HERO_FALLBACK.headline;
  const ctaLabel = slide.ctaLabel ?? HERO_FALLBACK.ctaLabel;
  const ctaHref = slide.ctaHref ?? HERO_FALLBACK.ctaHref;
  const showText = slide.showText ?? HERO_FALLBACK.showText;
  const showCta = slide.showCta ?? HERO_FALLBACK.showCta;
  const copyAlignX = slide.copyAlignX ?? HERO_FALLBACK.copyAlignX;
  const copyOffsetX = slide.copyOffsetX ?? HERO_FALLBACK.copyOffsetX;
  const copyOffsetY = slide.copyOffsetY ?? HERO_FALLBACK.copyOffsetY;
  const showTextMobile = slide.showTextMobile ?? HERO_FALLBACK.showTextMobile;
  const showCtaMobile = slide.showCtaMobile ?? HERO_FALLBACK.showCtaMobile;
  const copyAlignXMobile = slide.copyAlignXMobile ?? HERO_FALLBACK.copyAlignXMobile;
  const copyOffsetXMobile = slide.copyOffsetXMobile ?? HERO_FALLBACK.copyOffsetXMobile;
  const copyOffsetYMobile = slide.copyOffsetYMobile ?? HERO_FALLBACK.copyOffsetYMobile;
  const desktopImageUrl = slide.desktopImageUrl ?? HERO_FALLBACK.desktopImageUrl;
  const mobileImageUrl = slide.mobileImageUrl ?? HERO_FALLBACK.mobileImageUrl;

  return (
    <>
      {showDesktop && (
        <div className={layout === 'responsive' ? 'hidden md:block' : undefined}>
          <HeroBanner
            imageUrl={desktopImageUrl}
            fallbackUrl={HERO_FALLBACK.desktopImageUrl}
            sizes="100vw"
            priority={priority}
            frameClassName="h-[240px] min-h-[220px] xl:min-h-[240px] rounded-[20px] shadow-cdl-2"
            copyPadClassName="px-1"
            ctaClassName="min-h-11 px-5 text-[13px]"
            headlineClassName="text-[clamp(1.25rem,2.2cqw,1.85rem)]"
            eyebrow={eyebrow}
            headline={headline}
            ctaLabel={ctaLabel}
            ctaHref={ctaHref}
            heading={desktopHeading}
            showText={showText}
            showCta={showCta}
            copyAlignX={copyAlignX}
            copyOffsetX={copyOffsetX}
            copyOffsetY={copyOffsetY}
          />
        </div>
      )}

      {showMobile && (
        <div className={layout === 'responsive' ? 'md:hidden' : undefined}>
          <HeroBanner
            imageUrl={mobileImageUrl}
            fallbackUrl={HERO_FALLBACK.mobileImageUrl}
            sizes="100vw"
            priority={priority}
            frameClassName="h-[200px] min-h-[200px] rounded-2xl shadow-cdl-1"
            copyPadClassName="px-1"
            ctaClassName="min-h-12 px-5 text-[13px]"
            headlineClassName="text-[clamp(1.25rem,4.8cqw,1.5rem)]"
            eyebrow={eyebrow}
            headline={headline}
            ctaLabel={ctaLabel}
            ctaHref={ctaHref}
            heading={mobileHeading}
            showText={showTextMobile}
            showCta={showCtaMobile}
            copyAlignX={copyAlignXMobile}
            copyOffsetX={copyOffsetXMobile}
            copyOffsetY={copyOffsetYMobile}
          />
        </div>
      )}
    </>
  );
}

function normalizeSlides(props: HeroProps): HeroContent[] {
  if (props.slides && props.slides.length > 0) return props.slides;
  return [
    {
      eyebrow: props.eyebrow,
      headline: props.headline,
      ctaLabel: props.ctaLabel,
      ctaHref: props.ctaHref,
      showText: props.showText,
      showCta: props.showCta,
      copyAlignX: props.copyAlignX,
      copyAlignY: props.copyAlignY,
      copyOffsetX: props.copyOffsetX,
      copyOffsetY: props.copyOffsetY,
      showTextMobile: props.showTextMobile,
      showCtaMobile: props.showCtaMobile,
      copyAlignXMobile: props.copyAlignXMobile,
      copyAlignYMobile: props.copyAlignYMobile,
      copyOffsetXMobile: props.copyOffsetXMobile,
      copyOffsetYMobile: props.copyOffsetYMobile,
      desktopImageUrl: props.desktopImageUrl,
      mobileImageUrl: props.mobileImageUrl,
    },
  ];
}

export function Hero(props: HeroProps = {}) {
  const {
    layout = 'responsive',
    chrome = 'page',
    heading,
  } = props;

  const slides = normalizeSlides(props);
  const multi = slides.length > 1 && chrome === 'page';
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const safeIndex = slides.length === 0 ? 0 : index % slides.length;

  useEffect(() => {
    setIndex(0);
  }, [slides.length]);

  const go = useCallback(
    (dir: -1 | 1) => {
      setIndex((i) => {
        const n = slides.length;
        if (n <= 1) return 0;
        return (i + dir + n) % n;
      });
    },
    [slides.length],
  );

  useEffect(() => {
    if (!multi || paused) return;
    const id = window.setInterval(() => go(1), AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [multi, paused, go]);

  const active = slides[safeIndex] ?? slides[0];
  if (!active) return null;

  const banners = (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <SlidePair
        key={active.id ?? safeIndex}
        slide={active}
        layout={layout}
        priority={chrome === 'page' && safeIndex === 0}
        desktopHeading={heading ?? (safeIndex === 0 ? 'h1' : 'h2')}
        mobileHeading={heading ?? 'h2'}
      />

      {multi && (
        <>
          <button
            type="button"
            aria-label="Previous banner"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-primary shadow-md transition hover:bg-white md:left-3 md:h-10 md:w-10"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            aria-label="Next banner"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-primary shadow-md transition hover:bg-white md:right-3 md:h-10 md:w-10"
          >
            <ChevronRight size={20} strokeWidth={2.5} />
          </button>
          <div
            className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5"
            role="tablist"
            aria-label="Banner slides"
          >
            {slides.map((s, i) => (
              <button
                key={s.id ?? i}
                type="button"
                role="tab"
                aria-selected={i === safeIndex}
                aria-label={`Banner ${i + 1}`}
                onClick={() => setIndex(i)}
                className={cn(
                  'h-2 rounded-full transition-all',
                  i === safeIndex
                    ? 'w-5 bg-white shadow-sm'
                    : 'w-2 bg-white/55 hover:bg-white/80',
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );

  if (chrome === 'card') {
    return <div className="w-full">{banners}</div>;
  }

  return (
    <section className="w-full pt-3 pb-3 md:pb-4">
      <div className="mx-auto max-w-[var(--container-max)] px-[var(--container-padding)]">
        {banners}
      </div>
    </section>
  );
}
