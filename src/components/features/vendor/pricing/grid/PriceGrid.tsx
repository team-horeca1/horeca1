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
  PowerOff,
  EyeOff,
  Eye,
  Percent,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { applyFormula, normalizeListKey, parseFormula } from '@/modules/pricing/formula';
import type { DraftCell, PriceListCol, ProductRow } from '../types';
import {
  cellKey,
  effective,
  inr,
  isDirty,
  isExcluded,
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
  selectedProductIds?: Set<string>;
  onSelectedProductIdsChange?: (ids: Set<string>) => void;
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

function usesBaseFallback(row: ProductRow, col: PriceListCol, dirty: Record<string, DraftCell>): boolean {
  const key = cellKey(row.id, col.id);
  if (key in dirty) {
    const d = dirty[key];
    if (d === null) return true;
    if (d.isExcluded) return true;
    if (d.price === null) return true;
    if (d.price !== undefined && d.price !== null) return false;
  }
  const cell = row.cells[col.id];
  if (!cell || cell.isExcluded) return true;
  return cell.price == null;
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
  selectedProductIds,
  onSelectedProductIdsChange,
}: Props) {
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState<{ r: number; c: number } | null>(null);
  const [editVal, setEditVal] = useState('');
  const editRef = useRef<HTMLInputElement>(null);
  const [colMenu, setColMenu] = useState<{ id: string; x: number; y: number } | null>(null);
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
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Close column menu on Escape / scroll / resize so it never sticks or clips
  useEffect(() => {
    if (!colMenu) return;
    const close = () => setColMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [colMenu]);

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

  const commitEdit = (r: number, c: number) => {
    const row = rows[r];
    const col = cols[c];
    if (!row || !col) {
      setEditing(null);
      return;
    }
    const trimmed = editVal.trim();
    if (trimmed === '') {
      setCellFields(row.id, col.id, null);
    } else {
      const num = parseFloat(trimmed);
      if (!Number.isNaN(num) && num >= 0) {
        mergeCellFields(row.id, col.id, { price: Math.round(num * 100) / 100, isExcluded: false });
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

  const deactivateList = async (id: string) => {
    setConfirmDeactivate(null);
    setColBusy(id);
    setColMenu(null);
    try {
      const res = await fetch(`/api/v1/vendor/price-lists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed');
      toast.success('List deactivated');
      onListsChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setColBusy(null);
    }
  };

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
        if (!cellLocked(row, col, dirty)) setCellFields(row.id, col.id, null);
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
  }, [active, anchor, cols, dirty, editing, rows, applyToSelection, mergeCellFields, setCellFields]);

  const selectionCount = selection.size;

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
          <button type="button" className="h-9 px-3 rounded-[10px] border border-[#E9E3DD] bg-white font-semibold flex items-center gap-1" onClick={() => applyToSelection((r, c) => { if (!cellLocked(r, c, dirty)) { const p = effective(r, c, dirty); mergeCellFields(r.id, c.id, { price: Math.round(p * 0.95 * 100) / 100, isExcluded: false }); } })}>
            <Percent size={13} /> −5%
          </button>
          <button type="button" className="h-9 px-3 rounded-[10px] border border-[#E9E3DD] bg-white font-semibold flex items-center gap-1" onClick={() => applyToSelection((r, c) => { if (!cellLocked(r, c, dirty)) { const p = effective(r, c, dirty); mergeCellFields(r.id, c.id, { price: Math.round(p * 1.05 * 100) / 100, isExcluded: false }); } })}>
            <Percent size={13} /> +5%
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-[10px] border border-[#E9E3DD] bg-white font-semibold flex items-center gap-1.5"
            onClick={() => applyToSelection((r, c) => { if (!cellLocked(r, c, dirty)) setCellFields(r.id, c.id, null); })}
          >
            <RotateCcw size={13} /> Use Base price
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-[10px] border border-[#E9E3DD] bg-white font-semibold flex items-center gap-1.5"
            onClick={() => applyToSelection((r, c) => { if (!cellLocked(r, c, dirty)) mergeCellFields(r.id, c.id, { isExcluded: !isExcluded(r, c, dirty) }); })}
          >
            <EyeOff size={13} /> Hide / Restore product
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-[10px] border border-[#E9E3DD] bg-white font-semibold flex items-center gap-1.5"
            onClick={() => applyToSelection((r, c) => mergeCellFields(r.id, c.id, { isLocked: !cellLocked(r, c, dirty) }))}
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
              <th className="sticky left-0 z-40 bg-[#FAF7F2] p-2 border-b border-[#E9E3DD] text-left min-w-[180px]">
                Product
              </th>
              <th className="sticky left-[180px] z-40 bg-[#FAF7F2] p-2 border-b border-l border-[#E9E3DD] min-w-[88px]">
                SKU
              </th>
              <th className="sticky left-[268px] z-40 bg-[#FAF7F2] p-2 border-b border-l border-[#E9E3DD] min-w-[72px] text-right tabular-nums">
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
                      <div className="text-[10px] text-[#7C7C7C] tabular-nums">
                        {col.counts?.priced ?? 0} custom · {col.counts?.excluded ?? 0} hidden
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
            ) : (
              rows.map((row, ri) => (
                <tr key={row.id} className="hover:bg-[#FAF7F2]/50">
                  <td className="sticky left-0 z-20 bg-white p-2 border-b border-[#E9E3DD] font-medium text-[#181725]">
                    <label className="flex items-center gap-2 cursor-pointer">
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
                          className="shrink-0"
                        />
                      )}
                      <span className="truncate max-w-[160px]" title={row.name}>{row.name}</span>
                    </label>
                  </td>
                  <td className="sticky left-[180px] z-20 bg-white p-2 border-b border-l border-[#E9E3DD] text-[#7C7C7C]">
                    {row.sku || '—'}
                  </td>
                  <td className="sticky left-[268px] z-20 bg-white p-2 border-b border-l border-[#E9E3DD] text-right tabular-nums text-[#7C7C7C]">
                    {inr(row.basePrice)}
                  </td>
                  {cols.map((col, ci) => {
                    const dirtyCell = isDirty(row, col, dirty);
                    const excluded = isExcluded(row, col, dirty);
                    const locked = cellLocked(row, col, dirty);
                    const baseFb = usesBaseFallback(row, col, dirty);
                    const price = effective(row, col, dirty);
                    const isActiveCell = active?.r === ri && active?.c === ci;
                    const inSel = selection.has(`${ri}:${ci}`);
                    const isEdit = editing?.r === ri && editing?.c === ci;

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
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold normal-case"><EyeOff size={10} /> Hidden</span>
                            {isActiveCell && (
                              <button type="button" aria-label="Restore product" className="text-primary" onClick={(e) => { e.stopPropagation(); mergeCellFields(row.id, col.id, { isExcluded: false }); }}><Eye size={13} /></button>
                            )}
                          </div>
                        ) : (
                          <div
                            className={cn(
                              'px-2 py-2 flex items-center justify-end gap-1.5 min-h-[36px] group/cell',
                              baseFb && 'text-[#7C7C7C]',
                              !baseFb && 'text-[#181725] font-semibold',
                              dirtyCell && 'border-l-2 border-l-primary bg-[#F8E8EC]/40',
                            )}
                          >
                            {locked && <span title="Locked — bulk adjust will skip this price"><Lock size={11} className="text-[#7C7C7C] shrink-0" /></span>}
                            <span>{inr(price)}</span>
                            {!baseFb && row.basePrice > 0 && (
                              <span className={cn('text-[9px] font-bold px-1 py-px rounded-full', price < row.basePrice ? 'bg-green-50 text-green-700' : price > row.basePrice ? 'bg-amber-50 text-amber-700' : 'bg-[#FAF7F2] text-[#7C7C7C]')}>
                                {price === row.basePrice ? 'Base' : `${price < row.basePrice ? '−' : '+'}${Math.abs(Math.round((price / row.basePrice - 1) * 100))}%`}
                              </span>
                            )}
                            {baseFb && <span className="text-[9px] font-semibold px-1 py-px rounded-full bg-[#FAF7F2] border border-[#E9E3DD] text-[#7C7C7C]">Base</span>}
                            {isActiveCell && !locked && (
                              <button type="button" aria-label={`Edit price for ${row.name} in ${col.name}`} className="text-primary shrink-0" onClick={(e) => { e.stopPropagation(); startEdit(ri, ci); }}><Pencil size={12} /></button>
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
            <Link
              href={`/vendor/price-lists/${colMenu.id}`}
              className="w-full px-3 py-2 hover:bg-[#FAF7F2] flex items-center gap-2"
              onClick={() => setColMenu(null)}
            >
              Advanced editor →
            </Link>
            {confirmDeactivate === colMenu.id ? (
              <div className="px-3 py-2 bg-red-50">
                <p className="text-[12px] text-red-800 font-medium">Hide this list from the workspace?</p>
                <div className="flex gap-2 mt-2">
                  <button type="button" className="h-8 px-3 rounded-lg bg-red-600 text-white font-semibold" onClick={() => void deactivateList(colMenu.id)}>Yes, deactivate</button>
                  <button type="button" className="h-8 px-3 rounded-lg border bg-white font-semibold" onClick={() => setConfirmDeactivate(null)}>Keep</button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-red-50 text-red-700 flex items-center gap-2"
                onClick={() => setConfirmDeactivate(colMenu.id)}
              >
                <PowerOff size={14} /> Deactivate
              </button>
            )}
          </div>
        </>
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
                <button type="button" onClick={() => setBulkScope('all')} className={cn('flex-1 h-10 rounded-[10px] border text-[12px] font-bold', bulkScope === 'all' ? 'border-primary text-primary bg-[#F8E8EC]' : 'border-[#E9E3DD]')}>All products</button>
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
