'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { dal } from '@/lib/dal';
import { CATEGORY_FETCH_CONCURRENCY, mapWithConcurrency } from '@/lib/mapWithConcurrency';
import { useDeliveryPincode } from '@/hooks/useDeliveryPincode';
import {
  parseCat,
  findBySlug,
  productCategoryIds,
  mergeCategorySkuItems,
  categoryRailTree,
  type CatNode,
} from '@/lib/categoryBrowse';
import { filterProductsByCatalogTab, type CategoryLinkInput } from '@/lib/categoryTree';
import { CategoryBrowseLayout } from '@/components/features/category/CategoryBrowseLayout';
import { CategorySkuCard, type CategorySkuItem } from '@/components/features/category/CategorySkuCard';
import { VendorOfferPicker } from '@/components/features/homepage/VendorOfferPicker';
import { StickyCartBar } from '@/components/features/vendor/StickyCartBar';
import { useCart } from '@/context/CartContext';
import { toast } from 'sonner';
import type { VendorProduct } from '@/types';

const PRODUCT_LIMIT = 60;

type BrowseSku = CategorySkuItem & { subCategories: CategoryLinkInput[] };

function titleFromSlug(slug: string) {
  return slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function linkFor(parent: CatNode, id: string): CategoryLinkInput {
  if (id === parent.id) {
    return { id: parent.id, name: parent.name, image: parent.image };
  }
  const child = parent.children.find((node) => node.id === id);
  if (child) {
    return {
      id: child.id,
      name: child.name,
      image: child.image,
      parentId: parent.id,
      parentName: parent.name,
      parentImage: parent.image,
    };
  }
  return { id, name: id };
}

function findChildByName(parent: CatNode, name: string): CatNode | null {
  for (const child of parent.children) {
    if (child.name === name) return child;
    const grand = child.children.find((node) => node.name === name);
    if (grand) return grand;
  }
  return null;
}

async function loadParentProducts(parent: CatNode, pincode?: string): Promise<BrowseSku[]> {
  const ids = productCategoryIds({ parent, child: null });
  const groups = await mapWithConcurrency(ids, CATEGORY_FETCH_CONCURRENCY, async (id) => {
    const link = linkFor(parent, id);
    try {
      const { items } = await dal.categories.getProducts(id, { pincode, limit: PRODUCT_LIMIT });
      return items.map((item) => ({ ...item, subCategories: [link] }));
    } catch {
      return [] as BrowseSku[];
    }
  });
  return mergeCategorySkuItems(groups);
}

function CategoryBrowseContent() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [tree, setTree] = useState<CatNode[]>([]);
  const [products, setProducts] = useState<BrowseSku[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const loadedKeyRef = useRef('');

  const { addToCart } = useCart();
  const [picker, setPicker] = useState<CategorySkuItem | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

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

  const openCompare = (item: CategorySkuItem) => {
    if (item.offers.length === 0) return;
    setPicker(item);
  };

  const pincode = useDeliveryPincode();
  const validPin = pincode && /^\d{6}$/.test(pincode) ? pincode : undefined;

  const match = useMemo(() => (slug ? findBySlug(tree, slug) : null), [tree, slug]);
  const activeParent = match?.parent ?? null;
  const activeChild = match?.child ?? null;
  const viewingAll = Boolean(activeParent && !activeChild);
  const catalogTab = activeChild ? `cat:${activeChild.name}` : 'all';

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      try {
        const raw = await dal.categories.listTree();
        if (cancelled) return;
        const nodes = raw.map((r) => parseCat(r as Record<string, unknown>)).filter((n) => n.id);
        setTree(nodes);

        const found = findBySlug(nodes, slug);
        if (!found) {
          setProducts([]);
          loadedKeyRef.current = '';
          return;
        }

        const key = `${found.parent.id}:${validPin ?? ''}`;
        if (key === loadedKeyRef.current) return;

        setLoading(true);
        const items = await loadParentProducts(found.parent, validPin);
        if (cancelled) return;
        loadedKeyRef.current = key;
        setProducts(items);
      } catch {
        if (!cancelled) {
          setTree([]);
          setProducts([]);
          loadedKeyRef.current = '';
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, validPin]);

  const displayName = activeChild?.name || activeParent?.name || titleFromSlug(slug);
  const railTree = useMemo(
    () => (activeParent ? categoryRailTree(activeParent, products) : []),
    [activeParent, products],
  );
  const visibleProducts = useMemo(() => {
    const byTab = filterProductsByCatalogTab(
      products.map((item) => ({
        ...item,
        id: item.master?.id || item.defaultOffer.id,
      })),
      catalogTab,
    );
    const query = searchQuery.trim().toLowerCase();
    if (!query) return byTab;
    return byTab.filter((item) => {
      const title = (item.master?.name || item.defaultOffer.displayName || item.defaultOffer.name || '').toLowerCase();
      return title.includes(query);
    });
  }, [products, catalogTab, searchQuery]);
  const subtitle = `${visibleProducts.length} product${visibleProducts.length !== 1 ? 's' : ''}${
    viewingAll && (activeParent?.children.length ?? 0) > 0 ? ' across all sub-categories' : ''
  }`;

  const onCatalogTab = (tab: string) => {
    if (!activeParent) return;
    if (tab === 'all' || !tab.startsWith('cat:')) {
      router.push(`/category/${activeParent.slug}`);
      return;
    }
    const child = findChildByName(activeParent, tab.slice(4));
    if (child) router.push(`/category/${child.slug}`);
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="size-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!activeParent) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="text-lg font-bold text-text mb-2">Category not found</h1>
        <Link href="/" className="text-sm font-semibold text-primary hover:underline">
          Shop categories
        </Link>
      </div>
    );
  }

  return (
    <CategoryBrowseLayout
      displayName={displayName}
      image={activeChild?.image || activeParent.image}
      subtitle={subtitle}
      crumbs={[
        { href: '/', label: 'Home' },
        { href: '/', label: 'Categories' },
        ...(activeChild
          ? [{ href: `/category/${activeParent.slug}`, label: activeParent.name }]
          : []),
        { label: displayName },
      ]}
      railTree={railTree}
      catalogTab={catalogTab}
      onCatalogTab={onCatalogTab}
      productCount={products.length}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
    >
      {visibleProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 md:py-24 text-center max-w-md mx-auto px-2">
          <div className="size-16 rounded-full bg-primary-light flex items-center justify-center mb-4 text-primary">
            <ShoppingBag size={28} />
          </div>
          <h3 className="text-base md:text-lg font-bold text-text mb-1 text-balance">
            No products in {displayName}
          </h3>
          <p className="text-text-secondary text-sm mb-4 text-pretty">
            Nothing listed in this category right now.
          </p>
          {activeChild ? (
            <Link
              href={`/category/${activeParent.slug}`}
              className="inline-flex min-h-12 items-center px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors"
            >
              All {activeParent.name}
            </Link>
          ) : (
            <Link
              href="/"
              className="inline-flex min-h-12 items-center px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors"
            >
              Shop categories
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 md:gap-4 lg:gap-5 pt-1.5 pb-2">
          {visibleProducts.map((item) => (
            <CategorySkuCard
              key={item.master?.id || item.defaultOffer.id}
              categorySlug={slug}
              item={item}
              onCompare={openCompare}
              onAdd={handleAddOffer}
              addingId={addingId}
            />
          ))}
        </div>
      )}

      {picker ? (
        <VendorOfferPicker
          productName={picker.master?.name || picker.defaultOffer.displayName || picker.defaultOffer.name}
          offers={picker.offers}
          pincode={validPin}
          addingId={addingId}
          onClose={() => setPicker(null)}
          onAdd={handleAddOffer}
        />
      ) : null}

      <StickyCartBar />
    </CategoryBrowseLayout>
  );
}

export default function CategoryPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-white animate-pulse" />}>
      <CategoryBrowseContent />
    </Suspense>
  );
}
