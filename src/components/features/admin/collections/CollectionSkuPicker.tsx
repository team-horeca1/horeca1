'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Loader2, Package, Search, Store, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CollectionSku {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  packSize: string | null;
  uom: string | null;
  imageUrl: string | null;
  images?: string[];
  category: { id: string; name: string } | null;
  vendorCount: number;
}

interface MasterProductRow {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  packSize: string | null;
  uom: string | null;
  imageUrl: string | null;
  images?: string[];
  category: { id: string; name: string } | null;
  vendorCount?: number;
}

interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
}

interface CollectionSkuPickerProps {
  selected: CollectionSku[];
  onChange: (next: CollectionSku[]) => void;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  loadingSelected?: boolean;
}

function toSku(row: MasterProductRow): CollectionSku {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    brand: row.brand ?? null,
    packSize: row.packSize ?? null,
    uom: row.uom ?? null,
    imageUrl: row.imageUrl ?? row.images?.[0] ?? null,
    images: row.images ?? [],
    category: row.category ?? null,
    vendorCount: row.vendorCount ?? 0,
  };
}

function packLabel(sku: Pick<CollectionSku, 'packSize' | 'uom'>): string | null {
  if (sku.packSize && sku.uom && !sku.packSize.includes(sku.uom)) {
    return `${sku.packSize} ${sku.uom}`;
  }
  return sku.packSize || sku.uom || null;
}

