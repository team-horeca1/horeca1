import {
  defaultPortalPath,
  type AccountPortalCaps,
} from '@/lib/businessCapability';

export type { AccountPortalCaps };
export { supplierLandingPath, supplierDashboardPath, SUPPLIER_HUB_PATH } from '@/lib/businessCapability';
export { defaultPortalPath };

/** Whether this account may use routes under the given pathname prefix. */
export function accountCanAccessPath(pathname: string, account: AccountPortalCaps): boolean {
  const path = pathname.split('?')[0] ?? pathname;
  if (
    path === '/brand/register'
    || path === '/vendor/register'
    || path === '/businesses'
    || path.startsWith('/businesses/')
  ) {
    return true;
  }
  if (path.startsWith('/vendor')) return account.isVendor;
  if (path.startsWith('/brand')) return account.isBrand;
  return true;
}

export function redirectIfPortalMismatch(
  pathname: string,
  account: AccountPortalCaps,
): string | null {
  if (accountCanAccessPath(pathname, account)) return null;
  return defaultPortalPath(account);
}
