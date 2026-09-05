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
import { hasUsableDeliveryLocation } from '@/lib/addressUsability';
import { businessFacingName, storeDisplayName } from '@/modules/supplier/foundation.service';
import type { TeamRole } from '@prisma/client';

const MAX_AVAILABLE_ACCOUNTS = 20;

export interface AvailableAccountSummary {
  id: string;
  displayName: string;
  isVendor: boolean;
  isBrand: boolean;
}

export interface AvailableStoreSummary {
  id: string;
  displayName: string;
  isPrimaryStore: boolean;
  isActive: boolean;
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
  /** Cached tenant IDs — avoids per-request DB lookup on vendor/brand APIs. */
  activeVendorId: string | null;
  activeBrandId: string | null;
  activeVendorTeamRole: TeamRole | 'owner' | null;
  activeBrandTeamRole: TeamRole | 'owner' | null;
  /** Online Stores under the active Business (supplier portal). */
  availableStores: AvailableStoreSummary[];
  /** True when all UserRoles for this BA are store-scoped (no business-wide null vendorId). */
  isStoreScopedOnly: boolean;
}

/**
 * Resolve the active context for a user.
 *
 * @param userId            HCID (User.id).
 * @param targetAccountId   The BusinessAccount to switch to, or null to pick the primary.
 * @param targetOutletId    The Outlet to switch to within that account, or null to pick the account's primary outlet.
 * @param targetVendorId    The Online Store (Vendor) to activate under the Business, or null to pick primary/default.
 *
 * Returns null if the user has no BusinessAccountMember rows yet (legacy users mid-migration).
 * In that case the JWT will not carry account/outlet/permissions and the caller treats it as legacy.
 */
