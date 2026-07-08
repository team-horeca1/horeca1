import { redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';

const STALE_TTL_SEC = 3600;

/** Mark a user's JWT permissions as stale — next session update reloads from DB. */
export async function markSessionStale(userId: string): Promise<void> {
  try {
    await redis.set(`session:stale:${userId}`, '1', 'EX', STALE_TTL_SEC);
  } catch {
    /* non-critical */
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
