'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Tag, Plus, Loader2, Pencil, Trash2, Package, X, Grid3x3, AlertCircle, ArrowRight, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

type AssignmentType = 'customer' | 'outlet' | 'pincode' | 'area' | 'segment' | 'brand' | 'group';

interface PriceListAssignment {
  type: AssignmentType;
}

interface PriceList {
  id: string;
  name: string;
  discountPercent: number;
  isActive: boolean;
  createdAt: string;
  assignments: PriceListAssignment[];
  _count: { items: number; customers: number; assignments: number };
}

// Plain-language summary of who a list reaches, e.g. "5 customers · 2 areas".
const TYPE_LABELS: Record<AssignmentType, [string, string]> = {
  customer: ['customer', 'customers'],
  outlet: ['outlet', 'outlets'],
  pincode: ['pincode', 'pincodes'],
  area: ['area', 'areas'],
  segment: ['segment', 'segments'],
  brand: ['brand', 'brands'],
  group: ['group', 'groups'],
};

function whoSummary(assignments: PriceListAssignment[]): string {
  const counts = assignments.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([t, n]) => `${n} ${TYPE_LABELS[t as AssignmentType][n === 1 ? 0 : 1]}`)
    .join(' · ');
}

// ─── Create Modal ────────────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreated: (pl: PriceList) => void;
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [name, setName] = useState('');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/v1/vendor/price-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          discountPercent: parseFloat(discountPercent) || 0,
          validFrom: validFrom ? new Date(validFrom).toISOString() : null,
          validTo: validTo ? new Date(validTo).toISOString() : null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        onCreated({ ...json.data, assignments: [], _count: { items: 0, customers: 0, assignments: 0 } });
        onClose();
      } else {
        setError(json.error ?? 'Failed to create');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[400px] shadow-2xl">
        <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-[#181725]">New Price List</h2>
          <button onClick={onClose} className="p-1 rounded-[6px] hover:bg-[#F5F5F5]">
            <X size={16} className="text-[#AEAEAE]" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cafe Pricing, Bulk Buyers"
              className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50 bg-white"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">
              Default price adjustment (%) <span className="text-[#AEAEAE] font-normal">— optional, you can fine-tune everything after</span>
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50 bg-white"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">
              Validity <span className="text-[#AEAEAE] font-normal">— optional, leave blank for always-on</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#AEAEAE] mb-1">Effective from</label>
                <input
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#AEAEAE] mb-1">Effective to</label>
                <input
                  type="date"
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                  className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50 bg-white"
                />
              </div>
            </div>
          </div>
          {error && <p className="text-[12px] text-[#E74C3C]">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-[#EEEEEE] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 h-[38px] rounded-[10px] border border-[#EEEEEE] text-[13px] font-semibold text-[#7C7C7C] hover:bg-[#F5F5F5] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-5 h-[38px] rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VendorPriceListsPage() {
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchPriceLists = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/vendor/price-lists');
      const json = await res.json();
      if (json.success) setPriceLists(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPriceLists(); }, [fetchPriceLists]);

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this price list? Assigned customers will revert to default pricing.')) return;
    setDeleting(id);
    try {
      await fetch(`/api/v1/vendor/price-lists/${id}`, { method: 'DELETE' });
      setPriceLists((prev) => prev.filter((pl) => pl.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  const handleCreated = (pl: PriceList) => {
    setPriceLists((prev) => [pl, ...prev]);
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[24px] font-bold text-[#181725]">Price Lists</h1>
          <p className="text-[13px] text-[#7C7C7C] mt-1 max-w-2xl">
            Customer-specific B2B pricing (fixed, discount, or scheme). Bulk quantity tiers on products apply to all buyers — use Store Offers for public BXGY deals everyone sees.
          </p>
          <p className="text-[12px] text-[#AEAEAE]">Give specific customers, areas, or groups their own prices.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/vendor/customer-groups"
            title="Create groups of customers to give a whole group its own prices"
            className="flex items-center gap-2 px-4 h-[38px] rounded-[10px] bg-white border border-[#EEEEEE] text-[#7C7C7C] text-[13px] font-bold hover:border-[#299E60]/40 hover:text-[#299E60] transition-colors"
          >
            <Users size={15} />
            Customer groups
          </Link>
          <Link
            href="/vendor/price-lists/workspace"
            title="Edit prices across all your lists at once"
            className="flex items-center gap-2 px-4 h-[38px] rounded-[10px] bg-white border border-[#EEEEEE] text-[#7C7C7C] text-[13px] font-bold hover:border-[#299E60]/40 hover:text-[#299E60] transition-colors"
          >
            <Grid3x3 size={15} />
            Bulk pricing grid
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 h-[38px] rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54] transition-colors"
          >
            <Plus size={15} />
            New Price List
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-[#299E60]" size={28} />
        </div>
      ) : priceLists.length === 0 ? (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] py-16 text-center shadow-sm">
          <Tag size={36} className="text-[#E5E7EB] mx-auto mb-3" />
          <p className="text-[14px] font-bold text-[#AEAEAE]">No price lists yet</p>
          <p className="text-[12px] text-[#AEAEAE] mt-1">A price list lets you give chosen customers their own prices. Create one to get started.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 flex items-center gap-2 mx-auto px-4 h-[36px] rounded-[10px] bg-[#299E60] text-white text-[12px] font-bold hover:bg-[#238a54] transition-colors"
          >
            <Plus size={13} />
            Create first price list
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {priceLists.map((pl) => (
            <div key={pl.id} className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5 flex flex-col gap-3.5">
              {/* Title + status + actions */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[15px] font-bold text-[#181725] truncate">{pl.name}</p>
                    <span className={cn(
                      'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide',
                      pl.isActive ? 'bg-[#EEF8F1] text-[#299E60]' : 'bg-[#F5F5F5] text-[#AEAEAE]',
                    )}>
                      <span className={cn('w-1.5 h-1.5 rounded-full', pl.isActive ? 'bg-[#299E60]' : 'bg-[#AEAEAE]')} />
                      {pl.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#7C7C7C] mt-0.5">
                    {pl.discountPercent > 0 ? `-${pl.discountPercent}% base price modifier` : 'Per-product pricing'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={`/vendor/price-lists/${pl.id}`}
                    className="w-7 h-7 flex items-center justify-center rounded-[6px] hover:bg-[#F5F5F5] transition-colors text-[#7C7C7C]"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </a>
                  <button
                    onClick={() => handleDelete(pl.id)}
                    disabled={deleting === pl.id}
                    className="w-7 h-7 flex items-center justify-center rounded-[6px] hover:bg-[#FFF0F0] transition-colors text-[#E74C3C] disabled:opacity-40"
                    title="Deactivate"
                  >
                    {deleting === pl.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>

              {/* Who gets it */}
              <div className="rounded-[10px] bg-[#F8FAFC] border border-[#F0F0F0] px-3 py-2.5">
                <p className="text-[10px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1">Who gets it</p>
                {pl._count.assignments === 0 ? (
                  <p className="text-[12px] font-semibold text-[#D97706] flex items-center gap-1.5">
                    <AlertCircle size={12} /> Not assigned to anyone yet
                  </p>
                ) : (
                  <p className="text-[12px] font-semibold text-[#181725]">{whoSummary(pl.assignments)}</p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 text-[12px] text-[#7C7C7C]">
                <div className="flex items-center gap-1">
                  <Package size={12} />
                  <span>{pl._count.items} special price{pl._count.items !== 1 ? 's' : ''}</span>
                </div>
                <a
                  href={`/vendor/price-lists/${pl.id}`}
                  className="ml-auto text-[#299E60] font-bold hover:underline flex items-center gap-1"
                >
                  Edit <ArrowRight size={12} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
