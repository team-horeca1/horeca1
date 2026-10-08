import type { PortableTextBlock } from '@portabletext/types'

export type VoiceCategory = 'chef' | 'consultant' | 'vendor' | 'owner' | (string & {})

export type VoiceRecipe = {
  dishName?: string
  ingredients?: string[]
  steps?: string[]
}

export type VoiceQa = {
  question?: string
  answer?: string
}

export type VoiceBrandLink = {
  label?: string
  brandSlug?: string
}

export type VoiceStory = {
  _id: string
  category: VoiceCategory
  categoryBadge?: string | null
  name: string
  slug: string
  role: string | null
  venue: string | null
  quote: string
  photoUrl: string | null
  photoAlt: string | null
  photo?: unknown
  body: PortableTextBlock[] | null
  recipe: VoiceRecipe | null
  qa: VoiceQa[] | null
  brandLinks: VoiceBrandLink[] | null
  published: boolean
  publishedAt: string | null
  storyPortraitUrl: string | null
  storySquareUrl: string | null
}

export const VOICE_BADGES: Record<string, string> = {
  chef: 'CHEF OF THE WEEK',
  consultant: 'CONSULTANT SPOTLIGHT',
  vendor: 'VENDOR SPOTLIGHT',
  owner: 'RESTAURATEUR SPOTLIGHT',
}

export function voiceBadge(
  category: string | null | undefined,
  categoryBadge?: string | null,
): string {
  const stored = categoryBadge?.trim()
  if (stored) return stored
  if (category && category in VOICE_BADGES) {
    return VOICE_BADGES[category]
  }
  return category ? category.replace(/[-_]/g, ' ').toUpperCase() : 'HORECA1 VOICES'
}

export function voiceTitleLine(role: string | null, venue: string | null): string {
  return [role, venue].filter(Boolean).join(' · ')
}
