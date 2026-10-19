'use client';

import Link from 'next/link';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { VoiceStoryCard, type VoiceStoryCardData } from '@/components/features/voices/VoiceStoryCard';

export type VoicesTeaser = VoiceStoryCardData & {
  id: string;
  storySquareUrl?: string | null;
  storyPortraitUrl?: string | null;
};

export function VoicesSection({ stories }: { stories: VoicesTeaser[] }) {
  if (stories.length === 0) return null;

  return (
    <section className="w-full py-6 bg-white overflow-hidden">
      <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
        {/* Section Header */}
        <SectionHeader
          title="Horeca1 Voices"
          subtitle="Stories from top chefs & hospitality leaders"
          actionLabel="View all →"
          actionHref="/voices"
          className="mb-3.5"
        />

        {/* Stories Grid / Responsive Mobile Carousel */}
        <div className="flex lg:grid lg:grid-cols-4 overflow-x-auto lg:overflow-visible gap-4 md:gap-5 pb-2 pt-0.5 -mx-[var(--container-padding)] px-[var(--container-padding)] scroll-pl-[var(--container-padding)] sm:mx-0 sm:px-0 sm:scroll-pl-0 no-scrollbar snap-x snap-mandatory">
          {stories.map((s) => (
            <div
              key={s.id}
              className="min-w-[280px] max-w-[310px] sm:min-w-[300px] lg:min-w-0 lg:max-w-none shrink-0 lg:shrink snap-start flex"
            >
              <VoiceStoryCard story={s} variant="teaser" />
            </div>
          ))}
        </div>

        {/* Subtle Bottom Link */}
        <div className="mt-2.5 flex items-center justify-end">
          <Link
            href="/voices/nominate"
            className="text-[12px] font-medium text-neutral-400 hover:text-primary transition-colors inline-flex items-center gap-1"
          >
            <span>Nominate a story</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
