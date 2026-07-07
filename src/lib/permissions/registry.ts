/**
 * Permission registry — the single source of truth for valid (module, action) pairs.
 */

import {
  modulesForPortalScope,
  scopeModuleKeys,
  type RoleScope,
} from './portalFeatures';

export type { RoleScope };

export const MODULES = {
  dashboard:    ['view'],
  products:     ['view', 'create', 'edit', 'delete', 'approve'],
  brandStore:   ['view', 'edit'],
  orders:       ['view', 'create', 'edit', 'delete', 'approve'],
  repeatOrders: ['view', 'create', 'edit'],
  inventory:    ['view', 'create', 'edit', 'delete'],
  grn:          ['view', 'create', 'edit'],
  dispatch:     ['view', 'create', 'edit'],
  deliveries:   ['view', 'edit', 'approve'],
  payments:     ['view', 'create', 'approve'],
  creditLine:   ['view', 'approve'],
  customers:    ['view', 'create', 'edit', 'delete'],
  vendors:      ['view', 'create', 'edit', 'delete', 'approve'],
  brands:       ['view', 'create', 'edit', 'delete', 'approve'],
  users:        ['view', 'create', 'edit', 'delete'],
  outlets:      ['view', 'create', 'edit', 'delete'],
  analytics:    ['view'],
  promotions:   ['view', 'create', 'edit', 'delete'],
  support:      ['view', 'edit'],
  logistics:    ['view', 'edit'],
  auditLogs:    ['view'],
  settings:     ['view', 'edit'],
  storefront:   ['view', 'order', 'pay'],
  // V2.2 Phase 1 — Salesman Commission
  salespersons: ['view', 'create', 'edit', 'delete'],
  // commissions.edit = override rule / change accrual amount;
  // commissions.approve = move state through pending→approved→paid/cancelled
  commissions:  ['view', 'edit', 'approve'],
} as const satisfies Record<string, readonly string[]>;

export type Module = keyof typeof MODULES;
export type Action = typeof MODULES[Module][number];

// All concrete permission keys, e.g. "orders.edit" | "products.view"
export type PermissionKey = {
  [M in Module]: `${M}.${typeof MODULES[M][number]}`
}[Module];

// Runtime list of every valid permission key — useful for validation & seeding.
export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = Object.entries(MODULES).flatMap(
  ([m, actions]) => (actions as readonly string[]).map((a) => `${m}.${a}` as PermissionKey),
);

export function isValidPermissionKey(key: string): key is PermissionKey {
  const [m, a] = key.split('.');
  if (!m || !a) return false;
  const actions = (MODULES as Record<string, readonly string[]>)[m];
  return Array.isArray(actions) && actions.includes(a);
}

/** Permissions JSON as stored on AccountRole.permissions. */
export type PermissionsJson = Partial<Record<Module, Partial<Record<Action, boolean>>>>;

/** Module keys per scope — derived from PORTAL_FEATURES. */
export const SCOPE_MODULES: Record<RoleScope, readonly Module[]> = {
  account: scopeModuleKeys('account'),
  vendor: scopeModuleKeys('vendor'),
  brand: scopeModuleKeys('brand'),
  admin: scopeModuleKeys('admin'),
  delivery: scopeModuleKeys('delivery'),
};

/** Filter MODULES down to portal-relevant actions for a given role-scope. */
export function modulesForScope(scope: RoleScope): Record<Module, readonly Action[]> {
  return modulesForPortalScope(scope) as Record<Module, readonly Action[]>;
}
