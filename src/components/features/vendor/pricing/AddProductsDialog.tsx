'use client';

import React, { useEffect, useState } from 'react';
import { X, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { inr, type ProductRow } from './types';

interface Props {
  open: boolean;
  listId: string | null;
  listName: string;
  onClose: () => void;
  onAdd: (rows: ProductRow[]) => void;
}

export function AddProductsDialog({ open, listId, listName, onClose, onAdd }: Props) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open || !listId) return;
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ excludeListId: listId, limit: '100' });
    if (debounced) qs.set('search', debounced);
    fetch(`/api/v1/vendor/price-lists/workspace?${qs}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success) throw new Error(json.error?.message || 'Failed to load products');
        setRows(json.data.products as ProductRow[]);
      })
      .catch((e) => { if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load products'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, listId, debounced]);

  if (!open || !listId) return null;

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-[16px] shadow-xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] flex flex-col" role="dialog" aria-label="Add products to list">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-bold text-[#181725]">Add products to {listName}</h2>
            <p className="text-[12px] text-[#7C7C7C] mt-0.5">Only products you add get a price in this list. Everything else stays at Base price.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#FAF7F2]" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C7C7C]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product or SKU" className="w-full h-11 pl-9 pr-3 rounded-[12px] border border-[#E9E3DD] text-[13px] outline-none focus:border-primary" />
        </div>
        <label className="flex items-center gap-2 text-[12px] font-semibold text-[#181725] cursor-pointer">
          <input type="checkbox" checked={rows.length > 0 && rows.every((r) => picked.has(r.id))} onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
          Select all matching ({rows.length})
        </label>
        <div className="flex-1 overflow-auto border border-[#E9E3DD] rounded-[12px] divide-y divide-[#E9E3DD] min-h-[160px]">
          {loading ? (
            <div className="p-8 text-center text-[#7C7C7C] text-[13px]"><Loader2 className="inline animate-spin mr-2" size={16} />Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-[#7C7C7C] text-[13px]">No more products to add — everything is already in this list.</div>
          ) : rows.map((r) => (
            <label key={r.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[#FAF7F2]">
              <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} className="shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold text-[#181725] whitespace-normal break-words leading-snug">{r.name}</span>
                <span className="block text-[11px] text-[#7C7C7C]">{r.sku || '—'} · {r.packSize ?? r.unit ?? ''}</span>
              </span>
              <span className="text-[12px] tabular-nums text-[#7C7C7C]">Base {inr(r.basePrice)}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-11 rounded-[12px] border border-[#E9E3DD] font-semibold">Cancel</button>
          <button
            type="button"
            disabled={picked.size === 0}
            onClick={() => { onAdd(rows.filter((r) => picked.has(r.id))); setPicked(new Set()); onClose(); }}
            className="flex-1 h-11 rounded-[12px] bg-primary text-white font-semibold disabled:opacity-50"
          >
            Add {picked.size > 0 ? picked.size : ''} product{picked.size === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
