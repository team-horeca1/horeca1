/**
 * API route → permission mapping for parity with portal nav / page guards.
 */
import type { PermissionKey } from '@/lib/permissions/registry';

export type ApiPermission = PermissionKey | PermissionKey[];

export interface ApiPermissionRule {
  methods: readonly string[];
  /** Path after /api/v1/ — may include [id] placeholders */
  pattern: RegExp;
  permission: ApiPermission;
}

/** Ordered most-specific first where relevant. */
export const API_PERMISSION_RULES: readonly ApiPermissionRule[] = [
  // Admin
  { methods: ['GET'], pattern: /^admin\/users(?:\/|$)/, permission: 'customers.view' },
  { methods: ['GET'], pattern: /^admin\/products(?:\/|$)/, permission: 'products.view' },
  { methods: ['GET'], pattern: /^admin\/categories(?:\/|$)/, permission: 'products.view' },
  { methods: ['GET'], pattern: /^admin\/brands(?:\/|$)/, permission: 'brands.view' },
  { methods: ['GET'], pattern: /^admin\/master-products(?:\/|$)/, permission: 'products.view' },
  { methods: ['GET'], pattern: /^admin\/approvals\/summary$/, permission: ['vendors.approve', 'brands.approve', 'products.approve'] },
  { methods: ['GET'], pattern: /^admin\/roles(?:\/|$)/, permission: ['users.view', 'users.create', 'users.edit', 'users.delete'] },
  { methods: ['GET'], pattern: /^admin\/vendors(?:\/|$)/, permission: 'vendors.view' },
  { methods: ['PATCH'], pattern: /^admin\/vendors\/[^/]+$/, permission: 'vendors.edit' },
  { methods: ['DELETE'], pattern: /^admin\/vendors\/[^/]+$/, permission: 'vendors.delete' },
  { methods: ['GET'], pattern: /^admin\/orders(?:\/|$)/, permission: 'orders.view' },
  { methods: ['GET'], pattern: /^admin\/dashboard$/, permission: 'dashboard.view' },
  { methods: ['GET'], pattern: /^admin\/finance(?:\/|$)/, permission: 'payments.view' },
  { methods: ['GET'], pattern: /^admin\/ledger(?:\/|$)/, permission: 'payments.view' },
  { methods: ['GET'], pattern: /^admin\/reports(?:\/|$)/, permission: 'analytics.view' },
  { methods: ['GET'], pattern: /^admin\/credit(?:\/|$)/, permission: 'payments.view' },
  { methods: ['GET'], pattern: /^admin\/promotions(?:\/|$)/, permission: 'promotions.view' },
  { methods: ['GET'], pattern: /^admin\/team(?:\/|$)/, permission: 'users.view' },
  { methods: ['GET'], pattern: /^admin\/settings(?:\/|$)/, permission: 'settings.view' },
  { methods: ['GET'], pattern: /^admin\/audit-logs(?:\/|$)/, permission: 'auditLogs.view' },
  { methods: ['GET'], pattern: /^admin\/returns(?:\/|$)/, permission: 'orders.view' },
  { methods: ['GET'], pattern: /^admin\/claims(?:\/|$)/, permission: 'orders.view' },
  { methods: ['PATCH'], pattern: /^admin\/claims\/[^/]+$/, permission: 'orders.edit' },
  { methods: ['PATCH'], pattern: /^admin\/returns\/[^/]+$/, permission: 'orders.edit' },
  { methods: ['GET'], pattern: /^admin\/categories\/export$/, permission: 'products.view' },
  { methods: ['GET'], pattern: /^admin\/products\/export$/, permission: 'products.view' },
  { methods: ['GET'], pattern: /^admin\/credit\/config$/, permission: 'payments.view' },
  { methods: ['PATCH'], pattern: /^admin\/credit\/config$/, permission: 'payments.create' },
  { methods: ['POST'], pattern: /^admin\/credit\/assign$/, permission: 'payments.create' },
  { methods: ['GET'], pattern: /^admin\/settlements(?:\/|$)/, permission: 'payments.view' },
  { methods: ['POST'], pattern: /^admin\/settlements$/, permission: 'payments.create' },
  { methods: ['PATCH'], pattern: /^admin\/settlements\/[^/]+$/, permission: 'payments.create' },
  { methods: ['PATCH'], pattern: /^admin\/team\/[^/]+\/password$/, permission: 'users.edit' },
  { methods: ['PATCH'], pattern: /^admin\/users\/[^/]+\/password$/, permission: 'users.edit' },
  { methods: ['GET'], pattern: /^admin\/vendors\/[^/]+\/documents$/, permission: 'vendors.view' },
  { methods: ['PATCH'], pattern: /^admin\/vendors\/[^/]+\/documents\/[^/]+$/, permission: 'vendors.approve' },

  // Vendor
  { methods: ['GET'], pattern: /^vendor\/outlets(?:\/|$)/, permission: 'outlets.view' },
  { methods: ['GET'], pattern: /^vendor\/notifications(?:\/|$)/, permission: 'settings.view' },
  { methods: ['GET'], pattern: /^vendor\/team(?:\/|$)/, permission: 'users.view' },
  { methods: ['GET'], pattern: /^vendor\/products(?:\/|$)/, permission: 'products.view' },
  { methods: ['GET'], pattern: /^vendor\/price-lists(?:\/|$)/, permission: 'products.view' },
  { methods: ['GET'], pattern: /^vendor\/customer-groups(?:\/|$)/, permission: 'customers.view' },
  { methods: ['GET'], pattern: /^vendor\/customer-tasks(?:\/|$)/, permission: 'customers.view' },
  { methods: ['GET'], pattern: /^vendor\/customer-prices(?:\/|$)/, permission: 'customers.view' },
  { methods: ['GET'], pattern: /^vendor\/pricing-targets(?:\/|$)/, permission: 'products.edit' },
  { methods: ['GET'], pattern: /^vendor\/dashboard$/, permission: 'dashboard.view' },
  { methods: ['GET', 'PATCH'], pattern: /^vendor\/setup$/, permission: 'dashboard.view' },
  { methods: ['GET'], pattern: /^vendor\/search$/, permission: 'products.view' },
  { methods: ['GET'], pattern: /^vendor\/products\/suggestions$/, permission: 'products.view' },
  { methods: ['POST'], pattern: /^vendor\/price-lists\/[^/]+\/bulk-upload$/, permission: 'products.edit' },

  // Brand
  { methods: ['GET'], pattern: /^brand\/authorized-distributors(?:\/|$)/, permission: 'vendors.view' },
  { methods: ['GET'], pattern: /^brand\/roles(?:\/|$)/, permission: 'users.view' },
  { methods: ['GET'], pattern: /^brand\/coverage(?:\/|$)/, permission: 'products.view' },
  { methods: ['GET'], pattern: /^brand\/products(?:\/|$)/, permission: 'products.view' },
  { methods: ['GET'], pattern: /^brand\/analytics(?:\/|$)/, permission: 'analytics.view' },
  { methods: ['GET'], pattern: /^brand\/team(?:\/|$)/, permission: 'users.view' },
  { methods: ['PATCH'], pattern: /^brand\/mappings\/[^/]+$/, permission: 'products.edit' },
  { methods: ['GET'], pattern: /^brand\/products\/export$/, permission: 'products.view' },
  { methods: ['GET', 'POST'], pattern: /^brand\/products\/import$/, permission: 'products.edit' },
  { methods: ['GET'], pattern: /^brand\/vendors\/search$/, permission: 'vendors.view' },

  // Wallet / credit (admin)
  { methods: ['GET'], pattern: /^wallet\/reports$/, permission: 'payments.view' },
  { methods: ['POST'], pattern: /^wallet\/debit$/, permission: 'payments.create' },
  { methods: ['POST'], pattern: /^wallet\/reactivate$/, permission: 'payments.create' },

  // Account (business account APIs)
  { methods: ['GET'], pattern: /^account\/[^/]+\/users(?:\/|$)/, permission: 'users.view' },
  { methods: ['GET'], pattern: /^account\/[^/]+\/outlets(?:\/|$)/, permission: 'outlets.view' },
  { methods: ['GET'], pattern: /^account\/[^/]+\/roles(?:\/|$)/, permission: 'users.view' },
] as const;

/** Strip /api/v1/ prefix from request pathname. */
export function apiPathFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const prefix = '/api/v1/';
  if (!pathname.startsWith(prefix)) return pathname.replace(/^\//, '');
  return pathname.slice(prefix.length);
}

export function getApiPermission(method: string, url: string): ApiPermission | null {
  const path = apiPathFromUrl(url);
  const m = method.toUpperCase();
  for (const rule of API_PERMISSION_RULES) {
    if (!rule.methods.includes(m)) continue;
    if (rule.pattern.test(path)) return rule.permission;
  }
  return null;
}
