import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { adminOnly } from '@/middleware/rbac'
import { errorResponse, Errors } from '@/middleware/errorHandler'
import { requirePermission } from '@/lib/permissions/engine'
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog'
import { deleteNomination, updateNomination } from '@/modules/voices/voice.admin'

const Body = z.object({
  status: z.enum(['new', 'reviewed', 'used']).optional(),
})

function extractId(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split('/')
  return decodeURIComponent(parts[parts.length - 1] || '')
}

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit')
    const id = extractId(req)
    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) throw Errors.badRequest('Invalid nomination update')
    const row = await updateNomination(id, parsed.data)
    await logAction(ctx, req, {
      action: AUDIT_ACTIONS.nominationUpdate,
      entity: 'voiceNomination',
      entityId: id,
      after: parsed.data,
    })
    return NextResponse.json({ success: true, data: row })
  } catch (error) {
    return errorResponse(error)
  }
})

export const DELETE = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit')
    const id = extractId(req)
    await deleteNomination(id)
    await logAction(ctx, req, {
      action: AUDIT_ACTIONS.nominationDelete,
      entity: 'voiceNomination',
      entityId: id,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
})
