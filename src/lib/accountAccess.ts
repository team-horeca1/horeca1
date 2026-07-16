/**
 * Helpers for account-scoped API routes.
 *
 * - assertAccountMember: throws 403 if the caller is not a member of the target account.
 * - assertAccountPermission: throws 403 if the caller is a member but lacks the required permission
 *   for the target account (uses their UserRole rows, not the JWT-cached set, so it works
 *   on a non-active account too).
 * - resolveAccountPermissions: mirrors activeContext owner bypass (isPrimary + owner-class roles).
 * - assertCanMutateAccount: membership + permission, OR admin impersonating that exact BA
 *   (customer view-as, vendor Admin View, or brand Admin View).
 */

import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { flatten, mergePermissions } from '@/lib/permissions/engine';
import { ALL_PERMISSION_KEYS, type PermissionKey, type PermissionsJson } from '@/lib/permissions/registry';
import { isOwnerRoleName } from '@/lib/permissions/portalFeatures';
import type { AuthContext } from '@/middleware/auth';
import { isImpersonatingBusinessAccount } from '@/lib/resolveCustomerImpersonation';
import { BRAND_ID_COOKIE, VENDOR_ID_COOKIE } from '@/lib/adminImpersonationCookies';

export async function assertAccountMember(userId: string, businessAccountId: string): Promise<void> {
  const m = await prisma.businessAccountMember.findUnique({
    where: { userId_businessAccountId: { userId, businessAccountId } },
    select: { id: true },
  });
  if (!m) throw Errors.forbidden('You are not a member of this account');
}

/**
 * True when an admin is acting as this business account via customer / vendor / brand
 * impersonation cookies (Admin View).
 */
export async function isAdminActingAsBusinessAccount(
  ctx: AuthContext,
  businessAccountId: string,
): Promise<boolean> {
  if (ctx.role !== 'admin') return false;
  if (isImpersonatingBusinessAccount(ctx, businessAccountId)) return true;

  const jar = await cookies();
  const vendorId = jar.get(VENDOR_ID_COOKIE)?.value;
  if (vendorId) {
    const v = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { businessAccountId: true },
    });
    if (v?.businessAccountId === businessAccountId) return true;
  }
  const brandId = jar.get(BRAND_ID_COOKIE)?.value;
  if (brandId) {
    const b = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { businessAccountId: true },
    });
    if (b?.businessAccountId === businessAccountId) return true;
  }
  return false;
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

/**
 * Allow mutation when the caller is a member with the permission, OR when an
 * admin is impersonating this exact business account (acts as owner).
 */
export async function assertCanMutateAccount(
  ctx: AuthContext,
  businessAccountId: string,
  requiredKey: PermissionKey,
  outletId: string | null = null,
): Promise<void> {
  if (await isAdminActingAsBusinessAccount(ctx, businessAccountId)) return;
  await assertAccountMember(ctx.userId, businessAccountId);
  await assertAccountPermission(ctx.userId, businessAccountId, requiredKey, outletId);
}
