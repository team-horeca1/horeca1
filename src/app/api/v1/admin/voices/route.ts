import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { adminOnly } from '@/middleware/rbac'
import { errorResponse, Errors } from '@/middleware/errorHandler'
import { requirePermission } from '@/lib/permissions/engine'
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog'
import { createVoiceStory, getAdminVoiceStory, listAdminVoiceStories, listAdminNominations } from '@/modules/voices/voice.admin'
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

function revalidateVoices(slug?: string) {
  revalidatePath('/')
  revalidatePath('/voices')
  if (slug) revalidatePath(`/voices/${slug}`)
}

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.view')
    const include = req.nextUrl.searchParams.get('include')
    const stories = await listAdminVoiceStories()
    if (include === 'nominations') {
      const nominations = await listAdminNominations()
      return NextResponse.json({ success: true, data: { stories, nominations } })
    }
    return NextResponse.json({ success: true, data: { stories } })
  } catch (error) {
    return errorResponse(error)
  }
})

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit')
    const parsed = storyBody.safeParse(await req.json())
    if (!parsed.success) throw Errors.badRequest('Please fill the required Voice fields')
    let story = await createVoiceStory(parsed.data)
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
      action: AUDIT_ACTIONS.voiceCreate,
      entity: 'voiceStory',
      entityId: story._id,
      after: { name: story.name, slug: story.slug, published: story.published },
    })
    return NextResponse.json({ success: true, data: story })
  } catch (error) {
    return errorResponse(error)
  }
})
