/**
 * GET  /api/v1/account/[id]/roles            — list custom roles for the account
 * GET  /api/v1/account/[id]/roles?templates=true — also include system templates
 * POST /api/v1/account/[id]/roles            — create a custom role (requires users.create)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { errorResponse } from '@/middleware/errorHandler';
import { assertCanMutateAccount } from '@/lib/accountAccess';
import { sanitizePermissionsForScope } from '@/lib/permissions/engine';
import { filterRolesForDisplay } from '@/lib/teamRoleWrites';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const id = extractAccountId(req);
    await assertCanMutateAccount(ctx, id, 'users.view', ctx.activeOutletId);
    const includeTemplates = new URL(req.url).searchParams.get('templates') === 'true';
    const roles = await prisma.accountRole.findMany({
      where: includeTemplates
        ? { OR: [{ businessAccountId: id }, { isTemplate: true }] }
        : { businessAccountId: id },
      orderBy: [{ isTemplate: 'desc' }, { name: 'asc' }],
    });
    const assigned = await prisma.userRole.findMany({
      where: { businessAccountId: id },
      select: { roleId: true },
    });
    const assignedIds = new Set(assigned.map((r) => r.roleId));
    return NextResponse.json({ success: true, data: filterRolesForDisplay(roles, assignedIds) });
  } catch (err) { return errorResponse(err); }
});

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  scope: z.enum(['account', 'vendor', 'brand', 'admin', 'delivery']).default('account'),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())),
  duplicatedFromTemplate: z.string().uuid().optional(),  // for analytics / audit
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const id = extractAccountId(req);
    await assertCanMutateAccount(ctx, id, 'users.create', ctx.activeOutletId);
    const body = CreateBody.parse(await req.json());
    const cleanedPerms = sanitizePermissionsForScope(body.permissions, body.scope);
    const created = await prisma.accountRole.create({
      data: {
        businessAccountId: id,
        name: body.name,
        description: body.description,
        scope: body.scope,
        permissions: cleanedPerms,
        isTemplate: false,
        createdBy: ctx.userId,
      },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err) { return errorResponse(err); }
});

function extractAccountId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../account/<id>/roles
  return segments[segments.length - 2];
}
