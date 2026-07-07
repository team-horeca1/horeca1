// GET  /api/v1/admin/roles               — list admin-scope role templates + custom roles
// GET  /api/v1/admin/roles?templates=true — same (kept for symmetry with /account/[id]/roles)
// POST /api/v1/admin/roles               — create a custom admin-scope role
//
// Custom admin roles live as AccountRole rows with scope='admin',
// isTemplate=false, businessAccountId=null. Admin staff aren't part of the
// BusinessAccount system, so there's no account to scope them to.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { sanitizePermissionsForScope } from '@/lib/permissions/engine';
import type { TeamRoleDTO } from '@/lib/teamMemberShape';
import type { Prisma } from '@prisma/client';

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())),
});

export const GET = adminOnly(async (_req: NextRequest) => {
  try {
    const roles = await prisma.accountRole.findMany({
      where: { scope: 'admin', businessAccountId: null },
      orderBy: [{ isTemplate: 'desc' }, { name: 'asc' }],
      select: {
        id: true, name: true, scope: true, description: true,
        isTemplate: true, permissions: true,
      },
    });
    const data: (TeamRoleDTO & { permissions: Prisma.JsonValue })[] = roles.map((r) => ({
      id: r.id,
      name: r.name,
      scope: 'admin',
      description: r.description,
      isTemplate: r.isTemplate,
      permissions: r.permissions,
    }));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'users.create');
    const body = CreateBody.parse(await req.json());

    // Best-effort uniqueness check on (scope='admin', businessAccountId=null, name).
    // Prisma's composite unique [businessAccountId, name] treats NULL as distinct
    // in Postgres, so we enforce uniqueness manually for admin custom roles.
    const dup = await prisma.accountRole.findFirst({
      where: { scope: 'admin', businessAccountId: null, name: body.name },
      select: { id: true },
    });
    if (dup) throw Errors.conflict(`A role named "${body.name}" already exists`);

    const cleaned = sanitizePermissionsForScope(body.permissions, 'admin');
    const created = await prisma.accountRole.create({
      data: {
        businessAccountId: null,
        name: body.name,
        description: body.description ?? null,
        scope: 'admin',
        permissions: cleaned,
        isTemplate: false,
        createdBy: ctx.userId,
      },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
