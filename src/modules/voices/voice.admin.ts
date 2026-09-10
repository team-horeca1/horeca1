import 'server-only'
import type { SanityClient } from '@sanity/client'
import { getWriteClient } from '@/sanity/lib/writeClient'
import { liveClient } from '@/sanity/lib/client'
import {
  adminNominationsQuery,
  adminVoiceByIdQuery,
  adminVoicesQuery,
} from '@/sanity/lib/queries'
import type { VoiceBrandLink, VoiceCategory, VoiceQa, VoiceRecipe, VoiceStory } from '@/sanity/lib/types'
import { ApiError } from '@/middleware/errorHandler'
import { plainTextToBlocks } from './portableText'

export type AdminNomination = {
  _id: string
  nomineeName: string
  category: string
  contact: string
  reason: string
  nominatorName: string | null
  relationship: string | null
  status: string
  _createdAt: string
}

export type VoiceStoryInput = {
  category: VoiceCategory
  name: string
  slug?: string
  role?: string | null
  venue?: string | null
  quote: string
  bodyText?: string
  recipe?: VoiceRecipe | null
  qa?: VoiceQa[] | null
  brandLinks?: VoiceBrandLink[] | null
  published?: boolean
  publishedAt?: string | null
  photoAssetId?: string | null
  photoAlt?: string | null
  clearPhoto?: boolean
}

export function requireVoicesWriteClient(): SanityClient {
  const client = getWriteClient()
  if (!client) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'Voices CMS is not configured', 503)
  }
  return client
}

export async function listAdminVoiceStories(): Promise<VoiceStory[]> {
  const rows = await liveClient.fetch<VoiceStory[]>(adminVoicesQuery)
  return rows ?? []
}

export async function getAdminVoiceStory(id: string): Promise<VoiceStory | null> {
  return liveClient.fetch<VoiceStory | null>(adminVoiceByIdQuery, { id })
}

export async function listAdminNominations(): Promise<AdminNomination[]> {
  const rows = await liveClient.fetch<AdminNomination[]>(adminNominationsQuery)
  return rows ?? []
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function withKeys<T extends Record<string, unknown>>(items: T[] | null | undefined, typeName?: string): T[] {
  if (!items?.length) return []
  return items.map((item, i) => ({
    ...item,
    _key: typeof item._key === 'string' && item._key ? item._key : `k${i}_${i}`,
    ...(typeName ? { _type: typeName } : {}),
  }))
}

function storyDoc(input: VoiceStoryInput): Record<string, unknown> {
  const slug = slugify(input.slug || input.name)
  const published = input.published === true
  const publishedAt =
    published
      ? input.publishedAt || new Date().toISOString()
      : input.publishedAt || null

  const doc: Record<string, unknown> = {
    _type: 'voiceStory',
    category: input.category,
    name: input.name.trim(),
    slug: { _type: 'slug', current: slug },
    role: input.role?.trim() || undefined,
    venue: input.venue?.trim() || undefined,
    quote: input.quote.trim(),
    body: plainTextToBlocks(input.bodyText ?? ''),
    recipe: input.recipe ?? undefined,
    qa: withKeys(input.qa ?? []),
    brandLinks: withKeys(input.brandLinks ?? []),
    published,
    publishedAt,
  }

  if (input.photoAssetId) {
    doc.photo = {
      _type: 'image',
      asset: { _type: 'reference', _ref: input.photoAssetId },
      alt: input.photoAlt?.trim() || input.name.trim(),
    }
  }

  return doc
}

export async function createVoiceStory(input: VoiceStoryInput): Promise<VoiceStory> {
  const write = requireVoicesWriteClient()
  const slug = slugify(input.slug || input.name)
  if (!slug) throw new ApiError('BAD_REQUEST', 'Could not generate a slug', 400)

  const created = await write.create({ ...storyDoc(input), _type: 'voiceStory' })
  const row = await getAdminVoiceStory(created._id)
  if (!row) throw new ApiError('NOT_FOUND', 'Voice story not found after create', 404)
  return row
}

export async function updateVoiceStory(id: string, input: VoiceStoryInput): Promise<VoiceStory> {
  const write = requireVoicesWriteClient()
  const existing = await getAdminVoiceStory(id)
  if (!existing) throw new ApiError('NOT_FOUND', 'Voice story not found', 404)

  const doc = storyDoc(input)
  const patch = write.patch(id).set(doc)
  if (input.clearPhoto) patch.unset(['photo'])
  else if (!input.photoAssetId && input.photoAlt != null && existing.photoUrl) {
    patch.set({ 'photo.alt': input.photoAlt.trim() || input.name.trim() })
  }
  await patch.commit()

  const row = await getAdminVoiceStory(id)
  if (!row) throw new ApiError('NOT_FOUND', 'Voice story not found after update', 404)
  return row
}

export async function deleteVoiceStory(id: string): Promise<void> {
  const write = requireVoicesWriteClient()
  const existing = await getAdminVoiceStory(id)
  if (!existing) throw new ApiError('NOT_FOUND', 'Voice story not found', 404)
  await write.delete(id)
}

export async function uploadVoicePhoto(file: File): Promise<{ assetId: string; url: string }> {
  const write = requireVoicesWriteClient()
  const bytes = Buffer.from(await file.arrayBuffer())
  const filename = file.name.replace(/[^\w.\-]+/g, '-').slice(0, 80) || 'voice-photo.jpg'
  const asset = await write.assets.upload('image', bytes, {
    filename,
    contentType: file.type || 'image/jpeg',
  })
  const url = typeof asset.url === 'string' ? asset.url : ''
  return { assetId: asset._id, url }
}

export async function updateNomination(
  id: string,
  data: { status?: 'new' | 'reviewed' | 'used' },
): Promise<AdminNomination> {
  const write = requireVoicesWriteClient()
  await write.patch(id).set(data).commit()
  const rows = await listAdminNominations()
  const row = rows.find((n) => n._id === id)
  if (!row) throw new ApiError('NOT_FOUND', 'Nomination not found', 404)
  return row
}

export async function deleteNomination(id: string): Promise<void> {
  const write = requireVoicesWriteClient()
  await write.delete(id)
}
