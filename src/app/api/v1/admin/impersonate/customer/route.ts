// POST /api/v1/admin/impersonate/customer — Start impersonating a customer
// DELETE /api/v1/admin/impersonate/customer — Exit impersonation

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import {
  clearAllImpersonationCookies,
  setBuyerImpersonationCookies,
} from '@/lib/adminImpersonationCookies';
import { resolveBuyerScope } from '@/lib/resolveBuyerScope';

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
      },
    });
    if (!user) throw Errors.notFound('User not found');

    const scope = await resolveBuyerScope({ userId: user.id });
    if (!scope) {
      throw Errors.badRequest('This user has no customer account to view as buyer');
    }

    const ba = await prisma.businessAccount.findUnique({
      where: { id: scope.businessAccountId },
      select: { displayName: true, legalName: true },
    });

    const displayName =
      user.fullName
      || ba?.displayName
      || ba?.legalName
      || 'Customer';

    const res = NextResponse.json({ success: true });
    clearAllImpersonationCookies(res);
    setBuyerImpersonationCookies(res, {
      userId: scope.userId,
      businessAccountId: scope.businessAccountId,
      name: displayName,
      mode: 'customer',
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
