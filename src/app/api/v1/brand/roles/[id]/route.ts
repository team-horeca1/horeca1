// PATCH  /api/v1/brand/roles/[id] — edit a custom brand-scope role
// DELETE /api/v1/brand/roles/[id] — delete a custom brand-scope role (fails if assigned)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { brandOnly } from '@/middleware/rbac';
import { resolveBrandContext } from '@/lib/resolveBrandId';
import { requirePermission, sanitizePermissionsForScope } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { markSessionStaleForRole } from '@/lib/sessionStale';

const PatchBody = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).nullable().optional(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
});

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

export const PATCH = brandOnly(async (req: NextRequest, ctx) => {
  try {
    const { brandId } = await resolveBrandContext(ctx, req);
    requirePermission(ctx, 'users.edit');
    const roleId = extractId(req);

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { businessAccountId: true },
    });
    if (!brand) throw Errors.notFound('Brand not found');

    const role = await prisma.accountRole.findFirst({
      where: { id: roleId, businessAccountId: brand.businessAccountId, scope: 'brand' },
      select: { id: true, isTemplate: true, name: true },
    });
    if (!role) throw Errors.notFound('Role');
    if (role.isTemplate) throw Errors.badRequest('System templates cannot be edited — duplicate it first');

    const body = PatchBody.parse(await req.json());

    if (body.name && body.name !== role.name) {
      const dup = await prisma.accountRole.findFirst({
        where: {
          businessAccountId: brand.businessAccountId,
          name: body.name,
          id: { not: roleId },
        },
        select: { id: true },
      });
      if (dup) throw Errors.conflict(`A role named "${body.name}" already exists on this brand`);
    }

    const data = {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.permissions !== undefined && { permissions: sanitizePermissionsForScope(body.permissions, 'brand') }),
    };
    const updated = await prisma.accountRole.update({ where: { id: roleId }, data });
    if (body.permissions !== undefined) await markSessionStaleForRole(roleId);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = brandOnly(async (req: NextRequest, ctx) => {
  try {
    const { brandId } = await resolveBrandContext(ctx, req);
    requirePermission(ctx, 'users.delete');
    const roleId = extractId(req);

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { businessAccountId: true },
    });
    if (!brand) throw Errors.notFound('Brand not found');

    const role = await prisma.accountRole.findFirst({
      where: { id: roleId, businessAccountId: brand.businessAccountId, scope: 'brand' },
      select: {
        id: true, isTemplate: true,
        _count: { select: { userRoles: true, brandTeamMembers: true } },
      },
    });
    if (!role) throw Errors.notFound('Role');
    if (role.isTemplate) throw Errors.badRequest('System templates cannot be deleted');
    const assigned = role._count.userRoles + role._count.brandTeamMembers;
    if (assigned > 0) {
      throw Errors.conflict(`Role is assigned to ${assigned} user(s) — change their role first`);
    }

    await prisma.accountRole.delete({ where: { id: roleId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
