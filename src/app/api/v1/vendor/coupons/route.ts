// GET  /api/v1/vendor/coupons — List this vendor's coupons
// POST /api/v1/vendor/coupons — Create a coupon scoped to this vendor's store
// WHY: Promo Engine Phase 1 — vendors run their own coupon campaigns. A vendor
//      coupon only ever discounts that vendor's orders (enforced in the
//      promotion service, not trusted from input).
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId, resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { createCouponSchema } from '@/modules/promotion/promotion.validator';
import { couponCreateData, omitCouponAudience } from '@/modules/promotion/promotion.mappers';
import { assertVendorCouponScope } from '@/modules/promotion/promotion.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const vendorId = await resolveVendorId(ctx, req);
    requirePermission(ctx, 'promotions.view');

    const coupons = await prisma.coupon.findMany({
      where: { vendorId },
      include: { _count: { select: { redemptions: { where: { status: 'active' } } } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: coupons });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'promotions.create');

    const body = omitCouponAudience(createCouponSchema.parse(await req.json()));

    const existing = await prisma.coupon.findUnique({ where: { code: body.code } });
    if (existing) throw Errors.badRequest(`Coupon code "${body.code}" already exists`);

    await assertVendorCouponScope(prisma, vendorId, {
      productIds: body.productIds,
      categoryIds: body.categoryIds,
      brandNames: body.brandNames,
    });

    const coupon = await prisma.coupon.create({
      data: couponCreateData(body, vendorId, ctx.userId),
    });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.couponCreate,
      entity: 'coupon',
      entityId: coupon.id,
      after: { code: coupon.code, vendorId },
    });
    return NextResponse.json({ success: true, data: coupon }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
