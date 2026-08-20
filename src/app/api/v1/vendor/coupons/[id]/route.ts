// PATCH  /api/v1/vendor/coupons/:id — Update own coupon
// DELETE /api/v1/vendor/coupons/:id — Delete own coupon (deactivate if used)
// PROTECTED: Vendor only — scoped to the resolved vendor

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { updateCouponSchema } from '@/modules/promotion/promotion.validator';
import { couponUpdateData, omitCouponAudience } from '@/modules/promotion/promotion.mappers';
import { assertVendorCouponScope } from '@/modules/promotion/promotion.service';

function extractId(req: NextRequest) {
  return new URL(req.url).pathname.split('/').at(-1) ?? '';
}

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'promotions.edit');

    const id = extractId(req);
    const body = omitCouponAudience(updateCouponSchema.parse(await req.json()));

    const existing = await prisma.coupon.findFirst({ where: { id, vendorId } });
    if (!existing) throw Errors.notFound('Coupon');

    await assertVendorCouponScope(prisma, vendorId, {
      productIds: body.productIds,
      categoryIds: body.categoryIds,
      brandNames: body.brandNames,
    });

    const updated = await prisma.coupon.update({ where: { id }, data: couponUpdateData(body) });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.couponUpdate,
      entity: 'coupon',
      entityId: id,
      before: { isActive: existing.isActive },
      after: { isActive: updated.isActive },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'promotions.delete');

    const id = extractId(req);
    const existing = await prisma.coupon.findFirst({
      where: { id, vendorId },
      include: { _count: { select: { redemptions: true } } },
    });
    if (!existing) throw Errors.notFound('Coupon');

    if (existing._count.redemptions > 0) {
      await prisma.coupon.update({ where: { id }, data: { isActive: false } });
      logAction(ctx, req, {
        action: AUDIT_ACTIONS.couponDelete,
        entity: 'coupon',
        entityId: id,
        metadata: { deactivatedInsteadOfDeleted: true },
      });
      return NextResponse.json({ success: true, data: { deactivated: true } });
    }

    await prisma.coupon.delete({ where: { id } });
    logAction(ctx, req, { action: AUDIT_ACTIONS.couponDelete, entity: 'coupon', entityId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
