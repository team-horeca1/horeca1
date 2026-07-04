'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import {
    Package, Plus, Pencil, Trash2, Loader2, X, Check, Upload,
    Info, Tag
} from 'lucide-react';
import { cn, formatPackSize } from '@/lib/utils';
import FormSection, { FieldLabel, SectionHeader, productFormInputCls, productFormTextareaCls } from '@/components/features/shared/FormSection';
import { validatePackUnitFields } from '@/lib/packSizeValidation';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';
import { CategoryHierarchyPicker } from '@/components/features/brand/CategoryHierarchyPicker';
import BrandProductImportModal from '@/components/features/brand/BrandProductImportModal';
import { ImagePreview } from '@/components/ui/ImagePreview';

interface MasterProduct {
    id: string;
    name: string;
    packSize: string | null;
    unit: string | null;
    imageUrl: string | null;
    category: string | null;
    categoryId: string | null;
    categoryIds: string[];
    categoryRel?: { id: string; name: string } | null;
    sku: string | null;
    isActive: boolean;
    createdAt: string;
    _count: { mappings: number };
}

interface ProductFormData {
    name: string;
    packSize: string;
    unit: string;
    categoryIds: string[];
    imageUrl: string;
    sku: string;
    description: string;
    masterProductId?: string;
}

const EMPTY_FORM: ProductFormData = { name: '', packSize: '', unit: '', categoryIds: [], imageUrl: '', sku: '', description: '', masterProductId: '' };

