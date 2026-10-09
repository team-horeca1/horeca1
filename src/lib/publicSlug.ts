/**
 * Short public URLs: /vitocare, /davinci, /prabhat-butter.
 * Existing /vendor/:id, /brand/:slug, and /product/:id links keep working.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** First URL segments that already belong to the app. A slug here stays on the long path. */
const RESERVED = new Set([
  'account',
  'admin',
  'api',
  'auth',
  'brand',
  'brands',
  'businesses',
  'cart',
  'category',
  'checkout',
  'collections',
  'continue-ordering',
  'd',
  'deals',
  'invite',
  'login',
  'order-lists',
  'order-success',
  'orders',
  'payout',
  'product',
  'profile',
  'r',
  'recently-viewed',
  'register',
  'rewards',
  'search',
  'sentry-example-page',
  'under-construction',
  'vendor',
  'vendors',
  'voices',
  'wallet',
  'wishlist',
]);

export function isPublicSlug(value: string | null | undefined): value is string {
  if (!value) return false;
  const slug = value.trim().toLowerCase();
  if (slug.length < 2 || slug.length > 80) return false;
  if (UUID_RE.test(slug) || RESERVED.has(slug)) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function vendorPublicPath(
  vendor: { id: string; slug?: string | null },
  query?: Record<string, string | null | undefined>,
): string {
  const base = isPublicSlug(vendor.slug) ? `/${vendor.slug}` : `/vendor/${vendor.id}`;
  return withQuery(base, query);
}

export function brandPublicPath(slug: string): string {
  if (!slug.trim()) return '/brands';
  return isPublicSlug(slug) ? `/${slug}` : `/brand/${encodeURIComponent(slug)}`;
}

export function productPublicPath(opts: {
  id: string;
  slug?: string | null;
  vendorId: string;
  vendorSlug?: string | null;
}): string {
  if (isPublicSlug(opts.slug)) return `/${opts.slug}`;
  return vendorPublicPath(
    { id: opts.vendorId, slug: opts.vendorSlug },
    { product: opts.id },
  );
}

function withQuery(
  base: string,
  query?: Record<string, string | null | undefined>,
): string {
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
