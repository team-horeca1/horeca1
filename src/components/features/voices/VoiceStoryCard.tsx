'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShareButton } from '@/components/features/share/ShareButton';
import { articleShareContent } from '@/lib/share-cards/types';

export type VoiceStoryCardData = {
  slug: string;
  badge: string;
  name: string;
  role: string | null;
  venue: string | null;
  quote: string;
  photoUrl: string | null;
  category?: string;
  storySquareUrl?: string | null;
};

export function VoiceStoryCard({
  story,
  variant = 'listing',
}: {
  story: VoiceStoryCardData;
  variant?: 'teaser' | 'listing' | 'related';
}) {
  const titleLine = [story.role, story.venue].filter(Boolean).join(' · ');
  const compact = variant !== 'listing';
  const shareContent = articleShareContent({
    slug: story.slug,
    name: story.name,
    quote: story.quote,
    role: story.role,
    venue: story.venue,
    photoUrl: story.photoUrl,
    preRenderedImageUrl: story.storySquareUrl,
  });

  return (
    <article
      className={cn(
        'group relative bg-white border border-divider/80 rounded-2xl overflow-hidden transition-all duration-300 flex flex-col',
        'hover:border-primary/40 hover:shadow-elevation-2',
        variant === 'teaser' && 'min-w-[260px] max-w-[290px] shrink-0',
        variant === 'related' && 'min-w-[220px] max-w-[240px] shrink-0',
        variant === 'listing' && 'h-full',
      )}
    >
      <Link href={`/voices/${story.slug}`} className="flex flex-col h-full">
        <div
          className={cn(
            'relative overflow-hidden bg-ivory/60',
            variant === 'teaser' && 'h-[175px]',
            variant === 'related' && 'h-[130px]',
            variant === 'listing' && 'aspect-[16/10]',
          )}
        >
          {story.photoUrl ? (
            <Image
              src={story.photoUrl}
              alt={story.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
              sizes={variant === 'listing' ? '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw' : '290px'}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-primary-light">
              <span className="text-primary font-bold text-[32px]">{story.name.slice(0, 1)}</span>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {story.badge ? (
            <span className="absolute top-2.5 left-2.5 bg-primary text-white text-[9.5px] font-extrabold px-2.5 py-1 rounded-full shadow-sm tracking-wider uppercase z-[1]">
              {story.badge}
            </span>
          ) : null}
        </div>

        <div className={cn('flex flex-col flex-1', compact ? 'p-3.5' : 'p-4 sm:p-5')}>
          <h3 className="text-[16px] font-bold text-text group-hover:text-primary transition-colors leading-snug line-clamp-1 text-balance">
            {story.name}
          </h3>

          {titleLine ? (
            <p className="text-[12px] text-text-secondary mt-0.5 font-medium line-clamp-1">
              {titleLine}
            </p>
          ) : null}

          <div className="relative mt-2.5 mb-1 flex-1">
            <p className="text-[12.5px] text-text-secondary line-clamp-2 leading-relaxed italic text-pretty pl-3 border-l-2 border-primary/40">
              &ldquo;{story.quote}&rdquo;
            </p>
          </div>

          {variant !== 'related' ? (
            <div className="pt-2 mt-auto border-t border-divider/50 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-primary group-hover:translate-x-0.5 transition-transform">
                Read full story
                <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          ) : null}
        </div>
      </Link>

      <div className="absolute top-2.5 right-2.5 z-[2]">
        <ShareButton content={shareContent} variant="overlay" className="size-9" />
      </div>
    </article>
  );
}
