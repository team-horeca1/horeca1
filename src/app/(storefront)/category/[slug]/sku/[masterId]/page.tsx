'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { useParams } from 'next/navigation';
import { dal } from '@/lib/dal';
import { useDeliveryPincode } from '@/hooks/useDeliveryPincode';
import {
  parseCat,
  findBySlug,
  productCategoryIds,
  mergeCategorySkuItems,
  skuItemKey,
  type CatNode,
} from '@/lib/categoryBrowse';
import { CategoryBrowseLayout } from '@/components/features/category/CategoryBrowseLayout';
import { CategoryVendorCard } from '@/components/features/category/CategoryVendorCard';
import type { CategorySkuItem } from '@/components/features/category/CategorySkuCard';

const PRODUCT_LIMIT = 60;

function CategorySkuVendorsContent() {
  const params = useParams();
  const slug = params.slug as string;
  const masterId = params.masterId as string;

  const [tree, setTree] = useState<CatNode[]>([]);
  const [item, setItem] = useState<CategorySkuItem | null>(null);
  const [loading, setLoading] = useState(true);

  const pincode = useDeliveryPincode();
  const validPin = pincode && /^\d{6}$/.test(pincode) ? pincode : undefined;

  const match = useMemo(() => (slug ? findBySlug(tree, slug) : null), [tree, slug]);
  const activeParent = match?.parent ?? null;
  const activeChild = match?.child ?? null;

  useEffect(() => {
    if (!slug || !masterId) return;
    let cancelled = false;
    queueMicrotask(() => setLoading(true));

    (async () => {
      try {
        const raw = await dal.categories.listTree();
        if (cancelled) return;
        const nodes = raw.map((r) => parseCat(r as Record<string, unknown>)).filter((n) => n.id);
        setTree(nodes);

        const found = findBySlug(nodes, slug);
        const ids = productCategoryIds(found);
        if (ids.length === 0) {
          if (!cancelled) setItem(null);
          return;
        }

        const groups = await Promise.all(
          ids.map(async (id) => {
            try {
              const { items } = await dal.categories.getProducts(id, {
                pincode: validPin,
                limit: PRODUCT_LIMIT,
              });
              return items;
            } catch {
              return [];
            }
          }),
        );
        if (cancelled) return;
        const merged = mergeCategorySkuItems(groups);
        const foundItem = merged.find((row) => {
          const key = skuItemKey(row);
          return key === `m:${masterId}` || key === `o:${masterId}` || row.defaultOffer.id === masterId;
        });
        setItem(foundItem ?? null);
      } catch {
        if (!cancelled) {
          setTree([]);
          setItem(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, masterId, validPin]);

  const productName =
    item?.master?.name || item?.defaultOffer.displayName || item?.defaultOffer.name || 'Product';
  const productImage =
    item?.master?.imageUrl ||
    item?.master?.images?.[0] ||
    item?.defaultOffer.images?.[0];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="size-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!activeParent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="text-lg font-bold text-text mb-2">Category not found</h1>
        <Link href="/" className="text-sm font-semibold text-primary hover:underline">
          Shop categories
        </Link>
      </div>
    );
  }

  const offers = item?.offers ?? [];
  const vendorHref = (offer: CategorySkuItem['offers'][number]) => {
    const dest = offer.vendorSlug || offer.vendorId;
    const qs = new URLSearchParams();
    qs.set('q', productName);
    qs.set('cat', slug);
    return `/vendor/${dest}?${qs.toString()}`;
  };

  return (
    <CategoryBrowseLayout
      displayName={productName}
      image={productImage}
      subtitle={`${offers.length} vendor${offers.length !== 1 ? 's' : ''} selling this product`}
      crumbs={[
        { href: '/', label: 'Home' },
        { href: '/', label: 'Categories' },
        { href: `/category/${activeParent.slug}`, label: activeParent.name },
        ...(activeChild
          ? [{ href: `/category/${activeChild.slug}`, label: activeChild.name }]
          : []),
        { label: productName },
      ]}
      parent={activeParent}
      activeChildSlug={activeChild?.slug ?? null}
    >
      {offers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 md:py-24 text-center max-w-md mx-auto px-2">
          <div className="size-16 rounded-full bg-primary-light flex items-center justify-center mb-4 text-primary">
            <ShoppingBag size={28} />
          </div>
          <h3 className="text-lg font-bold text-text mb-1">No vendors for this product</h3>
          <p className="text-text-secondary text-sm mb-4">
            Suppliers for this item are not available right now.
          </p>
          <Link
            href={`/category/${slug}`}
            className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-colors"
          >
            Back to products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-4">
          {offers.map((offer, index) => (
            <CategoryVendorCard
              key={offer.id}
              href={vendorHref(offer)}
              name={offer.vendorName || 'Vendor'}
              rating={offer.vendorRating}
              minOrderValue={offer.vendorMinOrderValue ?? 0}
              index={index}
            />
          ))}
        </div>
      )}
    </CategoryBrowseLayout>
  );
}

export default function CategorySkuVendorsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white animate-pulse" />}>
      <CategorySkuVendorsContent />
    </Suspense>
  );
}
