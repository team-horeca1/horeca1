import 'server-only'
import type { SanityClient } from '@sanity/client'
import { getWriteClient } from '@/sanity/lib/writeClient'
import { liveClient } from '@/sanity/lib/client'
import {
  adminNominationsQuery,
  adminVoiceByIdQuery,
  adminVoicesQuery,
  editorialCategoriesQuery,
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

export type EditorialCategory = {
  _id: string
  key: string
  label: string
  badge: string
  description: string | null
  isDefault: boolean
}

export type EditorialCategoryInput = {
  key: string
  label: string
  badge: string
  description?: string | null
}

const DEFAULT_EDITORIAL_CATEGORIES: Array<Omit<EditorialCategory, '_id'>> = [
  { key: 'chef', label: 'Chef of the Week', badge: 'CHEF OF THE WEEK', description: 'Highlighting executive chefs and rising culinary stars', isDefault: true },
  { key: 'consultant', label: 'Consultant Spotlight', badge: 'CONSULTANT SPOTLIGHT', description: 'Industry experts, menu developers and restaurant consultants', isDefault: true },
  { key: 'vendor', label: 'Vendor Spotlight', badge: 'VENDOR SPOTLIGHT', description: 'Featured suppliers, farmers, distributors, and artisanal brands', isDefault: true },
  { key: 'owner', label: 'Restaurateur Spotlight', badge: 'RESTAURATEUR SPOTLIGHT', description: 'Hospitality founders, café owners, and business leaders', isDefault: true },
]

const DEFAULT_CATEGORY_ORDER = DEFAULT_EDITORIAL_CATEGORIES.map((cat) => cat.key)
const CATEGORY_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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

function sortEditorialCategories(rows: EditorialCategory[]): EditorialCategory[] {
  return [...rows].sort((a, b) => {
    const ai = DEFAULT_CATEGORY_ORDER.indexOf(a.key)
    const bi = DEFAULT_CATEGORY_ORDER.indexOf(b.key)
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    }
    return a.label.localeCompare(b.label)
  })
}

function assertCategoryKey(key: string): string {
  const normalized = key.trim().toLowerCase()
  if (!CATEGORY_KEY.test(normalized) || normalized.length > 40) {
    throw new ApiError('BAD_REQUEST', 'Category key must be a short lowercase slug', 400)
  }
  return normalized
}

async function fetchEditorialCategories(): Promise<EditorialCategory[]> {
  const rows = await liveClient.fetch<EditorialCategory[]>(editorialCategoriesQuery)
  return sortEditorialCategories(rows ?? [])
}

export async function listEditorialCategories(): Promise<EditorialCategory[]> {
  const rows = await fetchEditorialCategories()
  if (rows.length > 0) return rows

  const write = requireVoicesWriteClient()
  await Promise.all(
    DEFAULT_EDITORIAL_CATEGORIES.map((cat) =>
      write.createIfNotExists({
        _id: `editorialCategory.${cat.key}`,
        _type: 'editorialCategory',
        key: cat.key,
        label: cat.label,
        badge: cat.badge,
        description: cat.description,
        isDefault: true,
      }),
    ),
  )
  const seeded = await fetchEditorialCategories()
  if (seeded.length > 0) return seeded
  return DEFAULT_EDITORIAL_CATEGORIES.map((cat) => ({
    ...cat,
    _id: `editorialCategory.${cat.key}`,
  }))
}

async function categoryByKey(key: string): Promise<EditorialCategory | null> {
  const categories = await listEditorialCategories()
  return categories.find((cat) => cat.key === key) ?? null
}

async function categoryBadgeFor(category: string): Promise<string> {
  const match = await categoryByKey(category)
  if (!match) throw new ApiError('BAD_REQUEST', 'Choose an editorial category', 400)
  return match.badge
}

async function patchStoryBadges(key: string, categoryBadge: string): Promise<string[]> {
  const ids = await liveClient.fetch<string[]>(
    '*[_type == "voiceStory" && category == $key]._id',
    { key },
  )
  if (!ids?.length) return []
  const write = requireVoicesWriteClient()
  for (const id of ids) {
    await write.patch(id).set({ categoryBadge }).commit()
  }
  const slugs = await liveClient.fetch<string[]>(
    '*[_type == "voiceStory" && category == $key && defined(slug.current)].slug.current',
    { key },
  )
  return slugs ?? []
}

