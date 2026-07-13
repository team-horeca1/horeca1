// GET /api/v1/notifications — List notifications for the current user
// WHY: Powers the notification bell icon in the navbar
//      Shows: "Order #PO-2026-123456 confirmed", "Payment received", "Low stock alert", etc.
// PROTECTED: Must be logged in
// SUPPORTS: ?type=order&read=false&cursor=xxx&limit=20

import { NextRequest, NextResponse } from 'next/server';
import { NotificationService } from '@/modules/notification/notification.service';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';
import type { NotificationChannel } from '@prisma/client';

const notificationService = new NotificationService();

const VALID_CHANNELS: NotificationChannel[] = ['email', 'sms', 'whatsapp', 'in_app', 'push'];

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const params = req.nextUrl.searchParams;
    const channelParam = params.get('channel');
    const channel = channelParam && VALID_CHANNELS.includes(channelParam as NotificationChannel)
      ? (channelParam as NotificationChannel)
      : undefined;
    const options = {
      type: params.get('type') || undefined,
      channel,
      read: params.has('read') ? params.get('read') === 'true' : undefined,
      cursor: params.get('cursor') || undefined,
      limit: params.has('limit') ? Number(params.get('limit')) : undefined,
    };

    // While viewing as a customer, show that customer's inbox — not the admin JWT user's.
    const ownerUserId = effectiveCustomerUserId(ctx);
    const result = await notificationService.list(ownerUserId, options);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});
