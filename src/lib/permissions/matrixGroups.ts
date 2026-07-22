/**
 * RBAC matrix row order + section headers — aligned with portal sidebar nav.
 * Vendor/admin rows are 1:1 with sidebar tabs (same name + order), even when
 * multiple tabs share one permission module.
 */
import {
  ADMIN_NAV_GROUPS,
  BRAND_NAV_LINKS,
  VENDOR_NAV_GROUPS,
  type PortalNavGroup,
} from '@/lib/permissions/portalNav';
import {
  PORTAL_FEATURES,
  moduleLabel,
  type Module,
  type RoleScope,
} from '@/lib/permissions/portalFeatures';

export interface MatrixRow {
  /** Stable unique id (href) — modules can repeat across rows. */
  id: string;
  module: Module;
  label: string;
}

export interface MatrixModuleGroup {
  label: string;
  rows: MatrixRow[];
}

function scopeFeatures(scope: RoleScope): Set<Module> {
  return new Set(Object.keys(PORTAL_FEATURES[scope]) as Module[]);
}

function rowsFromModules(scope: RoleScope, modules: Module[]): MatrixRow[] {
  return modules.map((m) => ({
    id: m,
    module: m,
    label: moduleLabel(scope, m),
  }));
}

/** One matrix row per nav link — preserves sidebar order and labels (no feature dedupe). */
function buildGroupsFromNav(
  scope: RoleScope,
  navGroups: PortalNavGroup[],
): MatrixModuleGroup[] {
  const allowed = scopeFeatures(scope);
  const groups: MatrixModuleGroup[] = [];

  for (const navGroup of navGroups) {
    const rows: MatrixRow[] = [];

    for (const link of navGroup.links) {
      if (link.matrixExclude) continue;
      const mod = link.feature;
      if (!mod || !allowed.has(mod)) continue;
      rows.push({
        id: link.href || `${navGroup.label}:${link.name}`,
        module: mod,
        label: link.name,
      });
    }

    if (rows.length > 0) {
      groups.push({ label: navGroup.label, rows });
    }
  }

  return groups;
}

function appendMissing(scope: RoleScope, groups: MatrixModuleGroup[]): MatrixModuleGroup[] {
  const allowed = scopeFeatures(scope);
  const placed = new Set(groups.flatMap((g) => g.rows.map((r) => r.module)));
  const missing = [...allowed].filter((m) => !placed.has(m));

  if (missing.length === 0) return groups;

  const missingRows = rowsFromModules(scope, missing);
  const last = groups[groups.length - 1];
  if (last) {
    last.rows.push(...missingRows);
  } else {
    groups.push({ label: 'Permissions', rows: missingRows });
  }

  return groups;
}

function vendorModuleGroups(): MatrixModuleGroup[] {
  // Strict Store Ops sidebar parity (Warehouse / Sales Team commented out in nav).
  return buildGroupsFromNav('vendor', VENDOR_NAV_GROUPS);
}

function adminModuleGroups(): MatrixModuleGroup[] {
  return appendMissing('admin', buildGroupsFromNav('admin', ADMIN_NAV_GROUPS));
}

function brandModuleGroups(): MatrixModuleGroup[] {
  const allowed = scopeFeatures('brand');
  const rows: MatrixRow[] = [];

  for (const link of BRAND_NAV_LINKS) {
    const mod = link.feature;
    if (!mod || !allowed.has(mod)) continue;
    rows.push({
      id: link.href || link.name,
      module: mod,
      label: link.name,
    });
  }

  return appendMissing('brand', [{ label: 'Portal', rows }]);
}

function accountModuleGroups(): MatrixModuleGroup[] {
  const allowed = scopeFeatures('account');
  const pick = (mods: Module[]) => mods.filter((m) => allowed.has(m));

  return [
    { label: 'Operations', rows: rowsFromModules('account', pick(['dashboard', 'orders', 'repeatOrders'])) },
    { label: 'Finance', rows: rowsFromModules('account', pick(['payments', 'creditLine'])) },
    { label: 'Account', rows: rowsFromModules('account', pick(['users', 'outlets', 'settings'])) },
    { label: 'Storefront', rows: rowsFromModules('account', pick(['storefront'])) },
  ].filter((g) => g.rows.length > 0);
}

function deliveryModuleGroups(): MatrixModuleGroup[] {
  const allowed = scopeFeatures('delivery');
  const modules = (['dashboard', 'orders', 'dispatch', 'deliveries'] as Module[]).filter((m) =>
    allowed.has(m),
  );
  return [{ label: 'Operations', rows: rowsFromModules('delivery', modules) }];
}

/** Sidebar-aligned permission matrix groups for a scope. */
export function scopeModuleGroups(scope: RoleScope): MatrixModuleGroup[] {
  switch (scope) {
    case 'vendor':
      return vendorModuleGroups();
    case 'admin':
      return adminModuleGroups();
    case 'brand':
      return brandModuleGroups();
    case 'account':
      return accountModuleGroups();
    case 'delivery':
      return deliveryModuleGroups();
    default:
      return [];
  }
}

/** Unique module keys in first-seen matrix order (for permission APIs / counts). */
export function orderedScopeModuleKeys(scope: RoleScope): Module[] {
  const seen = new Set<Module>();
  const out: Module[] = [];
  for (const g of scopeModuleGroups(scope)) {
    for (const r of g.rows) {
      if (seen.has(r.module)) continue;
      seen.add(r.module);
      out.push(r.module);
    }
  }
  return out;
}

/** Human labels in matrix display order (one per visible row). */
export function scopeModuleLabels(scope: RoleScope): string[] {
  return scopeModuleGroups(scope).flatMap((g) => g.rows.map((r) => r.label));
}
