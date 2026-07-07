// PATCH /api/v1/admin/users/[id]/password — reset any user's login password (superadmin)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resetPasswordByAdmin } from '@/modules/auth/admin-password.service';

const schema = z.object({
  password: z.string().min(6).max(72),
});

function extractUserId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 2];
}

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'users.edit');
    const userId = extractUserId(req);
    const { password } = schema.parse(await req.json());
    await resetPasswordByAdmin(ctx, userId, password, req);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
