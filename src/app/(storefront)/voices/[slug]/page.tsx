import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getPublishedVoiceStoryBySlug } from '@/modules/voices/voice.service';
import { VoiceShareButton } from './VoiceShareButton';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await getPublishedVoiceStoryBySlug(slug);
  if (!story) return { title: 'Story not found' };
  return {
    title: `${story.name} | Horeca1 Voices`,
    description: story.quote,
    openGraph: {
      title: story.name,
      description: story.quote,
      images: [`/voices/${slug}/opengraph-image`],
    },
  };
}

export default async function VoiceStoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await getPublishedVoiceStoryBySlug(slug);
  if (!story) notFound();

  return (
    <article className="min-h-screen bg-background pb-24">
      <div className="bg-white border-b border-divider sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-1 text-[14px] font-medium text-primary">
            <ArrowLeft size={18} />
            Home
          </Link>
          <VoiceShareButton slug={slug} name={story.name} />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <span className="inline-block bg-primary text-white text-[11px] font-bold px-3 py-1 rounded-full mb-4">
          {story.badge}
        </span>
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] font-bold text-primary text-balance mb-2">{story.name}</h1>
        {(story.role || story.venue) && (
          <p className="text-text-secondary text-[15px] mb-6">
            {[story.role, story.venue].filter(Boolean).join(' · ')}
          </p>
        )}
        <blockquote className="text-[18px] leading-relaxed text-text font-medium border-l-4 border-primary pl-4 mb-8 text-pretty">
          &ldquo;{story.quote}&rdquo;
        </blockquote>
        {story.body && (
          <div className="prose prose-sm max-w-none text-text-secondary text-[15px] leading-relaxed whitespace-pre-line text-pretty">
            {story.body}
          </div>
        )}
      </div>
    </article>
  );
}
