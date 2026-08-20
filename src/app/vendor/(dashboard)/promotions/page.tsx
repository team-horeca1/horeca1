'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Plus, Trash2, ToggleLeft, ToggleRight, Tag,
  Percent, IndianRupee, Gift, Calendar, X, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { VendorCouponsTab, VendorCashbackTab } from '@/components/features/vendor/promotions/PromoEngineTabs';
import {
  buildPromotionPayload,
  promotionPublishSuccessMessage,
  promotionStorefrontLabel,
  promotionIsLive,
} from '@/lib/promotionVendorUi';

// ─── Types ────────────────────────────────────────────────────────────────────

type PromoType = 'pct_discount' | 'flat_discount' | 'bxgy';

interface Promotion {
  id: string;
  name: string;
  type: PromoType;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  minOrderValue: string | null;
  minQty: number | null;
  buyProductId: string | null;
  discountPct: string | null;
  discountFlat: string | null;
  getProductId: string | null;
  getQty: number | null;
  usageLimit: number | null;
  usageCount: number;
  createdAt: string;
  buyProduct: { id: string; name: string } | null;
  getProduct: { id: string; name: string } | null;
}

interface VendorProduct {
  id: string;
  name: string;
  basePrice: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<PromoType, string> = {
  pct_discount: '% Discount',
  flat_discount: 'Flat Discount',
  bxgy: 'Buy X Get Y',
};

const TYPE_COLORS: Record<PromoType, string> = {
  pct_discount: 'bg-blue-50 text-blue-600',
  flat_discount: 'bg-[#EEF8F1] text-[#299E60]',
  bxgy: 'bg-purple-50 text-purple-600',
};

function promoDescription(p: Promotion) {
  if (p.type === 'pct_discount') {
    const min = p.minOrderValue ? ` on orders ≥ ₹${Number(p.minOrderValue).toFixed(0)}` : '';
    return `${Number(p.discountPct).toFixed(1)}% off${min}`;
  }
  if (p.type === 'flat_discount') {
    const min = p.minOrderValue ? ` on orders ≥ ₹${Number(p.minOrderValue).toFixed(0)}` : '';
    return `₹${Number(p.discountFlat).toFixed(0)} off${min}`;
  }
  if (p.type === 'bxgy') {
    return `Buy ${p.minQty ?? 1}× ${p.buyProduct?.name ?? '—'} → Get ${p.getQty ?? 1}× ${p.getProduct?.name ?? '—'} free`;
  }
  return '—';
}

function isLive(p: Promotion) {
  return promotionIsLive(p);
}

function fmt(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Product Search Hook ───────────────────────────────────────────────────────

function useProductSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VendorProduct[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/vendor/products?search=${encodeURIComponent(query)}&limit=8`);
        const json = await res.json();
        if (json.success) setResults(json.data.products ?? json.data ?? []);
      } finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  return { query, setQuery, results, loading };
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────

function PromotionModal({
  existing,
  onClose,
  onSaved,
}: {
  existing?: Promotion;
  onClose: () => void;
  onSaved: (p: Promotion) => void;
}) {
  const isEdit = !!existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<PromoType>(existing?.type ?? 'pct_discount');
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [startDate, setStartDate] = useState(existing?.startDate ? existing.startDate.slice(0, 10) : '');
  const [endDate, setEndDate] = useState(existing?.endDate ? existing.endDate.slice(0, 10) : '');
  const [minOrderValue, setMinOrderValue] = useState(existing?.minOrderValue ? String(Number(existing.minOrderValue).toFixed(0)) : '');
  const [discountPct, setDiscountPct] = useState(existing?.discountPct ? String(Number(existing.discountPct)) : '');
  const [discountFlat, setDiscountFlat] = useState(existing?.discountFlat ? String(Number(existing.discountFlat).toFixed(0)) : '');
  const [minQty, setMinQty] = useState(existing?.minQty ? String(existing.minQty) : '1');
  const [getQty, setGetQty] = useState(existing?.getQty ? String(existing.getQty) : '1');
  const [usageLimit, setUsageLimit] = useState(existing?.usageLimit ? String(existing.usageLimit) : '');
  const [saving, setSaving] = useState(false);

  // Buy product picker
  const buySearch = useProductSearch();
  const [buyProduct, setBuyProduct] = useState<VendorProduct | null>(
    existing?.buyProduct ? { id: existing.buyProduct.id, name: existing.buyProduct.name, basePrice: 0 } : null
  );

  // Get product picker
  const getSearch = useProductSearch();
  const [getProduct, setGetProduct] = useState<VendorProduct | null>(
    existing?.getProduct ? { id: existing.getProduct.id, name: existing.getProduct.name, basePrice: 0 } : null
  );

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = buildPromotionPayload({
        name,
        type,
        isActive,
        startDate,
        endDate,
        minOrderValue,
        discountPct,
        discountFlat,
        minQty,
        getQty,
        buyProductId: buyProduct?.id ?? null,
        getProductId: getProduct?.id ?? null,
        usageLimit,
      });

      const url = isEdit ? `/api/v1/vendor/promotions/${existing!.id}` : '/api/v1/vendor/promotions';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'Failed');
      toast.success(isEdit ? 'Promotion updated' : promotionPublishSuccessMessage(type));
      onSaved(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-[540px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F5F5F5] sticky top-0 bg-white z-10">
          <p className="text-[15px] font-bold text-[#181725]">{isEdit ? 'Edit Promotion' : 'New Promotion'}</p>
          <button onClick={onClose} className="p-1.5 rounded-[8px] hover:bg-[#F5F5F5]">
            <X size={15} className="text-[#7C7C7C]" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Promotion Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Summer Sale 10% Off"
              className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50"
            />
          </div>

          {/* Type */}
          {!isEdit && (
            <div>
              <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-2">Promotion Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['pct_discount', 'flat_discount', 'bxgy'] as PromoType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={cn(
                      'py-2.5 px-3 rounded-[10px] border text-[12px] font-semibold transition-colors text-center',
                      type === t ? 'border-[#299E60] bg-[#EEF8F1] text-[#299E60]' : 'border-[#EEEEEE] text-[#7C7C7C] hover:bg-[#F5F5F5]'
                    )}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Discount fields */}
          {type === 'pct_discount' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Discount %</label>
                <div className="relative">
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={discountPct}
                    onChange={e => setDiscountPct(e.target.value)}
                    className="w-full h-[40px] px-3 pr-8 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50"
                  />
                  <Percent size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]" />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Min Order Value (₹)</label>
                <input
                  type="number" min="0" step="1"
                  value={minOrderValue}
                  onChange={e => setMinOrderValue(e.target.value)}
                  placeholder="0 = no minimum"
                  className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50"
                />
              </div>
            </div>
          )}

          {type === 'flat_discount' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Flat Discount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[#AEAEAE]">₹</span>
                  <input
                    type="number" min="0" step="1"
                    value={discountFlat}
                    onChange={e => setDiscountFlat(e.target.value)}
                    className="w-full h-[40px] pl-7 pr-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Min Order Value (₹)</label>
                <input
                  type="number" min="0" step="1"
                  value={minOrderValue}
                  onChange={e => setMinOrderValue(e.target.value)}
                  placeholder="0 = no minimum"
                  className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50"
                />
              </div>
            </div>
          )}

          {type === 'bxgy' && (
            <div className="space-y-3">
              {/* Buy product */}
              <div>
                <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Buy Product</label>
                {buyProduct ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-[10px] bg-[#F5F5F5]">
                    <span className="text-[13px] font-semibold text-[#181725]">{buyProduct.name}</span>
                    <button onClick={() => setBuyProduct(null)} className="text-[#AEAEAE] hover:text-[#E74C3C]">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]" />
                    <input
                      type="text"
                      value={buySearch.query}
                      onChange={e => buySearch.setQuery(e.target.value)}
                      placeholder="Search product…"
                      className="w-full h-[38px] pl-8 pr-4 rounded-[10px] border border-[#EEEEEE] text-[12px] outline-none focus:border-[#299E60]/40"
                    />
                    {buySearch.results.length > 0 && (
                      <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-[10px] border border-[#EEEEEE] shadow-lg overflow-hidden">
                        {buySearch.results.map(p => (
                          <button key={p.id} onClick={() => { setBuyProduct(p); buySearch.setQuery(''); }}
                            className="w-full text-left px-3 py-2 hover:bg-[#F5F5F5] text-[12px] text-[#181725]">
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Buy Qty</label>
                  <input type="number" min="1" value={minQty} onChange={e => setMinQty(e.target.value)}
                    className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50" />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Get Qty (free)</label>
                  <input type="number" min="1" value={getQty} onChange={e => setGetQty(e.target.value)}
                    className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50" />
                </div>
              </div>
              {/* Get product */}
              <div>
                <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Get Product (free item)</label>
                {getProduct ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-[10px] bg-[#F5F5F5]">
                    <span className="text-[13px] font-semibold text-[#181725]">{getProduct.name}</span>
                    <button onClick={() => setGetProduct(null)} className="text-[#AEAEAE] hover:text-[#E74C3C]">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]" />
                    <input
                      type="text"
                      value={getSearch.query}
                      onChange={e => getSearch.setQuery(e.target.value)}
                      placeholder="Search product…"
                      className="w-full h-[38px] pl-8 pr-4 rounded-[10px] border border-[#EEEEEE] text-[12px] outline-none focus:border-[#299E60]/40"
                    />
                    {getSearch.results.length > 0 && (
                      <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-[10px] border border-[#EEEEEE] shadow-lg overflow-hidden">
                        {getSearch.results.map(p => (
                          <button key={p.id} onClick={() => { setGetProduct(p); getSearch.setQuery(''); }}
                            className="w-full text-left px-3 py-2 hover:bg-[#F5F5F5] text-[12px] text-[#181725]">
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Start Date (optional)</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">End Date (optional)</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50" />
            </div>
          </div>

          {/* Usage limit */}
          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Usage Limit (optional)</label>
            <input type="number" min="1" value={usageLimit} onChange={e => setUsageLimit(e.target.value)}
              placeholder="Unlimited if blank"
              className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50" />
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[13px] font-semibold text-[#181725]">Active</span>
            <button onClick={() => setIsActive(v => !v)} className="text-[#299E60]">
              {isActive ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-[#AEAEAE]" />}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#F5F5F5] flex justify-end gap-3">
          <button onClick={onClose} className="h-[38px] px-5 rounded-[10px] border border-[#EEEEEE] text-[13px] font-semibold text-[#7C7C7C] hover:bg-[#F5F5F5]">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="h-[38px] px-5 rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54] disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Promotion'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Store Offers tab (legacy auto-applied store promotions + BXGY) ───────────

function StoreOffersTab() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchPromotions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/vendor/promotions');
      const json = await res.json();
      if (json.success) setPromotions(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPromotions(); }, [fetchPromotions]);

  const handleToggle = async (p: Promotion) => {
    setToggling(p.id);
    try {
      const res = await fetch(`/api/v1/vendor/promotions/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      const json = await res.json();
      if (json.success) {
        setPromotions(prev => prev.map(x => x.id === p.id ? { ...x, isActive: !x.isActive } : x));
        toast.success(p.isActive ? 'Promotion paused' : 'Promotion activated');
      }
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this promotion? This cannot be undone.')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/v1/vendor/promotions/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setPromotions(prev => prev.filter(x => x.id !== id));
        toast.success('Promotion deleted');
      }
    } finally {
      setDeleting(null);
    }
  };

  const handleSaved = (p: Promotion) => {
    setPromotions(prev => {
      const idx = prev.findIndex(x => x.id === p.id);
      return idx >= 0 ? prev.map(x => x.id === p.id ? p : x) : [p, ...prev];
    });
    setShowCreate(false);
    setEditing(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-[#299E60]" size={28} />
      </div>
    );
  }

  const live = promotions.filter(isLive);
  const inactive = promotions.filter(p => !isLive(p));

  return (
    <div className="space-y-6 pb-10 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[16px] font-bold text-[#181725]">Store Offers</h2>
          <p className="text-[12px] text-[#AEAEAE]">Auto-applied discounts and Buy X Get Y deals on your store</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 h-[38px] rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54] transition-colors"
        >
          <Plus size={14} />
          New Promotion
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Promotions', value: promotions.length, color: 'text-[#181725]' },
          { label: 'Currently Live', value: live.length, color: 'text-[#299E60]' },
          { label: 'Paused / Expired', value: inactive.length, color: 'text-[#AEAEAE]' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5">
            <p className="text-[12px] text-[#AEAEAE] font-semibold">{s.label}</p>
            <p className={cn('text-[28px] font-bold mt-1', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* List */}
      {promotions.length === 0 ? (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm py-16 text-center">
          <Gift size={40} className="text-[#E5E7EB] mx-auto mb-3" />
          <p className="text-[14px] font-bold text-[#AEAEAE]">No promotions yet</p>
          <p className="text-[12px] text-[#AEAEAE] mt-1">Create a discount or deal to attract more orders</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-5 flex items-center gap-2 mx-auto px-5 h-[38px] rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54]"
          >
            <Plus size={14} /> New Promotion
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-[#FAFAFA] border-b border-[#F5F5F5] grid grid-cols-12 gap-3 text-[11px] font-semibold text-[#AEAEAE]">
            <div className="col-span-3">Promotion</div>
            <div className="col-span-2">Offer</div>
            <div className="col-span-2" title="Where customers see this: product badge, Deals tab, and free items in cart at checkout">
              Storefront
            </div>
            <div className="col-span-2 text-center">Date Range</div>
            <div className="col-span-1 text-center">Uses</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          <div className="divide-y divide-[#F5F5F5]">
            {promotions.map(p => {
              const live = isLive(p);
              return (
                <div key={p.id} className="px-5 py-4 grid grid-cols-12 gap-3 items-center hover:bg-[#FAFAFA] transition-colors">
                  {/* Name + type */}
                  <div className="col-span-3 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', TYPE_COLORS[p.type])}>
                        {TYPE_LABELS[p.type]}
                      </span>
                      {live ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EEF8F1] text-[#299E60]">Live</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F5F5F5] text-[#AEAEAE]">
                          {p.isActive ? 'Scheduled' : 'Paused'}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] font-semibold text-[#181725] truncate">{p.name}</p>
                  </div>

                  {/* Description */}
                  <div className="col-span-2 text-[12px] text-[#7C7C7C]">
                    {promoDescription(p)}
                  </div>

                  <div className="col-span-2 text-[11px] text-[#299E60] font-semibold" title="Customers see badge on product + free item in cart">
                    {promotionStorefrontLabel(p.type, live)}
                  </div>

                  {/* Date range */}
                  <div className="col-span-2 text-center text-[11px] text-[#AEAEAE]">
                    {p.startDate || p.endDate ? (
                      <>
                        {p.startDate ? fmt(p.startDate) : 'Always'}<br />
                        <span className="text-[10px]">→ {p.endDate ? fmt(p.endDate) : 'No end'}</span>
                      </>
                    ) : (
                      <span className="text-[#299E60] text-[11px] font-semibold">Always on</span>
                    )}
                  </div>

                  {/* Usage */}
                  <div className="col-span-1 text-center text-[12px] text-[#7C7C7C]">
                    {p.usageCount}
                    {p.usageLimit ? <span className="text-[#AEAEAE]">/{p.usageLimit}</span> : null}
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => handleToggle(p)}
                      disabled={toggling === p.id}
                      title={p.isActive ? 'Pause' : 'Activate'}
                      className={cn(
                        'transition-colors',
                        toggling === p.id ? 'opacity-50' : '',
                        p.isActive ? 'text-[#299E60]' : 'text-[#AEAEAE]'
                      )}
                    >
                      {toggling === p.id ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : p.isActive ? (
                        <ToggleRight size={22} />
                      ) : (
                        <ToggleLeft size={22} />
                      )}
                    </button>
                    <button
                      onClick={() => setEditing(p)}
                      className="w-7 h-7 flex items-center justify-center rounded-[7px] hover:bg-[#F5F5F5] text-[#7C7C7C]"
                      title="Edit"
                    >
                      <Tag size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deleting === p.id}
                      className="w-7 h-7 flex items-center justify-center rounded-[7px] hover:bg-[#FFF0F0] text-[#E74C3C] disabled:opacity-50"
                      title="Delete"
                    >
                      {deleting === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate && <PromotionModal onClose={() => setShowCreate(false)} onSaved={handleSaved} />}
      {editing && <PromotionModal existing={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />}
    </div>
  );
}

// ─── Main Page (Promo Engine Phase 1) ─────────────────────────────────────────
// Three tools side by side: auto-applied Store Offers (legacy), Coupons
// (code-based, customer applies at checkout) and Cashback campaigns
// (earned on delivery → Rewards Wallet).

export default function PromotionsPage() {
  const [tab, setTab] = useState<'offers' | 'coupons' | 'cashback'>('offers');

  return (
    <div className="space-y-5 pb-10 max-w-5xl">
      <div>
        <h1 className="text-[22px] font-bold text-[#181725]">Promotions</h1>
        <p className="text-[12px] text-[#AEAEAE]">Discounts, coupons and cashback to grow repeat orders</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([['offers', 'Store Offers'], ['coupons', 'Coupons'], ['cashback', 'Cashback']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'px-4 py-2 rounded-lg text-[12px] font-bold transition-colors cursor-pointer',
              tab === id ? 'bg-white text-[#181725] shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'offers' && <StoreOffersTab />}
      {tab === 'coupons' && <VendorCouponsTab />}
      {tab === 'cashback' && <VendorCashbackTab />}
    </div>
  );
}
