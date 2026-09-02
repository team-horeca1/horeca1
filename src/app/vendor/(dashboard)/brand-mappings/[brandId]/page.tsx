'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  GitMerge, Search, Check, Loader2, Package, Unlink, X, ArrowRight, ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatPackSize } from '@/lib/utils';

interface BrandOption {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  authStatus?: 'none' | 'pending' | 'approved' | 'rejected';
}

interface BrandCatalogItem {
  id: string;
  name: string;
  packSize: string | null;
  unit: string | null;
  sku: string | null;
  imageUrl: string | null;
  category: string | null;
  categoryRel: { id: string; name: string } | null;
  brand: BrandOption;
}

interface TableRow {
  productId: string;
  distributorProductName: string;
  distributorPackSize: string | null;
  distributorImage: string | null;
  distributorCategory: string | null;
  basePrice: number;
  brandId: string | null;
  brandName: string | null;
  brandMasterProductId: string | null;
  brandItemName: string | null;
  brandPackSize: string | null;
  brandSku: string | null;
  brandImage: string | null;
  brandCategory: string | null;
  mappingId: string | null;
  mappingStatus: 'mapped' | 'pending' | 'unmapped';
  linkStatus: 'auto_mapped' | 'verified' | 'pending_review' | null;
}

type StatusFilter = 'all' | 'mapped' | 'unmapped';

