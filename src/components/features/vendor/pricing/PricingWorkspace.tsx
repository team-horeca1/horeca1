'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search,
  Upload,
  Download,
  HelpCircle,
  Plus,
  AlertTriangle,
  RotateCcw,
  X,
  FileDown,
  ListChecks,
  ChevronDown,
  Columns2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  effective,
  isPercentList,
  listSubtitle,
  type PriceListCol,
  type ProductRow,
} from './types';
import { useDraft } from './grid/useDraft';
import { PriceGrid } from './grid/PriceGrid';
import { ReviewPublishDrawer } from './ReviewPublishDrawer';
import { PublishHistoryTab } from './PublishHistoryTab';
import { WhyThisPriceDrawer } from './WhyThisPriceDrawer';
import { NewPriceListModal } from './NewPriceListModal';
import { ProductPickerModal } from './ProductPickerModal';
import { AssignmentMatrix } from './assignments/AssignmentMatrix';

type TabId = 'prices' | 'assignments' | 'history';

export function PricingWorkspace() {
  const [tab, setTab] = useState<TabId>('prices');
  const [cols, setCols] = useState<PriceListCol[]>([]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [baseVersion, setBaseVersion] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  const [reviewOpen, setReviewOpen] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);
  const [picker, setPicker] = useState<{ listId: string; listName: string } | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainCustomerId, setExplainCustomerId] = useState<string | null>(null);
  const [explainProductId, setExplainProductId] = useState<string | null>(null);

  const colsRef = useRef<PriceListCol[]>([]);
  colsRef.current = cols;
  const activeListRef = useRef<string | null>(null);
  activeListRef.current = activeListId;
  const compareRef = useRef(false);
  compareRef.current = compare;

  const importRef = useRef<HTMLInputElement>(null);
  const [importListId, setImportListId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    entries: Array<{ productId: string; price: number }>;
    matched: number;
    unmatched: number;
    fileName: string;
  } | null>(null);

  const {
    dirty,
    setCell,
    clearDirty,
    changeCount,
    draftBaseVersion,
    isStale,
    restorePrompt,
    restoreDraft,
    discardRestore,
  } = useDraft(vendorId, baseVersion);

  useEffect(() => {
    if (changeCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [changeCount]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadWorkspace = useCallback(
    async (reset: boolean, cursor?: string | null) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      try {
        const qs = new URLSearchParams();
        if (debounced) qs.set('search', debounced);
        if (cursor) qs.set('cursor', cursor);
        qs.set('limit', '50');
        // Grid shows only products that belong to the active list (or the
        // union across lists in compare). Membership is managed via the picker.
        qs.set('membersOnly', '1');
        const actId = activeListRef.current;
        if (!compareRef.current && actId) {
          qs.set('listId', actId);
        }

        const res = await fetch(`/api/v1/vendor/price-lists/workspace?${qs}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message || 'Failed to load');

        const newCols = json.data.priceLists as PriceListCol[];
        setCols(newCols);
        if (!activeListRef.current && newCols.length > 0) setActiveListId(newCols[0].id);
        // If the active list was hard-deleted, fall back to the first remaining list.
        if (activeListRef.current && !newCols.some((c) => c.id === activeListRef.current)) {
          setActiveListId(newCols[0]?.id ?? null);
        }
        setBaseVersion(json.data.baseVersion ?? null);
        if (typeof json.data.vendorId === 'string') setVendorId(json.data.vendorId);
        setRows((prev) => (reset ? json.data.products : [...prev, ...json.data.products]));
        setNextCursor(json.data.pagination?.nextCursor ?? null);
        setHasMore(!!json.data.pagination?.hasMore);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load workspace');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debounced],
  );

  useEffect(() => {
    void loadWorkspace(true);
  }, [loadWorkspace]);

  // Reload rows when switching list / compare mode (refs above keep loadWorkspace stable).
  // Clear rows first so the grid shows loading instead of the previous list's empty cells.
  const firstLoadRef = useRef(true);
  useEffect(() => {
    if (firstLoadRef.current) { firstLoadRef.current = false; return; }
    setRows([]);
    setNextCursor(null);
    setHasMore(false);
    void loadWorkspace(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeListId, compare]);

  const handlePublished = () => {
    clearDirty();
    void loadWorkspace(true);
  };

  const exportMatrix = () => {
    const qs = new URLSearchParams();
    if (debounced) qs.set('search', debounced);
    if (!compare && activeCol) qs.set('listId', activeCol.id);
    window.open(`/api/v1/vendor/price-lists/workspace/export?${qs}`, '_blank');
  };

  const openImport = () => {
    if (cols.length === 0) {
      toast.error('Create a price list first');
      return;
    }
    // Preserve the vendor's chosen list — never silently reset to the first list
    setImportListId((prev) => prev && cols.some((c) => c.id === prev) ? prev : cols[0]?.id ?? null);
    setImportPreview(null);
    setImportOpen(true);
  };

  const downloadImportTemplate = () => {
    const col = cols.find((c) => c.id === importListId) ?? cols[0];
    if (!col) return;
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      ['SKU', 'Product', 'Base Price', 'New Price'].join(','),
      ...rows.map((r) => [esc(r.sku ?? ''), esc(r.name), String(r.basePrice), String(effective(r, col, dirty))].join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `price-import-template-${col.name.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !importListId) return;

    // Minimal RFC-4180 line parser: handles quoted fields containing commas
    const parseCsvLine = (line: string): string[] => {
      const out: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQuotes = false;
          else cur += ch;
        } else if (ch === '"') inQuotes = true;
        else if (ch === ',') { out.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      out.push(cur.trim());
      return out;
    };

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? '');
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        toast.error('CSV must include a header row plus at least one product row');
        return;
      }
      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
      const skuIdx = headers.findIndex((h) => h === 'sku');
      const productIdx = headers.findIndex((h) => h === 'product' || h === 'product name');
      const priceIdx = headers.findIndex((h) => h.includes('new price') || h === 'price');
      if ((skuIdx === -1 && productIdx === -1) || priceIdx === -1) {
        toast.error('Your CSV needs a "SKU" (or "Product") column and a "New Price" column — download the template to see the exact format');
        return;
      }
      const entries: Array<{ productId: string; price: number }> = [];
      let unmatched = 0;
      for (let i = 1; i < lines.length; i++) {
        const parts = parseCsvLine(lines[i]);
        const sku = skuIdx >= 0 ? (parts[skuIdx] ?? '') : '';
        const productName = productIdx >= 0 ? (parts[productIdx] ?? '') : '';
        const price = parseFloat(parts[priceIdx] ?? '');
        if (Number.isNaN(price) || (!sku && !productName)) { unmatched++; continue; }
        // Match by SKU first (case-insensitive); products without a SKU
        // (common for fresh/vendor SKUs) fall back to exact Product name.
        const row =
          (sku ? rows.find((r) => r.sku?.toLowerCase() === sku.toLowerCase()) : undefined) ??
          (productName ? rows.find((r) => r.name.toLowerCase() === productName.toLowerCase()) : undefined);
        if (!row) { unmatched++; continue; }
        entries.push({ productId: row.id, price });
      }
      setImportPreview({ entries, matched: entries.length, unmatched, fileName: file.name });
    };
    reader.readAsText(file);
  };

  const applyImportPreview = () => {
    if (!importPreview || !importListId) return;
    for (const entry of importPreview.entries) {
      setCell(`${entry.productId}:${importListId}`, { price: entry.price, isExcluded: false });
    }
    toast.success(`${importPreview.matched} prices added to your draft — Review & publish to go live`);
    setImportOpen(false);
    setImportPreview(null);
  };

  const openWhyPrice = () => {
    const firstProduct = rows[0];
    if (!firstProduct) {
      toast.message('Load products first, then pick a row for explain');
      return;
    }
    setExplainProductId(firstProduct.id);
    setExplainCustomerId(null);
    setExplainOpen(true);
  };

  const activeCol = cols.find((c) => c.id === activeListId) ?? cols[0] ?? null;
  const displayCols = compare ? cols : activeCol ? [activeCol] : cols;
  const openPicker = (list: { id: string; name: string }) => {
    setPicker({ listId: list.id, listName: list.name });
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'prices', label: 'Prices' },
    { id: 'assignments', label: 'Who gets which list' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[clamp(1.25rem,2vw+0.5rem,1.75rem)] font-bold text-[#181725]">Price List</h1>
          <p className="text-[13px] text-[#7C7C7C] mt-0.5">
            Manage lists, bulk edits, assignments, and publish with guardrails.
          </p>
        </div>
      </div>

      <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-[#FAF7F2]/95 backdrop-blur-sm border-b border-[#E9E3DD] space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-[#7C7C7C] font-medium">
            All prices ex-GST; GST added at checkout
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {changeCount > 0 && (
              <>
                <span className="text-[12px] font-semibold text-[#181725] tabular-nums">
                  {changeCount} unsaved
                </span>
                <button
                  type="button"
                  onClick={() => { clearDirty(); void loadWorkspace(true); toast.success('Changes discarded'); }}
                  className="h-10 px-3 rounded-[12px] border border-[#E9E3DD] bg-white font-semibold text-[13px]"
                >
                  Discard
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setNewListOpen(true)}
              className="h-10 px-3 rounded-[12px] border border-[#E9E3DD] bg-white font-semibold text-[13px] flex items-center gap-1.5"
            >
              <Plus size={15} /> New list
            </button>
            <button
              type="button"
              onClick={openImport}
              className="h-10 px-3 rounded-[12px] border border-[#E9E3DD] bg-white font-semibold text-[13px] flex items-center gap-1.5"
            >
              <Upload size={15} /> Import
            </button>
            <button
              type="button"
              onClick={exportMatrix}
              className="h-10 px-3 rounded-[12px] border border-[#E9E3DD] bg-white font-semibold text-[13px] flex items-center gap-1.5"
            >
              <Download size={15} /> Export
            </button>
            <button
              type="button"
              onClick={openWhyPrice}
              className="h-10 px-3 rounded-[12px] border border-[#E9E3DD] bg-white font-semibold text-[13px] flex items-center gap-1.5"
            >
              <HelpCircle size={15} /> Why this price?
            </button>
            <button
              type="button"
              disabled={changeCount === 0}
              onClick={() => setReviewOpen(true)}
              className="h-10 min-h-[48px] px-4 rounded-[12px] bg-primary text-white font-semibold text-[13px] disabled:opacity-50"
            >
              Review & publish {changeCount > 0 ? changeCount : ''} changes
            </button>
          </div>
        </div>

      </div>

      {restorePrompt && (
        <div className="p-3 rounded-[12px] bg-[#F8E8EC] border border-primary/20 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] text-[#181725]">
            Restore unsaved draft from this device?
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={discardRestore} className="h-9 px-3 rounded-[12px] border border-[#E9E3DD] bg-white font-semibold text-[12px]">
              Discard
            </button>
            <button type="button" onClick={restoreDraft} className="h-9 px-3 rounded-[12px] bg-primary text-white font-semibold text-[12px] flex items-center gap-1">
              <RotateCcw size={14} /> Restore
            </button>
          </div>
        </div>
      )}

      {isStale && (
        <div className="p-3 rounded-[12px] bg-amber-50 border border-amber-200 flex items-start gap-2 text-[13px] text-amber-900">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            Prices changed on the server since you started editing. Review carefully before publish, or{' '}
            <button
              type="button"
              className="underline font-semibold"
              onClick={() => {
                clearDirty();
                void loadWorkspace(true);
              }}
            >
              reload grid
            </button>
            .
          </div>
        </div>
      )}

      <div className="flex gap-1 p-1 bg-white border border-[#E9E3DD] rounded-[12px] w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-colors',
              tab === t.id ? 'bg-primary text-white' : 'text-[#7C7C7C] hover:text-[#181725]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'prices' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              {!compare && cols.length > 0 && (
                <div className="relative shrink-0">
                  <label htmlFor="price-list-select" className="sr-only">Price list</label>
                  <select
                    id="price-list-select"
                    value={activeCol?.id ?? ''}
                    onChange={(e) => setActiveListId(e.target.value || null)}
                    title={activeCol ? listSubtitle(activeCol) : undefined}
                    className="appearance-none h-11 pl-3.5 pr-9 min-w-[200px] max-w-[min(360px,100%)] rounded-[12px] border border-[#E9E3DD] bg-white text-[13px] font-semibold text-[#181725] focus:border-primary outline-none tabular-nums"
                  >
                    {cols.map((c) => {
                      const count = c.counts?.priced ?? 0;
                      const prefix = isPercentList(c) ? `−${Number(c.discountPercent)}% · ` : '';
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} ({prefix}{count} products)
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown
                    size={16}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#7C7C7C]"
                    aria-hidden
                  />
                </div>
              )}
              {compare && (
                <span className="h-11 px-3.5 inline-flex items-center rounded-[12px] bg-[#FAF7F2] border border-[#E9E3DD] text-[13px] font-semibold text-[#7C7C7C]">
                  Comparing {cols.length} lists
                </span>
              )}
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C7C7C]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search product or SKU"
                  className="w-full h-11 pl-9 pr-3 rounded-[12px] border border-[#E9E3DD] bg-white text-[13px] outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!compare && activeCol && (
                <button
                  type="button"
                  onClick={() => openPicker({ id: activeCol.id, name: activeCol.name })}
                  className="h-11 px-3.5 rounded-[12px] border border-[#E9E3DD] bg-white hover:bg-[#FAF7F2] text-[13px] font-semibold text-[#181725] inline-flex items-center gap-1.5"
                >
                  <ListChecks size={15} /> Edit products
                </button>
              )}
              <button
                type="button"
                onClick={() => setCompare((v) => !v)}
                className={cn(
                  'h-11 px-3.5 rounded-[12px] border text-[13px] font-semibold inline-flex items-center gap-1.5',
                  compare
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white border-[#E9E3DD] text-[#181725] hover:bg-[#FAF7F2]',
                )}
              >
                <Columns2 size={15} /> {compare ? 'Exit compare' : 'Compare lists'}
              </button>
            </div>
          </div>
          <p className="text-[12px] text-[#667085]">
            {compare
              ? 'Each column is one list. A dash means the product is not in that list. Badge = Custom / List −% / Base.'
              : 'Only ticked products are in this list. Edit products to add or remove · click a price to override · Review & publish to go live.'}
          </p>

          {cols.length === 0 && !loading ? (
            <div className="p-10 text-center rounded-[12px] border border-[#E9E3DD] bg-white">
              <p className="text-[#181725] font-semibold">No price lists yet</p>
              <button
                type="button"
                onClick={() => setNewListOpen(true)}
                className="mt-3 h-11 px-5 rounded-[12px] bg-primary text-white font-semibold"
              >
                Create your first list
              </button>
            </div>
          ) : !compare && activeCol && !loading && rows.length === 0 ? (
            <div className="p-10 text-center rounded-[12px] border border-[#E9E3DD] bg-white">
              <p className="text-[#181725] font-semibold">No products in this list yet</p>
              <p className="text-[13px] text-[#7C7C7C] mt-1 text-pretty">
                {isPercentList(activeCol)
                  ? `This is a legacy “all products −${Number(activeCol.discountPercent)}%” list. Pick products to convert it.`
                  : 'Tick the products that belong here. Unticked products stay at Base.'}
              </p>
              <button
                type="button"
                onClick={() => openPicker({ id: activeCol.id, name: activeCol.name })}
                className="mt-3 h-11 min-h-[48px] px-5 rounded-[12px] bg-primary text-white font-semibold inline-flex items-center gap-2"
              >
                <ListChecks size={16} /> Add products
              </button>
            </div>
          ) : (
            <PriceGrid
              rows={rows}
              cols={displayCols}
              dirty={dirty}
              setCell={setCell}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onLoadMore={() => nextCursor && void loadWorkspace(false, nextCursor)}
              onListsChanged={() => void loadWorkspace(true)}
              onEditProducts={
                activeCol && !compare
                  ? () => openPicker({ id: activeCol.id, name: activeCol.name })
                  : undefined
              }
              selectedProductIds={selectedProductIds}
              onSelectedProductIdsChange={setSelectedProductIds}
              compareMode={compare}
            />
          )}
        </>
      )}

      {tab === 'assignments' && (
        <AssignmentMatrix
          priceLists={cols}
          onReloadLists={() => void loadWorkspace(true)}
          onOpenExplain={(customerId) => {
            setExplainCustomerId(customerId);
            setExplainProductId(rows[0]?.id ?? null);
            setExplainOpen(true);
          }}
          onReviewConflicts={() => { setCompare(true); setTab('prices'); }}
        />
      )}

      {tab === 'history' && <PublishHistoryTab onRollbackDone={() => void loadWorkspace(true)} />}

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setImportOpen(false)} aria-hidden />
          <div className="relative bg-white rounded-[16px] shadow-xl w-full max-w-md p-6 space-y-4" role="dialog" aria-label="Import prices from CSV">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold text-[#181725]">Import prices from a file</h2>
                <p className="text-[12px] text-[#7C7C7C] mt-0.5">Prices land in your draft first — nothing goes live until you Review &amp; publish.</p>
              </div>
              <button type="button" onClick={() => setImportOpen(false)} className="p-1.5 rounded-lg hover:bg-[#FAF7F2]" aria-label="Close import"><X size={18} /></button>
            </div>
            <ol className="space-y-3 text-[13px]">
              <li>
                <span className="font-bold text-[#181725]">1. Which price list should these prices go into?</span>
                <select aria-label="Import target list" value={importListId ?? ''} onChange={(e) => { setImportListId(e.target.value); setImportPreview(null); }} className="mt-1.5 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] bg-white">
                  {cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </li>
              <li>
                <span className="font-bold text-[#181725]">2. Download the ready-made sheet, edit “New Price”, save as CSV</span>
                <button type="button" onClick={downloadImportTemplate} className="mt-1.5 w-full h-11 rounded-[12px] border border-primary text-primary font-semibold flex items-center justify-center gap-2 hover:bg-[#F8E8EC]">
                  <FileDown size={16} /> Download template for this list
                </button>
              </li>
              <li>
                <span className="font-bold text-[#181725]">3. Upload your filled sheet</span>
                <button type="button" onClick={() => importRef.current?.click()} className="mt-1.5 w-full h-11 rounded-[12px] border border-[#E9E3DD] bg-white font-semibold flex items-center justify-center gap-2">
                  <Upload size={16} /> Choose CSV file
                </button>
                <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
              </li>
            </ol>
            {importPreview && (
              <div className="p-3 rounded-[12px] bg-[#FAF7F2] border border-[#E9E3DD] text-[13px]">
                <p className="font-semibold text-[#181725]">{importPreview.fileName}</p>
                <p className="tabular-nums mt-1"><span className="text-green-700 font-bold">{importPreview.matched} prices ready</span>{importPreview.unmatched > 0 && <span className="text-amber-700"> · {importPreview.unmatched} rows skipped (product not matched by SKU/Product name, or price blank)</span>}</p>
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setImportOpen(false)} className="flex-1 h-11 rounded-[12px] border border-[#E9E3DD] font-semibold">Cancel</button>
              <button type="button" disabled={!importPreview || importPreview.matched === 0} onClick={applyImportPreview} className="flex-1 h-11 rounded-[12px] bg-primary text-white font-semibold disabled:opacity-50">Add to draft</button>
            </div>
          </div>
        </div>
      )}

      <ReviewPublishDrawer
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        dirty={dirty}
        baseVersion={draftBaseVersion}
        onPublished={handlePublished}
      />

      <NewPriceListModal
        open={newListOpen}
        onClose={() => setNewListOpen(false)}
        onCreated={(list) => {
          setActiveListId(list.id);
          void loadWorkspace(true);
          // Cloned lists already have products; still open picker so the
          // vendor can tweak membership. Empty lists need the picker.
          setPicker({ listId: list.id, listName: list.name });
        }}
        existingLists={cols}
      />

      <ProductPickerModal
        open={!!picker}
        listId={picker?.listId ?? null}
        listName={picker?.listName ?? ''}
        onClose={() => setPicker(null)}
        onSaved={() => {
          setPicker(null);
          void loadWorkspace(true);
        }}
      />

      <WhyThisPriceDrawer
        open={explainOpen}
        onClose={() => setExplainOpen(false)}
        customerId={explainCustomerId}
        productId={explainProductId}
        productLabel={rows.find((r) => r.id === explainProductId)?.name}
        products={rows}
        onCustomerChange={setExplainCustomerId}
        onProductChange={setExplainProductId}
      />
    </div>
  );
}
