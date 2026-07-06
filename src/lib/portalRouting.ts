export type AccountPortalCaps = {
  isCustomer: boolean;
  isVendor: boolean;
  isBrand: boolean;
};

/** Default landing page for an account's primary portal. */
export function defaultPortalPath(account: AccountPortalCaps): string {
  if (account.isVendor) return '/vendor/dashboard';
  if (account.isBrand) return '/brand/portal';
  return '/';
}

/** Whether this account may use routes under the given pathname prefix. */
export function accountCanAccessPath(pathname: string, account: AccountPortalCaps): boolean {
  if (pathname.startsWith('/vendor')) return account.isVendor;
  if (pathname.startsWith('/brand')) return account.isBrand;
  return true;
}

/**
 * When the user switches business account on a portal-specific route,
 * return where they should go instead of staying on a blocked page.
 */
export function redirectIfPortalMismatch(
  pathname: string,
  account: AccountPortalCaps,
): string | null {
  if (accountCanAccessPath(pathname, account)) return null;
  return defaultPortalPath(account);
}
