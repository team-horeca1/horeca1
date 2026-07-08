// POST /api/v1/admin/impersonate/customer — Start impersonating a customer
// DELETE /api/v1/admin/impersonate/customer — Exit impersonation

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import {
  CUSTOMER_BA_COOKIE,
  CUSTOMER_NAME_COOKIE,
  CUSTOMER_USER_COOKIE,
} from '@/lib/resolveCustomerImpersonation';

const COOKIE_MAX_AGE = 60 * 60 * 4;
const IS_PROD = process.env.NODE_ENV === 'production';

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'customers.edit');

    const { userId } = await req.json();
    if (!userId) throw Errors.badRequest('userId is required');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        accountMemberships: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          take: 1,
          select: {
            businessAccountId: true,
            businessAccount: { select: { isCustomer: true, displayName: true, legalName: true } },
          },
        },
      },
    });
    if (!user) throw Errors.notFound('User not found');

    const membership = user.accountMemberships[0];
    if (!membership?.businessAccountId) {
      throw Errors.badRequest('This user has no business account to view as customer');
    }

    const displayName =
      user.fullName
      || membership.businessAccount.displayName
      || membership.businessAccount.legalName
      || 'Customer';

    const res = NextResponse.json({ success: true });
    res.cookies.set(CUSTOMER_USER_COOKIE, user.id, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });
    res.cookies.set(CUSTOMER_BA_COOKIE, membership.businessAccountId, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });
    res.cookies.set(CUSTOMER_NAME_COOKIE, encodeURIComponent(displayName), {
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
    res.cookies.set(CUSTOMER_USER_COOKIE, '', { maxAge: 0, path: '/' });
    res.cookies.set(CUSTOMER_BA_COOKIE, '', { maxAge: 0, path: '/' });
    res.cookies.set(CUSTOMER_NAME_COOKIE, '', { maxAge: 0, path: '/' });
    return res;
  } catch (error) {
    return errorResponse(error);
  }
});
