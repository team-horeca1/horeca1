// PATCH /api/v1/vendor/promotions/payout-invites/:id — Mark this vendor's claimed invite as paid
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { promotionService } from '@/modules/promotion/promotion.service';
import { markEntryPaidSchema } from '@/modules/promotion/promotion.validator';

function extractId(req: NextRequest) {
  return new URL(req.url).pathname.split('/').at(-1) ?? '';
}

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'promotions.edit');
    const id = extractId(req);
    const body = markEntryPaidSchema.parse(await req.json());

    const invite = await prisma.payoutInvite.findFirst({
      where: { id, vendorId },
      select: { cashbackEntryId: true },
    });
    if (!invite?.cashbackEntryId) throw Errors.notFound('Payout invite');

    const entry = await promotionService.markEntryPaid(invite.cashbackEntryId, ctx.userId, body.paidReference);
    logAction(ctx, req, {
      action: AUDIT_ACTIONS.cashbackMarkPaid,
      entity: 'cashback_entry',
      entityId: entry.id,
      after: { amount: Number(entry.amount), paidReference: body.paidReference, vendorId },
    });
    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    return errorResponse(error);
  }
});
