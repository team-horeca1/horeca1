'use client';

// Vendor → Price Lists → Edit page.
//
// V2.2 Phase 4 update: per-item pricing type picker (fixed / discount /
// special / scheme) with the contextual sub-inputs each type needs,
// plus an Assignments card to wire the list to customers / outlets /
// pincodes / areas / segments / brands, plus a Bulk Upload strip that
// parses an XLSX/CSV client-side and submits to the new endpoint.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Loader2, Search, Plus, Trash2, Tag, Users, Package,
  Upload, AlertCircle, X, MapPin, Sparkles, Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────

type PricingType = 'fixed' | 'discount' | 'special' | 'scheme';
type AssignmentType = 'customer' | 'outlet' | 'pincode' | 'area' | 'segment' | 'brand' | 'group';

interface ProductSummary {
  id: string;
  name: string;
  sku?: string | null;
  basePrice: number;
  unit: string | null;
  packSize: string | null;
}

interface ItemDraft {
  productId: string;
  customPrice: string;
  pricingType: PricingType;
  discountPercent: string;
  schemeMinQty: string;
  schemeFreeQty: string;
  product: ProductSummary;
}

interface ApiPriceListItem {
  id: string;
  productId: string;
  customPrice: number | string | null;
  pricingType: PricingType;
  discountPercent: number | string | null;
  schemeMinQty: number | null;
  schemeFreeQty: number | null;
  product: ProductSummary;
}

interface ApiAssignment {
  id: string;
  type: AssignmentType;
  userId: string | null;
  businessAccountId: string | null;
  outletId: string | null;
  brandId: string | null;
  groupId: string | null;
  pincode: string | null;
  area: string | null;
  segment: string | null;
  brandName: string | null;
  user: { id: string; fullName: string; email: string | null } | null;
  businessAccount: { id: string; legalName: string; displayName: string | null } | null;
  outlet: { id: string; name: string; pincode: string | null; city: string | null } | null;
  brand: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
  assignedById?: string | null;
  assignedAt?: string | null;
}

interface PriceListDetail {
  id: string;
  name: string;
  discountPercent: number;
  isActive: boolean;
  validFrom: string | null;
  validTo: string | null;
  items: ApiPriceListItem[];
  customers: Array<{ id: string; user: { fullName: string; businessName: string | null } }>;
  assignments: ApiAssignment[];
}

interface AssignmentDraft {
  type: AssignmentType;
  userId?: string;
  outletId?: string;
  brandId?: string;
  brandName?: string;
  groupId?: string;
  pincode?: string;
  area?: string;
  segment?: string;
  /** Free-text label rendered in the chip; computed locally when we add. */
  label: string;
}

interface VendorCustomerOption { userId: string; label: string }
interface OutletOption { id: string; name: string; city: string | null; pincode: string | null; businessName?: string | null }
interface BrandOption { id: string; name: string }
interface GroupOption { id: string; name: string }

// ── Component ─────────────────────────────────────────────────────────

