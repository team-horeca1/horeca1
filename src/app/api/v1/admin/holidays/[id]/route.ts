// DELETE /api/v1/admin/holidays/[id] — remove a holiday row

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';

export const DELETE = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit');
    const id = req.nextUrl.pathname.split('/').pop();
    if (!id) throw Errors.badRequest('Missing holiday id');

    const existing = await prisma.platformHoliday.findUnique({ where: { id } });
    if (!existing) throw Errors.notFound('Holiday not found');

    await prisma.platformHoliday.delete({ where: { id } });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.settingsUpdate,
      entity: 'PlatformHoliday',
      entityId: id,
      before: {
        id: existing.id,
        holidayDate: existing.holidayDate.toISOString().slice(0, 10),
        label: existing.label,
        scope: existing.scope,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
