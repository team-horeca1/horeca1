'use client';

import React, { useState } from 'react';
import { Share2 } from 'lucide-react';
import { InshortsShareModal } from '@/components/features/voices/InshortsShareModal';

export function VoiceShareButton({
  slug,
  name,
  quote = 'Stories from the industry, for the industry.',
  role,
  venue,
  badge,
  photoUrl,
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
  variant?: 'labeled' | 'icon' | 'outline';
  className?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`size-10 rounded-full border border-divider/80 bg-white hover:bg-ivory hover:border-primary/40 flex items-center justify-center transition-all shadow-xs group ${className}`}
          aria-label="Share this story"
        >
          <Share2 size={16} className="text-primary group-hover:scale-110 transition-transform" />
        </button>
      ) : variant === 'outline' ? (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`inline-flex items-center gap-2 text-[13px] font-semibold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 hover:border-primary/40 px-3.5 py-2 rounded-xl transition-all ${className}`}
        >
          <Share2 size={15} />
          Share story
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`inline-flex items-center gap-2 text-[13px] font-bold text-white bg-primary hover:bg-primary-dark px-4 py-2.5 rounded-xl shadow-xs transition-transform active:scale-95 ${className}`}
        >
          <Share2 size={15} />
          Share this story
        </button>
      )}

      <InshortsShareModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        story={{
          slug,
          name,
          quote,
          role,
          venue,
          badge,
          photoUrl,
        }}
      />
    </>
  );
}
