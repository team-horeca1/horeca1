// GET  /api/v1/admin/promotions/programs/welcome
// PATCH /api/v1/admin/promotions/programs/welcome
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { promotionService } from '@/modules/promotion/promotion.service';
import { upsertWelcomeOfferSchema } from '@/modules/promotion/promotion.validator';

export const GET = adminOnly(async (_req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'promotions.view');
    const data = await promotionService.getWelcomeOffer();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'promotions.edit');
    const body = upsertWelcomeOfferSchema.parse(await req.json());
    const before = await promotionService.getWelcomeOffer();
    const data = await promotionService.upsertWelcomeOffer(body);
    logAction(ctx, req, {
      action: AUDIT_ACTIONS.welcomeProgramUpdate,
      entity: 'welcome_offer',
      entityId: data.id,
      before: before ? { isActive: before.isActive, rewardType: before.rewardType } : null,
      after: { isActive: data.isActive, rewardType: data.rewardType, rewardValue: Number(data.rewardValue) },
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});
