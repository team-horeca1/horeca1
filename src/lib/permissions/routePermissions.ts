/**
 * Single source of truth: portal page pathname → required permission(s).
 * Nav links, page guards, and docs should align with these keys.
 */
import type { PermissionKey } from '@/lib/permissions/registry';
import type { RoleScope } from '@/lib/permissions/portalFeatures';
import {
  ADMIN_NAV_GROUPS,
  VENDOR_NAV_GROUPS,
  SUPPLIER_NAV_GROUPS,
  BRAND_NAV_LINKS,
  type PortalNavLink,
} from '@/lib/permissions/portalNav';

export type RoutePermission = PermissionKey | PermissionKey[];

interface RouteRule {
  /** Exact path or prefix (for dynamic segments). Longer prefixes win. */
  prefix: string;
  perm: RoutePermission;
}

function permFromLinks(links: PortalNavLink[]): RouteRule[] {
  return links
    .filter((l) => l.requiredPerm)
    .map((l) => ({ prefix: l.href, perm: l.requiredPerm! }));
}

const ADMIN_EXTRA: RouteRule[] = [
  { prefix: '/admin/vendors', perm: 'vendors.view' },
  { prefix: '/admin/brands', perm: 'brands.view' },
  { prefix: '/admin/brand-distributor-invites', perm: 'brands.view' },
  { prefix: '/admin/customers', perm: 'customers.view' },
  { prefix: '/admin/orders', perm: 'orders.view' },
  { prefix: '/admin/returns', perm: 'orders.view' },
  { prefix: '/admin/claims', perm: 'orders.view' },
  { prefix: '/admin/categories', perm: 'products.view' },
];

const VENDOR_EXTRA: RouteRule[] = [
  { prefix: '/vendor/customer-groups', perm: 'customers.view' },
  { prefix: '/vendor/collections', perm: 'creditLine.view' },
  { prefix: '/vendor/account', perm: 'dashboard.view' },
  { prefix: '/vendor/setup', perm: 'dashboard.view' },
];

const BRAND_EXTRA: RouteRule[] = [];

const ACCOUNT_EXTRA: RouteRule[] = [
  { prefix: '/profile/team', perm: ['users.view', 'users.create', 'users.edit', 'users.delete'] },
  { prefix: '/orders', perm: 'orders.view' },
  { prefix: '/order-lists', perm: 'repeatOrders.view' },
  { prefix: '/wallet', perm: 'creditLine.view' },
  { prefix: '/account', perm: 'settings.view' },
];

function buildRules(scope: RoleScope): RouteRule[] {
  switch (scope) {
    case 'admin':
      return [
        ...ADMIN_NAV_GROUPS.flatMap((g) => permFromLinks(g.links)),
        ...ADMIN_EXTRA,
      ].sort((a, b) => b.prefix.length - a.prefix.length);
    case 'vendor':
      return [
        ...SUPPLIER_NAV_GROUPS.flatMap((g) => permFromLinks(g.links)),
        ...VENDOR_NAV_GROUPS.flatMap((g) => permFromLinks(g.links)),
        ...VENDOR_EXTRA,
      ].sort((a, b) => b.prefix.length - a.prefix.length);
    case 'brand':
      return [
        ...permFromLinks(BRAND_NAV_LINKS),
        ...BRAND_EXTRA,
      ].sort((a, b) => b.prefix.length - a.prefix.length);
    case 'account':
      return [...ACCOUNT_EXTRA].sort((a, b) => b.prefix.length - a.prefix.length);
    default:
      return [];
  }
}

const RULES_CACHE: Partial<Record<RoleScope, RouteRule[]>> = {};

function rulesFor(scope: RoleScope): RouteRule[] {
  if (!RULES_CACHE[scope]) RULES_CACHE[scope] = buildRules(scope);
  return RULES_CACHE[scope]!;
}

function normalizePath(pathname: string): string {
  const base = pathname.split('?')[0].replace(/\/$/, '') || '/';
  return base;
}

/** Resolve required permission for a portal pathname. Null = no granular guard (layout role gate only). */
export function getRoutePermission(pathname: string, scope: RoleScope): RoutePermission | null {
  const path = normalizePath(pathname);
  const rules = rulesFor(scope);
  for (const rule of rules) {
    if (path === rule.prefix || path.startsWith(`${rule.prefix}/`)) {
      return rule.perm;
    }
  }
  return null;
}

export type CanFn = (need?: PermissionKey | PermissionKey[]) => boolean;

/** First sidebar href the user may access (for logo link + empty-nav redirect). */
export function getFirstAllowedRoute(
  scope: RoleScope,
  can: CanFn,
  opts?: { vendorLevel?: 'supplier' | 'store' },
): string | null {
  const links: PortalNavLink[] =
    scope === 'admin'
      ? ADMIN_NAV_GROUPS.flatMap((g) => g.links)
      : scope === 'vendor'
        ? opts?.vendorLevel === 'store'
          ? VENDOR_NAV_GROUPS.flatMap((g) => g.links)
          : SUPPLIER_NAV_GROUPS.flatMap((g) => g.links)
        : scope === 'brand'
          ? BRAND_NAV_LINKS
          : [];

  for (const link of links) {
    if (can(link.requiredPerm)) return link.href;
  }
  // Fallback: store ops if supplier nav empty (e.g. store-scoped staff)
  if (scope === 'vendor' && opts?.vendorLevel !== 'store') {
    for (const link of VENDOR_NAV_GROUPS.flatMap((g) => g.links)) {
      if (can(link.requiredPerm)) return link.href;
    }
  }
  return null;
}

/** Tab-level permissions for legacy /account/[id] shell (customer BA management). */
export function getAccountTabPermission(tabHref: string): RoutePermission {
  switch (tabHref) {
    case '/outlets':
      return 'outlets.view';
    case '/users':
    case '/roles':
      return 'users.view';
    case '':
    default:
      return 'settings.view';
  }
}

/** Tab-level permissions for vendor business account shell. */
export function getVendorAccountTabPermission(tab: string): RoutePermission | null {
  switch (tab) {
    case 'team':
      return ['users.view', 'users.create', 'users.edit', 'users.delete'];
    case 'outlets':
      return 'outlets.view';
    case 'overview':
    default:
      return 'dashboard.view';
  }
}
