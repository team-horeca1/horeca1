/** First URL segment after /vendor/ for dashboard portal routes (not public vendor stores). */
const VENDOR_PORTAL_SEGMENTS = new Set([
  'dashboard',
  'orders',
  'products',
  'inventory',
  'warehouse',
  'outlets',
  'account',
  'settings',
  'notifications',
  'team',
  'reports',
  'wallet',
  'ledger',
  'credit',
  'collections',
  'returns',
  'claims',
  'customers',
  'customer-groups',
  'price-lists',
  'promotions',
  'brand-mappings',
  'sales-team',
  'register',
  'setup',
]);

/** True for /vendor/dashboard, /vendor/outlets, etc. False for /vendor/{store-slug}. */
export function isVendorPortalPath(pathname: string | null | undefined): boolean {
  if (!pathname?.startsWith('/vendor/')) return false;
  const segment = pathname.split('/').filter(Boolean)[1];
  return !!segment && VENDOR_PORTAL_SEGMENTS.has(segment);
}
