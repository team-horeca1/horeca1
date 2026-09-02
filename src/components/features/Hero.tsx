'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';

export function Hero() {
  return (
    <section className="w-full pt-4 pb-5 md:pb-6">
      <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
        {/* Desktop */}
        <div className="hidden md:block">
          <div className="relative overflow-hidden rounded-[24px] min-h-[220px] lg:min-h-[260px] xl:min-h-[280px] shadow-cdl-2 bg-gradient-to-r from-[#4A141F] via-primary to-[#7A2438] flex items-center justify-between px-8 lg:px-12 xl:px-14 py-6 lg:py-8 gap-6">
            {/* Ambient decorative background glows on the right */}
            <div
              className="absolute right-0 top-1/2 -translate-y-1/2 w-[380px] h-[380px] rounded-full bg-white/[0.07] blur-2xl pointer-events-none"
              aria-hidden
            />
            <div
              className="absolute right-[-40px] bottom-[-55px] w-[220px] h-[220px] rounded-full bg-white/10 pointer-events-none"
              aria-hidden
            />

            {/* Left Content */}
            <div className="relative z-10 flex-1 min-w-0 max-w-xl text-left pr-4">
              <p className="text-[11px] lg:text-[12px] uppercase tracking-[0.14em] text-white/80 mb-2.5 font-semibold">
                India&apos;s Hospitality Supply Network
              </p>
              <h1 className="text-[clamp(1.6rem,2.6vw,2.25rem)] font-bold text-white leading-tight text-balance mb-5">
                Everything your restaurant needs. In one place.
              </h1>
              <Link
                href="/category"
                className="inline-flex items-center justify-center gap-2 min-h-12 px-6 rounded-xl bg-white text-primary text-[14px] font-semibold hover:bg-ivory hover:shadow-lg active:scale-[0.97] transition-all shadow-md group"
              >
                Start exploring
                <ArrowRight size={16} strokeWidth={2.4} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            {/* Right Image: enlarged & pushed right */}
            <div className="relative z-10 shrink-0 w-[280px] h-[190px] md:w-[320px] md:h-[210px] lg:w-[440px] lg:h-[260px] xl:w-[500px] xl:h-[280px] flex items-center justify-end">
              <Image
                src="/images/hero-right1.png"
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
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4A141F] via-primary to-[#7A2438] px-5 py-5 min-h-[158px] flex items-center shadow-cdl-1">
            <div className="flex-1 pr-2 z-10 text-left">
              <p className="text-[10px] uppercase tracking-wider text-white/75 mb-1.5">
                India&apos;s Hospitality Supply Network
              </p>
              <h2 className="text-[1.05rem] font-bold text-white leading-snug text-balance mb-4 max-w-[240px]">
                Everything your restaurant needs. In one place.
              </h2>
              <Link
                href="/category"
                className="inline-flex items-center justify-center gap-1.5 min-h-12 bg-white text-primary font-semibold text-[13px] px-5 rounded-lg active:scale-[0.97] transition-transform"
              >
                Start exploring
                <ArrowRight size={16} />
              </Link>
            </div>
            <div className="relative w-[36%] h-[110px] shrink-0 z-10">
              <Image
                src="/images/mobile-hero-right.png"
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
