/**
 * Supplier Foundation — shared domain asserts & helpers.
 * Hierarchy: Supplier (User) → Business (BusinessAccount) → Online Store (Vendor)
 */

import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import type { AuthContext } from '@/middleware/auth';
import type { Prisma } from '@prisma/client';

export type StoreContext = {
  supplierUserId: string;
  businessAccountId: string;
  vendorId: string;
  defaultOutletId: string | null;
};

export async function assertBusinessHasStore(businessAccountId: string): Promise<void> {
  const count = await prisma.vendor.count({ where: { businessAccountId } });
  if (count < 1) {
    throw Errors.badRequest('Every Business must have at least one Online Store before it can operate.');
  }
}

export async function listStoresForBusiness(businessAccountId: string) {
  return prisma.vendor.findMany({
    where: { businessAccountId },
    orderBy: [{ isPrimaryStore: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      businessName: true,
      displayName: true,
      slug: true,
      isActive: true,
      isVerified: true,
      isPrimaryStore: true,
      defaultOutletId: true,
      logoUrl: true,
      setupProgress: true,
      createdAt: true,
    },
  });
}

/** Ensure activeVendorId belongs to active BA; return store context. */
export async function assertStoreContext(ctx: AuthContext): Promise<StoreContext> {
  if (!ctx.activeBusinessAccountId) {
    throw Errors.forbidden('No active Business selected. Switch Business first.');
  }
  if (!ctx.activeVendorId) {
    throw Errors.forbidden('No active Online Store selected. Create or switch to an Online Store.');
  }

  const vendor = await prisma.vendor.findFirst({
    where: {
      id: ctx.activeVendorId,
      businessAccountId: ctx.activeBusinessAccountId,
    },
    select: { id: true, businessAccountId: true, defaultOutletId: true, userId: true },
  });
  if (!vendor) {
    throw Errors.forbidden('Active Online Store does not belong to the selected Business.');
  }

  // Store-scoped team: UserRole.vendorId must match (or be business-wide null)
  if (ctx.role !== 'admin') {
    const storeScoped = await prisma.userRole.findFirst({
      where: {
        userId: ctx.userId,
        businessAccountId: vendor.businessAccountId,
        vendorId: { not: null },
        role: { name: { not: { startsWith: 'Storefront' } } },
      },
      select: { vendorId: true },
    });
    const hasBusinessWide = await prisma.userRole.findFirst({
      where: {
        userId: ctx.userId,
        businessAccountId: vendor.businessAccountId,
        vendorId: null,
        role: { name: { not: { startsWith: 'Storefront' } } },
      },
      select: { id: true },
    });
    const isOwner = vendor.userId === ctx.userId;
    if (!isOwner && storeScoped && !hasBusinessWide) {
      const allowed = await prisma.userRole.findFirst({
        where: {
          userId: ctx.userId,
          businessAccountId: vendor.businessAccountId,
          vendorId: vendor.id,
        },
        select: { id: true },
      });
      const teamOk = await prisma.vendorTeamMember.findFirst({
        where: { userId: ctx.userId, vendorId: vendor.id },
        select: { id: true },
      });
      if (!allowed && !teamOk) {
        throw Errors.forbidden('You do not have access to this Online Store.');
      }
    }
  }

  return {
    supplierUserId: ctx.userId,
    businessAccountId: vendor.businessAccountId,
    vendorId: vendor.id,
    defaultOutletId: vendor.defaultOutletId,
  };
}

export type GoLiveCheck = {
  ready: boolean;
  missing: string[];
  isLegacyLive: boolean;
};

export async function assertGoLiveReady(
  vendorId: string,
  options?: { enforceProduct?: boolean },
): Promise<GoLiveCheck> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      isVerified: true,
      isActive: true,
      setupProgress: true,
      logoUrl: true,
      description: true,
      businessName: true,
    },
  });
  if (!vendor) throw Errors.notFound('Online Store');

  const progress = (vendor.setupProgress ?? {}) as Record<string, boolean>;
  const isLegacyLive = vendor.isVerified === true && vendor.isActive === true && progress.go_live === true;

  const missing: string[] = [];
  if (!vendor.isVerified) missing.push('Horeca1 verification');

  const pincodeCount = await prisma.serviceArea.count({
    where: { vendorId, isActive: true },
  });
  if (pincodeCount < 1) missing.push('delivery area (at least one pincode)');

  if (!vendor.businessName?.trim()) missing.push('store profile (name)');

  const enforceProduct = options?.enforceProduct !== false && !isLegacyLive;
  if (enforceProduct) {
    const anyProduct = await prisma.product.count({
      where: { vendorId, isActive: true },
    });
    if (anyProduct < 1) missing.push('at least one product visible to customers');
  }

  return { ready: missing.length === 0, missing, isLegacyLive };
}

