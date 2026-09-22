'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { HERO_FALLBACK } from '@/modules/homepage/homepage-hero.constants';

export type HeroContent = {
  eyebrow?: string;
  headline?: string;
  ctaLabel?: string;
  ctaHref?: string;
  desktopImageUrl?: string;
  mobileImageUrl?: string;
};

export function Hero({
  eyebrow = HERO_FALLBACK.eyebrow,
  headline = HERO_FALLBACK.headline,
  ctaLabel = HERO_FALLBACK.ctaLabel,
  ctaHref = HERO_FALLBACK.ctaHref,
  desktopImageUrl = HERO_FALLBACK.desktopImageUrl,
  mobileImageUrl = HERO_FALLBACK.mobileImageUrl,
}: HeroContent = {}) {
  return (
    <section className="w-full pt-3 pb-3 md:pb-4">
      <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
        {/* Desktop */}
        <div className="hidden md:block">
          <div className="relative overflow-hidden rounded-[20px] min-h-[160px] lg:min-h-[190px] xl:min-h-[210px] shadow-cdl-2 bg-gradient-to-r from-[#4A141F] via-primary to-[#7A2438] flex items-center justify-between px-7 lg:px-10 xl:px-12 py-4 lg:py-5 gap-5">
            <div
              className="absolute right-0 top-1/2 -translate-y-1/2 w-[380px] h-[380px] rounded-full bg-white/[0.07] blur-2xl pointer-events-none"
              aria-hidden
            />
            <div
              className="absolute right-[-40px] bottom-[-55px] w-[220px] h-[220px] rounded-full bg-white/10 pointer-events-none"
              aria-hidden
            />

            <div className="relative z-10 flex-1 min-w-0 max-w-xl text-left pr-4">
              <p className="text-[10px] lg:text-[11px] uppercase tracking-[0.14em] text-white/80 mb-1.5 font-semibold">
                {eyebrow}
              </p>
              <h1 className="text-[clamp(1.35rem,2.2vw,1.85rem)] font-bold text-white leading-tight text-balance mb-3.5">
                {headline}
              </h1>
              <Link
                href={ctaHref}
                className="inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-xl bg-white text-primary text-[13px] font-semibold hover:bg-ivory hover:shadow-lg active:scale-[0.97] transition-all shadow-md group"
              >
                {ctaLabel}
                <ArrowRight size={15} strokeWidth={2.4} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            <div className="relative z-10 shrink-0 w-[220px] h-[140px] md:w-[260px] md:h-[160px] lg:w-[340px] lg:h-[190px] xl:w-[400px] xl:h-[200px] flex items-center justify-end">
              <Image
                src={desktopImageUrl}
                alt="Hospitality and restaurant supply goods"
                fill
                sizes="(max-width: 1024px) 340px, (max-width: 1280px) 460px, 520px"
                className="object-contain object-right drop-shadow-[0_16px_30px_rgba(0,0,0,0.35)] transition-transform duration-300 hover:scale-[1.02]"
                priority
              />
            </div>
          </div>
        </div>

        {/* Mobile */}
        <div className="md:hidden">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4A141F] via-primary to-[#7A2438] px-4 py-3.5 min-h-[132px] flex items-center shadow-cdl-1">
            <div className="flex-1 pr-2 z-10 text-left">
              <p className="text-[9px] uppercase tracking-wider text-white/75 mb-1">
                {eyebrow}
              </p>
              <h2 className="text-[0.95rem] font-bold text-white leading-snug text-balance mb-3 max-w-[220px]">
                {headline}
              </h2>
              <Link
                href={ctaHref}
                className="inline-flex items-center justify-center gap-1.5 min-h-10 bg-white text-primary font-semibold text-[12px] px-4 rounded-lg active:scale-[0.97] transition-transform"
              >
                {ctaLabel}
                <ArrowRight size={14} />
              </Link>
            </div>
            <div className="relative w-[34%] h-[96px] shrink-0 z-10">
              <Image
                src={mobileImageUrl}
                alt=""
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
