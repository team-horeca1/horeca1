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
  '/vendor/delivery',
  '/vendor/products',
  '/vendor/inventory',
  '/vendor/warehouse',
  '/vendor/returns',
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
 * Store-scoped team members always use the Businesses picker (Enter Store),
 * even with a single store — so they can switch if access grows, and never
 * get locked into Store Ops with no way back.
 */
export function needsStorePicker(opts: {
  isStoreScopedOnly: boolean;
  availableStoreCount?: number;
}): boolean {
  return opts.isStoreScopedOnly;
}

/**
 * Resolve UI level for sidebar/header.
 * Single-store scoped staff always see store ops.
 * Multi-store scoped staff use Enter Store / picker like business-wide users.
 */
export function resolvePortalLevel(
  pathname: string,
  opts: {
    isStoreScopedOnly: boolean;
    enteredStore: boolean;
    /** When true, do not force store level until Enter Store. */
    allowStorePicker?: boolean;
  },
): SupplierPortalLevel {
  if (opts.isStoreScopedOnly && !opts.allowStorePicker) return 'store';
  if (pathname.startsWith('/vendor/businesses/') && pathname !== '/vendor/businesses') {
    return opts.enteredStore && isStoreOpsPath(pathname) ? 'store' : 'business';
  }
  if (opts.enteredStore && isStoreOpsPath(pathname)) return 'store';
  if (pathname.startsWith('/vendor/businesses')) return 'business';
  return 'supplier';
}
