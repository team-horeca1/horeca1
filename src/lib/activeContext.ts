/**
 * Load the active (BusinessAccount, Outlet) context for a user, plus the flattened
 * permission set for that context. Called by the auth.ts jwt callback on login
 * and on session.update({ activeBusinessAccountId, activeOutletId }).
 *
 * See docs/multi-account-rbac-implementation-plan.md (§6 Auth & Session).
 */

import { prisma } from '@/lib/prisma';
import { flatten, mergePermissions } from '@/lib/permissions/engine';
import { ALL_PERMISSION_KEYS, type PermissionKey, type PermissionsJson } from '@/lib/permissions/registry';
import { isOwnerRoleName } from '@/lib/permissions/portalFeatures';

const MAX_AVAILABLE_ACCOUNTS = 20;

export interface AvailableAccountSummary {
  id: string;
  displayName: string;
  isVendor: boolean;
  isBrand: boolean;
}

export interface ActiveContext {
  hcidDisplay: string | null;
  activeBusinessAccountId: string;
  activeBusinessAccountType: { isCustomer: boolean; isVendor: boolean; isBrand: boolean };
  activeOutletId: string | null;
  /** Non-empty only when the user has per-outlet UserRole scoping (no account-wide null outletId role).
   * Empty array means the user has account-wide access and can switch to any outlet. */
  accessibleOutletIds: string[];
  permissions: PermissionKey[];
  /** True when user holds an owner-class role on the active account (full portal access). */
  isPermissionOwner: boolean;
  availableAccounts: AvailableAccountSummary[];
  availableAccountsTruncated: boolean;
  totalAccountCount: number;
}

/**
 * Resolve the active context for a user.
 *
 * @param userId            HCID (User.id).
 * @param targetAccountId   The BusinessAccount to switch to, or null to pick the primary.
 * @param targetOutletId    The Outlet to switch to within that account, or null to pick the account's primary outlet.
 *
 * Returns null if the user has no BusinessAccountMember rows yet (legacy users mid-migration).
 * In that case the JWT will not carry account/outlet/permissions and the caller treats it as legacy.
 */
