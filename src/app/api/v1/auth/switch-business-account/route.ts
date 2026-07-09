/**
 * POST /api/v1/auth/switch-business-account
 *
 * Switch the active BusinessAccount on the session. The client follows with
 * `await update({ activeBusinessAccountId })` from useSession() to make
 * next-auth call the jwt callback with the new target, which re-runs
 * loadActiveContext() and rotates the JWT (including the permission set).
 *
 * This endpoint validates that the caller is a member of the target account
 * and returns the resolved active context for the client to apply via update().
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { clearAllImpersonationCookies } from '@/lib/adminImpersonationCookies';

const Body = z.object({
  businessAccountId: z.string().uuid(),
  outletId: z.string().uuid().optional(),
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const json = await req.json().catch(() => ({}));
    const { businessAccountId, outletId } = Body.parse(json);

    const membership = await prisma.businessAccountMember.findUnique({
      where: { userId_businessAccountId: { userId: ctx.userId, businessAccountId } },
      select: { id: true },
    });
    if (!membership) throw Errors.forbidden('You are not a member of this account');

    // If outletId provided, validate it belongs to the target account.
    if (outletId) {
      const outlet = await prisma.outlet.findFirst({
        where: { id: outletId, businessAccountId },
        select: { id: true },
      });
      if (!outlet) throw Errors.badRequest('Outlet does not belong to this account');
    }

    // Account switch must not leave admin impersonation cookies pointing at
    // another tenant (defense-in-depth alongside client clear).
    const res = NextResponse.json({
      success: true,
      data: { businessAccountId, outletId: outletId ?? null },
    });
    clearAllImpersonationCookies(res);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
});
