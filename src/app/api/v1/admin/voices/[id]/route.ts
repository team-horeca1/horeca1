import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { adminOnly } from '@/middleware/rbac'
import { errorResponse, Errors } from '@/middleware/errorHandler'
import { requirePermission } from '@/lib/permissions/engine'
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog'
import {
  deleteVoiceStory,
  getAdminVoiceStory,
  updateVoiceStory,
} from '@/modules/voices/voice.admin'
import { generateVoiceShareCards, voicesSiteOrigin } from '@/modules/voices/voice.shareCards'

const CATEGORIES = ['chef', 'consultant', 'vendor', 'owner'] as const

const storyBody = z.object({
  category: z.enum(CATEGORIES),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().max(160).optional(),
  role: z.string().trim().max(160).optional().nullable(),
  venue: z.string().trim().max(160).optional().nullable(),
  quote: z.string().trim().min(4).max(90),
  bodyText: z.string().max(20000).optional(),
  recipe: z
    .object({
      dishName: z.string().max(160).optional(),
      ingredients: z.array(z.string().max(200)).optional(),
      steps: z.array(z.string().max(800)).optional(),
    })
    .optional()
    .nullable(),
  qa: z
    .array(
      z.object({
        question: z.string().max(240).optional(),
        answer: z.string().max(2000).optional(),
      }),
    )
    .optional()
    .nullable(),
  brandLinks: z
    .array(
      z.object({
        label: z.string().max(120).optional(),
        brandSlug: z.string().max(160).optional(),
      }),
    )
    .optional()
    .nullable(),
  published: z.boolean().optional(),
  publishedAt: z.string().optional().nullable(),
  photoAssetId: z.string().optional().nullable(),
  photoAlt: z.string().trim().max(200).optional().nullable(),
  clearPhoto: z.boolean().optional(),
})

function extractId(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split('/')
  return decodeURIComponent(parts[parts.length - 1] || '')
}

function revalidateVoices(slug?: string) {
  revalidatePath('/')
  revalidatePath('/voices')
  if (slug) revalidatePath(`/voices/${slug}`)
}

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.view')
    const id = extractId(req)
    const story = await getAdminVoiceStory(id)
    if (!story) throw Errors.notFound('Voice story')
    return NextResponse.json({ success: true, data: story })
  } catch (error) {
    return errorResponse(error)
  }
})

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit')
    const id = extractId(req)
    const parsed = storyBody.safeParse(await req.json())
    if (!parsed.success) throw Errors.badRequest('Please fill the required Voice fields')
    let story = await updateVoiceStory(id, parsed.data)
    revalidateVoices(story.slug)
    if (story.published) {
      try {
        await generateVoiceShareCards({
          slug: story.slug,
          id: story._id,
          origin: voicesSiteOrigin(req),
          publishedAt: story.publishedAt,
        })
        story = (await getAdminVoiceStory(story._id)) ?? story
      } catch (err) {
        console.error('[voices] share card generation failed', err)
      }
    }
    await logAction(ctx, req, {
      action: AUDIT_ACTIONS.voiceUpdate,
      entity: 'voiceStory',
      entityId: story._id,
      after: { name: story.name, slug: story.slug, published: story.published },
    })
    return NextResponse.json({ success: true, data: story })
  } catch (error) {
    return errorResponse(error)
  }
})

export const DELETE = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit')
    const id = extractId(req)
    const existing = await getAdminVoiceStory(id)
    await deleteVoiceStory(id)
    revalidateVoices(existing?.slug)
    await logAction(ctx, req, {
      action: AUDIT_ACTIONS.voiceDelete,
      entity: 'voiceStory',
      entityId: id,
      before: existing ? { name: existing.name, slug: existing.slug } : undefined,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
})
