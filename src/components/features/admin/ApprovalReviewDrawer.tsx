'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
    X,
    Loader2,
    Pencil,
    Check,
    MessageSquare,
    Store,
    Package,
    Tag,
    Sparkles,
    FileText,
    ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BrandSinglePicker } from '@/components/features/brand/BrandSinglePicker';
import { CategorySinglePicker } from '@/components/features/brand/CategorySinglePicker';

export type ReviewTarget =
    | { type: 'vendor'; id: string }
    | { type: 'product'; id: string; kind: 'master' | 'vendor' }
    | { type: 'category'; id: string }
    | { type: 'brand'; id: string };

interface Props {
    target: ReviewTarget | null;
    onClose: () => void;
    onComplete: () => void;
}

interface VendorDetail {
    id: string;
    businessName: string;
    logoUrl: string | null;
    isVerified: boolean;
    isActive: boolean;
    addressLine: string | null;
    city: string | null;
    state: string | null;
    addressPincode: string | null;
    gstNumber: string | null;
    user: { fullName: string; email: string; phone: string };
    _count: { products: number; orders: number };
}

interface VendorDocument {
    id: string;
    type: string;
    fileUrl: string;
    fileName: string;
    status: string;
}

interface MasterProductDetail {
    id: string;
    name: string;
    sku: string;
    brand: string | null;
    imageUrl: string | null;
    approvalStatus: string;
    category: { id: string; name: string } | null;
}

interface VendorProductDetail {
    id: string;
    name: string;
    slug?: string | null;
    description?: string | null;
    sku: string | null;
    vendorSku: string | null;
    brand: string | null;
    basePrice: number;
    originalPrice?: number | null;
    taxPercent?: number | null;
    minOrderQty?: number | null;
    creditEligible?: boolean;
    packSize?: string | null;
    unit?: string | null;
    hsn?: string | null;
    fssaiRef?: string | null;
    barcode?: string | null;
    countryOfOrigin?: string | null;
    vegNonVeg?: string | null;
    storageType?: string | null;
    shelfLifeDays?: number | null;
    tags?: string[];
    aliasNames?: string[];
    images?: string[];
    imageUrl: string | null;
    metadata?: Record<string, unknown> | null;
    approvalStatus: string;
    category: { id: string; name: string } | null;
    categoryLinks?: Array<{ category?: { id: string; name: string } | null; isPrimary?: boolean }>;
    vendor: { businessName: string } | null;
    inventory?: { qtyAvailable: number } | null;
    inventories?: Array<{ qtyAvailable: number }>;
    priceSlabs?: Array<{
        minQty: number;
        maxQty?: number | null;
        price: number;
        promoPrice?: number | null;
    }>;
    masterProduct: { id: string; sku: string; name: string } | null;
    brandMappings?: Array<{
        id: string;
        status: string;
        brandId: string;
        brandMasterProduct?: {
            name?: string | null;
            brand?: { name: string; slug: string } | null;
        } | null;
    }>;
    pendingEditPayload?: Record<string, unknown> | null;
}

interface CategoryDetail {
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
    imageUrl: string | null;
    isActive: boolean;
    approvalStatus: string;
    parent?: { id: string; name: string } | null;
    _count?: { products: number };
}

interface BrandDetail {
    id: string;
    name: string;
    logoUrl: string | null;
    tagline: string | null;
    approvalStatus: string;
    user: { fullName: string; email: string } | null;
}

interface BrandOption {
    id: string;
    name: string;
}

interface ParentCategoryOption {
    id: string;
    name: string;
}

const inputCls =
    'w-full h-[42px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#6B1D2E]/40 font-medium';

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label className="block text-[12px] font-bold text-[#7C7C7C] uppercase tracking-wide mb-1.5">
            {children}{required && <span className="text-[#E74C3C] ml-0.5">*</span>}
        </label>
    );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <FieldLabel>{label}</FieldLabel>
            <p className="text-[14px] font-semibold text-[#181725]">{value || '—'}</p>
        </div>
    );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-3 pt-4 border-t border-[#F5F5F5] first:pt-0 first:border-t-0">
            <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider">{title}</p>
            <div className="grid grid-cols-2 gap-4">{children}</div>
        </div>
    );
}

function formatMoney(value: number | string | null | undefined): string {
    if (value == null || value === '') return '—';
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    return `₹${n.toLocaleString('en-IN')}`;
}

function joinList(values: string[] | null | undefined): string {
    if (!values || values.length === 0) return '';
    return values.filter(Boolean).join(', ');
}

function asMetaRecord(metadata: unknown): Record<string, Record<string, unknown>> {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
    const root = metadata as Record<string, unknown>;
    const section = (key: string): Record<string, unknown> => {
        const value = root[key];
        if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
        return value as Record<string, unknown>;
    };
    return {
        packaging: section('packaging'),
        identifiers: section('identifiers'),
        accounting: section('accounting'),
        inventory: section('inventory'),
        attributes: section('attributes'),
    };
}

function metaScalar(value: unknown): string {
    if (value == null || value === '') return '';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
}

function typeLabel(target: ReviewTarget): string {
    if (target.type === 'product') return target.kind === 'master' ? 'Master Product' : 'Vendor Product';
    return target.type.charAt(0).toUpperCase() + target.type.slice(1);
}

function typeIcon(target: ReviewTarget) {
    if (target.type === 'vendor') return Store;
    if (target.type === 'product') return Package;
    if (target.type === 'category') return Tag;
    return Sparkles;
}

