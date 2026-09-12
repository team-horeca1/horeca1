import type { ImpersonationMode } from '@/lib/clearImpersonation';
import { SUPPLIER_HUB_PATH } from '@/lib/businessCapability';

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
  activeIsVendor?: boolean;
  activeIsBrand?: boolean;
}): NavPortalItem[] {
  if (!input.isLoggedIn) return [];
  if (input.userRole === 'admin' && input.impersonationMode === 'vendor') {
    return [{ name: 'Supplier Portal', href: '/businesses?type=supplier' }];
  }
  if (input.userRole === 'admin' && input.impersonationMode === 'brand') {
    return [{ name: 'Brand Portal', href: '/brand/portal' }];
  }
  if (input.userRole === 'admin' && !input.isCustomerImpersonating) {
    return [{ name: 'Dashboard', href: '/admin/dashboard' }];
  }

  const canVendor = !input.isAdminImpersonating && input.hasVendorAccount && input.vendorAppApproved;
  const canBrand = !input.isAdminImpersonating && input.hasBrandAccount;

  if (canVendor && canBrand) {
    if (input.activeIsBrand && !input.activeIsVendor) {
      return [{ name: 'Brand', href: '/brand/portal' }];
    }
    return [{ name: 'Supplier', href: SUPPLIER_HUB_PATH }];
  }
  if (canVendor) {
    return [{ name: 'Dashboard', href: SUPPLIER_HUB_PATH }];
  }
  if (canBrand) {
    return [{ name: 'Dashboard', href: '/brand/portal' }];
  }
  return [];
}