export async function loadActiveContext(
  userId: string,
  targetAccountId: string | null,
  targetOutletId: string | null,
): Promise<ActiveContext | null> {
  // Defensive top-level try/catch: this function is called from the auth.ts jwt
  // callback on every sign-in and every session.update(). If anything inside
  // throws (transient DB hiccup, schema drift, missing relation, etc.), we MUST
  // return null rather than propagate — callers already handle the null path by
  // clearing the active-context fields on the token, which is far better than
  // poisoning the JWT or blocking sign-in entirely.
  try {
    // Pull the user's hcidDisplay + first N memberships in one round-trip.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        hcidDisplay: true,
        accountMemberships: {
          select: {
            isPrimary: true,
            businessAccount: {
              select: {
                id: true,
                displayName: true,
                legalName: true,
                isCustomer: true,
                isVendor: true,
                isBrand: true,
                primaryOutletId: true,
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!user || user.accountMemberships.length === 0) return null;

    // Pick the active account: explicit target wins, else primary, else first.
    const memberships = user.accountMemberships;
    let chosen = targetAccountId
      ? memberships.find((m) => m.businessAccount.id === targetAccountId)
      : (memberships.find((m) => m.isPrimary) ?? memberships[0]);
    if (!chosen) chosen = memberships[0];
    const account = chosen.businessAccount;

    // Determine which outlets this user can actually access by inspecting their
    // UserRole rows for this account. Storefront-access roles (named "Storefront (*)")
    // are intentionally excluded — they grant buyer privileges, not outlet scope.
    const allUserRoles = await prisma.userRole.findMany({
      where: { userId, businessAccountId: account.id, role: { name: { not: { startsWith: 'Storefront' } } } },
      select: { outletId: true },
    });
    const hasAccountWideRole = allUserRoles.some(r => r.outletId === null);
    const outletScopedIds = [...new Set(
      allUserRoles.filter(r => r.outletId !== null).map(r => r.outletId!)
    )];
    // accessibleOutletIds is empty when user has account-wide access.
    const accessibleOutletIds = hasAccountWideRole ? [] : outletScopedIds;

    // Pick the active outlet within the chosen account.
    // For per-outlet users: auto-pick their accessible outlet, validate targets against it.
    let activeOutletId: string | null = null;

    if (targetOutletId) {
      const canUse = accessibleOutletIds.length === 0 || accessibleOutletIds.includes(targetOutletId);
      if (canUse) {
        const ok = await prisma.outlet.findFirst({
          where: { id: targetOutletId, businessAccountId: account.id },
          select: { id: true },
        });
        if (ok) activeOutletId = ok.id;
      }
    }

    if (!activeOutletId) {
      if (accessibleOutletIds.length > 0) {
        // Per-outlet user: pick their first accessible outlet (ignore account primaryOutletId).
        const ok = await prisma.outlet.findFirst({
          where: { id: { in: accessibleOutletIds }, businessAccountId: account.id, isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        activeOutletId = ok?.id ?? null;
      } else {
        // Account-wide user: pick primary or first outlet.
        activeOutletId = account.primaryOutletId;
        if (!activeOutletId) {
          const first = await prisma.outlet.findFirst({
            where: { businessAccountId: account.id },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          });
          activeOutletId = first?.id ?? null;
        }
      }
    }

    // Compute the flattened permission set: union of every UserRole row that applies.
    // A UserRole applies if userId = current AND businessAccountId = active
    // AND (outletId IS NULL OR outletId = activeOutletId).
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        businessAccountId: account.id,
        OR: [{ outletId: null }, ...(activeOutletId ? [{ outletId: activeOutletId }] : [])],
      },
      select: {
        role: { select: { name: true, permissions: true } },
      },
    });

    // Account OWNER always gets the FULL current permission set, derived from
    // ALL_PERMISSION_KEYS at session time so it can never go stale when new
    // modules (e.g. storefront.*) are added to the registry — stale role JSON
    // snapshots are what locked owners out of their own checkout before.
    //
    // Ownership is NOT the same as `isPrimary`. `isPrimary` marks the user's ONE
    // default account, but a single user can OWN many accounts: when a vendor
    // also creates a brand account via POST /api/v1/account, that membership is
    // written with isPrimary=false even though the user owns it (and is granted
    // the Owner/Brand Admin role). Keying the full-permission grant off
    // `isPrimary` therefore left multi-account owners with only the stale stored
    // JSON on every account except their primary — so a brand/vendor owner who
    // switched into their non-primary account couldn't place orders
    // ("Requires storefront.order permission"), even though brand/vendor
    // accounts are meant to buy as customers too.
    //
    // The reliable owner signal is holding an owner-class role on the ACTIVE
    // account — these are the exact roles the account-creation paths
    // (provisionDefaultAccount / account POST) assign to the creator. This lets
    // a multi-account owner buy/manage on EVERY account they own.
    const isOwner = userRoles.some((ur) => isOwnerRoleName(ur.role.name));

    const permissions = isOwner
      ? [...ALL_PERMISSION_KEYS]
      : Array.from(mergePermissions(
          ...userRoles.map((ur) => flatten(ur.role.permissions as PermissionsJson | null)),
        ));

    // Cap the availableAccounts list (cookie size). Compute truncation flag + total count.
    const totalAccountCount = memberships.length;
    const availableAccounts: AvailableAccountSummary[] = memberships
      .slice(0, MAX_AVAILABLE_ACCOUNTS)
      .map((m) => ({
        id: m.businessAccount.id,
        displayName: m.businessAccount.displayName ?? m.businessAccount.legalName,
        isVendor: m.businessAccount.isVendor,
        isBrand: m.businessAccount.isBrand,
      }));
    const availableAccountsTruncated = totalAccountCount > MAX_AVAILABLE_ACCOUNTS;

    return {
      hcidDisplay: user.hcidDisplay,
      activeBusinessAccountId: account.id,
      activeBusinessAccountType: {
        isCustomer: account.isCustomer,
        isVendor: account.isVendor,
        isBrand: account.isBrand,
      },
      activeOutletId,
      accessibleOutletIds,
      permissions,
      isPermissionOwner: isOwner,
      availableAccounts,
      availableAccountsTruncated,
      totalAccountCount,
    };
  } catch (err) {
    console.error('[loadActiveContext] failed for userId=%s targetAccountId=%s targetOutletId=%s:', userId, targetAccountId, targetOutletId, err);
    return null;
  }
}
