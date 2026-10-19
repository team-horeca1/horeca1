import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { adminOnly } from '@/middleware/rbac'
import { errorResponse, Errors } from '@/middleware/errorHandler'
import { requirePermission } from '@/lib/permissions/engine'
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog'
import { createEditorialCategory, listEditorialCategories } from '@/modules/voices/voice.admin'

const categoryBody = z.object({
  key: z.string().trim().min(1).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  label: z.string().trim().min(2).max(80),
  badge: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional().nullable(),
})

export const GET = adminOnly(async (_req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.view')
    const categories = await listEditorialCategories()
    return NextResponse.json({ success: true, data: { categories } })
  } catch (error) {
    return errorResponse(error)
  }
})

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit')
    const parsed = categoryBody.safeParse(await req.json())
    if (!parsed.success) throw Errors.badRequest('Name, key, and badge are required')
    const category = await createEditorialCategory(parsed.data)
    await logAction(ctx, req, {
      action: AUDIT_ACTIONS.voiceCategoryCreate,
      entity: 'editorialCategory',
      entityId: category._id,
      after: { key: category.key, label: category.label, badge: category.badge },
    })
    return NextResponse.json({ success: true, data: category })
  } catch (error) {
    return errorResponse(error)
  }
})
