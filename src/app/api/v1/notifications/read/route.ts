// POST /api/v1/notifications/read — Mark a specific notification as read
// WHY: When user clicks on a notification, we mark it as read so the badge count decreases
// PROTECTED: Must be logged in

import { NextRequest, NextResponse } from 'next/server';
import { NotificationService } from '@/modules/notification/notification.service';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const notificationService = new NotificationService();

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = await req.json();
    const { notificationId } = body;

    if (!notificationId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'notificationId required' } },
        { status: 400 }
      );
    }

    const ownerUserId = effectiveCustomerUserId(ctx);
    await notificationService.markRead(notificationId, ownerUserId);
    return NextResponse.json({ success: true, message: 'Marked as read' });
  } catch (error) {
    return errorResponse(error);
  }
});