function ProductThumb({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  return (
    <div className={cn('w-8 h-8 rounded-md bg-gray-100 relative shrink-0 overflow-hidden border border-gray-100', className)}>
      {src ? (
        <Image src={src} alt={alt} fill sizes="32px" className="object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Package size={12} className="text-gray-300" />
        </div>
      )}
    </div>
  );
}

function brandCategoryLabel(item: BrandCatalogItem): string | null {
  return item.categoryRel?.name ?? item.category ?? null;
}

export default function VendorBrandMappingWorkspacePage() {
  const params = useParams<{ brandId: string }>();
  const brandId = typeof params.brandId === 'string' ? params.brandId : '';

  const [rows, setRows] = useState<TableRow[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null);
  const [vendorSearch, setVendorSearch] = useState('');
  const [catalog, setCatalog] = useState<BrandCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeBrand = useMemo(
    () => brands.find((b) => b.id === brandId) ?? null,
    [brands, brandId],
  );

  const load = useCallback(async () => {
    if (!brandId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams({ view: 'table', brandId });
      const r = await fetch(`/api/v1/vendor/brand-mappings?${qs}`);
      const j = await r.json();
      if (j.success) {
        setRows(j.data.rows ?? []);
        setBrands(j.data.brands ?? []);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadCatalog = useCallback(async (bid: string, q: string) => {
    if (!bid) {
      setCatalog([]);
      return;
    }
    setCatalogLoading(true);
    try {
      const qs = new URLSearchParams({ brandId: bid, limit: '80' });
      if (q.trim().length >= 1) qs.set('q', q.trim());
      const r = await fetch(`/api/v1/brand-master-products?${qs}`);
      const j = await r.json();
      setCatalog(j.data?.products ?? []);
    } catch {
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!brandId) return;
    const t = setTimeout(() => loadCatalog(brandId, catalogSearch), 200);
    return () => clearTimeout(t);
  }, [brandId, catalogSearch, loadCatalog]);

  const mappedMasterIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.brandMasterProductId && (r.mappingStatus === 'mapped' || r.mappingStatus === 'pending')) {
        ids.add(r.brandMasterProductId);
      }
    }
    return ids;
  }, [rows]);

  const counts = useMemo(() => ({
    mapped: rows.filter((r) => r.mappingStatus === 'mapped').length,
    pending: rows.filter((r) => r.mappingStatus === 'pending').length,
    unmapped: rows.filter((r) => r.mappingStatus === 'unmapped').length,
  }), [rows]);

  const vendorProducts = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    const byProduct = new Map<string, TableRow[]>();
    for (const r of rows) {
      const list = byProduct.get(r.productId) ?? [];
      list.push(r);
      byProduct.set(r.productId, list);
    }

    const pick = (items: TableRow[]): TableRow => {
      const forBrand = items.find((i) => i.brandId === brandId && i.mappingStatus !== 'unmapped');
      if (forBrand) return forBrand;
      const pending = items.find((i) => i.mappingStatus === 'pending');
      if (pending) return pending;
      const mapped = items.find((i) => i.mappingStatus === 'mapped');
      if (mapped) return mapped;
      return items[0];
    };

    let list = [...byProduct.values()].map(pick);

    if (brandId) {
      list = list.filter((r) =>
        r.mappingStatus === 'unmapped'
        || !r.brandId
        || r.brandId === brandId,
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.mappingStatus === statusFilter);
    }
    if (q) {
      list = list.filter((r) =>
        r.distributorProductName.toLowerCase().includes(q)
        || (r.brandItemName?.toLowerCase().includes(q) ?? false),
      );
    }
    return list;
  }, [rows, vendorSearch, brandId, statusFilter]);

  const selectedMaster = useMemo(
    () => catalog.find((c) => c.id === selectedMasterId) ?? null,
    [catalog, selectedMasterId],
  );

  const saveMapping = async (productId: string, master: BrandCatalogItem) => {
    setSaving(true);
    try {
      const r = await fetch('/api/v1/vendor/brand-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distributorProductId: productId, brandMasterProductId: master.id }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error?.message || 'Mapping failed');
      toast.success(`Mapped → ${master.name}`);
      setSelectedMasterId(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Mapping failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePickVendorProduct = (row: TableRow) => {
    if (!selectedMaster || saving) return;
    if (row.mappingStatus === 'mapped' || row.mappingStatus === 'pending') {
      toast.error('Unlink this product first, or pick an unmapped SKU');
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveMapping(row.productId, selectedMaster), 150);
  };

  const handleConfirmPending = async (row: TableRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!row.mappingId) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/v1/vendor/brand-mappings/${row.mappingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'verified' }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error?.message || 'Confirm failed');
      toast.success('Confirmed');
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Confirm failed');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (row: TableRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!row.mappingId) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/v1/vendor/brand-mappings/${row.mappingId}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.error?.message || 'Unlink failed');
      toast.success('Unlinked — supplier values restored');
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unlink failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRejectPending = async (row: TableRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!row.mappingId) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/v1/vendor/brand-mappings/${row.mappingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error?.message || 'Reject failed');
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!brandId || (!loading && brands.length > 0 && !activeBrand)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <Package size={36} className="text-gray-200 mb-3" />
        <h1 className="text-[18px] font-bold text-[#181725]">Brand not found</h1>
        <p className="text-[13px] text-gray-500 mt-1 max-w-sm">This brand is unavailable or no longer approved.</p>
        <Link
          href="/vendor/brand-mappings"
          className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-primary hover:underline"
        >
          <ChevronLeft size={14} />
          Back to brands
        </Link>
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <Package size={36} className="text-gray-200 mb-3" />
        <h1 className="text-[18px] font-bold text-[#181725]">No brands available</h1>
        <p className="text-[13px] text-gray-500 mt-1 max-w-sm">There are no approved brands to map yet. Check back once brands join the platform.</p>
        <Link
          href="/vendor/brand-mappings"
          className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-primary hover:underline"
        >
          <ChevronLeft size={14} />
          Back to brands
        </Link>
      </div>
    );
  }

  const statusTabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.mapped + counts.pending + counts.unmapped },
    { key: 'unmapped', label: 'Unmapped', count: counts.unmapped },
    { key: 'mapped', label: 'Mapped', count: counts.mapped },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] min-h-[480px] -mx-4 -mt-2 animate-in fade-in duration-300">
      {/* Compact toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 pb-3 border-b border-gray-100">
        <Link
          href="/vendor/brand-mappings"
          className="h-8 px-2 rounded-lg text-[12px] font-bold text-gray-500 hover:text-[#181725] hover:bg-gray-50 flex items-center gap-1"
        >
          <ChevronLeft size={14} />
          Brands
        </Link>

        <h1 className="text-[17px] font-black text-[#181725] flex items-center gap-1.5 mr-1">
          <GitMerge size={18} className="text-primary" />
          {activeBrand?.name ?? 'Brand Mappings'}
        </h1>

        <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg">
          {statusTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusFilter(t.key)}
              className={cn(
                'px-2.5 h-7 rounded-md text-[11px] font-bold transition-colors flex items-center gap-1',
                statusFilter === t.key ? 'bg-white text-[#181725] shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {t.label}
              <span className={cn(
                'text-[10px] px-1 rounded',
                statusFilter === t.key ? 'bg-gray-100' : 'bg-transparent',
              )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Selection hint */}
      <div className="shrink-0 py-2 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="font-bold text-gray-400">1.</span>
        Pick brand product
        <ArrowRight size={12} className="text-gray-300" />
        <span className="font-bold text-gray-400">2.</span>
        Click your matching SKU
        {selectedMaster && (
          <span className="ml-2 text-primary font-bold truncate max-w-[40%]">
            → {selectedMaster.name}
          </span>
        )}
      </div>

      {/* Full-width split workspace: left = brand, right = vendor */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Left — brand products */}
        <div className="flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-gray-100">
          <div className="sticky top-0 z-10 shrink-0 px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide shrink-0">
              Brand products
            </span>
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search brand SKUs…"
                disabled={!brandId}
                className="w-full h-8 pl-8 pr-2 border border-gray-200 rounded-lg text-[12px] bg-white disabled:opacity-50 outline-none focus:border-primary/50"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!brandId ? (
              <p className="text-[12px] text-gray-400 text-center py-10">Select a brand</p>
            ) : catalogLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 size={18} className="animate-spin text-primary" />
              </div>
            ) : catalog.length === 0 ? (
              <p className="text-[12px] text-gray-400 text-center py-10">No SKUs found</p>
            ) : (
              catalog.map((item) => {
                const alreadyMapped = mappedMasterIds.has(item.id);
                const selected = selectedMasterId === item.id;
                const category = brandCategoryLabel(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={saving}
                    onClick={() => setSelectedMasterId(selected ? null : item.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-left border-b border-gray-50 transition-colors',
                      selected
                        ? 'bg-primary-light border-l-2 border-l-primary'
                        : 'hover:bg-gray-50/80 border-l-2 border-l-transparent',
                    )}
                  >
                    <ProductThumb src={item.imageUrl} alt="" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold text-[#181725] truncate leading-tight">{item.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {formatPackSize(item.packSize, item.unit) || '—'}
                        {item.sku ? ` · ${item.sku}` : ''}
                        {category ? ` · ${category}` : ''}
                      </p>
                    </div>
                    {alreadyMapped && (
                      <span className="text-[9px] font-bold text-primary uppercase px-1.5 py-0.5 bg-primary-light rounded shrink-0">
                        Linked
                      </span>
                    )}
                    {selected && !alreadyMapped && (
                      <span className="text-[10px] font-bold text-primary shrink-0">Selected</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right — my products */}
        <div className="flex flex-col min-h-0">
          <div className="sticky top-0 z-10 shrink-0 px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide shrink-0">
              My products
            </span>
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                placeholder="Filter…"
                className="w-full h-8 pl-8 pr-2 border border-gray-200 rounded-lg text-[12px] bg-white outline-none focus:border-primary/50"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {vendorProducts.length === 0 ? (
              <p className="text-[12px] text-gray-400 text-center py-10">No products in this filter</p>
            ) : (
              vendorProducts.map((row) => {
                const isOverride = row.mappingStatus === 'mapped' || row.mappingStatus === 'pending';
                const canLink = Boolean(selectedMaster) && row.mappingStatus === 'unmapped' && !saving;

                return (
                  <div
                    key={`${row.productId}-${row.mappingId ?? 'u'}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (canLink) handlePickVendorProduct(row);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && canLink) handlePickVendorProduct(row);
                    }}
                    className={cn(
                      'w-full flex items-start gap-2 px-3 py-2.5 text-left border-b border-gray-50 transition-colors',
                      canLink
                        ? 'hover:bg-primary-light cursor-pointer border-l-2 border-l-transparent hover:border-l-primary'
                        : isOverride
                          ? 'border-l-2 border-l-primary/40 bg-[#FAFDFB]'
                          : 'border-l-2 border-l-transparent',
                      !canLink && !isOverride && selectedMaster && 'opacity-60',
                    )}
                  >
                    {isOverride ? (
                      <>
                        <ProductThumb src={row.brandImage} alt="" className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary-light text-primary">
                              Brand override
                            </span>
                            {row.mappingStatus === 'pending' && (
                              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                                Pending
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] font-bold text-[#181725] truncate leading-tight">
                            {row.brandItemName}
                          </p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {[row.brandPackSize, row.brandCategory].filter(Boolean).join(' · ') || '—'}
                          </p>
                          <div className="mt-1.5 flex items-center gap-1.5 opacity-70">
                            <ProductThumb src={row.distributorImage} alt="" className="w-5 h-5 opacity-60" />
                            <div className="min-w-0">
                              <p className="text-[10px] text-gray-400 line-through truncate">
                                {row.distributorProductName}
                              </p>
                              <p className="text-[9px] text-gray-300 line-through truncate">
                                {[row.distributorPackSize, row.distributorCategory].filter(Boolean).join(' · ') || '—'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <ProductThumb src={row.distributorImage} alt="" className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold text-[#181725] truncate leading-tight">
                            {row.distributorProductName}
                          </p>
                          <p className="text-[10px] text-gray-400 truncate">
                            {[row.distributorPackSize, row.distributorCategory].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </div>
                      </>
                    )}

                    <div className="shrink-0 flex items-center gap-0.5 pt-0.5">
                      {row.mappingStatus === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => handleConfirmPending(row, e)}
                            disabled={saving}
                            className="p-1 rounded hover:bg-primary-light text-primary"
                            title="Confirm"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleRejectPending(row, e)}
                            disabled={saving}
                            className="p-1 rounded hover:bg-red-100 text-red-500"
                            title="Reject suggestion"
                          >
                            <X size={13} />
                          </button>
                        </>
                      )}
                      {row.mappingStatus === 'mapped' && row.mappingId && (
                        <button
                          type="button"
                          onClick={(e) => handleUnlink(row, e)}
                          disabled={saving}
                          className="p-1 rounded hover:bg-red-100 text-red-500"
                          title="Unlink — revert to supplier values"
                        >
                          <Unlink size={13} />
                        </button>
                      )}
                      {row.mappingStatus === 'unmapped' && canLink && (
                        <span className="text-[10px] font-bold text-primary shrink-0">Map</span>
                      )}
                      {row.mappingStatus === 'unmapped' && !selectedMaster && (
                        <span className="text-[9px] font-bold text-gray-400 uppercase px-1">New</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
