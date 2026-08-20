// GET  /api/v1/admin/promotions/programs/referral
// PATCH /api/v1/admin/promotions/programs/referral
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { promotionService } from '@/modules/promotion/promotion.service';
import { upsertReferralProgramSchema } from '@/modules/promotion/promotion.validator';

export const GET = adminOnly(async (_req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'promotions.view');
    const data = await promotionService.getReferralProgram();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'promotions.edit');
    const body = upsertReferralProgramSchema.parse(await req.json());
    const before = await promotionService.getReferralProgram();
    const data = await promotionService.upsertReferralProgram(body);
    logAction(ctx, req, {
      action: AUDIT_ACTIONS.referralProgramUpdate,
      entity: 'referral_program',
      entityId: data.id,
      before: before ? { isActive: before.isActive, trigger: before.trigger } : null,
      after: { isActive: data.isActive, trigger: data.trigger },
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});