export function ApprovalReviewDrawer({ target, onClose, onComplete }: Props) {
    const open = !!target;

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectNote, setRejectNote] = useState('');

    const [title, setTitle] = useState('');
    const [statusLabel, setStatusLabel] = useState('');
    const [isApproved, setIsApproved] = useState(false);

    const [vendor, setVendor] = useState<VendorDetail | null>(null);
    const [vendorDocs, setVendorDocs] = useState<VendorDocument[]>([]);
    const [masterProduct, setMasterProduct] = useState<MasterProductDetail | null>(null);
    const [vendorProduct, setVendorProduct] = useState<VendorProductDetail | null>(null);
    const [category, setCategory] = useState<CategoryDetail | null>(null);
    const [brand, setBrand] = useState<BrandDetail | null>(null);

    const [brands, setBrands] = useState<BrandOption[]>([]);
    const [parentCategories, setParentCategories] = useState<ParentCategoryOption[]>([]);
    const [allCategories, setAllCategories] = useState<Array<{ id: string; name: string }>>([]);

    // Edit form state
    const [vendorForm, setVendorForm] = useState({ businessName: '', fullName: '', email: '', phone: '' });
    const [masterForm, setMasterForm] = useState({ name: '', brand: '', sku: '', categoryId: '', categoryName: '', imageUrl: '' });
    const [productForm, setProductForm] = useState({ name: '', brand: '', basePrice: '', categoryId: '', categoryName: '', imageUrl: '' });
    const [catalogSkuInput, setCatalogSkuInput] = useState('');
    const [linkMasterId, setLinkMasterId] = useState('');
    const [catalogSkuLookup, setCatalogSkuLookup] = useState<{
        status: 'idle' | 'loading' | 'new' | 'link';
        master?: { id: string; sku: string; name: string };
    }>({ status: 'idle' });
    const [confirmLinkAnyway, setConfirmLinkAnyway] = useState(false);
    const [categoryForm, setCategoryForm] = useState({ name: '', slug: '', parentId: '', imageUrl: '', isActive: true });
    const [brandForm, setBrandForm] = useState({ name: '', tagline: '', logoUrl: '' });

    const resetState = useCallback(() => {
        setIsEditing(false);
        setShowRejectModal(false);
        setRejectNote('');
        setVendor(null);
        setVendorDocs([]);
        setMasterProduct(null);
        setVendorProduct(null);
        setCategory(null);
        setBrand(null);
        setCatalogSkuInput('');
        setLinkMasterId('');
        setCatalogSkuLookup({ status: 'idle' });
        setConfirmLinkAnyway(false);
        setAllCategories([]);
        setTitle('');
        setStatusLabel('');
        setIsApproved(false);
    }, []);

    const loadEntity = useCallback(async (t: ReviewTarget) => {
        setLoading(true);
        resetState();
        try {
            if (t.type === 'vendor') {
                const [vRes, dRes] = await Promise.all([
                    fetch(`/api/v1/admin/vendors/${t.id}`),
                    fetch(`/api/v1/admin/vendors/${t.id}/documents`),
                ]);
                const vJson = await vRes.json();
                const dJson = await dRes.json();
                if (!vJson.success) throw new Error(vJson.error?.message || 'Failed to load vendor');
                const v: VendorDetail = vJson.data;
                setVendor(v);
                setVendorDocs(dJson.success ? (dJson.data ?? []) : []);
                setTitle(v.businessName);
                setStatusLabel(v.isVerified ? 'Verified' : 'Pending');
                setIsApproved(v.isVerified);
                setVendorForm({
                    businessName: v.businessName,
                    fullName: v.user.fullName,
                    email: v.user.email,
                    phone: v.user.phone,
                });
            } else if (t.type === 'product' && t.kind === 'master') {
                const res = await fetch(`/api/v1/admin/master-products/${t.id}`);
                const json = await res.json();
                if (!json.success) throw new Error(json.error?.message || 'Failed to load product');
                const p: MasterProductDetail = json.data;
                setMasterProduct(p);
                setTitle(p.name);
                setStatusLabel(p.approvalStatus);
                setIsApproved(p.approvalStatus === 'approved');
                setMasterForm({
                    name: p.name,
                    brand: p.brand ?? '',
                    sku: p.sku,
                    categoryId: p.category?.id ?? '',
                    categoryName: p.category?.name ?? '',
                    imageUrl: p.imageUrl ?? '',
                });
                const bRes = await fetch('/api/v1/brands?limit=100&scope=picker');
                const bJson = await bRes.json();
                if (bJson.success) {
                    const list = bJson.data?.brands ?? bJson.data ?? [];
                    setBrands(Array.isArray(list) ? list.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })) : []);
                }
            } else if (t.type === 'product' && t.kind === 'vendor') {
                const [res, bRes, cRes] = await Promise.all([
                    fetch(`/api/v1/admin/products/${t.id}`),
                    fetch('/api/v1/brands?limit=100&scope=picker'),
                    fetch('/api/v1/admin/categories'),
                ]);
                const json = await res.json();
                const bJson = await bRes.json();
                const cJson = await cRes.json();

                if (!json.success) throw new Error(json.error?.message || 'Failed to load product');
                const p: VendorProductDetail = json.data;
                setVendorProduct(p);
                setTitle(p.name);
                setStatusLabel(
                    p.approvalStatus === 'pending_edit'
                        ? 'Edit Pending'
                        : p.approvalStatus,
                );
                setIsApproved(p.approvalStatus === 'approved');
                setProductForm({
                    name: p.name,
                    brand: p.brand ?? '',
                    basePrice: String(p.basePrice),
                    categoryId: p.category?.id ?? '',
                    categoryName: p.category?.name ?? '',
                    imageUrl: p.imageUrl ?? '',
                });
                setCatalogSkuInput(p.masterProduct?.sku ?? '');
                setLinkMasterId(p.masterProduct?.id ?? '');
                if (bJson.success) {
                    const list = bJson.data?.brands ?? bJson.data ?? [];
                    setBrands(Array.isArray(list) ? list.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })) : []);
                }
                if (cJson.success) {
                    const list = cJson.data ?? [];
                    setAllCategories(Array.isArray(list) ? list.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })) : []);
                }
            } else if (t.type === 'category') {
                const [cRes, listRes] = await Promise.all([
                    fetch(`/api/v1/admin/categories/${t.id}`),
                    fetch('/api/v1/admin/categories'),
                ]);
                const cJson = await cRes.json();
                const listJson = await listRes.json();
                if (!cJson.success) throw new Error(cJson.error?.message || 'Failed to load category');
                const c: CategoryDetail = cJson.data;
                setCategory(c);
                setTitle(c.name);
                setStatusLabel(c.approvalStatus);
                setIsApproved(c.approvalStatus === 'approved');
                setCategoryForm({
                    name: c.name,
                    slug: c.slug,
                    parentId: c.parentId ?? '',
                    imageUrl: c.imageUrl ?? '',
                    isActive: c.isActive,
                });
                if (listJson.success) {
                    const all: CategoryDetail[] = listJson.data ?? [];
                    setParentCategories(
                        all
                            .filter((x) => x.id !== c.id && !x.parentId)
                            .map((x) => ({ id: x.id, name: x.name })),
                    );
                }
            } else if (t.type === 'brand') {
                const res = await fetch(`/api/v1/admin/brands/${t.id}`);
                const json = await res.json();
                if (!json.success) throw new Error(json.error?.message || 'Failed to load brand');
                const b: BrandDetail = json.data;
                setBrand(b);
                setTitle(b.name);
                setStatusLabel(b.approvalStatus);
                setIsApproved(b.approvalStatus === 'approved');
                setBrandForm({ name: b.name, tagline: b.tagline ?? '', logoUrl: b.logoUrl ?? '' });
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Failed to load details');
            onClose();
        } finally {
            setLoading(false);
        }
    }, [onClose, resetState]);

    useEffect(() => {
        if (target) void loadEntity(target);
        else resetState();
    }, [target, loadEntity, resetState]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && open && !showRejectModal) onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, showRejectModal, onClose]);

    // Preview whether Assign Catalog SKU will create a master or link an existing one.
    useEffect(() => {
        const sku = catalogSkuInput.trim();
        const canLookup =
            target?.type === 'product' &&
            target.kind === 'vendor' &&
            vendorProduct?.approvalStatus === 'pending' &&
            !vendorProduct.masterProduct;

        if (!canLookup || sku.length < 2) {
            setCatalogSkuLookup({ status: 'idle' });
            return;
        }

        let cancelled = false;
        setCatalogSkuLookup({ status: 'loading' });
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/v1/master-products?exact=true&search=${encodeURIComponent(sku)}&limit=1`,
                );
                const json = await res.json();
                if (cancelled) return;
                const hit = Array.isArray(json.data) ? json.data[0] : null;
                if (hit?.id && hit?.sku && hit?.name) {
                    setCatalogSkuLookup({
                        status: 'link',
                        master: { id: hit.id, sku: hit.sku, name: hit.name },
                    });
                } else {
                    setCatalogSkuLookup({ status: 'new' });
                }
            } catch {
                if (!cancelled) setCatalogSkuLookup({ status: 'idle' });
            }
        }, 350);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [catalogSkuInput, target, vendorProduct]);

    const catalogNameMismatch =
        catalogSkuLookup.status === 'link' &&
        !!vendorProduct &&
        !!catalogSkuLookup.master &&
        vendorProduct.name.trim().toLowerCase() !== catalogSkuLookup.master.name.trim().toLowerCase();

    const handleSave = async () => {
        if (!target) return;
        setSaving(true);
        try {
            if (target.type === 'vendor' && vendor) {
                const res = await fetch(`/api/v1/admin/vendors/${vendor.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        businessName: vendorForm.businessName.trim(),
                        fullName: vendorForm.fullName.trim(),
                        email: vendorForm.email.trim(),
                        phone: vendorForm.phone.trim(),
                    }),
                });
                const json = await res.json();
                if (!json.success && !res.ok) throw new Error(json.error?.message || 'Save failed');
                toast.success('Vendor updated');
            } else if (target.type === 'product' && target.kind === 'master' && masterProduct) {
                const body: Record<string, unknown> = {
                    name: masterForm.name.trim(),
                    brand: masterForm.brand.trim(),
                    imageUrl: masterForm.imageUrl.trim() || null,
                };
                if (masterForm.categoryId) body.categoryId = masterForm.categoryId;
                if (masterProduct.approvalStatus === 'pending' && masterForm.sku.trim()) {
                    body.sku = masterForm.sku.trim();
                }
                const res = await fetch(`/api/v1/admin/master-products/${masterProduct.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const json = await res.json();
                if (!json.success && !res.ok) throw new Error(json.error?.message || 'Save failed');
                toast.success('Product updated');
            } else if (target.type === 'product' && target.kind === 'vendor' && vendorProduct) {
                const body: Record<string, unknown> = {
                    name: productForm.name.trim(),
                    brand: productForm.brand.trim(),
                    imageUrl: productForm.imageUrl.trim() || undefined,
                    basePrice: Number(productForm.basePrice),
                };
                if (productForm.categoryId) body.primaryCategoryId = productForm.categoryId;
                const res = await fetch(`/api/v1/admin/products/${vendorProduct.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const json = await res.json();
                if (!json.success && !res.ok) throw new Error(json.error?.message || 'Save failed');
                toast.success('Product updated');
            } else if (target.type === 'category' && category) {
                const res = await fetch(`/api/v1/admin/categories/${category.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: categoryForm.name.trim(),
                        slug: categoryForm.slug.trim(),
                        parentId: categoryForm.parentId || null,
                        imageUrl: categoryForm.imageUrl.trim() || null,
                        isActive: categoryForm.isActive,
                    }),
                });
                const json = await res.json();
                if (!json.success && !res.ok) throw new Error(json.error?.message || 'Save failed');
                toast.success('Category updated');
            } else if (target.type === 'brand' && brand) {
                const res = await fetch(`/api/v1/admin/brands/${brand.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: brandForm.name.trim(),
                        tagline: brandForm.tagline.trim() || null,
                        logoUrl: brandForm.logoUrl.trim() || null,
                    }),
                });
                const json = await res.json();
                if (!json.success && !res.ok) throw new Error(json.error?.message || 'Save failed');
                toast.success('Brand updated');
            }
            setIsEditing(false);
            if (target) await loadEntity(target);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const handleAccept = async () => {
        if (!target) return;
        setActionLoading(true);
        try {
            if (target.type === 'vendor' && vendor) {
                const res = await fetch(`/api/v1/admin/vendors/${vendor.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isVerified: true }),
                });
                const json = await res.json();
                if (!json.success && !res.ok) throw new Error(json.error?.message || 'Approval failed');
                toast.success(`${vendor.businessName} approved`);
                onComplete();
            } else if (target.type === 'product') {
                if (target.kind === 'vendor' && vendorProduct?.approvalStatus === 'pending') {
                    const hasMaster =
                        !!linkMasterId ||
                        !!vendorProduct.masterProduct?.id;
                    if (!hasMaster && !catalogSkuInput.trim()) {
                        toast.error('Assign a catalog SKU before approving this vendor listing.');
                        return;
                    }
                    if (catalogNameMismatch && !confirmLinkAnyway) {
                        toast.error('Catalog SKU matches a different product name — confirm the link before approving.');
                        return;
                    }
                }
                if (target.kind === 'master' && masterProduct?.approvalStatus === 'pending' && !masterForm.sku.trim()) {
                    toast.error('Enter a catalog SKU before approving this master item.');
                    return;
                }

                const approvalBody: Record<string, unknown> = { action: 'approve' };
                if (target.kind === 'vendor') {
                    if (linkMasterId) {
                        approvalBody.masterProductId = linkMasterId;
                    } else if (catalogSkuInput.trim()) {
                        approvalBody.catalogSku = catalogSkuInput.trim().toUpperCase();
                    }
                    if (confirmLinkAnyway) {
                        approvalBody.confirmLink = true;
                    }
                } else if (target.kind === 'master' && masterForm.sku.trim()) {
                    approvalBody.catalogSku = masterForm.sku.trim().toUpperCase();
                }
                const url = target.kind === 'master'
                    ? `/api/v1/admin/master-products/${target.id}/approval`
                    : `/api/v1/admin/products/${target.id}/approval`;
                const res = await fetch(url, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(approvalBody),
                });
                const json = await res.json();
                if (!res.ok || !json.success) {
                    if (json.error?.code === 'CONFIRM_LINK_REQUIRED') {
                        const details = json.error?.details as
                            | { masterId?: string; masterName?: string; masterSku?: string }
                            | undefined;
                        if (details?.masterId && details.masterName && details.masterSku) {
                            setCatalogSkuLookup({
                                status: 'link',
                                master: {
                                    id: details.masterId,
                                    name: details.masterName,
                                    sku: details.masterSku,
                                },
                            });
                        }
                        setConfirmLinkAnyway(false);
                        toast.error(json.error?.message || 'Confirm linking to this catalog SKU.');
                        return;
                    }
                    throw new Error(json.error?.message || 'Could not approve product');
                }
                toast.success('Product approved');
                onComplete();
            } else if (target.type === 'category' && category) {
                const res = await fetch(`/api/v1/admin/categories/${category.id}/approval`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'approve' }),
                });
                const json = await res.json();
                if (!json.success && !res.ok) throw new Error(json.error?.message || 'Approval failed');
                toast.success(`${category.name} approved`);
                onComplete();
            } else if (target.type === 'brand' && brand) {
                const res = await fetch(`/api/v1/admin/brands/${brand.id}/approve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'approved' }),
                });
                const json = await res.json();
                if (!json.success && !res.ok) throw new Error(json.error?.message || 'Approval failed');
                toast.success(`${brand.name} approved`);
                onComplete();
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Approval failed');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRevoke = async () => {
        if (!target) return;
        setActionLoading(true);
        try {
            if (target.type === 'vendor' && vendor) {
                const res = await fetch(`/api/v1/admin/vendors/${vendor.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isVerified: false }),
                });
                const json = await res.json();
                if (!json.success && !res.ok) throw new Error(json.error?.message || 'Revoke failed');
                toast.success('Vendor verification revoked');
                onComplete();
            } else if (target.type === 'brand' && brand) {
                const res = await fetch(`/api/v1/admin/brands/${brand.id}/approve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'rejected' }),
                });
                const json = await res.json();
                if (!json.success && !res.ok) throw new Error(json.error?.message || 'Revoke failed');
                toast.success('Brand approval revoked');
                onComplete();
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Revoke failed');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRejectConfirm = async () => {
        if (!target || !rejectNote.trim()) {
            toast.error('Please provide a reason');
            return;
        }
        setActionLoading(true);
        try {
            if (target.type === 'vendor' && vendor) {
                const res = await fetch(`/api/v1/admin/vendors/${vendor.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isActive: false }),
                });
                const json = await res.json();
                if (!json.success && !res.ok) throw new Error(json.error?.message || 'Rejection failed');
                toast.success('Vendor rejected');
                setShowRejectModal(false);
                setRejectNote('');
                onComplete();
            } else if (target.type === 'product') {
                const url = target.kind === 'master'
                    ? `/api/v1/admin/master-products/${target.id}/approval`
                    : `/api/v1/admin/products/${target.id}/approval`;
                const res = await fetch(url, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'reject', note: rejectNote.trim() }),
                });
                const json = await res.json();
                if (!json.success && !res.ok) throw new Error(json.error?.message || 'Rejection failed');
                toast.success('Product rejected');
                setShowRejectModal(false);
                setRejectNote('');
                onComplete();
            } else if (target.type === 'category' && category) {
                const res = await fetch(`/api/v1/admin/categories/${category.id}/approval`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'reject', note: rejectNote.trim() }),
                });
                const json = await res.json();
                if (!json.success && !res.ok) throw new Error(json.error?.message || 'Rejection failed');
                toast.success('Category rejected');
                setShowRejectModal(false);
                setRejectNote('');
                onComplete();
            } else if (target.type === 'brand' && brand) {
                const res = await fetch(`/api/v1/admin/brands/${brand.id}/approve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'rejected', reviewNote: rejectNote.trim() }),
                });
                const json = await res.json();
                if (!json.success && !res.ok) throw new Error(json.error?.message || 'Rejection failed');
                toast.success('Brand rejected');
                setShowRejectModal(false);
                setRejectNote('');
                onComplete();
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Rejection failed');
        } finally {
            setActionLoading(false);
        }
    };

    const canReject = target && (
        (target.type === 'vendor' && vendor && !vendor.isVerified) ||
        (target.type === 'product' && (!isApproved || vendorProduct?.approvalStatus === 'pending_edit')) ||
        (target.type === 'category' && category && category.approvalStatus === 'pending') ||
        (target.type === 'brand' && brand && brand.approvalStatus === 'pending')
    );

    const canAccept = target && (
        (target.type === 'vendor' && vendor && !vendor.isVerified) ||
        (target.type !== 'vendor' && !isApproved)
    );
    const canRevoke = target && isApproved && (target.type === 'vendor' || target.type === 'brand');

    const Icon = target ? typeIcon(target) : Package;

    const renderBody = () => {
        if (loading) {
            return (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-8 h-8 animate-spin text-[#6B1D2E]" />
                </div>
            );
        }

        if (target?.type === 'vendor' && vendor) {
            const address = [vendor.addressLine, vendor.city, vendor.state, vendor.addressPincode].filter(Boolean).join(', ');
            if (isEditing) {
                return (
                    <div className="space-y-4 p-6">
                        <div>
                            <FieldLabel>Business Name</FieldLabel>
                            <input className={inputCls} value={vendorForm.businessName} onChange={(e) => setVendorForm((f) => ({ ...f, businessName: e.target.value }))} />
                        </div>
                        <div>
                            <FieldLabel>Owner Name</FieldLabel>
                            <input className={inputCls} value={vendorForm.fullName} onChange={(e) => setVendorForm((f) => ({ ...f, fullName: e.target.value }))} />
                        </div>
                        <div>
                            <FieldLabel>Email</FieldLabel>
                            <input type="email" className={inputCls} value={vendorForm.email} onChange={(e) => setVendorForm((f) => ({ ...f, email: e.target.value }))} />
                        </div>
                        <div>
                            <FieldLabel>Phone</FieldLabel>
                            <input className={inputCls} value={vendorForm.phone} onChange={(e) => setVendorForm((f) => ({ ...f, phone: e.target.value }))} />
                        </div>
                    </div>
                );
            }
            return (
                <div className="space-y-6 p-6">
                    <div className="flex items-center gap-4">
                        {vendor.logoUrl ? (
                            <img src={vendor.logoUrl} alt="" className="w-16 h-16 rounded-full object-cover border" />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-[#F8E8EC] flex items-center justify-center text-[#6B1D2E] font-bold text-lg">
                                {vendor.businessName.slice(0, 2).toUpperCase()}
                            </div>
                        )}
                        <div>
                            <h3 className="text-[18px] font-[900] text-[#181725]">{vendor.businessName}</h3>
                            <p className="text-[13px] text-[#7C7C7C]">{vendor.user.fullName}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <DetailRow label="Email" value={vendor.user.email} />
                        <DetailRow label="Phone" value={vendor.user.phone} />
                        <DetailRow label="GST" value={vendor.gstNumber} />
                        <DetailRow label="Products" value={String(vendor._count.products)} />
                        <DetailRow label="Orders" value={String(vendor._count.orders)} />
                    </div>
                    {address && <DetailRow label="Address" value={address} />}
                    {vendorDocs.length > 0 && (
                        <div>
                            <FieldLabel>Documents</FieldLabel>
                            <ul className="space-y-2 mt-2">
                                {vendorDocs.map((doc) => (
                                    <li key={doc.id} className="flex items-center justify-between bg-[#F8F9FB] rounded-[10px] px-4 py-2.5">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <FileText size={16} className="text-[#7C7C7C] shrink-0" />
                                            <span className="text-[13px] font-semibold text-[#181725] truncate">{doc.fileName || doc.type}</span>
                                            <span className={cn(
                                                'text-[10px] font-bold uppercase px-2 py-0.5 rounded',
                                                doc.status === 'verified' ? 'bg-[#F8E8EC] text-[#6B1D2E]' : 'bg-[#FFF7E6] text-[#F59E0B]',
                                            )}>
                                                {doc.status}
                                            </span>
                                        </div>
                                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[#6B1D2E] shrink-0 ml-2">
                                            <ExternalLink size={14} />
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            );
        }

        if (target?.type === 'product' && target.kind === 'master' && masterProduct) {
            if (isEditing) {
                return (
                    <div className="space-y-4 p-6">
                        <div>
                            <FieldLabel>Product Name</FieldLabel>
                            <input className={inputCls} value={masterForm.name} onChange={(e) => setMasterForm((f) => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                            <FieldLabel>SKU</FieldLabel>
                            {masterProduct.approvalStatus === 'pending' ? (
                                <input
                                    className={inputCls}
                                    value={masterForm.sku}
                                    onChange={(e) => setMasterForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))}
                                    placeholder="e.g., RIC-BAS-001"
                                />
                            ) : (
                                <input className={cn(inputCls, 'bg-[#F8F9FB] cursor-not-allowed')} value={masterProduct.sku} readOnly />
                            )}
                        </div>
                        <div>
                            <FieldLabel>Brand</FieldLabel>
                            <BrandSinglePicker value={masterForm.brand} onChange={(v) => setMasterForm((f) => ({ ...f, brand: v }))} brands={brands} />
                        </div>
                        <div>
                            <CategorySinglePicker
                                valueId={masterForm.categoryId || null}
                                valueName={masterForm.categoryName || null}
                                onChange={(c) => setMasterForm((f) => ({ ...f, categoryId: c.id ?? '', categoryName: c.name ?? '' }))}
                            />
                        </div>
                        <div>
                            <FieldLabel>Image URL</FieldLabel>
                            <input className={inputCls} value={masterForm.imageUrl} onChange={(e) => setMasterForm((f) => ({ ...f, imageUrl: e.target.value }))} />
                        </div>
                    </div>
                );
            }
            return (
                <div className="space-y-6 p-6">
                    <div className="flex items-center gap-4">
                        {masterProduct.imageUrl ? (
                            <img src={masterProduct.imageUrl} alt="" className="w-16 h-16 rounded-[10px] object-cover border" />
                        ) : (
                            <div className="w-16 h-16 rounded-[10px] bg-[#F8F9FB] flex items-center justify-center"><Package size={24} className="text-[#AEAEAE]" /></div>
                        )}
                        <div>
                            <h3 className="text-[18px] font-[900] text-[#181725]">{masterProduct.name}</h3>
                            <p className="text-[12px] text-[#AEAEAE] font-medium">SKU: {masterProduct.sku}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <DetailRow label="Brand" value={masterProduct.brand} />
                        <DetailRow label="Category" value={masterProduct.category?.name} />
                        <DetailRow label="Type" value="Master Catalog" />
                        <DetailRow label="Status" value={masterProduct.approvalStatus} />
                    </div>
                    {masterProduct.approvalStatus === 'pending' && (
                        <div>
                            <FieldLabel required>Catalog SKU</FieldLabel>
                            <input
                                className={inputCls}
                                value={masterForm.sku}
                                onChange={(e) => setMasterForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))}
                                placeholder="e.g., RIC-BAS-001"
                            />
                            <p className="text-[11px] text-[#AEAEAE] font-medium mt-1.5">
                                Admin-assigned global catalog identifier. Required before approval.
                            </p>
                        </div>
                    )}
                </div>
            );
        }

        if (target?.type === 'product' && target.kind === 'vendor' && vendorProduct) {
            if (isEditing) {
                return (
                    <div className="space-y-4 p-6">
                        <div>
                            <FieldLabel>Product Name</FieldLabel>
                            <input className={inputCls} value={productForm.name} onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                            <FieldLabel>Brand</FieldLabel>
                            <BrandSinglePicker value={productForm.brand} onChange={(v) => setProductForm((f) => ({ ...f, brand: v }))} brands={brands} />
                        </div>
                        <div>
                            <FieldLabel>Base Price (₹)</FieldLabel>
                            <input type="number" className={inputCls} value={productForm.basePrice} onChange={(e) => setProductForm((f) => ({ ...f, basePrice: e.target.value }))} />
                        </div>
                        <div>
                            <CategorySinglePicker
                                valueId={productForm.categoryId || null}
                                valueName={productForm.categoryName || null}
                                onChange={(c) => setProductForm((f) => ({ ...f, categoryId: c.id ?? '', categoryName: c.name ?? '' }))}
                            />
                        </div>
                        <div>
                            <FieldLabel>Image URL</FieldLabel>
                            <input className={inputCls} value={productForm.imageUrl} onChange={(e) => setProductForm((f) => ({ ...f, imageUrl: e.target.value }))} />
                        </div>
                    </div>
                );
            }
            return (
                <div className="space-y-6 p-6">
                    <div className="flex items-start gap-4">
                        {vendorProduct.imageUrl ? (
                            <img src={vendorProduct.imageUrl} alt="" className="w-16 h-16 rounded-[10px] object-cover border shrink-0" />
                        ) : (
                            <div className="w-16 h-16 rounded-[10px] bg-[#F8F9FB] flex items-center justify-center shrink-0"><Package size={24} className="text-[#AEAEAE]" /></div>
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-[18px] font-[900] text-[#181725]">{vendorProduct.name}</h3>
                                {vendorProduct.brandMappings && vendorProduct.brandMappings.length > 0 && (
                                    <span className="text-[10px] font-[900] px-2 py-0.5 rounded-[6px] uppercase bg-[#F8E8EC] text-[#6B1D2E]">
                                        Brand mapped
                                    </span>
                                )}
                                {vendorProduct.approvalStatus === 'pending_edit' && (
                                    <span className="text-[10px] font-[900] px-2 py-0.5 rounded-[6px] uppercase bg-[#FFF8E1] text-[#8B6914]">
                                        Edit Pending
                                    </span>
                                )}
                            </div>
                            {vendorProduct.sku && <p className="text-[12px] text-[#AEAEAE]">SKU: {vendorProduct.sku}</p>}
                            {vendorProduct.brandMappings?.[0]?.brandMasterProduct?.brand?.name && (
                                <p className="text-[12px] text-[#6B1D2E] font-semibold mt-0.5">
                                    {vendorProduct.brandMappings[0].brandMasterProduct.brand.name}
                                    {vendorProduct.brandMappings[0].brandMasterProduct.name
                                        ? ` · ${vendorProduct.brandMappings[0].brandMasterProduct.name}`
                                        : ''}
                                </p>
                            )}
                        </div>
                    </div>

                    {(() => {
                        const meta = asMetaRecord(vendorProduct.metadata);
                        const packaging = meta.packaging;
                        const identifiers = meta.identifiers;
                        const categoryNames = (() => {
                            const linked = (vendorProduct.categoryLinks ?? [])
                                .map((l) => l.category?.name)
                                .filter((n): n is string => Boolean(n));
                            if (linked.length > 0) return linked.join(', ');
                            return vendorProduct.category?.name ?? '';
                        })();
                        const stockQty = (() => {
                            const rows = vendorProduct.inventories;
                            return vendorProduct.inventory?.qtyAvailable
                                ?? (rows?.length ? rows.reduce((s, r) => s + r.qtyAvailable, 0) : null);
                        })();
                        const gallery = [
                            ...(vendorProduct.imageUrl ? [vendorProduct.imageUrl] : []),
                            ...(Array.isArray(vendorProduct.images) ? vendorProduct.images : []),
                        ].filter((url, idx, arr) => url && arr.indexOf(url) === idx);

                        return (
                            <>
                                <ReviewSection title="Identity">
                                    <DetailRow label="Vendor" value={vendorProduct.vendor?.businessName} />
                                    <DetailRow label="Brand" value={vendorProduct.brand} />
                                    <DetailRow label="Slug" value={vendorProduct.slug} />
                                    <DetailRow label="POS SKU" value={vendorProduct.vendorSku ?? vendorProduct.sku} />
                                    <DetailRow label="Catalog SKU" value={vendorProduct.masterProduct?.sku} />
                                    <DetailRow label="Category" value={categoryNames} />
                                    <DetailRow label="Status" value={vendorProduct.approvalStatus} />
                                    <DetailRow label="Stock" value={stockQty != null ? String(stockQty) : '—'} />
                                    <div className="col-span-2">
                                        <DetailRow label="Description" value={vendorProduct.description} />
                                    </div>
                                </ReviewSection>

                                <ReviewSection title="Compliance">
                                    <DetailRow label="HSN" value={vendorProduct.hsn} />
                                    <DetailRow label="FSSAI Ref" value={vendorProduct.fssaiRef} />
                                    <DetailRow label="Barcode" value={vendorProduct.barcode} />
                                    <DetailRow label="Country of Origin" value={vendorProduct.countryOfOrigin} />
                                </ReviewSection>

                                <ReviewSection title="Specs">
                                    <DetailRow label="Veg / Non-Veg" value={vendorProduct.vegNonVeg} />
                                    <DetailRow label="Storage" value={vendorProduct.storageType} />
                                    <DetailRow label="Shelf Life (days)" value={vendorProduct.shelfLifeDays != null ? String(vendorProduct.shelfLifeDays) : ''} />
                                    <DetailRow label="Pack Size" value={vendorProduct.packSize} />
                                    <DetailRow label="Unit" value={vendorProduct.unit} />
                                </ReviewSection>

                                <ReviewSection title="Commerce">
                                    <DetailRow label="Base Price" value={formatMoney(vendorProduct.basePrice)} />
                                    <DetailRow label="MRP / Original" value={formatMoney(vendorProduct.originalPrice)} />
                                    <DetailRow label="Tax %" value={vendorProduct.taxPercent != null ? String(vendorProduct.taxPercent) : ''} />
                                    <DetailRow label="Min Order Qty" value={vendorProduct.minOrderQty != null ? String(vendorProduct.minOrderQty) : ''} />
                                    <DetailRow label="Credit Eligible" value={vendorProduct.creditEligible ? 'Yes' : 'No'} />
                                    <div className="col-span-2">
                                        <FieldLabel>Price Slabs</FieldLabel>
                                        {vendorProduct.priceSlabs && vendorProduct.priceSlabs.length > 0 ? (
                                            <ul className="mt-1 space-y-1">
                                                {vendorProduct.priceSlabs.map((slab, idx) => (
                                                    <li key={`${slab.minQty}-${idx}`} className="text-[13px] font-semibold text-[#181725]">
                                                        Qty {slab.minQty}
                                                        {slab.maxQty != null ? `–${slab.maxQty}` : '+'}
                                                        {' → '}
                                                        {formatMoney(slab.price)}
                                                        {slab.promoPrice != null ? ` (promo ${formatMoney(slab.promoPrice)})` : ''}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-[14px] font-semibold text-[#181725]">—</p>
                                        )}
                                    </div>
                                </ReviewSection>

                                <ReviewSection title="Packaging & Identifiers">
                                    <DetailRow
                                        label="Package Weight"
                                        value={
                                            packaging.packageWeight != null && packaging.packageWeight !== ''
                                                ? `${metaScalar(packaging.packageWeight)}${packaging.weightUnit ? ` ${metaScalar(packaging.weightUnit)}` : ''}`
                                                : ''
                                        }
                                    />
                                    <DetailRow
                                        label="Dimensions (L×W×H)"
                                        value={
                                            packaging.packageLength != null || packaging.packageWidth != null || packaging.packageHeight != null
                                                ? [
                                                    metaScalar(packaging.packageLength) || '—',
                                                    metaScalar(packaging.packageWidth) || '—',
                                                    metaScalar(packaging.packageHeight) || '—',
                                                ].join(' × ') + (packaging.dimensionUnit ? ` ${metaScalar(packaging.dimensionUnit)}` : '')
                                                : ''
                                        }
                                    />
                                    <DetailRow label="EAN" value={metaScalar(identifiers.ean)} />
                                    <DetailRow label="ISBN" value={metaScalar(identifiers.isbn)} />
                                </ReviewSection>

                                <ReviewSection title="Search Terms">
                                    <div className="col-span-2">
                                        <DetailRow label="Tags" value={joinList(vendorProduct.tags)} />
                                    </div>
                                    <div className="col-span-2">
                                        <DetailRow label="Alias Names" value={joinList(vendorProduct.aliasNames)} />
                                    </div>
                                </ReviewSection>

                                <div className="space-y-3 pt-4 border-t border-[#F5F5F5]">
                                    <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider">Images</p>
                                    {gallery.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {gallery.map((url) => (
                                                <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
                                                    <img
                                                        src={url}
                                                        alt=""
                                                        className="w-16 h-16 rounded-[8px] object-cover border border-[#EEEEEE] hover:border-[#6B1D2E]/50"
                                                    />
                                                </a>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[14px] font-semibold text-[#181725]">—</p>
                                    )}
                                </div>
                            </>
                        );
                    })()}

                    {vendorProduct.approvalStatus === 'pending_edit' && vendorProduct.pendingEditPayload && (() => {
                        const pending = vendorProduct.pendingEditPayload as Record<string, unknown>;
                        const diffFields: Array<{ label: string; oldVal: React.ReactNode; newVal: React.ReactNode }> = [];

                        if (pending.name !== undefined && pending.name !== vendorProduct.name) {
                            diffFields.push({ label: 'Product Name', oldVal: vendorProduct.name, newVal: String(pending.name) });
                        }
                        if (pending.brand !== undefined && pending.brand !== vendorProduct.brand) {
                            diffFields.push({ label: 'Brand', oldVal: vendorProduct.brand, newVal: pending.brand as React.ReactNode });
                        }
                        if (pending.hsn !== undefined && pending.hsn !== vendorProduct.hsn) {
                            diffFields.push({ label: 'HSN Code', oldVal: vendorProduct.hsn, newVal: pending.hsn as React.ReactNode });
                        }
                        if (pending.packSize !== undefined && pending.packSize !== vendorProduct.packSize) {
                            diffFields.push({ label: 'Pack Size', oldVal: vendorProduct.packSize, newVal: pending.packSize as React.ReactNode });
                        }
                        if (pending.unit !== undefined && pending.unit !== vendorProduct.unit) {
                            diffFields.push({ label: 'Unit', oldVal: vendorProduct.unit, newVal: pending.unit as React.ReactNode });
                        }
                        if (pending.vegNonVeg !== undefined && pending.vegNonVeg !== vendorProduct.vegNonVeg) {
                            diffFields.push({ label: 'Veg/Non-Veg', oldVal: vendorProduct.vegNonVeg, newVal: pending.vegNonVeg as React.ReactNode });
                        }
                        if (pending.imageUrl !== undefined && pending.imageUrl !== vendorProduct.imageUrl) {
                            diffFields.push({
                                label: 'Image',
                                oldVal: vendorProduct.imageUrl ? <img src={vendorProduct.imageUrl} alt="Current" className="w-12 h-12 object-contain rounded border border-gray-200 bg-gray-50" /> : '—',
                                newVal: typeof pending.imageUrl === 'string' && pending.imageUrl ? <img src={pending.imageUrl} alt="Proposed" className="w-12 h-12 object-contain rounded border border-[#E2B755] bg-yellow-50/20" /> : '—',
                            });
                        }
                        if (pending.images !== undefined) {
                            const oldImgs = vendorProduct.images || [];
                            const newImgs = Array.isArray(pending.images) ? pending.images.filter((x): x is string => typeof x === 'string') : [];
                            const oldStr = [...oldImgs].sort().join(',');
                            const newStr = [...newImgs].sort().join(',');
                            if (oldStr !== newStr) {
                                diffFields.push({
                                    label: 'Additional Images',
                                    oldVal: oldImgs.length > 0 ? (
                                        <div className="flex gap-1 flex-wrap">
                                            {oldImgs.map((img: string) => <img key={img} src={img} className="w-10 h-10 object-contain rounded border border-gray-200 bg-gray-50" />)}
                                        </div>
                                    ) : '—',
                                    newVal: newImgs.length > 0 ? (
                                        <div className="flex gap-1 flex-wrap">
                                            {newImgs.map((img: string) => <img key={img} src={img} className="w-10 h-10 object-contain rounded border border-[#E2B755] bg-yellow-50/20" />)}
                                        </div>
                                    ) : '—',
                                });
                            }
                        }
                        if (pending.categoryIds !== undefined && Array.isArray(pending.categoryIds)) {
                            const oldCats = (vendorProduct.categoryLinks ?? []).map((l) => l.category?.name).filter((n): n is string => Boolean(n));
                            if (oldCats.length === 0 && vendorProduct.category?.name) {
                                oldCats.push(vendorProduct.category.name);
                            }
                            const newCats = pending.categoryIds.map((id) => {
                                const cid = String(id);
                                return allCategories.find((c) => c.id === cid)?.name || cid;
                            });
                            const oldStr = [...oldCats].sort().join(', ');
                            const newStr = [...newCats].sort().join(', ');
                            if (oldStr !== newStr) {
                                diffFields.push({
                                    label: 'Categories',
                                    oldVal: oldCats.join(', '),
                                    newVal: newCats.join(', '),
                                });
                            }
                        }

                        return (
                            <div className="space-y-3 pt-2 border-t border-[#F5F5F5] bg-[#FFF8E1] rounded-[10px] p-4">
                                <div className="flex justify-between items-center">
                                    <p className="text-[12px] font-bold text-[#8B6914] uppercase text-xs tracking-wide">Queued material changes</p>
                                    {typeof pending.submittedAt === 'string' && (
                                        <p className="text-[11px] text-[#8B6914]/80 font-bold">
                                            Submitted on {new Date(pending.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </p>
                                    )}
                                </div>

                                {diffFields.length > 0 ? (
                                    <div className="border border-[#F0D8A8] rounded-[10px] overflow-hidden bg-white shadow-sm">
                                        <table className="w-full text-left border-collapse text-[12px]">
                                            <thead>
                                                <tr className="bg-[#FFF8E1] border-b border-[#F0D8A8]">
                                                    <th className="p-2 font-extrabold text-[#8B6914] w-[30%]">Field</th>
                                                    <th className="p-2 font-extrabold text-[#7C7C7C] w-[35%]">Live Value</th>
                                                    <th className="p-2 font-extrabold text-[#8B6914] w-[35%]">Proposed Value</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {diffFields.map((field, idx) => (
                                                    <tr key={field.label} className={cn("border-b border-gray-100 last:border-0", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50")}>
                                                        <td className="p-2 font-bold text-gray-500">{field.label}</td>
                                                        <td className="p-2 text-[#7C7C7C] font-semibold">{field.oldVal || '—'}</td>
                                                        <td className="p-2 font-bold text-[#8B6914] bg-[#FFFDE7]/40">{field.newVal || '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <pre className="text-[12px] text-[#181725] whitespace-pre-wrap font-mono bg-white p-3 rounded-[10px] border border-[#F0D8A8]">
                                        {JSON.stringify(pending, null, 2)}
                                    </pre>
                                )}
                                <p className="text-[11px] text-[#AEAEAE] font-semibold">Live listing remains unchanged until you approve this edit.</p>
                            </div>
                        );
                    })()}
                    {vendorProduct.approvalStatus === 'pending' && !vendorProduct.masterProduct && (
                        <div className="space-y-3 pt-2 border-t border-[#F5F5F5]">
                            <div>
                                <FieldLabel required>Assign Catalog SKU</FieldLabel>
                                <input
                                    className={inputCls}
                                    value={catalogSkuInput}
                                    onChange={(e) => {
                                        setCatalogSkuInput(e.target.value.toUpperCase());
                                        setLinkMasterId('');
                                        setConfirmLinkAnyway(false);
                                    }}
                                    placeholder="e.g., RIC-BAS-001"
                                />
                                <p className="text-[11px] text-[#AEAEAE] font-medium mt-1.5">
                                    Creates a new master when the SKU is unused, or links to the existing catalog item when it already exists.
                                </p>
                                {catalogSkuLookup.status === 'loading' && (
                                    <p className="text-[11px] text-[#7C7C7C] font-semibold mt-2 flex items-center gap-1.5">
                                        <Loader2 size={12} className="animate-spin" /> Checking catalog…
                                    </p>
                                )}
                                {catalogSkuLookup.status === 'new' && (
                                    <p className="text-[11px] text-[#6B1D2E] font-bold mt-2">
                                        Creates new master catalog item for this listing.
                                    </p>
                                )}
                                {catalogSkuLookup.status === 'link' && catalogSkuLookup.master && (
                                    <div className="mt-2 space-y-2">
                                        <p className="text-[11px] text-[#1A6BB5] font-bold">
                                            Links to existing master: {catalogSkuLookup.master.name} ({catalogSkuLookup.master.sku})
                                        </p>
                                        {catalogNameMismatch && (
                                            <label className="flex items-start gap-2 rounded-[10px] border border-[#F0D8A8] bg-[#FFF8E1] p-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5"
                                                    checked={confirmLinkAnyway}
                                                    onChange={(e) => setConfirmLinkAnyway(e.target.checked)}
                                                />
                                                <span className="text-[11px] text-[#8B6914] font-semibold leading-snug">
                                                    Listing name &quot;{vendorProduct.name}&quot; differs from master
                                                    &quot;{catalogSkuLookup.master.name}&quot;. Confirm link anyway
                                                    (listing name/category will follow the master).
                                                </span>
                                            </label>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        if (target?.type === 'category' && category) {
            if (isEditing) {
                return (
                    <div className="space-y-4 p-6">
                        <div>
                            <FieldLabel>Name</FieldLabel>
                            <input className={inputCls} value={categoryForm.name} onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                            <FieldLabel>Slug</FieldLabel>
                            <input className={inputCls} value={categoryForm.slug} onChange={(e) => setCategoryForm((f) => ({ ...f, slug: e.target.value }))} />
                        </div>
                        <div>
                            <FieldLabel>Parent Category</FieldLabel>
                            <select
                                className={inputCls}
                                value={categoryForm.parentId}
                                onChange={(e) => setCategoryForm((f) => ({ ...f, parentId: e.target.value }))}
                            >
                                <option value="">Top-level</option>
                                {parentCategories.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <FieldLabel>Image URL</FieldLabel>
                            <input className={inputCls} value={categoryForm.imageUrl} onChange={(e) => setCategoryForm((f) => ({ ...f, imageUrl: e.target.value }))} />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={categoryForm.isActive} onChange={(e) => setCategoryForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded" />
                            <span className="text-[13px] font-semibold text-[#181725]">Active</span>
                        </label>
                    </div>
                );
            }
            return (
                <div className="space-y-6 p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-[10px] bg-[#F3F0FF] flex items-center justify-center text-[#8B5CF6]">
                            <Tag size={28} />
                        </div>
                        <div>
                            <h3 className="text-[18px] font-[900] text-[#181725]">{category.name}</h3>
                            <p className="text-[12px] text-[#AEAEAE]">{category.slug}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <DetailRow label="Parent" value={category.parent?.name ?? 'Top-level'} />
                        <DetailRow label="Products" value={category._count ? String(category._count.products) : '—'} />
                        <DetailRow label="Status" value={category.approvalStatus} />
                        <DetailRow label="Active" value={category.isActive ? 'Yes' : 'No'} />
                    </div>
                </div>
            );
        }

        if (target?.type === 'brand' && brand) {
            if (isEditing) {
                return (
                    <div className="space-y-4 p-6">
                        <div>
                            <FieldLabel>Brand Name</FieldLabel>
                            <input className={inputCls} value={brandForm.name} onChange={(e) => setBrandForm((f) => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                            <FieldLabel>Tagline</FieldLabel>
                            <input className={inputCls} value={brandForm.tagline} onChange={(e) => setBrandForm((f) => ({ ...f, tagline: e.target.value }))} />
                        </div>
                        <div>
                            <FieldLabel>Logo URL</FieldLabel>
                            <input className={inputCls} value={brandForm.logoUrl} onChange={(e) => setBrandForm((f) => ({ ...f, logoUrl: e.target.value }))} />
                        </div>
                    </div>
                );
            }
            return (
                <div className="space-y-6 p-6">
                    <div className="flex items-center gap-4">
                        {brand.logoUrl ? (
                            <img src={brand.logoUrl} alt="" className="w-16 h-16 rounded-full object-cover border" />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-[#EDE9FE] flex items-center justify-center text-[#7C3AED] font-bold text-lg">
                                {brand.name.slice(0, 2).toUpperCase()}
                            </div>
                        )}
                        <div>
                            <h3 className="text-[18px] font-[900] text-[#181725]">{brand.name}</h3>
                            {brand.tagline && <p className="text-[13px] text-[#7C7C7C]">{brand.tagline}</p>}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <DetailRow label="Owner" value={brand.user?.fullName ?? 'Label-only'} />
                        <DetailRow label="Email" value={brand.user?.email ?? '—'} />
                        <DetailRow label="Status" value={brand.approvalStatus} />
                    </div>
                </div>
            );
        }

        return null;
    };

    return (
        <>
            <div
                className={cn(
                    'fixed inset-0 bg-black/40 z-[60] transition-opacity duration-300',
                    open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
                )}
                onClick={onClose}
            />

            <div
                className={cn(
                    'fixed z-[70] bg-white shadow-2xl transition-transform duration-300 ease-in-out flex flex-col',
                    'inset-x-0 bottom-0 top-auto h-[min(92dvh,100dvh)] rounded-t-[20px] pb-[env(safe-area-inset-bottom)]',
                    'lg:inset-y-0 lg:right-0 lg:left-auto lg:h-full lg:w-full lg:max-w-[560px] lg:rounded-none',
                    open
                        ? 'translate-y-0 lg:translate-x-0'
                        : 'translate-y-full lg:translate-y-0 lg:translate-x-full',
                )}
            >
                <div className="flex items-center justify-between px-4 lg:px-6 py-4 lg:py-5 border-b border-[#EEEEEE] shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        {target && (
                            <div className="w-10 h-10 rounded-[10px] bg-[#F8F9FB] flex items-center justify-center text-[#6B1D2E] shrink-0">
                                <Icon size={20} />
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider">
                                {target ? typeLabel(target) : 'Review'}
                            </p>
                            <h2 className="text-[18px] font-[900] text-[#181725] truncate">{title || 'Loading…'}</h2>
                        </div>
                        {statusLabel && (
                            <span className={cn(
                                'shrink-0 text-[10px] font-[900] px-2.5 py-1 rounded-[6px] uppercase',
                                isApproved
                                    ? 'bg-[#DCFCE7] text-[#16A34A]'
                                    : statusLabel === 'Edit Pending' || vendorProduct?.approvalStatus === 'pending_edit'
                                        ? 'bg-[#FFF8E1] text-[#8B6914]'
                                        : 'bg-[#FFF7E6] text-[#F59E0B]',
                            )}>
                                {statusLabel}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="size-12 rounded-[12px] flex items-center justify-center hover:bg-[#F8F9FB] text-[#7C7C7C] transition-all shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">{renderBody()}</div>

                {!loading && target && (
                    <div className="px-4 lg:px-6 py-4 lg:py-5 border-t border-[#EEEEEE] shrink-0 flex flex-wrap items-center gap-2">
                        {isEditing ? (
                            <>
                                <button
                                    onClick={() => { setIsEditing(false); if (target) void loadEntity(target); }}
                                    className="flex-1 min-w-[100px] min-h-12 bg-[#F8F9FB] border border-[#EEEEEE] text-[#181725] rounded-[12px] text-[13px] font-semibold hover:bg-[#EEEEEE]"
                                >
                                    Cancel Edit
                                </button>
                                <button
                                    onClick={() => void handleSave()}
                                    disabled={saving}
                                    className="flex-1 min-w-[100px] min-h-12 bg-[#6B1D2E] text-white rounded-[12px] text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                    Save
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="min-h-12 px-4 bg-[#F8F9FB] border border-[#EEEEEE] text-[#181725] rounded-[12px] text-[13px] font-semibold hover:bg-[#F8E8EC] hover:border-[#6B1D2E]/40 flex items-center gap-1.5"
                            >
                                <Pencil size={14} /> Edit
                            </button>
                        )}

                        {!isEditing && (
                            <>
                                {canRevoke && (
                                    <button
                                        onClick={() => void handleRevoke()}
                                        disabled={actionLoading}
                                        className="min-h-12 px-4 bg-amber-500 text-white rounded-[12px] text-[13px] font-semibold disabled:opacity-50 flex items-center gap-1.5"
                                    >
                                        {actionLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                                        Revoke
                                    </button>
                                )}
                                {canAccept && (
                                    <button
                                        onClick={() => void handleAccept()}
                                        disabled={actionLoading}
                                        className="flex-1 min-w-[100px] min-h-12 bg-[#6B1D2E] text-white rounded-[12px] text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
                                    >
                                        {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                        Accept
                                    </button>
                                )}
                                {canReject && (
                                    <button
                                        onClick={() => setShowRejectModal(true)}
                                        disabled={actionLoading}
                                        className="min-h-12 px-4 bg-[#DC2626] text-white rounded-[12px] text-[13px] font-semibold disabled:opacity-50"
                                    >
                                        Reject
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {showRejectModal && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowRejectModal(false)}>
                    <div className="bg-white rounded-[16px] w-full max-w-[440px] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2 mb-4">
                            <MessageSquare size={20} className="text-[#E74C3C]" />
                            <h3 className="text-[16px] font-bold text-[#181725]">Reject {title}</h3>
                        </div>
                        <textarea
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            placeholder="Reason for rejection (required)..."
                            rows={3}
                            className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-[#E74C3C]/40 resize-none mb-4"
                        />
                        <div className="flex items-center gap-3 justify-end">
                            <button
                                onClick={() => { setShowRejectModal(false); setRejectNote(''); }}
                                className="h-[40px] px-5 bg-gray-100 rounded-[10px] text-[13px] font-bold text-[#7C7C7C]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => void handleRejectConfirm()}
                                disabled={!rejectNote.trim() || actionLoading}
                                className="h-[40px] px-5 bg-[#E74C3C] text-white rounded-[10px] text-[13px] font-bold disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                                Reject
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
