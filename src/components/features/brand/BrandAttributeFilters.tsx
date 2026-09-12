'use client';

import type { ReactNode } from 'react';
import { Leaf, Snowflake, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isBulkPack, isFrozenStorage } from '@/lib/brandStoreUtils';

export type BrandAttrFilter = 'veg' | 'frozen' | 'bulk';

export function BrandAttributeFilters<T extends {
  vegNonVeg?: string | null;
  storageType?: string | null;
  packSize?: string | null;
  unit?: string | null;
}>({
  products,
  value,
  onChange,
}: {
  products: T[];
  value: BrandAttrFilter[];
  onChange: (next: BrandAttrFilter[]) => void;
}) {
  const available: BrandAttrFilter[] = [];
  if (products.some((p) => p.vegNonVeg === 'veg')) available.push('veg');
  if (products.some((p) => isFrozenStorage(p.storageType))) available.push('frozen');
  if (products.some((p) => isBulkPack(p.packSize, p.unit))) available.push('bulk');
  if (available.length === 0) return null;

  const toggle = (key: BrandAttrFilter) => {
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  };

  const meta: Record<BrandAttrFilter, { label: string; icon: ReactNode; on: string }> = {
    veg: { label: 'Veg', icon: <Leaf size={12} strokeWidth={2} />, on: 'border-success text-success bg-white' },
    frozen: { label: 'Frozen', icon: <Snowflake size={12} strokeWidth={2} />, on: 'border-info text-info bg-white' },
    bulk: { label: 'Bulk pack', icon: <Package size={12} strokeWidth={2} />, on: 'border-primary text-primary bg-primary-tint' },
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
      {available.map((key) => {
        const on = value.includes(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={cn(
              'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-medium whitespace-nowrap shrink-0',
              on ? meta[key].on : 'border-divider text-text-secondary bg-white',
            )}
          >
            {meta[key].icon}
            {meta[key].label}
          </button>
        );
      })}
    </div>
  );
}

export function matchesBrandAttrFilters<T extends {
  vegNonVeg?: string | null;
  storageType?: string | null;
  packSize?: string | null;
  unit?: string | null;
}>(product: T, filters: BrandAttrFilter[]): boolean {
  if (filters.length === 0) return true;
  return filters.every((f) => {
    if (f === 'veg') return product.vegNonVeg === 'veg';
    if (f === 'frozen') return isFrozenStorage(product.storageType);
    return isBulkPack(product.packSize, product.unit);
  });
}
