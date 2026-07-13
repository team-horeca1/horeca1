// POST   /api/v1/admin/impersonate — Start impersonating a vendor
// GET    /api/v1/admin/impersonate — Current vendor + active outlet (Admin View)
// PATCH  /api/v1/admin/impersonate — Switch active warehouse without exiting Admin View
// DELETE /api/v1/admin/impersonate — Exit impersonation
// WHY: Allows admin to view and operate a vendor's dashboard as if they were that vendor.
//      Sets short-lived cookies that vendor API routes read to resolve the correct vendorId.
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import {
  clearAllImpersonationCookies,
  VENDOR_ID_COOKIE,
  VENDOR_NAME_COOKIE,
  VENDOR_OUTLET_COOKIE,
} from '@/lib/adminImpersonationCookies';

const COOKIE_MAX_AGE = 60 * 60 * 4; // 4 hours
const IS_PROD = process.env.NODE_ENV === 'production';

const switchOutletSchema = z.object({
  outletId: z.string().uuid(),
});

function setVendorImpersonationCookies(
  res: NextResponse,
  vendor: { id: string; businessName: string },
  outletId: string,
) {
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
  res.cookies.set(VENDOR_OUTLET_COOKIE, outletId, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

async function resolveVendorPrimaryOutletId(businessAccountId: string): Promise<string | null> {
  const ba = await prisma.businessAccount.findUnique({
    where: { id: businessAccountId },
    select: { primaryOutletId: true },
  });
  if (ba?.primaryOutletId) {
    const primary = await prisma.outlet.findFirst({
      where: { id: ba.primaryOutletId, businessAccountId, isActive: true },
      select: { id: true },
    });
    if (primary) return primary.id;
  }
  const first = await prisma.outlet.findFirst({
    where: { businessAccountId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return first?.id ?? null;
}

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'vendors.edit');
    const vendorId = req.cookies.get(VENDOR_ID_COOKIE)?.value;
    if (!vendorId) {
      return NextResponse.json({ success: true, data: null });
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        businessName: true,
        businessAccountId: true,
        businessAccount: { select: { primaryOutletId: true, displayName: true, legalName: true } },
      },
    });
    if (!vendor) {
      return NextResponse.json({ success: true, data: null });
    }

    const cookieOutletId = req.cookies.get(VENDOR_OUTLET_COOKIE)?.value;
    let outletId: string | null = null;
    if (cookieOutletId) {
      const belongs = await prisma.outlet.findFirst({
        where: {
          id: cookieOutletId,
          businessAccountId: vendor.businessAccountId,
          isActive: true,
        },
        select: { id: true },
      });
      outletId = belongs?.id ?? null;
    }
    if (!outletId) {
      outletId = await resolveVendorPrimaryOutletId(vendor.businessAccountId);
    }

    const res = NextResponse.json({
      success: true,
      data: {
        vendorId: vendor.id,
        businessName: vendor.businessName,
        businessAccountId: vendor.businessAccountId,
        primaryOutletId: vendor.businessAccount.primaryOutletId,
        displayName: vendor.businessAccount.displayName,
        legalName: vendor.businessAccount.legalName,
        outletId,
      },
    });

    // Backfill outlet cookie for Admin View sessions started before this field existed.
    if (outletId && cookieOutletId !== outletId) {
      res.cookies.set(VENDOR_OUTLET_COOKIE, outletId, {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE,
      });
    }

    return res;
  } catch (error) {
    return errorResponse(error);
  }
});

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
      select: { id: true, businessName: true, businessAccountId: true },
    });
    if (!vendor) throw Errors.notFound('Vendor not found');

    const outletId = await resolveVendorPrimaryOutletId(vendor.businessAccountId);
    if (!outletId) throw Errors.badRequest('Vendor has no outlets configured');

    const res = NextResponse.json({ success: true, data: { outletId } });
    clearAllImpersonationCookies(res);
    // The id cookie is read SERVER-SIDE only (resolveVendorId,
    // resolveBusinessAccountContext). Making it httpOnly stops XSS from
    // hijacking the impersonation token. The name cookie remains
    // client-readable so the impersonation banner UI can render.
    setVendorImpersonationCookies(res, vendor, outletId);
    return res;
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'vendors.edit');

    const vendorId = req.cookies.get(VENDOR_ID_COOKIE)?.value;
    if (!vendorId) throw Errors.badRequest('No vendor Admin View active');

    const { outletId } = switchOutletSchema.parse(await req.json());

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, businessName: true, businessAccountId: true },
    });
    if (!vendor) throw Errors.notFound('Vendor not found');

    const outlet = await prisma.outlet.findFirst({
      where: {
        id: outletId,
        businessAccountId: vendor.businessAccountId,
        isActive: true,
      },
      select: { id: true, name: true },
    });
    if (!outlet) throw Errors.badRequest('Outlet does not belong to this vendor');

    const res = NextResponse.json({
      success: true,
      data: { outletId: outlet.id, name: outlet.name },
    });
    // Refresh outlet cookie only — do not clear vendor impersonation.
    res.cookies.set(VENDOR_OUTLET_COOKIE, outlet.id, {
      httpOnly: true,
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
