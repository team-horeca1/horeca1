'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  FunctionSquare,
  Lock,
  MoreVertical,
  Loader2,
  Pencil,
  Copy,
  Trash2,
  EyeOff,
  Eye,
  Percent,
  RotateCcw,
  ExternalLink,
  ListChecks,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { applyFormula, normalizeListKey, parseFormula } from '@/modules/pricing/formula';
import type { DraftCell, PriceListCol, ProductRow } from '../types';
import {
  cellKey,
  effective,
  fallbackPrice,
  hasCustomOverride,
  inr,
  isDirty,
  isExcluded,
  isInList,
  isPercentList,
  listSubtitle,
  priceSource,
  resetTooltip,
} from '../types';

interface Props {
  rows: ProductRow[];
  cols: PriceListCol[];
  dirty: Record<string, DraftCell>;
  setCell: (key: string, value: DraftCell) => void;
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onListsChanged?: () => void;
  onEditProducts?: () => void;
  selectedProductIds?: Set<string>;
  onSelectedProductIdsChange?: (ids: Set<string>) => void;
  compareMode?: boolean;
}

function cellLocked(row: ProductRow, col: PriceListCol, dirty: Record<string, DraftCell>): boolean {
  const key = cellKey(row.id, col.id);
  if (key in dirty) {
    const d = dirty[key];
    if (d === null) return false;
    if (d.isLocked !== undefined) return d.isLocked;
  }
  return !!row.cells[col.id]?.isLocked;
}

