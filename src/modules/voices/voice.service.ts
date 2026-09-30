import { client, liveClient } from '@/sanity/lib/client'
import { publishedVoicesQuery, relatedVoicesQuery, voiceBySlugQuery } from '@/sanity/lib/queries'
import { sanityOgImageUrl } from '@/sanity/lib/image'
import type { SanityImageSource } from '@sanity/image-url'
import {
  type VoiceCategory,
  type VoiceStory,
  voiceBadge,
} from '@/sanity/lib/types'

export type VoiceStoryPublic = {
  id: string
  slug: string
  badge: string
  category: VoiceCategory | string
  name: string
  role: string | null
  venue: string | null
  quote: string
  body: VoiceStory['body']
  recipe: VoiceStory['recipe']
  qa: VoiceStory['qa']
  brandLinks: VoiceStory['brandLinks']
  photoUrl: string | null
  photoOgUrl: string | null
  publishedAt: Date | null
  storyPortraitUrl: string | null
  storySquareUrl: string | null
}

function toPublic(story: VoiceStory): VoiceStoryPublic {
  return {
    id: story._id,
    slug: story.slug,
    badge: voiceBadge(story.category),
    category: story.category,
    name: story.name,
    role: story.role ?? null,
    venue: story.venue ?? null,
    quote: story.quote,
    body: story.body ?? null,
    recipe: story.recipe ?? null,
    qa: story.qa ?? null,
    brandLinks: story.brandLinks ?? null,
    photoUrl: story.photoUrl ?? null,
    photoOgUrl: sanityOgImageUrl(story.photo as SanityImageSource | null) ?? story.photoUrl ?? null,
    publishedAt: story.publishedAt ? new Date(story.publishedAt) : null,
    storyPortraitUrl: story.storyPortraitUrl ?? null,
    storySquareUrl: story.storySquareUrl ?? null,
  }
}

export const DEMO_VOICE_STORIES: VoiceStoryPublic[] = [
  {
    id: 'demo-voice-1',
    slug: 'chef-vikramaditya-sharma',
    badge: 'CHEF OF THE WEEK',
    category: 'chef',
    name: 'Chef Vikramaditya Sharma',
    role: 'Executive Chef',
    venue: 'The Grand Gourmet, Mumbai',
    quote: 'Quality ingredients and direct supplier trust are non-negotiable in fine dining.',
    body: null,
    recipe: null,
    qa: null,
    brandLinks: null,
    photoUrl: '/images/category/fruits.png',
    photoOgUrl: null,
    publishedAt: new Date(),
    storyPortraitUrl: null,
    storySquareUrl: null,
  },
  {
    id: 'demo-voice-2',
    slug: 'rhea-nair-consulting',
    badge: 'CONSULTANT SPOTLIGHT',
    category: 'consultant',
    name: 'Rhea Nair',
    role: 'Hospitality Strategist',
    venue: 'MenuCraft Solutions, Delhi NCR',
    quote: 'Consistent, verified supply chains are the secret backbone of restaurant profitability.',
    body: null,
    recipe: null,
    qa: null,
    brandLinks: null,
    photoUrl: '/images/category/dairy.png',
    photoOgUrl: null,
    publishedAt: new Date(),
    storyPortraitUrl: null,
    storySquareUrl: null,
  },
  {
    id: 'demo-voice-3',
    slug: 'anand-singhania-foodline',
    badge: 'VENDOR SPOTLIGHT',
    category: 'vendor',
    name: 'Anand Singhania',
    role: 'Managing Director',
    venue: 'Foodline Provisions, Bengaluru',
    quote: 'Partnering directly with commercial kitchens via Horeca1 cut our fulfillment cycles by 40%.',
    body: null,
    recipe: null,
    qa: null,
    brandLinks: null,
    photoUrl: '/images/category/drink-juice.png',
    photoOgUrl: null,
    publishedAt: new Date(),
    storyPortraitUrl: null,
    storySquareUrl: null,
  },
  {
    id: 'demo-voice-4',
    slug: 'pooja-dsouza-coastal-bay',
    badge: 'RESTAURATEUR SPOTLIGHT',
    category: 'owner',
    name: "Pooja D'Souza",
    role: 'Founder & Managing Partner',
    venue: 'Coastal Bay Bistro, Goa',
    quote: 'Reliable supplier cutoff times let our brigade focus on culinary craft instead of chasing deliveries.',
    body: null,
    recipe: null,
    qa: null,
    brandLinks: null,
    photoUrl: '/images/category/grains.png',
    photoOgUrl: null,
    publishedAt: new Date(),
    storyPortraitUrl: null,
    storySquareUrl: null,
  },
];

export async function listPublishedVoiceStories(limit = 20): Promise<VoiceStoryPublic[]> {
  try {
    const rows = await client.fetch<VoiceStory[]>(publishedVoicesQuery)
    if (Array.isArray(rows) && rows.length > 0) {
      return rows.slice(0, limit).map(toPublic)
    }
  } catch (error) {
    console.error('[voices] Sanity list failed', error)
  }
  return DEMO_VOICE_STORIES.slice(0, limit);
}

/** Homepage teaser: one live story per category, newest first, max 4. */
export async function listHomepageVoiceStories(): Promise<VoiceStoryPublic[]> {
  const all = await listPublishedVoiceStories(40)
  const seen = new Set<string>()
  const picked: VoiceStoryPublic[] = []
  for (const story of all) {
    const key = String(story.category)
    if (seen.has(key)) continue
    seen.add(key)
    picked.push(story)
    if (picked.length >= 4) break
  }
  return picked
}

export async function getPublishedVoiceStoryBySlug(slug: string): Promise<VoiceStoryPublic | null> {
  try {
    const row = await liveClient.fetch<VoiceStory | null>(voiceBySlugQuery, { slug })
    if (row) return toPublic(row)
  } catch (error) {
    console.error('[voices] Sanity get failed', error)
  }
  return DEMO_VOICE_STORIES.find((s) => s.slug === slug) ?? null
}

export async function listRelatedVoiceStories(slug: string, limit = 6): Promise<VoiceStoryPublic[]> {
  try {
    const rows = await client.fetch<VoiceStory[]>(relatedVoicesQuery, { slug })
    return (rows ?? []).slice(0, limit).map(toPublic)
  } catch (error) {
    console.error('[voices] Sanity related failed', error)
    return []
  }
}
