/**
 * PATCH  /api/v1/account/[id]/roles/[roleId] — update permissions / name (requires users.edit)
 * DELETE /api/v1/account/[id]/roles/[roleId] — delete role (requires users.delete; fails if assigned)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { assertCanMutateAccount } from '@/lib/accountAccess';
import { sanitizePermissionsForScope } from '@/lib/permissions/engine';
import { markSessionStale } from '@/lib/sessionStale';

const PatchBody = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).nullable().optional(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { id, roleId } = extractIds(req);
    await assertCanMutateAccount(ctx, id, 'users.edit', ctx.activeOutletId);
    const role = await prisma.accountRole.findFirst({ where: { id: roleId, businessAccountId: id }, select: { id: true, isTemplate: true, scope: true } });
    if (!role) throw Errors.notFound('Role');
    if (role.isTemplate) throw Errors.badRequest('System templates cannot be edited; duplicate and customize instead');
    const body = PatchBody.parse(await req.json());
    const data = {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.permissions !== undefined && {
        permissions: sanitizePermissionsForScope(body.permissions, role.scope as 'account' | 'vendor' | 'brand' | 'admin' | 'delivery'),
      }),
    };
    const updated = await prisma.accountRole.update({ where: { id: roleId }, data });
    const affected = await prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
      distinct: ['userId'],
    });
    await Promise.all(affected.map((r) => markSessionStale(r.userId)));
    return NextResponse.json({ success: true, data: updated });
  } catch (err) { return errorResponse(err); }
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { id, roleId } = extractIds(req);
    await assertCanMutateAccount(ctx, id, 'users.delete', ctx.activeOutletId);
    const role = await prisma.accountRole.findFirst({ where: { id: roleId, businessAccountId: id }, select: { id: true, isTemplate: true, _count: { select: { userRoles: true } } } });
    if (!role) throw Errors.notFound('Role');
    if (role.isTemplate) throw Errors.badRequest('System templates cannot be deleted');
    if (role._count.userRoles > 0) throw Errors.conflict(`Role is assigned to ${role._count.userRoles} user(s); remove assignments first`);
    await prisma.accountRole.delete({ where: { id: roleId } });
    return NextResponse.json({ success: true });
  } catch (err) { return errorResponse(err); }
});

function extractIds(req: NextRequest) {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../account/<id>/roles/<roleId>
  return { id: segments[segments.length - 3], roleId: segments[segments.length - 1] };
}