/** Cascade Business-wide team members onto a newly created Online Store. */
export async function cascadeBusinessTeamToStore(
  businessAccountId: string,
  vendorId: string,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const db = tx ?? prisma;

  const businessWideRoles = await db.userRole.findMany({
    where: {
      businessAccountId,
      vendorId: null,
      role: { name: { not: { startsWith: 'Storefront' } } },
    },
    select: { userId: true, roleId: true },
  });

  let created = 0;
  for (const row of businessWideRoles) {
    const existing = await db.vendorTeamMember.findUnique({
      where: { vendorId_userId: { vendorId, userId: row.userId } },
      select: { id: true },
    });
    if (existing) continue;

    const role = await db.accountRole.findUnique({
      where: { id: row.roleId },
      select: { name: true },
    });
    const teamRole =
      role?.name?.toLowerCase().includes('admin') || role?.name?.toLowerCase().includes('owner')
        ? 'owner'
        : role?.name?.toLowerCase().includes('manager')
          ? 'manager'
          : role?.name?.toLowerCase().includes('editor')
            ? 'editor'
            : 'viewer';

    // Skip the store owner row if it would duplicate — owners are linked via Vendor.userId
    const store = await db.vendor.findUnique({
      where: { id: vendorId },
      select: { userId: true },
    });
    if (store?.userId === row.userId) continue;

    await db.vendorTeamMember.create({
      data: {
        vendorId,
        userId: row.userId,
        role: teamRole,
        roleId: row.roleId,
        invitedBy: store?.userId ?? row.userId,
      },
    });
    created += 1;
  }
  return created;
}

export async function ensureDefaultOutletForStore(
  tx: Prisma.TransactionClient,
  params: {
    businessAccountId: string;
    vendorId: string;
    name: string;
    addressLine?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
  },
): Promise<string> {
  const outlet = await tx.outlet.create({
    data: {
      businessAccountId: params.businessAccountId,
      name: params.name.slice(0, 255) || 'Main Store',
      addressLine: params.addressLine?.trim() || 'Address pending',
      city: params.city ?? null,
      state: params.state ?? null,
      pincode: params.pincode ?? null,
      isActive: true,
    },
    select: { id: true },
  });

  await tx.vendor.update({
    where: { id: params.vendorId },
    data: { defaultOutletId: outlet.id, multiWarehouseEnabled: false },
  });

  const ba = await tx.businessAccount.findUnique({
    where: { id: params.businessAccountId },
    select: { primaryOutletId: true },
  });
  if (!ba?.primaryOutletId) {
    await tx.businessAccount.update({
      where: { id: params.businessAccountId },
      data: { primaryOutletId: outlet.id },
    });
  }

  return outlet.id;
}

export function storeDisplayName(v: { displayName?: string | null; businessName: string }): string {
  return (v.displayName?.trim() || v.businessName).trim();
}

/**
 * Business-facing label for supplier UI / JWT.
 * Ignores a displayName that is empty, equal to legalName, or equal to an
 * Online Store name (common registration bleed where trade/store was written
 * onto BusinessAccount.displayName).
 */
export function businessFacingName(
  ba: { legalName: string; displayName?: string | null },
  storeNames: string[] = [],
): string {
  const legal = ba.legalName.trim();
  const display = ba.displayName?.trim() || '';
  if (!display || display === legal) return legal;
  if (storeNames.some((n) => n.trim() === display)) return legal;
  return display;
}
