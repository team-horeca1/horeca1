'use client';

import React from 'react';
import { ShareButton } from '@/components/features/share/ShareButton';
import { articleShareContent } from '@/lib/share-cards/types';

export function VoiceShareButton({
  slug,
  name,
  quote = 'Stories from the industry, for the industry.',
  role,
  venue,
  badge,
  photoUrl,
  preRenderedImageUrl,
  variant = 'labeled',
  className = '',
}: {
  slug: string;
  name: string;
  quote?: string;
  role?: string | null;
  venue?: string | null;
  badge?: string;
  photoUrl?: string | null;
  preRenderedImageUrl?: string | null;
  variant?: 'labeled' | 'icon' | 'outline';
  className?: string;
}) {
  const content = articleShareContent({
    slug,
    name,
    quote,
    role,
    venue,
    photoUrl,
    preRenderedImageUrl,
  });

  return (
    <ShareButton
      content={content}
      variant={variant}
      className={className}
      label={variant === 'labeled' ? 'Share this story' : variant === 'outline' ? 'Share story' : undefined}
      stopPropagation={false}
    />
  );
}
