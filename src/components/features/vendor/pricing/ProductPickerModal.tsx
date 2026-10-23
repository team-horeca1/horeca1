'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { inr } from './types';

export interface PickerProduct {
  id: string;
  name: string;
  sku: string | null;
  packSize: string | null;
  unit: string | null;
  basePrice: number;
  imageUrl: string | null;
  inList: boolean;
  customPrice: number | null;
}

interface Props {
  open: boolean;
  listId: string | null;
  listName: string;
  onClose: () => void;
  onSaved: () => void;
}

type ShowFilter = 'all' | 'selected' | 'not_selected';

const PAGE_SIZE = 300;

export function ProductPickerModal({ open, listId, listName, onClose, onSaved }: Props) {
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [initialIds, setInitialIds] = useState<Set<string>>(new Set());
  const [showFilter, setShowFilter] = useState<ShowFilter>('all');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open || !listId) return;
    let cancelled = false;
    setLoading(true);
    setSearch('');
    setDebounced('');
    setShowFilter('all');
    setDiscountPercent('0');
    setConfirmRemove(false);
    setVisibleCount(PAGE_SIZE);

    fetch(`/api/v1/vendor/price-lists/${listId}/products`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success) throw new Error(json.error?.message || 'Failed to load products');
        const rows = (json.data.products ?? []) as PickerProduct[];
        setProducts(rows);
        const inList = new Set(rows.filter((p) => p.inList).map((p) => p.id));
        setInitialIds(inList);
        setPicked(new Set(inList));
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load products');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, listId]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirmRemove) setConfirmRemove(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, confirmRemove, onClose]);

  const filtered = useMemo(() => {
    let rows = products;
    if (debounced) {
      rows = rows.filter((p) => {
        const hay = `${p.name} ${p.sku ?? ''}`.toLowerCase();
        return hay.includes(debounced);
      });
    }
    if (showFilter === 'selected') rows = rows.filter((p) => picked.has(p.id));
    if (showFilter === 'not_selected') rows = rows.filter((p) => !picked.has(p.id));
    return rows;
  }, [products, debounced, showFilter, picked]);

  const visibleRows = filtered.slice(0, visibleCount);

  const addedCount = useMemo(() => {
    let n = 0;
    for (const id of picked) if (!initialIds.has(id)) n += 1;
    return n;
  }, [picked, initialIds]);

  const removedCount = useMemo(() => {
    let n = 0;
    for (const id of initialIds) if (!picked.has(id)) n += 1;
    return n;
  }, [picked, initialIds]);

  const dirty = addedCount > 0 || removedCount > 0;

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => picked.has(p.id));
  const someFilteredSelected = filtered.some((p) => picked.has(p.id));

  const toggle = (id: string) => {
    setConfirmRemove(false);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = (checked: boolean) => {
    setConfirmRemove(false);
    setPicked((prev) => {
      const next = new Set(prev);
      for (const p of filtered) {
        if (checked) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setConfirmRemove(false);
    setPicked(new Set());
  };

  const doSave = async () => {
    if (!listId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/vendor/price-lists/${listId}/products`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIds: [...picked],
          discountPercent: Math.min(90, Math.max(0, Number(discountPercent) || 0)),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to save products');
      const { added, removed } = json.data as { added: number; removed: number };
      toast.success(
        added === 0 && removed === 0
          ? 'No changes'
          : `Saved · ${added > 0 ? `+${added} added` : ''}${added > 0 && removed > 0 ? ', ' : ''}${removed > 0 ? `−${removed} removed` : ''}`,
      );
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
      setConfirmRemove(false);
    }
  };

  const handleSaveClick = () => {
    if (removedCount > 0 && !confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    void doSave();
  };

  if (!open || !listId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Products for ${listName}`}
        className="relative bg-white rounded-[16px] shadow-xl w-[min(960px,95vw)] h-[90dvh] max-h-[90dvh] flex flex-col overflow-hidden"
      >
        <div className="shrink-0 px-5 pt-5 pb-3 border-b border-[#E9E3DD] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-[#181725] text-balance">
              Products in {listName}
            </h2>
            <p className="text-[12px] text-[#7C7C7C] mt-0.5 tabular-nums">
              {picked.size} of {products.length} selected
              {dirty && (
                <span className="ml-2 text-[#6B1D2E] font-semibold">
                  ({addedCount > 0 ? `+${addedCount}` : ''}
                  {addedCount > 0 && removedCount > 0 ? ' · ' : ''}
                  {removedCount > 0 ? `−${removedCount}` : ''})
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#FAF7F2] shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="shrink-0 px-5 py-3 space-y-2.5 border-b border-[#E9E3DD] bg-[#FAF7F2]/60">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C7C7C]" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
              placeholder="Search product or SKU"
              className="w-full h-11 pl-9 pr-3 rounded-[12px] border border-[#E9E3DD] bg-white text-[13px] outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#181725] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
                }}
                onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
                disabled={filtered.length === 0}
              />
              Select all{filtered.length !== products.length ? ` matching (${filtered.length})` : ` (${filtered.length})`}
            </label>
            <span className="inline-flex rounded-full border border-[#E9E3DD] bg-white p-0.5" role="group" aria-label="Filter products">
              {(
                [
                  ['all', 'All'],
                  ['selected', 'Selected'],
                  ['not_selected', 'Not selected'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setShowFilter(key); setVisibleCount(PAGE_SIZE); }}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[11px] font-bold',
                    showFilter === key ? 'bg-primary text-white' : 'text-[#181725]',
                  )}
                >
                  {label}
                </button>
              ))}
            </span>
            <button
              type="button"
              onClick={clearSelection}
              disabled={picked.size === 0}
              className="ml-auto text-[12px] font-semibold text-[#6B1D2E] disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto divide-y divide-[#E9E3DD]">
          {loading ? (
            <div className="p-12 text-center text-[#7C7C7C] text-[13px]">
              <Loader2 className="inline animate-spin mr-2" size={16} />Loading catalogue…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-[13px] font-semibold text-[#7C7C7C]">No products match</p>
              {(search || showFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setShowFilter('all'); }}
                  className="mt-3 h-10 px-4 rounded-[12px] border border-[#E9E3DD] bg-white font-semibold text-[13px]"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <>
              {visibleRows.map((p) => {
                const checked = picked.has(p.id);
                return (
                  <label
                    key={p.id}
                    className={cn(
                      'flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-[#FAF7F2]',
                      checked && 'bg-[#F8E8EC]/35',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.id)}
                      className="shrink-0"
                    />
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="w-9 h-9 rounded-lg object-cover border border-[#E9E3DD] shrink-0 bg-white"
                      />
                    ) : (
                      <span className="w-9 h-9 rounded-lg border border-[#E9E3DD] bg-[#FAF7F2] shrink-0" aria-hidden />
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold text-[#181725] leading-snug text-pretty">
                        {p.name}
                      </span>
                      <span className="block text-[11px] text-[#7C7C7C]">
                        {p.sku || '—'}
                        {(p.packSize || p.unit) ? ` · ${p.packSize ?? p.unit}` : ''}
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-[12px] tabular-nums text-[#7C7C7C]">Base {inr(p.basePrice)}</span>
                      {p.inList && p.customPrice != null && (
                        <span className="block text-[11px] tabular-nums font-semibold text-[#181725]">
                          List {inr(p.customPrice)}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
              {filtered.length > visibleCount && (
                <div className="p-4 text-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    className="h-10 px-4 rounded-[12px] border border-[#E9E3DD] bg-white font-semibold text-[13px]"
                  >
                    Show more ({filtered.length - visibleCount} left)
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-[#E9E3DD] space-y-3 bg-white">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className="text-[12px] font-medium text-[#7C7C7C]">
                Discount from Base for newly added products (%)
              </label>
              <input
                type="number"
                min={0}
                max={90}
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                className="mt-1 w-full max-w-[140px] h-11 px-3 border border-[#E9E3DD] rounded-[12px] outline-none focus:border-primary tabular-nums"
              />
              <p className="text-[11px] text-[#7C7C7C] mt-1">Existing products keep their price.</p>
            </div>
            <p className="text-[12px] text-[#667085] tabular-nums pb-2">
              {dirty
                ? `+${addedCount} added, −${removedCount} removed`
                : 'No changes yet'}
            </p>
          </div>

          {confirmRemove && (
            <div className="p-3 rounded-[12px] bg-red-50 border border-red-200 text-[13px] text-red-900">
              <p className="font-semibold">
                {removedCount} product{removedCount === 1 ? '' : 's'} will be removed from this list.
              </p>
              <p className="text-[12px] mt-0.5">Customers on this list will pay Base for those products.</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 min-h-[48px] rounded-[12px] border border-[#E9E3DD] font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || loading || (!dirty && !confirmRemove)}
              onClick={handleSaveClick}
              className="flex-1 h-11 min-h-[48px] rounded-[12px] bg-primary text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {confirmRemove ? `Remove ${removedCount} & save` : 'Save products'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
