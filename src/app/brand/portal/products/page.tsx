'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    Package, Plus, Pencil, Trash2, Loader2, Upload,
} from 'lucide-react';
import { cn, formatPackSize } from '@/lib/utils';
import { validatePackUnitFields } from '@/lib/packSizeValidation';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';
import BrandProductImportModal from '@/components/features/brand/BrandProductImportModal';
import BrandProductForm, {
    EMPTY_BRAND_PRODUCT_FORM,
    type BrandProductFormData,
    type BrandVegNonVeg,
} from '@/components/features/brand/BrandProductForm';

interface MasterProduct {
    id: string;
    name: string;
    packSize: string | null;
    unit: string | null;
    imageUrl: string | null;
    images?: string[];
    category: string | null;
    categoryId: string | null;
    categoryIds: string[];
    categoryRel?: { id: string; name: string } | null;
    sku: string | null;
    description?: string | null;
    hsn?: string | null;
    barcode?: string | null;
    ean?: string | null;
    vegNonVeg?: BrandVegNonVeg | null;
    storageType?: string | null;
    shelfLifeDays?: number | null;
    countryOfOrigin?: string | null;
    fssaiRef?: string | null;
    netWeight?: string | number | null;
    netWeightUnit?: string | null;
    packageWeight?: string | number | null;
    weightUnit?: string | null;
    packageLength?: string | number | null;
    packageWidth?: string | number | null;
    packageHeight?: string | number | null;
    dimensionUnit?: string | null;
    tags?: string[];
    aliasNames?: string[];
    isActive: boolean;
    createdAt: string;
    approvalStatus?: 'approved' | 'pending' | 'rejected';
    approvalNote?: string | null;
    /** Live brand catalog vs waiting on admin master-catalog approval. */
    source?: 'brand_catalog' | 'pending_master';
    _count: { mappings: number };
}

function productToForm(p: MasterProduct): BrandProductFormData {
    const categoryIds = p.categoryIds && p.categoryIds.length > 0
        ? p.categoryIds
        : (p.categoryId ? [p.categoryId] : []);
    return {
        ...EMPTY_BRAND_PRODUCT_FORM,
        name: p.name,
        packSize: p.packSize ?? '',
        unit: p.unit ?? '',
        categoryIds,
        imageUrl: p.imageUrl ?? '',
        sku: p.sku ?? '',
        description: p.description ?? '',
        masterProductId: '',
        hsn: p.hsn ?? '',
        barcode: p.barcode ?? '',
        ean: p.ean ?? '',
        vegNonVeg: (p.vegNonVeg || '') as BrandVegNonVeg,
        storageType: p.storageType ?? '',
        shelfLifeDays: p.shelfLifeDays != null ? String(p.shelfLifeDays) : '',
        countryOfOrigin: p.countryOfOrigin ?? '',
        fssaiRef: p.fssaiRef ?? '',
        netWeight: p.netWeight != null ? String(p.netWeight) : '',
        netWeightUnit: p.netWeightUnit ?? '',
        packageWeight: p.packageWeight != null ? String(p.packageWeight) : '',
        weightUnit: p.weightUnit || 'kg',
        packageLength: p.packageLength != null ? String(p.packageLength) : '',
        packageWidth: p.packageWidth != null ? String(p.packageWidth) : '',
        packageHeight: p.packageHeight != null ? String(p.packageHeight) : '',
        dimensionUnit: p.dimensionUnit || 'cm',
        tags: Array.isArray(p.tags) ? p.tags : [],
        aliasNames: Array.isArray(p.aliasNames) ? p.aliasNames : [],
    };
}

/** Optional detail fields shared by create/update/pending-submit payloads. */
function detailFieldsPayload(form: BrandProductFormData): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.hsn.trim()) payload.hsn = form.hsn.trim();
    if (form.barcode.trim()) payload.barcode = form.barcode.trim();
    if (form.ean.trim()) payload.ean = form.ean.trim();
    if (form.vegNonVeg) payload.vegNonVeg = form.vegNonVeg;
    if (form.storageType.trim()) payload.storageType = form.storageType.trim();
    if (form.shelfLifeDays.trim() !== '' && !Number.isNaN(Number(form.shelfLifeDays))) {
        payload.shelfLifeDays = parseInt(form.shelfLifeDays, 10);
    }
    if (form.countryOfOrigin.trim()) payload.countryOfOrigin = form.countryOfOrigin.trim();
    if (form.fssaiRef.trim()) payload.fssaiRef = form.fssaiRef.trim();
    if (form.netWeight.trim() !== '' && !Number.isNaN(Number(form.netWeight))) {
        payload.netWeight = Number(form.netWeight);
    }
    if (form.netWeightUnit.trim()) payload.netWeightUnit = form.netWeightUnit.trim();
    if (form.packageWeight.trim() !== '' && !Number.isNaN(Number(form.packageWeight))) {
        payload.packageWeight = Number(form.packageWeight);
    }
    if (form.weightUnit.trim()) payload.weightUnit = form.weightUnit.trim();
    if (form.packageLength.trim() !== '' && !Number.isNaN(Number(form.packageLength))) {
        payload.packageLength = Number(form.packageLength);
    }
    if (form.packageWidth.trim() !== '' && !Number.isNaN(Number(form.packageWidth))) {
        payload.packageWidth = Number(form.packageWidth);
    }
    if (form.packageHeight.trim() !== '' && !Number.isNaN(Number(form.packageHeight))) {
        payload.packageHeight = Number(form.packageHeight);
    }
    if (form.dimensionUnit.trim()) payload.dimensionUnit = form.dimensionUnit.trim();
    if (form.tags.length > 0) payload.tags = form.tags;
    if (form.aliasNames.length > 0) payload.aliasNames = form.aliasNames;
    return payload;
}