export async function loadActiveContext(
  userId: string,
  targetAccountId: string | null,
  targetOutletId: string | null,
  targetVendorId: string | null = null,
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
                vendors: {
                  select: {
                    businessName: true,
                    displayName: true,
                  },
                },
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!user || user.accountMemberships.length === 0) return null;

    // Pick the active account: explicit target wins. Otherwise prefer the
    // primary membership (team invites set the owner's BA as primary so
    // members inherit that business). Never let a personal shopping BA with a
    // usable delivery address steal the session from a primary vendor/brand BA —
    // that hid Dashboard for team members on the marketplace homepage.
    const memberships = user.accountMemberships;
    let chosen = targetAccountId
      ? memberships.find((m) => m.businessAccount.id === targetAccountId)
      : null;
    if (!chosen && !targetAccountId) {
      const accountIds = memberships.map((m) => m.businessAccount.id);
      const outletRows = await prisma.outlet.findMany({
        where: { businessAccountId: { in: accountIds }, isActive: true },
        select: {
          businessAccountId: true,
          pincode: true,
          latitude: true,
          longitude: true,
        },
      });
      const usableAccountIds = new Set<string>();
      for (const o of outletRows) {
        if (hasUsableDeliveryLocation(o)) usableAccountIds.add(o.businessAccountId);
      }
      const primary = memberships.find((m) => m.isPrimary);
      if (primary) {
        const ba = primary.businessAccount;
        if (ba.isVendor || ba.isBrand || usableAccountIds.has(ba.id)) {
          chosen = primary;
        } else {
          // Customer primary with no usable address — fall back to any usable BA.
          chosen =
            memberships.find((m) => usableAccountIds.has(m.businessAccount.id))
            ?? primary;
        }
      } else {
        chosen =
          memberships.find((m) => m.businessAccount.isVendor || m.businessAccount.isBrand)
          ?? memberships.find((m) => usableAccountIds.has(m.businessAccount.id))
          ?? memberships[0];
      }
    }
    if (!chosen) chosen = memberships[0];
    const account = chosen.businessAccount;

    const [allRoleRows, storeRows, brandTenant] = await Promise.all([
      prisma.userRole.findMany({
        where: {
          userId,
          businessAccountId: account.id,
          role: { name: { not: { startsWith: 'Storefront' } } },
        },
        select: {
          outletId: true,
          vendorId: true,
          role: { select: { name: true, permissions: true } },
        },
      }),
      account.isVendor
        ? prisma.vendor.findMany({
            where: { businessAccountId: account.id },
            orderBy: [{ isPrimaryStore: 'desc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              userId: true,
              businessName: true,
              displayName: true,
              isPrimaryStore: true,
              isActive: true,
              defaultOutletId: true,
            },
          })
        : Promise.resolve([]),
      account.isBrand
        ? prisma.brand.findFirst({
            where: { userId, businessAccountId: account.id },
            select: { id: true },
          }).then(async (own) => {
            if (own) return { id: own.id, teamRole: 'owner' as const };
            const m = await prisma.brandTeamMember.findFirst({
              where: { userId, brand: { businessAccountId: account.id } },
              select: { brandId: true, role: true },
            });
            return m ? { id: m.brandId, teamRole: m.role } : null;
          })
        : Promise.resolve(null),
    ]);

    const hasBusinessWideRole = allRoleRows.some((r) => r.vendorId === null);
    const storeScopedVendorIds = [...new Set(
      allRoleRows.filter((r) => r.vendorId !== null).map((r) => r.vendorId!),
    )];
    const isStoreScopedOnly = account.isVendor && !hasBusinessWideRole && storeScopedVendorIds.length > 0;

    // Filter Online Stores the user can access
    let accessibleStores = storeRows;
    if (isStoreScopedOnly) {
      accessibleStores = storeRows.filter((s) => storeScopedVendorIds.includes(s.id));
    }
    // Also allow team membership stores
    if (account.isVendor && accessibleStores.length === 0) {
      const teamStores = await prisma.vendorTeamMember.findMany({
        where: { userId, vendor: { businessAccountId: account.id } },
        select: { vendorId: true, role: true },
      });
      const teamIds = new Set(teamStores.map((t) => t.vendorId));
      accessibleStores = storeRows.filter((s) => teamIds.has(s.id) || s.userId === userId);
    } else if (account.isVendor) {
      // Owners see all stores they own on this BA
      const ownsAny = storeRows.some((s) => s.userId === userId);
      if (ownsAny && hasBusinessWideRole) {
        accessibleStores = storeRows;
      }
    }

    const availableStores: AvailableStoreSummary[] = accessibleStores.map((s) => ({
      id: s.id,
      displayName: (s.displayName?.trim() || s.businessName).trim(),
      isPrimaryStore: s.isPrimaryStore,
      isActive: s.isActive,
    }));

    // Resolve active Online Store
    let vendorTenant: { id: string; teamRole: TeamRole | 'owner'; defaultOutletId: string | null } | null = null;
    if (account.isVendor && accessibleStores.length > 0) {
      const chosenStore =
        (targetVendorId ? accessibleStores.find((s) => s.id === targetVendorId) : null)
        ?? accessibleStores.find((s) => s.isPrimaryStore)
        ?? accessibleStores[0];
      const isOwner = chosenStore.userId === userId;
      let teamRole: TeamRole | 'owner' = isOwner ? 'owner' : 'viewer';
      if (!isOwner) {
        const m = await prisma.vendorTeamMember.findFirst({
          where: { userId, vendorId: chosenStore.id },
          select: { role: true },
        });
        teamRole = m?.role ?? 'viewer';
      }
      vendorTenant = {
        id: chosenStore.id,
        teamRole,
        defaultOutletId: chosenStore.defaultOutletId,
      };
    }

    const hasAccountWideRole = allRoleRows.some((r) => r.outletId === null);
    const outletScopedIds = [...new Set(
      allRoleRows.filter((r) => r.outletId !== null).map((r) => r.outletId!),
    )];
    const accessibleOutletIds = hasAccountWideRole ? [] : outletScopedIds;

    // Honour an explicit session pick first (marketplace "Deliver to").
    // Vendor.defaultOutletId is the fallback for a fresh login with no pick —
    // vendor portal stock still comes from resolveVendorOutletContext, not this.
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
    if (!activeOutletId && vendorTenant?.defaultOutletId) {
      activeOutletId = vendorTenant.defaultOutletId;
    }

    if (!activeOutletId) {
      if (accessibleOutletIds.length > 0) {
        const ok = await prisma.outlet.findFirst({
          where: { id: { in: accessibleOutletIds }, businessAccountId: account.id, isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        activeOutletId = ok?.id ?? null;
      } else {
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

    const userRoles = allRoleRows.filter((r) => {
      const outletOk = r.outletId === null || (activeOutletId && r.outletId === activeOutletId);
      const storeOk =
        r.vendorId === null
        || (vendorTenant && r.vendorId === vendorTenant.id);
      return outletOk && storeOk;
    });
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
    // Legacy seed / pre-RBAC vendors & brands: the User row linked on
    // Vendor.userId / Brand.userId is the account owner but may have no
    // UserRole row yet. Team APIs already surface them as isOwner — grant
    // full scoped permissions here so requirePermission() works for them too.
    const isLegacyPortalOwner =
      vendorTenant?.teamRole === 'owner' || brandTenant?.teamRole === 'owner';
    const isOwner =
      isLegacyPortalOwner ||
      userRoles.some((ur) => isOwnerRoleName(ur.role.name));

    const permissions = isOwner
      ? [...ALL_PERMISSION_KEYS]
      : Array.from(mergePermissions(
          ...userRoles.map((ur) => flatten(ur.role.permissions as PermissionsJson | null)),
        ));

    // Cap the availableAccounts list (cookie size). Compute truncation flag + total count.
    const totalAccountCount = memberships.length;
    const availableAccounts: AvailableAccountSummary[] = memberships
      .slice(0, MAX_AVAILABLE_ACCOUNTS)
      .map((m) => {
        const ba = m.businessAccount;
        const storeNames = ba.vendors.map((v) => storeDisplayName(v));
        return {
          id: ba.id,
          displayName: businessFacingName(ba, storeNames),
          isVendor: ba.isVendor,
          isBrand: ba.isBrand,
        };
      });
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
      activeVendorId: vendorTenant?.id ?? null,
      activeBrandId: brandTenant?.id ?? null,
      activeVendorTeamRole: vendorTenant?.teamRole ?? null,
      activeBrandTeamRole: brandTenant?.teamRole ?? null,
      availableStores,
      isStoreScopedOnly,
    };
  } catch (err) {
    console.error('[loadActiveContext] failed for userId=%s targetAccountId=%s targetOutletId=%s targetVendorId=%s:', userId, targetAccountId, targetOutletId, targetVendorId, err);
    return null;
  }
}
