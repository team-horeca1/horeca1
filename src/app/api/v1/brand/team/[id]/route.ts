// PATCH  /api/v1/brand/team/[id] — change a brand team member's role
// DELETE /api/v1/brand/team/[id] — remove a member from the brand team

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { brandOnly } from '@/middleware/rbac';
import { resolveBrandContext } from '@/lib/resolveBrandId';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { markSessionStale } from '@/lib/sessionStale';
import { finalizeTeamMemberRemoval } from '@/lib/userHardDelete';
import { resolveTeamMemberRoleFromPermissions } from '@/lib/teamRoleWrites';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import type { TeamRole } from '@prisma/client';

const updateSchema = z.object({
  roleId: z.string().uuid().optional(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
}).refine(d => d.roleId || d.permissions, { message: 'Either roleId or permissions is required' });

const BRAND_ROLE_TO_ENUM: Record<string, TeamRole> = {
  'Brand Admin': 'owner',
  'Brand Manager': 'manager',
  'Brand Editor': 'editor',
  'Brand Viewer': 'viewer',
};

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

export const PATCH = brandOnly(async (req: NextRequest, ctx) => {
  try {
    const { brandId } = await resolveBrandContext(ctx, req);
    requirePermission(ctx, 'users.edit');
    const id = extractId(req);

    const member = await prisma.brandTeamMember.findFirst({
      where: { id, brandId },
      select: { id: true, role: true, roleId: true, userId: true },
    });
    if (!member) throw Errors.notFound('Team member not found');

    const body = await req.json();
    const input = updateSchema.parse(body);

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { businessAccountId: true },
    });
    if (!brand) throw Errors.notFound('Brand not found');
    if (!brand.businessAccountId) throw Errors.badRequest('This brand has no linked account yet.');

    let role: { id: string; name: string; scope: string };
    if (input.permissions && Object.keys(input.permissions).length > 0) {
      role = await resolveTeamMemberRoleFromPermissions({
        scope: 'brand',
        permissions: input.permissions,
        businessAccountId: brand.businessAccountId,
        createdBy: ctx.userId,
        existingRoleId: member.roleId,
      });
    } else {
      const found = await prisma.accountRole.findUnique({
        where: { id: input.roleId! },
        select: { id: true, name: true, scope: true },
      });
      if (!found || found.scope !== 'brand') throw Errors.badRequest('roleId must reference a brand-scope role');
      role = found;
    }

    const legacyEnum: TeamRole = BRAND_ROLE_TO_ENUM[role.name] ?? 'viewer';
    const userId = member.userId;
    const businessAccountId = brand.businessAccountId;

    await prisma.$transaction(async (tx) => {
      await tx.brandTeamMember.update({
        where: { id: member.id },
        data: { roleId: role.id, role: legacyEnum },
      });

      await tx.userRole.deleteMany({
        where: {
          userId,
          businessAccountId,
          outletId: null,
          role: { scope: 'brand' },
        },
      });
      await tx.userRole.create({
        data: { userId, businessAccountId, outletId: null, roleId: role.id },
      });
    });

    await markSessionStale(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = brandOnly(async (req: NextRequest, ctx) => {
  try {
    const { brandId } = await resolveBrandContext(ctx, req);
    requirePermission(ctx, 'users.delete');
    const id = extractId(req);

    const member = await prisma.brandTeamMember.findFirst({
      where: { id, brandId },
      select: { id: true, userId: true },
    });
    if (!member) throw Errors.notFound('Team member not found');

    if (member.userId === ctx.userId) {
      throw Errors.badRequest('You cannot remove yourself from the team');
    }

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { businessAccountId: true },
    });
    if (!brand) throw Errors.notFound('Brand not found');
    if (!brand.businessAccountId) throw Errors.badRequest('This brand has no linked account yet.');
    // Copy to a local const so the non-null narrowing survives into the
    // transaction closure below (TS resets property narrowing across callbacks).
    const businessAccountId = brand.businessAccountId;

    await prisma.$transaction(async (tx) => {
      await tx.brandTeamMember.delete({ where: { id: member.id } });

      await tx.userRole.deleteMany({
        where: {
          userId: member.userId,
          businessAccountId,
          role: { scope: 'brand' },
        },
      });
    });

    const removal = await finalizeTeamMemberRemoval(member.userId);

    return NextResponse.json({ success: true, data: removal });
  } catch (error) {
    return errorResponse(error);
  }
});
