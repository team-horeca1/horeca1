// POST /api/v1/admin/promotions/grant — Direct "User Cashback" incentive
// WHY: Promo brief type 1 — admin rewards an individual user directly.
//      Wallet grants credit instantly; UPI grants enter the payout queue
//      and the user is nudged in-app to claim with their UPI ID.
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { promotionService } from '@/modules/promotion/promotion.service';
import { directGrantSchema } from '@/modules/promotion/promotion.validator';
import { ledgerLiveEnabled } from '@/modules/ledger/flags';

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'promotions.create');
    const body = directGrantSchema.parse(await req.json());
    const idempotencyKey = req.headers.get('idempotency-key')?.trim() || null;
    if (ledgerLiveEnabled() && !idempotencyKey) {
      throw Errors.badRequest('Idempotency-Key is required');
    }

    const entry = await promotionService.grantDirectIncentive({
      adminId: ctx.userId,
      userId: body.userId,
      amount: body.amount,
      destination: body.destination,
      notes: body.notes,
      idempotencyKey,
    });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.cashbackGrant,
      entity: 'cashback_entry',
      entityId: entry.id,
      after: { userId: body.userId, amount: body.amount, destination: body.destination },
    });
    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
