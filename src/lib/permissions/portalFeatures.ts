/**
 * Portal feature map — single source of truth for which permission modules
 * exist per actor scope, their human labels, valid actions, and routes.
 */

import {
  orderedScopeModuleKeys,
  scopeModuleGroups,
  scopeModuleLabels,
  type MatrixModuleGroup,
} from './matrixGroups';

export type { MatrixModuleGroup };
export {
  orderedScopeModuleKeys as scopeModuleKeys,
  scopeModuleGroups,
  scopeModuleLabels,
};

export type RoleScope = 'account' | 'vendor' | 'brand' | 'admin' | 'delivery';

export type Module =
  | 'dashboard' | 'products' | 'brandStore' | 'orders' | 'repeatOrders'
  | 'inventory' | 'grn' | 'dispatch' | 'deliveries' | 'payments' | 'creditLine'
  | 'customers' | 'vendors' | 'brands' | 'users' | 'outlets' | 'analytics'
  | 'promotions' | 'support' | 'logistics' | 'auditLogs' | 'settings'
  | 'storefront' | 'salespersons' | 'commissions';

/** Registry action lists — duplicated here to avoid circular import with registry.ts */
const MODULE_ACTIONS: Record<Module, readonly string[]> = {
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
  salespersons: ['view', 'create', 'edit', 'delete'],
  commissions:  ['view', 'edit', 'approve'],
};

export interface PortalFeature {
  label: string;
  /** Subset of MODULE_ACTIONS[module] that apply in this portal. */
  actions: readonly string[];
  routes: readonly string[];
}

export type PortalFeatureMap = Partial<Record<Module, PortalFeature>>;

/** Owner-class role names that receive full scoped permissions at runtime. */
export const OWNER_ROLE_NAMES = new Set([
  'Owner',
  'Vendor Admin',
  'Brand Admin',
  'Super Admin',
]);

export function isOwnerRoleName(name: string): boolean {
  return OWNER_ROLE_NAMES.has(name);
}

// ─── Account (customer buying-side) ───────────────────────────────────────

const ACCOUNT_FEATURES: PortalFeatureMap = {
  dashboard:    { label: 'Dashboard', actions: MODULE_ACTIONS.dashboard, routes: ['/profile'] },
  orders:       { label: 'Orders', actions: MODULE_ACTIONS.orders, routes: ['/orders'] },
  repeatOrders: { label: 'Quick Order Lists', actions: MODULE_ACTIONS.repeatOrders, routes: ['/order-lists'] },
  payments:     { label: 'Payments', actions: MODULE_ACTIONS.payments, routes: ['/orders'] },
  creditLine:   { label: 'Credit Line', actions: MODULE_ACTIONS.creditLine, routes: ['/wallet'] },
  users:        { label: 'Team', actions: MODULE_ACTIONS.users, routes: ['/profile/team', '/account'] },
  outlets:      { label: 'Outlets', actions: MODULE_ACTIONS.outlets, routes: ['/account'] },
  settings:     { label: 'Settings', actions: MODULE_ACTIONS.settings, routes: ['/profile', '/account'] },
  storefront:   { label: 'Storefront', actions: MODULE_ACTIONS.storefront, routes: ['/', '/cart', '/checkout'] },
};

// ─── Vendor (selling-side) ──────────────────────────────────────────────────

const VENDOR_FEATURES: PortalFeatureMap = {
  dashboard:    { label: 'Dashboard', actions: MODULE_ACTIONS.dashboard, routes: ['/vendor/dashboard'] },
  products:     { label: 'Products', actions: MODULE_ACTIONS.products, routes: ['/vendor/products', '/vendor/price-lists'] },
  orders:       { label: 'Orders', actions: MODULE_ACTIONS.orders, routes: ['/vendor/orders'] },
  repeatOrders: { label: 'Repeat Orders', actions: MODULE_ACTIONS.repeatOrders, routes: [] },
  inventory:    { label: 'Inventory', actions: MODULE_ACTIONS.inventory, routes: ['/vendor/inventory'] },
  grn:          { label: 'Warehouse', actions: MODULE_ACTIONS.grn, routes: ['/vendor/warehouse'] },
  dispatch:     { label: 'Dispatch', actions: MODULE_ACTIONS.dispatch, routes: ['/vendor/warehouse'] },
  deliveries:   { label: 'Deliveries', actions: MODULE_ACTIONS.deliveries, routes: ['/vendor/warehouse'] },
  payments:     { label: 'Wallet & Ledger', actions: MODULE_ACTIONS.payments, routes: ['/vendor/wallet', '/vendor/ledger'] },
  creditLine:   { label: 'Credit & Collections', actions: MODULE_ACTIONS.creditLine, routes: ['/vendor/credit', '/vendor/collections'] },
  customers:    { label: 'Customers', actions: MODULE_ACTIONS.customers, routes: ['/vendor/customers'] },
  users:        { label: 'Team', actions: MODULE_ACTIONS.users, routes: ['/vendor/team'] },
  outlets:      { label: 'Outlets', actions: MODULE_ACTIONS.outlets, routes: ['/vendor/outlets'] },
  analytics:    { label: 'Reports', actions: MODULE_ACTIONS.analytics, routes: ['/vendor/reports'] },
  promotions:   { label: 'Promotions', actions: MODULE_ACTIONS.promotions, routes: ['/vendor/promotions'] },
  salespersons: { label: 'Sales Team', actions: MODULE_ACTIONS.salespersons, routes: ['/vendor/sales-team'] },
  commissions:  { label: 'Commissions', actions: MODULE_ACTIONS.commissions, routes: ['/vendor/sales-team'] },
  settings:     { label: 'Settings', actions: MODULE_ACTIONS.settings, routes: ['/vendor/settings'] },
};

