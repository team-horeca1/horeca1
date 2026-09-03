'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Share2, ArrowRight } from 'lucide-react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { toast } from 'sonner';

interface VoiceStoryCard {
  id: string;
  slug: string;
  badge: string;
  name: string;
  role: string | null;
  venue: string | null;
  quote: string;
  photoUrl: string | null;
}

export function VoicesSection() {
  const [stories, setStories] = useState<VoiceStoryCard[]>([]);

  useEffect(() => {
    fetch('/api/v1/voices')
      .then((r) => r.json())
      .then((json) => {
        if (json?.success && Array.isArray(json.data)) {
          setStories(json.data);
        }
      })
      .catch(() => {});
  }, []);

  if (stories.length === 0) return null;

  const share = async (slug: string, name: string) => {
    const url = `${window.location.origin}/voices/${slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: name, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <section className="w-full py-6 md:py-8 bg-white">
      <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
        <SectionHeader
          title="Horeca1 Voices"
          subtitle="Stories from the industry, for the industry"
          actionLabel="Meet more →"
          actionHref="/voices"
        />
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {stories.map((s) => (
            <article
              key={s.id}
              className="min-w-[240px] max-w-[280px] shrink-0 bg-ivory border border-divider rounded-xl overflow-hidden shadow-cdl-1"
            >
              <div className="relative h-[120px] bg-gradient-to-br from-[#E9E3DD] to-[#FAF5EC]">
                {s.photoUrl ? (
                  <Image
                    src={s.photoUrl}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="280px"
                  />
                ) : null}
                <span className="absolute top-2 left-2 bg-primary text-white text-[9px] font-bold px-2 py-1 rounded-md z-[1]">
                  {s.badge}
                </span>
                <button
                  type="button"
                  onClick={() => share(s.slug, s.name)}
                  className="absolute top-2 right-2 size-8 rounded-full bg-white/95 flex items-center justify-center border border-divider z-[1]"
                  aria-label="Share story"
                >
                  <Share2 size={14} className="text-primary" />
                </button>
              </div>
              <div className="p-3">
                <h3 className="text-[15px] font-bold text-text m-0">{s.name}</h3>
                {(s.role || s.venue) && (
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    {[s.role, s.venue].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p className="text-[12px] text-text-secondary mt-2 line-clamp-3 text-pretty">&ldquo;{s.quote}&rdquo;</p>
                <Link
                  href={`/voices/${s.slug}`}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary mt-3 hover:underline"
                >
                  Read feature
                  <ArrowRight size={14} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
