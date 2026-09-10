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
  return (
    <section className="w-full py-6 md:py-8 bg-white">
      <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
        <SectionHeader
          title="Horeca1 Voices"
          subtitle="Stories from the industry, for the industry"
          actionLabel="Meet more →"
          actionHref="/voices"
        />
        {stories.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {stories.map((s) => (
              <VoiceStoryCard key={s.id} story={s} variant="teaser" />
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-text-secondary text-pretty">
            Featured stories appear here once they are published.
          </p>
        )}
        <p className="mt-4">
          <Link href="/voices/nominate" className="text-[13px] font-semibold text-primary hover:underline">
            Know someone with a story worth featuring? Nominate them →
          </Link>
        </p>
      </div>
    </section>
  );
}
