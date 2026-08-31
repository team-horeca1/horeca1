/**
 * POST /api/v1/auth/switch-outlet
 *
 * Switch the active Outlet within the current BusinessAccount.
 * Client follows with `await update({ activeOutletId })` from useSession().
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { clearAllImpersonationCookies } from '@/lib/adminImpersonationCookies';

const Body = z.object({ outletId: z.string().uuid() });

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    if (ctx.impersonatedBuyer) {
      throw Errors.forbidden('Not available in Admin View. Exit Admin View first.');
    }
    if (!ctx.activeBusinessAccountId) throw Errors.forbidden('No active business account on the session');
    const { outletId } = Body.parse(await req.json().catch(() => ({})));

    // Per-outlet scoped users may only switch to outlets they have a UserRole for.
    if (ctx.accessibleOutletIds.length > 0 && !ctx.accessibleOutletIds.includes(outletId)) {
      throw Errors.forbidden('You do not have access to that outlet');
    }

    const outlet = await prisma.outlet.findFirst({
      where: { id: outletId, businessAccountId: ctx.activeBusinessAccountId },
      select: { id: true, requiresAddressUpdate: true },
    });
    if (!outlet) throw Errors.badRequest('Outlet does not belong to the active account');

    const res = NextResponse.json({
      success: true,
      data: { outletId: outlet.id, requiresAddressUpdate: outlet.requiresAddressUpdate },
    });
    clearAllImpersonationCookies(res);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
});
