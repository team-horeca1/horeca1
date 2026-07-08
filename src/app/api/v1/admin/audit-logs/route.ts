import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { errorResponse } from '@/middleware/errorHandler';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'auditLogs.view');

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
    const cursor = searchParams.get('cursor');

    const logs = await prisma.auditLog.findMany({
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { at: 'desc' },
      select: {
        id: true,
        actorId: true,
        actorRole: true,
        action: true,
        entity: true,
        entityId: true,
        ip: true,
        at: true,
      },
    });

    const hasMore = logs.length > limit;
    const data = hasMore ? logs.slice(0, limit) : logs;
    const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

    return NextResponse.json({ success: true, data, nextCursor });
  } catch (error) {
    return errorResponse(error);
  }
});
