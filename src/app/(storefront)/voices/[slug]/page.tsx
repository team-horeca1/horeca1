import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ChefHat, Clock, Sparkles, Utensils, HelpCircle, Store, Share2 } from 'lucide-react';
import { notFound } from 'next/navigation';
import { PortableText, type PortableTextComponents } from '@portabletext/react';
import {
  getPublishedVoiceStoryBySlug,
  listRelatedVoiceStories,
} from '@/modules/voices/voice.service';
import { VoiceShareButton } from './VoiceShareButton';
import { VoiceStoryCard } from '@/components/features/voices/VoiceStoryCard';
import { VoicesOnThisPageSidebar, type TocSection } from './VoicesOnThisPageSidebar';
import { voiceTitleLine, VOICE_BADGES, type VoiceCategory } from '@/sanity/lib/types';
import { sanityImageUrl } from '@/sanity/lib/image';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await getPublishedVoiceStoryBySlug(slug);
  if (!story) return { title: 'Story not found' };
  const origin = process.env.AUTH_URL || 'http://localhost:3000';
  const og = story.storySquareUrl || `${origin}/api/og/voices/${slug}?format=square`;
  return {
    title: `${story.name} | Horeca1 Voices`,
    description: story.quote,
    openGraph: {
      title: story.name,
      description: story.quote,
      images: [{ url: og, width: 1080, height: 1080 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: story.name,
      description: story.quote,
      images: [og],
    },
  };
}

const portableTextComponents: PortableTextComponents = {
  types: {
    image: ({ value }) => {
      const url = sanityImageUrl(value, 1200);
      if (!url) return null;
      const alt = typeof value?.alt === 'string' ? value.alt : '';
      return (
        <figure className="my-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} className="rounded-2xl w-full object-cover border border-divider/60 shadow-sm" />
          {alt ? <figcaption className="text-[12px] text-text-muted mt-2 text-center italic">{alt}</figcaption> : null}
        </figure>
      );
    },
  },
  marks: {
    link: ({ value, children }) => {
      const href = typeof value?.href === 'string' ? value.href : '#';
      return (
        <a href={href} className="text-primary font-semibold hover:underline" target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
  },
  block: {
    normal: ({ children }) => (
      <p className="text-[16px] sm:text-[17px] leading-[1.75] text-text/90 mb-4.5 last:mb-0">{children}</p>
    ),
    h2: ({ children }) => (
      <h2 className="mt-8 mb-3 text-[22px] sm:text-[24px] font-bold text-text tracking-tight">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-6 mb-2 text-[18px] sm:text-[19px] font-bold text-text tracking-tight">{children}</h3>
    ),
    blockquote: ({ children }) => (
      <blockquote className="my-6 border-l-4 border-primary pl-4 sm:pl-5 py-2 text-[16px] sm:text-[17px] italic text-text-secondary bg-ivory/60 rounded-r-2xl">
        {children}
      </blockquote>
    ),
  },
  list: {
    bullet: ({ children }) => (
      <ul className="mb-4.5 ml-5 list-disc space-y-2 text-[16px] sm:text-[17px] leading-[1.7] text-text/90">{children}</ul>
    ),
    number: ({ children }) => (
      <ol className="mb-4.5 ml-5 list-decimal space-y-2 text-[16px] sm:text-[17px] leading-[1.7] text-text/90">{children}</ol>
    ),
  },
};

export default async function VoiceStoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await getPublishedVoiceStoryBySlug(slug);
  if (!story) notFound();
  const related = await listRelatedVoiceStories(slug, 6);
  const titleLine = voiceTitleLine(story.role, story.venue);
  const categoryLabel = VOICE_BADGES[story.category as VoiceCategory] || story.badge || 'EDITORIAL';

  // Build Table of Contents sections
  const sections: TocSection[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'story', label: 'The Story' },
  ];
  if (story.recipe && (story.recipe.ingredients?.length || story.recipe.steps?.length || story.recipe.dishName)) {
    sections.push({ id: 'recipe', label: 'Signature Recipe' });
  }
  if (story.qa && story.qa.some((item) => item.question || item.answer)) {
    sections.push({ id: 'qa', label: 'Q&A / FAQ' });
  }
  if (story.brandLinks && story.brandLinks.length > 0) {
    sections.push({ id: 'brands', label: 'Brands Mentioned' });
  }
  if (related.length > 0) {
    sections.push({ id: 'related', label: 'Related Voices' });
  }

  return (
    <article className="min-h-screen bg-background pb-24">
      {/* Top Sticky Navigation Bar */}
      <div className="bg-white/95 backdrop-blur-md border-b border-divider sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Link
            href="/voices"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Voices
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block text-[12px] font-semibold text-text-muted">
              {story.name}
            </span>
            <VoiceShareButton
              slug={slug}
              name={story.name}
              role={story.role}
              venue={story.venue}
              quote={story.quote}
              badge={story.badge}
              photoUrl={story.photoUrl}
              variant="icon"
            />
          </div>
        </div>
      </div>

      {/* Main Container: Nisha-Style Two Column Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-[11px] font-bold text-text-muted uppercase tracking-widest mb-6 overflow-x-auto no-scrollbar">
          <Link href="/" className="hover:text-primary transition-colors shrink-0">HOME</Link>
          <span className="text-divider shrink-0">/</span>
          <Link href="/voices" className="hover:text-primary transition-colors shrink-0">VOICES</Link>
          <span className="text-divider shrink-0">/</span>
          <span className="text-primary shrink-0">{categoryLabel}</span>
          <span className="text-divider shrink-0">/</span>
          <span className="text-text font-medium truncate max-w-[200px] sm:max-w-xs shrink-0">{story.name}</span>
        </nav>

        {/* 2-Column Desktop Grid */}
        <div className="lg:grid lg:grid-cols-[250px_1fr] lg:gap-14">
          {/* Left Column: Sticky Sidebar TOC (Desktop) */}
          <aside className="hidden lg:block relative self-stretch">
            <VoicesOnThisPageSidebar sections={sections} />
          </aside>

          {/* Right Column: Article Reading Experience */}
          <main className="max-w-3xl w-full">
            {/* Category Pill Badge */}
            <span className="inline-block bg-primary/10 text-primary border border-primary/20 text-[11px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              {story.badge}
            </span>

            {/* Editorial Title */}
            <h1 className="text-3xl sm:text-4xl md:text-[42px] font-extrabold text-text tracking-tight leading-[1.15] mb-3 text-balance">
              {story.name}
            </h1>

            {/* Byline & Reading Metadata Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-5 mb-6 border-b border-divider/80">
              <div className="text-[13.5px] text-text-secondary flex flex-wrap items-center gap-x-2 gap-y-1">
                {titleLine ? (
                  <span className="font-semibold text-text">{titleLine}</span>
                ) : null}
                {titleLine ? <span>·</span> : null}
                <span className="inline-flex items-center gap-1 text-text-muted">
                  <Clock size={13} />
                  3 min read
                </span>
                <span>·</span>
                <span className="text-text-muted">Editorial Feature</span>
              </div>
              <VoiceShareButton
                slug={slug}
                name={story.name}
                role={story.role}
                venue={story.venue}
                quote={story.quote}
                badge={story.badge}
                photoUrl={story.photoUrl}
                variant="outline"
              />
            </div>

            {/* Featured Hero Photo */}
            {story.photoUrl && (
              <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] rounded-2xl overflow-hidden bg-ivory shadow-xs mb-6 border border-divider/60">
                <Image
                  src={story.photoUrl}
                  alt={story.name}
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 1024px) 100vw, 768px"
                />
              </div>
            )}

            {/* Overview / Hook Pull-Quote */}
            <section id="overview" className="my-6 p-5 sm:p-6 rounded-2xl bg-cream/70 border-l-4 border-primary shadow-xs">
              <div className="flex items-start gap-3">
                <span className="text-primary/70 font-serif text-3xl sm:text-4xl leading-none select-none">“</span>
                <blockquote className="text-[17px] sm:text-[19px] font-medium leading-relaxed text-text italic text-pretty">
                  {story.quote}
                </blockquote>
              </div>
            </section>

            {/* The Story Body (Tightly spaced, comfortable line length, polished typography) */}
            {story.body && story.body.length > 0 && (
              <section id="story" className="mb-8 pt-2">
                <PortableText value={story.body} components={portableTextComponents} />
              </section>
            )}

            {/* Chef Signature Recipe Card */}
            {story.recipe && (story.recipe.ingredients?.length || story.recipe.steps?.length) ? (
              <section id="recipe" className="mb-8 rounded-2xl border border-divider/80 bg-white p-5 sm:p-6 shadow-xs">
                <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-divider/60">
                  <span className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <ChefHat size={18} />
                  </span>
                  <div>
                    <h2 className="text-[18px] font-bold text-text m-0 leading-tight">
                      {story.recipe.dishName || 'Signature Recipe'}
                    </h2>
                    <p className="text-[12px] text-text-secondary">Crafted by {story.name}</p>
                  </div>
                </div>

                {story.recipe.ingredients && story.recipe.ingredients.length > 0 && (
                  <div className="mb-5">
                    <h3 className="text-[13px] font-bold uppercase tracking-wider text-primary mb-2.5">
                      Key Ingredients
                    </h3>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[14px] text-text">
                      {story.recipe.ingredients.map((item, i) => (
                        <li key={`${i}-${item}`} className="flex items-start gap-2 bg-ivory/60 px-3 py-2 rounded-xl border border-divider/50">
                          <span className="text-primary font-bold mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {story.recipe.steps && story.recipe.steps.length > 0 && (
                  <div>
                    <h3 className="text-[13px] font-bold uppercase tracking-wider text-primary mb-2.5">
                      Preparation &amp; Method
                    </h3>
                    <ol className="space-y-3 text-[14.5px] text-text">
                      {story.recipe.steps.map((step, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <span className="size-6 rounded-full bg-primary text-white font-bold text-[12px] flex items-center justify-center shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </section>
            ) : null}

            {/* Consultant Q&A Section */}
            {story.qa && story.qa.length > 0 ? (
              <section id="qa" className="mb-8 space-y-3">
                <div className="flex items-center gap-2 mb-4">
                  <span className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <HelpCircle size={18} />
                  </span>
                    <h2 className="text-[18px] font-bold text-text m-0">Q&amp;A / FAQ</h2>
                </div>
                {story.qa.map((item, i) => (
                  <div key={i} className="rounded-2xl border border-divider/80 bg-white p-5 shadow-xs">
                    <p className="text-[15px] font-bold text-text flex items-start gap-2">
                      <span className="text-primary font-extrabold text-[14px] bg-primary/10 px-2 py-0.5 rounded-md">Q</span>
                      <span>{item.question}</span>
                    </p>
                    <div className="text-[14.5px] text-text/85 mt-2.5 pl-6 leading-relaxed text-pretty">
                      {item.answer}
                    </div>
                  </div>
                ))}
              </section>
            ) : null}

            {/* Inline Brands Mentioned */}
            {story.brandLinks && story.brandLinks.length > 0 && (
              <section id="brands" className="mb-8 p-4.5 rounded-2xl bg-ivory/70 border border-divider/70">
                <p className="text-[12px] font-bold uppercase tracking-wider text-text-secondary mb-2 flex items-center gap-1.5">
                  <Store size={14} className="text-primary" />
                  Brands Mentioned in this Feature
                </p>
                <div className="flex flex-wrap gap-2">
                  {story.brandLinks
                    .filter((b) => b.brandSlug && b.label)
                    .map((b) => (
                      <Link
                        key={b.brandSlug}
                        href={`/brand/${b.brandSlug}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-divider/80 hover:border-primary/50 text-[13px] font-semibold text-text hover:text-primary transition-colors shadow-2xs"
                      >
                        <span>{b.label}</span>
                        <span className="text-primary text-[11px] font-bold">Store →</span>
                      </Link>
                    ))}
                </div>
              </section>
            )}

            {/* Bottom Inshorts Share Callout Banner */}
            <div className="my-8 p-6 rounded-2xl bg-gradient-to-r from-cream via-ivory to-cream border border-divider flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
              <div className="space-y-1 text-center sm:text-left">
                <p className="text-[15px] font-bold text-text">Share this Inshorts Card</p>
                <p className="text-[13px] text-text-secondary">
                  Spread recognition to fellow chefs, vendors, and restaurateurs.
                </p>
              </div>
              <VoiceShareButton
                slug={slug}
                name={story.name}
                role={story.role}
                venue={story.venue}
                quote={story.quote}
                badge={story.badge}
                photoUrl={story.photoUrl}
                variant="labeled"
              />
            </div>

            {/* Related Voices Carousel / Grid */}
            {related.length > 0 && (
              <section id="related" className="mt-12 pt-8 border-t border-divider">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[18px] sm:text-[20px] font-bold text-text m-0">
                    More Industry Voices
                  </h2>
                  <Link href="/voices" className="text-[13px] font-semibold text-primary hover:underline">
                    View all stories →
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  {related.slice(0, 3).map((item) => (
                    <VoiceStoryCard key={item.id} story={item} variant="listing" />
                  ))}
                </div>
              </section>
            )}
          </main>
        </div>
      </div>
    </article>
  );
}
