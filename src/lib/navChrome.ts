import type { ImpersonationMode } from '@/lib/clearImpersonation';

export type NavPortalItem = {
  name: string;
  href: string;
};

export type InitialNav = {
  isLoggedIn: boolean;
  portals: NavPortalItem[];
  showWallet: boolean;
  impersonationMode: ImpersonationMode | null;
  isAdminImpersonating: boolean;
  isCustomerImpersonating: boolean;
  vendorAppApproved: boolean;
};

export const GUEST_INITIAL_NAV: InitialNav = {
  isLoggedIn: false,
  portals: [],
  showWallet: false,
  impersonationMode: null,
  isAdminImpersonating: false,
  isCustomerImpersonating: false,
  vendorAppApproved: false,
};

export function resolvePortalNav(input: {
  isLoggedIn: boolean;
  userRole?: string;
  impersonationMode: ImpersonationMode | null;
  isCustomerImpersonating: boolean;
  isAdminImpersonating: boolean;
  hasVendorAccount: boolean;
  vendorAppApproved: boolean;
  hasBrandAccount: boolean;
}): NavPortalItem[] {
  if (!input.isLoggedIn) return [];
  if (input.userRole === 'admin' && input.impersonationMode === 'vendor') {
    return [{ name: 'Supplier Portal', href: '/vendor/overview' }];
  }
  if (input.userRole === 'admin' && input.impersonationMode === 'brand') {
    return [{ name: 'Brand Portal', href: '/brand/portal' }];
  }
  if (input.userRole === 'admin' && !input.isCustomerImpersonating) {
    return [{ name: 'Dashboard', href: '/admin/dashboard' }];
  }
  const items: NavPortalItem[] = [];
  if (!input.isAdminImpersonating && input.hasVendorAccount && input.vendorAppApproved) {
    items.push({
      name: input.hasBrandAccount ? 'Supplier' : 'Dashboard',
      href: '/vendor/dashboard',
    });
  }
  if (!input.isAdminImpersonating && input.hasBrandAccount) {
    items.push({ name: 'Brand Portal', href: '/brand/portal' });
  }
  return items;
}
