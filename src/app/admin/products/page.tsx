'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Search,
    Loader2,
    Plus,
    Upload,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Pencil,
    Trash2,
    X,
    Package,
    CheckCircle,
    Clock,
    XCircle,
    AlertTriangle,
    AlertCircle,
    FileSpreadsheet,
    FileDown,
    ImageIcon,
    Info,
    DollarSign,
    Tag,
    BoxIcon,
    Settings as SettingsIcon,
    BarChart3,
    Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ImageUpload, MultiImageUpload } from '@/components/ui/ImageUpload';
import ProductImportModal from '@/components/features/admin/ProductImportModal';
import BulkProductToolbar from '@/components/features/shared/BulkProductToolbar';
import VendorBulkGrid from '@/components/features/vendor/VendorBulkGrid';
import AdminBulkEngine from '@/components/features/admin/AdminBulkEngine';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';
import { CategoryHierarchyPicker } from '@/components/features/brand/CategoryHierarchyPicker';
import { BrandSinglePicker } from '@/components/features/brand/BrandSinglePicker';
import { toast } from 'sonner';
import FormSection, {
    FieldLabel,
    SectionHeader,
    productFormInputCls,
    productFormSelectCls,
    productFormTextareaCls,
} from '@/components/features/shared/FormSection';
import {
    validateProductEssentials,
    focusFirstProductFormError,
    type ProductValidationField,
} from '@/components/features/shared/productFormValidation';
// Types
// ---------------------------------------------------------------------------

interface Product {
    id: string;
    name: string;
    slug: string;
    basePrice: number;
    originalPrice: number | null;
    imageUrl: string | null;
    sku: string | null;
    hsn: string | null;
    brand: string | null;
    taxPercent: number;
    minOrderQty: number;
    creditEligible: boolean;
    description: string | null;
    isActive: boolean;
    listingStatus?: 'draft' | 'submitted';
    approvalStatus: 'pending' | 'approved' | 'rejected';
    approvalNote: string | null;
    createdAt: string;
    vendor: { id: string; businessName: string; vendorCode?: string | null } | null;
    category: { id: string; name: string; parentId?: string | null } | null;
    categoryLinks?: { categoryId: string; isPrimary: boolean; category: { id: string; name: string } }[];
    inventory: { qtyAvailable: number } | null;
    vendorCount?: number;
    isMasterRow?: boolean;
    vendors?: string[];
    vendorStock?: { vendor: string; qty: number }[];
    totalStock?: number;
    // Fields aligned with the vendor product form (admin API already returns these).
    packSize?: string | null;
    unit?: string | null;
    tags?: string[] | null;
    images?: string[] | null;
    barcode?: string | null;
    metadata?: Record<string, unknown>;
    priceSlabs?: { minQty: number; price: number }[];
    aliasNames?: string[];
    countryOfOrigin?: string | null;
    vegNonVeg?: string | null;
    storageType?: string | null;
    vendorSku?: string | null;
}

interface Vendor {
    id: string;
    businessName: string;
    vendorCode?: string | null;
}

interface Category {
    id: string;
    name: string;
    parentId?: string | null; // null = top-level, set = sub-category (rendered with leading "— ")
}

interface BrandOption {
    id: string;
    name: string;
}

interface SlabRow {
    minQty: string;
    price: string;
}

interface ProductFormData {
    name: string;
    sku: string;
    hsn: string;
    barcode: string;
    brand: string;
    // Unified multi-category — first entry is the primary (mirrored into
    // Product.categoryId on the server). Matches the vendor product form so
    // both surfaces share CategoryHierarchyPicker and behave identically.
    categoryIds: string[];
    description: string;
    basePrice: string;
    originalPrice: string;
    vendorId: string;
    taxPercent: string;
    unit: string;
    minOrderQty: string;
    creditEligible: boolean;
    imageUrl: string;
    priceSlabs: SlabRow[];
    // Aligned with the vendor product form. Backend API already accepts these.
    packSize: string;
    tags: string[];
    images: string[]; // additional images, NOT including imageUrl
    fssaiRef: string;
    aliasNames: string[];
    vegNonVeg: '' | 'veg' | 'nonveg' | 'egg';
    storageType: string;
    shelfLifeDays: string;
    countryOfOrigin: string;
    substituteIds: string[];
    isFeatured: boolean;
    // Zoho Metadata
    account: string;
    accountCode: string;
    taxable: boolean;
    exemptionReason: string;
    taxabilityType: string;
    productType: string;
    intraStateTaxName: string;
    intraStateTaxRate: string;
    intraStateTaxType: string;
    interStateTaxName: string;
    interStateTaxRate: string;
    interStateTaxType: string;
    source: string;
    referenceId: string;
    lastSync: string;
    inventoryAccount: string;
    inventoryAccountCode: string;
    valuationMethod: string;
    reorderPoint: string;
    openingStock: string;
    itemType: string;
    sellable: boolean;
    purchasable: boolean;
    trackInventory: boolean;
    packageWeight: string;
    packageLength: string;
    packageWidth: string;
    packageHeight: string;
    dimensionUnit: string;
    weightUnit: string;
    ean: string;
    isbn: string;
    variantMapping: string;
    platformCommission: string;
    itemStatus: string;
    activeOnlineStore: boolean;
}

// Same enum-like constants used by vendor form. GST slabs are government-fixed,
// units are universal SI/business units — these are not "mock data".
const UNIT_OPTIONS = ['kg', 'g', 'ml', 'L', 'piece', 'pack', 'box', 'dozen', 'case', 'bag', 'bottle', 'can', 'carton', 'tray'];
const TAX_OPTIONS = ['0', '5', '12', '18', '28'];

function getPageRange(current: number, total: number): (number | 'gap')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | 'gap')[] = [1];
    if (current > 3) pages.push('gap');
    const lo = Math.max(2, current - 1);
    const hi = Math.min(total - 1, current + 1);
    for (let i = lo; i <= hi; i++) pages.push(i);
    if (current < total - 2) pages.push('gap');
    pages.push(total);
    return pages;
}

const EMPTY_FORM: ProductFormData = {
    name: '',
    sku: '',
    hsn: '',
    barcode: '',
    brand: '',
    categoryIds: [],
    description: '',
    basePrice: '',
    originalPrice: '',
    vendorId: '',
    taxPercent: '0',
    unit: 'piece',
    minOrderQty: '1',
    creditEligible: false,
    imageUrl: '',
    priceSlabs: [],
    packSize: '',
    tags: [],
    images: [],
    fssaiRef: '',
    aliasNames: [],
    vegNonVeg: '',
    storageType: '',
    shelfLifeDays: '',
    countryOfOrigin: '',
    substituteIds: [],
    isFeatured: false,
    account: '',
    accountCode: '',
    taxable: true,
    exemptionReason: '',
    taxabilityType: 'taxable',
    productType: 'goods',
    intraStateTaxName: '',
    intraStateTaxRate: '',
    intraStateTaxType: '',
    interStateTaxName: '',
    interStateTaxRate: '',
    interStateTaxType: '',
    source: '',
    referenceId: '',
    lastSync: '',
    inventoryAccount: '',
    inventoryAccountCode: '',
    valuationMethod: 'FIFO',
    reorderPoint: '',
    openingStock: '',
    itemType: 'standard',
    sellable: true,
    purchasable: true,
    trackInventory: true,
    packageWeight: '',
    packageLength: '',
    packageWidth: '',
    packageHeight: '',
    dimensionUnit: 'cm',
    weightUnit: 'kg',
    ean: '',
    isbn: '',
    variantMapping: '',
    platformCommission: '',
    itemStatus: 'Active',
    activeOnlineStore: true,
};

// ---------------------------------------------------------------------------
// Reusable small components (mirrors vendor product form for consistent UX)
// ---------------------------------------------------------------------------

const inputCls = productFormInputCls;
const selectCls = productFormSelectCls;
const textareaCls = productFormTextareaCls;
const cellInput = 'bg-transparent border border-transparent hover:border-[#D1D5DB] focus:border-[#299E60] focus:bg-white focus:ring-1 focus:ring-[#299E60]/20 px-1.5 py-1 rounded-[4px] outline-none w-full text-[12.5px] tabular-nums transition-colors';

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
    const [input, setInput] = useState('');

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
            e.preventDefault();
            const newTags = input
                .split(',')
                .map(t => t.trim())
                .filter(t => t && !tags.includes(t));
            if (newTags.length) onChange([...tags, ...newTags]);
            setInput('');
        }
    };

    const removeTag = (tag: string) => {
        onChange(tags.filter(t => t !== tag));
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 mb-2">
                {tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#EEF8F1] text-[#299E60] text-[12px] font-bold rounded-[8px]">
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} className="hover:text-[#E74C3C] transition-colors">
                            <X size={12} />
                        </button>
                    </span>
                ))}
            </div>
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className={inputCls}
                placeholder="Type tags separated by commas, press Enter"
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Substitute Product Picker                                          */
/* ------------------------------------------------------------------ */

