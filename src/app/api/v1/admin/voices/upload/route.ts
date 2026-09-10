import { NextRequest, NextResponse } from 'next/server'
import { adminOnly } from '@/middleware/rbac'
import { errorResponse, Errors } from '@/middleware/errorHandler'
import { requirePermission } from '@/lib/permissions/engine'
import { uploadVoicePhoto } from '@/modules/voices/voice.admin'

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit')
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File) || file.size <= 0) {
      throw Errors.badRequest('Choose a photo to upload')
    }
    if (!ALLOWED.has(file.type)) {
      throw Errors.badRequest('Use a JPEG, PNG, WebP, or GIF photo')
    }
    if (file.size > 8 * 1024 * 1024) {
      throw Errors.badRequest('Photo must be under 8MB')
    }
    const data = await uploadVoicePhoto(file)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return errorResponse(error)
  }
})
