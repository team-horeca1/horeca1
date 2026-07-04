'use client';

/**
 * BulkEngineDrawer — the unified Bulk Update Engine slide-over.
 * -------------------------------------------------------------
 * One config-driven right-side drawer shared by the vendor and admin product
 * pages (same pattern as ProductImportModal). The whole point is to make bulk
 * editing feel simple instead of overwhelming:
 *
 *   1. TARGET   — who gets edited: ticked rows ("Pick items") or "Match by rule"
 *                 (category / brand / status / price-range / tag, matched client-
 *                 side against the already-loaded list).
 *   2. ACTION   — pick ONE job from a tile grid (never a 20-field wall).
 *   3. CONFIGURE— a focused panel for just that job.
 *   4. PREVIEW  — before→after on a sample (server dry-run for price/GST/offer).
 *   5. APPLY    — count-stated confirm, then a result summary.
 *
 * Every action resolves the target to a concrete productIds[] and calls the
 * relevant endpoint. Vendor-owned actions (customer pricing, combo) are gated
 * by the config so admin only shows them when scoped to a single vendor.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  X, Filter, CheckSquare, IndianRupee, Percent, Power, CreditCard, Star,
  Boxes, BadgePercent, Users, Combine, Tag, Loader2, Sparkles, ArrowRight,
  AlertCircle, ChevronLeft, BadgeCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';

/* ─── Public types ──────────────────────────────────────────────────────── */

export interface BulkProduct {
  id: string;
  name: string;
  categoryId?: string | null;
  brand?: string | null;
  isActive: boolean;
  basePrice: number;
  tags?: string[] | null;
  vendorId?: string | null;
  imageUrl?: string | null;
}

export interface BulkEngineConfig {
  portal: 'vendor' | 'admin';
  endpoints: {
    bulkUpdate: string;                              // PATCH products bulk-update
    stockBulk: string;                               // POST stock bulk
    priceLists?: string;                             // GET price lists (vendor)
    priceListBulkApply?: (listId: string) => string; // POST price-list bulk-apply (vendor)
    combos?: string;                                 // POST combos (vendor)
  };
  categories: { id: string; name: string }[];
  brands: { name: string }[];
  vendors?: { id: string; businessName: string }[]; // admin only
  enableCustomerPricing: boolean;
  enableCombo: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  config: BulkEngineConfig;
  allProducts: BulkProduct[];
  selectedIds: string[];
}

/* ─── Action registry ───────────────────────────────────────────────────── */

type ActionKey =
  | 'price' | 'gst' | 'offer' | 'customer'
  | 'stock' | 'status' | 'credit' | 'featured'
  | 'category' | 'combo';

interface ActionMeta {
  key: ActionKey;
  label: string;
  hint: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  group: 'Pricing & offers' | 'Stock & status' | 'Catalog';
}

const ACTIONS: ActionMeta[] = [
  { key: 'price',    label: 'Price',          hint: 'Increase, reduce or set ₹',   icon: IndianRupee,  group: 'Pricing & offers' },
  { key: 'gst',      label: 'GST %',          hint: 'Correct tax rate',            icon: Percent,      group: 'Pricing & offers' },
  { key: 'offer',    label: 'Offer / deal',   hint: 'Deal price + time window',    icon: BadgePercent, group: 'Pricing & offers' },
  { key: 'customer', label: 'Customer price', hint: 'Price for a customer list',   icon: Users,        group: 'Pricing & offers' },
  { key: 'stock',    label: 'Stock',          hint: 'Set, add or remove units',    icon: Boxes,        group: 'Stock & status' },
  { key: 'status',   label: 'Active status',  hint: 'Enable / seasonal disable',   icon: Power,        group: 'Stock & status' },
  { key: 'credit',   label: 'Credit',         hint: 'Mark eligible / not',         icon: CreditCard,   group: 'Stock & status' },
  { key: 'featured', label: 'Featured',       hint: 'Show / hide as featured',     icon: Star,         group: 'Stock & status' },
  { key: 'category', label: 'Category & tags',hint: 'Re-assign category / tags',   icon: Tag,          group: 'Catalog' },
  { key: 'combo',    label: 'Combo / bundle', hint: 'Bundle items at a combo ₹',   icon: Combine,      group: 'Catalog' },
];

/* ─── Styling primitives ────────────────────────────────────────────────── */

const inputCls = 'w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] font-medium outline-none focus:border-[#299E60]/40 focus:ring-2 focus:ring-[#299E60]/10 bg-[#FAFAFA] focus:bg-white transition-all';
const selectCls = inputCls;
const inr = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/* ─── Config state ──────────────────────────────────────────────────────── */

type PriceMode = '' | 'incPct' | 'decPct' | 'setExact' | 'incAmt' | 'decAmt';
interface PreviewData { matched: number; sample: { id: string; name: string; before: Record<string, string | number | null>; after: Record<string, string | number | null> }[] }
interface PriceListOpt { id: string; name: string }