function SubstituteProductPicker({
    selectedIds,
    currentProductId,
    products,
    onChange,
}: {
    selectedIds: string[];
    currentProductId?: string;
    products: Product[];
    onChange: (ids: string[]) => void;
}) {
    const [query, setQuery] = useState('');

    const candidates = products.filter(p =>
        p.id !== currentProductId &&
        !selectedIds.includes(p.id) &&
        (query.length === 0 || p.name.toLowerCase().includes(query.toLowerCase()))
    ).slice(0, 6);

    const selected = products.filter(p => selectedIds.includes(p.id));

    const add = (id: string) => { onChange([...selectedIds, id]); setQuery(''); };
    const remove = (id: string) => onChange(selectedIds.filter(s => s !== id));

    return (
        <div className="space-y-2">
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {selected.map(p => (
                        <span key={p.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-[12px] font-bold rounded-[8px]">
                            {p.name}
                            <button type="button" onClick={() => remove(p.id)} className="hover:text-[#E74C3C]"><X size={12} /></button>
                        </span>
                    ))}
                </div>
            )}
            <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search products to add as substitutes..."
                className={inputCls}
            />
            {query.length > 0 && candidates.length > 0 && (
                <div className="border border-[#EEEEEE] rounded-[10px] overflow-hidden bg-white">
                    {candidates.map(p => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => add(p.id)}
                            className="w-full text-left px-4 py-2 text-[13px] font-medium hover:bg-[#EEF8F1] transition-colors border-b border-[#EEEEEE] last:border-0"
                        >
                            {p.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProductsPage() {
    const perms = useAdminPermissions();
    const searchParams = useSearchParams();
    const editIdParam = searchParams.get('editId');
    const autoOpenedRef = useRef(false);
    const [pageSize, setPageSize] = useState(20);
    // Data state
    const [products, setProducts] = useState<Product[]>([]);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [brands, setBrands] = useState<BrandOption[]>([]);
    const [brandSuggesting, setBrandSuggesting] = useState(false);

    // Loading state
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [loadingProduct, setLoadingProduct] = useState(false);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalProductsCount, setTotalProductsCount] = useState(0);

    // Unsaved edits / Original reference
    const originalProductsRef = useRef<Product[]>([]);
    const [savingRows, setSavingRows] = useState<Record<string, Record<string, boolean>>>({});

    // Filters
    const [searchInput, setSearchInput] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    // Vendor filter UI was dropped in the spreadsheet redesign; state kept for the query builder.
    const [filterVendor] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterDrafts, setFilterDrafts] = useState(false);
    const [draftCount, setDraftCount] = useState(0);

    // Draft autosave
    const [draftSaving, setDraftSaving] = useState(false);
    const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
    const draftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const creatingDraftRef = useRef(false);
    const performDraftSaveRef = useRef<(opts?: { silent?: boolean }) => Promise<boolean>>(async () => false);
    const savedFormSnapshotRef = useRef<string>('');
    const prevLoadingProductRef = useRef(false);
    const [panelOpen, setPanelOpen] = useState(false);
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState<ProductFormData>(EMPTY_FORM);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});

    // Import modal
    const [importOpen, setImportOpen] = useState(false);
    const [gridOpen, setGridOpen] = useState(false);
    const [gridVendorId, setGridVendorId] = useState('');
    const [gridListings, setGridListings] = useState<Product[]>([]);
    const [gridLoading, setGridLoading] = useState(false);

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);

    // Bulk Update Engine — row selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkOpen, setBulkOpen] = useState(false);
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const toggleSelectAll = (ids: string[], allSelected: boolean) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) ids.forEach(id => next.delete(id));
            else ids.forEach(id => next.add(id));
            return next;
        });
    };

    const gridProducts = useMemo(() => gridListings.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.vendorSku || p.sku,
        categoryName: p.category?.name ?? '',
        basePrice: Number(p.basePrice) || 0,
        originalPrice: p.originalPrice ?? undefined,
        taxPercent: Number(p.taxPercent) || 0,
        minOrderQty: p.minOrderQty ?? 1,
        isActive: p.isActive,
        creditEligible: p.creditEligible,
        hsn: p.hsn,
        brand: p.brand,
        unit: p.unit,
        packSize: p.packSize,
        description: p.description,
        imageUrl: p.imageUrl,
        vegNonVeg: p.vegNonVeg as 'veg' | 'nonveg' | 'egg' | null | undefined,
        storageType: p.storageType,
        countryOfOrigin: p.countryOfOrigin,
        barcode: p.barcode,
        aliasNames: p.aliasNames,
        metadata: p.metadata,
        inventory: p.inventory,
        priceSlabs: p.priceSlabs,
        vendor: p.vendor,
    })), [gridListings]);

    const buildGridListingsUrl = useCallback(() => {
        const params = new URLSearchParams();
        params.set('gridListings', 'true');
        params.set('limit', '500');
        if (gridVendorId) params.set('vendorId', gridVendorId);
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (filterCategory) params.set('categoryId', filterCategory);
        if (filterStatus) params.set('approvalStatus', filterStatus);
        return `/api/v1/admin/products?${params.toString()}`;
    }, [gridVendorId, debouncedSearch, filterCategory, filterStatus]);

    const openBulkGrid = useCallback(async () => {
        setGridLoading(true);
        try {
            const res = await fetch(buildGridListingsUrl());
            const json = await res.json();
            if (!json.success) {
                toast.error('Failed to load products for spreadsheet');
                return;
            }
            const listings = (json.data?.products ?? []) as Product[];
            const total = json.data?.pagination?.total ?? listings.length;
            if (total > 500) {
                toast.info('Showing first 500 products — narrow with filters if needed');
            }
            setGridListings(listings);
            setGridOpen(true);
        } catch {
            toast.error('Failed to load products for spreadsheet');
        } finally {
            setGridLoading(false);
        }
    }, [buildGridListingsUrl]);

    const refreshGridListings = useCallback(async () => {
        const res = await fetch(buildGridListingsUrl());
        const json = await res.json();
        if (json.success) setGridListings(json.data?.products ?? []);
    }, [buildGridListingsUrl]);

    // -----------------------------------------------------------------------
    // Debounced search
    // -----------------------------------------------------------------------

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchInput), 400);
        return () => clearTimeout(timer);
    }, [searchInput]);

    // -----------------------------------------------------------------------
    // Close export dropdown on outside click — removed (export in BulkProductToolbar)
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // Fetch vendors & categories (once)
    // -----------------------------------------------------------------------

    useEffect(() => {
        fetch('/api/v1/admin/vendors')
            .then(res => res.json())
            .then(json => {
                if (json.success) {
                    const v = json.data?.vendors ?? json.data ?? [];
                    setVendors(Array.isArray(v) ? v : []);
                }
            })
            .catch(console.error);

        fetch('/api/v1/admin/categories')
            .then(res => res.json())
            .then(json => {
                if (json.success) {
                    const c = json.data?.categories ?? json.data ?? [];
                    setCategories(Array.isArray(c) ? c : []);
                }
            })
            .catch(console.error);

        fetch('/api/v1/brands?limit=100')
            .then(res => res.json())
            .then(json => {
                if (json.success) {
                    const b = json.data?.brands ?? json.data ?? [];
                    setBrands(Array.isArray(b) ? b.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })) : []);
                }
            })
            .catch(console.error);
    }, []);

    // -----------------------------------------------------------------------
    // Fetch products
    // -----------------------------------------------------------------------

    const fetchDraftCount = useCallback(async () => {
        try {
            const res = await fetch('/api/v1/admin/products?listingStatus=draft&limit=1&page=1');
            const json = await res.json();
            if (json.success) {
                setDraftCount(json.data?.pagination?.total ?? json.data?.products?.length ?? 0);
            }
        } catch {
            /* ignore */
        }
    }, []);

    useEffect(() => {
        void fetchDraftCount();
    }, [fetchDraftCount, panelOpen]);

    const fetchProducts = useCallback(
        async (targetPage = 1, currentLimit = pageSize) => {
            setLoading(true);

            try {
                if (filterDrafts) {
                    const params = new URLSearchParams();
                    params.set('listingStatus', 'draft');
                    params.set('limit', String(currentLimit));
                    params.set('page', String(targetPage));
                    if (debouncedSearch) params.set('search', debouncedSearch);
                    if (filterCategory) params.set('categoryId', filterCategory);

                    const res = await fetch(`/api/v1/admin/products?${params.toString()}`);
                    const json = await res.json();

                    if (json.success) {
                        const rows = (json.data?.products ?? []) as Array<Record<string, unknown>>;
                        const incoming: Product[] = rows.map((p) => ({
                            id: String(p.id),
                            name: String(p.name ?? 'Untitled product'),
                            slug: String(p.slug ?? ''),
                            sku: (p.sku as string | null) ?? null,
                            hsn: (p.hsn as string | null) ?? null,
                            brand: (p.brand as string | null) ?? null,
                            basePrice: Number(p.basePrice) || 0,
                            originalPrice: p.originalPrice != null ? Number(p.originalPrice) : null,
                            imageUrl: (p.imageUrl as string | null) ?? null,
                            taxPercent: Number(p.taxPercent) || 0,
                            minOrderQty: Number(p.minOrderQty) || 1,
                            creditEligible: !!p.creditEligible,
                            description: (p.description as string | null) ?? null,
                            isActive: !!p.isActive,
                            listingStatus: (p.listingStatus as 'draft' | 'submitted') ?? 'draft',
                            approvalStatus: (p.approvalStatus as Product['approvalStatus']) ?? 'approved',
                            approvalNote: null,
                            createdAt: String(p.createdAt ?? ''),
                            vendor: p.vendor as Product['vendor'],
                            category: p.category as Product['category'],
                            inventory: p.inventory as Product['inventory'],
                            metadata: p.metadata as Record<string, unknown> | undefined,
                            isMasterRow: false,
                        }));
                        setProducts(incoming);
                        originalProductsRef.current = JSON.parse(JSON.stringify(incoming));
                        const pagination = json.data?.pagination;
                        if (pagination) {
                            setCurrentPage(pagination.page);
                            setTotalPages(pagination.totalPages);
                            setTotalProductsCount(pagination.total);
                            setDraftCount(pagination.total);
                        }
                    }
                    return;
                }

                const params = new URLSearchParams();
                params.set('limit', String(currentLimit));
                params.set('page', String(targetPage));
                if (debouncedSearch) params.set('search', debouncedSearch);
                if (filterStatus) params.set('approvalStatus', filterStatus);
                if (filterCategory) params.set('categoryId', filterCategory);

                const res = await fetch(`/api/v1/admin/master-products?${params.toString()}`);
                const json = await res.json();

                if (json.success) {
                    const masters = json.data?.masterProducts ?? [];
                    const incoming: Product[] = masters.map((m: {
                        id: string;
                        name: string;
                        sku: string;
                        brand: string | null;
                        imageUrl: string | null;
                        approvalStatus: 'pending' | 'approved' | 'rejected';
                        isActive: boolean;
                        createdAt: string;
                        taxPercent: number | string;
                        uom: string | null;
                        category: { id: string; name: string } | null;
                        vendorCount: number;
                        vendor?: { id: string; businessName: string; vendorCode?: string | null } | null;
                        hsn?: string | null;
                        metadata?: any;
                    }) => ({
                        id: m.id,
                        name: m.name,
                        slug: m.sku,
                        sku: m.sku,
                        brand: m.brand,
                        basePrice: 0,
                        originalPrice: null,
                        imageUrl: m.imageUrl,
                        hsn: m.hsn ?? null,
                        taxPercent: Number(m.taxPercent) || 0,
                        minOrderQty: 1,
                        creditEligible: false,
                        description: null,
                        isActive: m.isActive,
                        approvalStatus: m.approvalStatus,
                        approvalNote: null,
                        createdAt: m.createdAt,
                        vendor: m.vendor ?? null,
                        category: m.category,
                        inventory: null,
                        vendorCount: m.vendorCount,
                        unit: m.uom,
                        metadata: m.metadata ?? {},
                        isMasterRow: true,
                    }));
                    setProducts(incoming);
                    originalProductsRef.current = JSON.parse(JSON.stringify(incoming));
                    
                    const pagination = json.data?.pagination;
                    if (pagination) {
                        setCurrentPage(pagination.page);
                        setTotalPages(pagination.totalPages);
                        setTotalProductsCount(pagination.total);
                    } else {
                        setCurrentPage(targetPage);
                        setTotalPages(1);
                        setTotalProductsCount(incoming.length);
                    }
                    if (json.data?.stats) setStats(json.data.stats);
                }
            } catch (err) {
                console.error('Failed to fetch products:', err);
            } finally {
                setLoading(false);
            }
        },
        [debouncedSearch, filterStatus, filterVendor, filterCategory, filterDrafts, pageSize],
    );

    // Refetch on filter change (reset to page 1)
    useEffect(() => {
        fetchProducts(1);
    }, [debouncedSearch, filterStatus, filterVendor, filterCategory, filterDrafts, fetchProducts]);

    // -----------------------------------------------------------------------
    // Inline Cell Editing Handlers
    // -----------------------------------------------------------------------

    const handleCellChange = (productId: string, field: string, value: unknown) => {
        setProducts(prev => prev.map(p => {
            if (p.id !== productId) return p;
            if (field === 'category') {
                return { ...p, category: value } as Product;
            }
            return { ...p, [field]: value } as Product;
        }));
    };

    const handleInlineEdit = async (productId: string, field: string, value: unknown, originalValue: unknown) => {
        if (value === originalValue) return;

        if (field === 'name' && (!value || !String(value).trim())) {
            toast.error('Product name cannot be empty');
            handleCellChange(productId, 'name', originalValue);
            return;
        }
        if (field === 'basePrice' && (isNaN(Number(value)) || Number(value) <= 0)) {
            toast.error('Please enter a valid base price');
            handleCellChange(productId, 'basePrice', originalValue);
            return;
        }

        setSavingRows(prev => ({
            ...prev,
            [productId]: { ...(prev[productId] || {}), [field]: true }
        }));

        try {
            const row = products.find(p => p.id === productId);
            const isMaster = row?.isMasterRow;
            const baseUrl = isMaster
                ? `/api/v1/admin/master-products/${productId}`
                : `/api/v1/admin/products/${productId}`;
            let url = baseUrl;
            const method = 'PATCH';
            let bodyPayload: Record<string, unknown> = {};

            if (field === 'approvalStatus') {
                url = isMaster
                    ? `/api/v1/admin/master-products/${productId}/approval`
                    : `/api/v1/admin/products/${productId}/approval`;
                bodyPayload = {
                    action: value === 'approved' ? 'approve' : 'reject',
                    note: value === 'rejected' ? 'Rejected from list view' : undefined,
                };
            } else if (field === 'primaryCategoryId') {
                bodyPayload = isMaster
                    ? { categoryId: value }
                    : { primaryCategoryId: value, categoryIds: value ? [value] : [] };
            } else {
                bodyPayload = { [field]: value };
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload),
            });
            const json = await res.json();

            if (json.success) {
                toast.success('Product updated');
                const updatedProduct = json.data;
                setProducts(prev => prev.map(p => p.id === productId ? { ...p, ...updatedProduct } : p));
                originalProductsRef.current = originalProductsRef.current.map(p => 
                    p.id === productId ? { ...p, ...updatedProduct } : p
                );
            } else {
                toast.error(json.message || 'Failed to update product');
                if (field === 'primaryCategoryId') {
                    const origCat = originalProductsRef.current.find(p => p.id === productId)?.category;
                    handleCellChange(productId, 'category', origCat);
                } else {
                    handleCellChange(productId, field, originalValue);
                }
            }
        } catch (err) {
            console.error('Failed to update inline product:', err);
            toast.error('Network error. Failed to save product.');
            if (field === 'primaryCategoryId') {
                const origCat = originalProductsRef.current.find(p => p.id === productId)?.category;
                handleCellChange(productId, 'category', origCat);
            } else {
                handleCellChange(productId, field, originalValue);
            }
        } finally {
            setSavingRows(prev => {
                const next = { ...prev };
                if (next[productId]) {
                    delete next[productId][field];
                    if (Object.keys(next[productId]).length === 0) delete next[productId];
                }
                return next;
            });
        }
    };

    // -----------------------------------------------------------------------
    // Stats (from API — counts ALL products, not just loaded page)
    // -----------------------------------------------------------------------

    const [stats, setStats] = useState({ total: 0, approved: 0, pending: 0, rejected: 0 });

    const statCards = [
        { label: 'Total Products', value: stats.total, icon: Package, color: '#3B82F6', bgColor: '#EFF6FF' },
        { label: 'Approved', value: stats.approved, icon: CheckCircle, color: '#299E60', bgColor: '#EEF8F1' },
        { label: 'Pending', value: stats.pending, icon: Clock, color: '#F59E0B', bgColor: '#FFF7E6' },
        { label: 'Rejected', value: stats.rejected, icon: XCircle, color: '#E74C3C', bgColor: '#FFF0F0' },
    ];

    // -----------------------------------------------------------------------
    // CRUD: Toggle active
    // -----------------------------------------------------------------------

    const toggleActive = async (product: Product) => {
        setActionLoading(product.id);
        try {
            const url = product.isMasterRow
                ? `/api/v1/admin/master-products/${product.id}`
                : `/api/v1/admin/products/${product.id}`;
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !product.isActive }),
            });
            const json = await res.json();
            if (json.success || res.ok) {
                setProducts(prev =>
                    prev.map(p => (p.id === product.id ? { ...p, isActive: !p.isActive } : p)),
                );
            }
        } catch (err) {
            console.error('Failed to toggle product:', err);
        } finally {
            setActionLoading(null);
        }
    };

    // -----------------------------------------------------------------------
    // CRUD: Delete
    // -----------------------------------------------------------------------

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const url = deleteTarget.isMasterRow
                ? `/api/v1/admin/master-products/${deleteTarget.id}`
                : `/api/v1/admin/products/${deleteTarget.id}`;
            const res = await fetch(url, { method: 'DELETE' });
            const json = await res.json();
            if (json.success || res.ok) {
                setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
                toast.success('Product deleted successfully');
            } else {
                throw new Error(json.error?.message || json.error || json.message || 'Delete failed');
            }
        } catch (err) {
            console.error('Failed to delete product:', err);
            toast.error(err instanceof Error ? err.message : 'Delete failed');
        } finally {
            setDeleting(false);
            setDeleteTarget(null);
        }
    };

    const handleBulkDelete = async () => {
        setBulkDeleting(true);
        try {
            const idsArray = Array.from(selectedIds);
            const deletePromises = idsArray.map(async (id) => {
                const product = products.find(p => p.id === id);
                const url = product?.isMasterRow
                    ? `/api/v1/admin/master-products/${id}`
                    : `/api/v1/admin/products/${id}`;
                const res = await fetch(url, { method: 'DELETE' });
                const json = await res.json();
                if (!res.ok) {
                    throw new Error(json.error?.message || json.error || json.message || 'Failed to delete');
                }
                return id;
            });

            const results = await Promise.allSettled(deletePromises);
            
            const succeededIds: string[] = [];
            const failedMessages: string[] = [];
            
            results.forEach((result, index) => {
                const id = idsArray[index];
                const product = products.find(p => p.id === id);
                const name = product?.name || id;
                if (result.status === 'fulfilled') {
                    succeededIds.push(id);
                } else {
                    const errorMsg = result.reason?.message || 'Unknown error';
                    failedMessages.push(`"${name}": ${errorMsg}`);
                }
            });

            if (succeededIds.length > 0) {
                setProducts(prev => prev.filter(p => !succeededIds.includes(p.id)));
                setSelectedIds(prev => {
                    const next = new Set(prev);
                    succeededIds.forEach(id => next.delete(id));
                    return next;
                });
                toast.success(`Successfully deleted ${succeededIds.length} product(s)`);
            }

            if (failedMessages.length > 0) {
                toast.error(`Failed to delete ${failedMessages.length} product(s). ${failedMessages[0]}`);
                console.error('Bulk delete failures:', failedMessages);
            } else {
                setShowBulkDeleteModal(false);
            }
        } catch (err) {
            console.error('Bulk delete failed:', err);
            toast.error(err instanceof Error ? err.message : 'Bulk delete failed');
        } finally {
            setBulkDeleting(false);
        }
    };

    // -----------------------------------------------------------------------
    // Panel: open / close
    // -----------------------------------------------------------------------

    const openCreate = () => {
        setEditingProduct(null);
        setFormData(EMPTY_FORM);
        setFormErrors({});
        setDraftSaveError(null);
        setShowCloseConfirm(false);
        savedFormSnapshotRef.current = JSON.stringify(EMPTY_FORM);
        setPanelOpen(true);
        void (async () => {
            if (creatingDraftRef.current) return;
            creatingDraftRef.current = true;
            try {
                await performDraftSaveRef.current({ silent: true });
            } finally {
                creatingDraftRef.current = false;
            }
        })();
    };

    // Auto-open edit panel
    useEffect(() => {
        if (!editIdParam || autoOpenedRef.current || loading) return;
        const target = products.find(p => p.id === editIdParam);
        if (target) {
            autoOpenedRef.current = true;
            openEdit(target);
        }
    }, [editIdParam, loading, products]);

    const openEdit = async (product: Product) => {
        setEditingProduct(product);
        setPanelOpen(true);
        setLoadingProduct(true);
        setFormErrors({});
        setDraftSaveError(null);

        try {
            const isMaster = product.isMasterRow;
            const res = await fetch(
                isMaster ? `/api/v1/admin/master-products/${product.id}` : `/api/v1/admin/products/${product.id}`,
                { method: 'GET' },
            );
            const json = await res.json();
            const p = json.success ? json.data : product;

            const meta = (p.metadata && typeof p.metadata === 'object' ? p.metadata : {}) as Record<string, any>;
            const acc = meta.accounting || {};
            const inv = meta.inventory || {};
            const pkg = meta.packaging || {};
            const ids = meta.identifiers || {};
            const att = meta.attributes || {};

            if (isMaster) {
                setFormData({
                    ...EMPTY_FORM,
                    name: p.name || '',
                    sku: p.sku ?? '',
                    brand: p.brand ?? '',
                    categoryIds: p.category?.id ? [p.category.id] : [],
                    description: '',
                    imageUrl: p.imageUrl ?? '',
                    unit: p.uom ?? 'piece',
                    images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
                    account: acc.account || '',
                    accountCode: acc.accountCode || '',
                    taxable: acc.taxable ?? true,
                    exemptionReason: acc.exemptionReason || '',
                    taxabilityType: acc.taxabilityType || 'taxable',
                    productType: att.productType || 'goods',
                    intraStateTaxName: acc.intraStateTaxName || '',
                    intraStateTaxRate: acc.intraStateTaxRate != null ? String(acc.intraStateTaxRate) : '',
                    intraStateTaxType: acc.intraStateTaxType || '',
                    interStateTaxName: acc.interStateTaxName || '',
                    interStateTaxRate: acc.interStateTaxRate != null ? String(acc.interStateTaxRate) : '',
                    interStateTaxType: acc.interStateTaxType || '',
                    source: att.source || '',
                    referenceId: att.referenceId || '',
                    lastSync: att.lastSync || '',
                    inventoryAccount: acc.inventoryAccount || '',
                    inventoryAccountCode: acc.inventoryAccountCode || '',
                    valuationMethod: inv.valuationMethod || 'FIFO',
                    reorderPoint: inv.reorderPoint != null ? String(inv.reorderPoint) : '',
                    openingStock: inv.openingStock != null ? String(inv.openingStock) : '',
                    itemType: att.itemType || 'standard',
                    sellable: att.sellable ?? true,
                    purchasable: att.purchasable ?? true,
                    trackInventory: inv.trackInventory ?? true,
                    packageWeight: pkg.packageWeight != null ? String(pkg.packageWeight) : '',
                    packageLength: pkg.packageLength != null ? String(pkg.packageLength) : '',
                    packageWidth: pkg.packageWidth != null ? String(pkg.packageWidth) : '',
                    packageHeight: pkg.packageHeight != null ? String(pkg.packageHeight) : '',
                    dimensionUnit: pkg.dimensionUnit || 'cm',
                    weightUnit: pkg.weightUnit || 'kg',
                    ean: ids.ean || '',
                    isbn: ids.isbn || '',
                    variantMapping: att.variantMapping || '',
                    platformCommission: acc.platformCommission != null ? String(acc.platformCommission) : '',
                    itemStatus: att.itemStatus || 'Active',
                    activeOnlineStore: att.activeOnlineStore ?? true,
                });
                return;
            }

            const primaryId = p.category?.id ?? '';
            const linkIds = Array.isArray(p.categoryLinks)
                ? (p.categoryLinks as Array<{ categoryId: string }>).map(l => l.categoryId)
                : [];
            const uniqueIds = primaryId
                ? [primaryId, ...linkIds.filter(id => id !== primaryId)]
                : linkIds;

            setFormData({
                name: p.name || '',
                sku: p.sku ?? '',
                hsn: p.hsn ?? '',
                barcode: p.barcode ?? '',
                brand: p.brand ?? '',
                categoryIds: uniqueIds,
                description: p.description ?? '',
                basePrice: p.basePrice != null ? String(p.basePrice) : '',
                originalPrice: p.originalPrice != null ? String(p.originalPrice) : '',
                vendorId: p.vendor?.id ?? '',
                taxPercent: p.taxPercent != null ? String(p.taxPercent) : '0',
                unit: p.unit ?? 'piece',
                minOrderQty: p.minOrderQty != null ? String(p.minOrderQty) : '1',
                creditEligible: !!p.creditEligible,
                imageUrl: p.imageUrl ?? '',
                packSize: p.packSize ?? '',
                tags: Array.isArray(p.tags) ? p.tags : [],
                images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
                fssaiRef: p.fssaiRef || '',
                aliasNames: Array.isArray(p.aliasNames) ? p.aliasNames : [],
                vegNonVeg: (p.vegNonVeg as '' | 'veg' | 'nonveg' | 'egg') || '',
                storageType: p.storageType || '',
                shelfLifeDays: p.shelfLifeDays != null ? String(p.shelfLifeDays) : '',
                countryOfOrigin: p.countryOfOrigin || '',
                substituteIds: Array.isArray(p.substituteIds) ? p.substituteIds : [],
                isFeatured: !!p.isFeatured,
                priceSlabs: Array.isArray(p.priceSlabs)
                    ? p.priceSlabs.map((s: { minQty: number; price: number }) => ({
                        minQty: String(s.minQty),
                        price: String(s.price),
                    }))
                    : [],
                account: acc.account || '',
                accountCode: acc.accountCode || '',
                taxable: acc.taxable ?? true,
                exemptionReason: acc.exemptionReason || '',
                taxabilityType: acc.taxabilityType || 'taxable',
                productType: att.productType || 'goods',
                intraStateTaxName: acc.intraStateTaxName || '',
                intraStateTaxRate: acc.intraStateTaxRate != null ? String(acc.intraStateTaxRate) : '',
                intraStateTaxType: acc.intraStateTaxType || '',
                interStateTaxName: acc.interStateTaxName || '',
                interStateTaxRate: acc.interStateTaxRate != null ? String(acc.interStateTaxRate) : '',
                interStateTaxType: acc.interStateTaxType || '',
                source: att.source || '',
                referenceId: att.referenceId || '',
                lastSync: att.lastSync || '',
                inventoryAccount: acc.inventoryAccount || '',
                inventoryAccountCode: acc.inventoryAccountCode || '',
                valuationMethod: inv.valuationMethod || 'FIFO',
                reorderPoint: inv.reorderPoint != null ? String(inv.reorderPoint) : '',
                openingStock: inv.openingStock != null ? String(inv.openingStock) : '',
                itemType: att.itemType || 'standard',
                sellable: att.sellable ?? true,
                purchasable: att.purchasable ?? true,
                trackInventory: inv.trackInventory ?? true,
                packageWeight: pkg.packageWeight != null ? String(pkg.packageWeight) : '',
                packageLength: pkg.packageLength != null ? String(pkg.packageLength) : '',
                packageWidth: pkg.packageWidth != null ? String(pkg.packageWidth) : '',
                packageHeight: pkg.packageHeight != null ? String(pkg.packageHeight) : '',
                dimensionUnit: pkg.dimensionUnit || 'cm',
                weightUnit: pkg.weightUnit || 'kg',
                ean: ids.ean || '',
                isbn: ids.isbn || '',
                variantMapping: att.variantMapping || '',
                platformCommission: acc.platformCommission != null ? String(acc.platformCommission) : '',
                itemStatus: att.itemStatus || 'Active',
                activeOnlineStore: att.activeOnlineStore ?? true,
            });
            setEditingProduct(prev => prev ? {
                ...prev,
                listingStatus: (p.listingStatus as 'draft' | 'submitted') ?? prev.listingStatus,
            } : prev);
        } catch (err) {
            console.error('Failed to fetch product details:', err);
            const primaryId = product.category?.id ?? '';
            const linkIds = (product.categoryLinks ?? []).map(l => l.categoryId);
            const uniqueIds = primaryId
                ? [primaryId, ...linkIds.filter(id => id !== primaryId)]
                : linkIds;
            setFormData({
                ...EMPTY_FORM,
                name: product.name,
                sku: product.sku ?? '',
                hsn: product.hsn ?? '',
                barcode: product.barcode ?? '',
                brand: product.brand ?? '',
                categoryIds: uniqueIds,
                description: product.description ?? '',
                basePrice: String(product.basePrice),
                originalPrice: product.originalPrice != null ? String(product.originalPrice) : '',
                vendorId: product.vendor?.id ?? '',
                taxPercent: String(product.taxPercent),
                unit: product.unit ?? 'piece',
                minOrderQty: String(product.minOrderQty),
                creditEligible: product.creditEligible,
                imageUrl: product.imageUrl ?? '',
                packSize: product.packSize ?? '',
                tags: Array.isArray(product.tags) ? product.tags : [],
                images: Array.isArray(product.images) ? product.images.filter(Boolean) : [],
            });
        } finally {
            setLoadingProduct(false);
        }
    };

    const closePanelImmediate = () => {
        if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
        setPanelOpen(false);
        setShowCloseConfirm(false);
        setTimeout(() => {
            setEditingProduct(null);
            setFormData(EMPTY_FORM);
            setFormErrors({});
        }, 300);
    };

    // -----------------------------------------------------------------------
    // Panel: Save
    // -----------------------------------------------------------------------

    const validateForm = (): boolean => {
        const isMasterCreate = !editingProduct && !formData.vendorId;
        const errors = validateProductEssentials(formData, {
            portal: 'admin',
            validateMasterSkuFormat: isMasterCreate,
            requireBasePriceForVendorListing: !!formData.vendorId,
        });
        setFormErrors(errors);
        if (Object.keys(errors).length > 0) focusFirstProductFormError(errors);
        return Object.keys(errors).length === 0;
    };

    const buildFormMetadata = () => ({
        accounting: {
            account: formData.account.trim(),
            accountCode: formData.accountCode.trim(),
            taxable: formData.taxable,
            exemptionReason: formData.exemptionReason.trim(),
            taxabilityType: formData.taxabilityType.trim(),
            intraStateTaxName: formData.intraStateTaxName.trim(),
            intraStateTaxRate: formData.intraStateTaxRate ? Number(formData.intraStateTaxRate) : undefined,
            intraStateTaxType: formData.intraStateTaxType.trim(),
            interStateTaxName: formData.interStateTaxName.trim(),
            interStateTaxRate: formData.interStateTaxRate ? Number(formData.interStateTaxRate) : undefined,
            interStateTaxType: formData.interStateTaxType.trim(),
            inventoryAccount: formData.inventoryAccount.trim(),
            inventoryAccountCode: formData.inventoryAccountCode.trim(),
            platformCommission: formData.platformCommission ? Number(formData.platformCommission) : undefined,
        },
        inventory: {
            reorderPoint: formData.reorderPoint ? Number(formData.reorderPoint) : undefined,
            openingStock: formData.openingStock ? Number(formData.openingStock) : undefined,
            valuationMethod: formData.valuationMethod.trim(),
            trackInventory: formData.trackInventory,
        },
        packaging: {
            packageWeight: formData.packageWeight ? Number(formData.packageWeight) : undefined,
            packageLength: formData.packageLength ? Number(formData.packageLength) : undefined,
            packageWidth: formData.packageWidth ? Number(formData.packageWidth) : undefined,
            packageHeight: formData.packageHeight ? Number(formData.packageHeight) : undefined,
            dimensionUnit: formData.dimensionUnit.trim(),
            weightUnit: formData.weightUnit.trim(),
        },
        identifiers: {
            ean: formData.ean.trim(),
            isbn: formData.isbn.trim(),
        },
        attributes: {
            itemType: formData.itemType.trim(),
            productType: formData.productType.trim(),
            source: formData.source.trim(),
            referenceId: formData.referenceId.trim(),
            lastSync: formData.lastSync.trim(),
            sellable: formData.sellable,
            purchasable: formData.purchasable,
            variantMapping: formData.variantMapping.trim(),
            itemStatus: formData.itemStatus.trim(),
            activeOnlineStore: formData.activeOnlineStore,
        },
    });

    const buildProductPayload = (opts: { isDraft: boolean }): Record<string, unknown> => {
        const metadata = buildFormMetadata();
        const parsedBase = parseFloat(formData.basePrice);
        const payload: Record<string, unknown> = {
            name: formData.name.trim() || 'Untitled product',
            listingStatus: opts.isDraft ? 'draft' : 'submitted',
            isActive: !opts.isDraft,
            taxPercent: Number(formData.taxPercent) || 0,
            minOrderQty: Number(formData.minOrderQty) || 1,
            creditEligible: formData.creditEligible,
            metadata,
        };
        if (opts.isDraft) {
            payload.basePrice = !isNaN(parsedBase) && parsedBase > 0 ? parsedBase : 0.01;
        } else {
            payload.basePrice = parsedBase;
        }
        if (formData.vendorId) payload.vendorId = formData.vendorId;
        if (formData.imageUrl) payload.imageUrl = formData.imageUrl;
        if (formData.sku.trim()) payload.sku = formData.sku.trim();
        if (formData.hsn.trim()) payload.hsn = formData.hsn.trim();
        if (formData.barcode.trim()) payload.barcode = formData.barcode.trim();
        if (formData.brand.trim()) payload.brand = formData.brand.trim();
        if (formData.unit) payload.unit = formData.unit;
        const slabs = formData.priceSlabs
            .filter(s => s.minQty && s.price)
            .map(s => ({
                minQty: Number(s.minQty),
                price: Number(s.price),
            }));
        if (slabs.length > 0) payload.priceSlabs = slabs;
        if (formData.categoryIds.length > 0) {
            payload.categoryId = formData.categoryIds[0];
            payload.primaryCategoryId = formData.categoryIds[0];
            payload.categoryIds = formData.categoryIds;
        } else if (editingProduct) {
            payload.categoryIds = [];
        }
        if (formData.description.trim()) payload.description = formData.description.trim();
        if (formData.originalPrice && Number(formData.originalPrice) > 0) {
            payload.originalPrice = Number(formData.originalPrice);
        }
        if (formData.packSize.trim()) payload.packSize = formData.packSize.trim();
        if (formData.tags.length > 0) payload.tags = formData.tags;
        const additionalImages = formData.images.filter(Boolean);
        if (additionalImages.length > 0) payload.images = additionalImages;
        if (formData.fssaiRef.trim()) payload.fssaiRef = formData.fssaiRef.trim();
        if (formData.aliasNames.length > 0) payload.aliasNames = formData.aliasNames;
        if (formData.vegNonVeg) payload.vegNonVeg = formData.vegNonVeg;
        if (formData.storageType) payload.storageType = formData.storageType;
        if (formData.shelfLifeDays) payload.shelfLifeDays = parseInt(formData.shelfLifeDays, 10);
        if (formData.countryOfOrigin.trim()) payload.countryOfOrigin = formData.countryOfOrigin.trim();
        if (formData.substituteIds.length > 0) payload.substituteIds = formData.substituteIds;
        payload.isFeatured = formData.isFeatured;
        return payload;
    };

    const syncFormSnapshot = useCallback(() => {
        savedFormSnapshotRef.current = JSON.stringify(formData);
    }, [formData]);

    const isFormDirty = useCallback(() => {
        return JSON.stringify(formData) !== savedFormSnapshotRef.current;
    }, [formData]);

    const canAutosaveDraft = useCallback(() => {
        if (!panelOpen || loadingProduct || saving || draftSaving) return false;
        if (editingProduct?.isMasterRow) return false;
        if (editingProduct?.listingStatus === 'submitted') return false;
        if (editingProduct?.listingStatus === 'draft') return true;
        return formData.name.trim().length > 0;
    }, [panelOpen, loadingProduct, saving, draftSaving, editingProduct, formData.name]);

    const performDraftSave = useCallback(async (opts?: { silent?: boolean }): Promise<boolean> => {
        if (editingProduct?.isMasterRow) {
            if (!opts?.silent) toast.error('Master catalog rows cannot be saved as drafts.');
            return false;
        }

        setDraftSaving(true);
        setDraftSaveError(null);
        try {
            const payload = buildProductPayload({ isDraft: true });
            const isEdit = !!editingProduct && !editingProduct.isMasterRow;
            const url = isEdit
                ? `/api/v1/admin/products/${editingProduct!.id}`
                : '/api/v1/admin/products';
            const method = isEdit ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!json.success && !res.ok) {
                setDraftSaveError(json.error?.message ?? 'Couldn\'t save draft');
                return false;
            }

            const saved = json.data as Product;
            savedFormSnapshotRef.current = JSON.stringify(formData);
            if (!isEdit) {
                setEditingProduct({ ...saved, listingStatus: 'draft', isMasterRow: false });
                setProducts(prev => [{ ...saved, listingStatus: 'draft', isMasterRow: false }, ...prev]);
            } else {
                setEditingProduct(prev => prev ? { ...prev, ...saved, listingStatus: 'draft' } : prev);
                setProducts(prev => prev.map(p => p.id === saved.id ? { ...p, ...saved, listingStatus: 'draft' } : p));
            }
            void fetchDraftCount();
            if (!opts?.silent) toast.success('Draft saved');
            return true;
        } catch {
            setDraftSaveError('Couldn\'t save draft — check connection');
            return false;
        } finally {
            setDraftSaving(false);
        }
    }, [editingProduct, formData, buildProductPayload, fetchDraftCount]);

    performDraftSaveRef.current = performDraftSave;

    const handleSaveDraft = () => void performDraftSave({ silent: false });

    const flushDraftAutosave = useCallback(async () => {
        if (draftSaveTimeoutRef.current) {
            clearTimeout(draftSaveTimeoutRef.current);
            draftSaveTimeoutRef.current = null;
        }
        if (canAutosaveDraft() && isFormDirty()) {
            await performDraftSaveRef.current({ silent: true });
        }
    }, [canAutosaveDraft, isFormDirty]);

    const requestClosePanel = () => {
        void (async () => {
            await flushDraftAutosave();
            if (isFormDirty()) {
                setShowCloseConfirm(true);
                return;
            }
            closePanelImmediate();
        })();
    };

    const handleSave = async () => {
        if (!validateForm()) return;
        setSaving(true);
        try {
            const metadata = buildFormMetadata();

            const isMasterEdit = !!editingProduct?.isMasterRow;
            const isMasterCreate = !editingProduct && !formData.vendorId;

            if (isMasterEdit || isMasterCreate) {
                const masterPayload: Record<string, unknown> = {
                    name: formData.name.trim(),
                    brand: formData.brand.trim(),
                    categoryId: formData.categoryIds[0],
                    metadata,
                };
                if (formData.imageUrl) masterPayload.imageUrl = formData.imageUrl;
                const additionalImages = formData.images.filter(Boolean);
                if (additionalImages.length > 0) masterPayload.images = additionalImages;
                if (formData.unit) masterPayload.uom = formData.unit;
                if (Number(formData.taxPercent)) masterPayload.taxPercent = Number(formData.taxPercent);

                const isEdit = !!editingProduct;
                const url = isEdit
                    ? `/api/v1/admin/master-products/${editingProduct!.id}`
                    : '/api/v1/admin/master-products';
                const method = isEdit ? 'PATCH' : 'POST';
                if (!isEdit) masterPayload.sku = formData.sku.trim();

                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(masterPayload),
                });
                const json = await res.json();
                if (json.success || res.ok) {
                    closePanelImmediate();
                    fetchProducts(currentPage);
                } else {
                    const msg = json.error?.message ?? json.message ?? 'Failed to save master product';
                    applyServerError(msg);
                }
                return;
            }

            const payload = buildProductPayload({ isDraft: false });

            const isEdit = !!editingProduct && !editingProduct.isMasterRow;
            const url = isEdit
                ? `/api/v1/admin/products/${editingProduct!.id}`
                : '/api/v1/admin/products';
            const method = isEdit ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();

            if (json.success || res.ok) {
                const saved: Product = { ...(json.data as Product), listingStatus: 'submitted', isMasterRow: false };
                if (isEdit) {
                    setProducts(prev => prev.map(p => (p.id === saved.id ? saved : p)));
                } else {
                    setProducts(prev => [saved, ...prev]);
                }
                void fetchDraftCount();
                closePanelImmediate();
            } else {
                const msg = json.error?.message ?? json.message ?? 'Failed to save product';
                applyServerError(msg);
            }
        } catch (err) {
            console.error('Failed to save product:', err);
            setFormErrors({ _server: 'Network error. Please try again.' });
        } finally {
            setSaving(false);
        }
    };

    const saveDraftRef = useRef(() => performDraftSaveRef.current({ silent: true }));
    saveDraftRef.current = () => performDraftSaveRef.current({ silent: true });

    useEffect(() => {
        if (prevLoadingProductRef.current && !loadingProduct && panelOpen) {
            syncFormSnapshot();
        }
        prevLoadingProductRef.current = loadingProduct;
    }, [loadingProduct, panelOpen, syncFormSnapshot]);

    useEffect(() => {
        if (!canAutosaveDraft() || !isFormDirty()) return;
        if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = setTimeout(() => {
            void saveDraftRef.current();
        }, 2000);
        return () => {
            if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
        };
    }, [formData, canAutosaveDraft, isFormDirty]);

    // -----------------------------------------------------------------------
    // Import
    // -----------------------------------------------------------------------

    const openImport = () => setImportOpen(true);

    const handleImportComplete = () => {
        // Refresh products list after import (reset to page 1)
        fetchProducts(1);
    };

    // -----------------------------------------------------------------------
    // Export
    // -----------------------------------------------------------------------

    const handleExport = (format: 'csv' | 'xlsx') => {
        const params = new URLSearchParams();
        params.set('format', format);
        if (filterStatus) params.set('approvalStatus', filterStatus);
        if (gridVendorId) params.set('vendorId', gridVendorId);
        if (filterCategory) params.set('categoryId', filterCategory);
        if (debouncedSearch) params.set('search', debouncedSearch);

        window.open(`/api/v1/admin/products/export?${params.toString()}`, '_blank');
    };

    // -----------------------------------------------------------------------
    // Template download (import) — now handled inside ProductImportModal
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    const updateField = (field: keyof ProductFormData, value: string | boolean) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (formErrors[field]) {
            setFormErrors(prev => {
                const next = { ...prev };
                delete next[field];
                return next;
            });
        }
    };

    // Inline "add new brand" — admin creates an approved brand label instantly.
    const suggestBrand = async (name: string) => {
        const trimmed = name.trim();
        if (trimmed.length < 2 || brandSuggesting) return;
        if (brands.some(b => b.name.toLowerCase() === trimmed.toLowerCase())) {
            updateField('brand', trimmed);
            return;
        }
        setBrandSuggesting(true);
        try {
            const res = await fetch('/api/v1/admin/brands/quick-add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: trimmed }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Failed to add brand');
            setBrands(prev =>
                prev.some(b => b.id === json.data.id) ? prev : [...prev, { id: json.data.id, name: json.data.name }],
            );
            updateField('brand', json.data.name);
            toast.success(
                json.alreadyExists ? `Using existing brand "${json.data.name}"` : `Added brand "${json.data.name}"`,
            );
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Failed to add brand');
        } finally {
            setBrandSuggesting(false);
        }
    };

    const mapServerErrorToField = (msg: string): ProductValidationField | null => {
        const m = msg.toLowerCase();
        if (m.includes('substitut')) return 'substituteIds';
        if (m.includes('hsn')) return 'hsn';
        if (m.includes('image')) return 'imageUrl';
        if (m.includes('sku')) return 'sku';
        if (m.includes('categor')) return 'categoryIds';
        if (m.includes('brand')) return 'brand';
        if (m.includes('price')) return 'basePrice';
        if (m.includes('name')) return 'name';
        return null;
    };

    const applyServerError = (msg: string) => {
        const field = mapServerErrorToField(msg);
        const errs: Record<string, string> = field ? { [field]: msg } : { _server: msg };
        setFormErrors(errs);
        focusFirstProductFormError(errs);
    };

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div className="max-w-[1600px] mx-auto space-y-8 pb-10 animate-in fade-in duration-500">
            {/* ============================================================= */}
            {/* Header Row                                                      */}
            {/* ============================================================= */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[28px] font-[900] text-[#181725] tracking-tight leading-none mb-1">
                        Product Management
                    </h1>
                    <p className="text-[#7C7C7C] font-medium text-[13px]">
                        Manage all products across every vendor
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap justify-end">
                    {perms.canWriteProducts && (
                        <BulkProductToolbar
                            vendors={vendors}
                            gridVendorId={gridVendorId}
                            onGridVendorChange={setGridVendorId}
                            onImport={openImport}
                            onSpreadsheet={() => void openBulkGrid()}
                            onExportCsv={() => handleExport('csv')}
                            onExportXlsx={() => handleExport('xlsx')}
                            spreadsheetLoading={gridLoading}
                            showVendorPicker
                            activeTab={gridOpen ? 'spreadsheet' : importOpen ? 'import' : null}
                        />
                    )}

                    {perms.canWriteProducts && draftCount > 0 && (
                        <button
                            type="button"
                            onClick={() => {
                                setFilterDrafts(true);
                                setFilterStatus('');
                            }}
                            className="h-[44px] px-4 bg-white border border-[#EEEEEE] rounded-[12px] text-[13px] font-bold text-[#4F6BED] hover:bg-[#F0F4FF] transition-all flex items-center gap-2"
                        >
                            <Clock size={16} />
                            Drafts ({draftCount})
                        </button>
                    )}

                    {/* Add Product Button */}
                    {perms.canWriteProducts && (
                        <button
                            onClick={openCreate}
                            className="h-[44px] px-6 bg-[#299E60] text-white rounded-[12px] text-[13px] font-bold hover:bg-[#238a54] transition-all flex items-center gap-2 shadow-sm shadow-[#299E60]/20"
                        >
                            <Plus size={16} strokeWidth={3} />
                            Add Product
                        </button>
                    )}
                </div>
            </div>

            {/* ============================================================= */}
            {/* Stats Cards                                                     */}
            {/* ============================================================= */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((card, idx) => (
                    <div
                        key={idx}
                        className="bg-white p-6 rounded-[14px] border border-[#EEEEEE] shadow-sm flex items-center gap-5"
                    >
                        <div
                            className="w-[56px] h-[56px] rounded-[14px] flex items-center justify-center shrink-0"
                            style={{ backgroundColor: card.bgColor, color: card.color }}
                        >
                            <card.icon size={26} strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="text-[12px] font-bold text-[#AEAEAE] mb-1 uppercase tracking-wider">
                                {card.label}
                            </p>
                            <h3 className="text-[28px] font-[900] text-[#181725] leading-none">{card.value}</h3>
                        </div>
                    </div>
                ))}
            </div>

            {/* ============================================================= */}
            {/* Filters Row                                                     */}
            {/* ============================================================= */}
            <div className="bg-white p-6 rounded-[14px] border border-[#EEEEEE] shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#AEAEAE]" size={16} />
                        <input
                            type="text"
                            placeholder="Search products..."
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            className="w-full h-[44px] bg-[#F8F9FB] border border-[#EEEEEE] rounded-[12px] pl-10 pr-4 text-[13px] outline-none transition-all placeholder:text-[#AEAEAE] font-medium focus:border-[#299E60]/40 focus:bg-white focus:shadow-sm"
                        />
                    </div>

                    {/* Approval Status */}
                    <select
                        value={filterDrafts ? '__drafts__' : filterStatus}
                        onChange={e => {
                            if (e.target.value === '__drafts__') {
                                setFilterDrafts(true);
                                setFilterStatus('');
                            } else {
                                setFilterDrafts(false);
                                setFilterStatus(e.target.value);
                            }
                        }}
                        className="h-[44px] bg-[#F8F9FB] border border-[#EEEEEE] rounded-[12px] px-4 text-[13px] font-medium text-[#181725] outline-none focus:border-[#299E60]/40 focus:bg-white transition-all min-w-[160px] cursor-pointer"
                    >
                        <option value="">All Statuses</option>
                        <option value="__drafts__">Drafts</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                    </select>

                    {/* Category */}
                    <select
                        value={filterCategory}
                        onChange={e => setFilterCategory(e.target.value)}
                        className="h-[44px] bg-[#F8F9FB] border border-[#EEEEEE] rounded-[12px] px-4 text-[13px] font-medium text-[#181725] outline-none focus:border-[#299E60]/40 focus:bg-white transition-all min-w-[180px] cursor-pointer"
                    >
                        <option value="">All Categories</option>
                        {categories.map(c => (
                            <option key={c.id} value={c.id}>
                                {c.parentId ? `— ${c.name}` : c.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ============================================================= */}
            {/* Products Table                                                  */}
            {/* ============================================================= */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <Loader2 className="animate-spin text-[#299E60]" size={32} />
                    </div>
                ) : products.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                        <div className="w-16 h-16 bg-[#F8F9FB] rounded-full flex items-center justify-center text-[#AEAEAE]">
                            <Package size={32} />
                        </div>
                        <p className="text-[#AEAEAE] font-bold text-[14px]">
                            {debouncedSearch || filterStatus || filterVendor || filterCategory
                                ? 'No products match your filters'
                                : 'No products yet'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[1440px]">
                            <thead>
                                {/* Product (left) + Actions (right) stay pinned while the
                                    middle columns scroll horizontally — power-admin view. */}
                                <tr className="bg-[#F8F9FB] text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wider">
                                    <th className="px-5 py-3 sticky left-0 bg-[#F8F9FB] z-20 min-w-[320px]">
                                        <div className="flex items-center gap-2.5">
                                            <input
                                                type="checkbox"
                                                checked={products.length > 0 && products.every(p => selectedIds.has(p.id))}
                                                onChange={() => toggleSelectAll(products.map(p => p.id), products.every(p => selectedIds.has(p.id)))}
                                                className="w-4 h-4 rounded border-gray-300 text-[#299E60] focus:ring-[#299E60] cursor-pointer"
                                                title="Select all on this page"
                                            />
                                            Product
                                        </div>
                                    </th>
                                    <th className="px-5 py-3 min-w-[150px]">
                                        Brand
                                    </th>
                                    <th className="px-5 py-3 min-w-[180px]">
                                        Category
                                    </th>
                                    <th className="px-5 py-3 min-w-[110px]">
                                        Vendors
                                    </th>
                                    <th className="px-5 py-3 min-w-[100px] text-right">
                                        Base ₹
                                    </th>
                                    <th className="px-5 py-3 min-w-[85px] text-right">
                                        GST %
                                    </th>
                                    <th className="px-5 py-3 min-w-[105px] text-right text-[#299E60]">
                                        Gross ₹
                                    </th>
                                    <th className="px-5 py-3 min-w-[140px]">
                                        Unit
                                    </th>
                                    <th className="px-5 py-3 min-w-[120px]">
                                        Status
                                    </th>
                                    <th className="px-5 py-3 min-w-[150px]">
                                        Inventory
                                    </th>
                                    <th className="px-5 py-3 text-right sticky right-0 bg-[#F8F9FB] z-20 min-w-[120px]">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#EEEEEE]">
                                {products.map(product => {
                                    return (
                                        <tr key={product.id} className="hover:bg-[#F8F9FB]/60 transition-colors group text-[12.5px]">
                                            {/* Product — thumbnail + name + SKU, pinned left */}
                                            <td className="px-5 py-3 sticky left-0 bg-white group-hover:bg-[#F8F9FB] z-10 border-r border-[#EEEEEE]/40">
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.has(product.id)}
                                                        onChange={() => toggleSelect(product.id)}
                                                        className="w-4 h-4 rounded border-gray-300 text-[#299E60] focus:ring-[#299E60] cursor-pointer shrink-0"
                                                    />
                                                    {product.imageUrl ? (
                                                        <img
                                                            src={product.imageUrl}
                                                            alt={product.name}
                                                            className="w-[42px] h-[42px] rounded-[10px] object-cover border border-[#EEEEEE] shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="w-[42px] h-[42px] rounded-[10px] bg-[#F8F9FB] border border-[#EEEEEE] flex items-center justify-center text-[#AEAEAE] shrink-0">
                                                            <ImageIcon size={18} />
                                                        </div>
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <input
                                                            type="text"
                                                            value={product.name}
                                                            onChange={e => handleCellChange(product.id, 'name', e.target.value)}
                                                            onBlur={e => handleInlineEdit(product.id, 'name', e.target.value, originalProductsRef.current.find(p => p.id === product.id)?.name)}
                                                            className={cn(cellInput, "font-bold text-[#181725] text-[13.5px] -ml-1.5 px-1.5 py-0.5")}
                                                        />
                                                        <input
                                                            type="text"
                                                            value={product.sku || ''}
                                                            placeholder="No SKU"
                                                            onChange={e => handleCellChange(product.id, 'sku', e.target.value)}
                                                            onBlur={e => handleInlineEdit(product.id, 'sku', e.target.value || null, originalProductsRef.current.find(p => p.id === product.id)?.sku || '')}
                                                            className={cn(cellInput, "text-[#AEAEAE] text-[11px] font-medium -ml-1.5 mt-0.5 px-1.5 py-0.5")}
                                                        />
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Brand */}
                                            <td className="px-5 py-3 border-r border-[#EEEEEE]/40">
                                                <select
                                                    value={product.brand || ''}
                                                    onChange={e => {
                                                        const val = e.target.value || null;
                                                        handleCellChange(product.id, 'brand', val);
                                                        handleInlineEdit(product.id, 'brand', val, originalProductsRef.current.find(p => p.id === product.id)?.brand || null);
                                                    }}
                                                    className={cn(cellInput, "text-[#7C7C7C] font-medium appearance-none")}
                                                >
                                                    <option value="">— Select Brand —</option>
                                                    {brands.map(b => (
                                                        <option key={b.id} value={b.name}>{b.name}</option>
                                                    ))}
                                                </select>
                                            </td>

                                            {/* Category */}
                                            <td className="px-5 py-3 border-r border-[#EEEEEE]/40">
                                                <select
                                                    value={product.category?.id ?? ''}
                                                    onChange={e => {
                                                        const val = e.target.value || null;
                                                        const matchedCat = categories.find(c => c.id === val);
                                                        handleCellChange(product.id, 'category', matchedCat ? { id: matchedCat.id, name: matchedCat.name } : null);
                                                        handleInlineEdit(product.id, 'primaryCategoryId', val, originalProductsRef.current.find(p => p.id === product.id)?.category?.id ?? null);
                                                    }}
                                                    className={cn(cellInput, "text-[#7C7C7C] font-medium appearance-none")}
                                                >
                                                    <option value="">— Select Category —</option>
                                                    {categories.map(c => (
                                                        <option key={c.id} value={c.id}>
                                                            {c.parentId ? `— ${c.name}` : c.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>

                                            {/* Vendors */}
                                            <td className="px-5 py-3 border-r border-[#EEEEEE]/40">
                                                {(product.vendorCount ?? 0) > 0 ? (
                                                    <span className="font-semibold text-[#181725]" title={product.vendors?.join(', ')}>
                                                        {product.vendorCount} vendor{product.vendorCount !== 1 ? 's' : ''}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-[#3B82F6] bg-[#EFF6FF] px-2 py-0.5 rounded-[4px] uppercase tracking-wider">
                                                        Catalog
                                                    </span>
                                                )}
                                            </td>

                                            {/* Base price (taxable rate) */}
                                            <td className="px-5 py-3 text-right border-r border-[#EEEEEE]/40 bg-[#FAFAFA]/20">
                                                <div className="flex items-center justify-end gap-0.5 max-w-[90px] ml-auto">
                                                    <span className="font-bold text-[#181725]">₹</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={product.basePrice ?? ''}
                                                        onChange={e => handleCellChange(product.id, 'basePrice', parseFloat(e.target.value) || 0)}
                                                        onBlur={e => handleInlineEdit(product.id, 'basePrice', parseFloat(e.target.value) || 0, originalProductsRef.current.find(p => p.id === product.id)?.basePrice)}
                                                        className={cn(cellInput, "text-right font-bold text-[#181725] px-1 py-0.5")}
                                                    />
                                                </div>
                                            </td>

                                            {/* GST % */}
                                            <td className="px-5 py-3 text-right border-r border-[#EEEEEE]/40 bg-[#FAFAFA]/20">
                                                <select
                                                    value={String(product.taxPercent ?? 0)}
                                                    onChange={e => {
                                                        const val = parseFloat(e.target.value) || 0;
                                                        handleCellChange(product.id, 'taxPercent', val);
                                                        handleInlineEdit(product.id, 'taxPercent', val, originalProductsRef.current.find(p => p.id === product.id)?.taxPercent || 0);
                                                    }}
                                                    className={cn(cellInput, "text-right font-medium text-[#7C7C7C] w-[65px] ml-auto appearance-none")}
                                                >
                                                    {TAX_OPTIONS.map(t => (
                                                        <option key={t} value={t}>{t}%</option>
                                                    ))}
                                                </select>
                                            </td>

                                            {/* Gross Price */}
                                            <td className="px-5 py-3 text-right border-r border-[#EEEEEE]/40 bg-[#299E60]/[0.02]">
                                                <span className="font-extrabold text-[#299E60] tabular-nums">
                                                    ₹{(product.basePrice * (1 + (product.taxPercent || 0) / 100)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </td>

                                            {/* Unit */}
                                            <td className="px-5 py-3 border-r border-[#EEEEEE]/40">
                                                <select
                                                    value={product.unit || ''}
                                                    onChange={e => {
                                                        const val = e.target.value || null;
                                                        handleCellChange(product.id, 'unit', val);
                                                        handleInlineEdit(product.id, 'unit', val, originalProductsRef.current.find(p => p.id === product.id)?.unit || null);
                                                    }}
                                                    className={cn(cellInput, "text-[#7C7C7C] font-medium appearance-none")}
                                                >
                                                    <option value="">— Select Unit —</option>
                                                    {UNIT_OPTIONS.map(u => (
                                                        <option key={u} value={u}>{u}</option>
                                                    ))}
                                                </select>
                                            </td>

                                            {/* Status */}
                                            <td className="px-5 py-3 border-r border-[#EEEEEE]/40">
                                                {product.listingStatus === 'draft' ? (
                                                    <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-[6px] uppercase tracking-wider bg-[#F0F4FF] text-[#4F6BED]">
                                                        Draft
                                                    </span>
                                                ) : (
                                                <select
                                                    value={product.approvalStatus}
                                                    onChange={e => {
                                                        const val = e.target.value as 'approved' | 'rejected' | 'pending';
                                                        handleCellChange(product.id, 'approvalStatus', val);
                                                        handleInlineEdit(product.id, 'approvalStatus', val, originalProductsRef.current.find(p => p.id === product.id)?.approvalStatus);
                                                    }}
                                                    className={cn(
                                                        "text-[10px] font-extrabold px-2 py-1 rounded-[6px] uppercase tracking-wider border outline-none bg-transparent cursor-pointer",
                                                        product.approvalStatus === 'approved' ? 'text-[#299E60] bg-[#EEF8F1] border-transparent' :
                                                        product.approvalStatus === 'rejected' ? 'text-[#E74C3C] bg-[#FFF0F0] border-transparent' :
                                                        'text-[#F59E0B] bg-[#FFF7E6] border-transparent'
                                                    )}
                                                >
                                                    <option value="pending">Pending</option>
                                                    <option value="approved">Approved</option>
                                                    <option value="rejected">Rejected</option>
                                                </select>
                                                )}
                                            </td>

                                            {/* Inventory — aggregated across vendors */}
                                            <td className="px-5 py-3 whitespace-nowrap border-r border-[#EEEEEE]/40">
                                                {(product.vendorCount ?? 0) > 0 ? (
                                                    <div
                                                        className="cursor-default"
                                                        title={product.vendorStock?.map(vs => `${vs.vendor}: ${vs.qty}`).join('\n')}
                                                    >
                                                        <span className={cn(
                                                            'font-bold',
                                                            (product.totalStock ?? 0) > 0 ? 'text-[#181725]' : 'text-[#AEAEAE]',
                                                        )}>
                                                            {product.totalStock ?? 0}
                                                        </span>
                                                        <span className="text-[11px] text-[#AEAEAE] ml-1">
                                                            across {product.vendorCount}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] font-medium text-[#AEAEAE]">
                                                        —
                                                    </span>
                                                )}
                                            </td>

                                            {/* Actions — pinned right */}
                                            <td className="px-5 py-3 sticky right-0 bg-white group-hover:bg-[#F8F9FB] z-10 border-l border-[#EEEEEE]/40">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {savingRows[product.id] && Object.keys(savingRows[product.id]).length > 0 ? (
                                                        <div className="w-[36px] h-[36px] flex items-center justify-center text-[#299E60]">
                                                            <Loader2 className="animate-spin" size={16} />
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {/* Edit */}
                                                            {perms.canWriteProducts && (
                                                                <button
                                                                    onClick={() => openEdit(product)}
                                                                    title="Edit product"
                                                                    className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-[#7C7C7C] hover:bg-[#EEF8F1] hover:text-[#299E60] transition-all"
                                                                >
                                                                    <Pencil size={15} />
                                                                </button>
                                                            )}

                                                            {/* Toggle Active */}
                                                            {perms.canWriteProducts && (
                                                            <button
                                                                onClick={() => toggleActive(product)}
                                                                disabled={actionLoading === product.id}
                                                                title={product.isActive ? 'Deactivate' : 'Activate'}
                                                                className={cn(
                                                                    'w-[34px] h-[34px] rounded-[10px] flex items-center justify-center transition-all disabled:opacity-50',
                                                                    product.isActive
                                                                        ? 'text-[#299E60] hover:bg-[#EEF8F1]'
                                                                        : 'text-[#AEAEAE] hover:bg-[#F8F9FB]',
                                                                )}
                                                            >
                                                                {actionLoading === product.id ? (
                                                                    <Loader2 size={15} className="animate-spin" />
                                                                ) : (
                                                                    <div
                                                                        className="relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors duration-200"
                                                                        style={{ backgroundColor: product.isActive ? '#299E60' : '#D1D5DB' }}
                                                                    >
                                                                        <span className="inline-block h-[12px] w-[12px] rounded-full bg-white shadow-sm transition-transform duration-200" style={{ transform: product.isActive ? 'translateX(17px)' : 'translateX(3px)' }} />
                                                                    </div>
                                                                )}
                                                            </button>
                                                            )}

                                                            {/* Delete */}
                                                            {perms.canWriteProducts && (
                                                                <button
                                                                    onClick={() => setDeleteTarget(product)}
                                                                    title="Delete product"
                                                                    className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-[#7C7C7C] hover:bg-[#FFF0F0] hover:text-[#E74C3C] transition-all"
                                                                >
                                                                    <Trash2 size={15} />
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer / Pagination */}
                    <div className="p-6 bg-[#FDFDFD] border-t border-[#EEEEEE] flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4 flex-wrap">
                            <p className="text-[13px] text-[#7C7C7C] font-semibold">
                                Showing{' '}
                                <span className="text-[#181725] font-bold">
                                    {totalProductsCount === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalProductsCount)}
                                </span>
                                {' '}of{' '}
                                <span className="text-[#181725] font-bold">{totalProductsCount}</span>
                                {' '}products
                            </p>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[13px] text-[#7C7C7C] font-semibold">· Show</span>
                                <select
                                    value={pageSize}
                                    onChange={e => {
                                        const val = Number(e.target.value);
                                        setPageSize(val);
                                        setCurrentPage(1);
                                    }}
                                    className="h-[28px] px-1.5 bg-white border border-[#EEEEEE] rounded-[6px] text-[12px] font-bold text-[#181725] outline-none cursor-pointer focus:border-[#299E60]/40"
                                >
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                                <span className="text-[13px] text-[#7C7C7C] font-semibold">per page</span>
                            </div>
                        </div>
                        
                        {totalPages > 1 && (
                            <div className="flex items-center gap-1">
                                {/* Prev Button */}
                                <button
                                    onClick={() => fetchProducts(Math.max(1, currentPage - 1))}
                                    disabled={currentPage === 1 || loading}
                                    className="w-[34px] h-[34px] flex items-center justify-center rounded-[8px] border border-[#EEEEEE] text-[#7C7C7C] hover:bg-[#F5F5F5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                </button>

                                {/* Page numbers */}
                                {getPageRange(currentPage, totalPages).map((item, idx) =>
                                    item === 'gap' ? (
                                        <span key={`gap-${idx}`} className="w-[34px] h-[34px] flex items-center justify-center text-[#AEAEAE] text-[13px]">…</span>
                                    ) : (
                                        <button
                                            key={item}
                                            onClick={() => fetchProducts(item)}
                                            disabled={loading}
                                            className={cn(
                                                'w-[34px] h-[34px] flex items-center justify-center rounded-[8px] text-[13px] font-bold transition-colors',
                                                item === currentPage
                                                    ? 'bg-[#299E60] text-white'
                                                    : 'border border-[#EEEEEE] text-[#7C7C7C] hover:bg-[#F5F5F5]'
                                            )}
                                        >
                                            {item}
                                        </button>
                                    )
                                )}

                                {/* Next Button */}
                                <button
                                    onClick={() => fetchProducts(Math.min(totalPages, currentPage + 1))}
                                    disabled={currentPage === totalPages || loading}
                                    className="w-[34px] h-[34px] flex items-center justify-center rounded-[8px] border border-[#EEEEEE] text-[#7C7C7C] hover:bg-[#F5F5F5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}
            </div>

            {/* ============================================================= */}
            {/* Add/Edit Sliding Panel                                          */}
            {/* ============================================================= */}

            {/* Backdrop */}
            <div
                className={cn(
                    'fixed inset-0 bg-black/40 z-[60] transition-opacity duration-300',
                    panelOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
                )}
                onClick={(e) => { if (e.target === e.currentTarget) requestClosePanel(); }}
            />

            {/* Panel */}
            <div
                className={cn(
                    'fixed top-0 left-0 h-full w-full bg-white z-[70] shadow-2xl transition-transform duration-300 ease-in-out flex flex-col',
                    panelOpen ? 'translate-x-0' : '-translate-x-full',
                )}
            >
                {/* Panel Header */}
                <div className="flex items-center justify-between px-4 lg:px-6 py-4 border-b border-[#EEEEEE] shrink-0">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-[22px] font-[900] text-[#181725]">
                            {editingProduct ? 'Edit Product' : 'Add Product'}
                        </h2>
                        {(draftSaving || draftSaveError || editingProduct?.listingStatus === 'draft') && (
                            <span className={cn(
                                'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-[8px]',
                                draftSaveError
                                    ? 'text-[#E74C3C] bg-[#FFF0F0]'
                                    : draftSaving
                                        ? 'text-[#7C7C7C] bg-[#F5F5F5]'
                                        : 'text-[#4F6BED] bg-[#F0F4FF]',
                            )}>
                                {draftSaving ? (
                                    <>
                                        <Loader2 size={12} className="animate-spin" />
                                        Saving draft…
                                    </>
                                ) : draftSaveError ? (
                                    draftSaveError
                                ) : (
                                    'Draft'
                                )}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={requestClosePanel}
                        className="w-[40px] h-[40px] rounded-[12px] flex items-center justify-center hover:bg-[#F8F9FB] text-[#7C7C7C] hover:text-[#181725] transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto bg-[#F8F9FB] px-4 lg:px-6 py-4">
                    <div className="w-full space-y-8">
                        {loadingProduct ? (
                            <div className="flex items-center justify-center py-32">
                                <Loader2 className="animate-spin text-[#299E60]" size={32} />
                            </div>
                        ) : (
                            <>
                                {formErrors._server && (
                                    <div className="flex items-center gap-3 bg-[#FFF0F0] border border-[#E74C3C]/20 text-[#E74C3C] rounded-[12px] px-5 py-4 text-[13px] font-semibold">
                                        <AlertTriangle size={18} />
                                        {formErrors._server}
                                    </div>
                                )}

                                <FormSection title="Product essentials" icon={<Info size={16} />} requiredBadge sectionId="essentials">
                                    <div id="ff-name">
                                        <FieldLabel required>Item Name</FieldLabel>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={e => updateField('name', e.target.value)}
                                            placeholder="Enter product name"
                                            className={cn(inputCls, formErrors.name && 'border-[#E74C3C] focus:border-[#E74C3C]')}
                                        />
                                        {formErrors.name && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.name}</p>}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div id="ff-sku">
                                            <FieldLabel required>SKU</FieldLabel>
                                            <input
                                                type="text"
                                                value={formData.sku}
                                                onChange={e => updateField('sku', e.target.value.toUpperCase())}
                                                placeholder="RIC-BAS-001"
                                                readOnly={!!editingProduct?.isMasterRow}
                                                className={cn(inputCls, editingProduct?.isMasterRow && 'bg-[#F8F9FB] cursor-not-allowed', formErrors.sku && 'border-[#E74C3C]')}
                                            />
                                            {formErrors.sku && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.sku}</p>}
                                        </div>
                                        <div id="ff-hsn">
                                            <FieldLabel required>HSN Code</FieldLabel>
                                            <input
                                                type="text"
                                                value={formData.hsn}
                                                onChange={e => updateField('hsn', e.target.value)}
                                                placeholder="e.g. 1006"
                                                className={cn(inputCls, formErrors.hsn && 'border-[#E74C3C]')}
                                            />
                                            {formErrors.hsn && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.hsn}</p>}
                                        </div>
                                    </div>

                                    <div id="ff-brand">
                                        <FieldLabel required>Brand</FieldLabel>
                                        <BrandSinglePicker
                                            value={formData.brand}
                                            onChange={val => updateField('brand', val)}
                                            brands={brands}
                                            placeholder="Select brand"
                                            hasError={!!formErrors.brand}
                                            onSuggest={(name) => suggestBrand(name)}
                                            suggesting={brandSuggesting}
                                        />
                                        {formErrors.brand && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.brand}</p>}
                                    </div>

                                    <div id="ff-categoryIds">
                                        <CategoryHierarchyPicker
                                            key={`cat-${editingProduct?.id ?? (panelOpen ? 'open' : 'closed')}`}
                                            value={formData.categoryIds}
                                            onChange={(ids) => setFormData(prev => ({ ...prev, categoryIds: ids }))}
                                            maxAdditional={4}
                                            endpoint="/api/v1/admin/categories"
                                            label="Categories"
                                            helper="Pick a parent category, then a sub-category."
                                        />
                                        {formErrors.categoryIds && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.categoryIds}</p>}
                                    </div>

                                    <div id="ff-imageUrl">
                                        <FieldLabel required>Image URL</FieldLabel>
                                        <ImageUpload
                                            value={formData.imageUrl}
                                            onChange={(url) => updateField('imageUrl', url)}
                                            folder="products"
                                            label="Primary Image"
                                            size="lg"
                                        />
                                        {formErrors.imageUrl && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.imageUrl}</p>}
                                    </div>

                                    <div className="space-y-3 pt-2 border-t border-[#EEEEEE]">
                                        <h4 className="text-[13px] font-bold text-[#181725]">Tax details</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div id="ff-intraStateTaxName">
                                                <FieldLabel required>Intra State Tax Name</FieldLabel>
                                                <input type="text" value={formData.intraStateTaxName} onChange={e => updateField('intraStateTaxName', e.target.value)} placeholder="e.g. SGST+CGST" className={cn(inputCls, formErrors.intraStateTaxName && 'border-[#E74C3C]')} />
                                                {formErrors.intraStateTaxName && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.intraStateTaxName}</p>}
                                            </div>
                                            <div id="ff-intraStateTaxRate">
                                                <FieldLabel required>Intra State Tax Rate</FieldLabel>
                                                <input type="number" step="0.01" value={formData.intraStateTaxRate} onChange={e => updateField('intraStateTaxRate', e.target.value)} placeholder="18" className={cn(inputCls, formErrors.intraStateTaxRate && 'border-[#E74C3C]')} />
                                                {formErrors.intraStateTaxRate && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.intraStateTaxRate}</p>}
                                            </div>
                                            <div id="ff-intraStateTaxType">
                                                <FieldLabel required>Intra State Tax Type</FieldLabel>
                                                <input type="text" value={formData.intraStateTaxType} onChange={e => updateField('intraStateTaxType', e.target.value)} placeholder="Tax Group" className={cn(inputCls, formErrors.intraStateTaxType && 'border-[#E74C3C]')} />
                                                {formErrors.intraStateTaxType && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.intraStateTaxType}</p>}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div id="ff-interStateTaxName">
                                                <FieldLabel required>Inter State Tax Name</FieldLabel>
                                                <input type="text" value={formData.interStateTaxName} onChange={e => updateField('interStateTaxName', e.target.value)} placeholder="e.g. IGST" className={cn(inputCls, formErrors.interStateTaxName && 'border-[#E74C3C]')} />
                                                {formErrors.interStateTaxName && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.interStateTaxName}</p>}
                                            </div>
                                            <div id="ff-interStateTaxRate">
                                                <FieldLabel required>Inter State Tax Rate</FieldLabel>
                                                <input type="number" step="0.01" value={formData.interStateTaxRate} onChange={e => updateField('interStateTaxRate', e.target.value)} placeholder="18" className={cn(inputCls, formErrors.interStateTaxRate && 'border-[#E74C3C]')} />
                                                {formErrors.interStateTaxRate && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.interStateTaxRate}</p>}
                                            </div>
                                            <div id="ff-interStateTaxType">
                                                <FieldLabel required>Inter State Tax Type</FieldLabel>
                                                <input type="text" value={formData.interStateTaxType} onChange={e => updateField('interStateTaxType', e.target.value)} placeholder="Tax" className={cn(inputCls, formErrors.interStateTaxType && 'border-[#E74C3C]')} />
                                                {formErrors.interStateTaxType && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.interStateTaxType}</p>}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div id="ff-countryOfOrigin">
                                            <FieldLabel required>Country of Origin</FieldLabel>
                                            <input type="text" value={formData.countryOfOrigin} onChange={e => updateField('countryOfOrigin', e.target.value)} placeholder="e.g. India" className={cn(inputCls, formErrors.countryOfOrigin && 'border-[#E74C3C]')} />
                                            {formErrors.countryOfOrigin && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.countryOfOrigin}</p>}
                                        </div>
                                        <div id="ff-vegNonVeg">
                                            <FieldLabel required>Veg / Non-Veg</FieldLabel>
                                            <select value={formData.vegNonVeg} onChange={e => updateField('vegNonVeg', e.target.value)} className={cn(selectCls, formErrors.vegNonVeg && 'border-[#E74C3C]')}>
                                                <option value="">Select…</option>
                                                <option value="veg">Veg</option>
                                                <option value="nonveg">Non-Veg</option>
                                                <option value="egg">Egg</option>
                                            </select>
                                            {formErrors.vegNonVeg && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.vegNonVeg}</p>}
                                        </div>
                                        <div id="ff-storageType">
                                            <FieldLabel required>Storage type</FieldLabel>
                                            <select value={formData.storageType} onChange={e => updateField('storageType', e.target.value)} className={cn(selectCls, formErrors.storageType && 'border-[#E74C3C]')}>
                                                <option value="">Select…</option>
                                                <option value="ambient">Ambient</option>
                                                <option value="refrigerated">Refrigerated</option>
                                                <option value="frozen">Frozen</option>
                                                <option value="dry">Dry Storage</option>
                                                <option value="cool">Cool / Dark</option>
                                            </select>
                                            {formErrors.storageType && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.storageType}</p>}
                                        </div>
                                        <div id="ff-shelfLifeDays">
                                            <FieldLabel required>Shelf Life (days)</FieldLabel>
                                            <input type="number" min="0" value={formData.shelfLifeDays} onChange={e => updateField('shelfLifeDays', e.target.value)} placeholder="e.g. 365" className={cn(inputCls, formErrors.shelfLifeDays && 'border-[#E74C3C]')} />
                                            {formErrors.shelfLifeDays && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.shelfLifeDays}</p>}
                                        </div>
                                        <div id="ff-minOrderQty">
                                            <FieldLabel required>MOQ</FieldLabel>
                                            <input type="number" min="1" value={formData.minOrderQty} onChange={e => updateField('minOrderQty', e.target.value)} className={cn(inputCls, formErrors.minOrderQty && 'border-[#E74C3C]')} />
                                            {formErrors.minOrderQty && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.minOrderQty}</p>}
                                        </div>
                                        <div id="ff-variantMapping">
                                            <FieldLabel required>Variant Mapping</FieldLabel>
                                            <input type="text" value={formData.variantMapping} onChange={e => updateField('variantMapping', e.target.value)} placeholder="e.g. size:large" className={cn(inputCls, formErrors.variantMapping && 'border-[#E74C3C]')} />
                                            {formErrors.variantMapping && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.variantMapping}</p>}
                                        </div>
                                    </div>

                                    <div id="ff-substituteIds">
                                        <FieldLabel required>Substitute Mapping</FieldLabel>
                                        <SubstituteProductPicker
                                            selectedIds={formData.substituteIds}
                                            currentProductId={editingProduct?.id}
                                            products={products}
                                            onChange={(ids) => setFormData(prev => ({ ...prev, substituteIds: ids }))}
                                        />
                                        {formErrors.substituteIds && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.substituteIds}</p>}
                                    </div>
                                </FormSection>

                                <FormSection title="Vendor assignment" sectionId="vendor">
                                    <FieldLabel>
                                        Vendor <span className="text-[11px] font-medium text-[#AEAEAE]">(optional — catalog product if empty)</span>
                                    </FieldLabel>
                                    <select
                                        value={formData.vendorId}
                                        onChange={e => updateField('vendorId', e.target.value)}
                                        className={cn(selectCls, 'cursor-pointer')}
                                    >
                                        <option value="">No vendor (Catalog product)</option>
                                        {vendors.map(v => (
                                            <option key={v.id} value={v.id}>{v.businessName}</option>
                                        ))}
                                    </select>
                                </FormSection>

                                <FormSection title="Status & availability" icon={<Clock size={16} />} sectionId="status">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <FieldLabel>Item Status</FieldLabel>
                                                <select
                                                    value={formData.itemStatus}
                                                    onChange={e => updateField('itemStatus', e.target.value)}
                                                    className={selectCls}
                                                >
                                                    <option value="Active">Active</option>
                                                    <option value="Inactive">Inactive</option>
                                                    <option value="Draft">Draft</option>
                                                </select>
                                            </div>
                                            <div className="flex items-center pt-2 md:pt-6">
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.activeOnlineStore}
                                                        onChange={(e) => updateField('activeOnlineStore', e.target.checked)}
                                                        className="w-5 h-5 accent-[#299E60]"
                                                    />
                                                    <div>
                                                        <span className="text-[13.5px] font-bold text-[#181725]">Active on Online Store</span>
                                                        <p className="text-[11px] text-[#AEAEAE]">Show this product in the buyer catalog</p>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                </FormSection>

                                <FormSection title="Pricing & tax" icon={<DollarSign size={16} />} sectionId="pricing">
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div id="ff-basePrice">
                                                <FieldLabel required={!!formData.vendorId}>Taxable Rate (ex-GST)</FieldLabel>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE] font-medium">₹</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={formData.basePrice}
                                                        onChange={e => {
                                                            const base = e.target.value;
                                                            updateField('basePrice', base);
                                                            const tp = parseFloat(formData.taxPercent || '0');
                                                            const b = parseFloat(base);
                                                            if (!isNaN(b) && !isNaN(tp)) {
                                                                updateField('originalPrice', (b * (1 + tp / 100)).toFixed(2));
                                                            }
                                                        }}
                                                        placeholder="0.00"
                                                        className={cn(inputCls, 'pl-7', formErrors.basePrice && 'border-[#E74C3C] focus:border-[#E74C3C]')}
                                                    />
                                                </div>
                                                {formErrors.basePrice && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{formErrors.basePrice}</p>}
                                            </div>

                                            <div>
                                                <FieldLabel>Tax % (GST)</FieldLabel>
                                                <select
                                                    value={formData.taxPercent}
                                                    onChange={e => {
                                                        const tp = e.target.value;
                                                        updateField('taxPercent', tp);
                                                        const base = parseFloat(formData.basePrice);
                                                        const percent = parseFloat(tp);
                                                        if (!isNaN(base) && !isNaN(percent)) {
                                                            updateField('originalPrice', (base * (1 + percent / 100)).toFixed(2));
                                                        }
                                                    }}
                                                    className={selectCls}
                                                >
                                                    {TAX_OPTIONS.map(t => (
                                                        <option key={t} value={t}>{t}%</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <FieldLabel>Gross Rate (incl. GST)</FieldLabel>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#299E60] font-bold">₹</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={formData.originalPrice}
                                                        onChange={e => {
                                                            const gross = e.target.value;
                                                            updateField('originalPrice', gross);
                                                            const tp = parseFloat(formData.taxPercent || '0');
                                                            const g = parseFloat(gross);
                                                            if (!isNaN(g) && !isNaN(tp)) {
                                                                updateField('basePrice', (g / (1 + tp / 100)).toFixed(2));
                                                            }
                                                        }}
                                                        placeholder="0.00"
                                                        className={cn(inputCls, 'pl-7 font-bold text-[#299E60] bg-[#EEF8F1]/10')}
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <FieldLabel>Taxability Type</FieldLabel>
                                                <select
                                                    value={formData.taxabilityType}
                                                    onChange={e => updateField('taxabilityType', e.target.value)}
                                                    className={selectCls}
                                                >
                                                    <option value="taxable">Taxable</option>
                                                    <option value="exempt">Exempt</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#EEEEEE]">
                                            <div className="flex items-center">
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.taxable}
                                                        onChange={(e) => updateField('taxable', e.target.checked)}
                                                        className="w-5 h-5 accent-[#299E60]"
                                                    />
                                                    <div>
                                                        <span className="text-[13.5px] font-bold text-[#181725]">Taxable Item</span>
                                                        <p className="text-[11px] text-[#AEAEAE]">Uncheck if item is exempt from all taxes</p>
                                                    </div>
                                                </label>
                                            </div>

                                            {!formData.taxable && (
                                                <div>
                                                    <FieldLabel>Exemption Reason</FieldLabel>
                                                    <input
                                                        type="text"
                                                        value={formData.exemptionReason}
                                                        onChange={e => updateField('exemptionReason', e.target.value)}
                                                        placeholder="Enter exemption reason"
                                                        className={inputCls}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                </FormSection>

                                <FormSection title="Accounting" icon={<SettingsIcon size={16} />} sectionId="accounting">
                                        
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <FieldLabel>Sales Account</FieldLabel>
                                                <input
                                                    type="text"
                                                    value={formData.account}
                                                    onChange={e => updateField('account', e.target.value)}
                                                    placeholder="Sales account name"
                                                    className={inputCls}
                                                />
                                            </div>
                                            <div>
                                                <FieldLabel>Sales Account Code</FieldLabel>
                                                <input
                                                    type="text"
                                                    value={formData.accountCode}
                                                    onChange={e => updateField('accountCode', e.target.value)}
                                                    placeholder="e.g., 40000"
                                                    className={inputCls}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <FieldLabel>Inventory Account</FieldLabel>
                                                <input
                                                    type="text"
                                                    value={formData.inventoryAccount}
                                                    onChange={e => updateField('inventoryAccount', e.target.value)}
                                                    placeholder="Inventory account name"
                                                    className={inputCls}
                                                />
                                            </div>
                                            <div>
                                                <FieldLabel>Inventory Account Code</FieldLabel>
                                                <input
                                                    type="text"
                                                    value={formData.inventoryAccountCode}
                                                    onChange={e => updateField('inventoryAccountCode', e.target.value)}
                                                    placeholder="e.g., 14000"
                                                    className={inputCls}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#EEEEEE]">
                                            <div>
                                                <FieldLabel>Platform Commission %</FieldLabel>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={formData.platformCommission}
                                                    onChange={e => updateField('platformCommission', e.target.value)}
                                                    placeholder="0.00"
                                                    className={inputCls}
                                                />
                                            </div>
                                        </div>
                                </FormSection>

                                <FormSection title="Inventory" icon={<BarChart3 size={16} />} sectionId="inventory">
                                        
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <FieldLabel>Opening Stock</FieldLabel>
                                                <input
                                                    type="number"
                                                    value={formData.openingStock}
                                                    onChange={e => updateField('openingStock', e.target.value)}
                                                    placeholder="0"
                                                    className={inputCls}
                                                />
                                            </div>
                                            <div>
                                                <FieldLabel>Reorder Point</FieldLabel>
                                                <input
                                                    type="number"
                                                    value={formData.reorderPoint}
                                                    onChange={e => updateField('reorderPoint', e.target.value)}
                                                    placeholder="e.g. 10"
                                                    className={inputCls}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#EEEEEE]">
                                            <div>
                                                <FieldLabel>Valuation Method</FieldLabel>
                                                <select
                                                    value={formData.valuationMethod}
                                                    onChange={e => updateField('valuationMethod', e.target.value)}
                                                    className={selectCls}
                                                >
                                                    <option value="FIFO">First In First Out (FIFO)</option>
                                                    <option value="LIFO">Last In First Out (LIFO)</option>
                                                    <option value="WAC">Weighted Average Cost (WAC)</option>
                                                </select>
                                            </div>
                                            <div className="flex items-center pt-6">
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.trackInventory}
                                                        onChange={(e) => updateField('trackInventory', e.target.checked)}
                                                        className="w-5 h-5 accent-[#299E60]"
                                                    />
                                                    <div>
                                                        <span className="text-[13.5px] font-bold text-[#181725]">Track Inventory</span>
                                                        <p className="text-[11px] text-[#AEAEAE]">Enable stock levels monitoring</p>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                </FormSection>

                                <FormSection title="Packaging & dimensions" icon={<Package size={16} />} sectionId="packaging">
                                        
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <FieldLabel>Pack Size</FieldLabel>
                                                <input
                                                    type="text"
                                                    value={formData.packSize}
                                                    onChange={e => updateField('packSize', e.target.value)}
                                                    className={inputCls}
                                                    placeholder="e.g. 1 kg, 500 ml"
                                                />
                                            </div>
                                            <div>
                                                <FieldLabel>Unit</FieldLabel>
                                                <select
                                                    value={formData.unit}
                                                    onChange={e => updateField('unit', e.target.value)}
                                                    className={selectCls}
                                                >
                                                    <option value="">Select unit</option>
                                                    {UNIT_OPTIONS.map(u => (
                                                        <option key={u} value={u}>{u}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#EEEEEE]">
                                            <div>
                                                <FieldLabel>Package Weight</FieldLabel>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={formData.packageWeight}
                                                    onChange={e => updateField('packageWeight', e.target.value)}
                                                    placeholder="0.00"
                                                    className={inputCls}
                                                />
                                            </div>
                                            <div>
                                                <FieldLabel>Weight Unit</FieldLabel>
                                                <select
                                                    value={formData.weightUnit}
                                                    onChange={e => updateField('weightUnit', e.target.value)}
                                                    className={selectCls}
                                                >
                                                    <option value="kg">kg</option>
                                                    <option value="g">g</option>
                                                    <option value="lbs">lbs</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="space-y-4 pt-4 border-t border-[#EEEEEE]">
                                            <h4 className="text-[14px] font-bold text-[#181725]">Dimensions</h4>
                                            <div className="grid grid-cols-4 gap-4">
                                                <div>
                                                    <FieldLabel>Length</FieldLabel>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={formData.packageLength}
                                                        onChange={e => updateField('packageLength', e.target.value)}
                                                        placeholder="0.00"
                                                        className={inputCls}
                                                    />
                                                </div>
                                                <div>
                                                    <FieldLabel>Width</FieldLabel>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={formData.packageWidth}
                                                        onChange={e => updateField('packageWidth', e.target.value)}
                                                        placeholder="0.00"
                                                        className={inputCls}
                                                    />
                                                </div>
                                                <div>
                                                    <FieldLabel>Height</FieldLabel>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={formData.packageHeight}
                                                        onChange={e => updateField('packageHeight', e.target.value)}
                                                        placeholder="0.00"
                                                        className={inputCls}
                                                    />
                                                </div>
                                                <div>
                                                    <FieldLabel>Dimension Unit</FieldLabel>
                                                    <select
                                                        value={formData.dimensionUnit}
                                                        onChange={e => updateField('dimensionUnit', e.target.value)}
                                                        className={selectCls}
                                                    >
                                                        <option value="cm">cm</option>
                                                        <option value="mm">mm</option>
                                                        <option value="inch">inch</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                </FormSection>

                                <FormSection title="Additional identifiers" icon={<Tag size={16} />} sectionId="identifiers">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <FieldLabel>EAN</FieldLabel>
                                                <input
                                                    type="text"
                                                    value={formData.ean}
                                                    onChange={e => updateField('ean', e.target.value)}
                                                    placeholder="European Article Number"
                                                    className={inputCls}
                                                />
                                            </div>
                                            <div>
                                                <FieldLabel>ISBN</FieldLabel>
                                                <input
                                                    type="text"
                                                    value={formData.isbn}
                                                    onChange={e => updateField('isbn', e.target.value)}
                                                    placeholder="International Standard Book No."
                                                    className={inputCls}
                                                />
                                            </div>
                                            <div>
                                                <FieldLabel>Barcode</FieldLabel>
                                                <input
                                                    type="text"
                                                    value={formData.barcode}
                                                    onChange={e => updateField('barcode', e.target.value)}
                                                    placeholder="e.g. 8901234567890"
                                                    className={inputCls}
                                                />
                                            </div>
                                        </div>
                                </FormSection>

                                <FormSection title="Additional details" icon={<BoxIcon size={16} />} sectionId="details">
                                        <div>
                                            <FieldLabel>Description</FieldLabel>
                                            <textarea
                                                value={formData.description}
                                                onChange={e => updateField('description', e.target.value)}
                                                rows={3}
                                                className={textareaCls}
                                                placeholder="Enter product description"
                                            />
                                        </div>
                                        <MultiImageUpload
                                            values={formData.images.filter(Boolean)}
                                            onChange={(urls) => setFormData(prev => ({ ...prev, images: urls }))}
                                            folder="products"
                                            label="Additional Images"
                                            max={8}
                                        />
                                        <div>
                                            <FieldLabel>Tags</FieldLabel>
                                            <TagInput
                                                tags={formData.tags}
                                                onChange={(tags) => setFormData(prev => ({ ...prev, tags }))}
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <FieldLabel>FSSAI Reference</FieldLabel>
                                                <input
                                                    type="text"
                                                    value={formData.fssaiRef}
                                                    onChange={e => updateField('fssaiRef', e.target.value)}
                                                    placeholder="FSSAI License Ref"
                                                    className={inputCls}
                                                />
                                            </div>
                                            <div>
                                                <FieldLabel>Product Type</FieldLabel>
                                                <select
                                                    value={formData.productType}
                                                    onChange={e => updateField('productType', e.target.value)}
                                                    className={selectCls}
                                                >
                                                    <option value="goods">Goods</option>
                                                    <option value="services">Services</option>
                                                </select>
                                            </div>
                                            <div>
                                                <FieldLabel>Item Type</FieldLabel>
                                                <select
                                                    value={formData.itemType}
                                                    onChange={e => updateField('itemType', e.target.value)}
                                                    className={selectCls}
                                                >
                                                    <option value="standard">Standard</option>
                                                    <option value="variant">Variant</option>
                                                    <option value="kit">Kit</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-[#EEEEEE]">
                                            <div>
                                                <FieldLabel>Source</FieldLabel>
                                                <input type="text" value={formData.source} onChange={e => updateField('source', e.target.value)} placeholder="Data source" className={inputCls} />
                                            </div>
                                            <div>
                                                <FieldLabel>Reference ID</FieldLabel>
                                                <input type="text" value={formData.referenceId} onChange={e => updateField('referenceId', e.target.value)} placeholder="External Ref ID" className={inputCls} />
                                            </div>
                                            <div>
                                                <FieldLabel>Last Sync</FieldLabel>
                                                <input type="text" value={formData.lastSync} onChange={e => updateField('lastSync', e.target.value)} placeholder="e.g. 2026-06-29" className={inputCls} />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input type="checkbox" checked={formData.sellable} onChange={(e) => updateField('sellable', e.target.checked)} className="w-5 h-5 accent-[#299E60]" />
                                                <span className="text-[13px] font-bold text-[#181725]">Sellable</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input type="checkbox" checked={formData.purchasable} onChange={(e) => updateField('purchasable', e.target.checked)} className="w-5 h-5 accent-[#299E60]" />
                                                <span className="text-[13px] font-bold text-[#181725]">Purchasable</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input type="checkbox" checked={formData.isFeatured} onChange={(e) => updateField('isFeatured', e.target.checked)} className="w-5 h-5 accent-[#F59E0B]" />
                                                <span className="text-[13px] font-bold text-[#181725]">Featured</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input type="checkbox" checked={formData.creditEligible} onChange={(e) => updateField('creditEligible', e.target.checked)} className="w-5 h-5 accent-[#7B1FA2]" />
                                                <span>
                                                    <span className="block text-[13px] font-bold text-[#181725]">DiSCCO credit</span>
                                                    <span className="block text-[11px] text-[#AEAEAE] font-medium">Pay later on credit line</span>
                                                </span>
                                            </label>
                                        </div>
                                </FormSection>

                                <FormSection title="Bulk pricing tiers" icon={<Tag size={16} />} sectionId="bulk">
                                        <div className="flex items-start justify-between gap-4 mb-2">
                                            <p className="text-[12px] text-[#AEAEAE] font-medium">
                                                Each tier applies from its min quantity. Up to 3 tiers (taxable rate, ex-GST).
                                            </p>
                                            {formData.priceSlabs.length < 3 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({
                                                        ...prev,
                                                        priceSlabs: [...prev.priceSlabs, { minQty: '', price: '' }],
                                                    }))}
                                                    className="h-[40px] px-5 bg-[#1a365d] text-white rounded-[10px] text-[13px] font-bold hover:bg-[#1a365d]/90 transition-colors flex items-center gap-2 shrink-0"
                                                >
                                                    <Plus size={14} />
                                                    Add Bulk Tier
                                                </button>
                                            )}
                                        </div>

                                        <div className="space-y-4">
                                            {formData.priceSlabs.map((slab, index) => (
                                                <div key={index} className="rounded-[14px] border border-[#EEEEEE] overflow-hidden">
                                                    <div className="flex items-center justify-between px-5 py-3 bg-[#FAFAFA] border-b border-[#EEEEEE]">
                                                        <div className="flex items-center gap-2.5">
                                                            <span className="w-[28px] h-[28px] rounded-full bg-[#299E60] text-white text-[12px] font-bold flex items-center justify-center">
                                                                {index + 1}
                                                            </span>
                                                            <h4 className="text-[14px] font-bold text-[#181725]">Bulk Tier {index + 1}</h4>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData(prev => ({
                                                                ...prev,
                                                                priceSlabs: prev.priceSlabs.filter((_, idx) => idx !== index),
                                                            }))}
                                                            className="p-1.5 hover:bg-[#FFF0F0] rounded-[6px] transition-colors text-[#AEAEAE] hover:text-[#E74C3C]"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>

                                                    <div className="p-5">
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div>
                                                                <FieldLabel>Min Quantity</FieldLabel>
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    value={slab.minQty}
                                                                    onChange={e => setFormData(prev => ({
                                                                        ...prev,
                                                                        priceSlabs: prev.priceSlabs.map((s, idx) => idx === index ? { ...s, minQty: e.target.value } : s),
                                                                    }))}
                                                                    className={inputCls}
                                                                    placeholder="e.g. 10"
                                                                />
                                                            </div>
                                                            <div>
                                                                <FieldLabel required>Taxable Rate (per Unit)</FieldLabel>
                                                                <div className="relative">
                                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE] text-[14px]">{'\u20B9'}</span>
                                                                    <input
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0"
                                                                        value={slab.price}
                                                                        onChange={e => setFormData(prev => ({
                                                                            ...prev,
                                                                            priceSlabs: prev.priceSlabs.map((s, idx) => idx === index ? { ...s, price: e.target.value } : s),
                                                                        }))}
                                                                        className={cn(inputCls, 'pl-8')}
                                                                        placeholder="0.00"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}

                                            {formData.priceSlabs.length === 0 && (
                                                <div className="text-center py-8 text-[#AEAEAE]">
                                                    <BarChart3 size={32} className="mx-auto mb-2 text-[#E5E7EB]" />
                                                    <p className="text-[13px] font-medium">No bulk tiers yet. Click &quot;Add Bulk Tier&quot; to add quantity-based pricing.</p>
                                                </div>
                                            )}
                                        </div>
                                </FormSection>
                            </>
                        )}
                    </div>
                </div>

                {/* Panel Footer */}
                <div className="px-4 lg:px-6 py-4 border-t border-[#EEEEEE] shrink-0 flex items-center gap-3">
                    <button
                        onClick={requestClosePanel}
                        className="flex-1 h-[48px] bg-[#F8F9FB] border border-[#EEEEEE] text-[#181725] rounded-[12px] text-[14px] font-bold hover:bg-[#EEEEEE] transition-all"
                    >
                        Cancel
                    </button>
                    {perms.canWriteProducts && (
                        <button
                            type="button"
                            onClick={() => void handleSaveDraft()}
                            disabled={draftSaving || saving}
                            className="flex-1 h-[48px] bg-[#FFCF4D] border border-[#E6B800] text-[#4A3800] rounded-[12px] text-[14px] font-bold hover:bg-[#F5C542] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                            {draftSaving && <Loader2 size={16} className="animate-spin" />}
                            Save as Draft
                        </button>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={saving || draftSaving}
                        className="flex-1 h-[48px] bg-[#299E60] text-white rounded-[12px] text-[14px] font-bold hover:bg-[#238a54] transition-all flex items-center justify-center gap-2 shadow-sm shadow-[#299E60]/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {saving && <Loader2 size={16} className="animate-spin" />}
                        {editingProduct?.listingStatus === 'draft'
                            ? 'Publish'
                            : editingProduct
                                ? 'Update Product'
                                : 'Create Product'}
                    </button>
                </div>
            </div>

            {/* Unsaved changes confirmation */}
            {showCloseConfirm && (
                <>
                    <div className="fixed inset-0 bg-black/40 z-[80]" onClick={() => setShowCloseConfirm(false)} />
                    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                        <div className="bg-white rounded-[16px] shadow-xl max-w-[420px] w-full p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-[40px] h-[40px] rounded-full bg-[#FFF7E6] flex items-center justify-center shrink-0">
                                    <AlertCircle size={20} className="text-[#F59E0B]" />
                                </div>
                                <h3 className="text-[18px] font-bold text-[#181725]">Unsaved changes</h3>
                            </div>
                            <p className="text-[14px] text-[#7C7C7C] mb-6">
                                {canAutosaveDraft()
                                    ? 'You have unsaved changes. Changes are saved as draft automatically — save draft and close, or discard them.'
                                    : 'You have changes that haven\'t been saved yet. Discard them and close the form?'}
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowCloseConfirm(false)}
                                    className="flex-1 h-[44px] border border-[#EEEEEE] rounded-[10px] text-[14px] font-bold text-[#181725] hover:bg-[#F8F9FB] transition-colors"
                                >
                                    Keep editing
                                </button>
                                {canAutosaveDraft() && (
                                    <button
                                        type="button"
                                        onClick={() => void (async () => {
                                            await flushDraftAutosave();
                                            closePanelImmediate();
                                        })()}
                                        className="flex-1 h-[44px] bg-[#FFCF4D] border border-[#E6B800] text-[#4A3800] rounded-[10px] text-[14px] font-bold hover:bg-[#F5C542] transition-colors"
                                    >
                                        Save draft &amp; close
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={closePanelImmediate}
                                    className="flex-1 h-[44px] bg-[#E74C3C] text-white rounded-[10px] text-[14px] font-bold hover:bg-[#d44234] transition-colors"
                                >
                                    Discard
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ============================================================= */}
            {/* Import Modal                                                    */}
            {/* ============================================================= */}
            <ProductImportModal
                open={importOpen}
                onClose={() => setImportOpen(false)}
                vendors={vendors}
                onComplete={handleImportComplete}
            />

            <VendorBulkGrid
                open={gridOpen}
                onClose={() => setGridOpen(false)}
                products={gridProducts}
                onComplete={() => { void refreshGridListings(); handleImportComplete(); }}
                categories={categories}
                brands={brands}
                patchUrl={(id: string) => `/api/v1/admin/products/${id}`}
                readOnlyCommission={false}
                isAdmin
            />

            <AdminBulkEngine
                open={bulkOpen}
                onClose={() => setBulkOpen(false)}
                products={products}
                selectedIds={Array.from(selectedIds)}
                vendors={vendors}
                onComplete={() => { void fetchProducts(); setSelectedIds(new Set()); }}
            />


            {/* Floating selection action bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[55] flex items-center gap-3 bg-[#181725] text-white rounded-[14px] shadow-2xl px-5 py-3 animate-in slide-in-from-bottom-4 duration-200">
                    <span className="text-[13px] font-bold">{selectedIds.size} selected</span>
                    {perms.canWriteProducts && (
                        <button
                            type="button"
                            onClick={() => setBulkOpen(true)}
                            className="h-[36px] px-4 bg-[#299E60] hover:bg-[#238a54] rounded-[10px] text-[13px] font-bold flex items-center gap-1.5 transition-colors"
                        >
                            <Wand2 size={14} /> Bulk edit
                        </button>
                    )}
                    <button
                        onClick={() => setShowBulkDeleteModal(true)}
                        className="h-[36px] px-4 bg-[#E74C3C] hover:bg-[#cf4436] rounded-[10px] text-[13px] font-bold flex items-center gap-1.5 transition-colors"
                    >
                        <Trash2 size={14} /> Delete
                    </button>
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="h-[36px] px-3 text-[13px] font-bold text-[#AEAEAE] hover:text-white transition-colors"
                    >
                        Clear
                    </button>
                </div>
            )}

            {/* ============================================================= */}
            {/* Delete Confirmation Modal                                       */}
            {/* ============================================================= */}
            {deleteTarget && (
                <>
                    <div
                        className="fixed inset-0 bg-black/40 z-[80] animate-in fade-in duration-200"
                        onClick={() => !deleting && setDeleteTarget(null)}
                    />
                    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                        <div
                            className="bg-white rounded-[20px] border border-[#EEEEEE] shadow-2xl w-full max-w-[440px] p-8 animate-in zoom-in-95 duration-200"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex flex-col items-center text-center gap-4">
                                <div className="w-[56px] h-[56px] bg-[#FFF0F0] rounded-[16px] flex items-center justify-center text-[#E74C3C]">
                                    <AlertTriangle size={28} />
                                </div>
                                <h3 className="text-[20px] font-[900] text-[#181725]">Delete Product</h3>
                                <p className="text-[14px] text-[#7C7C7C] font-medium leading-relaxed">
                                    Are you sure you want to delete <strong className="text-[#181725]">{deleteTarget.name}</strong>?
                                    This action cannot be undone.
                                </p>
                                <div className="flex items-center gap-4 w-full mt-2">
                                    <button
                                        onClick={() => setDeleteTarget(null)}
                                        disabled={deleting}
                                        className="flex-1 h-[48px] bg-[#F8F9FB] border border-[#EEEEEE] text-[#181725] rounded-[12px] text-[14px] font-bold hover:bg-[#EEEEEE] transition-all disabled:opacity-60"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleDelete}
                                        disabled={deleting}
                                        className="flex-1 h-[48px] bg-[#E74C3C] text-white rounded-[12px] text-[14px] font-bold hover:bg-[#cf4436] transition-all flex items-center justify-center gap-2 shadow-sm shadow-[#E74C3C]/20 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {deleting && <Loader2 size={16} className="animate-spin" />}
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Bulk Delete Confirmation Modal */}
            {showBulkDeleteModal && (
                <>
                    <div
                        className="fixed inset-0 bg-black/40 z-[80] animate-in fade-in duration-200"
                        onClick={() => !bulkDeleting && setShowBulkDeleteModal(false)}
                    />
                    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                        <div
                            className="bg-white rounded-[20px] border border-[#EEEEEE] shadow-2xl w-full max-w-[440px] p-8 animate-in zoom-in-95 duration-200"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex flex-col items-center text-center gap-4">
                                <div className="w-[56px] h-[56px] bg-[#FFF0F0] rounded-[16px] flex items-center justify-center text-[#E74C3C]">
                                    <AlertTriangle size={28} />
                                </div>
                                <h3 className="text-[20px] font-[900] text-[#181725]">Delete {selectedIds.size} Products?</h3>
                                <p className="text-[14px] text-[#7C7C7C] font-medium leading-relaxed">
                                    Are you sure you want to delete the <strong className="text-[#181725]">{selectedIds.size}</strong> selected products?
                                    This action cannot be undone.
                                </p>
                                <div className="flex items-center gap-4 w-full mt-2">
                                    <button
                                        onClick={() => setShowBulkDeleteModal(false)}
                                        disabled={bulkDeleting}
                                        className="flex-1 h-[48px] bg-[#F8F9FB] border border-[#EEEEEE] text-[#181725] rounded-[12px] text-[14px] font-bold hover:bg-[#EEEEEE] transition-all disabled:opacity-60"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleBulkDelete}
                                        disabled={bulkDeleting}
                                        className="flex-1 h-[48px] bg-[#E74C3C] text-white rounded-[12px] text-[14px] font-bold hover:bg-[#cf4436] transition-all flex items-center justify-center gap-2 shadow-sm shadow-[#E74C3C]/20 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {bulkDeleting && <Loader2 size={16} className="animate-spin" />}
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
