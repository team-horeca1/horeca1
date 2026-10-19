import type { PrismaClient, Prisma } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Standard slugify: lowercase, alphanumeric + hyphens only, no leading/trailing hyphens.
 */
export function slugify(text: string): string {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // remove non-word chars
    .replace(/[\s_-]+/g, '-') // collapse whitespace/underscores to single hyphen
    .replace(/^-+|-+$/g, ''); // trim hyphens
}

/**
 * Build the base slug format: [store]-[product-name]-[sku]
 * Handles missing pieces gracefully (e.g. if store or sku is not yet assigned).
 */
export function buildProductSlugBase(store: string | null | undefined, name: string, sku?: string | null): string {
  const parts: string[] = [];

  const storeSlug = slugify(store || '');
  if (storeSlug) parts.push(storeSlug);

  const nameSlug = slugify(name || 'product') || 'product';
  parts.push(nameSlug);

  const skuSlug = slugify(sku || '');
  if (skuSlug) parts.push(skuSlug);

  let combined = parts.join('-');
  // Ensure total length leaves room for auto-increment suffix (e.g. -999) within VARCHAR(255)
  if (combined.length > 240) {
    combined = combined.slice(0, 240).replace(/-+$/, '');
  }
  return combined || 'product';
}

/**
 * In-memory unique slug generator (for bulk uploads / imports).
 * Given a store, name, and sku, guarantees a unique slug by checking against `usedSlugs`
 * and auto-incrementing -1, -2, -3... if a collision occurs.
 */
export function mintUniqueImportSlug(
  usedSlugs: Set<string>,
  store: string | null | undefined,
  name: string,
  sku?: string | null,
): string {
  const base = buildProductSlugBase(store, name, sku);
  let candidate = base;
  let counter = 1;

  while (usedSlugs.has(candidate)) {
    const suffix = `-${counter++}`;
    const maxBaseLen = 255 - suffix.length;
    const trimmedBase = base.length > maxBaseLen ? base.slice(0, maxBaseLen).replace(/-+$/, '') : base;
    candidate = `${trimmedBase}${suffix}`;
  }

  usedSlugs.add(candidate);
  return candidate;
}

/**
 * Slugs already used by a live product, a store, or a brand.
 * A short public URL can open only one of those pages.
 */
export async function loadOccupiedSlugSet(db: Db): Promise<Set<string>> {
  const client = db as PrismaClient;
  const [products, vendors, brands] = await Promise.all([
    client.product.findMany({
      where: { NOT: { slug: { startsWith: '_deleted_' } } },
      select: { slug: true },
    }),
    client.vendor.findMany({ select: { slug: true } }),
    client.brand.findMany({ select: { slug: true } }),
  ]);
  return new Set(
    [...products, ...vendors, ...brands].map((row) => row.slug.toLowerCase()),
  );
}

function firstFreeSlug(base: string, taken: Set<string>): string {
  let candidate = base;
  let counter = 1;
  while (taken.has(candidate.toLowerCase())) {
    const suffix = `-${counter++}`;
    const maxBaseLen = 255 - suffix.length;
    const trimmedBase = base.length > maxBaseLen ? base.slice(0, maxBaseLen).replace(/-+$/, '') : base;
    candidate = `${trimmedBase}${suffix}`;
  }
  return candidate;
}

/** Keep `desired` if it is free; otherwise append -1, -2, ... */
export async function claimUniqueProductSlug(
  db: Db,
  desired: string,
  excludeProductId?: string,
): Promise<string> {
  const base = slugify(desired).slice(0, 240).replace(/-+$/, '') || 'product';
  const taken = await loadOccupiedSlugSet(db);
  if (excludeProductId) {
    const current = await (db as PrismaClient).product.findUnique({
      where: { id: excludeProductId },
      select: { slug: true },
    });
    if (current?.slug) taken.delete(current.slug.toLowerCase());
  }
  return firstFreeSlug(base, taken);
}

/**
 * Database-backed unique slug resolver for single product create/update.
 * The slug must be free across every store, not only the current one,
 * and must not match a store or brand address.
 */
export async function resolveUniqueProductSlug(
  db: Db,
  _vendorId: string | null | undefined,
  store: string | null | undefined,
  name: string,
  sku?: string | null,
  excludeProductId?: string,
): Promise<string> {
  return claimUniqueProductSlug(
    db,
    buildProductSlugBase(store, name, sku),
    excludeProductId,
  );
}
