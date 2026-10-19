'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search,
  Loader2,
  Upload,
  Download,
  HelpCircle,
  Plus,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { PriceListCol, ProductRow } from './types';
import { useDraft } from './grid/useDraft';
import { PriceGrid } from './grid/PriceGrid';
import { ReviewPublishDrawer } from './ReviewPublishDrawer';
import { PublishHistoryTab } from './PublishHistoryTab';
import { WhyThisPriceDrawer } from './WhyThisPriceDrawer';
import { NewPriceListModal } from './NewPriceListModal';
import { AssignmentMatrix } from './assignments/AssignmentMatrix';

type TabId = 'prices' | 'assignments' | 'history';

export function PricingWorkspace() {
  const [tab, setTab] = useState<TabId>('prices');
  const [cols, setCols] = useState<PriceListCol[]>([]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [baseVersion, setBaseVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  const [reviewOpen, setReviewOpen] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainCustomerId, setExplainCustomerId] = useState<string | null>(null);
  const [explainProductId, setExplainProductId] = useState<string | null>(null);

  const importRef = useRef<HTMLInputElement>(null);
  const [importListId, setImportListId] = useState<string | null>(null);

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
  } = useDraft('me', baseVersion);

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

        const res = await fetch(`/api/v1/vendor/price-lists/workspace?${qs}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message || 'Failed to load');

        setCols(json.data.priceLists as PriceListCol[]);
        setBaseVersion(json.data.baseVersion ?? null);
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

  const handlePublished = () => {
    clearDirty();
    void loadWorkspace(true);
  };

  const exportMatrix = () => {
    const qs = new URLSearchParams();
    if (debounced) qs.set('search', debounced);
    window.open(`/api/v1/vendor/price-lists/workspace/export?${qs}`, '_blank');
  };

  const openImport = () => {
    if (cols.length === 0) {
      toast.error('Create a price list first');
      return;
    }
    setImportListId(cols[0]?.id ?? null);
    importRef.current?.click();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !importListId) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? '');
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        toast.error('CSV must include header + rows');
        return;
      }
      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
      const skuIdx = headers.findIndex((h) => h.toLowerCase() === 'sku');
      const priceIdx = headers.findIndex((h) => h.toLowerCase().includes('new price') || h.toLowerCase() === 'price');
      if (skuIdx === -1 || priceIdx === -1) {
        toast.error('CSV needs SKU and New Price columns');
        return;
      }
      let count = 0;
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
        const sku = parts[skuIdx];
        const price = parseFloat(parts[priceIdx]);
        if (!sku || Number.isNaN(price)) continue;
        const row = rows.find((r) => r.sku === sku);
        if (!row) continue;
        setCell(`${row.id}:${importListId}`, { price, isExcluded: false });
        count++;
      }
      toast.success(`Imported ${count} prices into draft`);
    };
    reader.readAsText(file);
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

  const tabs: { id: TabId; label: string }[] = [
    { id: 'prices', label: 'Prices' },
    { id: 'assignments', label: 'Who gets which list' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[clamp(1.25rem,2vw+0.5rem,1.75rem)] font-bold text-[#181725]">Pricing</h1>
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
              <span className="text-[12px] font-semibold text-[#181725] tabular-nums">
                {changeCount} unsaved
              </span>
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

        {cols.length > 0 && (
          <select
            value={importListId ?? cols[0]?.id}
            onChange={(e) => setImportListId(e.target.value)}
            className="h-9 px-2 text-[12px] rounded-[12px] border border-[#E9E3DD] bg-white max-w-xs"
            aria-label="Import target list"
          >
            {cols.map((c) => (
              <option key={c.id} value={c.id}>Import into: {c.name}</option>
            ))}
          </select>
        )}
        <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
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
          <div className="relative max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C7C7C]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product or SKU"
              className="w-full h-11 pl-9 pr-3 rounded-[12px] border border-[#E9E3DD] text-[13px] outline-none focus:border-primary"
            />
          </div>

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
          ) : (
            <PriceGrid
              rows={rows}
              cols={cols}
              dirty={dirty}
              setCell={setCell}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onLoadMore={() => nextCursor && void loadWorkspace(false, nextCursor)}
              onListsChanged={() => void loadWorkspace(true)}
              selectedProductIds={selectedProductIds}
              onSelectedProductIdsChange={setSelectedProductIds}
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
        />
      )}

      {tab === 'history' && <PublishHistoryTab onRollbackDone={() => void loadWorkspace(true)} />}

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
        onCreated={() => void loadWorkspace(true)}
        existingLists={cols}
      />

      <WhyThisPriceDrawer
        open={explainOpen}
        onClose={() => setExplainOpen(false)}
        customerId={explainCustomerId}
        productId={explainProductId}
        productLabel={rows.find((r) => r.id === explainProductId)?.name}
      />
    </div>
  );
}