export default function BrandProductsPage() {
    const confirm = useConfirm();
    const [products, setProducts] = useState<MasterProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<ProductFormData>(EMPTY_FORM);
    const [formError, setFormError] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [showImport, setShowImport] = useState(false);

    const [brandName, setBrandName] = useState<string>('');
    const [searchingMasters, setSearchingMasters] = useState(false);
    const [masterSuggestions, setMasterSuggestions] = useState<any[]>([]);
    const [showMasterSuggestions, setShowMasterSuggestions] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    // Fetch Brand Name
    useEffect(() => {
        fetch('/api/v1/brand/profile')
            .then(r => r.json())
            .then(j => {
                if (j.success) setBrandName(j.data.name || '');
            })
            .catch(() => {});
    }, []);

    // Close suggestions on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowMasterSuggestions(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleSearchMasterProducts = async (q: string) => {
        if (!q.trim() || q.trim().length < 2) {
            setMasterSuggestions([]);
            setShowMasterSuggestions(false);
            return;
        }
        setSearchingMasters(true);
        try {
            const trimmed = q.trim();
            const looksLikeSku = /^[A-Za-z0-9][A-Za-z0-9_-]+$/.test(trimmed) && trimmed.length >= 2;

            if (looksLikeSku) {
                const exactRes = await fetch(
                    `/api/v1/master-products?search=${encodeURIComponent(trimmed)}&exact=true&brand=${encodeURIComponent(brandName)}&limit=1`,
                );
                const exactJson = await exactRes.json();
                if (exactJson.success && exactJson.data?.length === 1) {
                    setMasterSuggestions(exactJson.data);
                    setShowMasterSuggestions(true);
                    return;
                }
            }

            let res = await fetch(`/api/v1/master-products?brand=${encodeURIComponent(brandName)}&search=${encodeURIComponent(q)}&limit=10`);
            let json = await res.json();

            if (json.success && (!json.data || json.data.length === 0)) {
                res = await fetch(`/api/v1/master-products?search=${encodeURIComponent(q)}&limit=10`);
                json = await res.json();
            }

            if (json.success) {
                setMasterSuggestions(json.data || []);
                setShowMasterSuggestions(true);
            }
        } catch { /* ignore */ }
        finally { setSearchingMasters(false); }
    };

    const handleSelectMasterProduct = (m: any) => {
        setForm(prev => ({
            ...prev,
            name: m.name,
            packSize: m.packSize ?? prev.packSize,
            unit: m.uom ?? prev.unit,
            imageUrl: m.imageUrl ?? prev.imageUrl,
            sku: m.sku ?? prev.sku,
            categoryIds: m.categoryId ? [m.categoryId] : prev.categoryIds,
            masterProductId: m.id
        }));
        setShowMasterSuggestions(false);
        toast.info(`Pre-filled from master catalog: "${m.name}"`);
    };

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/brand/products');
            const json = await res.json();
            if (json.success) setProducts(json.data.products ?? json.data ?? []);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchProducts(); }, [fetchProducts]);

    const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setFormError(null); setShowForm(true); };
    const openEdit = (p: MasterProduct) => {
        setEditingId(p.id);
        // Prefer multi-category if populated; fall back to single categoryId for old rows
        const categoryIds = p.categoryIds && p.categoryIds.length > 0
            ? p.categoryIds
            : (p.categoryId ? [p.categoryId] : []);
        setForm({
            name: p.name,
            packSize: p.packSize ?? '',
            unit: p.unit ?? '',
            categoryIds,
            imageUrl: p.imageUrl ?? '',
            sku: p.sku ?? '',
            description: '',
            masterProductId: '',
        });
        setFormError(null);
        setShowForm(true);
    };

    const handleSubmit = async () => {
        if (!form.name.trim()) { setFormError('Product name is required'); return; }
        const packErr = validatePackUnitFields(form.packSize, form.unit);
        if (packErr) { setFormError(packErr); return; }
        if (!form.masterProductId && !editingId) {
            if (!form.sku.trim()) { setFormError('SKU is required for new products'); return; }
            if (form.categoryIds.length === 0) { setFormError('At least one category is required'); return; }
        }
        setActionLoading('form');
        setFormError(null);
        try {
            if (!editingId && !form.masterProductId) {
                const res = await fetch('/api/v1/brand/master-products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: form.name.trim(),
                        sku: form.sku.trim(),
                        categoryId: form.categoryIds[0],
                        ...(form.imageUrl && { imageUrl: form.imageUrl }),
                        ...(form.packSize.trim() && { packSize: form.packSize.trim() }),
                        ...(form.unit.trim() && { uom: form.unit.trim() }),
                    }),
                });
                const json = await res.json();
                if (json.success) {
                    toast.success('Product submitted for admin approval');
                    setShowForm(false);
                } else {
                    setFormError(json.error?.message ?? 'Failed to submit product');
                }
                return;
            }

            const payload = {
                name: form.name.trim(),
                ...(form.packSize && { packSize: form.packSize }),
                ...(form.unit && { unit: form.unit }),
                categoryIds: form.categoryIds,
                ...(form.imageUrl && { imageUrl: form.imageUrl }),
                ...(form.sku && { sku: form.sku }),
                ...(form.description && { description: form.description }),
                ...(form.masterProductId && { masterProductId: form.masterProductId }),
            };
            const res = editingId
                ? await fetch(`/api/v1/brand/products/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                : await fetch('/api/v1/brand/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const json = await res.json();
            if (json.success) { setShowForm(false); fetchProducts(); }
            else setFormError(json.error?.message ?? 'Failed to save product');
        } catch { setFormError('Network error'); }
        finally { setActionLoading(null); }
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: 'Delete product?',
            message: 'This will permanently remove the product. This action cannot be undone.',
            confirmText: 'Delete',
            tone: 'danger',
        });
        if (!ok) return;
        setActionLoading(id);
        try {
            await fetch(`/api/v1/brand/products/${id}`, { method: 'DELETE' });
            setProducts(prev => prev.filter(p => p.id !== id));
        } catch { /* silent */ }
        finally { setActionLoading(null); }
    };

    return (
        <div className="max-w-[1100px] mx-auto space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-[26px] font-[900] text-[#181725] tracking-tight">Brand Products</h1>
                    <p className="text-[#7C7C7C] font-medium mt-0.5 text-[14px]">Your brand&apos;s product catalog. Customers see these names everywhere your distributors list this product.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowImport(true)}
                        className="flex items-center gap-2 px-4 py-2.5 border border-[#EEEEEE] text-[#181725] rounded-[10px] text-[13px] font-bold hover:bg-[#F8F9FB] transition-colors"
                    >
                        <Upload size={16} /> Import
                    </button>
                    <button
                        onClick={openAdd}
                        className="flex items-center gap-2 px-4 py-2.5 bg-[#53B175] text-white rounded-[10px] text-[13px] font-bold hover:bg-[#3d9e41] transition-colors"
                    >
                        <Plus size={16} /> Add Product
                    </button>
                </div>
            </div>

            <BrandProductImportModal
                open={showImport}
                onClose={() => setShowImport(false)}
                onComplete={() => { setShowImport(false); fetchProducts(); }}
            />

            {/* Table */}
            <div className="bg-white rounded-[20px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-[#53B175]" />
                    </div>
                ) : products.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Package size={40} className="text-[#EEEEEE] mb-3" />
                        <p className="text-[16px] font-bold text-[#AEAEAE]">No products yet</p>
                        <p className="text-[13px] text-[#AEAEAE] mt-1 mb-5">Add your first brand product to get started</p>
                        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 bg-[#53B175] text-white rounded-[10px] text-[13px] font-bold">
                            <Plus size={14} /> Add Product
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-[#F8F9FB] border-b border-[#EEEEEE]">
                                    <th className="px-6 py-3.5 text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wider">Product</th>
                                    <th className="px-6 py-3.5 text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wider">Pack Size</th>
                                    <th className="px-6 py-3.5 text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wider">Category</th>
                                    <th className="px-6 py-3.5 text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wider">Distributors</th>
                                    <th className="px-6 py-3.5 text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F5F5F5]">
                                {products.map(product => (
                                    <tr key={product.id} className="hover:bg-[#FAFAFA] transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {product.imageUrl ? (
                                                    <img src={product.imageUrl} alt="" className="w-9 h-9 rounded-[8px] object-cover border border-[#EEEEEE]" />
                                                ) : (
                                                    <div className="w-9 h-9 rounded-[8px] bg-[#F8F9FB] flex items-center justify-center text-[#AEAEAE]">
                                                        <Package size={16} />
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="text-[14px] font-bold text-[#181725]">{product.name}</p>
                                                    {product.sku && <p className="text-[11px] text-[#AEAEAE]">SKU: {product.sku}</p>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-[13px] text-[#7C7C7C]">{formatPackSize(product.packSize, product.unit) || '—'}</td>
                                        <td className="px-6 py-4 text-[13px] text-[#7C7C7C]">{product.category ?? '—'}</td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                'text-[12px] font-[900] px-2.5 py-1 rounded-[6px]',
                                                product._count.mappings > 0 ? 'bg-[#EEF8F1] text-[#53B175]' : 'bg-[#F8F9FB] text-[#AEAEAE]'
                                            )}>
                                                {product._count.mappings} matched
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => openEdit(product)}
                                                    className="h-[32px] w-[32px] flex items-center justify-center bg-[#F0F4FF] text-[#3B82F6] rounded-[8px] hover:bg-[#3B82F6] hover:text-white transition-colors"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(product.id)}
                                                    disabled={!!actionLoading}
                                                    className="h-[32px] w-[32px] flex items-center justify-center bg-[#FEF2F2] text-[#E74C3C] rounded-[8px] hover:bg-[#E74C3C] hover:text-white transition-colors disabled:opacity-50"
                                                >
                                                    {actionLoading === product.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Sliding Panel Form */}
            {showForm && (
                <>
                    <div
                        className="fixed inset-0 bg-black/40 z-[99] animate-in fade-in duration-300"
                        onClick={() => setShowForm(false)}
                    />
                    <div className="fixed top-0 left-0 h-full w-full max-w-[560px] bg-white z-[100] shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
                        {/* Panel Header */}
                        <div className="sticky top-0 z-10 bg-white border-b border-[#EEEEEE] px-6 py-5 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowForm(false)}
                                    className="p-2 -ml-2 hover:bg-gray-100 rounded-[8px] transition-colors"
                                >
                                    <X size={20} className="text-[#7C7C7C]" />
                                </button>
                                <div>
                                    <h2 className="text-[20px] font-bold text-[#181725]">
                                        {editingId ? 'Edit Product' : 'Add New Product'}
                                    </h2>
                                    {editingId && (
                                        <p className="text-[12px] text-[#AEAEAE] font-medium mt-0.5">
                                            ID: {editingId}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={actionLoading === 'form'}
                                className="h-[40px] px-5 bg-[#53B175] text-white rounded-[10px] text-[13px] font-bold hover:bg-[#3d9e41] transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
                            >
                                {actionLoading === 'form' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                {editingId ? 'Save Changes' : 'Submit Product'}
                            </button>
                        </div>

                        {/* Panel Body: Single Scroll */}
                        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-[#F8F9FB]">
                            {formError && (
                                <div className="flex items-center gap-3 bg-[#FFF0F0] border border-[#E74C3C]/20 text-[#E74C3C] rounded-[12px] px-5 py-4 text-[13px] font-semibold">
                                    <X size={18} />
                                    {formError}
                                </div>
                            )}

                            {!editingId && !form.masterProductId && (
                                <div className="rounded-[10px] bg-[#FFF7E6] border border-amber-200 px-4 py-3 text-[12px] font-medium text-amber-800">
                                    New products not found in the master catalog are sent to admin for approval before appearing in search.
                                </div>
                            )}
                            {form.masterProductId && (
                                <div className="rounded-[10px] bg-[#EEF8F1] border border-[#53B175]/30 px-4 py-3 text-[12px] font-medium text-[#299E60]">
                                    Linked to master catalog — will be added to your brand storefront instantly.
                                </div>
                            )}

                            {/* Section 1: Identity */}
                            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6 space-y-4">
                                <SectionHeader icon={<Info size={16} />} title="Identity" />
                                
                                <div>
                                    <FieldLabel required>Product Name</FieldLabel>
                                    <div className="relative" ref={searchRef}>
                                        <input
                                            type="text"
                                            value={form.name}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setForm(prev => ({ ...prev, name: val, masterProductId: '' }));
                                                handleSearchMasterProducts(val);
                                            }}
                                            onFocus={() => {
                                                if (form.name.trim().length >= 2) {
                                                    handleSearchMasterProducts(form.name);
                                                }
                                            }}
                                            placeholder="e.g. Tomato Ketchup 1kg"
                                            className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-2.5 text-[14px] font-medium outline-none focus:border-[#53B175]/50 focus:bg-white bg-white"
                                        />
                                        {searchingMasters && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                <Loader2 size={16} className="animate-spin text-[#53B175]" />
                                            </div>
                                        )}
                                        {showMasterSuggestions && masterSuggestions.length > 0 && (
                                            <div className="absolute left-0 right-0 top-full mt-1 border border-[#EEEEEE] rounded-xl bg-white shadow-lg max-h-[200px] overflow-y-auto z-[60]">
                                                <div className="px-3 py-1.5 bg-gray-50 border-b border-[#EEEEEE] text-[10px] font-bold text-[#AEAEAE] uppercase tracking-wider">
                                                    Master Catalog Suggestions
                                                </div>
                                                {masterSuggestions.map(m => (
                                                    <button
                                                        key={m.id}
                                                        type="button"
                                                        onClick={() => handleSelectMasterProduct(m)}
                                                        className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-[#EEF8F1] transition-colors flex items-center justify-between gap-3 border-b border-[#F5F5F5] last:border-0"
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="font-bold text-[#181725] truncate">{m.name}</p>
                                                            <p className="text-[11px] text-[#AEAEAE] truncate">
                                                                {m.brand ? `Brand: ${m.brand}` : ''} {m.sku ? `• SKU: ${m.sku}` : ''}
                                                            </p>
                                                        </div>
                                                        {m.imageUrl && (
                                                            <img src={m.imageUrl} alt="" className="w-8 h-8 rounded-[6px] object-cover border border-[#EEEEEE] shrink-0" />
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <FieldLabel>Description</FieldLabel>
                                    <textarea
                                        value={form.description}
                                        onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                                        rows={3}
                                        className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-[#53B175]/50 transition-colors resize-none bg-white"
                                        placeholder="Enter product description"
                                    />
                                </div>

                                <CategoryHierarchyPicker
                                    label="Categories"
                                    helper="Pick a parent category, then a sub-category. First sub-category is primary."
                                    value={form.categoryIds}
                                    onChange={(next) => setForm(prev => ({ ...prev, categoryIds: next }))}
                                />

                                <div className="space-y-4 pt-4 border-t border-[#EEEEEE]">
                                    <FieldLabel>Media</FieldLabel>
                                    <div className="flex items-center gap-3">
                                        <div
                                            onClick={() => imageInputRef.current?.click()}
                                            className="w-[80px] h-[80px] rounded-xl border-2 border-dashed border-gray-200 hover:border-[#53B175] transition-colors cursor-pointer flex items-center justify-center overflow-hidden bg-gray-50 shrink-0 relative"
                                        >
                                            {uploadingImage ? <Loader2 size={20} className="animate-spin text-[#53B175]" /> :
                                                form.imageUrl ? <Image src={form.imageUrl} alt="" fill sizes="80px" className="object-cover" /> :
                                                <Upload size={20} className="text-gray-400" />}
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <button type="button" onClick={() => imageInputRef.current?.click()}
                                                className="text-[13px] font-bold text-[#53B175] hover:underline">Upload file</button>
                                            <input
                                                type="url"
                                                value={form.imageUrl}
                                                onChange={e => setForm(prev => ({ ...prev, imageUrl: e.target.value }))}
                                                placeholder="Or paste image URL…"
                                                className="w-full border border-[#EEEEEE] rounded-[8px] px-3 py-2 text-[12px] focus:outline-none focus:border-[#53B175]/50 bg-white"
                                            />
                                        </div>
                                        {form.imageUrl && (
                                            <button type="button" onClick={() => setForm(p => ({ ...p, imageUrl: '' }))}
                                                className="text-gray-400 hover:text-red-500"><X size={16} /></button>
                                        )}
                                    </div>
                                    {form.imageUrl && (
                                        <div className="mt-3 flex items-start gap-3 p-3 bg-[#FAFAFA] border border-[#EEEEEE] rounded-xl">
                                            <ImagePreview src={form.imageUrl} variant="product-square" />
                                            <p className="text-[11px] text-gray-500 leading-snug">
                                                This is how the product card will look on the brand store, vendor catalog, and search results.
                                            </p>
                                        </div>
                                    )}
                                    <input
                                        ref={imageInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        className="hidden"
                                        onChange={async e => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            setUploadingImage(true);
                                            try {
                                                const fd = new FormData();
                                                fd.append('file', file);
                                                fd.append('folder', 'brands');
                                                const res = await fetch('/api/v1/upload', { method: 'POST', body: fd });
                                                const json = await res.json();
                                                if (!json.success) throw new Error(json.error?.message || 'Upload failed');
                                                setForm(prev => ({ ...prev, imageUrl: json.data.url }));
                                                toast.success('Image uploaded');
                                            } catch (err: unknown) {
                                                toast.error(err instanceof Error ? err.message : 'Upload failed');
                                            } finally {
                                                setUploadingImage(false);
                                                if (e.target) e.target.value = '';
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Section 2: SKU & Search */}
                            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6 space-y-4">
                                <SectionHeader icon={<Tag size={16} />} title="SKU & Search" />
                                <div>
                                    <FieldLabel required={!form.masterProductId && !editingId}>SKU</FieldLabel>
                                    <input
                                        type="text"
                                        value={form.sku}
                                        onChange={e => setForm(prev => ({ ...prev, sku: e.target.value.toUpperCase() }))}
                                        placeholder="e.g. MAN-SYR-001"
                                        readOnly={!!form.masterProductId}
                                        className={cn(
                                            'w-full border border-[#EEEEEE] rounded-[10px] px-4 py-2.5 text-[14px] font-medium outline-none focus:border-[#53B175]/50 focus:bg-white bg-white',
                                            form.masterProductId && 'bg-[#F8F9FB] cursor-not-allowed',
                                        )}
                                    />
                                </div>
                                <div>
                                    <FieldLabel>Alias / search keywords</FieldLabel>
                                    <textarea
                                        value={form.description}
                                        onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder="Alternate names customers might search for"
                                        rows={2}
                                        className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-2.5 text-[14px] font-medium outline-none focus:border-[#53B175]/50 bg-white resize-none"
                                    />
                                </div>
                            </div>

                            {/* Section 3: Packaging Details */}
                            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6 space-y-4">
                                <SectionHeader icon={<Package size={16} />} title="Packaging Details" />
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <FieldLabel>Pack Size (quantity)</FieldLabel>
                                        <input
                                            type="text"
                                            value={form.packSize}
                                            onChange={e => setForm(prev => ({ ...prev, packSize: e.target.value }))}
                                            placeholder="e.g. 1 ltr, 500 ml, 10 kg"
                                            className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-2.5 text-[14px] font-medium outline-none focus:border-[#53B175]/50 focus:bg-white bg-white"
                                        />
                                        <p className="text-[11px] text-[#AEAEAE] mt-1">How much is in one sellable unit</p>
                                    </div>
                                    <div>
                                        <FieldLabel>Unit / Container</FieldLabel>
                                        <input
                                            type="text"
                                            value={form.unit}
                                            onChange={e => setForm(prev => ({ ...prev, unit: e.target.value }))}
                                            placeholder="e.g. Bottle, Pouch, Pc"
                                            className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-2.5 text-[14px] font-medium outline-none focus:border-[#53B175]/50 focus:bg-white bg-white"
                                        />
                                        <p className="text-[11px] text-[#AEAEAE] mt-1">Packaging type — not the quantity</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Panel Footer */}
                        <div className="px-6 py-4 flex items-center justify-end gap-3 border-t border-[#EEEEEE] shrink-0 bg-white">
                            <button
                                onClick={() => setShowForm(false)}
                                className="h-[40px] px-5 bg-gray-100 rounded-[10px] text-[13px] font-bold text-[#7C7C7C] hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={actionLoading === 'form'}
                                className="h-[40px] px-5 bg-[#53B175] text-white rounded-[10px] text-[13px] font-bold disabled:opacity-50 flex items-center gap-1.5 hover:bg-[#3d9e41] transition-colors"
                            >
                                {actionLoading === 'form' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                {editingId ? 'Save Changes' : 'Submit Product'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}



