'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
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
  /** `responsive` follows the viewport. Force `mobile` or `desktop` for admin preview. */
  layout?: HeroLayout;
  /** `page` wraps with homepage padding. `card` is the banner only (admin preview). */
  chrome?: HeroChrome;
  /** Storefront desktop uses h1. Pass h2 when this banner is not the page title. */
  heading?: 'h1' | 'h2';
};

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

export function Hero({
  eyebrow = HERO_FALLBACK.eyebrow,
  headline = HERO_FALLBACK.headline,
  ctaLabel = HERO_FALLBACK.ctaLabel,
  ctaHref = HERO_FALLBACK.ctaHref,
  showText = HERO_FALLBACK.showText,
  showCta = HERO_FALLBACK.showCta,
  copyAlignX = HERO_FALLBACK.copyAlignX,
  copyAlignY: _copyAlignY = HERO_FALLBACK.copyAlignY,
  copyOffsetX = HERO_FALLBACK.copyOffsetX,
  copyOffsetY = HERO_FALLBACK.copyOffsetY,
  showTextMobile = HERO_FALLBACK.showTextMobile,
  showCtaMobile = HERO_FALLBACK.showCtaMobile,
  copyAlignXMobile = HERO_FALLBACK.copyAlignXMobile,
  copyAlignYMobile: _copyAlignYMobile = HERO_FALLBACK.copyAlignYMobile,
  copyOffsetXMobile = HERO_FALLBACK.copyOffsetXMobile,
  copyOffsetYMobile = HERO_FALLBACK.copyOffsetYMobile,
  desktopImageUrl = HERO_FALLBACK.desktopImageUrl,
  mobileImageUrl = HERO_FALLBACK.mobileImageUrl,
  layout = 'responsive',
  chrome = 'page',
  heading,
}: HeroContent = {}) {
  const showMobile = layout === 'mobile' || layout === 'responsive';
  const showDesktop = layout === 'desktop' || layout === 'responsive';
  const priority = layout === 'responsive';

  const banners = (
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
            heading={heading ?? 'h1'}
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
            heading={heading ?? 'h2'}
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
