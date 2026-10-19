import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { adminOnly } from '@/middleware/rbac'
import { errorResponse, Errors } from '@/middleware/errorHandler'
import { requirePermission } from '@/lib/permissions/engine'
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog'
import { deleteEditorialCategory, updateEditorialCategory } from '@/modules/voices/voice.admin'

const categoryPatch = z.object({
  label: z.string().trim().min(2).max(80),
  badge: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional().nullable(),
})

function extractKey(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split('/')
  return decodeURIComponent(parts[parts.length - 1] || '')
}

function revalidateStories(slugs: string[]) {
  revalidatePath('/')
  revalidatePath('/voices')
  for (const slug of slugs) revalidatePath(`/voices/${slug}`)
}

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit')
    const key = extractKey(req)
    const parsed = categoryPatch.safeParse(await req.json())
    if (!parsed.success) throw Errors.badRequest('Name and badge are required')
    const { category, slugs } = await updateEditorialCategory(key, parsed.data)
    if (slugs.length > 0) revalidateStories(slugs)
    await logAction(ctx, req, {
      action: AUDIT_ACTIONS.voiceCategoryUpdate,
      entity: 'editorialCategory',
      entityId: category._id,
      after: { key: category.key, label: category.label, badge: category.badge },
    })
    return NextResponse.json({ success: true, data: category })
  } catch (error) {
    return errorResponse(error)
  }
})

export const DELETE = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit')
    const key = extractKey(req)
    await deleteEditorialCategory(key)
    await logAction(ctx, req, {
      action: AUDIT_ACTIONS.voiceCategoryDelete,
      entity: 'editorialCategory',
      entityId: key,
      before: { key },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
})
