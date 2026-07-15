// PATCH  /api/v1/admin/team/[id] — change an admin team member's role
// DELETE /api/v1/admin/team/[id] — remove a member from the admin team
//
// `[id]` is the AdminTeamMember.userId (matches the legacy contract so the
// existing front-end DELETE call site keeps working).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { markSessionStale } from '@/lib/sessionStale';
import { resolveTeamMemberRoleFromPermissions } from '@/lib/teamRoleWrites';
import { finalizeTeamMemberRemoval } from '@/lib/userHardDelete';
import type { TeamRole } from '@prisma/client';

const updateSchema = z.object({
  roleId: z.string().uuid().optional(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
}).refine(d => d.roleId || d.permissions, { message: 'Either roleId or permissions is required' });

const ADMIN_ROLE_TO_ENUM: Record<string, TeamRole> = {
  'Super Admin': 'owner',
  'Ops Admin': 'manager',
  'Finance Admin': 'manager',
  'Support Agent': 'viewer',
  Editor: 'editor',
  Viewer: 'viewer',
};

// Rank for team-role comparisons. Seeded super-admin owner has no
// AdminTeamMember row — they outrank everyone. A team-member action against
// a peer or higher rank is refused.
const ENUM_RANK: Record<TeamRole, number> = { owner: 80, manager: 60, editor: 40, viewer: 20 };
const SEEDED_OWNER_RANK = 100;
async function adminRank(userId: string): Promise<number> {
  const m = await prisma.adminTeamMember.findUnique({ where: { userId }, select: { role: true } });
  return m ? ENUM_RANK[m.role] : SEEDED_OWNER_RANK;
}

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'users.edit');
    const userId = extractId(req);

    const member = await prisma.adminTeamMember.findUnique({
      where: { userId },
      select: { id: true, role: true, roleId: true },
    });
    if (!member) throw Errors.notFound('Team member not found');

    // Rank check — caller must outrank target before mutating their role.
    const callerRank = await adminRank(ctx.userId);
    const targetRank = ENUM_RANK[member.role];
    if (callerRank <= targetRank) {
      throw Errors.forbidden('You cannot change the role of a peer or higher-ranked admin');
    }

    const body = await req.json();
    const input = updateSchema.parse(body);

    let role: { id: string; name: string; scope: string };
    if (input.permissions && Object.keys(input.permissions).length > 0) {
      role = await resolveTeamMemberRoleFromPermissions({
        scope: 'admin',
        permissions: input.permissions,
        businessAccountId: null,
        createdBy: ctx.userId,
        existingRoleId: member.roleId,
      });
    } else {
      const found = await prisma.accountRole.findUnique({
        where: { id: input.roleId! },
        select: { id: true, name: true, scope: true },
      });
      if (!found || found.scope !== 'admin') throw Errors.badRequest('roleId must reference an admin-scope role');
      role = found;
    }

    const legacyEnum: TeamRole = ADMIN_ROLE_TO_ENUM[role.name] ?? 'viewer';

    await prisma.adminTeamMember.update({
      where: { id: member.id },
      data: { roleId: role.id, role: legacyEnum },
    });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.adminTeamRoleChange,
      entity: 'AdminTeamMember',
      entityId: userId,
      before: { roleId: member.roleId, role: member.role },
      after: { roleId: role.id, role: legacyEnum, roleName: role.name },
    });

    await markSessionStale(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'users.delete');
    const rawId = extractId(req);

    if (rawId === ctx.userId) {
      throw Errors.badRequest('You cannot remove yourself from the admin team');
    }

    // Accept either AdminTeamMember.id (invite response `data.id`) or userId
    // (legacy front-end contract).
    let userId = rawId;
    let member = await prisma.adminTeamMember.findUnique({
      where: { userId: rawId },
      select: { id: true, userId: true, role: true, roleId: true },
    });
    if (!member) {
      member = await prisma.adminTeamMember.findUnique({
        where: { id: rawId },
        select: { id: true, userId: true, role: true, roleId: true },
      });
      if (member) userId = member.userId;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user || user.role !== 'admin') throw Errors.notFound('Admin user');

    // The seeded super-admin owner has no AdminTeamMember row. Without this
    // guard, ANY admin with users.delete could demote them to 'customer' and
    // lock the platform out.
    if (!member) {
      throw Errors.forbidden('The platform owner cannot be removed from the admin team');
    }

    if (userId === ctx.userId) {
      throw Errors.badRequest('You cannot remove yourself from the admin team');
    }

    // Rank check — caller must outrank target before removing them.
    const callerRank = await adminRank(ctx.userId);
    const targetRank = ENUM_RANK[member.role];
    if (callerRank <= targetRank) {
      throw Errors.forbidden('You cannot remove a peer or higher-ranked admin');
    }

    await prisma.adminTeamMember.delete({ where: { id: member.id } });

    const removal = await finalizeTeamMemberRemoval(userId, { demoteFromAdmin: true });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.adminTeamRemove,
      entity: 'AdminTeamMember',
      entityId: userId,
      before: { roleId: member.roleId, role: member.role },
      after: removal.hardDeleted ? { hardDeleted: true } : { role: 'customer', preserved: true },
    });

    return NextResponse.json({ success: true, data: removal });
  } catch (error) {
    return errorResponse(error);
  }
});
