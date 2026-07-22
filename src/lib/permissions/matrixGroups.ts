/**
 * RBAC matrix row order + section headers — aligned with portal sidebar nav.
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

export interface MatrixModuleGroup {
  label: string;
  modules: Module[];
}

function scopeFeatures(scope: RoleScope): Set<Module> {
  return new Set(Object.keys(PORTAL_FEATURES[scope]) as Module[]);
}

function buildGroupsFromNav(
  scope: RoleScope,
  navGroups: PortalNavGroup[],
): MatrixModuleGroup[] {
  const allowed = scopeFeatures(scope);
  const groups: MatrixModuleGroup[] = [];

  for (const navGroup of navGroups) {
    const modules: Module[] = [];
    const seen = new Set<Module>();

    for (const link of navGroup.links) {
      if (link.matrixExclude) continue;
      const mod = link.feature;
      if (!mod || !allowed.has(mod) || seen.has(mod)) continue;
      seen.add(mod);
      modules.push(mod);
    }

    if (modules.length > 0) {
      groups.push({ label: navGroup.label, modules });
    }
  }

  return groups;
}

function appendMissing(scope: RoleScope, groups: MatrixModuleGroup[]): MatrixModuleGroup[] {
  const allowed = scopeFeatures(scope);
  const placed = new Set(groups.flatMap((g) => g.modules));
  const missing = [...allowed].filter((m) => !placed.has(m));

  if (missing.length === 0) return groups;

  const last = groups[groups.length - 1];
  if (last) {
    last.modules.push(...missing);
  } else {
    groups.push({ label: 'Permissions', modules: missing });
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
  const modules: Module[] = [];
  const seen = new Set<Module>();

  for (const link of BRAND_NAV_LINKS) {
    const mod = link.feature;
    if (!mod || !allowed.has(mod) || seen.has(mod)) continue;
    seen.add(mod);
    modules.push(mod);
  }

  return appendMissing('brand', [{ label: 'Portal', modules }]);
}

function accountModuleGroups(): MatrixModuleGroup[] {
  const allowed = scopeFeatures('account');
  const pick = (mods: Module[]) => mods.filter((m) => allowed.has(m));

  return [
    { label: 'Operations', modules: pick(['dashboard', 'orders', 'repeatOrders']) },
    { label: 'Finance', modules: pick(['payments', 'creditLine']) },
    { label: 'Account', modules: pick(['users', 'outlets', 'settings']) },
    { label: 'Storefront', modules: pick(['storefront']) },
  ].filter((g) => g.modules.length > 0);
}

function deliveryModuleGroups(): MatrixModuleGroup[] {
  const allowed = scopeFeatures('delivery');
  const modules = (['dashboard', 'orders', 'dispatch', 'deliveries'] as Module[]).filter((m) =>
    allowed.has(m),
  );
  return [{ label: 'Operations', modules }];
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

/** Flat module keys in matrix display order. */
export function orderedScopeModuleKeys(scope: RoleScope): Module[] {
  return scopeModuleGroups(scope).flatMap((g) => g.modules);
}

/** Human labels in matrix display order (for tests). */
export function scopeModuleLabels(scope: RoleScope): string[] {
  return orderedScopeModuleKeys(scope).map((m) => moduleLabel(scope, m));
}
