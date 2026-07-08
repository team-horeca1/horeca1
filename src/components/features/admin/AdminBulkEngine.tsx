'use client';

import React, { useEffect, useMemo, useState } from 'react';
import BulkEngineDrawer, { type BulkEngineConfig, type BulkProduct } from '@/components/features/shared/BulkEngineDrawer';

interface AdminProductInput {
  id: string;
  name: string;
  basePrice: number;
  isActive: boolean;
  brand?: string | null;
  tags?: string[] | null;
  imageUrl?: string | null;
  vendorId?: string | null;
  category?: { id?: string } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  products: AdminProductInput[];
  selectedIds: string[];
  vendors: { id: string; businessName: string }[];
}

export default function AdminBulkEngine({ open, onClose, onComplete, products, selectedIds, vendors }: Props) {
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
    portal: 'admin',
    endpoints: {
      bulkUpdate: '/api/v1/admin/products/bulk-update',
      stockBulk: '/api/v1/admin/inventory',
    },
    categories,
    brands,
    vendors,
    enableCustomerPricing: false,
    enableCombo: false,
  }), [categories, brands, vendors]);

  const allProducts: BulkProduct[] = useMemo(() => products.map((p) => ({
    id: p.id,
    name: p.name,
    categoryId: p.category?.id ?? null,
    brand: p.brand ?? null,
    isActive: p.isActive,
    basePrice: Number(p.basePrice),
    tags: p.tags ?? null,
    imageUrl: p.imageUrl ?? null,
    vendorId: p.vendorId ?? null,
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
