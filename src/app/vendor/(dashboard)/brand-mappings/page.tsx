'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import {
    GitMerge, Search, Check, Loader2, Package, Unlink, X, Sparkles, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatPackSize } from '@/lib/utils';

interface BrandOption {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
}

interface BrandCatalogItem {
    id: string;
    name: string;
    packSize: string | null;
    unit: string | null;
    sku: string | null;
    imageUrl: string | null;
    brand: BrandOption;
}

interface TableRow {
    productId: string;
    distributorProductName: string;
    distributorPackSize: string | null;
    distributorImage: string | null;
    basePrice: number;
    brandId: string | null;
    brandName: string | null;
    brandMasterProductId: string | null;
    brandItemName: string | null;
    brandPackSize: string | null;
    brandSku: string | null;
    mappingId: string | null;
    mappingStatus: 'mapped' | 'pending' | 'unmapped';
    linkStatus: 'auto_mapped' | 'verified' | 'pending_review' | null;
}

type StatusFilter = 'all' | 'mapped' | 'pending' | 'unmapped';

function ProductThumb({ src, alt }: { src: string | null; alt: string }) {
    return (
        <div className="w-8 h-8 rounded-md bg-gray-100 relative shrink-0 overflow-hidden border border-gray-100">
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

export default function VendorBrandMappingsPage() {
    const [rows, setRows] = useState<TableRow[]>([]);
    const [brands, setBrands] = useState<BrandOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [brandId, setBrandId] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('unmapped');
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [vendorSearch, setVendorSearch] = useState('');
    const [catalog, setCatalog] = useState<BrandCatalogItem[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogSearch, setCatalogSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [suggesting, setSuggesting] = useState(false);
    const [hasAuthorizedBrands, setHasAuthorizedBrands] = useState(true);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const qs = new URLSearchParams({ view: 'table' });
            if (brandId) qs.set('brandId', brandId);
            const r = await fetch(`/api/v1/vendor/brand-mappings?${qs}`);
            const j = await r.json();
            if (j.success) {
                setRows(j.data.rows ?? []);
                const loadedBrands = j.data.brands ?? [];
                setBrands(loadedBrands);
                setHasAuthorizedBrands(j.data.hasAuthorizedBrands !== false);
                if (!brandId && loadedBrands.length >= 1) {
                    setBrandId(loadedBrands[0].id);
                }
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [brandId]);

    useEffect(() => { load(); }, [load]);

    const loadCatalog = useCallback(async (bid: string, q: string) => {
        if (!bid) { setCatalog([]); return; }
        setCatalogLoading(true);
        try {
            const qs = new URLSearchParams({ brandId: bid, limit: '80' });
            if (q.trim().length >= 1) qs.set('q', q.trim());
            const r = await fetch(`/api/v1/brand-master-products?${qs}`);
            const j = await r.json();
            setCatalog(j.data?.products ?? []);
        } catch { setCatalog([]); }
        finally { setCatalogLoading(false); }
    }, []);

    useEffect(() => {
        if (!brandId) return;
        const t = setTimeout(() => loadCatalog(brandId, catalogSearch), 200);
        return () => clearTimeout(t);
    }, [brandId, catalogSearch, loadCatalog]);

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
        if (q) list = list.filter((r) => r.distributorProductName.toLowerCase().includes(q));
        return list;
    }, [rows, vendorSearch, brandId, statusFilter]);

    const selectedRow = useMemo(
        () => rows.find((r) => r.productId === selectedProductId) ?? null,
        [rows, selectedProductId],
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
            await load();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Mapping failed');
        } finally {
            setSaving(false);
        }
    };

    const handlePickCatalog = (master: BrandCatalogItem) => {
        if (!selectedProductId || saving) return;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => saveMapping(selectedProductId, master), 150);
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
            toast.success('Unlinked');
            if (selectedProductId === row.productId) setSelectedProductId(null);
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

    const handleSuggest = async () => {
        setSuggesting(true);
        try {
            const r = await fetch('/api/v1/vendor/brand-mappings/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brandId: brandId || undefined }),
            });
            const j = await r.json();
            if (!j.success) throw new Error(j.error?.message || 'Suggest failed');
            toast.success('Suggestions ready — check Pending');
            setStatusFilter('pending');
            await load();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Suggest failed');
        } finally {
            setSuggesting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-7 h-7 animate-spin text-[#53B175]" />
            </div>
        );
    }

    if (!hasAuthorizedBrands) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
                <Package size={36} className="text-gray-200 mb-3" />
                <h1 className="text-[18px] font-bold text-[#181725]">No brand partnerships yet</h1>
                <p className="text-[13px] text-gray-500 mt-1 max-w-sm">A brand must add you as a distributor before you can map products.</p>
            </div>
        );
    }

    const statusTabs: { key: StatusFilter; label: string; count: number }[] = [
        { key: 'unmapped', label: 'Unmapped', count: counts.unmapped },
        { key: 'pending', label: 'Pending', count: counts.pending },
        { key: 'mapped', label: 'Mapped', count: counts.mapped },
        { key: 'all', label: 'All', count: rows.length },
    ];

    return (
        <div className="flex flex-col h-[calc(100vh-8.5rem)] min-h-[480px] -mx-4 -mt-2 animate-in fade-in duration-300">
            {/* Compact toolbar */}
            <div className="shrink-0 flex flex-wrap items-center gap-2 pb-3 border-b border-gray-100">
                <h1 className="text-[17px] font-black text-[#181725] flex items-center gap-1.5 mr-1">
                    <GitMerge size={18} className="text-[#53B175]" />
                    Brand Mappings
                </h1>

                <select
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    className="h-8 border border-gray-200 rounded-lg px-2.5 text-[12px] font-semibold bg-white min-w-[140px]"
                >
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>

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
                            )}>
                                {t.count}
                            </span>
                        </button>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={handleSuggest}
                    disabled={suggesting || !brandId}
                    className="ml-auto h-8 px-3 bg-[#EFF6FF] text-[#2563EB] rounded-lg text-[11px] font-bold hover:bg-[#2563EB] hover:text-white disabled:opacity-50 flex items-center gap-1.5"
                >
                    {suggesting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    Suggest
                </button>
            </div>

            {/* Selection hint */}
            <div className="shrink-0 py-2 flex items-center gap-2 text-[11px] text-gray-500">
                <span className="font-bold text-gray-400">1.</span> Pick your product
                <ArrowRight size={12} className="text-gray-300" />
                <span className="font-bold text-gray-400">2.</span> Click matching brand SKU
                {selectedRow && (
                    <span className="ml-2 text-[#53B175] font-bold truncate max-w-[40%]">
                        → {selectedRow.distributorProductName}
                    </span>
                )}
            </div>

            {/* Full-width split workspace */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Left — vendor products */}
                <div className="flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-gray-100">
                    <div className="shrink-0 px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                        <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide shrink-0">Your products</span>
                        <div className="relative flex-1">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                value={vendorSearch}
                                onChange={(e) => setVendorSearch(e.target.value)}
                                placeholder="Filter…"
                                className="w-full h-8 pl-8 pr-2 border border-gray-200 rounded-lg text-[12px] bg-white"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {vendorProducts.length === 0 ? (
                            <p className="text-[12px] text-gray-400 text-center py-10">No products in this filter</p>
                        ) : vendorProducts.map((row) => (
                            <div
                                key={`${row.productId}-${row.mappingId ?? 'u'}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedProductId(row.productId)}
                                onKeyDown={(e) => e.key === 'Enter' && setSelectedProductId(row.productId)}
                                className={cn(
                                    'w-full flex items-center gap-2 px-3 py-2 text-left border-b border-gray-50 transition-colors cursor-pointer',
                                    selectedProductId === row.productId
                                        ? 'bg-[#EEF8F1] border-l-2 border-l-[#53B175]'
                                        : 'hover:bg-gray-50/80 border-l-2 border-l-transparent',
                                )}
                            >
                                <ProductThumb src={row.distributorImage} alt="" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[12px] font-bold text-[#181725] truncate leading-tight">{row.distributorProductName}</p>
                                    <p className="text-[10px] text-gray-400 truncate">
                                        {row.distributorPackSize ?? '—'}
                                        {row.brandItemName && row.mappingStatus !== 'unmapped' && (
                                            <span className="text-[#53B175]"> · {row.brandItemName}</span>
                                        )}
                                    </p>
                                </div>
                                <div className="shrink-0 flex items-center gap-0.5">
                                    {row.mappingStatus === 'pending' && (
                                        <>
                                            <button type="button" onClick={(e) => handleConfirmPending(row, e)} disabled={saving}
                                                className="p-1 rounded hover:bg-green-100 text-[#53B175]" title="Confirm">
                                                <Check size={13} />
                                            </button>
                                            <button type="button" onClick={(e) => handleRejectPending(row, e)} disabled={saving}
                                                className="p-1 rounded hover:bg-red-100 text-red-500" title="Reject">
                                                <X size={13} />
                                            </button>
                                        </>
                                    )}
                                    {row.mappingStatus === 'mapped' && (
                                        <button type="button" onClick={(e) => handleUnlink(row, e)} disabled={saving}
                                            className="p-1 rounded hover:bg-red-100 text-red-500" title="Unlink">
                                            <Unlink size={13} />
                                        </button>
                                    )}
                                    {row.mappingStatus === 'unmapped' && (
                                        <span className="text-[9px] font-bold text-gray-400 uppercase px-1">New</span>
                                    )}
                                    {row.mappingStatus === 'pending' && (
                                        <span className="text-[9px] font-bold text-amber-600 uppercase px-1">?</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right — brand catalog */}
                <div className="flex flex-col min-h-0">
                    <div className="shrink-0 px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                        <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide shrink-0">Brand catalog</span>
                        <div className="relative flex-1">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                value={catalogSearch}
                                onChange={(e) => setCatalogSearch(e.target.value)}
                                placeholder="Search brand SKUs…"
                                disabled={!brandId}
                                className="w-full h-8 pl-8 pr-2 border border-gray-200 rounded-lg text-[12px] bg-white disabled:opacity-50"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {!brandId ? (
                            <p className="text-[12px] text-gray-400 text-center py-10">Select a brand</p>
                        ) : catalogLoading ? (
                            <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-[#53B175]" /></div>
                        ) : catalog.length === 0 ? (
                            <p className="text-[12px] text-gray-400 text-center py-10">No SKUs found</p>
                        ) : catalog.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                disabled={!selectedProductId || saving}
                                onClick={() => handlePickCatalog(item)}
                                className={cn(
                                    'w-full flex items-center gap-2 px-3 py-2 text-left border-b border-gray-50 transition-colors',
                                    selectedProductId
                                        ? 'hover:bg-[#EEF8F1] cursor-pointer'
                                        : 'opacity-50 cursor-not-allowed',
                                )}
                            >
                                <ProductThumb src={item.imageUrl} alt="" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[12px] font-bold text-[#181725] truncate leading-tight">{item.name}</p>
                                    <p className="text-[10px] text-gray-400 truncate">
                                        {formatPackSize(item.packSize, item.unit) || '—'}
                                        {item.sku ? ` · ${item.sku}` : ''}
                                    </p>
                                </div>
                                {selectedProductId && (
                                    <span className="text-[10px] font-bold text-[#53B175] shrink-0">Map</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
