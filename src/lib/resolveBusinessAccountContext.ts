/**
 * resolveBusinessAccountContext — the V2.2 replacement for resolveVendorId / resolveBrandId.
 *
 * Returns the active BusinessAccount + Outlet + permission set for the current request,
 * resolved from the session JWT (populated by auth.ts via loadActiveContext).
 *
 * Admin impersonation: admins reading from a vendor/brand context still pass through their
 * impersonation cookies, but the active *BusinessAccount* is the impersonated one's account.
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import type { AuthContext } from '@/middleware/auth';
import type { PermissionKey } from '@/lib/permissions/registry';

export interface BusinessAccountContext {
  businessAccountId: string;
  outletId: string | null;
  isCustomer: boolean;
  isVendor: boolean;
  isBrand: boolean;
  permissions: ReadonlySet<PermissionKey>;
  // Legacy: id of the Vendor extension row for this account, if any. Many existing
  // queries still scope by vendorId — bridges old and new during the refactor window.
  legacyVendorId: string | null;
  legacyBrandId: string | null;
}

export async function resolveBusinessAccountContext(
  ctx: AuthContext,
  req: NextRequest,
): Promise<BusinessAccountContext> {
  // Admin impersonation: cookies "admin_impersonate_vendor_id" / "admin_impersonate_brand_id"
  // point at a Vendor/Brand row whose account is the impersonated one.
  if (ctx.role === 'admin') {
    const vendorImpersonate = req.cookies.get('admin_impersonate_vendor_id')?.value;
    const brandImpersonate = req.cookies.get('admin_impersonate_brand_id')?.value;
    if (vendorImpersonate) {
      const v = await prisma.vendor.findUnique({
        where: { id: vendorImpersonate },
        select: { id: true, businessAccountId: true, businessAccount: { select: { isCustomer: true, isVendor: true, isBrand: true, primaryOutletId: true } } },
      });
      if (!v?.businessAccountId || !v.businessAccount) throw Errors.forbidden('Impersonated vendor not found');
      return {
        businessAccountId: v.businessAccountId,
        outletId: v.businessAccount.primaryOutletId,
        isCustomer: v.businessAccount.isCustomer,
        isVendor: v.businessAccount.isVendor,
        isBrand: v.businessAccount.isBrand,
        permissions: ALL_ADMIN_PERMS,
        legacyVendorId: v.id,
        legacyBrandId: null,
      };
    }
    if (brandImpersonate) {
      const b = await prisma.brand.findUnique({
        where: { id: brandImpersonate },
        select: { id: true, businessAccountId: true, businessAccount: { select: { isCustomer: true, isVendor: true, isBrand: true, primaryOutletId: true } } },
      });
      if (!b?.businessAccountId || !b.businessAccount) throw Errors.forbidden('Impersonated brand not found');
      return {
        businessAccountId: b.businessAccountId,
        outletId: b.businessAccount.primaryOutletId,
        isCustomer: b.businessAccount.isCustomer,
        isVendor: b.businessAccount.isVendor,
        isBrand: b.businessAccount.isBrand,
        permissions: ALL_ADMIN_PERMS,
        legacyVendorId: null,
        legacyBrandId: b.id,
      };
    }
  }

  // Normal users: read from the JWT-populated session fields.
  // These messages surface in toast/error banners — keep them actionable and aimed at
  // the actual cause: a stale JWT cookie from a mid-flight role/account migration.
  const activeBusinessAccountId = ctx.activeBusinessAccountId;
  if (!activeBusinessAccountId) {
    throw Errors.forbidden('Your session is out of date — please refresh the page.');
  }

  // Look up the legacy Vendor/Brand row ids for this account (used by the still-untouched
  // tenant queries that scope by vendorId/brandId).
  const account = await prisma.businessAccount.findUnique({
    where: { id: activeBusinessAccountId },
    select: {
      isCustomer: true,
      isVendor: true,
      isBrand: true,
      vendors: {
        orderBy: [{ isPrimaryStore: 'desc' }, { createdAt: 'asc' }],
        take: 1,
        select: { id: true },
      },
      brand: { select: { id: true } },
    },
  });
  if (!account) throw Errors.forbidden('Your session is out of date — please refresh the page.');

  // Prefer JWT active Online Store when it belongs to this Business.
  let legacyVendorId = account.vendors[0]?.id ?? null;
  if (ctx.activeVendorId) {
    const activeStore = await prisma.vendor.findFirst({
      where: { id: ctx.activeVendorId, businessAccountId: activeBusinessAccountId },
      select: { id: true },
    });
    if (activeStore) legacyVendorId = activeStore.id;
  }

  return {
    businessAccountId: activeBusinessAccountId,
    outletId: ctx.activeOutletId ?? null,
    isCustomer: account.isCustomer,
    isVendor: account.isVendor,
    isBrand: account.isBrand,
    permissions: new Set(ctx.permissions ?? []),
    legacyVendorId,
    legacyBrandId: account.brand?.id ?? null,
  };
}

const ALL_ADMIN_PERMS: ReadonlySet<PermissionKey> = (() => {
  // Lazily populated to avoid circular import; admins effectively bypass permission checks.
  // We use a Set marked with a sentinel and the hasPermission engine treats admin context separately.
  return new Set<PermissionKey>();
})();

/**
 * Convenience: throw if the active account is not a vendor.
 * Many existing routes expect a vendorId; this enforces the role at the boundary.
 */
export function assertVendorAccount(ctx: BusinessAccountContext): asserts ctx is BusinessAccountContext & { legacyVendorId: string } {
  if (!ctx.isVendor || !ctx.legacyVendorId) {
    throw Errors.forbidden('Active account is not a vendor');
  }
}

export function assertBrandAccount(ctx: BusinessAccountContext): asserts ctx is BusinessAccountContext & { legacyBrandId: string } {
  if (!ctx.isBrand || !ctx.legacyBrandId) {
    throw Errors.forbidden('Active account is not a brand');
  }
}

export function assertCustomerAccount(ctx: BusinessAccountContext): void {
  if (!ctx.isCustomer) {
    throw Errors.forbidden('Active account does not act as a customer');
  }
}
