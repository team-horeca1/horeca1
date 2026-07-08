// POST /api/v1/admin/impersonate — Start impersonating a vendor
// DELETE /api/v1/admin/impersonate — Exit impersonation
// WHY: Allows admin to view and operate a vendor's dashboard as if they were that vendor.
//      Sets short-lived cookies that vendor API routes read to resolve the correct vendorId.
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import {
  clearAllImpersonationCookies,
  VENDOR_ID_COOKIE,
  VENDOR_NAME_COOKIE,
} from '@/lib/adminImpersonationCookies';

const COOKIE_MAX_AGE = 60 * 60 * 4; // 4 hours
const IS_PROD = process.env.NODE_ENV === 'production';

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    // Impersonation lets an admin act as the vendor — gate behind the same
    // permission that lets them manage vendor accounts. Plain adminOnly was
    // letting Viewers and Support Agents impersonate freely.
    requirePermission(ctx, 'vendors.edit');

    const { vendorId } = await req.json();
    if (!vendorId) throw Errors.badRequest('vendorId is required');

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, businessName: true },
    });
    if (!vendor) throw Errors.notFound('Vendor not found');

    const res = NextResponse.json({ success: true });
    clearAllImpersonationCookies(res);
    // The id cookie is read SERVER-SIDE only (resolveVendorId,
    // resolveBusinessAccountContext). Making it httpOnly stops XSS from
    // hijacking the impersonation token. The name cookie remains
    // client-readable so the impersonation banner UI can render.
    res.cookies.set(VENDOR_ID_COOKIE, vendor.id, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });
    res.cookies.set(VENDOR_NAME_COOKIE, vendor.businessName, {
      httpOnly: false,
      secure: IS_PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });
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
