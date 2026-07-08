/**
 * PATCH  /api/v1/account/[id]/users/[userId] — set the user's role assignments for this account
 *                                              (replaces all UserRole rows; requires users.edit)
 * DELETE /api/v1/account/[id]/users/[userId] — remove the user from the account
 *                                              (requires users.delete; refuses to remove last owner)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { assertAccountPermission } from '@/lib/accountAccess';
import { markSessionStale } from '@/lib/sessionStale';
import { finalizeTeamMemberRemoval } from '@/lib/userHardDelete';

const PatchBody = z.object({
  assignments: z.array(z.object({
    roleId: z.string().uuid(),
    outletId: z.string().uuid().nullable().optional(),
  })),
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { id, userId } = extractIds(req);
    await assertAccountPermission(ctx.userId, id, 'users.edit', ctx.activeOutletId);
    const body = PatchBody.parse(await req.json());

    // Validate every role + outlet ref belongs to the account
    const roleIds = Array.from(new Set(body.assignments.map((a) => a.roleId)));
    const validRoles = await prisma.accountRole.findMany({
      where: { id: { in: roleIds }, OR: [{ businessAccountId: id }, { isTemplate: true }] },
      select: { id: true },
    });
    if (validRoles.length !== roleIds.length) throw Errors.badRequest('One or more roles are not available for this account');

    const outletIds = Array.from(new Set(body.assignments.map((a) => a.outletId).filter((o): o is string => !!o)));
    if (outletIds.length) {
      const validOutlets = await prisma.outlet.findMany({
        where: { id: { in: outletIds }, businessAccountId: id },
        select: { id: true },
      });
      if (validOutlets.length !== outletIds.length) throw Errors.badRequest('One or more outlets do not belong to this account');
    }

    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId, businessAccountId: id } });
      if (body.assignments.length > 0) {
        await tx.userRole.createMany({
          data: body.assignments.map((a) => ({
            userId, businessAccountId: id, outletId: a.outletId ?? null, roleId: a.roleId,
          })),
        });
      }
    });
    await markSessionStale(userId);
    return NextResponse.json({ success: true });
  } catch (err) { return errorResponse(err); }
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { id, userId } = extractIds(req);
    await assertAccountPermission(ctx.userId, id, 'users.delete', ctx.activeOutletId);

    // Don't remove the last Owner — would orphan the account.
    const ownerTemplate = await prisma.accountRole.findFirst({
      where: { businessAccountId: null, isTemplate: true, name: 'Owner', scope: 'account' },
      select: { id: true },
    });
    if (ownerTemplate) {
      const otherOwnersCount = await prisma.userRole.count({
        where: { businessAccountId: id, roleId: ownerTemplate.id, userId: { not: userId } },
      });
      const targetIsOwner = await prisma.userRole.count({
        where: { businessAccountId: id, roleId: ownerTemplate.id, userId },
      });
      if (targetIsOwner > 0 && otherOwnersCount === 0) {
        throw Errors.conflict('Cannot remove the last Owner of the account');
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId, businessAccountId: id } });
      await tx.businessAccountMember.delete({
        where: { userId_businessAccountId: { userId, businessAccountId: id } },
      });
    });

    const removal = await finalizeTeamMemberRemoval(userId);

    return NextResponse.json({ success: true, data: removal });
  } catch (err) { return errorResponse(err); }
});

function extractIds(req: NextRequest) {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../account/<id>/users/<userId>
  return { id: segments[segments.length - 3], userId: segments[segments.length - 1] };
}
