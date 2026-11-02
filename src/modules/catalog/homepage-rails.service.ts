/**
 * Homepage "Shop by Category" aisle rails — one batched Postgres query,
 * Redis-cached by catalog version + pincode. Base/promo prices only in cache;
 * contract prices are applied by the route after a hit.
 */

import { prisma } from '@/lib/prisma';
import { totalStockQty } from '@/lib/inventoryHelpers';
import {
  getCachedCategoryTree,
  getCachedJson,
  getCatalogVersion,
  railsCacheKey,
  RAILS_TTL_SEC,
  setCachedJson,
} from '@/lib/catalogCache';
import { attachActivePromotions } from '@/modules/promotion/promotion-catalog';

/** Preferred leaf slugs for homepage aisle rails (order = priority). */
export const PRIORITY_SLUGS = [
  'pulses-dal',
  'grains-pulses',
  'grains-rice',
  'oils-ghee',
  'spices-masala',
  'herbs-seasonings',
  'cleaning-hygiene',
  'cleaning-supplies',
  'dairy-cheese-eggs',
  'milk-butter',
  'frozen-foods',
  'soft-drinks-water',
] as const;

const SUBTITLE_BY_SLUG: Record<string, string> = {
  'pulses-dal': 'restocked daily',
  'grains-pulses': 'restocked daily',
  'grains-rice': 'bulk-rate friendly',
  'oils-ghee': 'bulk-rate friendly',
  'spices-masala': 'flavour essentials',
  'herbs-seasonings': 'flavour essentials',
  'cleaning-hygiene': 'back-of-house needs',
  'cleaning-supplies': 'back-of-house needs',
  'dairy-cheese-eggs': 'cold-chain ready',
  'milk-butter': 'cold-chain ready',
  'frozen-foods': 'freezer staples',
  'soft-drinks-water': 'high-turn SKUs',
};

const ITEMS_PER_RAIL = 8;
const MAX_ALL_AISLES = 8;
const MIN_PRIORITY_AISLES = 4;
const OFFERS_CAP = 12;
/** Cap candidates across all selected aisles in one query. */
const CANDIDATE_TAKE_CAP = 320;

export interface RailCategory {
  id: string;
  name: string;
  slug: string;
}

export interface HomepageRailListing {
  id: string;
  masterProductId: string | null;
  name: string;
  slug?: string;
  packSize: string | null;
  unit: string | null;
  basePrice: unknown;
  promoPrice: unknown;
  originalPrice?: unknown;
  taxPercent?: unknown;
  imageUrl: string | null;
  images: string[];
  vendorId: string | null;
  brand?: string | null;
  vendor: {
    id: string;
    slug?: string;
    businessName: string;
    displayName?: string | null;
    logoUrl: string | null;
    minOrderValue: unknown;
    rating: unknown;
  } | null;
  inventories: Array<{ qtyAvailable: number; qtyReserved?: number }>;
  priceSlabs?: unknown[];
  category?: { id: string; name: string; slug: string } | null;
  categoryId?: string | null;
  categoryLinks?: Array<{ categoryId: string }>;
  masterProduct?: {
    id: string;
    name: string;
    sku: string;
    imageUrl: string | null;
    images: string[];
    packSize: string | null;
    uom: string | null;
  } | null;
  customerPricing?: { unitPrice: number } | null;
  storePromotion?: unknown;
  [key: string]: unknown;
}

export interface HomepageRailItem {
  master: {
    id: string;
    name: string;
    sku?: string;
    imageUrl: string | null;
    images?: string[];
    packSize: string | null;
    unit: string | null;
  } | null;
  vendorCount: number;
  defaultOffer: HomepageRailListing;
  offers: HomepageRailListing[];
}

export interface HomepageRail {
  category: RailCategory;
  subtitle: string;
  items: HomepageRailItem[];
}

type CategoryTreeNode = {
  id?: string;
  name?: string;
  slug?: string;
  imageUrl?: string | null;
  image?: string | null;
  children?: CategoryTreeNode[];
};

function toRailCategory(c: CategoryTreeNode): RailCategory | null {
  if (!c.id || !c.slug) return null;
  return { id: c.id, name: c.name || '', slug: c.slug };
}

function collectBySlug(roots: CategoryTreeNode[]): Map<string, CategoryTreeNode> {
  const bySlug = new Map<string, CategoryTreeNode>();
  for (const root of roots) {
    const children = Array.isArray(root.children) ? root.children : [];
    if (children.length === 0) {
      if (root.slug) bySlug.set(root.slug, root);
      continue;
    }
    for (const child of children) {
      if (child.slug) bySlug.set(child.slug, child);
    }
  }
  return bySlug;
}

/**
 * All-tab targets: priority slugs that exist, filled up to MAX_ALL_AISLES
 * from remaining leaves if fewer than MIN_PRIORITY_AISLES matched.
 */
