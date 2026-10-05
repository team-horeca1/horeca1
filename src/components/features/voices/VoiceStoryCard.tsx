'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Quote } from 'lucide-react';
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
  const [imageError, setImageError] = useState(false);
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
        'group relative bg-white border border-[#CDC4BA] rounded-[22px] overflow-hidden transition-all duration-300 flex flex-col h-full',
        'shadow-[0_2px_12px_-3px_rgba(0,0,0,0.04)] hover:shadow-[0_16px_36px_-6px_rgba(107,29,46,0.14)] hover:border-primary hover:-translate-y-1.5',
        variant === 'teaser' && 'w-full',
        variant === 'related' && 'min-w-[220px] max-w-[240px] shrink-0',
      )}
    >
      <Link href={`/voices/${story.slug}`} className="flex flex-col h-full">
        {/* Cover Image Container */}
        <div
          className={cn(
            'relative overflow-hidden bg-stone-100 w-full',
            variant === 'teaser' && 'h-[190px] sm:h-[200px]',
            variant === 'related' && 'h-[140px]',
            variant === 'listing' && 'aspect-[16/10]',
          )}
        >
          {story.photoUrl && !imageError ? (
            <Image
              src={story.photoUrl}
              alt={story.name}
              fill
              className="object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
              sizes={variant === 'listing' ? '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw' : '(max-width: 640px) 290px, 320px'}
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-light via-white to-primary/10">
              <span className="text-primary font-black text-[36px] tracking-tight">{story.name.slice(0, 1)}</span>
            </div>
          )}

          {/* Bottom subtle cinematic vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent pointer-events-none" />

          {/* Modern Glassmorphic Badge */}
          {story.badge ? (
            <div className="absolute top-3 left-3 z-[2] flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-md shadow-xs border border-white/60">
              <span className="size-1.5 rounded-full bg-primary" />
              <span className="text-[9.5px] font-black tracking-wider uppercase text-primary">
                {story.badge}
              </span>
            </div>
          ) : null}
        </div>

        {/* Card Content */}
        <div className={cn('flex flex-col flex-1 bg-white justify-between', compact ? 'p-3.5 sm:p-4' : 'p-5')}>
          <div>
            {/* Profile Name */}
            <h3 className="text-[15px] sm:text-[16px] font-bold text-neutral-900 group-hover:text-primary transition-colors leading-snug line-clamp-1">
              {story.name}
            </h3>

            {/* Role & Venue Subtitle */}
            {(story.role || story.venue) && (
              <p className="text-[12px] text-neutral-500 line-clamp-1 mt-0.5 font-medium">
                {[story.role, story.venue].filter(Boolean).join(' · ')}
              </p>
            )}

            {/* Editorial Pull-Quote */}
            {story.quote && (
              <p className="mt-2 text-[12px] sm:text-[12.5px] leading-relaxed text-neutral-600 italic line-clamp-2">
                &ldquo;{story.quote}&rdquo;
              </p>
            )}
          </div>

          {/* Footer Action — only on full listing page */}
          {variant === 'listing' ? (
            <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[12px] font-bold text-primary group-hover:text-primary-dark transition-colors">
                Read story
                <ArrowRight size={12} className="transition-transform duration-300 group-hover:translate-x-1" strokeWidth={2.5} />
              </span>
            </div>
          ) : null}
        </div>
      </Link>

      {/* Floating Share Button */}
      <div 
        className="absolute top-3 right-3 z-[3]"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <ShareButton 
          content={shareContent} 
          variant="overlay" 
          className="size-8 rounded-full bg-white/90 hover:bg-white text-neutral-700 shadow-xs border border-white/60 transition-transform active:scale-95" 
        />
      </div>
    </article>
  );
}
