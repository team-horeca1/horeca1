// GET   /api/v1/vendor/notifications — List in-app notifications for the vendor user
// PATCH /api/v1/vendor/notifications — Mark all unread as read
// WHY: Vendors need a central feed of events (new order, payment received, low stock, etc.)
//      so they don't miss time-sensitive actions while focused in the portal.
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import type { AuthContext } from '@/middleware/auth';
import { ADMIN_ONLY_NOTIFICATION_TITLES } from '@/lib/vendorNotifications';

export const GET = vendorOnly(async (_req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'settings.view');
    const userId = ctx.userId;

    const notifications = await prisma.notification.findMany({
      where: {
        userId,
        channel: 'in_app',
        title: { notIn: [...ADMIN_ONLY_NOTIFICATION_TITLES] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const unreadCount = notifications.filter(n => !n.readAt).length;

    return NextResponse.json({ success: true, data: { notifications, unreadCount } });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = vendorOnly(async (_req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'settings.view');
    const userId = ctx.userId;

    await prisma.notification.updateMany({
      where: { userId, channel: 'in_app', readAt: null },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
