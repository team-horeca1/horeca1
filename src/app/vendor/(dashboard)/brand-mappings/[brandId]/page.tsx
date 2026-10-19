'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  GitMerge, Search, Loader2, Package, Unlink, ChevronLeft, ChevronRight,
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
  mappingStatus: 'mapped' | 'unmapped';
  linkStatus: 'auto_mapped' | 'verified' | null;
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
  const [openMapId, setOpenMapId] = useState<string | null>(null);
  const [mapQuery, setMapQuery] = useState('');
  const [catalog, setCatalog] = useState<BrandCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [saving, setSaving] = useState(false);

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

  const linksByMaster = useMemo(() => {
    const map = new Map<string, TableRow[]>();
    for (const row of rows) {
      if (row.mappingStatus !== 'mapped' || !row.brandMasterProductId) continue;
      if (row.brandId && row.brandId !== brandId) continue;
      const list = map.get(row.brandMasterProductId) ?? [];
      list.push(row);
      map.set(row.brandMasterProductId, list);
    }
    return map;
  }, [rows, brandId]);

  const counts = useMemo(() => {
    let mapped = 0;
    for (const item of catalog) {
      if (linksByMaster.has(item.id)) mapped += 1;
    }
    return { all: catalog.length, mapped, unmapped: catalog.length - mapped };
  }, [catalog, linksByMaster]);

  const visibleCatalog = useMemo(() => {
    if (statusFilter === 'mapped') return catalog.filter((item) => linksByMaster.has(item.id));
    if (statusFilter === 'unmapped') return catalog.filter((item) => !linksByMaster.has(item.id));
    return catalog;
  }, [catalog, statusFilter, linksByMaster]);

  const unmappedVendorProducts = useMemo(() => {
    const mappedProductIds = new Set<string>();
    for (const row of rows) {
      if (row.mappingStatus === 'mapped') mappedProductIds.add(row.productId);
    }
    const byId = new Map<string, TableRow>();
    for (const row of rows) {
      if (mappedProductIds.has(row.productId) || byId.has(row.productId)) continue;
      byId.set(row.productId, row);
    }
    return [...byId.values()];
  }, [rows]);

  const mapMatches = useMemo(() => {
    const q = mapQuery.trim().toLowerCase();
    if (!q) return [];
    return unmappedVendorProducts
      .filter((row) =>
        row.distributorProductName.toLowerCase().includes(q)
        || (row.distributorPackSize?.toLowerCase().includes(q) ?? false)
        || (row.distributorCategory?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 8);
  }, [mapQuery, unmappedVendorProducts]);

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
      toast.success(`Mapped to ${master.name}`);
      setOpenMapId(null);
      setMapQuery('');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Mapping failed');
    } finally {
      setSaving(false);
    }
  };

  const openMapSearch = (masterId: string) => {
    setOpenMapId(masterId);
    setMapQuery('');
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
    { key: 'all', label: 'All', count: counts.mapped + counts.unmapped },
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

        <div className="flex gap-0.5 bg-white p-0.5 rounded-[8px] border border-[#E9E3DD]">
          {statusTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusFilter(t.key)}
              className={cn(
                'px-2.5 h-7 rounded-[8px] text-[11px] font-bold transition-colors flex items-center gap-1',
                statusFilter === t.key ? 'bg-[#1C1C1C] text-white' : 'text-[#6B7280] hover:text-[#1C1C1C]',
              )}
            >
              {t.label}
              <span className="text-[10px] tabular-nums">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="relative ml-auto w-full sm:w-[240px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
          <input
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
            placeholder="Search brand SKUs"
            disabled={!brandId}
            className="w-full h-8 pl-8 pr-2 border border-[#E9E3DD] rounded-[8px] text-[12px] bg-white disabled:opacity-50 outline-none focus:border-[#6B1D2E]"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 mt-3 overflow-y-auto">
        <div className="flex flex-col min-h-0">
          <div>
            {!brandId ? (
              <p className="text-[12px] text-gray-400 text-center py-10">Select a brand</p>
            ) : catalogLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 size={18} className="animate-spin text-primary" />
              </div>
            ) : visibleCatalog.length === 0 ? (
              <p className="text-[13px] text-[#6B7280] text-center py-12">
                {statusFilter === 'mapped' ? 'Nothing mapped yet' : 'No brand products in this view'}
              </p>
            ) : (
              visibleCatalog.map((item) => {
                const links = linksByMaster.get(item.id) ?? [];
                const searching = openMapId === item.id;
                const category = brandCategoryLabel(item);
                const meta = [
                  formatPackSize(item.packSize, item.unit),
                  item.sku,
                  category,
                ].filter(Boolean).join(' · ');
                return (
                  <div
                    key={item.id}
                    className="mb-2 flex flex-col gap-3 rounded-[8px] border border-[#E9E3DD] bg-white px-4 py-3 sm:flex-row sm:items-start"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <ProductThumb src={item.imageUrl} alt="" className="h-10 w-10 rounded-[8px]" />
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-[#1C1C1C]">{item.name}</p>
                        <p className="truncate text-[12px] text-[#6B7280]">{meta || '—'}</p>
                      </div>
                    </div>

                    {links.length > 0 ? (
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        {links.map((link) => (
                          <div key={link.mappingId ?? link.productId} className="flex min-w-0 items-center gap-2">
                            <ChevronRight size={16} className="shrink-0 text-[#AEAEAE]" aria-hidden />
                            <ProductThumb src={link.distributorImage} alt="" className="h-8 w-8 rounded-[8px]" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-[#1C1C1C]">{link.distributorProductName}</p>
                              <p className="truncate text-[11px] text-[#6B7280]">
                                {[link.distributorPackSize, link.distributorCategory].filter(Boolean).join(' · ') || 'Your product'}
                              </p>
                            </div>
                            {link.mappingId && (
                              <button
                                type="button"
                                onClick={(e) => handleUnlink(link, e)}
                                disabled={saving}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#6B7280] hover:bg-[#F8E8EC] hover:text-[#6B1D2E] disabled:opacity-40"
                                title="Unlink"
                                aria-label={`Unlink ${link.distributorProductName}`}
                              >
                                <Unlink size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : searching ? (
                      <div className="w-full sm:w-[320px] sm:shrink-0">
                        <div className="relative">
                          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                          <input
                            autoFocus
                            value={mapQuery}
                            onChange={(e) => setMapQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setOpenMapId(null);
                                setMapQuery('');
                              }
                            }}
                            placeholder="Search your products"
                            className="h-10 w-full rounded-[8px] border border-[#E9E3DD] bg-white pl-9 pr-16 text-[13px] text-[#1C1C1C] shadow-[0_8px_24px_rgba(28,28,28,0.08)] outline-none focus:border-[#6B1D2E]"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMapId(null);
                              setMapQuery('');
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] font-medium text-[#6B7280] hover:text-[#1C1C1C]"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="mt-1 overflow-hidden rounded-[8px] border border-[#E9E3DD] bg-white shadow-[0_12px_28px_rgba(28,28,28,0.12)]">
                          {mapQuery.trim().length === 0 ? (
                            <p className="px-3 py-3 text-[12px] text-[#6B7280]">Type to find your product</p>
                          ) : mapMatches.length === 0 ? (
                            <p className="px-3 py-3 text-[12px] text-[#6B7280]">No matching product</p>
                          ) : (
                            mapMatches.map((match) => (
                              <button
                                key={match.productId}
                                type="button"
                                disabled={saving}
                                onClick={() => void saveMapping(match.productId, item)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#F8E8EC] disabled:opacity-50"
                              >
                                <ProductThumb src={match.distributorImage} alt="" />
                                <span className="min-w-0">
                                  <span className="block truncate text-[13px] font-semibold text-[#1C1C1C]">{match.distributorProductName}</span>
                                  <span className="block truncate text-[11px] text-[#6B7280]">
                                    {[match.distributorPackSize, match.distributorCategory].filter(Boolean).join(' · ') || 'Your product'}
                                  </span>
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => openMapSearch(item.id)}
                        className="h-9 shrink-0 self-center rounded-[8px] border border-[#6B1D2E] px-3 text-[13px] font-semibold text-[#6B1D2E] hover:bg-[#F8E8EC] disabled:opacity-40"
                      >
                        Map
                      </button>
                    )}
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
