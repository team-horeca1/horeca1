/**
 * Supplier hierarchy portal level — sessionStorage coordination.
 * Business-wide suppliers stay at Supplier/Business until they Enter a Store.
 * Store-scoped staff always operate at Store level.
 */

export type SupplierPortalLevel = 'supplier' | 'business' | 'store';

export const PORTAL_ENTERED_STORE_KEY = 'horeca_supplier_entered_store';

/** Routes that belong to store operations (Panel 3). */
export const STORE_OPS_PREFIXES = [
  '/vendor/dashboard',
  '/vendor/orders',
  '/vendor/products',
  '/vendor/inventory',
  '/vendor/warehouse',
  '/vendor/returns',
  '/vendor/claims',
  '/vendor/brand-mappings',
  '/vendor/price-lists',
  '/vendor/promotions',
  '/vendor/customers',
  '/vendor/customer-groups',
  '/vendor/sales-team',
  '/vendor/credit',
  '/vendor/wallet',
  '/vendor/collections',
  '/vendor/outlets',
  '/vendor/settings',
] as const;

/** Routes that belong to supplier / business hierarchy (Panels 1–2). */
export const SUPPLIER_LEVEL_PREFIXES = [
  '/vendor/overview',
  '/vendor/all-orders',
  '/vendor/businesses',
  '/vendor/team',
  '/vendor/reports',
  '/vendor/ledger',
  '/vendor/notifications',
  '/vendor/account',
] as const;

export function isStoreOpsPath(pathname: string): boolean {
  return STORE_OPS_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function isSupplierLevelPath(pathname: string): boolean {
  return SUPPLIER_LEVEL_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function readEnteredStore(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(PORTAL_ENTERED_STORE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setEnteredStore(entered: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (entered) sessionStorage.setItem(PORTAL_ENTERED_STORE_KEY, '1');
    else sessionStorage.removeItem(PORTAL_ENTERED_STORE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Resolve UI level for sidebar/header.
 * Store-scoped staff always see store ops.
 */
export function resolvePortalLevel(
  pathname: string,
  opts: { isStoreScopedOnly: boolean; enteredStore: boolean },
): SupplierPortalLevel {
  if (opts.isStoreScopedOnly) return 'store';
  if (pathname.startsWith('/vendor/businesses/') && pathname !== '/vendor/businesses') {
    return opts.enteredStore && isStoreOpsPath(pathname) ? 'store' : 'business';
  }
  if (opts.enteredStore && isStoreOpsPath(pathname)) return 'store';
  if (pathname.startsWith('/vendor/businesses')) return 'business';
  return 'supplier';
}
