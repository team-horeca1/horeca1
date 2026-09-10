import React from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, Mic2 } from 'lucide-react';
import { VoiceStoryCard } from '@/components/features/voices/VoiceStoryCard';
import { listPublishedVoiceStories } from '@/modules/voices/voice.service';

export const revalidate = 60;

export default async function VoicesIndexPage() {
  const stories = await listPublishedVoiceStories(40);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header Banner */}
      <div className="bg-gradient-to-b from-cream/80 to-background border-b border-divider/60 py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-[11px] font-bold text-text-muted uppercase tracking-widest mb-4">
            <Link href="/" className="hover:text-primary transition-colors">HOME</Link>
            <span className="text-divider">/</span>
            <span className="text-primary">HORECA1 VOICES</span>
          </nav>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-wider mb-3">
                <Sparkles size={13} />
                Industry Recognition Platform
              </span>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-text tracking-tight leading-tight">
                Horeca1 Voices
              </h1>
              <p className="text-[15px] sm:text-[17px] text-text-secondary mt-2.5 leading-relaxed">
                Celebrating the real people driving India&apos;s hospitality ecosystem — working chefs, hospitality consultants, trusted suppliers, and bold restaurateurs.
              </p>
            </div>

            {/* Top Nominate Action Button */}
            <div className="shrink-0">
              <Link
                href="/voices/nominate"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-[13px] shadow-sm transition-transform active:scale-95"
              >
                <Mic2 size={16} />
                Nominate a Voice
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stories Listing Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {stories.length === 0 ? (
          <div className="text-center py-16 px-4 rounded-3xl bg-white border border-divider">
            <span className="size-12 rounded-2xl bg-primary/10 text-primary inline-flex items-center justify-center mb-4">
              <Sparkles size={24} />
            </span>
            <h2 className="text-[18px] font-bold text-text mb-2">No Voice Stories Yet</h2>
            <p className="text-text-secondary text-[14px] max-w-md mx-auto mb-6">
              Featured editorial stories appear here once published. Know someone with an inspiring culinary or hospitality story?
            </p>
            <Link
              href="/voices/nominate"
              className="inline-flex items-center gap-1.5 text-primary font-bold text-[14px] hover:underline"
            >
              Nominate the first voice →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {stories.map((story) => (
              <VoiceStoryCard key={story.id} story={story} variant="listing" />
            ))}
          </div>
        )}

        {/* Bottom Nomination Banner Card */}
        <div className="mt-14 rounded-3xl bg-gradient-to-r from-cream via-ivory to-cream border border-divider/80 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xs">
          <div className="space-y-1.5 text-center sm:text-left max-w-xl">
            <h2 className="text-[18px] sm:text-[20px] font-bold text-text">
              Know someone with a story worth featuring?
            </h2>
            <p className="text-[13.5px] text-text-secondary leading-relaxed">
              Every week we spotlight remarkable culinary and hospitality journeys. Submit a colleague, client, or your own team.
            </p>
          </div>
          <Link
            href="/voices/nominate"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-divider hover:border-primary/40 text-text hover:text-primary font-bold text-[13px] shadow-xs transition-colors shrink-0"
          >
            <span>Nominate for Voices</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
