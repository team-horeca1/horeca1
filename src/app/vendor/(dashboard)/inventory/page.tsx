'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import {
    Loader2, Package, AlertTriangle, Search, Upload,
    ChevronDown, ChevronUp, X, FileText, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useVendorOutletScope } from '@/hooks/useVendorOutletScope';
import { StockTransferModal } from '@/components/features/vendor/StockTransferModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
    id: string;
    productId: string;
    qtyAvailable: number;
    qtyReserved: number;
    qtyInTransit: number;
    qtyDamaged: number;
    qtyReturned: number;
    lowStockThreshold: number;
    isLowStock: boolean;
    product: {
        id: string;
        name: string;
        sku?: string | null;
        unit?: string | null;
        imageUrl: string | null;
        isActive: boolean;
        basePrice: number;
    };
}

type FilterTab = 'all' | 'low_stock' | 'out_of_stock';

// ─── CSV helpers ──────────────────────────────────────────────────────────────

interface CsvRow { productId: string; qtyAvailable: number; error?: string }

function parseCsv(text: string): CsvRow[] {
    const lines = text.trim().split('\n').filter(Boolean);
    const rows: CsvRow[] = [];
    for (const line of lines) {
        const [rawId, rawQty] = line.split(',').map(s => s.trim());
        if (!rawId || rawId.toLowerCase() === 'productid') continue; // skip header
        const qty = parseInt(rawQty ?? '', 10);
        rows.push({
            productId: rawId,
            qtyAvailable: isNaN(qty) ? 0 : qty,
            error: !rawId.match(/^[0-9a-f-]{36}$/) ? 'Invalid UUID' : isNaN(qty) ? 'Missing qty' : undefined,
        });
    }
    return rows;
}

// ─── CSV Upload Modal ─────────────────────────────────────────────────────────

function CsvUploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [rows, setRows] = useState<CsvRow[]>([]);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => setRows(parseCsv(e.target?.result as string));
        reader.readAsText(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };

    const errorCount = rows.filter(r => r.error).length;
    const validRows = rows.filter(r => !r.error);

    const handleUpload = async () => {
        if (validRows.length === 0) return;
        setUploading(true);
        try {
            const res = await fetch('/api/v1/vendor/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: validRows.map(r => ({ productId: r.productId, qtyAvailable: r.qtyAvailable })) }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Upload failed');
            toast.success(`Updated ${json.updated} product${json.updated !== 1 ? 's' : ''}`);
            onSuccess();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-[560px] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#F5F5F5]">
                    <div>
                        <p className="text-[16px] font-bold text-[#181725]">Bulk Stock Update</p>
                        <p className="text-[12px] text-[#AEAEAE] mt-0.5">Upload a CSV: <span className="font-mono">productId,qtyAvailable</span></p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-[8px] hover:bg-[#F5F5F5] transition-colors">
                        <X size={16} className="text-[#7C7C7C]" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Drop zone */}
                    <div
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => fileRef.current?.click()}
                        className="border-2 border-dashed border-[#EEEEEE] rounded-[12px] p-8 text-center cursor-pointer hover:border-[#299E60]/50 hover:bg-[#EEF8F1]/30 transition-all"
                    >
                        <Upload size={24} className="text-[#AEAEAE] mx-auto mb-2" />
                        <p className="text-[13px] font-bold text-[#181725]">Drop CSV here or click to browse</p>
                        <p className="text-[11px] text-[#AEAEAE] mt-1">Columns: <span className="font-mono">productId, qtyAvailable</span></p>
                        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                    </div>

                    {/* Preview */}
                    {rows.length > 0 && (
                        <div className="rounded-[10px] border border-[#EEEEEE] overflow-hidden">
                            <div className="px-4 py-2.5 bg-[#FAFAFA] border-b border-[#EEEEEE] flex items-center justify-between">
                                <span className="text-[12px] font-bold text-[#181725]">{rows.length} rows parsed</span>
                                {errorCount > 0 && (
                                    <span className="text-[11px] font-bold text-[#E74C3C]">{errorCount} error{errorCount !== 1 ? 's' : ''} — will be skipped</span>
                                )}
                            </div>
                            <div className="max-h-[200px] overflow-y-auto divide-y divide-[#F5F5F5]">
                                {rows.slice(0, 50).map((row, i) => (
                                    <div key={i} className={cn('flex items-center justify-between px-4 py-2', row.error && 'bg-red-50/60')}>
                                        <span className={cn('text-[12px] font-mono', row.error ? 'text-[#E74C3C]' : 'text-[#181725]')}>
                                            {row.productId.slice(0, 18)}…
                                        </span>
                                        {row.error ? (
                                            <span className="text-[11px] text-[#E74C3C] font-bold">{row.error}</span>
                                        ) : (
                                            <span className="text-[12px] font-bold text-[#299E60]">qty → {row.qtyAvailable}</span>
                                        )}
                                    </div>
                                ))}
                                {rows.length > 50 && (
                                    <div className="px-4 py-2 text-[11px] text-[#AEAEAE] text-center">
                                        …and {rows.length - 50} more rows
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-1">
                        <button onClick={onClose} className="flex-1 h-[42px] rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold text-[#7C7C7C] hover:bg-[#F5F5F5] transition-all">
                            Cancel
                        </button>
                        <button
                            onClick={handleUpload}
                            disabled={validRows.length === 0 || uploading}
                            className="flex-1 h-[42px] rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            Import {validRows.length > 0 ? `${validRows.length} rows` : ''}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Inline row component ─────────────────────────────────────────────────────

function InventoryRow({ item, onSaved, outletId }: { item: InventoryItem; onSaved: (updated: Partial<InventoryItem> & { id: string }) => void; outletId?: string | null }) {
    const [qty, setQty] = useState(item.qtyAvailable);
    const [transit, setTransit] = useState(item.qtyInTransit);
    const [damaged, setDamaged] = useState(item.qtyDamaged);
    const [returned, setReturned] = useState(item.qtyReturned);
    const [threshold, setThreshold] = useState(item.lowStockThreshold);
    const [editingThreshold, setEditingThreshold] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync if parent refreshes
    useEffect(() => {
        setQty(item.qtyAvailable);
        setTransit(item.qtyInTransit);
        setDamaged(item.qtyDamaged);
        setReturned(item.qtyReturned);
        setThreshold(item.lowStockThreshold);
        setDirty(false);
    }, [item.qtyAvailable, item.qtyInTransit, item.qtyDamaged, item.qtyReturned, item.lowStockThreshold]);

    const persist = useCallback(async (payload: {
        qtyAvailable?: number;
        qtyInTransit?: number;
        qtyDamaged?: number;
        qtyReturned?: number;
        lowStockThreshold?: number;
    }) => {
        setSaving(true);
        try {
            const res = await fetch('/api/v1/vendor/inventory', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId: item.productId, ...(outletId ? { outletId } : {}), ...payload }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Save failed');
            setDirty(false);
            const newQty = payload.qtyAvailable ?? qty;
            const newThreshold = payload.lowStockThreshold ?? threshold;
            onSaved({
                id: item.id,
                qtyAvailable: newQty,
                qtyInTransit: payload.qtyInTransit ?? transit,
                qtyDamaged: payload.qtyDamaged ?? damaged,
                qtyReturned: payload.qtyReturned ?? returned,
                lowStockThreshold: newThreshold,
                isLowStock: newQty - item.qtyReserved <= newThreshold,
            });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    }, [item.productId, item.id, item.qtyReserved, qty, threshold, transit, damaged, returned, onSaved, outletId]);

    const scheduleAutoSave = (fields: Parameters<typeof persist>[0]) => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        setDirty(true);
        saveTimer.current = setTimeout(() => persist(fields), 900);
    };

    const nudgeQty = (delta: number) => {
        const newQty = Math.max(0, qty + delta);
        setQty(newQty);
        scheduleAutoSave({ qtyAvailable: newQty, lowStockThreshold: threshold });
    };

    const handleQtyInput = (v: string) => {
        const n = parseInt(v, 10);
        if (isNaN(n) || n < 0) return;
        setQty(n);
        scheduleAutoSave({ qtyAvailable: n, lowStockThreshold: threshold });
    };

    const handleBucket = (field: 'qtyInTransit' | 'qtyDamaged' | 'qtyReturned', value: number) => {
        const v = Math.max(0, value);
        if (field === 'qtyInTransit') setTransit(v);
        if (field === 'qtyDamaged') setDamaged(v);
        if (field === 'qtyReturned') setReturned(v);
        scheduleAutoSave({ [field]: v });
    };

    const handleThresholdBlur = () => {
        setEditingThreshold(false);
        if (threshold !== item.lowStockThreshold) scheduleAutoSave({ qtyAvailable: qty, lowStockThreshold: threshold });
    };

    const net = qty - item.qtyReserved;
    const isLow = net <= threshold;

    return (
        <tr className={cn('transition-colors', isLow ? 'bg-red-50/40' : 'hover:bg-[#FAFAFA]')}>
            {/* Product */}
            <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                    <div className="w-[38px] h-[38px] rounded-[8px] bg-[#F1F4F9] overflow-hidden shrink-0 flex items-center justify-center relative">
                        {item.product.imageUrl ? (
                            <Image src={item.product.imageUrl} alt="" fill className="object-cover" unoptimized />
                        ) : (
                            <Package size={15} className="text-[#AEAEAE]" />
                        )}
                    </div>
                    <div>
                        <p className="text-[13px] font-bold text-[#181725] leading-tight">{item.product.name}</p>
                        <p className="text-[11px] text-[#AEAEAE]">
                            {item.product.sku ? `SKU ${item.product.sku}` : `₹${Number(item.product.basePrice).toLocaleString('en-IN')}`}
                            {item.product.unit ? ` · ${item.product.unit}` : ''}
                        </p>
                    </div>
                </div>
            </td>

            {/* Available — inline +/- */}
            <td className="px-5 py-3.5">
                <div className="flex items-center gap-1 justify-center">
                    <button onClick={() => nudgeQty(-1)} className="w-7 h-7 rounded-[6px] border border-[#EEEEEE] flex items-center justify-center text-[#7C7C7C] hover:bg-[#F5F5F5] hover:border-[#E74C3C]/40 hover:text-[#E74C3C] transition-all text-[14px] font-bold leading-none">−</button>
                    <input
                        type="number"
                        value={qty}
                        onChange={e => handleQtyInput(e.target.value)}
                        className="w-[52px] h-7 text-center text-[13px] font-bold text-[#181725] border border-[#EEEEEE] rounded-[6px] outline-none focus:border-[#299E60]/50"
                        min={0}
                    />
                    <button onClick={() => nudgeQty(1)} className="w-7 h-7 rounded-[6px] border border-[#EEEEEE] flex items-center justify-center text-[#7C7C7C] hover:bg-[#EEF8F1] hover:border-[#299E60]/40 hover:text-[#299E60] transition-all text-[14px] font-bold leading-none">+</button>
                    {saving && <Loader2 size={11} className="animate-spin text-[#299E60] ml-0.5" />}
                    {dirty && !saving && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5" />}
                </div>
            </td>

            {/* Reserved */}
            <td className="px-5 py-3.5 text-center text-[13px] text-[#7C7C7C] font-medium">{item.qtyReserved}</td>

            {/* In Transit */}
            <td className="px-5 py-3.5 text-center">
                <input
                    type="number"
                    min={0}
                    value={transit}
                    onChange={(e) => handleBucket('qtyInTransit', parseInt(e.target.value, 10) || 0)}
                    className="w-[52px] h-7 text-center text-[13px] font-medium border border-[#EEEEEE] rounded-[6px] outline-none focus:border-blue-400/50"
                />
            </td>

            {/* Damaged */}
            <td className="px-5 py-3.5 text-center">
                <input
                    type="number"
                    min={0}
                    value={damaged}
                    onChange={(e) => handleBucket('qtyDamaged', parseInt(e.target.value, 10) || 0)}
                    className="w-[52px] h-7 text-center text-[13px] font-medium border border-[#EEEEEE] rounded-[6px] outline-none focus:border-[#E74C3C]/40"
                />
            </td>

            {/* Returned */}
            <td className="px-5 py-3.5 text-center">
                <input
                    type="number"
                    min={0}
                    value={returned}
                    onChange={(e) => handleBucket('qtyReturned', parseInt(e.target.value, 10) || 0)}
                    className="w-[52px] h-7 text-center text-[13px] font-medium border border-[#EEEEEE] rounded-[6px] outline-none focus:border-amber-400/50"
                />
            </td>

            {/* Net */}
            <td className="px-5 py-3.5 text-center">
                <span className={cn('text-[13px] font-bold', net <= 0 ? 'text-[#E74C3C]' : net <= threshold ? 'text-amber-500' : 'text-[#181725]')}>
                    {net}
                </span>
            </td>

            {/* Threshold */}
            <td className="px-5 py-3.5 text-center">
                {editingThreshold ? (
                    <input
                        autoFocus
                        type="number"
                        value={threshold}
                        onChange={e => setThreshold(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        onBlur={handleThresholdBlur}
                        onKeyDown={e => e.key === 'Enter' && handleThresholdBlur()}
                        className="w-[52px] h-7 text-center text-[13px] font-bold border border-[#299E60]/50 rounded-[6px] outline-none"
                    />
                ) : (
                    <button
                        onClick={() => setEditingThreshold(true)}
                        className="text-[13px] text-[#7C7C7C] hover:text-[#181725] hover:underline transition-colors"
                        title="Click to edit threshold"
                    >
                        {threshold}
                    </button>
                )}
            </td>

            {/* Status */}
            <td className="px-5 py-3.5 text-center">
                {net <= 0 ? (
                    <span className="inline-flex items-center gap-1 bg-[#FFF0F0] text-[#E74C3C] text-[11px] font-[900] px-2.5 py-1 rounded-[6px] uppercase">
                        <AlertTriangle size={11} /> Out
                    </span>
                ) : isLow ? (
                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 text-[11px] font-[900] px-2.5 py-1 rounded-[6px] uppercase">
                        <AlertTriangle size={11} /> Low
                    </span>
                ) : (
                    <span className="inline-flex items-center bg-[#EEF8F1] text-[#299E60] text-[11px] font-[900] px-2.5 py-1 rounded-[6px] uppercase">
                        OK
                    </span>
                )}
            </td>
        </tr>
    );
}

function InventoryMobileCard({ item, onSaved, outletId }: { item: InventoryItem; onSaved: (updated: Partial<InventoryItem> & { id: string }) => void; outletId?: string | null }) {
    const [qty, setQty] = useState(item.qtyAvailable);
    const [saving, setSaving] = useState(false);

    useEffect(() => { setQty(item.qtyAvailable); }, [item.qtyAvailable]);

    const net = qty - item.qtyReserved;

    const saveQty = async (newQty: number) => {
        setQty(newQty);
        setSaving(true);
        try {
            const res = await fetch('/api/v1/vendor/inventory', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId: item.productId, ...(outletId ? { outletId } : {}), qtyAvailable: newQty }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Save failed');
            onSaved({ id: item.id, qtyAvailable: newQty, isLowStock: newQty - item.qtyReserved <= item.lowStockThreshold });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={cn('bg-[#FAFAFA] rounded-[12px] border border-[#EEEEEE] p-4 space-y-2', net <= 0 && 'border-red-200 bg-red-50/30')}>
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-[8px] bg-[#F1F4F9] overflow-hidden shrink-0 relative flex items-center justify-center">
                    {item.product.imageUrl ? (
                        <Image src={item.product.imageUrl} alt="" fill className="object-cover" unoptimized />
                    ) : (
                        <Package size={15} className="text-[#AEAEAE]" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-[#181725] leading-tight">{item.product.name}</p>
                    <p className="text-[11px] text-[#AEAEAE]">{item.product.sku ? `SKU ${item.product.sku}` : ''}</p>
                </div>
                <span className={cn('text-[12px] font-bold', net <= 0 ? 'text-[#E74C3C]' : 'text-[#181725]')}>Net {net}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                <span className="px-2 py-0.5 rounded bg-white border border-[#EEEEEE]">Reserved {item.qtyReserved}</span>
                <span className="px-2 py-0.5 rounded bg-white border border-[#EEEEEE]">Transit {item.qtyInTransit}</span>
                <span className="px-2 py-0.5 rounded bg-white border border-[#EEEEEE]">Damaged {item.qtyDamaged}</span>
                <span className="px-2 py-0.5 rounded bg-white border border-[#EEEEEE]">Returned {item.qtyReturned}</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-[#7C7C7C]">Available</span>
                <button type="button" onClick={() => saveQty(Math.max(0, qty - 1))} className="w-7 h-7 rounded border border-[#EEEEEE]">−</button>
                <span className="text-[13px] font-bold w-8 text-center">{qty}</span>
                <button type="button" onClick={() => saveQty(qty + 1)} className="w-7 h-7 rounded border border-[#EEEEEE]">+</button>
                {saving && <Loader2 size={12} className="animate-spin text-[#299E60]" />}
            </div>
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function VendorInventoryPage() {
    const { activeOutletId, currentOutlet, multiWarehouseEnabled, outletQuery, scopeVersion } = useVendorOutletScope();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewAll, setViewAll] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
    const [showCsvModal, setShowCsvModal] = useState(false);
    const [alertCollapsed, setAlertCollapsed] = useState(false);

    const fetchInventory = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const endpoint = viewAll && multiWarehouseEnabled
                ? '/api/v1/vendor/inventory/consolidated'
                : `/api/v1/vendor/inventory${outletQuery(viewAll)}`;
            const res = await fetch(endpoint);
            const json = await res.json();
            if (json.success) setItems(json.data);
        } catch (err) {
            console.error('Failed to load inventory:', err);
        } finally {
            setLoading(false);
        }
    }, [multiWarehouseEnabled, outletQuery, viewAll, scopeVersion]);

    useEffect(() => { fetchInventory(); }, [fetchInventory]);

    const [showTransfer, setShowTransfer] = useState(false);

    const handleRowSaved = useCallback((updated: Partial<InventoryItem> & { id: string }) => {
        setItems(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i));
    }, []);

    // Derived counts
    const lowStockItems = items.filter(i => i.isLowStock && i.qtyAvailable - i.qtyReserved > 0);
    const outOfStockItems = items.filter(i => i.qtyAvailable - i.qtyReserved <= 0);

    const filtered = items.filter(item => {
        const matchSearch = item.product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (item.product.sku ?? '').toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchSearch) return false;
        if (activeFilter === 'low_stock') return item.isLowStock && item.qtyAvailable - item.qtyReserved > 0;
        if (activeFilter === 'out_of_stock') return item.qtyAvailable - item.qtyReserved <= 0;
        return true;
    });

    const FILTER_TABS: { key: FilterTab; label: string; count: number }[] = [
        { key: 'all', label: 'All', count: items.length },
        { key: 'low_stock', label: 'Low Stock', count: lowStockItems.length },
        { key: 'out_of_stock', label: 'Out of Stock', count: outOfStockItems.length },
    ];

    return (
        <div className="space-y-5 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[24px] font-bold text-[#181725]">Inventory</h1>
                    <p className="text-[12px] text-[#AEAEAE]">Manage stock levels — changes save automatically</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]" size={14} />
                        <input
                            type="text"
                            placeholder="Search products..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="h-[38px] w-[200px] bg-white border border-[#EEEEEE] rounded-[10px] pl-9 pr-3 text-[12px] outline-none placeholder:text-[#AEAEAE] focus:border-[#299E60]/40 shadow-sm"
                        />
                    </div>
                    {multiWarehouseEnabled && !viewAll && activeOutletId && (
                        <button
                            type="button"
                            onClick={() => setShowTransfer(true)}
                            className="h-[38px] px-4 rounded-[10px] border border-[#299E60] text-[#299E60] text-[12px] font-bold hover:bg-emerald-50"
                        >
                            Transfer stock
                        </button>
                    )}
                    <button
                        className="h-[38px] px-4 rounded-[10px] bg-[#181725] text-white text-[12px] font-bold flex items-center gap-2 hover:bg-[#2d2d40] transition-all shadow-sm"
                    >
                        <Upload size={13} />
                        Bulk Upload
                    </button>
                </div>
            </div>

            {multiWarehouseEnabled && (
                <div className="flex flex-wrap items-center gap-3">
                    <div className="bg-[#EFF6FF] border border-[#DBEAFE] rounded-[12px] px-4 py-3 text-[13px] text-[#1E40AF] font-semibold flex-1 min-w-[200px]">
                        {viewAll
                            ? 'Showing stock across all warehouses'
                            : <>Stock for: <span className="font-bold">{currentOutlet?.name ?? 'warehouse'}</span></>}
                    </div>
                    <div className="flex rounded-[10px] border border-[#EEEEEE] overflow-hidden bg-white">
                        <button
                            type="button"
                            onClick={() => setViewAll(false)}
                            className={`px-3 py-2 text-[12px] font-bold ${!viewAll ? 'bg-[#299E60] text-white' : 'text-[#7C7C7C]'}`}
                        >
                            This warehouse
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewAll(true)}
                            className={`px-3 py-2 text-[12px] font-bold ${viewAll ? 'bg-[#299E60] text-white' : 'text-[#7C7C7C]'}`}
                        >
                            All warehouses
                        </button>
                    </div>
                </div>
            )}

            {/* Low stock alert banner */}
            {(lowStockItems.length > 0 || outOfStockItems.length > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-[12px] overflow-hidden">
                    <button
                        onClick={() => setAlertCollapsed(p => !p)}
                        className="w-full flex items-center justify-between px-4 py-3"
                    >
                        <div className="flex items-center gap-2.5">
                            <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                            <span className="text-[13px] font-bold text-amber-800">
                                {outOfStockItems.length > 0 && `${outOfStockItems.length} out of stock`}
                                {outOfStockItems.length > 0 && lowStockItems.length > 0 && ' · '}
                                {lowStockItems.length > 0 && `${lowStockItems.length} running low`}
                            </span>
                        </div>
                        {alertCollapsed ? <ChevronDown size={15} className="text-amber-600" /> : <ChevronUp size={15} className="text-amber-600" />}
                    </button>
                    {!alertCollapsed && (
                        <div className="px-4 pb-3 flex flex-wrap gap-2">
                            {outOfStockItems.slice(0, 12).map(i => (
                                <span key={i.id} className="text-[11px] font-bold bg-red-100 text-[#E74C3C] px-2.5 py-1 rounded-[6px]">
                                    {i.product.name}
                                </span>
                            ))}
                            {lowStockItems.slice(0, 12).map(i => (
                                <span key={i.id} className="text-[11px] font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-[6px]">
                                    {i.product.name}
                                </span>
                            ))}
                            {(outOfStockItems.length + lowStockItems.length) > 24 && (
                                <span className="text-[11px] text-amber-600">…and more</span>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Filter tabs */}
            <div className="flex items-center gap-2">
                {FILTER_TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveFilter(tab.key)}
                        className={cn(
                            'h-[34px] px-4 rounded-[8px] text-[12px] font-bold transition-all flex items-center gap-1.5',
                            activeFilter === tab.key
                                ? 'bg-[#299E60] text-white shadow-sm'
                                : 'bg-white border border-[#EEEEEE] text-[#7C7C7C] hover:border-[#299E60]/30'
                        )}
                    >
                        {tab.label}
                        {tab.count > 0 && (
                            <span className={cn(
                                'text-[10px] font-[900] px-1.5 py-0.5 rounded-full',
                                activeFilter === tab.key ? 'bg-white/20' : 'bg-[#F5F5F5] text-[#7C7C7C]'
                            )}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
                <span className="ml-auto text-[11px] text-[#AEAEAE] flex items-center gap-1">
                    <FileText size={11} />
                    Click threshold to edit · Changes auto-save
                </span>
            </div>

            {/* Table */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="animate-spin text-[#299E60]" size={28} />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 text-center px-6">
                        <Package size={36} className="text-[#E5E7EB] mx-auto mb-3" />
                        <p className="text-[14px] font-bold text-[#AEAEAE]">
                            {searchQuery
                                ? `No products matching "${searchQuery}"`
                                : activeFilter !== 'all'
                                    ? `No ${activeFilter.replace('_', ' ')} products at this warehouse`
                                    : items.length === 0
                                        ? 'No products in your catalog yet'
                                        : 'No products match this filter'}
                        </p>
                        {!searchQuery && activeFilter === 'all' && items.length === 0 && multiWarehouseEnabled && !viewAll && (
                            <p className="text-[12px] text-[#7C7C7C] mt-2 max-w-md mx-auto">
                                Stock is tracked per warehouse. Add products in Catalog, or use{' '}
                                <button type="button" onClick={() => setShowTransfer(true)} className="text-[#299E60] font-semibold hover:underline">
                                    Transfer stock
                                </button>{' '}
                                from another warehouse.
                            </p>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="md:hidden p-3 space-y-3">
                            {filtered.map((item) => (
                                <InventoryMobileCard key={item.id} item={item} onSaved={handleRowSaved} outletId={multiWarehouseEnabled ? activeOutletId : null} />
                            ))}
                        </div>
                        <div className="hidden md:block overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE]">
                                    <th className="px-5 py-3 text-left text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Product</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Available</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Reserved</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">In Transit</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Damaged</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Returned</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Net</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Threshold</th>
                                    <th className="px-5 py-3 text-center text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F5F5F5]">
                                {filtered.map(item => (
                                    <InventoryRow key={item.id} item={item} onSaved={handleRowSaved} outletId={multiWarehouseEnabled ? activeOutletId : null} />
                                ))}
                            </tbody>
                        </table>
                        </div>
                    </>
                )}
                {!loading && filtered.length > 0 && (
                    <div className="px-5 py-3 border-t border-[#F5F5F5]">
                        <p className="text-[12px] text-[#AEAEAE]">
                            Showing {filtered.length} of {items.length} product{items.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                )}
            </div>

            {showCsvModal && (
                <CsvUploadModal
                    onClose={() => setShowCsvModal(false)}
                    onSuccess={() => { setShowCsvModal(false); fetchInventory(true); }}
                />
            )}
            {showTransfer && activeOutletId && (
                <StockTransferModal
                    fromOutletId={activeOutletId}
                    fromOutletName={currentOutlet?.name}
                    onClose={() => setShowTransfer(false)}
                    onSuccess={() => fetchInventory(true)}
                />
            )}
        </div>
    );
}
