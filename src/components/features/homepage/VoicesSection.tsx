'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { VoiceStoryCard, type VoiceStoryCardData } from '@/components/features/voices/VoiceStoryCard';

export type VoicesTeaser = VoiceStoryCardData & {
  id: string;
  storySquareUrl?: string | null;
  storyPortraitUrl?: string | null;
};

export function VoicesSection({ stories }: { stories: VoicesTeaser[] }) {
  return (
    <section className="w-full py-8 md:py-10 bg-white">
      <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-black tracking-widest uppercase text-primary mb-1">
              <Sparkles size={12} className="text-primary shrink-0" />
              <span>Editorial Spotlight</span>
            </div>
            <h2 className="text-[22px] sm:text-[26px] font-black text-neutral-900 tracking-tight leading-tight">
              Horeca1 Voices
            </h2>
            <p className="text-[13px] sm:text-[14px] text-neutral-500 mt-0.5 font-medium">
              Stories from the culinary &amp; hospitality frontlines
            </p>
          </div>
          <Link
            href="/voices"
            className="group inline-flex items-center gap-1 text-[13px] font-bold text-primary hover:text-primary-dark transition-colors self-start sm:self-auto shrink-0 pb-0.5"
          >
            <span>Explore all stories</span>
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
          </Link>
        </div>

        {/* Stories Grid / Responsive Mobile Carousel */}
        {stories.length > 0 ? (
          <div className="flex lg:grid lg:grid-cols-4 overflow-x-auto lg:overflow-visible gap-4 md:gap-5 pb-3 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar snap-x snap-mandatory">
            {stories.map((s) => (
              <div 
                key={s.id} 
                className="min-w-[280px] max-w-[310px] sm:min-w-[300px] lg:min-w-0 lg:max-w-none shrink-0 lg:shrink snap-start flex"
              >
                <VoiceStoryCard story={s} variant="teaser" />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-neutral-200 p-8 text-center bg-[#FAF8F5]">
            <p className="text-[14px] text-neutral-500 font-medium">
              Featured editorial stories will appear here once published.
            </p>
          </div>
        )}

        {/* Bottom Nomination Banner */}
        <div className="mt-6 pt-4 border-t border-[#F0EBE1] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13px] text-neutral-600">
            <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
            <span>Know an inspiring chef, restaurateur, or supplier with a story worth featuring?</span>
          </div>
          <Link
            href="/voices/nominate"
            className="inline-flex items-center gap-1 text-[13px] font-bold text-primary hover:text-primary-dark hover:underline transition-colors shrink-0"
          >
            Nominate for Horeca1 Voices →
          </Link>
        </div>
      </div>
    </section>
  );
}