export function pickAllTabTargets(roots: CategoryTreeNode[]): RailCategory[] {
  const bySlug = collectBySlug(roots);
  const seen = new Set<string>();
  const out: RailCategory[] = [];

  const push = (node: CategoryTreeNode) => {
    const cat = toRailCategory(node);
    if (!cat || seen.has(cat.id)) return;
    seen.add(cat.id);
    out.push(cat);
  };

  for (const slug of PRIORITY_SLUGS) {
    if (out.length >= MAX_ALL_AISLES) break;
    const hit = bySlug.get(slug);
    if (hit) push(hit);
  }

  if (out.length < MIN_PRIORITY_AISLES) {
    for (const root of roots) {
      if (out.length >= MAX_ALL_AISLES) break;
      const children = Array.isArray(root.children) ? root.children : [];
      if (children.length === 0) {
        push(root);
      } else {
        for (const child of children) {
          if (out.length >= MAX_ALL_AISLES) break;
          push(child);
        }
      }
    }
  }

  return out.slice(0, MAX_ALL_AISLES);
}

/** Parent-tab targets: children of parent, or the parent itself if it is a leaf. */
export function pickParentTabTargets(
  roots: CategoryTreeNode[],
  parentId: string,
): RailCategory[] {
  for (const root of roots) {
    if (root.id !== parentId) continue;
    const children = Array.isArray(root.children) ? root.children : [];
    if (children.length === 0) {
      const self = toRailCategory(root);
      return self ? [self] : [];
    }
    return children
      .map((c) => toRailCategory(c))
      .filter((c): c is RailCategory => c != null)
      .slice(0, MAX_ALL_AISLES);
  }
  return [];
}

