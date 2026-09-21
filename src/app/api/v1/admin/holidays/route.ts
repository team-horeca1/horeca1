// GET  /api/v1/admin/holidays — list holidays (optional ?from=&to= ISO dates)
// POST /api/v1/admin/holidays — create a holiday (scope fixed to all_india)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { HolidayScope } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';

function serialize(h: {
  id: string;
  holidayDate: Date;
  label: string;
  scope: HolidayScope;
  createdAt: Date;
}) {
  return {
    id: h.id,
    holidayDate: h.holidayDate.toISOString().slice(0, 10),
    label: h.label,
    scope: h.scope,
    createdAt: h.createdAt.toISOString(),
  };
}

const createSchema = z.object({
  holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  label: z.string().min(1).max(255),
});

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.view');
    const from = req.nextUrl.searchParams.get('from');
    const to = req.nextUrl.searchParams.get('to');

    const where: { holidayDate?: { gte?: Date; lte?: Date } } = {};
    if (from || to) {
      where.holidayDate = {};
      if (from) where.holidayDate.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) where.holidayDate.lte = new Date(`${to}T00:00:00.000Z`);
    }

    const rows = await prisma.platformHoliday.findMany({
      where,
      orderBy: { holidayDate: 'asc' },
    });

    return NextResponse.json({ success: true, data: rows.map(serialize) });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit');
    const body = createSchema.parse(await req.json());
    const holidayDate = new Date(`${body.holidayDate}T00:00:00.000Z`);

    const existing = await prisma.platformHoliday.findFirst({
      where: { holidayDate, scope: HolidayScope.all_india },
    });
    if (existing) throw Errors.conflict('A holiday already exists for this date');

    const created = await prisma.platformHoliday.create({
      data: {
        holidayDate,
        label: body.label.trim(),
        scope: HolidayScope.all_india,
      },
    });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.settingsUpdate,
      entity: 'PlatformHoliday',
      entityId: created.id,
      after: serialize(created),
    });

    return NextResponse.json({ success: true, data: serialize(created) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
