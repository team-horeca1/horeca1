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
 * Database-backed unique slug resolver for single product create/update.
 * Checks existing products in DB for the vendor and auto-increments -1, -2, -3...
 * if a collision is found.
 */
export async function resolveUniqueProductSlug(
  db: Db,
  vendorId: string | null | undefined,
  store: string | null | undefined,
  name: string,
  sku?: string | null,
  excludeProductId?: string,
): Promise<string> {
  const base = buildProductSlugBase(store, name, sku);

  // Check if base slug is already used
  const existingRows = await (db as PrismaClient).product.findMany({
    where: {
      ...(vendorId ? { vendorId } : { vendorId: null }),
      ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
      slug: { startsWith: base.slice(0, 50) }, // broad prefix check to limit query size
    },
    select: { slug: true },
  });

  const taken = new Set(existingRows.map((r) => r.slug.toLowerCase()));

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