export default function PriceListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [priceList, setPriceList] = useState<PriceListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [name, setName] = useState('');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [isActive, setIsActive] = useState(true);
  // Validity window (optional). Stored as yyyy-MM-dd for the date inputs;
  // converted to/from ISO datetime at the API boundary.
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDraft[]>([]);
  // Bulk upload strip is tucked away by default — power feature, opt-in.
  const [showBulk, setShowBulk] = useState(false);

  // Product search
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Assignment-add UI state
  const [addingAssign, setAddingAssign] = useState(false);
  const [newAssignType, setNewAssignType] = useState<AssignmentType>('pincode');
  const [newAssignValue, setNewAssignValue] = useState('');
  const [outletOpts, setOutletOpts] = useState<OutletOption[]>([]);
  const [brandOpts, setBrandOpts] = useState<BrandOption[]>([]);
  const [customerOpts, setCustomerOpts] = useState<VendorCustomerOption[]>([]);
  const [groupOpts, setGroupOpts] = useState<GroupOption[]>([]);

  // Bulk upload state
  const bulkFileRef = useRef<HTMLInputElement>(null);
  const [bulkResult, setBulkResult] = useState<{ matched: number; upserted: number; errors: Array<{ row: number; message: string }> } | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);

  // ── Fetch + hydrate ────────────────────────────────────────────────
  const fetchPriceList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/vendor/price-lists/${id}`);
      const json = await res.json();
      if (!json.success) return;
      const pl: PriceListDetail = json.data;
      setPriceList(pl);
      setName(pl.name);
      setDiscountPercent(String(pl.discountPercent));
      setIsActive(pl.isActive);
      setValidFrom(isoToDateInput(pl.validFrom));
      setValidTo(isoToDateInput(pl.validTo));
      setItems(
        pl.items.map((item) => ({
          productId: item.productId,
          customPrice: item.customPrice != null ? String(item.customPrice) : '',
          pricingType: item.pricingType ?? 'fixed',
          discountPercent: item.discountPercent != null ? String(item.discountPercent) : '',
          schemeMinQty: item.schemeMinQty != null ? String(item.schemeMinQty) : '',
          schemeFreeQty: item.schemeFreeQty != null ? String(item.schemeFreeQty) : '',
          product: item.product,
        }))
      );
      setAssignments(
        pl.assignments.map((a) => ({
          type: a.type,
          userId:    a.userId ?? undefined,
          outletId:  a.outletId ?? undefined,
          brandId:   a.brandId ?? undefined,
          brandName: a.brandName ?? undefined,
          groupId:   a.groupId ?? undefined,
          pincode:   a.pincode ?? undefined,
          area:      a.area ?? undefined,
          segment:   a.segment ?? undefined,
          label: assignmentChipLabel(a),
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchPriceList(); }, [fetchPriceList]);

  // Outlets + brands + customers — fetched on demand when the vendor
  // opens the "Add assignment" picker so we don't pay for them on first
  // paint.
  const ensureOptionsLoaded = useCallback(async (type: AssignmentType) => {
    try {
      // Customers + customer outlets come from one endpoint. Outlets are the
      // CUSTOMERS' outlets, not the vendor's own — the pricing resolver
      // matches the buyer's active outlet, so vendor outlets would never apply.
      if ((type === 'outlet' && outletOpts.length === 0) || (type === 'customer' && customerOpts.length === 0)) {
        const j = await fetch('/api/v1/vendor/pricing-targets').then((r) => r.json());
        if (j.success) {
          setOutletOpts(j.data.outlets ?? []);
          setCustomerOpts(j.data.customers ?? []);
        }
      }
      if (type === 'brand' && brandOpts.length === 0) {
        const j = await fetch('/api/v1/brands?limit=100').then((r) => r.json());
        if (j.success) {
          const list = (j.data.brands ?? []) as Array<{ id: string; name: string }>;
          setBrandOpts(list.map((b) => ({ id: b.id, name: b.name })));
        }
      }
      if (type === 'group' && groupOpts.length === 0) {
        const j = await fetch('/api/v1/vendor/customer-groups').then((r) => r.json());
        if (j.success) {
          const list = (j.data ?? []) as Array<{ id: string; name: string }>;
          setGroupOpts(list.map((g) => ({ id: g.id, name: g.name })));
        }
      }
    } catch {
      toast.error('Could not load options — check your connection and retry');
    }
  }, [outletOpts.length, brandOpts.length, customerOpts.length, groupOpts.length]);

  // ── Product search (debounced) ─────────────────────────────────────
  useEffect(() => {
    if (!productSearch.trim()) { setSearchResults([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/v1/vendor/products?search=${encodeURIComponent(productSearch)}&limit=10`);
        const json = await res.json();
        if (!json.success) return;
        const alreadyAdded = new Set(items.map((i) => i.productId));
        const raw: ProductSummary[] = json.data.products ?? json.data ?? [];
        setSearchResults(raw.filter((p) => !alreadyAdded.has(p.id)));
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [productSearch, items]);

  const addProduct = (product: ProductSummary) => {
    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        customPrice: String(product.basePrice),
        pricingType: 'fixed',
        discountPercent: '',
        schemeMinQty: '',
        schemeFreeQty: '',
        product,
      },
    ]);
    setProductSearch('');
    setSearchResults([]);
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const updateItem = (productId: string, patch: Partial<ItemDraft>) => {
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, ...patch } : i)));
  };

  // ── Assignments management ────────────────────────────────────────
  const addAssignment = () => {
    const draft = buildAssignmentDraft(newAssignType, newAssignValue, { outletOpts, brandOpts, customerOpts, groupOpts });
    if (!draft) {
      toast.error('Pick or type a value for the assignment');
      return;
    }
    // Dedupe identical assignments — strip the label (UI-only) before
    // serializing so identical rules with different labels still match.
    const fingerprint = (a: AssignmentDraft) => {
      const { label: _label, ...rest } = a;
      void _label;
      return JSON.stringify(rest);
    };
    const key = fingerprint(draft);
    if (assignments.some((a) => fingerprint(a) === key)) {
      toast.error('That assignment is already on this list');
      return;
    }
    setAssignments((prev) => [...prev, draft]);
    setNewAssignValue('');
    setAddingAssign(false);
  };

  const removeAssignment = (idx: number) => {
    setAssignments((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Bulk upload ───────────────────────────────────────────────────
  const handleBulkFile = async (file: File) => {
    setBulkResult(null);
    setBulkUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      type RawRow = Record<string, unknown>;
      const raw = XLSX.utils.sheet_to_json<RawRow>(sheet);
      if (raw.length === 0) {
        toast.error('No rows found in the file');
        return;
      }
      // Normalize headers (case-insensitive). Accept common aliases.
      const rows = raw.map((r) => {
        const lower: Record<string, unknown> = {};
        for (const k of Object.keys(r)) lower[k.toLowerCase().trim()] = r[k];
        const typeRaw = String(lower['type'] ?? lower['pricingtype'] ?? lower['pricing_type'] ?? 'fixed').toLowerCase();
        const type = typeRaw === 'adjustment' ? 'discount' : typeRaw;
        return {
          sku: lower['sku'] != null ? String(lower['sku']) : undefined,
          customPrice: lower['price'] != null ? Number(lower['price']) :
                        lower['customprice'] != null ? Number(lower['customprice']) :
                        lower['custom_price'] != null ? Number(lower['custom_price']) : undefined,
          pricingType: (['fixed', 'discount', 'special', 'scheme'].includes(type) ? type : 'fixed') as PricingType,
          discountPercent: lower['adjustment'] != null ? Number(lower['adjustment']) :
                            lower['discount'] != null ? Number(lower['discount']) :
                            lower['discountpercent'] != null ? Number(lower['discountpercent']) : undefined,
          schemeMinQty: lower['schememinqty'] != null ? Number(lower['schememinqty']) :
                         lower['minqty'] != null ? Number(lower['minqty']) : undefined,
          schemeFreeQty: lower['schemefreeqty'] != null ? Number(lower['schemefreeqty']) :
                          lower['freeqty'] != null ? Number(lower['freeqty']) : undefined,
        };
      });
      const res = await fetch(`/api/v1/vendor/price-lists/${id}/bulk-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error?.message || 'Bulk upload failed');
        return;
      }
      setBulkResult(json.data);
      toast.success(`Upserted ${json.data.upserted} of ${rows.length} rows`);
      await fetchPriceList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk upload failed');
    } finally {
      setBulkUploading(false);
      if (bulkFileRef.current) bulkFileRef.current.value = '';
    }
  };

  const downloadTemplate = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'sku,type,price,adjustment,minQty,freeQty\n';
    
    items.forEach(item => {
      const type = item.pricingType === 'discount' ? 'adjustment' : item.pricingType;
      csvContent += `"${item.product.sku || ''}","${type}","${item.customPrice || ''}","${item.discountPercent || ''}","${item.schemeMinQty || ''}","${item.schemeFreeQty || ''}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Pricelist_Template_${name.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Pricelist template downloaded');
  };

  // ── Save ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      // Build the API payload, only sending the fields the chosen
      // pricingType actually uses. Server will reject malformed combos.
      const itemsPayload = items.map((i) => {
        const base: Record<string, unknown> = {
          productId: i.productId,
          pricingType: i.pricingType,
        };
        if (i.pricingType === 'fixed' || i.pricingType === 'special') {
          base.customPrice = parseFloat(i.customPrice) || 0;
        } else if (i.pricingType === 'discount') {
          base.discountPercent = parseFloat(i.discountPercent) || 0;
        } else if (i.pricingType === 'scheme') {
          base.customPrice = parseFloat(i.customPrice) || 0;
          base.schemeMinQty = parseInt(i.schemeMinQty, 10) || 1;
          if (i.schemeFreeQty) base.schemeFreeQty = parseInt(i.schemeFreeQty, 10) || 0;
        }
        return base;
      });

      const assignmentsPayload = assignments.map((a) => {
        const out: Record<string, unknown> = { type: a.type };
        if (a.userId)    out.userId = a.userId;
        if (a.outletId)  out.outletId = a.outletId;
        if (a.brandId)   out.brandId = a.brandId;
        if (a.brandName) out.brandName = a.brandName;
        if (a.groupId)   out.groupId = a.groupId;
        if (a.pincode)   out.pincode = a.pincode;
        if (a.area)      out.area = a.area;
        if (a.segment)   out.segment = a.segment;
        return out;
      });

      const res = await fetch(`/api/v1/vendor/price-lists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          discountPercent: parseFloat(discountPercent) || 0,
          isActive,
          validFrom: dateInputToIso(validFrom),
          validTo: dateInputToIso(validTo),
          items: itemsPayload,
          assignments: assignmentsPayload,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error?.message || 'Save failed');
        return;
      }
      toast.success('Price list saved');
      await fetchPriceList();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  if (!priceList) {
    return (
      <div className="text-center py-20">
        <p className="text-[14px] text-[#AEAEAE]">Price list not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-[8px] border border-[#EEEEEE] hover:bg-[#F5F5F5] transition-colors text-[#7C7C7C]"
          >
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="text-[22px] font-bold text-[#181725]">{name || priceList.name}</h1>
            <p className="text-[12px] text-[#AEAEAE]">
              Customer-specific B2B pricing — assigned buyers see <strong className="font-bold text-[#7C7C7C]">Your price</strong> on products and in cart.
              For public BXGY deals everyone sees, use <strong className="font-bold text-[#7C7C7C]">Store Offers</strong> instead.
            </p>
            <p className="text-[11px] text-[#AEAEAE] mt-0.5">Two steps: choose <strong className="font-bold text-[#7C7C7C]">who</strong> gets this list, then <strong className="font-bold text-[#7C7C7C]">what</strong> they pay.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsActive((v) => !v)}
            title="Toggle whether this list is live for customers"
            className={cn(
              'flex items-center gap-1.5 px-3 h-[38px] rounded-[10px] text-[12.5px] font-bold border transition-colors',
              isActive
                ? 'bg-primary-light border-primary/30 text-primary'
                : 'bg-[#F5F5F5] border-[#E5E7EB] text-[#7C7C7C]',
            )}
          >
            <span className={cn('w-2 h-2 rounded-full', isActive ? 'bg-primary' : 'bg-[#AEAEAE]')} />
            {isActive ? 'Active' : 'Inactive'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 h-[38px] rounded-[10px] bg-primary text-white text-[13px] font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save Changes
          </button>
        </div>
      </div>

      {/* List name + quick stats */}
      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5 space-y-4">
        <div>
          <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">List name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cafe Pricing, Bulk Buyers"
            className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-primary/50 bg-white"
          />
        </div>

        {/* Validity window (optional) */}
        <div className="pt-1 border-t border-[#F5F5F5]">
          <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-2 pt-3">
            Validity <span className="text-[#AEAEAE] font-normal">(optional)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#AEAEAE] mb-1">Effective From</label>
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-primary/50 bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#AEAEAE] mb-1">Effective To</label>
              <input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-primary/50 bg-white"
              />
            </div>
          </div>
          <p className="text-[11px] text-[#AEAEAE] mt-1.5">
            Outside these dates this list&apos;s prices don&apos;t apply — customers see normal pricing.
          </p>
        </div>

        <div className="flex items-center gap-6 pt-1 text-[12px] text-[#7C7C7C]">
          <div className="flex items-center gap-1.5">
            <Package size={13} />
            <span>{items.length} item{items.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin size={13} />
            <span>{assignments.length} assignment{assignments.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users size={13} />
            <span>{priceList.customers.length} directly linked customer{priceList.customers.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* ── Assignments card ────────────────────────────────────────── */}
      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F5F5F5] flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-bold text-[#181725]"><span className="text-primary">①</span> Who gets this list</h2>
            <p className="text-[12px] text-[#AEAEAE]">Add a rule and the prices apply automatically — to a customer, an outlet, a pincode, an area, a customer group, or a brand&apos;s products.</p>
          </div>
          {!addingAssign && (
            <button
              onClick={() => setAddingAssign(true)}
              className="flex items-center gap-1.5 px-3 h-[34px] rounded-[10px] border border-[#EEEEEE] hover:border-primary/40 text-[12.5px] font-bold text-[#181725] transition-colors"
            >
              <Plus size={13} /> Add assignment
            </button>
          )}
        </div>

        {addingAssign && (
          <div className="px-5 py-4 bg-[#F8FAFC] border-b border-[#F5F5F5] space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1.5">Target by</label>
                <select
                  value={newAssignType}
                  onChange={(e) => {
                    const t = e.target.value as AssignmentType;
                    setNewAssignType(t);
                    setNewAssignValue('');
                    ensureOptionsLoaded(t);
                  }}
                  className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] bg-white"
                >
                  <option value="pincode">Pincode</option>
                  <option value="area">Area (City/State)</option>
                  <option value="segment">Customer segment (tag)</option>
                  <option value="group">Customer group</option>
                  <option value="customer">Specific customer</option>
                  <option value="outlet">Specific outlet</option>
                  <option value="brand">Brand</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1.5">Value</label>
                <AssignmentValuePicker
                  type={newAssignType}
                  value={newAssignValue}
                  onChange={setNewAssignValue}
                  outletOpts={outletOpts}
                  brandOpts={brandOpts}
                  customerOpts={customerOpts}
                  groupOpts={groupOpts}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={addAssignment}
                className="px-4 h-[34px] rounded-[10px] bg-primary text-white text-[12.5px] font-bold hover:bg-primary-dark transition-colors"
              >
                Add rule
              </button>
              <button
                onClick={() => { setAddingAssign(false); setNewAssignValue(''); }}
                className="text-[12px] font-bold text-[#7C7C7C] hover:text-[#181725]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {assignments.length === 0 ? (
          <div className="py-12 text-center">
            <MapPin size={28} className="text-[#E5E7EB] mx-auto mb-3" />
            <p className="text-[13px] font-bold text-[#AEAEAE]">Nobody gets this list yet</p>
            <p className="text-[12px] text-[#AEAEAE] mt-1">Click &ldquo;Add assignment&rdquo; to choose which customers see these prices.</p>
          </div>
        ) : (
          <div className="px-5 py-4 flex flex-wrap gap-2">
            {assignments.map((a, idx) => (
              <span
                key={idx}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold',
                  ASSIGN_STYLE[a.type].bg,
                  ASSIGN_STYLE[a.type].text,
                )}
              >
                <span className="opacity-70 uppercase tracking-wider text-[10px]">{a.type}</span>
                <span>{a.label}</span>
                <button
                  onClick={() => removeAssignment(idx)}
                  className="ml-1 hover:opacity-60 transition-opacity"
                  title="Remove assignment"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── ② What they pay ────────────────────────────────────────── */}
      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F5F5F5]">
          <h2 className="text-[14px] font-bold text-[#181725]"><span className="text-primary">②</span> What they pay</h2>
          <p className="text-[12px] text-[#AEAEAE]">Pick a default for the whole list, then set special prices for individual products if you need to.</p>
        </div>

        {/* Default pricing choice */}
        <div className="px-5 py-4 border-b border-[#F5F5F5]">
          <label className="block text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-2">Default for every product</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setDiscountPercent('0')}
              className={cn(
                'rounded-[12px] border p-3.5 text-left transition-colors',
                Number(discountPercent) > 0 ? 'border-[#EEEEEE] hover:border-[#D1D5DB]' : 'border-primary bg-primary-light',
              )}
            >
              <div className="text-[13px] font-bold text-[#181725]">Same as base price</div>
              <div className="text-[11px] text-[#AEAEAE] mt-0.5">Normal catalog price — unless overridden below.</div>
            </button>
            <button
              type="button"
              onClick={() => { if (!(Number(discountPercent) > 0)) setDiscountPercent('5'); }}
              className={cn(
                'rounded-[12px] border p-3.5 text-left transition-colors',
                Number(discountPercent) > 0 ? 'border-primary bg-primary-light' : 'border-[#EEEEEE] hover:border-[#D1D5DB]',
              )}
            >
              <div className="text-[13px] font-bold text-[#181725]">% adjustment on everything</div>
              <div className="text-[11px] text-[#AEAEAE] mt-0.5">A flat price adjustment applied to every product.</div>
            </button>
          </div>
          {Number(discountPercent) > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[#7C7C7C]">
              <input
                type="number" min="0" max="100" step="0.5"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                className="w-[90px] h-[38px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] text-right outline-none focus:border-primary/50 bg-white"
              />
              <span>% off the base price.</span>
              <span className="ml-auto text-[11px] text-[#AEAEAE]">
                Example: ₹100 → <strong className="text-primary">₹{(100 * (1 - (Number(discountPercent) || 0) / 100)).toFixed(0)}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Special prices header + bulk toggle */}
        <div className="px-5 py-4 border-b border-[#F5F5F5] flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-bold text-[#181725]">Special prices</h3>
            <p className="text-[12px] text-[#AEAEAE]">Override the default for specific products. Anything not listed uses the default above.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowBulk((v) => !v)}
            className="flex items-center gap-1.5 px-3 h-[34px] rounded-[10px] border border-[#EEEEEE] hover:border-primary/40 text-[12px] font-bold text-[#7C7C7C] transition-colors shrink-0"
          >
            <Upload size={13} /> Import from spreadsheet
          </button>
        </div>

        {/* Bulk upload (opt-in) */}
        {showBulk && (
          <div className="px-5 py-4 border-b border-[#F5F5F5] bg-[#F8FAFC]">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[12px] text-[#7C7C7C]">
              CSV/XLSX columns: <code className="bg-white border border-[#EEEEEE] px-1 rounded">sku</code>,
              <code className="bg-white border border-[#EEEEEE] px-1 rounded mx-1">type</code> (fixed/adjustment/special/scheme),
              <code className="bg-white border border-[#EEEEEE] px-1 rounded">price</code>,
              <code className="bg-white border border-[#EEEEEE] px-1 rounded mx-1">adjustment</code>,
              <code className="bg-white border border-[#EEEEEE] px-1 rounded">minQty</code>,
              <code className="bg-white border border-[#EEEEEE] px-1 rounded ml-1">freeQty</code>
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-4 h-[38px] rounded-[10px] border border-[#EEEEEE] bg-white hover:border-primary/40 text-[12.5px] font-bold text-[#181725] transition-colors"
                >
                  <Download size={13} />
                  Download Template
                </button>
                <label className="flex items-center gap-2 px-4 h-[38px] rounded-[10px] border border-[#EEEEEE] bg-white hover:border-primary/40 cursor-pointer text-[12.5px] font-bold text-[#181725] transition-colors">
                  {bulkUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {bulkUploading ? 'Uploading…' : 'Choose file'}
                  <input
                    ref={bulkFileRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    disabled={bulkUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleBulkFile(f);
                    }}
                  />
                </label>
              </div>
            </div>
            {bulkResult && (
              <div className="mt-3 text-[12.5px] text-[#181725]">
                Uploaded <strong>{bulkResult.upserted}</strong> rows.
                {bulkResult.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[#E74C3C] font-bold">{bulkResult.errors.length} error{bulkResult.errors.length !== 1 ? 's' : ''} — click to view</summary>
                    <ul className="mt-1.5 text-[11.5px] text-[#7C7C7C] max-h-[160px] overflow-y-auto pl-4 list-disc">
                      {bulkResult.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        {/* Add product */}
        <div className="px-5 py-4 border-b border-[#F5F5F5] relative">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]" />
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products to add…"
              className="w-full h-[38px] pl-8 pr-4 rounded-[10px] border border-[#EEEEEE] text-[12px] outline-none focus:border-primary/40 bg-white"
            />
            {searching && (
              <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#AEAEAE]" />
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="absolute z-20 left-5 right-5 mt-1 bg-white rounded-[12px] border border-[#EEEEEE] shadow-lg overflow-hidden">
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F5F5F5] transition-colors text-left"
                >
                  <div>
                    <p className="text-[13px] font-semibold text-[#181725]">{p.name}</p>
                    <p className="text-[11px] text-[#AEAEAE]">
                      {p.packSize ?? p.unit ?? ''} · Base ₹{Number(p.basePrice).toFixed(2)}
                    </p>
                  </div>
                  <Plus size={14} className="text-primary shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div className="py-12 text-center">
            <Tag size={32} className="text-[#E5E7EB] mx-auto mb-3" />
            <p className="text-[13px] font-bold text-[#AEAEAE]">No items yet</p>
            <p className="text-[12px] text-[#AEAEAE] mt-1">
              {Number(discountPercent) > 0
                ? `All products get -${discountPercent}% default adjustment`
                : 'Search above to add per-product pricing'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#F5F5F5]">
            {items.map((item) => (
              <ItemRow
                key={item.productId}
                item={item}
                onUpdate={(patch) => updateItem(item.productId, patch)}
                onRemove={() => removeItem(item.productId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Legacy customer mappings (kept visible for migration awareness) */}
      {priceList.customers.length > 0 && (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5">
          <h2 className="text-[14px] font-bold text-[#181725] mb-1">Directly linked customers</h2>
          <p className="text-[12px] text-[#AEAEAE] mb-3">
            These customers were linked to this list the old way. They still get these prices, but the rules above are checked first.
          </p>
          <div className="flex flex-wrap gap-2">
            {priceList.customers.map((c) => (
              <span key={c.id} className="px-3 py-1.5 bg-[#F5F5F5] rounded-full text-[12px] font-semibold text-[#181725]">
                {c.user.businessName ?? c.user.fullName}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Item row ──────────────────────────────────────────────────────────
function ItemRow({
  item, onUpdate, onRemove,
}: {
  item: ItemDraft;
  onUpdate: (patch: Partial<ItemDraft>) => void;
  onRemove: () => void;
}) {
  const base = Number(item.product.basePrice);
  // Live "they pay" preview from the chosen pricing type.
  const cp = parseFloat(item.customPrice);
  const dp = parseFloat(item.discountPercent);
  let effective: number | null = null;
  if (item.pricingType === 'fixed' || item.pricingType === 'special' || item.pricingType === 'scheme') {
    effective = isNaN(cp) ? null : cp;
  } else if (item.pricingType === 'discount') {
    effective = isNaN(dp) ? null : Math.round(base * (1 - dp / 100) * 100) / 100;
  }
  return (
    <div className="px-5 py-4 hover:bg-[#FAFAFA] transition-colors">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[#181725] truncate">{item.product.name}</p>
          <p className="text-[11px] text-[#AEAEAE]">
            {item.product.sku ? <span className="font-mono">{item.product.sku} · </span> : null}
            {item.product.packSize ?? item.product.unit ?? ''} · Base ₹{base.toFixed(2)}
          </p>
          {effective != null && (
            <p className="text-[11px] mt-1">
              <span className="text-[#AEAEAE]">They pay </span>
              <span className="font-bold text-primary">₹{effective.toFixed(2)}</span>
              {item.pricingType === 'discount' && <span className="text-[#AEAEAE]"> (-{item.discountPercent || 0}% base)</span>}
              {item.pricingType === 'scheme' && item.schemeMinQty && (
                <span className="text-[#AEAEAE]"> at {item.schemeMinQty}+ pcs{item.schemeFreeQty ? `, +${item.schemeFreeQty} free` : ''}</span>
              )}
              {effective < base && item.pricingType !== 'discount' && (
                <span className="text-[#AEAEAE] line-through ml-1.5">₹{base.toFixed(2)}</span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-start gap-3">
          {/* Pricing type picker */}
          <div>
            <label className="block text-[10.5px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1">Type</label>
            <select
              value={item.pricingType}
              onChange={(e) => onUpdate({ pricingType: e.target.value as PricingType })}
              className="h-[32px] px-2 rounded-[8px] border border-[#EEEEEE] text-[12px] bg-white"
            >
              <option value="fixed">Fixed</option>
              <option value="discount">Adjustment %</option>
              <option value="special">Special</option>
              <option value="scheme">Scheme</option>
            </select>
          </div>

          {/* Conditional fields per type */}
          {(item.pricingType === 'fixed' || item.pricingType === 'special') && (
            <div>
              <label className="block text-[10.5px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1">Price (₹)</label>
              <input
                type="number" min="0" step="0.01"
                value={item.customPrice}
                onChange={(e) => onUpdate({ customPrice: e.target.value })}
                className="w-[110px] h-[32px] px-2 rounded-[8px] border border-[#EEEEEE] text-[12px] text-right outline-none focus:border-primary/50 bg-white"
              />
            </div>
          )}
          {item.pricingType === 'discount' && (
            <div>
              <label className="block text-[10.5px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1">Adjustment (%)</label>
              <input
                type="number" min="0" max="100" step="0.1"
                value={item.discountPercent}
                onChange={(e) => onUpdate({ discountPercent: e.target.value })}
                className="w-[110px] h-[32px] px-2 rounded-[8px] border border-[#EEEEEE] text-[12px] text-right outline-none focus:border-primary/50 bg-white"
              />
            </div>
          )}
          {item.pricingType === 'scheme' && (
            <>
              <div>
                <label className="block text-[10.5px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1">Min Qty</label>
                <input
                  type="number" min="1" step="1"
                  value={item.schemeMinQty}
                  onChange={(e) => onUpdate({ schemeMinQty: e.target.value })}
                  className="w-[80px] h-[32px] px-2 rounded-[8px] border border-[#EEEEEE] text-[12px] text-right outline-none focus:border-primary/50 bg-white"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1">Then ₹</label>
                <input
                  type="number" min="0" step="0.01"
                  value={item.customPrice}
                  onChange={(e) => onUpdate({ customPrice: e.target.value })}
                  className="w-[100px] h-[32px] px-2 rounded-[8px] border border-[#EEEEEE] text-[12px] text-right outline-none focus:border-primary/50 bg-white"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1">Free Qty</label>
                <input
                  type="number" min="0" step="1"
                  value={item.schemeFreeQty}
                  onChange={(e) => onUpdate({ schemeFreeQty: e.target.value })}
                  className="w-[80px] h-[32px] px-2 rounded-[8px] border border-[#EEEEEE] text-[12px] text-right outline-none focus:border-primary/50 bg-white"
                />
              </div>
            </>
          )}

          <button
            onClick={onRemove}
            className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] hover:bg-[#FFF0F0] transition-colors text-[#E74C3C] mt-[18px]"
            title="Remove from list"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assignment value picker ──────────────────────────────────────────
function AssignmentValuePicker({
  type, value, onChange, outletOpts, brandOpts, customerOpts, groupOpts,
}: {
  type: AssignmentType;
  value: string;
  onChange: (v: string) => void;
  outletOpts: OutletOption[];
  brandOpts: BrandOption[];
  customerOpts: VendorCustomerOption[];
  groupOpts: GroupOption[];
}) {
  const base = 'w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] bg-white';
  if (type === 'pincode') {
    return (
      <input
        type="text" maxLength={10}
        value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="400001" inputMode="numeric"
        className={base}
      />
    );
  }
  if (type === 'area') {
    return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Mumbai" className={base} />;
  }
  if (type === 'segment') {
    return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="vip / cafe / school" className={base} />;
  }
  if (type === 'outlet') {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={base}>
        <option value="">— select outlet —</option>
        {outletOpts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.businessName ? `${o.businessName} — ` : ''}{o.name}{o.pincode ? ` · ${o.pincode}` : ''}
          </option>
        ))}
      </select>
    );
  }
  if (type === 'brand') {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={base}>
        <option value="">— select brand —</option>
        {brandOpts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    );
  }
  if (type === 'customer') {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={base}>
        <option value="">— select customer —</option>
        {customerOpts.map((c) => <option key={c.userId} value={c.userId}>{c.label}</option>)}
      </select>
    );
  }
  if (type === 'group') {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={base}>
        <option value="">— select group —</option>
        {groupOpts.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
    );
  }
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────

// Convert a stored ISO datetime (or null) into a yyyy-MM-dd value for a
// native <input type="date">. Returns '' when there's no date.
function isoToDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

// Convert a yyyy-MM-dd date-input value back into an ISO datetime string,
// or null when the field is blank.
function dateInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

const ASSIGN_STYLE: Record<AssignmentType, { bg: string; text: string }> = {
  customer: { bg: 'bg-blue-50',    text: 'text-blue-700' },
  outlet:   { bg: 'bg-success-light', text: 'text-success' },
  pincode:  { bg: 'bg-amber-50',   text: 'text-amber-700' },
  area:     { bg: 'bg-purple-50',  text: 'text-purple-700' },
  segment:  { bg: 'bg-pink-50',    text: 'text-pink-700' },
  brand:    { bg: 'bg-indigo-50',  text: 'text-indigo-700' },
  group:    { bg: 'bg-teal-50',    text: 'text-teal-700' },
};

function assignmentChipLabel(a: ApiAssignment): string {
  switch (a.type) {
    case 'customer': return a.user?.fullName ?? a.businessAccount?.legalName ?? a.userId ?? a.businessAccountId ?? '?';
    case 'outlet':   return a.outlet?.name ?? a.outletId ?? '?';
    case 'pincode':  return a.pincode ?? '?';
    case 'area':     return a.area ?? '?';
    case 'segment':  return a.segment ?? '?';
    case 'brand':    return a.brand?.name ?? a.brandName ?? '?';
    case 'group':    return a.group?.name ?? a.groupId ?? '?';
  }
}

function buildAssignmentDraft(
  type: AssignmentType,
  value: string,
  opts: { outletOpts: OutletOption[]; brandOpts: BrandOption[]; customerOpts: VendorCustomerOption[]; groupOpts: GroupOption[] },
): AssignmentDraft | null {
  const v = value.trim();
  if (!v) return null;
  switch (type) {
    case 'pincode': return { type, pincode: v, label: v };
    case 'area':    return { type, area: v, label: v };
    case 'segment': return { type, segment: v, label: v };
    case 'outlet': {
      const o = opts.outletOpts.find((x) => x.id === v);
      return { type, outletId: v, label: o?.name ?? v };
    }
    case 'brand': {
      const b = opts.brandOpts.find((x) => x.id === v);
      // Send brandName too: products without a verified brand mapping
      // still match by free-text brand name in the pricing resolver.
      return { type, brandId: v, brandName: b?.name, label: b?.name ?? v };
    }
    case 'customer': {
      const c = opts.customerOpts.find((x) => x.userId === v);
      return { type, userId: v, label: c?.label ?? v };
    }
    case 'group': {
      const g = opts.groupOpts.find((x) => x.id === v);
      return { type, groupId: v, label: g?.name ?? v };
    }
  }
}

void Sparkles;  // currently unused but reserved for "Special" badge in future UI
void AlertCircle;
