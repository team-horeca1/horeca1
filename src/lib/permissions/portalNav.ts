/**
 * Centralized portal sidebar nav — aligned with portalFeatures.ts.
 */
import type { ComponentType } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  Store,
  CheckSquare,
  Wallet,
  BarChart3,
  Settings,
  Package,
  Tag,
  Sparkles,
  BookOpen,
  RotateCcw,
  CreditCard,
  Gift,
  FileWarning,
  Warehouse,
  Container,
  GitMerge,
  Bell,
  Building2,
  UserCircle,
  BadgeIndianRupee,
  MapPin,
  ShieldAlert,
  ScrollText,
} from 'lucide-react';
import type { PermissionKey } from '@/lib/permissions/registry';
import type { Module, RoleScope } from '@/lib/permissions/portalFeatures';

export interface PortalNavLink {
  name: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  href: string;
  feature?: Module;
  requiredPerm?: PermissionKey | PermissionKey[];
}

export interface PortalNavGroup {
  label: string;
  links: PortalNavLink[];
}

export const ADMIN_NAV_GROUPS: PortalNavGroup[] = [
  {
    label: 'Operations',
    links: [
      { name: 'Dashboard', icon: LayoutDashboard, href: '/admin/dashboard', feature: 'dashboard', requiredPerm: 'dashboard.view' },
      { name: 'Orders', icon: ShoppingBag, href: '/admin/orders', feature: 'orders', requiredPerm: 'orders.view' },
      { name: 'Returns', icon: RotateCcw, href: '/admin/returns', feature: 'orders', requiredPerm: 'orders.view' },
      { name: 'Claims', icon: FileWarning, href: '/admin/claims', feature: 'orders', requiredPerm: 'orders.view' },
      { name: 'Approvals', icon: CheckSquare, href: '/admin/approvals', feature: 'vendors', requiredPerm: ['vendors.approve', 'brands.approve', 'products.approve'] },
    ],
  },
  {
    label: 'Marketplace',
    links: [
      { name: 'Customers', icon: Users, href: '/admin/customers', feature: 'customers', requiredPerm: 'customers.view' },
      { name: 'Vendors', icon: Store, href: '/admin/vendors', feature: 'vendors', requiredPerm: 'vendors.view' },
      { name: 'Products', icon: Package, href: '/admin/products', feature: 'products', requiredPerm: 'products.view' },
      { name: 'Categories', icon: Tag, href: '/admin/categories', feature: 'products', requiredPerm: 'products.view' },
      { name: 'Brands', icon: Sparkles, href: '/admin/brands', feature: 'brands', requiredPerm: 'brands.view' },
      { name: 'Distributor invites', icon: Users, href: '/admin/brand-distributor-invites', feature: 'brands', requiredPerm: 'brands.view' },
    ],
  },
  {
    label: 'Finance',
    links: [
      { name: 'Overview', icon: Wallet, href: '/admin/finance', feature: 'payments', requiredPerm: 'payments.view' },
      { name: 'Platform Ledger', icon: BookOpen, href: '/admin/ledger', feature: 'payments', requiredPerm: 'payments.view' },
      { name: 'Reports', icon: BarChart3, href: '/admin/reports', feature: 'analytics', requiredPerm: 'analytics.view' },
    ],
  },
  {
    label: 'Credit',
    links: [
      { name: 'Credit & Collections', icon: CreditCard, href: '/admin/credit', feature: 'payments', requiredPerm: 'payments.view' },
    ],
  },
  {
    label: 'Platform',
    links: [
      { name: 'Promotions', icon: Gift, href: '/admin/promotions', feature: 'promotions', requiredPerm: 'promotions.view' },
      { name: 'Audit Logs', icon: ScrollText, href: '/admin/audit-logs', feature: 'auditLogs', requiredPerm: 'auditLogs.view' },
      { name: 'Team', icon: Users, href: '/admin/team', feature: 'users', requiredPerm: ['users.view', 'users.create', 'users.edit', 'users.delete'] },
      { name: 'Settings', icon: Settings, href: '/admin/settings', feature: 'settings', requiredPerm: 'settings.view' },
    ],
  },
];

