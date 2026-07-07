/**
 * Helpers for account-scoped API routes.
 *
 * - assertAccountMember: throws 403 if the caller is not a member of the target account.
 * - assertAccountPermission: throws 403 if the caller is a member but lacks the required permission
 *   for the target account (uses their UserRole rows, not the JWT-cached set, so it works
 *   on a non-active account too).
 * - resolveAccountPermissions: mirrors activeContext owner bypass (isPrimary + owner-class roles).
 */

import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { flatten, mergePermissions } from '@/lib/permissions/engine';
import { ALL_PERMISSION_KEYS, type PermissionKey, type PermissionsJson } from '@/lib/permissions/registry';
import { isOwnerRoleName } from '@/lib/permissions/portalFeatures';

export async function assertAccountMember(userId: string, businessAccountId: string): Promise<void> {
  const m = await prisma.businessAccountMember.findUnique({
    where: { userId_businessAccountId: { userId, businessAccountId } },
    select: { id: true },
  });
  if (!m) throw Errors.forbidden('You are not a member of this account');
}

/** Effective permission keys for a user on a business account (server-side, DB-backed). */
export async function resolveAccountPermissions(
  userId: string,
  businessAccountId: string,
  outletId: string | null = null,
): Promise<Set<PermissionKey>> {
  const membership = await prisma.businessAccountMember.findUnique({
    where: { userId_businessAccountId: { userId, businessAccountId } },
    select: { isPrimary: true },
  });
  if (!membership) throw Errors.forbidden('You are not a member of this account');

  const rows = await prisma.userRole.findMany({
    where: {
      userId,
      businessAccountId,
      OR: [{ outletId: null }, ...(outletId ? [{ outletId }] : [])],
    },
    select: { role: { select: { name: true, permissions: true } } },
  });

  const isOwner = rows.some((r) => isOwnerRoleName(r.role.name));

  if (isOwner) {
    return new Set(ALL_PERMISSION_KEYS);
  }

  return mergePermissions(
    ...rows.map((r) => flatten(r.role.permissions as PermissionsJson | null)),
  );
}

export async function assertAccountPermission(
  userId: string,
  businessAccountId: string,
  requiredKey: PermissionKey,
  outletId: string | null = null,
): Promise<void> {
  const merged = await resolveAccountPermissions(userId, businessAccountId, outletId);
  if (!merged.has(requiredKey)) throw Errors.forbidden(`Requires ${requiredKey}`);
}
