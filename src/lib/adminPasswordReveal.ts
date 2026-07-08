import type { AuthContext } from '@/middleware/auth';
import { requirePermission, hasPermission } from '@/lib/permissions/engine';
import type { PermissionKey } from '@/lib/permissions/registry';
import { prisma } from '@/lib/prisma';
import { decryptAdminPassword } from '@/lib/adminPasswordCipher';

const ROLE_EDIT_PERM: Record<string, PermissionKey> = {
  customer: 'customers.edit',
  vendor: 'vendors.edit',
  brand: 'brands.edit',
  admin: 'users.edit',
};

/** Read decrypted admin-set password from DB (no permission check). */
export async function readAdminRevealedPassword(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { adminPasswordCipher: true },
  });
  if (!user) return null;
  return decryptAdminPassword(user.adminPasswordCipher);
}

/** Return decrypted password when caller has the given permission. */
export async function getAdminRevealedPassword(
  ctx: AuthContext,
  userId: string,
  permission: PermissionKey,
): Promise<string | null> {
  requirePermission(ctx, permission);
  return readAdminRevealedPassword(userId);
}

/** Resolve edit permission for a user role and return password if caller may view it. */
export async function getAdminRevealedPasswordForRole(
  ctx: AuthContext,
  userId: string,
  role: string,
): Promise<string | null> {
  const perm = ROLE_EDIT_PERM[role];
  if (!perm || !hasPermission(ctx, perm)) return null;
  return readAdminRevealedPassword(userId);
}
