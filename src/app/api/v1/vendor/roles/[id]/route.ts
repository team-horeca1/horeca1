// PATCH  /api/v1/vendor/roles/[id] — edit a custom vendor-scope role
// DELETE /api/v1/vendor/roles/[id] — delete a custom vendor-scope role (fails if assigned)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission, sanitizePermissionsForScope } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { Errors, errorResponse } from '@/middleware/errorHandler';

const PatchBody = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).nullable().optional(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
});

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'users.edit');
    const roleId = extractId(req);

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { businessAccountId: true },
    });
    if (!vendor) throw Errors.notFound('Vendor not found');

    const role = await prisma.accountRole.findFirst({
      where: { id: roleId, businessAccountId: vendor.businessAccountId, scope: 'vendor' },
      select: { id: true, isTemplate: true, name: true },
    });
    if (!role) throw Errors.notFound('Role');
    if (role.isTemplate) throw Errors.badRequest('System templates cannot be edited — duplicate it first');

    const body = PatchBody.parse(await req.json());

    if (body.name && body.name !== role.name) {
      const dup = await prisma.accountRole.findFirst({
        where: {
          businessAccountId: vendor.businessAccountId,
          name: body.name,
          id: { not: roleId },
        },
        select: { id: true },
      });
      if (dup) throw Errors.conflict(`A role named "${body.name}" already exists on this vendor`);
    }

    const data = {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.permissions !== undefined && { permissions: sanitizePermissionsForScope(body.permissions, 'vendor') }),
    };
    const updated = await prisma.accountRole.update({ where: { id: roleId }, data });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'users.delete');
    const roleId = extractId(req);

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { businessAccountId: true },
    });
    if (!vendor) throw Errors.notFound('Vendor not found');

    const role = await prisma.accountRole.findFirst({
      where: { id: roleId, businessAccountId: vendor.businessAccountId, scope: 'vendor' },
      select: {
        id: true, isTemplate: true,
        _count: { select: { userRoles: true, vendorTeamMembers: true } },
      },
    });
    if (!role) throw Errors.notFound('Role');
    if (role.isTemplate) throw Errors.badRequest('System templates cannot be deleted');
    const assigned = role._count.userRoles + role._count.vendorTeamMembers;
    if (assigned > 0) {
      throw Errors.conflict(`Role is assigned to ${assigned} user(s) — change their role first`);
    }

    await prisma.accountRole.delete({ where: { id: roleId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
