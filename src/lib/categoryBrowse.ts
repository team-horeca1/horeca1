export interface CatNode {
  id: string;
  name: string;
  slug: string;
  image?: string;
  children: CatNode[];
}

export function parseCat(raw: Record<string, unknown>): CatNode {
  const childrenRaw = Array.isArray(raw.children) ? raw.children : [];
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    slug: String(raw.slug ?? ''),
    image: (raw.imageUrl as string) || (raw.image as string) || undefined,
    children: childrenRaw
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map(parseCat),
  };
}

export function findBySlug(
  nodes: CatNode[],
  slug: string,
): { parent: CatNode; child: CatNode | null } | null {
  const needle = slug.toLowerCase();
  for (const parent of nodes) {
    if (parent.slug.toLowerCase() === needle) return { parent, child: null };
    const child = parent.children.find((c) => c.slug.toLowerCase() === needle);
    if (child) return { parent, child };
  }
  return null;
}

export function leafCategoryId(found: { parent: CatNode; child: CatNode | null } | null): string | null {
  if (!found) return null;
  if (found.child) return found.child.id;
  if (found.parent.children.length === 0) return found.parent.id;
  return null;
}

/** Category IDs to query for products: one leaf, or every sub-category plus the parent. */
export function productCategoryIds(
  found: { parent: CatNode; child: CatNode | null } | null,
): string[] {
  if (!found) return [];
  if (found.child) return [found.child.id];
  const childIds = found.parent.children.map((c) => c.id);
  if (childIds.length === 0) return [found.parent.id];
  return [...childIds, found.parent.id];
}

export function skuItemKey(item: {
  master: { id: string } | null;
  defaultOffer: { id: string };
}): string {
  return item.master?.id ? `m:${item.master.id}` : `o:${item.defaultOffer.id}`;
}

type MergeableSku = {
  master: { id: string } | null;
  vendorCount: number;
  defaultOffer: { id: string; price: number };
  offers: Array<{ id: string; price: number }>;
};

/** Dedupes SKUs across sub-categories and merges competing vendor offers. */
export function mergeCategorySkuItems<T extends MergeableSku>(groups: T[][]): T[] {
  const map = new Map<string, T>();
  for (const group of groups) {
    for (const item of group) {
      const key = skuItemKey(item);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
        continue;
      }
      const seen = new Set(existing.offers.map((o) => o.id));
      const extra = item.offers.filter((o) => !seen.has(o.id));
      if (extra.length === 0) continue;
      const offers = [...existing.offers, ...extra];
      const cheaper =
        Number(item.defaultOffer.price) < Number(existing.defaultOffer.price)
          ? item.defaultOffer
          : existing.defaultOffer;
      map.set(key, {
        ...existing,
        offers,
        vendorCount: offers.length,
        defaultOffer: cheaper,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.vendorCount !== a.vendorCount) return b.vendorCount - a.vendorCount;
    return Number(a.defaultOffer.price) - Number(b.defaultOffer.price);
  });
}

export function categorySkuHref(
  categorySlug: string,
  item: { master: { id: string } | null; defaultOffer: { id: string } },
): string {
  const id = item.master?.id || item.defaultOffer.id;
  return `/category/${categorySlug}/sku/${id}`;
}
