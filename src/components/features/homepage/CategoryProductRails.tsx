'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LayoutGrid, Package, Store } from 'lucide-react';
import { toast } from 'sonner';
import { dal } from '@/lib/dal';
import { useAddress } from '@/context/AddressContext';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { useCart } from '@/context/CartContext';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { VendorOfferPicker } from '@/components/features/homepage/VendorOfferPicker';
import { cn } from '@/lib/utils';
import type { VendorProduct } from '@/types';

/** Preferred leaf slugs for homepage aisle rails (order = priority). */
const PRIORITY_SLUGS = [
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
const ALL_TAB_ID = 'all';

interface RailCategory {
  id: string;
  name: string;
  slug: string;
}

interface RailItem {
  master: {
    id: string;
    name: string;
    imageUrl: string | null;
    images?: string[];
    packSize: string | null;
    unit: string | null;
  } | null;
  vendorCount: number;
  defaultOffer: VendorProduct;
  offers: VendorProduct[];
}

interface RailData {
  category: RailCategory;
  subtitle: string;
  items: RailItem[];
}

interface CategoryTab {
  id: string;
  name: string;
  slug: string;
  image?: string;
  children: RailCategory[];
}

type CategoryTreeNode = Record<string, unknown> & {
  children?: Array<Record<string, unknown>>;
};

function toRailCategory(c: Record<string, unknown>): RailCategory | null {
  const id = c.id as string | undefined;
  const name = (c.name as string) || '';
  const slug = (c.slug as string) || '';
  if (!id || !slug) return null;
  return { id, name, slug };
}

function pickLeafTargets(roots: CategoryTreeNode[]): RailCategory[] {
  const leaves: RailCategory[] = [];
  const seen = new Set<string>();

  const push = (c: Record<string, unknown>) => {
    const cat = toRailCategory(c);
    if (!cat || seen.has(cat.id)) return;
    seen.add(cat.id);
    leaves.push(cat);
  };

  const bySlug = new Map<string, Record<string, unknown>>();
  for (const root of roots) {
    const children = Array.isArray(root.children) ? root.children : [];
    if (children.length === 0) {
      bySlug.set((root.slug as string) || '', root);
      continue;
    }
    for (const child of children) {
      bySlug.set((child.slug as string) || '', child);
    }
  }

  for (const slug of PRIORITY_SLUGS) {
    const hit = bySlug.get(slug);
    if (hit) push(hit);
  }

  for (const root of roots) {
    const children = Array.isArray(root.children) ? root.children : [];
    if (children.length === 0) {
      push(root);
    } else {
      for (const child of children) push(child);
    }
  }

  return leaves;
}

function parseTabs(roots: CategoryTreeNode[]): CategoryTab[] {
  const tabs: CategoryTab[] = [];
  for (const root of roots) {
    const cat = toRailCategory(root);
    if (!cat) continue;
    const children = (Array.isArray(root.children) ? root.children : [])
      .map((child) => toRailCategory(child))
      .filter((c): c is RailCategory => c != null);
    tabs.push({
      ...cat,
      image: (root.imageUrl as string) || (root.image as string) || undefined,
      children,
    });
  }
  return tabs;
}

function targetsForTab(tabId: string, tabs: CategoryTab[], allTargets: RailCategory[]): RailCategory[] {
  if (tabId === ALL_TAB_ID) return allTargets;
  const parent = tabs.find((t) => t.id === tabId);
  if (!parent) return [];
  if (parent.children.length === 0) return [parent];
  return parent.children;
}

function cacheKey(tabId: string, pincode?: string): string {
  return `${tabId}|${pincode ?? ''}`;
}

function itemTitle(item: RailItem): string {
  return (
    item.master?.name ||
    item.defaultOffer.displayName ||
    item.defaultOffer.name ||
    'Product'
  );
}

function itemImage(item: RailItem): string | null {
  if (item.master?.imageUrl) return item.master.imageUrl;
  if (item.master?.images?.[0]) return item.master.images[0];
  return item.defaultOffer.images?.[0] ?? null;
}

function itemPack(item: RailItem): string | null {
  const pack = item.master?.packSize || item.defaultOffer.packSize;
  const unit = item.master?.unit || item.defaultOffer.unit;
  if (pack && unit && !String(pack).includes(String(unit))) return `${pack} ${unit}`;
  return pack || unit || null;
}

async function fetchRails(
  targets: RailCategory[],
  pincode?: string,
): Promise<RailData[]> {
  const results = await Promise.all(
    targets.map(async (category) => {
      try {
        const { items } = await dal.categories.getProducts(category.id, {
          pincode,
          limit: ITEMS_PER_RAIL,
        });
        return {
          category,
          subtitle: SUBTITLE_BY_SLUG[category.slug] || 'wholesale essentials',
          items,
        } satisfies RailData;
      } catch {
        return {
          category,
          subtitle: SUBTITLE_BY_SLUG[category.slug] || 'wholesale essentials',
          items: [],
        } satisfies RailData;
      }
    }),
  );
  return results.filter((r) => r.items.length > 0);
}

function RailSkeleton() {
  return (
    <>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="px-4 md:px-[var(--container-padding)]">
          <div className="h-5 w-48 bg-[#E9E3DD] rounded animate-pulse mb-3" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, j) => (
              <div
                key={j}
                className="h-[240px] w-[160px] shrink-0 rounded-xl bg-[#E9E3DD]/70 animate-pulse"
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function CategoryProductRails() {
  const [tabs, setTabs] = useState<CategoryTab[]>([]);
  const [allTargets, setAllTargets] = useState<RailCategory[]>([]);
  const [activeTab, setActiveTab] = useState(ALL_TAB_ID);
  const [rails, setRails] = useState<RailData[]>([]);
  const [loading, setLoading] = useState(true);
  const [treeReady, setTreeReady] = useState(false);
  const [picker, setPicker] = useState<RailItem | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [allEmpty, setAllEmpty] = useState(false);

  const cacheRef = useRef<Map<string, RailData[]>>(new Map());
  const lastPincodeRef = useRef<string | undefined>(undefined);

  const { addToCart } = useCart();
  const { selectedAddress } = useAddress();
  const { currentOutlet } = useBusinessAccountSwitcher();
  const pincode = currentOutlet?.pincode ?? selectedAddress?.pincode;
  const validPincode = pincode && /^\d{6}$/.test(pincode) ? pincode : undefined;

  useEffect(() => {
    if (lastPincodeRef.current !== validPincode) {
      cacheRef.current = new Map();
      lastPincodeRef.current = validPincode;
    }
  }, [validPincode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tree = await dal.categories.listTree();
        if (cancelled) return;
        setTabs(parseTabs(tree));
        setAllTargets(pickLeafTargets(tree));
        setTreeReady(true);
      } catch {
        if (!cancelled) {
          setTabs([]);
          setAllTargets([]);
          setTreeReady(true);
          setAllEmpty(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!treeReady) return;

    const key = cacheKey(activeTab, validPincode);
    const cached = cacheRef.current.get(key);
    if (cached) {
      queueMicrotask(() => {
        setRails(cached);
        setLoading(false);
        if (activeTab === ALL_TAB_ID) setAllEmpty(cached.length === 0);
      });
      return;
    }

    const targets = targetsForTab(activeTab, tabs, allTargets);
    let cancelled = false;
    queueMicrotask(() => setLoading(true));

    (async () => {
      if (targets.length === 0) {
        if (!cancelled) {
          cacheRef.current.set(key, []);
          setRails([]);
          setLoading(false);
          if (activeTab === ALL_TAB_ID) setAllEmpty(true);
        }
        return;
      }

      const next = await fetchRails(targets, validPincode);
      if (cancelled) return;
      cacheRef.current.set(key, next);
      setRails(next);
      setLoading(false);
      if (activeTab === ALL_TAB_ID) setAllEmpty(next.length === 0);
    })();

    return () => {
      cancelled = true;
    };
  }, [treeReady, activeTab, tabs, allTargets, validPincode]);

  const handleAddOffer = (offer: VendorProduct) => {
    setAddingId(offer.id);
    try {
      addToCart(offer, offer.minOrderQuantity || 1);
      toast.success(`Added from ${offer.vendorName || 'supplier'}`);
      setPicker(null);
    } catch {
      toast.error('Could not add to cart');
    } finally {
      queueMicrotask(() => setAddingId(null));
    }
  };

  const openSuppliers = (item: RailItem) => {
    if (item.offers.length === 0) {
      toast.message('No suppliers available for this SKU right now');
      return;
    }
    setPicker(item);
  };

  const activeParent = tabs.find((t) => t.id === activeTab);
  const showEmptyAisle = !loading && rails.length === 0 && activeTab !== ALL_TAB_ID;

  // If there are no category tabs to render, don't show the rails loader/skeleton.
  // (This can happen when the category tree returns children but no valid root tabs.)
  if (treeReady && tabs.length === 0) return null;
  if (treeReady && allEmpty && activeTab === ALL_TAB_ID && !loading) return null;

  return (
    <section className="w-full py-5 md:py-7 bg-background overflow-hidden">
      <div className="max-w-[var(--container-max)] mx-auto">
        <div className="px-4 md:px-[var(--container-padding)] mb-3">
          <SectionHeader
            title="Shop by Category"
            subtitle="Pick a category to see its products and suppliers"
            actionLabel="View all →"
            actionHref="/category"
          />
        </div>

        {tabs.length > 0 && (
          <div className="overflow-x-auto no-scrollbar scroll-smooth mb-5 md:mb-6">
            <div
              className="flex gap-2 px-4 md:px-[var(--container-padding)] w-max"
              role="tablist"
              aria-label="Shop by aisle categories"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === ALL_TAB_ID}
                onClick={() => setActiveTab(ALL_TAB_ID)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold whitespace-nowrap min-h-10 border transition-all',
                  activeTab === ALL_TAB_ID
                    ? 'bg-primary text-white border-primary shadow-cdl-1'
                    : 'bg-white text-text-secondary border-divider hover:border-primary/40 hover:text-primary',
                )}
              >
                <LayoutGrid size={14} strokeWidth={2.2} />
                All
              </button>
              {tabs.map((tab) => {
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold whitespace-nowrap min-h-10 border transition-all',
                      selected
                        ? 'bg-primary text-white border-primary shadow-cdl-1'
                        : 'bg-white text-text-secondary border-divider hover:border-primary/40 hover:text-primary',
                    )}
                  >
                    {tab.image ? (
                      <span className="relative size-[18px] rounded-full overflow-hidden shrink-0 bg-white">
                        <Image src={tab.image} alt="" fill sizes="18px" className="object-cover" />
                      </span>
                    ) : null}
                    {tab.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-6 md:space-y-8">
          {loading ? (
            <RailSkeleton />
          ) : showEmptyAisle ? (
            <div className="px-4 md:px-[var(--container-padding)] py-10 text-center">
              <p className="text-[14px] font-semibold text-[#1C1C1C]">No products in this aisle yet</p>
              {activeParent ? (
                <Link
                  href={`/category/${activeParent.slug}`}
                  className="mt-2 inline-block text-[13px] font-semibold text-primary hover:underline"
                >
                  Browse {activeParent.name} →
                </Link>
              ) : null}
            </div>
          ) : (
            rails.map((rail) => (
              <div key={rail.category.id}>
                <div className="px-4 md:px-[var(--container-padding)] mb-2 md:mb-3">
                  <SectionHeader
                    title={rail.category.name}
                    subtitle={rail.subtitle}
                    actionLabel="View all →"
                    actionHref={`/category/${rail.category.slug}`}
                  />
                </div>
                <div className="overflow-x-auto no-scrollbar scroll-smooth">
                  <div className="flex gap-3 md:gap-4 py-1 px-4 md:px-[var(--container-padding)] w-max">
                    {rail.items.map((item) => {
                      const title = itemTitle(item);
                      const img = itemImage(item);
                      const pack = itemPack(item);
                      const key = item.master?.id || item.defaultOffer.id;

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => openSuppliers(item)}
                          className="w-[160px] md:w-[180px] shrink-0 text-left bg-white rounded-xl border border-[#E9E3DD] overflow-hidden hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          <div className="relative aspect-square bg-[#FAF5EC]">
                            {img ? (
                              <Image
                                src={img}
                                alt={title}
                                fill
                                sizes="180px"
                                className="object-contain p-2"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-[#E9E3DD]">
                                <Package size={28} />
                              </div>
                            )}
                          </div>
                          <div className="p-3">
                            <h3 className="text-[13px] font-bold text-[#1C1C1C] line-clamp-2 leading-snug min-h-[2.4em]">
                              {title}
                            </h3>
                            {pack ? (
                              <p className="mt-1 text-[11px] text-[#667085] font-medium truncate">
                                {pack}
                              </p>
                            ) : null}
                            {item.vendorCount > 0 ? (
                              <p className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-primary">
                                <Store size={12} strokeWidth={2.5} />
                                {item.vendorCount} supplier
                                {item.vendorCount === 1 ? '' : 's'}
                              </p>
                            ) : (
                              <p className="mt-2 text-[12px] font-semibold text-[#667085]">
                                No suppliers
                              </p>
                            )}
                            <span className="mt-2.5 flex w-full items-center justify-center min-h-10 rounded-lg bg-primary text-white text-[12px] font-bold">
                              See suppliers
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {picker && (
        <VendorOfferPicker
          productName={itemTitle(picker)}
          offers={picker.offers}
          pincode={validPincode}
          addingId={addingId}
          onClose={() => setPicker(null)}
          onAdd={handleAddOffer}
        />
      )}
    </section>
  );
}
