// POST /api/v1/notifications/read-all — Mark ALL notifications as read
// WHY: "Mark all as read" button in the notification dropdown — common UX pattern
// PROTECTED: Must be logged in

import { NextResponse } from 'next/server';
import { NotificationService } from '@/modules/notification/notification.service';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const notificationService = new NotificationService();

export const POST = withAuth(async (_req, ctx) => {
  try {
    const ownerUserId = effectiveCustomerUserId(ctx);
    await notificationService.markAllRead(ownerUserId);
    return NextResponse.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    return errorResponse(error);
  }
});