export async function createEditorialCategory(input: EditorialCategoryInput): Promise<EditorialCategory> {
  const key = assertCategoryKey(input.key)
  const label = input.label.trim()
  const badge = input.badge.trim()
  if (label.length < 2) throw new ApiError('BAD_REQUEST', 'Category name is required', 400)
  if (badge.length < 2) throw new ApiError('BAD_REQUEST', 'Badge label is required', 400)

  const existing = await categoryByKey(key)
  if (existing) throw new ApiError('BAD_REQUEST', 'A category with this key already exists', 400)

  const write = requireVoicesWriteClient()
  const created = await write.create({
    _id: `editorialCategory.${key}`,
    _type: 'editorialCategory',
    key,
    label,
    badge,
    description: input.description?.trim() || '',
    isDefault: false,
  })
  return {
    _id: created._id,
    key,
    label,
    badge,
    description: input.description?.trim() || null,
    isDefault: false,
  }
}

export async function updateEditorialCategory(
  key: string,
  input: Pick<EditorialCategoryInput, 'label' | 'badge' | 'description'>,
): Promise<{ category: EditorialCategory; slugs: string[] }> {
  const normalized = assertCategoryKey(key)
  const current = await categoryByKey(normalized)
  if (!current) throw new ApiError('NOT_FOUND', 'Editorial category not found', 404)

  const label = input.label.trim()
  const badge = input.badge.trim()
  if (label.length < 2) throw new ApiError('BAD_REQUEST', 'Category name is required', 400)
  if (badge.length < 2) throw new ApiError('BAD_REQUEST', 'Badge label is required', 400)
  const description = input.description?.trim() || null

  const write = requireVoicesWriteClient()
  await write.patch(current._id).set({ label, badge, description: description || '' }).commit()

  const slugs = badge !== current.badge ? await patchStoryBadges(normalized, badge) : []
  return {
    category: { ...current, label, badge, description },
    slugs,
  }
}

export async function deleteEditorialCategory(key: string): Promise<void> {
  const normalized = assertCategoryKey(key)
  const current = await categoryByKey(normalized)
  if (!current) throw new ApiError('NOT_FOUND', 'Editorial category not found', 404)
  if (current.isDefault) {
    throw new ApiError('BAD_REQUEST', 'Built-in categories cannot be deleted', 400)
  }
  const storyCount = await liveClient.fetch<number>(
    'count(*[_type == "voiceStory" && category == $key])',
    { key: normalized },
  )
  if (storyCount > 0) {
    throw new ApiError('BAD_REQUEST', 'This category is still used by stories', 400)
  }
  const write = requireVoicesWriteClient()
  await write.delete(current._id)
}

function storyDoc(input: VoiceStoryInput, categoryBadge: string): Record<string, unknown> {
  const slug = slugify(input.slug || input.name)
  const published = input.published === true
  const publishedAt =
    published
      ? input.publishedAt || new Date().toISOString()
      : input.publishedAt || null

  const doc: Record<string, unknown> = {
    _type: 'voiceStory',
    category: input.category,
    categoryBadge,
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
  const categoryBadge = await categoryBadgeFor(input.category)

  const created = await write.create({ ...storyDoc(input, categoryBadge), _type: 'voiceStory' })
  const row = await getAdminVoiceStory(created._id)
  if (!row) throw new ApiError('NOT_FOUND', 'Voice story not found after create', 404)
  return row
}

export async function updateVoiceStory(id: string, input: VoiceStoryInput): Promise<VoiceStory> {
  const write = requireVoicesWriteClient()
  const existing = await getAdminVoiceStory(id)
  if (!existing) throw new ApiError('NOT_FOUND', 'Voice story not found', 404)

  const categoryBadge = await categoryBadgeFor(input.category)
  const doc = storyDoc(input, categoryBadge)
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
