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
import { ShareButton } from '@/components/features/share/ShareButton';
import { productShareContent } from '@/lib/share-cards/types';
import { cn, formatPrice } from '@/lib/utils';
import type { VendorProduct } from '@/types';

const ALL_TAB_ID = 'all';
const LS_TREE_KEY = 'h1:categories';
const LS_RAILS_PREFIX = 'h1:rails:';
const TREE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const RAILS_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

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

interface PersistedBlob<T> {
  savedAt: number;
  data: T;
}

function toRailCategory(c: Record<string, unknown>): RailCategory | null {
  const id = c.id as string | undefined;
  const name = (c.name as string) || '';
  const slug = (c.slug as string) || '';
  if (!id || !slug) return null;
  return { id, name, slug };
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

function readLocalStorage<T>(key: string, maxAgeMs: number): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedBlob<T>;
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > maxAgeMs) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeLocalStorage<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    const blob: PersistedBlob<T> = { savedAt: Date.now(), data };
    window.localStorage.setItem(key, JSON.stringify(blob));
  } catch {
    // quota / private mode — ignore
  }
}

function railsStorageKey(tabId: string, pincode?: string): string {
  return `${LS_RAILS_PREFIX}${tabId}|${pincode ?? 'all'}`;
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

export interface CategoryProductRailsProps {
  /** Approved category tree from the server (Redis-backed). */
  initialTree?: CategoryTreeNode[];
}

export function CategoryProductRails({ initialTree }: CategoryProductRailsProps) {
  const seededTabs = initialTree?.length ? parseTabs(initialTree) : [];
  const [tabs, setTabs] = useState<CategoryTab[]>(seededTabs);
  const [activeTab, setActiveTab] = useState(ALL_TAB_ID);
  const [rails, setRails] = useState<RailData[]>([]);
  const [loading, setLoading] = useState(true);
  const [treeReady, setTreeReady] = useState(seededTabs.length > 0);
  const [picker, setPicker] = useState<RailItem | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [allEmpty, setAllEmpty] = useState(false);

  const cacheRef = useRef<Map<string, RailData[]>>(new Map());
  const lastPincodeRef = useRef<string | undefined>(undefined);
  const hydratedFromLsRef = useRef(false);

  const { addToCart } = useCart();
  const { selectedAddress } = useAddress();
  const { currentOutlet } = useBusinessAccountSwitcher();
  const pincode = currentOutlet?.pincode ?? selectedAddress?.pincode;
  const validPincode = pincode && /^\d{6}$/.test(pincode) ? pincode : undefined;

  // Paint last rails from localStorage once on mount (survives reload).
  useEffect(() => {
    if (hydratedFromLsRef.current) return;
    hydratedFromLsRef.current = true;

    if (!initialTree?.length) {
      const lsTree = readLocalStorage<CategoryTreeNode[]>(LS_TREE_KEY, TREE_MAX_AGE_MS);
      if (lsTree?.length) {
        setTabs(parseTabs(lsTree));
        setTreeReady(true);
      }
    } else {
      writeLocalStorage(LS_TREE_KEY, initialTree);
    }

    const cachedRails = readLocalStorage<RailData[]>(
      railsStorageKey(ALL_TAB_ID, validPincode),
      RAILS_MAX_AGE_MS,
    );
    if (cachedRails && cachedRails.length > 0) {
      const key = cacheKey(ALL_TAB_ID, validPincode);
      cacheRef.current.set(key, cachedRails);
      setRails(cachedRails);
      setLoading(false);
      setAllEmpty(false);
    }
    // Only seed once from storage; pincode changes re-fetch below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount seed
  }, []);

  useEffect(() => {
    if (lastPincodeRef.current !== validPincode) {
      cacheRef.current = new Map();
      lastPincodeRef.current = validPincode;
    }
  }, [validPincode]);

  // Ensure tabs exist (server tree or client fetch).
  useEffect(() => {
    if (tabs.length > 0) {
      setTreeReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const tree = await dal.categories.listTree();
        if (cancelled) return;
        writeLocalStorage(LS_TREE_KEY, tree);
        setTabs(parseTabs(tree));
        setTreeReady(true);
      } catch {
        if (!cancelled) {
          setTabs([]);
          setTreeReady(true);
          setAllEmpty(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tabs.length]);

  // One batched rails request per tab / pincode. Paint LS/memory first, then revalidate.
  useEffect(() => {
    if (!treeReady) return;

    const key = cacheKey(activeTab, validPincode);
    let memory = cacheRef.current.get(key);
    if (!memory) {
      const fromLs = readLocalStorage<RailData[]>(
        railsStorageKey(activeTab, validPincode),
        RAILS_MAX_AGE_MS,
      );
      if (fromLs) {
        cacheRef.current.set(key, fromLs);
        memory = fromLs;
      }
    }

    if (memory) {
      queueMicrotask(() => {
        setRails(memory!);
        setLoading(false);
        if (activeTab === ALL_TAB_ID) setAllEmpty(memory!.length === 0);
      });
      // Still revalidate All tab in the background so stock/prices refresh.
      // Parent tabs that already have memory skip network until pincode changes.
      if (activeTab !== ALL_TAB_ID) return;
    } else {
      queueMicrotask(() => setLoading(true));
    }

    let cancelled = false;
    const paintedFromCache = Boolean(memory);

    (async () => {
      try {
        const result = await dal.categories.getHomepageRails({
          pincode: validPincode,
          parentId: activeTab === ALL_TAB_ID ? undefined : activeTab,
        });
        if (cancelled) return;

        if (result.tabs.length > 0 && tabs.length === 0) {
          setTabs(
            result.tabs.map((t) => ({
              id: t.id,
              name: t.name,
              slug: t.slug,
              image: t.image,
              children: t.children,
            })),
          );
        }

        const next = result.rails as RailData[];
        cacheRef.current.set(key, next);
        writeLocalStorage(railsStorageKey(activeTab, validPincode), next);
        setRails(next);
        setLoading(false);
        if (activeTab === ALL_TAB_ID) setAllEmpty(next.length === 0);
      } catch {
        if (cancelled) return;
        if (!paintedFromCache) {
          cacheRef.current.set(key, []);
          setRails([]);
          setLoading(false);
          if (activeTab === ALL_TAB_ID) setAllEmpty(true);
        } else {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [treeReady, activeTab, validPincode, tabs.length]);

  const handleAddOffer = (offer: VendorProduct) => {
    setAddingId(offer.id);
    try {
      const added = addToCart(offer, offer.minOrderQuantity || 1);
      if (!added) return;
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
                      const price = Number(item.defaultOffer.price);
                      const shareContent = productShareContent({
                        id: item.defaultOffer.id,
                        slug: item.defaultOffer.slug,
                        vendorId: item.defaultOffer.vendorId,
                        vendorSlug: item.defaultOffer.vendorSlug,
                        title,
                        vendorName: item.defaultOffer.vendorName,
                        image: img,
                        priceLabel: Number.isFinite(price) ? formatPrice(price) : null,
                        pack: pack || null,
                      });

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => openSuppliers(item)}
                          className="w-[160px] md:w-[180px] shrink-0 text-left bg-white rounded-xl border border-[#CDC4BA] overflow-hidden hover:border-primary hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 relative"
                        >
                          <div className="relative aspect-square bg-white">
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
                            <div className="absolute top-1.5 right-1.5 z-10">
                              <ShareButton content={shareContent} variant="overlay" className="size-8" />
                            </div>
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
