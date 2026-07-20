// POST   /api/v1/admin/impersonate — Start impersonating an Online Store
// GET    /api/v1/admin/impersonate — Current Admin View hierarchy (supplier → businesses → stores)
// PATCH  /api/v1/admin/impersonate — Switch Online Store (vendorId) or legacy warehouse (outletId)
// DELETE /api/v1/admin/impersonate — Exit impersonation

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

const patchSchema = z.object({
  vendorId: z.string().uuid().optional(),
  outletId: z.string().uuid().optional(),
}).refine((b) => Boolean(b.vendorId || b.outletId), {
  message: 'vendorId or outletId is required',
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

function storeLabel(v: {
  displayName: string | null;
  businessName: string;
}): string {
  return (v.displayName ?? v.businessName).trim() || v.businessName;
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
        displayName: true,
        businessAccountId: true,
        userId: true,
        isPrimaryStore: true,
        isActive: true,
        defaultOutletId: true,
        businessAccount: {
          select: { primaryOutletId: true, displayName: true, legalName: true },
        },
        user: {
          select: { id: true, email: true, phone: true, fullName: true, hcidDisplay: true },
        },
      },
    });
    if (!vendor) {
      return NextResponse.json({ success: true, data: null });
    }

    // Full hierarchy for this Supplier (same HCID / userId)
    const memberships = await prisma.businessAccountMember.findMany({
      where: { userId: vendor.userId, businessAccount: { isVendor: true } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: {
        isPrimary: true,
        businessAccount: {
          select: {
            id: true,
            legalName: true,
            displayName: true,
            status: true,
            primaryOutletId: true,
            vendors: {
              orderBy: [{ isPrimaryStore: 'desc' }, { createdAt: 'asc' }],
              select: {
                id: true,
                businessName: true,
                displayName: true,
                isActive: true,
                isPrimaryStore: true,
                businessAccountId: true,
                defaultOutletId: true,
              },
            },
          },
        },
      },
    });

    const businesses = memberships.map((m) => ({
      id: m.businessAccount.id,
      legalName: m.businessAccount.legalName,
      displayName: m.businessAccount.displayName,
      status: m.businessAccount.status,
      isPrimary: m.isPrimary,
      stores: m.businessAccount.vendors.map((s) => ({
        id: s.id,
        displayName: storeLabel(s),
        businessAccountId: s.businessAccountId,
        isActive: s.isActive,
        isPrimaryStore: s.isPrimaryStore,
      })),
    }));

    const stores = businesses.flatMap((b) => b.stores);

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
      outletId =
        vendor.defaultOutletId
        ?? (await resolveVendorPrimaryOutletId(vendor.businessAccountId));
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
        supplier: {
          userId: vendor.user.id,
          email: vendor.user.email,
          phone: vendor.user.phone,
          fullName: vendor.user.fullName,
          hcid: vendor.user.hcidDisplay,
        },
        businesses,
        stores,
      },
    });

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
    requirePermission(ctx, 'vendors.edit');

    const body = await req.json() as { vendorId?: string; supplierUserId?: string };
    const { vendorId, supplierUserId } = body;

    if (!vendorId && !supplierUserId) {
      throw Errors.badRequest('supplierUserId or vendorId is required');
    }

    let vendor: {
      id: string;
      businessName: string;
      businessAccountId: string;
      defaultOutletId: string | null;
      displayName: string | null;
      user: { fullName: string | null; email: string | null } | null;
    } | null = null;

    if (supplierUserId) {
      // Impersonate Supplier → land on primary/active Online Store cookie, UI → overview
      vendor = await prisma.vendor.findFirst({
        where: {
          userId: supplierUserId,
          OR: [{ isActive: true }, { isPrimaryStore: true }],
        },
        orderBy: [{ isPrimaryStore: 'desc' }, { isActive: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          businessName: true,
          displayName: true,
          businessAccountId: true,
          defaultOutletId: true,
          user: { select: { fullName: true, email: true } },
        },
      });
      if (!vendor) {
        vendor = await prisma.vendor.findFirst({
          where: { userId: supplierUserId },
          orderBy: [{ isPrimaryStore: 'desc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            businessName: true,
            displayName: true,
            businessAccountId: true,
            defaultOutletId: true,
            user: { select: { fullName: true, email: true } },
          },
        });
      }
      if (!vendor) throw Errors.notFound('Supplier has no Online Stores');
    } else {
      vendor = await prisma.vendor.findUnique({
        where: { id: vendorId! },
        select: {
          id: true,
          businessName: true,
          displayName: true,
          businessAccountId: true,
          defaultOutletId: true,
          user: { select: { fullName: true, email: true } },
        },
      });
      if (!vendor) throw Errors.notFound('Online Store not found');
    }

    const outletId =
      vendor.defaultOutletId
      ?? (await resolveVendorPrimaryOutletId(vendor.businessAccountId));
    if (!outletId) throw Errors.badRequest('Online Store has no outlets configured');

    const label = supplierUserId
      ? (vendor.user?.fullName?.trim() || vendor.user?.email || storeLabel(vendor))
      : storeLabel(vendor);

    const res = NextResponse.json({
      success: true,
      data: {
        outletId,
        vendorId: vendor.id,
        supplierUserId: supplierUserId ?? null,
        landAt: '/vendor/overview',
      },
    });
    clearAllImpersonationCookies(res);
    setVendorImpersonationCookies(res, { id: vendor.id, businessName: label }, outletId);
    return res;
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'vendors.edit');

    const currentVendorId = req.cookies.get(VENDOR_ID_COOKIE)?.value;
    if (!currentVendorId) throw Errors.badRequest('No supplier Admin View active');

    const body = patchSchema.parse(await req.json());

    const current = await prisma.vendor.findUnique({
      where: { id: currentVendorId },
      select: { id: true, userId: true, businessAccountId: true, businessName: true },
    });
    if (!current) throw Errors.notFound('Online Store not found');

    // Switch Online Store among the same Supplier's stores
    if (body.vendorId) {
      const target = await prisma.vendor.findUnique({
        where: { id: body.vendorId },
        select: {
          id: true,
          userId: true,
          businessName: true,
          businessAccountId: true,
          defaultOutletId: true,
        },
      });
      if (!target) throw Errors.notFound('Online Store not found');
      if (target.userId !== current.userId) {
        throw Errors.forbidden('Online Store belongs to a different supplier');
      }

      const outletId =
        target.defaultOutletId
        ?? (await resolveVendorPrimaryOutletId(target.businessAccountId));
      if (!outletId) throw Errors.badRequest('Online Store has no outlets configured');

      const res = NextResponse.json({
        success: true,
        data: {
          vendorId: target.id,
          businessAccountId: target.businessAccountId,
          outletId,
        },
      });
      setVendorImpersonationCookies(res, target, outletId);
      return res;
    }

    // Legacy: switch warehouse outlet within current store's Business
    const outletId = body.outletId!;
    const outlet = await prisma.outlet.findFirst({
      where: {
        id: outletId,
        businessAccountId: current.businessAccountId,
        isActive: true,
      },
      select: { id: true, name: true },
    });
    if (!outlet) throw Errors.badRequest('Outlet does not belong to this Online Store');

    const res = NextResponse.json({
      success: true,
      data: { outletId: outlet.id, name: outlet.name, vendorId: current.id },
    });
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
