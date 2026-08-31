// POST /api/v1/admin/impersonate/brand — Start impersonating a brand
// DELETE /api/v1/admin/impersonate/brand — Exit impersonation
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import {
  BRAND_ID_COOKIE,
  BRAND_NAME_COOKIE,
  clearAllImpersonationCookies,
  IMPERSONATION_COOKIE_MAX_AGE,
  setBuyerImpersonationCookies,
} from '@/lib/adminImpersonationCookies';
import { resolveBuyerScope } from '@/lib/resolveBuyerScope';

const IS_PROD = process.env.NODE_ENV === 'production';

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    // Same rationale as vendor impersonation: gate behind brand-management
    // permission so Viewers/Support Agents can't impersonate brands.
    requirePermission(ctx, 'brands.edit');

    const { brandId } = await req.json();
    if (!brandId) throw Errors.badRequest('brandId is required');

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: {
        id: true,
        name: true,
        userId: true,
        businessAccountId: true,
      },
    });
    if (!brand) throw Errors.notFound('Brand not found');

    const res = NextResponse.json({ success: true });
    clearAllImpersonationCookies(res);
    res.cookies.set(BRAND_ID_COOKIE, brand.id, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: IMPERSONATION_COOKIE_MAX_AGE,
    });
    res.cookies.set(BRAND_NAME_COOKIE, brand.name, {
      httpOnly: false,
      secure: IS_PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: IMPERSONATION_COOKIE_MAX_AGE,
    });

    if (brand.userId) {
      const scope = await resolveBuyerScope({
        userId: brand.userId,
        preferredBusinessAccountId: brand.businessAccountId,
      });
      if (scope) {
        setBuyerImpersonationCookies(res, {
          userId: scope.userId,
          businessAccountId: scope.businessAccountId,
          name: brand.name,
          mode: 'brand',
        });
      }
    }
    return res;
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = adminOnly(async (_req: NextRequest, _ctx) => {
  try {
    const res = NextResponse.json({ success: true });
    clearAllImpersonationCookies(res);
    return res;
  } catch (error) {
    return errorResponse(error);
  }
});