function SkuThumb({ sku, size = 'md' }: { sku: Pick<CollectionSku, 'imageUrl' | 'name'>; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'size-9' : 'size-11';
  if (sku.imageUrl) {
    return (
      <img
        src={sku.imageUrl}
        alt=""
        className={cn(box, 'rounded-[8px] object-cover border border-[#E9E3DD] shrink-0')}
      />
    );
  }
  return (
    <div className={cn(box, 'rounded-[8px] bg-[#FAF5EC] flex items-center justify-center shrink-0')}>
      <Package size={size === 'sm' ? 14 : 16} className="text-[#D1D5DB]" />
    </div>
  );
}

export function CollectionSkuPicker({
  selected,
  onChange,
  onClose,
  onSave,
  saving = false,
  loadingSelected = false,
}: CollectionSkuPickerProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [rows, setRows] = useState<CollectionSku[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryId]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/admin/categories')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !json.success) return;
        const cats = (json.data ?? []) as CategoryOption[];
        setCategories(cats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchMasters = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        approvalStatus: 'approved',
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (categoryId) params.set('categoryId', categoryId);

      const res = await fetch(`/api/v1/admin/master-products?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || 'Failed to load SKUs');

      const payload = json.data ?? {};
      const items = (payload.masterProducts ?? []) as MasterProductRow[];
      setRows(items.map(toSku));
      const pagination = payload.pagination as { page: number; totalPages: number; total: number } | undefined;
      setTotalPages(pagination?.totalPages ?? 1);
      setTotal(pagination?.total ?? items.length);
    } catch {
      setRows([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, categoryId]);

  useEffect(() => {
    void fetchMasters();
  }, [fetchMasters]);

  const addSku = (sku: CollectionSku) => {
    if (selectedIds.has(sku.id)) return;
    onChange([...selected, sku]);
  };

  const removeSku = (id: string) => {
    onChange(selected.filter((s) => s.id !== id));
  };

  const moveSku = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selected.length) return;
    const next = [...selected];
    const current = next[index];
    const swap = next[nextIndex];
    if (!current || !swap) return;
    next[index] = swap;
    next[nextIndex] = current;
    onChange(next);
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const next = [...selected];
    const [moved] = next.splice(dragIndex, 1);
    if (!moved) {
      setDragIndex(null);
      return;
    }
    next.splice(targetIndex, 0, moved);
    onChange(next);
    setDragIndex(null);
  };

  const categoryOptions = useMemo(() => {
    const parents = categories.filter((c) => !c.parentId);
    const children = categories.filter((c) => c.parentId);
    const rows: Array<{ id: string; label: string }> = [];
    for (const parent of parents) {
      rows.push({ id: parent.id, label: parent.name });
      for (const child of children.filter((c) => c.parentId === parent.id)) {
        rows.push({ id: child.id, label: `— ${child.name}` });
      }
    }
    return rows;
  }, [categories]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 md:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 flex flex-col w-full max-w-[1100px] h-[min(860px,calc(100vh-1.5rem))] bg-white rounded-[16px] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 md:px-6 py-4 border-b border-[#EEEEEE] shrink-0">
          <div>
            <h2 className="text-[18px] md:text-[20px] font-extrabold text-[#181725]">Attach Horeca1 SKUs</h2>
            <p className="text-[12px] text-[#667085] font-medium mt-0.5">
              Search the master catalog, add SKUs, then reorder how they appear on the storefront.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-10 rounded-[12px] flex items-center justify-center hover:bg-[#F8F9FB] text-[#7C7C7C]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2">
          <div className="flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-[#EEEEEE]">
            <div className="p-4 space-y-3 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={16} />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, SKU, or brand"
                  className="h-12 w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] pl-10 pr-3 text-[13px] font-medium outline-none focus:border-[#6B1D2E]/40 focus:bg-white"
                />
              </div>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-12 w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] font-medium outline-none focus:border-[#6B1D2E]/40 focus:bg-white"
              >
                <option value="">All categories</option>
                {categoryOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="animate-spin text-[#6B1D2E]" size={24} />
                </div>
              ) : rows.length === 0 ? (
                <p className="px-4 py-12 text-center text-[13px] font-medium text-[#9CA3AF]">
                  No master SKUs match this search.
                </p>
              ) : (
                <ul className="divide-y divide-[#F3F4F6]">
                  {rows.map((sku) => {
                    const added = selectedIds.has(sku.id);
                    const pack = packLabel(sku);
                    return (
                      <li key={sku.id} className="flex items-center gap-3 px-4 py-3">
                        <SkuThumb sku={sku} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-[#181725] line-clamp-1">{sku.name}</p>
                          <p className="text-[11px] font-medium text-[#667085] truncate">
                            {sku.sku}
                            {sku.brand ? ` · ${sku.brand}` : ''}
                            {sku.category ? ` · ${sku.category.name}` : ''}
                          </p>
                          <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                            {pack ? `${pack} · ` : ''}
                            {sku.vendorCount} supplier{sku.vendorCount === 1 ? '' : 's'}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={added}
                          onClick={() => addSku(sku)}
                          className={cn(
                            'min-h-10 px-3 rounded-[8px] text-[12px] font-bold shrink-0',
                            added
                              ? 'bg-[#F3F4F6] text-[#9CA3AF] cursor-default'
                              : 'bg-[#6B1D2E] text-white hover:bg-[#5A1926]',
                          )}
                        >
                          {added ? 'Added' : 'Add'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-[#EEEEEE] text-[12px] font-semibold text-[#667085] shrink-0">
              <span>
                {total} SKU{total === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-10 px-3 rounded-[8px] border border-[#EEEEEE] disabled:opacity-40"
                >
                  Prev
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="min-h-10 px-3 rounded-[8px] border border-[#EEEEEE] disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col min-h-0 bg-[#FDFDFD]">
            <div className="px-4 py-3 border-b border-[#EEEEEE] shrink-0">
              <p className="text-[13px] font-bold text-[#181725]">
                Selected · {selected.length}
              </p>
              <p className="text-[11px] text-[#9CA3AF] font-medium">
                Drag or use arrows to set storefront order.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingSelected ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="animate-spin text-[#6B1D2E]" size={24} />
                </div>
              ) : selected.length === 0 ? (
                <p className="px-4 py-12 text-center text-[13px] font-medium text-[#9CA3AF]">
                  No SKUs attached yet. Add from the catalogue on the left.
                </p>
              ) : (
                <ul className="divide-y divide-[#F3F4F6]">
                  {selected.map((sku, index) => {
                    const pack = packLabel(sku);
                    return (
                      <li
                        key={sku.id}
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(index)}
                        onDragEnd={() => setDragIndex(null)}
                        className={cn(
                          'flex items-center gap-2 px-4 py-3 bg-white',
                          dragIndex === index && 'opacity-50',
                        )}
                      >
                        <span className="text-[#D1D5DB] cursor-grab shrink-0" aria-hidden>
                          <GripVertical size={16} />
                        </span>
                        <span className="w-6 text-[12px] font-bold text-[#9CA3AF] tabular-nums shrink-0">
                          {index + 1}
                        </span>
                        <SkuThumb sku={sku} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-[#181725] line-clamp-1">{sku.name}</p>
                          <p className="text-[11px] text-[#667085] truncate">
                            {sku.sku}
                            {pack ? ` · ${pack}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveSku(index, -1)}
                            className="size-8 rounded-[8px] flex items-center justify-center text-[#7C7C7C] hover:bg-[#F3F4F6] disabled:opacity-30"
                            aria-label="Move up"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={index === selected.length - 1}
                            onClick={() => moveSku(index, 1)}
                            className="size-8 rounded-[8px] flex items-center justify-center text-[#7C7C7C] hover:bg-[#F3F4F6] disabled:opacity-30"
                            aria-label="Move down"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSku(sku.id)}
                            className="size-8 rounded-[8px] flex items-center justify-center text-[#7C7C7C] hover:bg-[#FFF0F0] hover:text-[#E74C3C]"
                            aria-label="Remove"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 md:px-6 py-4 border-t border-[#EEEEEE] shrink-0">
          <p className="text-[13px] font-semibold text-[#667085] inline-flex items-center gap-1.5">
            <Store size={14} />
            {selected.length} SKU{selected.length === 1 ? '' : 's'} selected
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-12 px-5 rounded-[12px] bg-[#F8F9FB] border border-[#EEEEEE] text-[14px] font-bold text-[#181725]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="min-h-12 px-6 rounded-[12px] bg-[#6B1D2E] text-white text-[14px] font-bold hover:bg-[#5A1926] disabled:opacity-60 inline-flex items-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
