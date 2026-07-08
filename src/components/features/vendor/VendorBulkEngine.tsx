'use client';

/**
 * VendorBulkEngine — vendor-portal wrapper around the shared BulkEngineDrawer.
 * Supplies the vendor endpoints + all 10 actions (customer pricing & combo are
 * vendor-owned, so both are enabled here). Fetches its own category/brand
 * option lists; receives the loaded products + ticked ids from the page.
 */

import React, { useEffect, useMemo, useState } from 'react';
import BulkEngineDrawer, { type BulkEngineConfig, type BulkProduct } from '@/components/features/shared/BulkEngineDrawer';

interface VendorProductInput {
  id: string;
  name: string;
  basePrice: number;
  isActive: boolean;
  brand?: string | null;
  tags?: string[] | null;
  imageUrl?: string | null;
  category?: { id?: string } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  products: VendorProductInput[];
  selectedIds: string[];
}

export default function VendorBulkEngine({ open, onClose, onComplete, products, selectedIds }: Props) {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [brands, setBrands] = useState<{ name: string }[]>([]);

  useEffect(() => {
    if (!open || categories.length > 0) return;
    fetch('/api/v1/categories')
      .then((r) => r.json())
      .then((j) => {
        if (!j.success || !Array.isArray(j.data)) return;
        type Cat = { id: string; name: string; children?: Cat[] };
        const flat: { id: string; name: string }[] = [];
        for (const c of j.data as Cat[]) {
          flat.push({ id: c.id, name: c.name });
          for (const child of c.children ?? []) flat.push({ id: child.id, name: `— ${child.name}` });
        }
        setCategories(flat);
      })
      .catch(() => {});
    fetch('/api/v1/brands?limit=100&scope=picker')
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) return;
        const arr = j.data?.brands ?? j.data ?? [];
        setBrands((Array.isArray(arr) ? arr : []).map((b: { name?: string }) => ({ name: b.name ?? '' })).filter((b: { name: string }) => b.name));
      })
      .catch(() => {});
  }, [open, categories.length]);

  const config: BulkEngineConfig = useMemo(() => ({
    portal: 'vendor',
    endpoints: {
      bulkUpdate: '/api/v1/vendor/products/bulk-update',
      stockBulk: '/api/v1/vendor/inventory',
      priceLists: '/api/v1/vendor/price-lists',
      priceListBulkApply: (id: string) => `/api/v1/vendor/price-lists/${id}/bulk-apply`,
      combos: '/api/v1/vendor/combos',
    },
    categories,
    brands,
    enableCustomerPricing: true,
    enableCombo: true,
  }), [categories, brands]);

  const allProducts: BulkProduct[] = useMemo(() => products.map((p) => ({
    id: p.id,
    name: p.name,
    categoryId: p.category?.id ?? null,
    brand: p.brand ?? null,
    isActive: p.isActive,
    basePrice: Number(p.basePrice),
    tags: p.tags ?? null,
    imageUrl: p.imageUrl ?? null,
  })), [products]);

  return (
    <BulkEngineDrawer
      open={open}
      onClose={onClose}
      onComplete={onComplete}
      config={config}
      allProducts={allProducts}
      selectedIds={selectedIds}
    />
  );
}
