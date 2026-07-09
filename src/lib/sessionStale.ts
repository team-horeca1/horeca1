import { redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';

const STALE_TTL_SEC = 3600;
/** Match Auth.js JWT maxAge (7 days) so revoke outlives the cookie. */
const REVOKED_TTL_SEC = 7 * 24 * 60 * 60;

/** Mark a user's JWT permissions as stale — next session update reloads from DB. */
export async function markSessionStale(userId: string): Promise<void> {
  try {
    await redis.set(`session:stale:${userId}`, '1', 'EX', STALE_TTL_SEC);
  } catch {
    /* non-critical */
  }
}

/**
 * Hard-kill a session: APIs reject immediately and the JWT callback clears the cookie.
 * Use on hard-delete, soft-deactivate, and any path that must force logout.
 *
 * Redis is best-effort. If Redis is down, callers MUST still mutate durable state
 * (`isActive=false` or delete the user row). `getAuthContext` / JWT dead-path always
 * re-check Postgres, so deactivate/delete stay safe without Redis. We also bump
 * `User.updatedAt` when the row still exists so JWT reload fires without Redis.
 */
export async function markSessionRevoked(userId: string): Promise<void> {
  try {
    await redis.set(`session:revoked:${userId}`, '1', 'EX', REVOKED_TTL_SEC);
    await redis.set(`session:stale:${userId}`, '1', 'EX', STALE_TTL_SEC);
  } catch {
    /* non-critical — DB isActive / missing-user checks still gate APIs */
  }
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { updatedAt: new Date() },
    });
  } catch {
    /* user already hard-deleted — expected */
  }
}

export async function clearSessionRevoked(userId: string): Promise<void> {
  try {
    await redis.del(`session:revoked:${userId}`);
  } catch {
    /* ignore */
  }
}

export async function isSessionRevoked(userId: string): Promise<boolean> {
  try {
    const v = await redis.get(`session:revoked:${userId}`);
    return !!v;
  } catch {
    return false;
  }
}

/** Invalidate sessions for every user assigned this role (team tables + UserRole). */
export async function markSessionStaleForRole(roleId: string): Promise<void> {
  const [userRoles, adminMembers, vendorMembers, brandMembers] = await Promise.all([
    prisma.userRole.findMany({ where: { roleId }, select: { userId: true }, distinct: ['userId'] }),
    prisma.adminTeamMember.findMany({ where: { roleId }, select: { userId: true } }),
    prisma.vendorTeamMember.findMany({ where: { roleId }, select: { userId: true } }),
    prisma.brandTeamMember.findMany({ where: { roleId }, select: { userId: true } }),
  ]);
  const userIds = new Set<string>();
  for (const row of [...userRoles, ...adminMembers, ...vendorMembers, ...brandMembers]) {
    userIds.add(row.userId);
  }
  await Promise.all([...userIds].map((id) => markSessionStale(id)));
}