export default function BrandProductsPage() {
    const confirm = useConfirm();
    const searchParams = useSearchParams();
    const router = useRouter();
    const deepLinkHandled = useRef(false);
    const [products, setProducts] = useState<MasterProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<BrandProductFormData>(EMPTY_BRAND_PRODUCT_FORM);
    const [formError, setFormError] = useState<string | null>(null);
    const [showImport, setShowImport] = useState(false);
    const [brandName, setBrandName] = useState('');

    useEffect(() => {
        fetch('/api/v1/brand/profile')
            .then((r) => r.json())
            .then((j) => {
                if (j.success) setBrandName(j.data.name || '');
            })
            .catch(() => {});
    }, []);

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

    const openAdd = useCallback(() => {
        setEditingId(null);
        setForm(EMPTY_BRAND_PRODUCT_FORM);
        setFormError(null);
        setShowForm(true);
    }, []);

    const openEdit = useCallback((p: MasterProduct) => {
        setEditingId(p.id);
        setForm(productToForm(p));
        setFormError(null);
        setShowForm(true);
    }, []);

    const closeForm = useCallback(() => {
        setShowForm(false);
        setEditingId(null);
        setFormError(null);
    }, []);

    // Deep link: /brand/portal/products?action=add or ?edit={productId}
    useEffect(() => {
        const action = searchParams.get('action');
        if (action === 'add' && !deepLinkHandled.current && !showForm) {
            deepLinkHandled.current = true;
            router.replace('/brand/portal/products', { scroll: false });
            openAdd();
            return;
        }

        const editId = searchParams.get('edit');
        if (!editId || deepLinkHandled.current || showForm) return;
        if (loading) return;

        const fromList = products.find((p) => p.id === editId);
        if (fromList) {
            deepLinkHandled.current = true;
            router.replace('/brand/portal/products', { scroll: false });
            openEdit(fromList);
            return;
        }

        // Product not in list — clear the stale deep link
        deepLinkHandled.current = true;
        router.replace('/brand/portal/products', { scroll: false });
    }, [searchParams, products, loading, showForm, router, openAdd, openEdit]);

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
                        ...detailFieldsPayload(form),
                    }),
                });
                const json = await res.json();
                if (json.success) {
                    toast.success('Product submitted for admin approval');
                    closeForm();
                    fetchProducts();
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
                ...(form.masterProductId && { masterProductId: form.masterProductId }),
                ...detailFieldsPayload(form),
            };
            const res = editingId
                ? await fetch(`/api/v1/brand/products/${editingId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                })
                : await fetch('/api/v1/brand/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            const json = await res.json();
            if (json.success) { closeForm(); fetchProducts(); }
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
            setProducts((prev) => prev.filter((p) => p.id !== id));
        } catch { /* silent */ }
        finally { setActionLoading(null); }
    };

    return (
        <div className="max-w-[1100px] mx-auto space-y-6 animate-in fade-in duration-500">
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
                        className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-[10px] text-[13px] font-bold hover:bg-primary-dark transition-colors"
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

            <div className="bg-white rounded-[20px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                ) : products.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Package size={40} className="text-[#EEEEEE] mb-3" />
                        <p className="text-[16px] font-bold text-[#AEAEAE]">No products yet</p>
                        <p className="text-[13px] text-[#AEAEAE] mt-1 mb-5">Add your first brand product to get started</p>
                        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-[10px] text-[13px] font-bold">
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
                                    <th className="px-6 py-3.5 text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3.5 text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wider">Distributors</th>
                                    <th className="px-6 py-3.5 text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F5F5F5]">
                                {products.map((product) => {
                                    const isPendingMaster = product.source === 'pending_master';
                                    const status = product.approvalStatus ?? 'approved';
                                    return (
                                    <tr key={product.id} className="hover:bg-[#FAFAFA] transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {product.imageUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
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
                                            <span
                                                className={cn(
                                                    'text-[11px] font-[900] px-2.5 py-1 rounded-[6px]',
                                                    status === 'pending' && 'bg-[#FFF8E6] text-[#B45309]',
                                                    status === 'rejected' && 'bg-[#FEF2F2] text-[#E74C3C]',
                                                    status === 'approved' && 'bg-primary-light text-primary',
                                                )}
                                                title={status === 'rejected' && product.approvalNote ? product.approvalNote : undefined}
                                            >
                                                {status === 'pending'
                                                    ? 'Pending Approval'
                                                    : status === 'rejected'
                                                        ? 'Rejected'
                                                        : 'Approved'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {isPendingMaster ? (
                                                <span className="text-[12px] font-medium text-[#AEAEAE]">—</span>
                                            ) : (
                                                <span className={cn(
                                                    'text-[12px] font-[900] px-2.5 py-1 rounded-[6px]',
                                                    product._count.mappings > 0 ? 'bg-primary-light text-primary' : 'bg-[#F8F9FB] text-[#AEAEAE]'
                                                )}>
                                                    {product._count.mappings} matched
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {isPendingMaster ? (
                                                <span className="text-[12px] text-[#AEAEAE] font-medium">
                                                    {status === 'pending' ? 'Awaiting admin' : '—'}
                                                </span>
                                            ) : (
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
                                            )}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showForm && (
                <BrandProductForm
                    editingId={editingId}
                    form={form}
                    onChange={setForm}
                    formError={formError}
                    brandName={brandName}
                    saving={actionLoading === 'form'}
                    onClose={closeForm}
                    onSubmit={handleSubmit}
                />
            )}
        </div>
    );
}
