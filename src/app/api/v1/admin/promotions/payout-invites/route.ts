// GET  /api/v1/admin/promotions/payout-invites — Invite-first Cashback UPI list
// POST /api/v1/admin/promotions/payout-invites — Create a UPI payout magic link
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { promotionService } from '@/modules/promotion/promotion.service';
import { createPayoutInviteSchema, listPayoutInvitesQuerySchema } from '@/modules/promotion/promotion.validator';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'promotions.view');
    const query = listPayoutInvitesQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const search = query.search?.trim() || undefined;
    const invites = await promotionService.listPayoutInvites({
      search,
      status: search ? undefined : query.status,
      limit: query.limit,
    });
    return NextResponse.json({ success: true, data: { invites } });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'promotions.create');
    const body = createPayoutInviteSchema.parse(await req.json());
    const invite = await promotionService.createPayoutInvite({
      createdById: ctx.userId,
      amount: body.amount,
      notes: body.notes,
      referenceNumber: body.referenceNumber,
      userId: body.userId,
    });
    logAction(ctx, req, {
      action: AUDIT_ACTIONS.payoutInviteCreate,
      entity: 'payout_invite',
      entityId: invite.id,
      after: { amount: Number(invite.amount), referenceNumber: invite.referenceNumber },
    });
    return NextResponse.json({ success: true, data: invite }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