export function PriceGrid({
  rows,
  cols,
  dirty,
  setCell,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onListsChanged,
  onEditProducts,
  selectedProductIds,
  onSelectedProductIdsChange,
  compareMode,
}: Props) {
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState<{ r: number; c: number } | null>(null);
  const [editVal, setEditVal] = useState('');
  const editRef = useRef<HTMLInputElement>(null);
  const [colMenu, setColMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ r: number; x: number; y: number } | null>(null);
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [colBusy, setColBusy] = useState<string | null>(null);
  const [formulaCol, setFormulaCol] = useState<string | null>(null);
  const [formulaText, setFormulaText] = useState('');
  const [formulaMode, setFormulaMode] = useState<'simple' | 'advanced'>('simple');
  const [bulkSource, setBulkSource] = useState<string>('BASE');
  const [bulkOp, setBulkOp] = useState<'discountPct' | 'markupPct' | 'minusFlat' | 'plusFlat' | 'copy'>('discountPct');
  const [bulkValue, setBulkValue] = useState('3');
  const [bulkRounding, setBulkRounding] = useState<'none' | '1' | '5' | '10'>('none');
  const [bulkScope, setBulkScope] = useState<'all' | 'selected'>('all');
  const [floorEdit, setFloorEdit] = useState<{ id: string; value: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string; count: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Close overlays on Escape / scroll / resize so they never stick or clip.
  useEffect(() => {
    const anyOpen = !!(colMenu || rowMenu || formulaCol || rename || floorEdit);
    if (!anyOpen) return;
    const closeAll = () => {
      setColMenu(null);
      setRowMenu(null);
      setFormulaCol(null);
      setRename(null);
      setFloorEdit(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', closeAll);
    window.addEventListener('scroll', closeAll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', closeAll);
      window.removeEventListener('scroll', closeAll, true);
    };
  }, [colMenu, rowMenu, formulaCol, rename, floorEdit]);

  useEffect(() => {
    if (editing) setTimeout(() => editRef.current?.select(), 0);
  }, [editing]);

  const selection = useMemo(() => {
    if (!active || !anchor) return new Set<string>();
    const r0 = Math.min(active.r, anchor.r);
    const r1 = Math.max(active.r, anchor.r);
    const c0 = Math.min(active.c, anchor.c);
    const c1 = Math.max(active.c, anchor.c);
    const keys = new Set<string>();
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        keys.add(`${r}:${c}`);
      }
    }
    return keys;
  }, [active, anchor]);

  const setCellFields = useCallback(
    (rowId: string, listId: string, fields: DraftCell) => {
      const key = cellKey(rowId, listId);
      if (fields === null) {
        setCell(key, null);
        return;
      }
      setCell(key, fields);
    },
    [setCell],
  );

  const mergeCellFields = useCallback(
    (rowId: string, listId: string, fields: Partial<NonNullable<DraftCell>>) => {
      const key = cellKey(rowId, listId);
      const existing = dirty[key];
      setCell(key, {
        ...(existing !== null && existing !== undefined ? existing : {}),
        ...fields,
      });
    },
    [dirty, setCell],
  );

  const resetCell = useCallback(
    (row: ProductRow, col: PriceListCol) => {
      // Unified Reset: draft null → publish deletes the item; UI falls back to
      // list −% (percent lists) or Base (selected lists).
      setCellFields(row.id, col.id, null);
    },
    [setCellFields],
  );

  const commitEdit = (r: number, c: number) => {
    const row = rows[r];
    const col = cols[c];
    if (!row || !col) {
      setEditing(null);
      return;
    }
    const trimmed = editVal.trim();
    if (trimmed === '') {
      // Empty = Reset (back to list rule / Base).
      resetCell(row, col);
    } else {
      const num = parseFloat(trimmed);
      if (!Number.isNaN(num) && num >= 0) {
        mergeCellFields(row.id, col.id, { price: Math.round(num * 100) / 100, isExcluded: false, added: true });
      }
    }
    setEditing(null);
  };

  const startEdit = (r: number, c: number) => {
    const row = rows[r];
    const col = cols[c];
    if (!row || !col) return;
    if (cellLocked(row, col, dirty)) {
      toast.warning('Cell is locked');
      return;
    }
    const val = effective(row, col, dirty);
    setEditVal(String(val));
    setEditing({ r, c });
  };

  const applyToSelection = (fn: (row: ProductRow, col: PriceListCol) => void) => {
    selection.forEach((key) => {
      const [rs, cs] = key.split(':').map(Number);
      const row = rows[rs];
      const col = cols[cs];
      if (row && col) fn(row, col);
    });
  };

  const buildSimpleFormulaText = (): string | null => {
    const v = bulkValue.trim();
    const num = Number(v);
    if (v === '' || !Number.isFinite(num) || num < 0) return null;
    const src = bulkSource === 'BASE' ? 'BASE' : cols.find((c) => c.id === bulkSource)?.name ?? 'BASE';
    const srcKey = src === 'BASE' ? 'BASE' : src.replace(/\s+/g, '');
    if (bulkOp === 'copy') return `=${srcKey}*1`;
    if (bulkOp === 'discountPct') return `=${srcKey}-${num}%`;
    if (bulkOp === 'markupPct') return `=${srcKey}+${num}%`;
    if (bulkOp === 'minusFlat') return `=${srcKey}-${num}`;
    return `=${srcKey}+${num}`;
  };

  const applyRounding = (n: number): number => {
    if (bulkRounding === 'none') return Math.round(n * 100) / 100;
    const step = Number(bulkRounding);
    return Math.round(n / step) * step;
  };

  const bulkPreviewRows = useMemo(() => {
    if (!formulaCol) return [] as Array<{ name: string; from: number; to: number }>;
    const targetCol = cols.find((c) => c.id === formulaCol);
    if (!targetCol) return [];
    const text = formulaMode === 'simple' ? buildSimpleFormulaText() : formulaText;
    const parsed = text ? parseFormula(text) : null;
    if (!parsed) return [];
    const listByKey = new Map(cols.map((c) => [normalizeListKey(c.name), c]));
    const scopeRows = bulkScope === 'selected' && selectedProductIds && selectedProductIds.size > 0
      ? rows.filter((r) => selectedProductIds.has(r.id))
      : rows;
    return scopeRows.slice(0, 3).map((row) => {
      let sourcePrice = row.basePrice;
      if (parsed.source !== 'BASE') {
        const srcCol = listByKey.get(parsed.source);
        if (srcCol) sourcePrice = effective(row, srcCol, dirty);
      }
      let to = sourcePrice;
      try { to = applyRounding(applyFormula(sourcePrice, parsed)); } catch { /* keep */ }
      return { name: row.name, from: effective(row, targetCol, dirty), to };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formulaCol, formulaMode, bulkSource, bulkOp, bulkValue, bulkRounding, bulkScope, formulaText, cols, rows, dirty, selectedProductIds]);

  const applyFormulaToColumn = () => {
    const colId = formulaCol;
    if (!colId) return;
    const targetCol = cols.find((c) => c.id === colId);
    if (!targetCol) return;
    const text = formulaMode === 'simple' ? buildSimpleFormulaText() : formulaText;
    if (!text) { toast.error('Enter a valid amount'); return; }
    const parsed = parseFormula(text);
    if (!parsed) {
      toast.error('Invalid formula. Try =BASE-3%');
      return;
    }

    const listByKey = new Map(cols.map((c) => [normalizeListKey(c.name), c]));
    let updated = 0;
    let skipped = 0;

    const useSelected = bulkScope === 'selected' && selectedProductIds && selectedProductIds.size > 0;
    const targetRows = useSelected
      ? rows.filter((r) => selectedProductIds.has(r.id))
      : rows;

    for (const row of targetRows) {
      if (cellLocked(row, targetCol, dirty)) {
        skipped++;
        continue;
      }
      let sourcePrice = row.basePrice;
      if (parsed.source !== 'BASE') {
        const srcCol = listByKey.get(parsed.source);
        if (!srcCol) {
          toast.error(`Unknown list in formula: ${parsed.source}`);
          return;
        }
        sourcePrice = effective(row, srcCol, dirty);
      }
      try {
        const out = applyRounding(applyFormula(sourcePrice, parsed));
        if (out > 0) {
          mergeCellFields(row.id, targetCol.id, { price: out, isExcluded: false });
          updated++;
        }
      } catch {
        skipped++;
      }
    }

    setFormulaCol(null);
    setFormulaText('');
    toast.success(`Prices updated for ${updated} product${updated === 1 ? '' : 's'}${skipped ? ` (${skipped} locked, skipped)` : ''} — review & publish to go live`);
  };

  const saveFloor = async () => {
    if (!floorEdit) return;
    const val = floorEdit.value.trim() === '' ? null : Number(floorEdit.value);
    if (val !== null && (!Number.isFinite(val) || val < 0 || val > 100)) { toast.error('Floor must be 0–100%'); return; }
    setColBusy(floorEdit.id);
    try {
      const res = await fetch(`/api/v1/vendor/price-lists/${floorEdit.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floorPercentOfBase: val }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed');
      toast.success(val === null ? 'Price floor removed' : `Prices in this list will not go below ${val}% of Base`);
      setFloorEdit(null);
      onListsChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); } finally { setColBusy(null); }
  };

  const renameList = async () => {
    if (!rename) return;
    const name = renameVal.trim();
    if (!name) return;
    setColBusy(rename.id);
    try {
      const res = await fetch(`/api/v1/vendor/price-lists/${rename.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Rename failed');
      toast.success('List renamed');
      setRename(null);
      onListsChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rename failed');
    } finally {
      setColBusy(null);
    }
  };

  const cloneList = async (sourceId: string) => {
    const source = cols.find((c) => c.id === sourceId);
    if (!source) return;
    setColBusy(sourceId);
    setColMenu(null);
    try {
      const res = await fetch(`/api/v1/vendor/price-lists/${sourceId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${source.name} (copy)` }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Clone failed');
      toast.success('List cloned');
      onListsChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Clone failed');
    } finally {
      setColBusy(null);
    }
  };

  const deleteList = async (id: string) => {
    setConfirmDelete(null);
    setColBusy(id);
    setColMenu(null);
    try {
      const res = await fetch(`/api/v1/vendor/price-lists/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to delete list');
      toast.success('List deleted');
      onListsChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete list');
    } finally {
      setColBusy(null);
    }
  };

  // No "move up/down" winner control: overlapping products across lists are
  // a supplier conflict (Skip/Replace/Review at assignment), never an order.

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active || editing) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      const row = rows[active.r];
      const col = cols[active.c];
      if (!row || !col) return;

      if (e.key === 'F2') {
        e.preventDefault();
        startEdit(active.r, active.c);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (cellLocked(row, col, dirty)) return;
        if (hasCustomOverride(row, col, dirty)) resetCell(row, col);
        return;
      }
      if (e.key === 'x' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        applyToSelection((r, c) => {
          if (!cellLocked(r, c, dirty)) mergeCellFields(r.id, c.id, { isExcluded: true });
        });
        return;
      }
      if (e.key === 'Enter' && editing) {
        e.preventDefault();
        commitEdit(active.r, active.c);
        setActive({ r: Math.min(active.r + 1, rows.length - 1), c: active.c });
        setAnchor({ r: Math.min(active.r + 1, rows.length - 1), c: active.c });
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const nextC = e.shiftKey ? active.c - 1 : active.c + 1;
        if (nextC >= 0 && nextC < cols.length) {
          setActive({ r: active.r, c: nextC });
          setAnchor({ r: active.r, c: nextC });
        }
        return;
      }
      if (e.key === 'Escape') {
        setEditing(null);
        return;
      }
      if (e.key.length === 1 && /[\d.]/.test(e.key)) {
        startEdit(active.r, active.c);
        setEditVal(e.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, anchor, cols, dirty, editing, rows, applyToSelection, mergeCellFields, resetCell]);

  const selectionCount = selection.size;
  const selectionHasCustom = selectionCount >= 1 && active && rows[active.r] && cols[active.c]
    ? [...selection].some((key) => {
        const [rs, cs] = key.split(':').map(Number);
        const r = rows[rs];
        const c = cols[cs];
        return r && c && hasCustomOverride(r, c, dirty);
      })
    : false;

  return (
    <div className="space-y-2">
      {selectionCount >= 1 && active && rows[active.r] && cols[active.c] && (
        <div className="sticky top-[132px] z-30 flex flex-wrap items-center gap-2 p-2.5 rounded-[12px] bg-white border border-primary/25 shadow-sm text-[12px]" role="toolbar" aria-label="Selected price actions">
          <span className="font-bold text-[#181725] tabular-nums">
            {selectionCount === 1
              ? `${rows[active.r].name} · ${cols[active.c].name}: ${inr(effective(rows[active.r], cols[active.c], dirty))}`
              : `${selectionCount} prices selected`}
          </span>
          <span className="text-[#7C7C7C] hidden md:inline">Choose what to do:</span>
          {selectionCount === 1 && (
            <button type="button" className="h-9 px-3 rounded-[10px] bg-primary text-white font-semibold flex items-center gap-1.5" onClick={() => startEdit(active.r, active.c)}>
              <Pencil size={13} /> Edit price
            </button>
          )}
          <button
            type="button"
            className="h-9 px-3 rounded-[10px] border border-[#E9E3DD] bg-white font-semibold flex items-center gap-1"
            title="Set a custom price at Base −5% (does not compound)"
            onClick={() => applyToSelection((r, c) => {
              if (cellLocked(r, c, dirty)) return;
              mergeCellFields(r.id, c.id, { price: Math.round(r.basePrice * 0.95 * 100) / 100, isExcluded: false });
            })}
          >
            <Percent size={13} /> Base −5%
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-[10px] border border-[#E9E3DD] bg-white font-semibold flex items-center gap-1"
            title="Set a custom price at Base +5%"
            onClick={() => applyToSelection((r, c) => {
              if (cellLocked(r, c, dirty)) return;
              mergeCellFields(r.id, c.id, { price: Math.round(r.basePrice * 1.05 * 100) / 100, isExcluded: false });
            })}
          >
            <Percent size={13} /> Base +5%
          </button>
          {selectionHasCustom && (
            <button
              type="button"
              className="h-9 px-3 rounded-[10px] border border-[#E9E3DD] bg-white font-semibold flex items-center gap-1.5"
              title={resetTooltip(cols[active.c])}
              onClick={() => applyToSelection((r, c) => {
                if (cellLocked(r, c, dirty)) return;
                if (hasCustomOverride(r, c, dirty)) resetCell(r, c);
              })}
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}
          <button
            type="button"
            className="h-9 px-3 rounded-[10px] border border-[#E9E3DD] bg-white font-semibold flex items-center gap-1.5"
            onClick={() => applyToSelection((r, c) => {
              if (cellLocked(r, c, dirty)) return;
              mergeCellFields(r.id, c.id, { isExcluded: !isExcluded(r, c, dirty) });
            })}
          >
            <EyeOff size={13} /> Hide / Restore
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-[10px] border border-[#E9E3DD] bg-white font-semibold flex items-center gap-1.5"
            onClick={() => applyToSelection((r, c) => {
              const locked = cellLocked(r, c, dirty);
              if (!locked && !hasCustomOverride(r, c, dirty)) {
                // Locking a fallback cell seeds the default price so we do not write a priceless row.
                mergeCellFields(r.id, c.id, { price: fallbackPrice(r, c), isLocked: true, isExcluded: false });
              } else {
                mergeCellFields(r.id, c.id, { isLocked: !locked });
              }
            })}
          >
            <Lock size={13} /> Lock / Unlock
          </button>
          <button type="button" className="h-9 px-2 text-[#7C7C7C] font-medium ml-auto" onClick={() => { setActive(null); setAnchor(null); }}>
            Clear
          </button>
        </div>
      )}

      <div ref={gridRef} className="rounded-[12px] border border-[#E9E3DD] bg-white overflow-auto max-h-[calc(100vh-280px)]">
        <table className="border-collapse text-[12px] min-w-full">
          <thead className="sticky top-0 z-30 bg-[#FAF7F2]">
            <tr>
              <th className="sticky left-0 z-40 bg-[#FAF7F2] p-2 border-b border-[#E9E3DD] text-left min-w-[300px] w-[300px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  {onSelectedProductIdsChange && rows.length > 0 && (
                    <input
                      type="checkbox"
                      aria-label="Select all visible products"
                      checked={rows.every((r) => selectedProductIds?.has(r.id))}
                      ref={(el) => {
                        if (el) el.indeterminate = rows.some((r) => selectedProductIds?.has(r.id)) && !rows.every((r) => selectedProductIds?.has(r.id));
                      }}
                      onChange={(e) => {
                        const next = new Set(selectedProductIds ?? []);
                        if (e.target.checked) rows.forEach((r) => next.add(r.id));
                        else rows.forEach((r) => next.delete(r.id));
                        onSelectedProductIdsChange(next);
                      }}
                      className="shrink-0"
                    />
                  )}
                  <span>Product{selectedProductIds && selectedProductIds.size > 0 ? ` (${selectedProductIds.size} selected)` : ''}</span>
                </label>
              </th>
              <th className="sticky left-[300px] z-40 bg-[#FAF7F2] p-2 border-b border-l border-[#E9E3DD] min-w-[88px]">
                SKU
              </th>
              <th className="sticky left-[388px] z-40 bg-[#FAF7F2] p-2 border-b border-l border-[#E9E3DD] min-w-[72px] text-right tabular-nums">
                Base
              </th>
              {cols.map((col) => (
                <th
                  key={col.id}
                  className="p-2 border-b border-l border-[#E9E3DD] min-w-[108px] align-top"
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <div className="font-bold text-[#181725] truncate" title={col.name}>
                        {col.name}
                      </div>
                      <div className="text-[10px] text-[#7C7C7C] tabular-nums" title={listSubtitle(col)}>
                        {listSubtitle(col)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-white shrink-0"
                      aria-label={`More actions for ${col.name}`}
                      aria-haspopup="menu"
                      onClick={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const menuW = 208;
                        const menuH = 300;
                        const x = Math.max(12, Math.min(rect.right - menuW, window.innerWidth - menuW - 12));
                        const y = Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - menuH - 12));
                        setColMenu({ id: col.id, x, y });
                      }}
                    >
                      {colBusy === col.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <MoreVertical size={14} />
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="mt-1 text-[10px] text-primary font-semibold flex items-center gap-0.5"
                    onClick={() => {
                      setFormulaCol(col.id);
                      setFormulaText('=BASE-3%');
                      setFormulaMode('simple');
                      setBulkSource('BASE');
                      setBulkOp('discountPct');
                      setBulkValue('3');
                      setBulkScope(selectedProductIds && selectedProductIds.size > 0 ? 'selected' : 'all');
                    }}
                  >
                    <FunctionSquare size={11} /> Bulk adjust
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={3 + cols.length} className="p-12 text-center text-[#7C7C7C]">
                  <Loader2 className="inline animate-spin mr-2" size={18} /> Loading products…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={3 + cols.length} className="p-12 text-center">
                  <p className="text-[13px] font-bold text-[#AEAEAE]">No products in this list</p>
                  <p className="text-[12px] text-[#AEAEAE] mt-1 text-pretty">
                    {compareMode
                      ? 'No products to compare. Switch off Compare and add products to a list.'
                      : 'Tick the products that belong here.'}
                  </p>
                  {!compareMode && onEditProducts && (
                    <button
                      type="button"
                      onClick={onEditProducts}
                      className="inline-flex items-center gap-2 mt-3 h-10 px-4 rounded-[12px] bg-primary text-white font-semibold text-[13px]"
                    >
                      <ListChecks size={15} /> Add products
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row, ri) => (
                <tr key={row.id} className="hover:bg-[#FAF7F2]/50">
                  <td className="sticky left-0 z-20 bg-white p-2 pr-9 border-b border-[#E9E3DD] font-medium text-[#181725] min-w-[300px] w-[300px] relative">
                    <label className="flex items-start gap-2 cursor-pointer">
                      {onSelectedProductIdsChange && (
                        <input
                          type="checkbox"
                          checked={selectedProductIds?.has(row.id) ?? false}
                          onChange={(e) => {
                            const next = new Set(selectedProductIds ?? []);
                            if (e.target.checked) next.add(row.id);
                            else next.delete(row.id);
                            onSelectedProductIdsChange(next);
                          }}
                          className="shrink-0 mt-0.5"
                        />
                      )}
                      <span className="flex-1 whitespace-normal break-words leading-snug" title={row.name}>{row.name}</span>
                    </label>
                    <button
                      type="button"
                      aria-label={`Actions for ${row.name}`}
                      title="Product actions"
                      className="absolute right-1 top-1.5 p-1.5 rounded-lg border border-[#E9E3DD] bg-white hover:bg-[#F8E8EC] text-[#6B1D2E] shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const menuW = 230; const menuH = 190;
                        setRowMenu({
                          r: ri,
                          x: Math.max(12, Math.min(rect.left, window.innerWidth - menuW - 12)),
                          y: Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - menuH - 12)),
                        });
                      }}
                    >
                      <MoreVertical size={14} />
                    </button>
                  </td>
                  <td className="sticky left-[300px] z-20 bg-white p-2 border-b border-l border-[#E9E3DD] text-[#7C7C7C]">
                    {row.sku || '—'}
                  </td>
                  <td className="sticky left-[388px] z-20 bg-white p-2 border-b border-l border-[#E9E3DD] text-right tabular-nums text-[#7C7C7C]">
                    {inr(row.basePrice)}
                  </td>
                  {cols.map((col, ci) => {
                    const dirtyCell = isDirty(row, col, dirty);
                    const member = isInList(row, col, dirty);
                    const excluded = isExcluded(row, col, dirty);
                    const locked = cellLocked(row, col, dirty);
                    const price = effective(row, col, dirty);
                    const source = priceSource(row, col, dirty);
                    const isActiveCell = active?.r === ri && active?.c === ci;
                    const inSel = selection.has(`${ri}:${ci}`);
                    const isEdit = editing?.r === ri && editing?.c === ci;
                    const customOverride = source === 'custom';
                    const deltaPct = row.basePrice > 0
                      ? Math.round((price / row.basePrice - 1) * 100)
                      : 0;

                    if (compareMode && !member) {
                      return (
                        <td
                          key={col.id}
                          className="p-0 border-b border-l border-[#E9E3DD] text-right tabular-nums"
                        >
                          <div className="px-2 py-2 min-h-[36px] flex items-center justify-end text-[#AEAEAE]" title="Not in this list">
                            —
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={col.id}
                        className={cn(
                          'p-0 border-b border-l border-[#E9E3DD] text-right tabular-nums cursor-cell',
                          dirtyCell && 'bg-amber-50',
                          inSel && 'ring-1 ring-inset ring-primary/40',
                          isActiveCell && 'ring-2 ring-inset ring-primary',
                        )}
                        onMouseDown={() => {
                          setActive({ r: ri, c: ci });
                          setAnchor({ r: ri, c: ci });
                        }}
                        onDoubleClick={() => startEdit(ri, ci)}
                      >
                        {isEdit ? (
                          <input
                            ref={editRef}
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            onBlur={() => commitEdit(ri, ci)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitEdit(ri, ci);
                                setActive({ r: Math.min(ri + 1, rows.length - 1), c: ci });
                              }
                              if (e.key === 'Escape') setEditing(null);
                            }}
                            className="w-full h-9 px-2 text-right outline-none bg-white border-2 border-primary"
                          />
                        ) : excluded ? (
                          <div className="px-2 py-2 flex items-center justify-end gap-1.5 min-h-[36px]">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold normal-case"><EyeOff size={10} /> Excluded</span>
                            {isActiveCell && (
                              <button type="button" aria-label="Restore product" className="text-primary" onClick={(e) => { e.stopPropagation(); mergeCellFields(row.id, col.id, { isExcluded: false }); }}><Eye size={13} /></button>
                            )}
                          </div>
                        ) : (
                          <div
                            className={cn(
                              'px-2 py-2 flex items-center justify-end gap-1.5 min-h-[36px] group/cell',
                              source !== 'custom' && 'text-[#7C7C7C]',
                              source === 'custom' && 'text-[#181725] font-semibold',
                              dirtyCell && 'border-l-2 border-l-primary bg-[#F8E8EC]/40',
                            )}
                          >
                            {locked && <span title="Locked — bulk adjust will skip this price"><Lock size={11} className="text-[#7C7C7C] shrink-0" /></span>}
                            <span>{inr(price)}</span>
                            {source === 'custom' && (
                              <span className="text-[9px] font-bold px-1 py-px rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                                {deltaPct === 0 ? 'Custom' : `Custom ${deltaPct < 0 ? '−' : '+'}${Math.abs(deltaPct)}%`}
                              </span>
                            )}
                            {source === 'list' && (
                              <span className="text-[9px] font-semibold px-1 py-px rounded-full bg-[#FAF7F2] border border-[#E9E3DD] text-[#7C7C7C]">
                                List −{Number(col.discountPercent)}%
                              </span>
                            )}
                            {source === 'base' && (
                              <span className="text-[9px] font-semibold px-1 py-px rounded-full bg-[#FAF7F2] border border-[#E9E3DD] text-[#7C7C7C]">Base</span>
                            )}
                            {isActiveCell && !locked && (
                              <button type="button" aria-label={`Edit price for ${row.name} in ${col.name}`} title="Edit price" className="text-primary shrink-0" onClick={(e) => { e.stopPropagation(); startEdit(ri, ci); }}><Pencil size={12} /></button>
                            )}
                            {!locked && customOverride && (
                              <button
                                type="button"
                                aria-label={`Reset ${row.name} in ${col.name}`}
                                title={resetTooltip(col)}
                                className="w-5 h-5 rounded-full border border-[#E9E3DD] bg-white text-[#6B1D2E] text-[11px] font-bold leading-none flex items-center justify-center shrink-0 hover:bg-[#F8E8EC]"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resetCell(row, col);
                                  toast.success(
                                    isPercentList(col)
                                      ? `${row.name} reset to list −${Number(col.discountPercent)}% (draft) — Review & publish to apply`
                                      : `${row.name} reset to Base (draft) — Review & publish to apply`,
                                  );
                                }}
                              >
                                <RotateCcw size={11} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={onLoadMore}
          className="w-full h-11 rounded-[12px] border border-[#E9E3DD] font-semibold text-[#181725] flex items-center justify-center gap-2"
        >
          {loadingMore ? <Loader2 size={16} className="animate-spin" /> : null}
          Load more products
        </button>
      )}

      {rowMenu && rows[rowMenu.r] && (() => {
        const row = rows[rowMenu.r];
        // Single-list view: displayCols has exactly one column — target that.
        // Compare mode: cell actions live on the cell; menu is product-level only.
        if (compareMode || cols.length !== 1) {
          return (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} />
              <div
                role="menu"
                aria-label={`Actions for ${row.name}`}
                className="fixed z-50 bg-white border border-[#E9E3DD] rounded-[12px] shadow-xl py-1 w-[230px] max-w-[calc(100vw-24px)] text-[13px]"
                style={{ left: rowMenu.x, top: rowMenu.y }}
              >
                <div className="px-3 py-1.5 text-[11px] font-semibold text-[#7C7C7C] truncate">{row.name}</div>
                <button type="button" className="w-full px-3 py-2 text-left hover:bg-[#FAF7F2] flex items-center gap-2" onClick={() => { setRowMenu(null); window.open(`/vendor/products?edit=${row.id}`, '_blank'); }}>
                  <ExternalLink size={14} /> Edit product details
                </button>
              </div>
            </>
          );
        }
        const col = cols[0];
        const locked = cellLocked(row, col, dirty);
        const excluded = isExcluded(row, col, dirty);
        const custom = hasCustomOverride(row, col, dirty);
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} />
            <div
              role="menu"
              aria-label={`Actions for ${row.name}`}
              className="fixed z-50 bg-white border border-[#E9E3DD] rounded-[12px] shadow-xl py-1 w-[230px] max-w-[calc(100vw-24px)] text-[13px]"
              style={{ left: rowMenu.x, top: rowMenu.y }}
            >
              <div className="px-3 py-1.5 text-[11px] font-semibold text-[#7C7C7C] truncate">In list: {col.name}</div>
              <button type="button" className="w-full px-3 py-2 text-left hover:bg-[#FAF7F2] flex items-center gap-2 disabled:opacity-40" disabled={locked} onClick={() => { setRowMenu(null); setActive({ r: rowMenu.r, c: 0 }); startEdit(rowMenu.r, 0); }}>
                <Pencil size={14} /> Edit price
              </button>
              {custom && (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-[#FAF7F2] flex items-center gap-2 disabled:opacity-40"
                  disabled={locked}
                  onClick={() => {
                    setRowMenu(null);
                    resetCell(row, col);
                    toast.success(
                      isPercentList(col)
                        ? `${row.name} reset to list −${Number(col.discountPercent)}% (draft) — Review & publish to apply`
                        : `${row.name} reset to Base (draft) — Review & publish to apply`,
                    );
                  }}
                >
                  <RotateCcw size={14} /> Reset
                </button>
              )}
              <button type="button" className="w-full px-3 py-2 text-left hover:bg-[#FAF7F2] flex items-center gap-2 disabled:opacity-40" disabled={locked} onClick={() => { setRowMenu(null); mergeCellFields(row.id, col.id, { isExcluded: !excluded }); }}>
                {excluded ? <Eye size={14} /> : <EyeOff size={14} />} {excluded ? 'Restore product' : 'Exclude product'}
              </button>
              <button type="button" className="w-full px-3 py-2 text-left hover:bg-[#FAF7F2] flex items-center gap-2" onClick={() => { setRowMenu(null); window.open(`/vendor/products?edit=${row.id}`, '_blank'); }}>
                <ExternalLink size={14} /> Edit product details
              </button>
            </div>
          </>
        );
      })()}

      {colMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setColMenu(null)} />
          <div
            role="menu"
            aria-label="Price list actions"
            className="fixed z-50 bg-white border border-[#E9E3DD] rounded-[12px] shadow-xl py-1 w-[208px] max-w-[calc(100vw-24px)] text-[13px]"
            style={{ left: colMenu.x, top: colMenu.y }}
          >
            <button
              type="button"
              className="w-full px-3 py-2 text-left hover:bg-[#FAF7F2] flex items-center gap-2"
              onClick={() => {
                const c = cols.find((x) => x.id === colMenu.id);
                if (c) {
                  setRename({ id: c.id, name: c.name });
                  setRenameVal(c.name);
                }
                setColMenu(null);
              }}
            >
              <Pencil size={14} /> Rename
            </button>
            <button
              type="button"
              className="w-full px-3 py-2 text-left hover:bg-[#FAF7F2] flex items-center gap-2"
              onClick={() => void cloneList(colMenu.id)}
            >
              <Copy size={14} /> Clone
            </button>
            <button
              type="button"
              className="w-full px-3 py-2 text-left hover:bg-[#FAF7F2] flex items-center gap-2"
              onClick={() => {
                const c = cols.find((x) => x.id === colMenu.id);
                setFloorEdit({ id: colMenu.id, value: c?.floorPercentOfBase != null ? String(c.floorPercentOfBase) : '' });
                setColMenu(null);
              }}
            >
              <Percent size={14} /> Price floor guard
            </button>
            {(() => {
              const menuCol = cols.find((x) => x.id === colMenu.id);
              if (!menuCol) return null;
              const overrideCount = rows.filter((r) => hasCustomOverride(r, menuCol, dirty) && !cellLocked(r, menuCol, dirty)).length;
              if (overrideCount === 0) return null;
              return (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-[#FAF7F2] flex items-center gap-2"
                  onClick={() => {
                    let n = 0;
                    for (const r of rows) {
                      if (cellLocked(r, menuCol, dirty)) continue;
                      if (!hasCustomOverride(r, menuCol, dirty)) continue;
                      resetCell(r, menuCol);
                      n += 1;
                    }
                    setColMenu(null);
                    toast.success(
                      `${n} custom price${n === 1 ? '' : 's'} cleared → ${isPercentList(menuCol) ? `list −${Number(menuCol.discountPercent)}%` : 'Base'} (draft) — Review & publish to apply`,
                    );
                  }}
                >
                  <RotateCcw size={14} /> Clear custom prices ({overrideCount})
                </button>
              );
            })()}
            <Link
              href={`/vendor/price-lists/${colMenu.id}`}
              className="w-full px-3 py-2 hover:bg-[#FAF7F2] flex items-center gap-2"
              onClick={() => setColMenu(null)}
            >
              Advanced editor →
            </Link>
            <button
              type="button"
              className="w-full px-3 py-2 text-left hover:bg-red-50 text-red-700 flex items-center gap-2"
              onClick={() => {
                const col = cols.find((c) => c.id === colMenu.id);
                if (!col) return;
                setColMenu(null);
                setConfirmDelete({
                  id: col.id,
                  name: col.name,
                  count: col.counts?.priced ?? 0,
                });
              }}
            >
              <Trash2 size={14} /> Delete list
            </button>
          </div>
        </>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDelete(null)} aria-hidden />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-list-title"
            aria-describedby="delete-list-desc"
            className="relative bg-white rounded-[16px] shadow-xl w-full max-w-md p-6 space-y-4"
          >
            <h2 id="delete-list-title" className="text-[17px] font-bold text-[#181725]">
              Delete {confirmDelete.name}?
            </h2>
            <p id="delete-list-desc" className="text-[13px] text-[#667085] text-pretty">
              This permanently removes the list, its{' '}
              <span className="tabular-nums font-semibold text-[#181725]">{confirmDelete.count}</span>
              {' '}price{confirmDelete.count === 1 ? '' : 's'}, and customer assignments. This cannot be undone.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 h-11 rounded-[12px] border border-[#E9E3DD] font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteList(confirmDelete.id)}
                className="flex-1 h-11 min-h-[48px] rounded-[12px] bg-red-600 text-white font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {rename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRename(null)} />
          <div className="relative bg-white rounded-[12px] p-5 w-full max-w-sm space-y-3">
            <h3 className="font-bold text-[#181725]">Rename list</h3>
            <input
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              className="w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px]"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setRename(null)} className="flex-1 h-10 border rounded-[12px]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void renameList()}
                className="flex-1 h-10 bg-primary text-white rounded-[12px] font-semibold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {floorEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFloorEdit(null)} />
          <div className="relative bg-white rounded-[12px] p-5 w-full max-w-sm space-y-3">
            <h3 className="font-bold text-[#181725]">Price floor guard</h3>
            <p className="text-[12px] text-[#7C7C7C]">Safety net: publishing is blocked if any price in this list falls below this % of the Base price. Leave blank for no floor.</p>
            <label className="block text-[12px] font-semibold text-[#181725]">Minimum % of Base
              <input type="number" min={0} max={100} value={floorEdit.value} onChange={(e) => setFloorEdit({ ...floorEdit, value: e.target.value })} placeholder="e.g. 70" className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] tabular-nums" />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setFloorEdit(null)} className="flex-1 h-11 border rounded-[12px] font-semibold">Cancel</button>
              <button type="button" onClick={() => void saveFloor()} className="flex-1 h-11 bg-primary text-white rounded-[12px] font-semibold">Save floor</button>
            </div>
          </div>
        </div>
      )}

      {formulaCol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFormulaCol(null)} />
          <div className="relative bg-white rounded-[16px] p-5 w-full max-w-md space-y-4 max-h-[90vh] overflow-auto">
            <div>
              <h3 className="font-bold text-[#181725] text-[16px]">Bulk adjust prices</h3>
              <p className="text-[12px] text-[#7C7C7C] mt-0.5">Set prices for <strong className="text-[#181725]">{cols.find((c) => c.id === formulaCol)?.name}</strong> in one go. Nothing goes live until you Review &amp; publish.</p>
            </div>
            <div className="flex gap-1 p-1 bg-[#FAF7F2] border border-[#E9E3DD] rounded-[12px]">
              <button type="button" onClick={() => setFormulaMode('simple')} className={cn('flex-1 h-9 rounded-[10px] text-[12px] font-bold', formulaMode === 'simple' ? 'bg-primary text-white' : 'text-[#7C7C7C]')}>Easy adjust</button>
              <button type="button" onClick={() => setFormulaMode('advanced')} className={cn('flex-1 h-9 rounded-[10px] text-[12px] font-bold', formulaMode === 'advanced' ? 'bg-primary text-white' : 'text-[#7C7C7C]')}>Formula (advanced)</button>
            </div>
            {formulaMode === 'simple' ? (
              <div className="space-y-3">
                <label className="block text-[12px] font-semibold text-[#181725]">Start from
                  <select value={bulkSource} onChange={(e) => setBulkSource(e.target.value)} className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] bg-white font-normal">
                    <option value="BASE">Base price</option>
                    {cols.filter((c) => c.id !== formulaCol).map((c) => <option key={c.id} value={c.id}>{c.name} prices</option>)}
                  </select>
                </label>
                <label className="block text-[12px] font-semibold text-[#181725]">Then
                  <select value={bulkOp} onChange={(e) => setBulkOp(e.target.value as typeof bulkOp)} className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] bg-white font-normal">
                    <option value="discountPct">Give discount (%)</option>
                    <option value="markupPct">Add markup (%)</option>
                    <option value="minusFlat">Reduce by flat ₹</option>
                    <option value="plusFlat">Increase by flat ₹</option>
                    <option value="copy">Copy exactly (no change)</option>
                  </select>
                </label>
                {bulkOp !== 'copy' && (
                  <label className="block text-[12px] font-semibold text-[#181725]">{bulkOp === 'discountPct' || bulkOp === 'markupPct' ? 'Percent (%)' : 'Amount (₹)'}
                    <input type="number" min={0} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] tabular-nums font-normal" />
                  </label>
                )}
                <label className="block text-[12px] font-semibold text-[#181725]">Round final price to
                  <select value={bulkRounding} onChange={(e) => setBulkRounding(e.target.value as typeof bulkRounding)} className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] bg-white font-normal">
                    <option value="none">Exact (paise)</option><option value="1">Nearest ₹1</option><option value="5">Nearest ₹5</option><option value="10">Nearest ₹10</option>
                  </select>
                </label>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[12px] text-[#7C7C7C]">Type a formula. Examples: <code className="font-mono">=BASE-3%</code> (3% off Base), <code className="font-mono">=BASE+10</code> (₹10 more), or use another list name instead of BASE.</p>
                <input aria-label="Formula" value={formulaText} onChange={(e) => setFormulaText(e.target.value)} className="w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] font-mono text-[13px]" />
              </div>
            )}
            <div>
              <p className="text-[12px] font-semibold text-[#181725] mb-1.5">Apply to</p>
              <div className="flex gap-2" role="group" aria-label="Apply scope">
                <button type="button" onClick={() => setBulkScope('all')} className={cn('flex-1 h-10 rounded-[10px] border text-[12px] font-bold', bulkScope === 'all' ? 'border-primary text-primary bg-[#F8E8EC]' : 'border-[#E9E3DD]')}>{compareMode ? 'All products shown' : 'All products in this list'}</button>
                <button type="button" disabled={!selectedProductIds || selectedProductIds.size === 0} onClick={() => setBulkScope('selected')} className={cn('flex-1 h-10 rounded-[10px] border text-[12px] font-bold disabled:opacity-40', bulkScope === 'selected' ? 'border-primary text-primary bg-[#F8E8EC]' : 'border-[#E9E3DD]')}>Only ticked rows ({selectedProductIds?.size ?? 0})</button>
              </div>
              {bulkScope === 'selected' && <p className="text-[11px] text-amber-700 mt-1.5">Only the ticked product rows will change — untick them on the grid for all products.</p>}
            </div>
            {bulkPreviewRows.length > 0 && (
              <div className="rounded-[12px] bg-[#FAF7F2] border border-[#E9E3DD] p-3">
                <p className="text-[11px] font-bold text-[#181725] mb-1.5">Preview (first {bulkPreviewRows.length})</p>
                {bulkPreviewRows.map((p) => (
                  <div key={p.name} className="flex justify-between text-[12px] py-0.5"><span className="truncate mr-3">{p.name}</span><span className="tabular-nums font-semibold">{inr(p.from)} → {inr(p.to)}</span></div>
                ))}
                <p className="text-[11px] text-[#7C7C7C] mt-1.5">Locked prices are skipped automatically.</p>
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setFormulaCol(null)} className="flex-1 h-11 border rounded-[12px] font-semibold">Cancel</button>
              <button type="button" onClick={applyFormulaToColumn} className="flex-1 h-11 bg-primary text-white rounded-[12px] font-semibold">Apply to draft</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
