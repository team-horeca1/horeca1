import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';
import type { TeamRole } from '@prisma/client';
import type { AuthContext } from '@/middleware/auth';
import { Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import type { PermissionKey } from '@/lib/permissions/registry';
import { prisma } from '@/lib/prisma';
import { markSessionStale } from '@/lib/sessionStale';
import { AUDIT_ACTIONS, logAction } from '@/lib/auditLog';

const ENUM_RANK: Record<TeamRole, number> = { owner: 80, manager: 60, editor: 40, viewer: 20 };
const SEEDED_OWNER_RANK = 100;

const ROLE_PERMISSION: Record<string, PermissionKey> = {
  customer: 'customers.edit',
  vendor: 'vendors.edit',
  brand: 'brands.edit',
  admin: 'users.edit',
};

async function adminRank(userId: string): Promise<number> {
  const m = await prisma.adminTeamMember.findUnique({ where: { userId }, select: { role: true } });
  return m ? ENUM_RANK[m.role] : SEEDED_OWNER_RANK;
}

async function assertAdminTeamResetAllowed(ctx: AuthContext, targetUserId: string): Promise<void> {
  requirePermission(ctx, 'users.edit');

  if (ctx.userId === targetUserId) {
    return;
  }

  const target = await prisma.adminTeamMember.findUnique({
    where: { userId: targetUserId },
    select: { role: true },
  });
  if (!target) {
    throw Errors.forbidden('The platform owner\'s password cannot be reset by another admin');
  }

  const callerRank = await adminRank(ctx.userId);
  if (callerRank <= ENUM_RANK[target.role]) {
    throw Errors.forbidden('You cannot reset the password of a peer or higher-ranked admin');
  }
}

export async function resetPasswordByAdmin(
  ctx: AuthContext,
  targetUserId: string,
  password: string,
  req: NextRequest | null,
): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true, isActive: true },
  });
  if (!target) throw Errors.notFound('User not found');
  if (!target.isActive) throw Errors.badRequest('Cannot reset password for an inactive user');

  const perm = ROLE_PERMISSION[target.role];
  if (!perm) throw Errors.forbidden('Password reset is not supported for this user role');

  if (target.role === 'admin') {
    await assertAdminTeamResetAllowed(ctx, targetUserId);
  } else {
    requirePermission(ctx, perm);
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: targetUserId }, data: { password: hashed } });

  try {
    await markSessionStale(targetUserId);
  } catch {
    /* non-critical */
  }

  await logAction(ctx, req, {
    action: AUDIT_ACTIONS.userPasswordReset,
    entity: 'user',
    entityId: targetUserId,
    metadata: { targetRole: target.role },
  });
}
