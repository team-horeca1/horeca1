/**
 * Shared parent → sub-category tree builder for vendor and brand storefronts.
 * Products roll up under parent categories; sub-categories become drill-down tiles.
 */

export interface CategoryLinkInput {
  id: string;
  name: string;
  image?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  parentImage?: string | null;
}

export interface CatalogProductForTree {
  id: string;
  image?: string;
  images?: string[];
  categoryId?: string;
  category?: string;
  categoryImage?: string | null;
  categoryParentId?: string | null;
  categoryParentName?: string | null;
  categoryParentImage?: string | null;
  subCategories?: CategoryLinkInput[];
}

export interface CategoryTreeChild {
  id: string;
  name: string;
  count: number;
  image?: string;
}

export interface CategoryTreeNode {
  id: string;
  name: string;
  count: number;
  image?: string;
  children: CategoryTreeChild[];
}

/** Safely extracts a category name string from a string or object. */
export function extractCategoryName(val: unknown): string {
  if (typeof val === 'string') return val.trim();
  if (val && typeof val === 'object') {
    if ('name' in val && typeof (val as { name?: unknown }).name === 'string') {
      return ((val as { name: string }).name || '').trim();
    }
  }
  return '';
}

/** Build hierarchical category sidebar nodes from catalog products. */
export function buildCategoryTree(products: CatalogProductForTree[]): CategoryTreeNode[] {
  const parents = new Map<string, CategoryTreeNode>();

  for (const p of products) {
    const rawCatName = extractCategoryName(p.category);
    const rawParentName = extractCategoryName(p.categoryParentName);

    const links: CategoryLinkInput[] = (p.subCategories && p.subCategories.length > 0)
      ? p.subCategories.map((sc) => ({
          id: String(sc.id || ''),
          name: extractCategoryName(sc.name),
          image: sc.image ?? undefined,
          parentId: sc.parentId ? String(sc.parentId) : undefined,
          parentName: extractCategoryName(sc.parentName) || undefined,
          parentImage: sc.parentImage ?? undefined,
        })).filter((sc) => sc.id && sc.name)
      : (p.categoryId && rawCatName
        ? [{
          id: String(p.categoryId),
          name: rawCatName,
          image: p.categoryImage ?? undefined,
          parentId: p.categoryParentId ? String(p.categoryParentId) : undefined,
          parentName: rawParentName || undefined,
          parentImage: p.categoryParentImage ?? undefined,
        }]
        : []);

    const productImage = p.image || p.images?.[0];
    const countedParents = new Set<string>();

    for (const sc of links) {
      if (!sc.id || !sc.name) continue;

      if (sc.parentId && sc.parentName) {
        let parent = parents.get(sc.parentId);
        if (!parent) {
          parent = { id: sc.parentId, name: sc.parentName, count: 0, children: [] };
          parents.set(sc.parentId, parent);
        }
        // Prefer the link's own parent image. Store/brand catalogs also stamp
        // the image on the product's primary parent, which collection SKUs omit.
        if (!parent.image) {
          const fromPrimary =
            sc.parentId === p.categoryParentId ? p.categoryParentImage ?? undefined : undefined;
          parent.image = sc.parentImage || fromPrimary || undefined;
        }

        let child = parent.children.find((c) => c.id === sc.id);
        if (!child) {
          child = {
            id: sc.id,
            name: sc.name,
            count: 0,
            image: sc.image ?? productImage ?? undefined,
          };
          parent.children.push(child);
        }
        if (!child.image) child.image = sc.image ?? productImage ?? undefined;
        child.count += 1;

        if (!countedParents.has(sc.parentId)) {
          parent.count += 1;
          countedParents.add(sc.parentId);
        }
      } else {
        let parent = parents.get(sc.id);
        if (!parent) {
          parent = {
            id: sc.id,
            name: sc.name,
            count: 0,
            image: sc.image ?? productImage ?? undefined,
            children: [],
          };
          parents.set(sc.id, parent);
        }
        if (!countedParents.has(sc.id)) {
          parent.count += 1;
          countedParents.add(sc.id);
        }
      }
    }
  }

  const list = Array.from(parents.values()).sort((a, b) => b.count - a.count);
  list.forEach((node) => node.children.sort((a, b) => b.count - a.count));
  return list;
}

/** Filter products by active category tab (`all` or `cat:<name>`). */
export function filterProductsByCatalogTab<T extends CatalogProductForTree>(
  products: T[],
  catalogTab: string,
): T[] {
  if (catalogTab === 'all') return products;
  if (!catalogTab.startsWith('cat:')) return products;

  const category = catalogTab.slice(4);
  return products.filter((p) => {
    const pCat = extractCategoryName(p.category);
    const pParentCat = extractCategoryName(p.categoryParentName);
    return (
      p.subCategories?.some((sc) => sc.name === category || sc.parentName === category) ||
      pCat === category ||
      pParentCat === category
    );
  });
}

export function slugifyCategory(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s.toLowerCase().trim().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