export const VENDOR_NAV_GROUPS: PortalNavGroup[] = [
  {
    label: 'Operations',
    links: [
      { name: 'Dashboard', icon: LayoutDashboard, href: '/vendor/dashboard', feature: 'dashboard', requiredPerm: 'dashboard.view' },
      { name: 'Orders', icon: ShoppingBag, href: '/vendor/orders', feature: 'orders', requiredPerm: 'orders.view' },
      { name: 'Inventory', icon: Warehouse, href: '/vendor/inventory', feature: 'inventory', requiredPerm: 'inventory.view' },
      { name: 'Warehouse', icon: Container, href: '/vendor/warehouse', feature: 'grn', requiredPerm: 'inventory.view' },
      { name: 'Returns', icon: RotateCcw, href: '/vendor/returns', feature: 'orders', requiredPerm: 'orders.view' },
      { name: 'Claims', icon: ShieldAlert, href: '/vendor/claims', feature: 'orders', requiredPerm: 'orders.view' },
    ],
  },
  {
    label: 'Catalog',
    links: [
      { name: 'Products', icon: Package, href: '/vendor/products', feature: 'products', requiredPerm: 'products.view' },
      { name: 'Brand Mappings', icon: GitMerge, href: '/vendor/brand-mappings', feature: 'products', requiredPerm: 'products.view' },
      { name: 'Price Lists', icon: Tag, href: '/vendor/price-lists', feature: 'products', requiredPerm: 'products.edit' },
      { name: 'Promotions', icon: Gift, href: '/vendor/promotions', feature: 'promotions', requiredPerm: 'promotions.view' },
    ],
  },
  {
    label: 'Customers',
    links: [
      { name: 'Customers', icon: UserCircle, href: '/vendor/customers', feature: 'customers', requiredPerm: 'customers.view' },
      { name: 'Sales Team', icon: BadgeIndianRupee, href: '/vendor/sales-team', feature: 'salespersons', requiredPerm: ['salespersons.view', 'commissions.view'] },
    ],
  },
  {
    label: 'Finance',
    links: [
      { name: 'Credit & Collections', icon: CreditCard, href: '/vendor/credit', feature: 'creditLine', requiredPerm: ['creditLine.view', 'creditLine.approve'] },
      { name: 'Wallet', icon: Wallet, href: '/vendor/wallet', feature: 'payments', requiredPerm: 'payments.view' },
      { name: 'Ledger', icon: BookOpen, href: '/vendor/ledger', feature: 'payments', requiredPerm: 'payments.view' },
      { name: 'Reports', icon: BarChart3, href: '/vendor/reports', feature: 'analytics', requiredPerm: 'analytics.view' },
    ],
  },
  {
    label: 'Account',
    links: [
      { name: 'Notifications', icon: Bell, href: '/vendor/notifications', feature: 'settings', requiredPerm: 'settings.view' },
      { name: 'Business account', icon: Building2, href: '/vendor/account', feature: 'dashboard', requiredPerm: 'dashboard.view' },
      { name: 'Team', icon: Users, href: '/vendor/team', feature: 'users', requiredPerm: ['users.view', 'users.create', 'users.edit', 'users.delete'] },
      { name: 'Outlets', icon: MapPin, href: '/vendor/outlets', feature: 'outlets', requiredPerm: 'outlets.view' },
      { name: 'Settings', icon: Settings, href: '/vendor/settings', feature: 'settings', requiredPerm: 'settings.view' },
    ],
  },
];

export const BRAND_NAV_LINKS: PortalNavLink[] = [
  { name: 'Dashboard', icon: LayoutDashboard, href: '/brand/portal', feature: 'dashboard', requiredPerm: 'dashboard.view' },
  { name: 'My Products', icon: Package, href: '/brand/portal/products', feature: 'products', requiredPerm: 'products.view' },
  { name: 'Distributors', icon: Users, href: '/brand/portal/distributors', feature: 'vendors', requiredPerm: 'vendors.view' },
  { name: 'Analytics', icon: BarChart3, href: '/brand/portal/analytics', feature: 'analytics', requiredPerm: 'analytics.view' },
  { name: 'Team', icon: Users, href: '/brand/portal/team', feature: 'users', requiredPerm: ['users.view', 'users.create', 'users.edit', 'users.delete'] },
  { name: 'Settings', icon: Settings, href: '/brand/portal/settings', feature: 'settings', requiredPerm: 'settings.view' },
];

export function filterNavLinks(
  links: PortalNavLink[],
  can: (need?: PermissionKey | PermissionKey[]) => boolean,
  scope: RoleScope,
  extraHidden?: (link: PortalNavLink) => boolean,
): PortalNavLink[] {
  return links.filter((link) => {
    if (extraHidden?.(link)) return false;
    if (link.feature && !PORTAL_FEATURE_EXISTS[scope]?.has(link.feature)) return false;
    return can(link.requiredPerm);
  });
}

const PORTAL_FEATURE_EXISTS: Record<RoleScope, Set<string>> = {
  admin: new Set(ADMIN_NAV_GROUPS.flatMap((g) => g.links.map((l) => l.feature).filter(Boolean) as string[])),
  vendor: new Set(VENDOR_NAV_GROUPS.flatMap((g) => g.links.map((l) => l.feature).filter(Boolean) as string[])),
  brand: new Set(BRAND_NAV_LINKS.map((l) => l.feature).filter(Boolean) as string[]),
  account: new Set(),
  delivery: new Set(),
};
