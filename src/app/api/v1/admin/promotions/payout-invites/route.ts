// POST /api/v1/admin/promotions/payout-invites — Create a UPI payout magic link
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { promotionService } from '@/modules/promotion/promotion.service';
import { createPayoutInviteSchema } from '@/modules/promotion/promotion.validator';

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'promotions.create');
    const body = createPayoutInviteSchema.parse(await req.json());
    const invite = await promotionService.createPayoutInvite({
      createdById: ctx.userId,
      amount: body.amount,
      notes: body.notes,
      userId: body.userId,
      expiresInDays: body.expiresInDays,
    });
    logAction(ctx, req, {
      action: AUDIT_ACTIONS.payoutInviteCreate,
      entity: 'payout_invite',
      entityId: invite.id,
      after: { amount: Number(invite.amount), userId: invite.userId, expiresAt: invite.expiresAt },
    });
    return NextResponse.json({ success: true, data: invite }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