function groupKey(p: HomepageRailListing): string {
  if (p.masterProductId) return `m:${p.masterProductId}`;
  const name = (p.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const pack = (p.packSize || '').trim().toLowerCase();
  const unit = (p.unit || '').trim().toLowerCase();
  return `f:${name}|${pack}|${unit}`;
}

function unitPrice(p: HomepageRailListing): number {
  if (p.customerPricing != null && Number.isFinite(Number(p.customerPricing.unitPrice))) {
    return Number(p.customerPricing.unitPrice);
  }
  const base = Number(p.basePrice) || 0;
  const promo = p.promoPrice != null ? Number(p.promoPrice) : null;
  if (promo != null && promo < base) return promo;
  return base;
}

function sortOffers(a: HomepageRailListing, b: HomepageRailListing): number {
  const stockA = totalStockQty(a.inventories) > 0 ? 1 : 0;
  const stockB = totalStockQty(b.inventories) > 0 ? 1 : 0;
  if (stockB !== stockA) return stockB - stockA;
  return unitPrice(a) - unitPrice(b);
}

function productMatchesCategory(
  p: HomepageRailListing,
  categoryId: string,
): boolean {
  if (p.categoryId === categoryId) return true;
  if (Array.isArray(p.categoryLinks) && p.categoryLinks.some((l) => l.categoryId === categoryId)) {
    return true;
  }
  return false;
}

function buildRailItems(
  listings: HomepageRailListing[],
  limit: number,
): HomepageRailItem[] {
  const groups = new Map<string, HomepageRailListing[]>();
  for (const p of listings) {
    const key = groupKey(p);
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  return Array.from(groups.values())
    .map((offers) => {
      const sorted = offers.slice().sort(sortOffers);
      const capped = sorted.slice(0, OFFERS_CAP);
      const defaultOffer = capped[0];
      const master = defaultOffer.masterProduct ?? null;

      return {
        master: master
          ? {
              id: master.id,
              name: master.name,
              sku: master.sku,
              imageUrl: master.imageUrl,
              images: master.images,
              packSize: master.packSize,
              unit: master.uom,
            }
          : null,
        vendorCount: capped.length,
        defaultOffer,
        offers: capped,
      };
    })
    .sort((a, b) => {
      if (b.vendorCount !== a.vendorCount) return b.vendorCount - a.vendorCount;
      return unitPrice(a.defaultOffer) - unitPrice(b.defaultOffer);
    })
    .slice(0, limit);
}

async function loadCandidates(
  categoryIds: string[],
  vendorIdFilter: string[] | null,
): Promise<HomepageRailListing[]> {
  if (categoryIds.length === 0) return [];

  const take = Math.min(categoryIds.length * 40, CANDIDATE_TAKE_CAP);

  const candidates = await prisma.product.findMany({
    where: {
      isActive: true,
      approvalStatus: 'approved',
      inventories: { some: { qtyAvailable: { gt: 0 } } },
      ...(vendorIdFilter ? { vendorId: { in: vendorIdFilter } } : {}),
      OR: [
        { categoryId: { in: categoryIds } },
        { categoryLinks: { some: { categoryId: { in: categoryIds } } } },
      ],
    },
    select: {
      id: true,
      masterProductId: true,
      name: true,
      slug: true,
      packSize: true,
      unit: true,
      basePrice: true,
      promoPrice: true,
      originalPrice: true,
      taxPercent: true,
      imageUrl: true,
      images: true,
      vendorId: true,
      brand: true,
      categoryId: true,
      vendor: {
        select: {
          id: true,
          slug: true,
          businessName: true,
          displayName: true,
          logoUrl: true,
          minOrderValue: true,
          rating: true,
        },
      },
      inventories: { select: { qtyAvailable: true, qtyReserved: true } },
      category: { select: { id: true, name: true, slug: true } },
      priceSlabs: { orderBy: { minQty: 'asc' }, take: 3 },
      categoryLinks: {
        where: { categoryId: { in: categoryIds } },
        select: { categoryId: true },
      },
      masterProduct: {
        select: {
          id: true,
          name: true,
          sku: true,
          imageUrl: true,
          images: true,
          packSize: true,
          uom: true,
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
    take,
  });

  return candidates as unknown as HomepageRailListing[];
}

async function buildRailsForTargets(
  targets: RailCategory[],
  pincode?: string,
): Promise<{ rails: HomepageRail[]; noVendorsForPincode: boolean }> {
  if (targets.length === 0) {
    return { rails: [], noVendorsForPincode: false };
  }

  let vendorIdFilter: string[] | null = null;
  if (pincode && /^\d{6}$/.test(pincode)) {
    const areas = await prisma.serviceArea.findMany({
      where: { pincode },
      select: { vendorId: true },
    });
    vendorIdFilter = Array.from(new Set(areas.map((a) => a.vendorId)));
    if (vendorIdFilter.length === 0) {
      return { rails: [], noVendorsForPincode: true };
    }
  }

  const categoryIds = targets.map((t) => t.id);
  let listings = await loadCandidates(categoryIds, vendorIdFilter);
  listings = (await attachActivePromotions(listings)) as HomepageRailListing[];

  const rails: HomepageRail[] = [];
  for (const category of targets) {
    const matched = listings.filter((p) => productMatchesCategory(p, category.id));
    const items = buildRailItems(matched, ITEMS_PER_RAIL);
    if (items.length === 0) continue;
    rails.push({
      category,
      subtitle: SUBTITLE_BY_SLUG[category.slug] || 'wholesale essentials',
      items,
    });
  }

  return { rails, noVendorsForPincode: false };
}

export interface HomepageRailsPayload {
  rails: HomepageRail[];
  noVendorsForPincode: boolean;
  tabs: Array<{
    id: string;
    name: string;
    slug: string;
    image?: string;
    children: RailCategory[];
  }>;
}

function parseTabs(roots: CategoryTreeNode[]): HomepageRailsPayload['tabs'] {
  const tabs: HomepageRailsPayload['tabs'] = [];
  for (const root of roots) {
    const cat = toRailCategory(root);
    if (!cat) continue;
    const children = (Array.isArray(root.children) ? root.children : [])
      .map((child) => toRailCategory(child))
      .filter((c): c is RailCategory => c != null);
    tabs.push({
      ...cat,
      image: root.imageUrl || root.image || undefined,
      children,
    });
  }
  return tabs;
}

/**
 * Cached base-catalog rails for the homepage All tab or a parent tab.
 * Does not apply contract pricing — the route does that after the cache hit.
 */
export async function getHomepageCategoryRails(options: {
  pincode?: string;
  parentId?: string;
}): Promise<HomepageRailsPayload> {
  const tree = (await getCachedCategoryTree()) as CategoryTreeNode[];
  const tabs = parseTabs(tree);
  const targets = options.parentId
    ? pickParentTabTargets(tree, options.parentId)
    : pickAllTabTargets(tree);

  const ver = await getCatalogVersion();
  const cacheKey = railsCacheKey(ver, options.pincode, options.parentId);

  const cached = await getCachedJson<{
    rails: HomepageRail[];
    noVendorsForPincode: boolean;
  }>(cacheKey);

  if (cached) {
    return { ...cached, tabs };
  }

  const built = await buildRailsForTargets(targets, options.pincode);
  await setCachedJson(cacheKey, built, RAILS_TTL_SEC);
  return { ...built, tabs };
}

/** Apply customerPricing onto nested offer objects after a cache hit. */
export function remapRailsOffers(
  rails: HomepageRail[],
  byId: Map<string, HomepageRailListing>,
): HomepageRail[] {
  return rails.map((rail) => ({
    ...rail,
    items: rail.items.map((item) => ({
      ...item,
      defaultOffer: byId.get(item.defaultOffer.id) ?? item.defaultOffer,
      offers: item.offers.map((o) => byId.get(o.id) ?? o),
    })),
  }));
}

export function collectRailListings(rails: HomepageRail[]): HomepageRailListing[] {
  const seen = new Set<string>();
  const out: HomepageRailListing[] = [];
  for (const rail of rails) {
    for (const item of rail.items) {
      for (const offer of [item.defaultOffer, ...item.offers]) {
        if (!offer?.id || seen.has(offer.id)) continue;
        seen.add(offer.id);
        out.push(offer);
      }
    }
  }
  return out;
}
