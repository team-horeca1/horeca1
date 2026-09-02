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
          <div className="relative overflow-hidden rounded-[20px] min-h-[200px] lg:min-h-[220px] shadow-cdl-2 bg-gradient-to-r from-[#4A141F] via-primary to-[#7A2438] flex items-center px-8 lg:px-12 py-8">
            <div
              className="absolute right-[-40px] bottom-[-55px] w-[190px] h-[190px] rounded-full bg-white/10 pointer-events-none"
              aria-hidden
            />
            <div className="relative z-10 flex-1 min-w-0 max-w-xl text-left pr-6">
              <p className="text-[11px] uppercase tracking-[0.12em] text-white/75 mb-2 font-medium">
                India&apos;s Hospitality Supply Network
              </p>
              <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-bold text-white leading-tight text-balance mb-5">
                Everything your restaurant needs. In one place.
              </h1>
              <Link
                href="/category"
                className="inline-flex items-center justify-center gap-2 min-h-12 px-5 rounded-lg bg-white text-primary text-[14px] font-semibold hover:bg-ivory active:scale-[0.97] transition-all"
              >
                Start exploring
                <ArrowRight size={16} strokeWidth={2.4} />
              </Link>
            </div>
            <div className="relative z-10 hidden lg:block w-[200px] h-[160px] shrink-0">
              <Image
                src="/images/hero-right1.png"
                alt=""
                fill
                sizes="200px"
                className="object-contain drop-shadow-2xl"
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
