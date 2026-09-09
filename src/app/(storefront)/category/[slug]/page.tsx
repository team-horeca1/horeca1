'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
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
  type CatNode,
} from '@/lib/categoryBrowse';
import { CategoryBrowseLayout } from '@/components/features/category/CategoryBrowseLayout';
import { CategorySkuCard, type CategorySkuItem } from '@/components/features/category/CategorySkuCard';

const PRODUCT_LIMIT = 60;

function titleFromSlug(slug: string) {
  return slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

async function loadMergedProducts(ids: string[], pincode?: string): Promise<CategorySkuItem[]> {
  if (ids.length === 0) return [];
  const groups = await Promise.all(
    ids.map(async (id) => {
      try {
        const { items } = await dal.categories.getProducts(id, { pincode, limit: PRODUCT_LIMIT });
        return items;
      } catch {
        return [];
      }
    }),
  );
  return mergeCategorySkuItems(groups);
}

function CategoryBrowseContent() {
  const params = useParams();
  const slug = params.slug as string;

  const [tree, setTree] = useState<CatNode[]>([]);
  const [products, setProducts] = useState<CategorySkuItem[]>([]);
  const [loading, setLoading] = useState(true);

  const pincode = useDeliveryPincode();
  const validPin = pincode && /^\d{6}$/.test(pincode) ? pincode : undefined;

  const match = useMemo(() => (slug ? findBySlug(tree, slug) : null), [tree, slug]);
  const activeParent = match?.parent ?? null;
  const activeChild = match?.child ?? null;
  const viewingAll = Boolean(activeParent && !activeChild);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    queueMicrotask(() => setLoading(true));

    (async () => {
      try {
        const raw = await dal.categories.listTree();
        if (cancelled) return;
        const nodes = raw.map((r) => parseCat(r as Record<string, unknown>)).filter((n) => n.id);
        setTree(nodes);

        const found = findBySlug(nodes, slug);
        const items = await loadMergedProducts(productCategoryIds(found), validPin);
        if (!cancelled) setProducts(items);
      } catch {
        if (!cancelled) {
          setTree([]);
          setProducts([]);
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
  const subtitle = `${products.length} product${products.length !== 1 ? 's' : ''}${
    viewingAll && (activeParent?.children.length ?? 0) > 0 ? ' across all sub-categories' : ''
  }`;

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
      parent={activeParent}
      activeChildSlug={activeChild?.slug ?? null}
    >
      {products.length === 0 ? (
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-4">
          {products.map((item) => (
            <CategorySkuCard
              key={item.master?.id || item.defaultOffer.id}
              categorySlug={slug}
              item={item}
            />
          ))}
        </div>
      )}
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