// ─── Brand ──────────────────────────────────────────────────────────────────

const BRAND_FEATURES: PortalFeatureMap = {
  dashboard: { label: 'Dashboard', actions: MODULE_ACTIONS.dashboard, routes: ['/brand/portal'] },
  products:  { label: 'My Products', actions: MODULE_ACTIONS.products, routes: ['/brand/portal/products'] },
  vendors:   { label: 'Distributors', actions: MODULE_ACTIONS.vendors, routes: ['/brand/portal/distributors'] },
  analytics: { label: 'Analytics', actions: MODULE_ACTIONS.analytics, routes: ['/brand/portal/analytics'] },
  users:     { label: 'Team', actions: MODULE_ACTIONS.users, routes: ['/brand/portal/team'] },
  settings:  { label: 'Settings', actions: MODULE_ACTIONS.settings, routes: ['/brand/portal/settings'] },
};

// ─── Admin (platform) ───────────────────────────────────────────────────────

const ADMIN_FEATURES: PortalFeatureMap = {
  dashboard:  { label: 'Dashboard', actions: MODULE_ACTIONS.dashboard, routes: ['/admin/dashboard'] },
  orders:     { label: 'Orders', actions: MODULE_ACTIONS.orders, routes: ['/admin/orders', '/admin/returns', '/admin/claims'] },
  customers:  { label: 'Customers', actions: MODULE_ACTIONS.customers, routes: ['/admin/customers'] },
  vendors:    { label: 'Vendors', actions: MODULE_ACTIONS.vendors, routes: ['/admin/vendors', '/admin/approvals'] },
  brands:     { label: 'Brands', actions: MODULE_ACTIONS.brands, routes: ['/admin/brands', '/admin/approvals'] },
  products:   { label: 'Products', actions: MODULE_ACTIONS.products, routes: ['/admin/products', '/admin/categories', '/admin/approvals'] },
  payments:   { label: 'Finance', actions: MODULE_ACTIONS.payments, routes: ['/admin/finance', '/admin/ledger', '/admin/credit'] },
  promotions: { label: 'Promotions', actions: MODULE_ACTIONS.promotions, routes: ['/admin/promotions'] },
  analytics:  { label: 'Reports', actions: MODULE_ACTIONS.analytics, routes: ['/admin/reports'] },
  users:      { label: 'Team', actions: MODULE_ACTIONS.users, routes: ['/admin/team'] },
  auditLogs:  { label: 'Audit Logs', actions: MODULE_ACTIONS.auditLogs, routes: ['/admin/audit-logs'] },
  settings:   { label: 'Settings', actions: MODULE_ACTIONS.settings, routes: ['/admin/settings'] },
};

// ─── Delivery (V2.3+) ───────────────────────────────────────────────────────

const DELIVERY_FEATURES: PortalFeatureMap = {
  dashboard:  { label: 'Dashboard', actions: MODULE_ACTIONS.dashboard, routes: [] },
  orders:     { label: 'Orders', actions: ['view'], routes: [] },
  dispatch:   { label: 'Dispatch', actions: MODULE_ACTIONS.dispatch, routes: [] },
  deliveries: { label: 'Deliveries', actions: MODULE_ACTIONS.deliveries, routes: [] },
};

export const PORTAL_FEATURES: Record<RoleScope, PortalFeatureMap> = {
  account: ACCOUNT_FEATURES,
  vendor: VENDOR_FEATURES,
  brand: BRAND_FEATURES,
  admin: ADMIN_FEATURES,
  delivery: DELIVERY_FEATURES,
};

/** Human label for a module within a scope. */
export function moduleLabel(scope: RoleScope, module: string): string {
  const feat = PORTAL_FEATURES[scope][module as Module];
  if (feat?.label) return feat.label;
  return module.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

/** Valid actions for a module within a scope (intersection with MODULE_ACTIONS registry). */
export function scopeModuleActions(scope: RoleScope, module: Module): readonly string[] {
  const feat = PORTAL_FEATURES[scope][module];
  if (!feat) return [];
  const registryActions = MODULE_ACTIONS[module] as readonly string[];
  return feat.actions.filter((a) => registryActions.includes(a));
}

/** All distinct action column headers for a scope's matrix (sorted for stable UI). */
const ACTION_ORDER = ['view', 'create', 'edit', 'delete', 'approve', 'order', 'pay'] as const;

export function scopeActionColumns(scope: RoleScope): string[] {
  const set = new Set<string>();
  for (const mod of orderedScopeModuleKeys(scope)) {
    for (const a of scopeModuleActions(scope, mod)) set.add(a);
  }
  return ACTION_ORDER.filter((a) => set.has(a));
}

/** MODULE_ACTIONS-shaped record for the permissions registry API. */
export function modulesForPortalScope(scope: RoleScope): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = {};
  for (const mod of orderedScopeModuleKeys(scope)) {
    const actions = scopeModuleActions(scope, mod);
    if (actions.length > 0) out[mod] = actions;
  }
  return out;
}
