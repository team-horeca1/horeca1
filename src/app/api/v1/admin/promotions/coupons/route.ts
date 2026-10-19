// GET  /api/v1/admin/promotions/coupons — List all coupons (platform + vendor)
// POST /api/v1/admin/promotions/coupons — Create a PLATFORM coupon
// WHY: Promo Engine Phase 1 — admin runs platform-wide coupon campaigns;
//      vendor coupons are listed here read-only for oversight.
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { createCouponSchema } from '@/modules/promotion/promotion.validator';
import { couponCreateData } from '@/modules/promotion/promotion.mappers';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'promotions.view');
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope'); // 'platform' | 'vendor' | null = all

    const coupons = await prisma.coupon.findMany({
      where: {
        ...(scope === 'platform' ? { vendorId: null } : {}),
        ...(scope === 'vendor' ? { vendorId: { not: null } } : {}),
      },
      include: {
        vendor: { select: { id: true, businessName: true, displayName: true } },
        _count: { select: { redemptions: { where: { status: 'active' } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: coupons });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'promotions.create');
    const body = createCouponSchema.parse(await req.json());

    const existing = await prisma.coupon.findUnique({ where: { code: body.code } });
    if (existing) throw Errors.badRequest(`Coupon code "${body.code}" already exists`);

    const coupon = await prisma.coupon.create({
      data: couponCreateData(body, null, ctx.userId),
    });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.couponCreate,
      entity: 'coupon',
      entityId: coupon.id,
      after: { code: coupon.code, discountType: coupon.discountType, discountValue: Number(coupon.discountValue) },
    });
    return NextResponse.json({ success: true, data: coupon }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
