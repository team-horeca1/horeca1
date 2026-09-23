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
  type HeroAlignX,
  type HeroAlignY,
} from '@/modules/homepage/homepage-hero.constants';

export type HeroLayout = 'responsive' | 'mobile' | 'desktop';

export type HeroContent = {
  eyebrow?: string;
  headline?: string;
  ctaLabel?: string;
  ctaHref?: string;
  showText?: boolean;
  showCta?: boolean;
  copyAlignX?: HeroAlignX;
  copyAlignY?: HeroAlignY;
  desktopImageUrl?: string;
  mobileImageUrl?: string;
  /** `responsive` follows the viewport. Force `mobile` or `desktop` for admin preview. */
  layout?: HeroLayout;
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

const alignXClass: Record<HeroAlignX, string> = {
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
};

const alignYClass: Record<HeroAlignY, string> = {
  top: 'justify-start',
  center: 'justify-center',
  bottom: 'justify-end',
};

const ctaSelfClass: Record<HeroAlignX, string> = {
  left: 'self-start',
  center: 'self-center',
  right: 'self-end',
};

function HeroBanner({
  imageUrl,
  fallbackUrl,
  sizes,
  priority,
  frameClassName,
  copyClassName,
  ctaClassName,
  eyebrow,
  headline,
  ctaLabel,
  ctaHref,
  heading,
  showText,
  showCta,
  copyAlignX,
  copyAlignY,
}: {
  imageUrl: string;
  fallbackUrl: string;
  sizes: string;
  priority: boolean;
  frameClassName: string;
  copyClassName: string;
  ctaClassName: string;
  eyebrow: string;
  headline: string;
  ctaLabel: string;
  ctaHref: string;
  heading: 'h1' | 'h2';
  showText: boolean;
  showCta: boolean;
  copyAlignX: HeroAlignX;
  copyAlignY: HeroAlignY;
}) {
  const eyebrowText = showText ? eyebrow.trim() : '';
  const headlineText = showText ? headline.trim() : '';
  const labelText = ctaLabel.trim();
  const showButton = showCta && labelText.length > 0 && isSafeHeroHref(ctaHref);
  const hasCopy = Boolean(eyebrowText || headlineText || showButton);

  return (
    <div className={cn('relative isolate overflow-hidden bg-[#4A141F]', frameClassName)}>
      <HeroMedia
        key={imageUrl}
        url={imageUrl}
        fallbackUrl={fallbackUrl}
        sizes={sizes}
        priority={priority}
        alt={hasCopy ? '' : headlineText || 'Homepage banner'}
      />
      {hasCopy && (
        <div className={cn('relative z-10 flex w-full flex-col', alignYClass[copyAlignY], alignXClass[copyAlignX], copyClassName)}>
          {eyebrowText && (
            <p className="text-[11px] uppercase tracking-[0.14em] text-white font-semibold leading-snug mb-1.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
              {eyebrowText}
            </p>
          )}
          {headlineText && (
            <HeroHeading
              as={heading}
              className="text-[clamp(1.25rem,2.2vw,1.85rem)] font-bold text-white leading-tight text-balance mb-3 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
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
  copyAlignY = HERO_FALLBACK.copyAlignY,
  desktopImageUrl = HERO_FALLBACK.desktopImageUrl,
  mobileImageUrl = HERO_FALLBACK.mobileImageUrl,
  layout = 'responsive',
  heading,
}: HeroContent = {}) {
  const showMobile = layout === 'mobile' || layout === 'responsive';
  const showDesktop = layout === 'desktop' || layout === 'responsive';
  const priority = layout === 'responsive';

  return (
    <section className="w-full pt-3 pb-3 md:pb-4">
      <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
        {showDesktop && (
          <div className={layout === 'responsive' ? 'hidden md:block' : undefined}>
            <HeroBanner
              imageUrl={desktopImageUrl}
              fallbackUrl={HERO_FALLBACK.desktopImageUrl}
              sizes="100vw"
              priority={priority}
              frameClassName="min-h-[220px] xl:min-h-[240px] rounded-[20px] shadow-cdl-2"
              copyClassName="min-h-[220px] xl:min-h-[240px] px-7 lg:px-10 xl:px-12 py-5"
              ctaClassName="min-h-11 px-5 text-[13px]"
              eyebrow={eyebrow}
              headline={headline}
              ctaLabel={ctaLabel}
              ctaHref={ctaHref}
              heading={heading ?? 'h1'}
              showText={showText}
              showCta={showCta}
              copyAlignX={copyAlignX}
              copyAlignY={copyAlignY}
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
              frameClassName="min-h-[200px] rounded-2xl shadow-cdl-1"
              copyClassName="min-h-[200px] px-4 py-4"
              ctaClassName="min-h-12 px-5 text-[13px]"
              eyebrow={eyebrow}
              headline={headline}
              ctaLabel={ctaLabel}
              ctaHref={ctaHref}
              heading={heading ?? 'h2'}
              showText={showText}
              showCta={showCta}
              copyAlignX={copyAlignX}
              copyAlignY={copyAlignY}
            />
          </div>
        )}
      </div>
    </section>
  );
}