const blank = {
  price:    { mode: '' as PriceMode, value: '', applyToSlabs: false, mrpMode: '' as PriceMode, mrpValue: '' },
  gst:      { value: '' },
  offer:    { mode: '' as '' | 'setPrice' | 'percentOff' | 'clear', value: '', startTime: '', endTime: '', applyToSlabs: false },
  stock:    { mode: '' as '' | 'set' | 'increase' | 'decrease', value: '', threshold: '' },
  status:   { value: 'active' as 'active' | 'inactive', offFrom: '', offTo: '' },
  credit:   { value: 'yes' as 'yes' | 'no' },
  featured: { value: 'yes' as 'yes' | 'no' },
  category: { categoryIds: [] as string[], replaceTags: false, tags: '' },
  customer: { listId: '', type: 'percent' as 'percent' | 'discount' | 'set', value: '' },
  combo:    { name: '', comboPrice: '', validFrom: '', validTo: '' },
};

function mapAdjust(mode: PriceMode, value: string) {
  const v = Number(value);
  switch (mode) {
    case 'incPct':   return { type: 'percent', value: v };
    case 'decPct':   return { type: 'percent', value: -v };
    case 'setExact': return { type: 'set', value: v };
    case 'incAmt':   return { type: 'fixed', value: v };
    case 'decAmt':   return { type: 'fixed', value: -v };
    default:         return null;
  }
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function BulkEngineDrawer({ open, onClose, onComplete, config, allProducts, selectedIds }: Props) {
  const confirm = useConfirm();

  const [targetMode, setTargetMode] = useState<'pick' | 'rule' | 'sku'>('pick');
  const [rule, setRule] = useState({ categoryId: '', brand: '', status: '', minPrice: '', maxPrice: '', tag: '', vendorId: '' });
  const [skuPaste, setSkuPaste] = useState('');
  const [action, setAction] = useState<ActionKey | null>(null);
  const [cfg, setCfg] = useState(structuredClone(blank));

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ updated: number; label: string } | null>(null);
  const [priceLists, setPriceLists] = useState<PriceListOpt[]>([]);

  // Reset on open. Default to "Pick items" when rows are ticked, else rule.
  useEffect(() => {
    if (!open) return;
    setTargetMode(selectedIds.length > 0 ? 'pick' : 'rule');
    setRule({ categoryId: '', brand: '', status: '', minPrice: '', maxPrice: '', tag: '', vendorId: '' });
    setSkuPaste('');
    setAction(null);
    setCfg(structuredClone(blank));
    setPreview(null);
    setResult(null);
  }, [open, selectedIds.length]);

  // Client-side rule matching against the already-loaded list.
  const ruleIds = useMemo(() => allProducts.filter((p) => {
    if (rule.categoryId && p.categoryId !== rule.categoryId) return false;
    if (rule.brand && (p.brand ?? '') !== rule.brand) return false;
    if (rule.status === 'active' && !p.isActive) return false;
    if (rule.status === 'inactive' && p.isActive) return false;
    if (rule.minPrice && p.basePrice < Number(rule.minPrice)) return false;
    if (rule.maxPrice && p.basePrice > Number(rule.maxPrice)) return false;
    if (rule.tag && !(p.tags ?? []).some((t) => t.toLowerCase().includes(rule.tag.toLowerCase()))) return false;
    if (rule.vendorId && p.vendorId !== rule.vendorId) return false;
    return true;
  }).map((p) => p.id), [allProducts, rule]);

  const skuList = useMemo(
    () => skuPaste.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 500),
    [skuPaste],
  );

  const targetIds = useMemo(
    () => (targetMode === 'pick' ? selectedIds : targetMode === 'rule' ? ruleIds : []).slice(0, 500),
    [targetMode, selectedIds, ruleIds],
  );
  const overCap = targetMode === 'sku'
    ? skuList.length > 500
    : (targetMode === 'pick' ? selectedIds.length : ruleIds.length) > 500;
  const targetProducts = useMemo(() => {
    const set = new Set(targetIds);
    return allProducts.filter((p) => set.has(p.id));
  }, [allProducts, targetIds]);
  const count = targetMode === 'sku' ? skuList.length : targetIds.length;

  // Load price lists when the customer-pricing panel opens.
  useEffect(() => {
    if (action !== 'customer' || !config.endpoints.priceLists || priceLists.length > 0) return;
    fetch(config.endpoints.priceLists)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) return;
        const arr = Array.isArray(j.data) ? j.data : (j.data?.priceLists ?? []);
        setPriceLists(arr.map((l: { id: string; name: string }) => ({ id: l.id, name: l.name })));
      })
      .catch(() => {});
  }, [action, config.endpoints.priceLists, priceLists.length]);

  /* ── Build the product-bulk-update `set` block for the current action ── */
  const buildSet = useCallback((): Record<string, unknown> | null => {
    const set: Record<string, unknown> = {};
    if (action === 'price') {
      const base = mapAdjust(cfg.price.mode, cfg.price.value);
      if (base) { set.basePrice = base; if (cfg.price.applyToSlabs) set.applyToSlabs = true; }
      const mrp = mapAdjust(cfg.price.mrpMode, cfg.price.mrpValue);
      if (mrp) set.originalPrice = mrp;
      return Object.keys(set).length ? set : null;
    }
    if (action === 'gst') return cfg.gst.value !== '' ? { taxPercent: Number(cfg.gst.value) } : null;
    if (action === 'status') {
      const out: Record<string, unknown> = { isActive: cfg.status.value === 'active' };
      if (cfg.status.value === 'inactive' && cfg.status.offFrom && cfg.status.offTo) {
        out.seasonalOffFrom = cfg.status.offFrom;
        out.seasonalOffTo = cfg.status.offTo;
      }
      return out;
    }
    if (action === 'credit') return { creditEligible: cfg.credit.value === 'yes' };
    if (action === 'featured') return { isFeatured: cfg.featured.value === 'yes' };
    if (action === 'offer') {
      if (!cfg.offer.mode) return null;
      if (cfg.offer.mode === 'clear') return { offer: { mode: 'clear', applyToSlabs: cfg.offer.applyToSlabs } };
      if (cfg.offer.value === '') return null;
      return {
        offer: {
          mode: cfg.offer.mode,
          value: Number(cfg.offer.value),
          startTime: cfg.offer.startTime || null,
          endTime: cfg.offer.endTime || null,
          applyToSlabs: cfg.offer.applyToSlabs,
        },
      };
    }
    if (action === 'category') {
      if (cfg.category.categoryIds.length) set.categoryIds = cfg.category.categoryIds;
      if (cfg.category.replaceTags) set.tags = cfg.category.tags.split(',').map((t) => t.trim()).filter(Boolean);
      return Object.keys(set).length ? set : null;
    }
    return null;
  }, [action, cfg]);

  // Actions that get a real server dry-run (numeric transforms).
  const wantsServerPreview = action === 'price' || action === 'gst' || action === 'offer';

  // Debounced preview for transform actions.
  useEffect(() => {
    if (!open || !wantsServerPreview || count === 0) { setPreview(null); return; }
    const set = buildSet();
    if (!set) { setPreview(null); return; }
    setPreviewing(true);
    const t = setTimeout(() => {
      fetch(`${config.endpoints.bulkUpdate}?mode=preview`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: { productIds: targetIds }, set }),
      })
        .then((r) => r.json())
        .then((j) => setPreview(j.success ? j.data : null))
        .catch(() => setPreview(null))
        .finally(() => setPreviewing(false));
    }, 400);
    return () => { clearTimeout(t); setPreviewing(false); };
  }, [open, wantsServerPreview, count, buildSet, targetIds, config.endpoints.bulkUpdate]);

  /* ── Apply ──────────────────────────────────────────────────────────── */

  const canApply = useMemo(() => {
    if (count === 0 || !action) return false;
    switch (action) {
      case 'price':    return !!mapAdjust(cfg.price.mode, cfg.price.value) || !!mapAdjust(cfg.price.mrpMode, cfg.price.mrpValue);
      case 'gst':      return cfg.gst.value !== '';
      case 'offer':    return cfg.offer.mode === 'clear' || (!!cfg.offer.mode && cfg.offer.value !== '');
      case 'stock':    return (!!cfg.stock.mode && cfg.stock.value !== '') || cfg.stock.threshold !== '';
      case 'status': case 'credit': case 'featured': return true;
      case 'category': return cfg.category.categoryIds.length > 0 || (cfg.category.replaceTags);
      case 'customer': return !!cfg.customer.listId && cfg.customer.value !== '';
      case 'combo':    return !!cfg.combo.name && cfg.combo.comboPrice !== '' && count >= 1;
      default:         return false;
    }
  }, [action, cfg, count]);

  const actionLabel = ACTIONS.find((a) => a.key === action)?.label ?? '';

  const handleApply = async () => {
    if (!action || !canApply) return;
    const ok = await confirm({
      title: `Apply to ${count} product${count !== 1 ? 's' : ''}?`,
      message: action === 'combo'
        ? `This creates a new combo from the ${count} selected products. Continue?`
        : 'This change is permanent and applies to every product in the target. Continue?',
      confirmText: 'Apply',
      tone: 'primary',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      let updated = 0;

      if (action === 'stock') {
        const res = await fetch(config.endpoints.stockBulk, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productIds: targetIds,
            mode: cfg.stock.mode || undefined,
            value: cfg.stock.value !== '' ? Number(cfg.stock.value) : undefined,
            lowStockThreshold: cfg.stock.threshold !== '' ? Number(cfg.stock.threshold) : undefined,
          }),
        });
        const j = await res.json();
        if (!j.success) throw new Error(j.error?.message || 'Stock update failed');
        updated = j.updated ?? count;
      } else if (action === 'customer') {
        const url = config.endpoints.priceListBulkApply?.(cfg.customer.listId);
        if (!url) throw new Error('Customer pricing not available');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds: targetIds, action: { type: cfg.customer.type, value: Number(cfg.customer.value) } }),
        });
        const j = await res.json();
        if (!j.success) throw new Error(j.error?.message || 'Customer pricing failed');
        updated = j.data?.upserted ?? count;
      } else if (action === 'combo') {
        if (!config.endpoints.combos) throw new Error('Combos not available');
        const res = await fetch(config.endpoints.combos, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: cfg.combo.name,
            comboPrice: Number(cfg.combo.comboPrice),
            validFrom: cfg.combo.validFrom || null,
            validTo: cfg.combo.validTo || null,
            items: targetIds.map((id) => ({ productId: id, qty: 1 })),
          }),
        });
        const j = await res.json();
        if (!j.success) throw new Error(j.error?.message || 'Combo creation failed');
        updated = count;
      } else {
        const set = buildSet();
        if (!set) throw new Error('Nothing to change');
        const filter = targetMode === 'sku'
          ? { skus: skuList }
          : { productIds: targetIds };
        const res = await fetch(config.endpoints.bulkUpdate, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter, set }),
        });
        const j = await res.json();
        if (!j.success) throw new Error(j.error?.message || 'Bulk update failed');
        updated = j.data?.updated ?? count;
      }

      setResult({ updated, label: actionLabel });
      toast.success(`${actionLabel}: ${updated} product${updated !== 1 ? 's' : ''} updated`);
      onComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk action failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const availableActions = ACTIONS.filter((a) => {
    if (a.key === 'customer') return config.enableCustomerPricing;
    if (a.key === 'combo') return config.enableCombo;
    return true;
  });
  const groups = ['Pricing & offers', 'Stock & status', 'Catalog'] as const;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[10010] animate-in fade-in duration-200" onClick={submitting ? undefined : onClose} />
      <div className="fixed inset-y-0 right-0 z-[10011] w-full max-w-[520px] bg-[#F8F9FB] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#EEEEEE] shrink-0">
          <div className="flex items-center gap-3">
            {action && !result && (
              <button onClick={() => { setAction(null); setPreview(null); }} className="w-9 h-9 rounded-[10px] flex items-center justify-center hover:bg-[#F8F9FB] text-[#7C7C7C]">
                <ChevronLeft size={18} />
              </button>
            )}
            <div className="w-9 h-9 rounded-[10px] bg-[#ECFDF5] flex items-center justify-center">
              <Sparkles size={18} className="text-[#299E60]" />
            </div>
            <div>
              <h2 className="text-[16px] font-[900] text-[#181725] leading-tight">
                {result ? 'Done' : action ? actionLabel : 'Bulk Update Engine'}
              </h2>
              <p className="text-[11.5px] text-[#7C7C7C] font-semibold">
                {result ? 'Changes applied' : `${count} product${count !== 1 ? 's' : ''} in target`}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={submitting} className="w-9 h-9 rounded-[10px] flex items-center justify-center hover:bg-[#F8F9FB] text-[#7C7C7C] hover:text-[#181725]">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {result ? (
            <ResultPanel result={result} onAnother={() => { setAction(null); setPreview(null); setResult(null); }} onClose={onClose} />
          ) : (
            <>
              {/* Target strip */}
              <div className="bg-white rounded-[14px] border border-[#EEEEEE] p-4 shadow-sm">
                <div className="flex gap-2 mb-3 flex-wrap">
                  <TargetTab active={targetMode === 'pick'} onClick={() => setTargetMode('pick')} icon={CheckSquare} label={`Pick items (${selectedIds.length})`} />
                  <TargetTab active={targetMode === 'rule'} onClick={() => setTargetMode('rule')} icon={Filter} label="Match by rule" />
                  <TargetTab active={targetMode === 'sku'} onClick={() => setTargetMode('sku')} icon={Tag} label="SKU list" />
                </div>
                {targetMode === 'pick' ? (
                  <p className="text-[12px] font-semibold text-[#7C7C7C]">
                    {selectedIds.length === 0
                      ? 'No rows ticked. Close, tick products in the table, then re-open — or switch to “Match by rule”.'
                      : `${selectedIds.length} row${selectedIds.length !== 1 ? 's' : ''} ticked in the table.`}
                  </p>
                ) : targetMode === 'sku' ? (
                  <div>
                    <p className="text-[12px] font-semibold text-[#7C7C7C] mb-2">Paste SKUs or vendor SKUs (one per line or comma-separated)</p>
                    <textarea
                      value={skuPaste}
                      onChange={(e) => setSkuPaste(e.target.value)}
                      rows={4}
                      placeholder="SKU-001&#10;SKU-002"
                      className="w-full border border-[#EEEEEE] rounded-[10px] px-3 py-2 text-[13px] font-medium outline-none focus:border-[#299E60]/40 bg-[#FAFAFA]"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    {config.vendors && (
                      <select value={rule.vendorId} onChange={(e) => setRule({ ...rule, vendorId: e.target.value })} className={cn(selectCls, 'col-span-2')}>
                        <option value="">Any vendor</option>
                        {config.vendors.map((v) => <option key={v.id} value={v.id}>{v.businessName}</option>)}
                      </select>
                    )}
                    <select value={rule.categoryId} onChange={(e) => setRule({ ...rule, categoryId: e.target.value })} className={selectCls}>
                      <option value="">Any category</option>
                      {config.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select value={rule.brand} onChange={(e) => setRule({ ...rule, brand: e.target.value })} className={selectCls}>
                      <option value="">Any brand</option>
                      {config.brands.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                    </select>
                    <select value={rule.status} onChange={(e) => setRule({ ...rule, status: e.target.value })} className={selectCls}>
                      <option value="">Any status</option>
                      <option value="active">Active only</option>
                      <option value="inactive">Inactive only</option>
                    </select>
                    <input value={rule.tag} onChange={(e) => setRule({ ...rule, tag: e.target.value })} placeholder="Tag contains…" className={inputCls} />
                    <input type="number" value={rule.minPrice} onChange={(e) => setRule({ ...rule, minPrice: e.target.value })} placeholder="Min ₹" className={inputCls} />
                    <input type="number" value={rule.maxPrice} onChange={(e) => setRule({ ...rule, maxPrice: e.target.value })} placeholder="Max ₹" className={inputCls} />
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-[#F5F5F5] flex items-center justify-between">
                  <span className={cn('text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-[8px]',
                    count > 0 ? 'text-[#299E60] bg-[#EEF8F1]' : 'text-amber-700 bg-amber-50')}>
                    {count} product{count !== 1 ? 's' : ''} targeted
                  </span>
                  {overCap && <span className="text-[10.5px] font-bold text-amber-700 flex items-center gap-1"><AlertCircle size={12} /> capped at 500</span>}
                </div>
              </div>

              {/* Action grid OR configure panel */}
              {!action ? (
                <div className="space-y-4">
                  {groups.map((g) => {
                    const items = availableActions.filter((a) => a.group === g);
                    if (!items.length) return null;
                    return (
                      <div key={g}>
                        <p className="text-[10.5px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-2 px-1">{g}</p>
                        <div className="grid grid-cols-2 gap-2.5">
                          {items.map((a) => (
                            <button
                              key={a.key}
                              disabled={count === 0}
                              onClick={() => setAction(a.key)}
                              className="text-left bg-white border border-[#EEEEEE] rounded-[12px] p-3.5 hover:border-[#299E60]/40 hover:shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
                            >
                              <a.icon size={18} className="text-[#299E60] mb-2" />
                              <p className="text-[13px] font-bold text-[#181725] leading-none">{a.label}</p>
                              <p className="text-[11px] text-[#AEAEAE] font-medium mt-1">{a.hint}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white rounded-[14px] border border-[#EEEEEE] p-4 shadow-sm space-y-4">
                  <ConfigPanel action={action} cfg={cfg} setCfg={setCfg} config={config} priceLists={priceLists} targetProducts={targetProducts} />
                  {wantsServerPreview && (
                    <PreviewBlock previewing={previewing} preview={preview} />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {action && !result && (
          <div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-white border-t border-[#EEEEEE] shrink-0">
            <button onClick={() => { setAction(null); setPreview(null); }} disabled={submitting} className="h-[42px] px-5 text-[13px] font-bold text-[#7C7C7C] hover:text-[#181725]">Back</button>
            <button
              onClick={handleApply}
              disabled={submitting || !canApply}
              className="h-[42px] px-7 bg-[#299E60] hover:bg-[#238a54] disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-[12px] text-[13px] font-bold flex items-center gap-2 shadow-sm transition-colors"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              {submitting ? 'Applying…' : `Apply to ${count}`}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function TargetTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ size?: number; className?: string }>; label: string }) {
  return (
    <button onClick={onClick} className={cn('flex-1 h-[36px] rounded-[10px] text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all',
      active ? 'bg-[#299E60] text-white shadow-sm' : 'bg-[#F8F9FB] border border-[#EEEEEE] text-[#7C7C7C] hover:bg-[#F0F0F0]')}>
      <Icon size={13} /> {label}
    </button>
  );
}

function PreviewBlock({ previewing, preview }: { previewing: boolean; preview: PreviewData | null }) {
  if (previewing) {
    return <div className="flex items-center gap-2 text-[12px] font-semibold text-[#7C7C7C] pt-2 border-t border-[#F5F5F5]"><Loader2 size={13} className="animate-spin text-[#299E60]" /> Calculating preview…</div>;
  }
  if (!preview || preview.sample.length === 0) return null;
  const keys = Object.keys(preview.sample[0].before);
  return (
    <div className="pt-3 border-t border-[#F5F5F5]">
      <p className="text-[10.5px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-2">Preview · before → after</p>
      <div className="space-y-1.5">
        {preview.sample.map((s) => (
          <div key={s.id} className="text-[12px] flex items-center justify-between gap-2 bg-[#FAFAFA] rounded-[8px] px-2.5 py-1.5">
            <span className="font-semibold text-[#181725] truncate flex-1">{s.name}</span>
            <span className="font-bold text-[#7C7C7C] tabular-nums whitespace-nowrap">
              {keys.map((k) => (
                <span key={k} className="ml-2">
                  {fmt(s.before[k])} <span className="text-[#299E60]">→</span> {fmt(s.after[k])}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
      {preview.matched > preview.sample.length && (
        <p className="text-[11px] text-[#AEAEAE] font-medium mt-2">…and {preview.matched - preview.sample.length} more.</p>
      )}
    </div>
  );
}

function fmt(v: string | number | null): string {
  if (v === null) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return v;
}

function ResultPanel({ result, onAnother, onClose }: { result: { updated: number; label: string }; onAnother: () => void; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center text-center py-10 gap-4">
      <div className="w-16 h-16 rounded-full bg-[#EBFDF2] border border-[#299E60]/10 flex items-center justify-center">
        <BadgeCheck size={32} className="text-[#299E60]" />
      </div>
      <div>
        <h3 className="text-[20px] font-black text-[#181725]">{result.updated} updated</h3>
        <p className="text-[13px] text-[#7C7C7C] font-semibold mt-1">{result.label} applied successfully.</p>
      </div>
      <div className="flex items-center gap-2.5 mt-2">
        <button onClick={onAnother} className="h-[42px] px-5 border border-[#EEEEEE] hover:bg-[#F8F9FB] rounded-[12px] text-[13px] font-bold text-[#181725]">Do another</button>
        <button onClick={onClose} className="h-[42px] px-7 bg-[#181725] hover:bg-black text-white rounded-[12px] text-[13px] font-bold">Close</button>
      </div>
    </div>
  );
}

/* ─── Per-action config panels ──────────────────────────────────────────── */

type Cfg = typeof blank;

function ConfigPanel({ action, cfg, setCfg, config, priceLists, targetProducts }: {
  action: ActionKey;
  cfg: Cfg;
  setCfg: React.Dispatch<React.SetStateAction<Cfg>>;
  config: BulkEngineConfig;
  priceLists: PriceListOpt[];
  targetProducts: BulkProduct[];
}) {
  const up = <K extends keyof Cfg>(key: K, patch: Partial<Cfg[K]>) => setCfg((p) => ({ ...p, [key]: { ...p[key], ...patch } }) as Cfg);

  if (action === 'price') {
    return (
      <>
        <Field label="Base price">
          <div className="grid grid-cols-2 gap-2">
            {(['incPct', 'decPct', 'setExact', 'incAmt', 'decAmt'] as PriceMode[]).map((m) => (
              <Chip key={m} active={cfg.price.mode === m} onClick={() => up('price', { mode: cfg.price.mode === m ? '' : m })} label={priceModeLabel(m)} />
            ))}
          </div>
          {cfg.price.mode && (
            <input type="number" step="0.01" value={cfg.price.value} onChange={(e) => up('price', { value: e.target.value })}
              placeholder={cfg.price.mode.includes('Pct') ? 'e.g. 5' : 'e.g. 120'} className={cn(inputCls, 'mt-2')} autoFocus />
          )}
          <label className="flex items-center gap-2 text-[12px] font-semibold text-[#181725] mt-2.5 cursor-pointer">
            <input type="checkbox" checked={cfg.price.applyToSlabs} onChange={(e) => up('price', { applyToSlabs: e.target.checked })} className="w-4 h-4 rounded text-[#299E60]" />
            Also adjust every bulk price slab
          </label>
        </Field>
        <Field label="MRP / strikethrough (optional)">
          <div className="grid grid-cols-2 gap-2">
            {(['incPct', 'decPct', 'setExact'] as PriceMode[]).map((m) => (
              <Chip key={m} active={cfg.price.mrpMode === m} onClick={() => up('price', { mrpMode: cfg.price.mrpMode === m ? '' : m })} label={priceModeLabel(m)} />
            ))}
          </div>
          {cfg.price.mrpMode && (
            <input type="number" step="0.01" value={cfg.price.mrpValue} onChange={(e) => up('price', { mrpValue: e.target.value })} placeholder="value" className={cn(inputCls, 'mt-2')} />
          )}
        </Field>
      </>
    );
  }

  if (action === 'gst') {
    return (
      <Field label="Set GST rate (%)">
        <div className="flex flex-wrap gap-2 mb-2">
          {['0', '5', '12', '18', '28'].map((g) => (
            <Chip key={g} active={cfg.gst.value === g} onClick={() => setCfg((p) => ({ ...p, gst: { value: g } }))} label={`${g}%`} />
          ))}
        </div>
        <input type="number" min="0" max="100" step="0.01" value={cfg.gst.value} onChange={(e) => setCfg((p) => ({ ...p, gst: { value: e.target.value } }))} placeholder="Custom %" className={inputCls} />
      </Field>
    );
  }

  if (action === 'offer') {
    return (
      <>
        <Field label="Deal type">
          <div className="grid grid-cols-3 gap-2">
            <Chip active={cfg.offer.mode === 'setPrice'} onClick={() => up('offer', { mode: 'setPrice' })} label="Set ₹" />
            <Chip active={cfg.offer.mode === 'percentOff'} onClick={() => up('offer', { mode: 'percentOff' })} label="% off" />
            <Chip active={cfg.offer.mode === 'clear'} onClick={() => up('offer', { mode: 'clear' })} label="Clear" />
          </div>
        </Field>
        {cfg.offer.mode && cfg.offer.mode !== 'clear' && (
          <Field label={cfg.offer.mode === 'percentOff' ? 'Percent off base price' : 'Deal price (₹)'}>
            <input type="number" step="0.01" value={cfg.offer.value} onChange={(e) => up('offer', { value: e.target.value })} placeholder={cfg.offer.mode === 'percentOff' ? 'e.g. 10' : 'e.g. 99'} className={inputCls} autoFocus />
          </Field>
        )}
        {cfg.offer.mode && cfg.offer.mode !== 'clear' && (
          <Field label="Daily window (optional, 24h)">
            <div className="flex items-center gap-2">
              <input type="time" value={cfg.offer.startTime} onChange={(e) => up('offer', { startTime: e.target.value })} className={inputCls} />
              <span className="text-[#AEAEAE] text-[12px] font-bold">to</span>
              <input type="time" value={cfg.offer.endTime} onChange={(e) => up('offer', { endTime: e.target.value })} className={inputCls} />
            </div>
          </Field>
        )}
        <label className="flex items-center gap-2 text-[12px] font-semibold text-[#181725] cursor-pointer">
          <input type="checkbox" checked={cfg.offer.applyToSlabs} onChange={(e) => up('offer', { applyToSlabs: e.target.checked })} className="w-4 h-4 rounded text-[#299E60]" />
          {cfg.offer.mode === 'clear' ? 'Also clear slab promos' : 'Also set slab promo prices'}
        </label>
      </>
    );
  }

  if (action === 'stock') {
    return (
      <>
        <Field label="Stock change">
          <div className="grid grid-cols-3 gap-2">
            <Chip active={cfg.stock.mode === 'set'} onClick={() => up('stock', { mode: 'set' })} label="Set to" />
            <Chip active={cfg.stock.mode === 'increase'} onClick={() => up('stock', { mode: 'increase' })} label="Add" />
            <Chip active={cfg.stock.mode === 'decrease'} onClick={() => up('stock', { mode: 'decrease' })} label="Remove" />
          </div>
          {cfg.stock.mode && (
            <input type="number" min="0" step="1" value={cfg.stock.value} onChange={(e) => up('stock', { value: e.target.value })} placeholder="units" className={cn(inputCls, 'mt-2')} autoFocus />
          )}
        </Field>
        <Field label="Low-stock threshold (optional)">
          <input type="number" min="0" step="1" value={cfg.stock.threshold} onChange={(e) => up('stock', { threshold: e.target.value })} placeholder="e.g. 10" className={inputCls} />
        </Field>
      </>
    );
  }

  if (action === 'status') {
    return (
      <>
        <Field label="Set active status">
          <div className="grid grid-cols-2 gap-2">
            <Chip active={cfg.status.value === 'active'} onClick={() => setCfg((p) => ({ ...p, status: { ...p.status, value: 'active' } }))} label="Active" />
            <Chip active={cfg.status.value === 'inactive'} onClick={() => setCfg((p) => ({ ...p, status: { ...p.status, value: 'inactive' } }))} label="Inactive (seasonal)" />
          </div>
        </Field>
        {cfg.status.value === 'inactive' && (
          <Field label="Seasonal off window (optional)">
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={cfg.status.offFrom} onChange={(e) => setCfg((p) => ({ ...p, status: { ...p.status, offFrom: e.target.value } }))} className={inputCls} />
              <input type="date" value={cfg.status.offTo} onChange={(e) => setCfg((p) => ({ ...p, status: { ...p.status, offTo: e.target.value } }))} className={inputCls} />
            </div>
            <p className="text-[11px] text-[#AEAEAE] font-medium mt-1">Products auto-deactivate when today falls in this range.</p>
          </Field>
        )}
      </>
    );
  }

  if (action === 'credit') {
    return (
      <Field label="Credit (DiSCCO) eligibility">
        <div className="grid grid-cols-2 gap-2">
          <Chip active={cfg.credit.value === 'yes'} onClick={() => setCfg((p) => ({ ...p, credit: { value: 'yes' } }))} label="Eligible" />
          <Chip active={cfg.credit.value === 'no'} onClick={() => setCfg((p) => ({ ...p, credit: { value: 'no' } }))} label="Not eligible" />
        </div>
      </Field>
    );
  }

  if (action === 'featured') {
    return (
      <Field label="Featured">
        <div className="grid grid-cols-2 gap-2">
          <Chip active={cfg.featured.value === 'yes'} onClick={() => setCfg((p) => ({ ...p, featured: { value: 'yes' } }))} label="Featured" />
          <Chip active={cfg.featured.value === 'no'} onClick={() => setCfg((p) => ({ ...p, featured: { value: 'no' } }))} label="Not featured" />
        </div>
      </Field>
    );
  }

  if (action === 'category') {
    return (
      <>
        <Field label="Replace category (leaf sub-category)">
          <select
            multiple
            value={cfg.category.categoryIds}
            onChange={(e) => up('category', { categoryIds: Array.from(e.target.selectedOptions).map((o) => o.value) })}
            className={cn(inputCls, 'h-auto min-h-[120px] py-2')}
          >
            {config.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="text-[11px] text-[#AEAEAE] font-medium mt-1">Ctrl/Cmd-click for multiple. Leave empty to keep current.</p>
        </Field>
        <label className="flex items-center gap-2 text-[12px] font-semibold text-[#181725] cursor-pointer">
          <input type="checkbox" checked={cfg.category.replaceTags} onChange={(e) => up('category', { replaceTags: e.target.checked })} className="w-4 h-4 rounded text-[#299E60]" />
          Replace tags
        </label>
        {cfg.category.replaceTags && (
          <input value={cfg.category.tags} onChange={(e) => up('category', { tags: e.target.value })} placeholder="comma,separated,tags" className={inputCls} />
        )}
      </>
    );
  }

  if (action === 'customer') {
    return (
      <>
        <Field label="Target price list">
          <select value={cfg.customer.listId} onChange={(e) => up('customer', { listId: e.target.value })} className={selectCls}>
            <option value="">— Select a price list —</option>
            {priceLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {priceLists.length === 0 && <p className="text-[11px] text-amber-700 font-medium mt-1">No price lists yet. Create one in the Price Lists section first.</p>}
        </Field>
        <Field label="Pricing">
          <div className="grid grid-cols-3 gap-2">
            <Chip active={cfg.customer.type === 'percent'} onClick={() => up('customer', { type: 'percent' })} label="% off base" />
            <Chip active={cfg.customer.type === 'discount'} onClick={() => up('customer', { type: 'discount' })} label="Discount %" />
            <Chip active={cfg.customer.type === 'set'} onClick={() => up('customer', { type: 'set' })} label="Set ₹" />
          </div>
          <input type="number" step="0.01" value={cfg.customer.value} onChange={(e) => up('customer', { value: e.target.value })}
            placeholder={cfg.customer.type === 'set' ? 'price ₹' : 'percent %'} className={cn(inputCls, 'mt-2')} />
        </Field>
      </>
    );
  }

  if (action === 'combo') {
    return (
      <>
        <Field label="Combo name">
          <input value={cfg.combo.name} onChange={(e) => up('combo', { name: e.target.value })} placeholder="e.g. Breakfast Combo" className={inputCls} autoFocus />
        </Field>
        <Field label="Combo price (₹)">
          <input type="number" step="0.01" value={cfg.combo.comboPrice} onChange={(e) => up('combo', { comboPrice: e.target.value })} placeholder="bundle price" className={inputCls} />
        </Field>
        <Field label="Valid window (optional)">
          <div className="flex items-center gap-2">
            <input type="date" value={cfg.combo.validFrom} onChange={(e) => up('combo', { validFrom: e.target.value })} className={inputCls} />
            <span className="text-[#AEAEAE] text-[12px] font-bold">to</span>
            <input type="date" value={cfg.combo.validTo} onChange={(e) => up('combo', { validTo: e.target.value })} className={inputCls} />
          </div>
        </Field>
        <div>
          <p className="text-[10.5px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-2">{targetProducts.length} items in this combo</p>
          <div className="space-y-1 max-h-[160px] overflow-y-auto">
            {targetProducts.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-[12px] bg-[#FAFAFA] rounded-[8px] px-2.5 py-1.5">
                <span className="font-semibold text-[#181725] truncate">{p.name}</span>
                <span className="text-[#AEAEAE] font-medium">{inr(p.basePrice)}</span>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return null;
}

function priceModeLabel(m: PriceMode): string {
  switch (m) {
    case 'incPct':   return 'Increase %';
    case 'decPct':   return 'Decrease %';
    case 'setExact': return 'Set exact ₹';
    case 'incAmt':   return 'Add ₹';
    case 'decAmt':   return 'Subtract ₹';
    default:         return '';
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wider mb-2">{label}</label>
      {children}
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('h-[36px] px-2 rounded-[9px] text-[12px] font-bold transition-all',
      active ? 'bg-[#299E60] text-white shadow-sm' : 'bg-[#F8F9FB] border border-[#EEEEEE] text-[#7C7C7C] hover:bg-[#F0F0F0]')}>
      {label}
    </button>
  );
}
