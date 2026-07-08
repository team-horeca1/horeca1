import { NextRequest } from 'next/server';
import type { Role } from '@prisma/client';
import { auth } from '@/auth';
import { type AuthContext, getAuthContext } from './auth';
import { Errors, errorResponse } from './errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import type { PermissionKey } from '@/lib/permissions/registry';
import { ALL_PERMISSION_KEYS } from '@/lib/permissions/registry';

/**
 * Decide whether the caller may use a role-restricted route.
 *
 * Two authoritative signals, in order:
 *  1. Legacy `User.role` enum — back-compat for directly-registered actors
 *     (a brand who signed up via the brand flow has role='brand') and for admin.
 *  2. V2.2 multi-account: a single User can own customer/vendor/brand
 *     BusinessAccounts WITHOUT their legacy `User.role` ever being promoted
 *     (creating a brand/vendor account intentionally leaves User.role alone —
 *     see src/app/api/v1/account/route.ts). So the ACTIVE business account type
 *     resolved server-side at login (loadActiveContext, signed into the JWT) is
 *     the real signal for storefront / vendor / brand API access. It can't be
 *     forged, and switching accounts validates membership, so honoring it is
 *     safe — and downstream resolveVendorContext/resolveBrandContext still scope
 *     every query to the account the caller actually owns.
 *
 * Admin-only routes (allowedRoles=['admin']) are unaffected: none of the
 * account-type branches reference 'admin', so they stay admin-gated.
 */
function isRoleAllowed(ctx: AuthContext, allowedRoles: Role[]): boolean {
  if (allowedRoles.includes(ctx.role)) return true;
  const t = ctx.activeBusinessAccountType;
  if (t) {
    if (allowedRoles.includes('brand') && t.isBrand) return true;
    if (allowedRoles.includes('vendor') && t.isVendor) return true;
    if (allowedRoles.includes('customer') && t.isCustomer) return true;
  }
  return false;
}

// Wrapper for role-restricted API routes
export function withRole(
  allowedRoles: Role[],
  handler: (req: NextRequest, ctx: AuthContext) => Promise<Response>
) {
  return async (req: NextRequest) => {
    try {
      const authCtx = await getAuthContext(req);

      if (!isRoleAllowed(authCtx, allowedRoles)) {
        throw Errors.forbidden();
      }

      return await handler(req, authCtx);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

// Convenience wrappers for common role checks
export function adminOnly(handler: (req: NextRequest, ctx: AuthContext) => Promise<Response>) {
  return withRole(['admin'], async (req, ctx) => {
    const session = await auth();
    const u = (session?.user ?? {}) as Record<string, unknown>;
    const adminPerms = u.adminPermissions as PermissionKey[] | undefined;
    if (adminPerms !== undefined || u.isAdminPermissionOwner === true) {
      const isAdminOwner = u.isAdminPermissionOwner === true;
      const effective = isAdminOwner ? [...ALL_PERMISSION_KEYS] : adminPerms ?? [];
      const adminCtx: AuthContext = {
        ...ctx,
        permissions: effective,
        permissionSet: new Set(effective),
      };
      return handler(req, adminCtx);
    }
    return handler(req, ctx);
  });
}

export function vendorOnly(handler: (req: NextRequest, ctx: AuthContext) => Promise<Response>) {
  return withRole(['vendor', 'admin'], handler);
}

export function customerOnly(handler: (req: NextRequest, ctx: AuthContext) => Promise<Response>) {
  return withRole(['customer', 'admin'], handler);
}

export function brandOnly(handler: (req: NextRequest, ctx: AuthContext) => Promise<Response>) {
  return withRole(['brand', 'admin'], handler);
}

/**
 * Gate a storefront buying action (add-to-cart, place order, pay).
 *
 * Buying is unrestricted when the caller is OPERATING AS A CUSTOMER: either a
 * legacy customer (User.role='customer') or any user whose ACTIVE business
 * account is a customer account — i.e. a vendor/brand owner who switched into
 * their own customer account to purchase. Admins are unrestricted too.
 *
 * Everyone else (a vendor/brand team member acting in a vendor/brand context)
 * needs the explicit storefront permission. Keying off the active account type
 * — not just the legacy User.role — is what stops a vendor/brand owner from
 * being wrongly blocked while shopping on their own customer account, and
 * mirrors the same multi-account fix applied to withRole() above.
 */
export function requireStorefrontAccess(ctx: AuthContext, key: PermissionKey): void {
  if (ctx.role === 'admin') return;
  if (ctx.role === 'customer' || ctx.activeBusinessAccountType?.isCustomer === true) return;
  requirePermission(ctx, key);
}
