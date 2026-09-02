'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    Search, Plus, Loader2, Package, Pencil, X,
    ChevronRight, ChevronLeft, Info, ImageIcon, Settings as SettingsIcon, Trash2,
    BarChart3, BoxIcon, Tag, IndianRupee, Star, Wand2,
    ChevronDown, FileSpreadsheet, AlertCircle, Clock, Unlink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseVendorSku, resolveVendorCode } from '@/lib/sku';
import {
    UNIT_OPTIONS,
    WEIGHT_UNIT_OPTIONS,
    DIMENSION_UNIT_OPTIONS,
} from '@/lib/productUnits';
import { toast } from 'sonner';
import { ProductEssentialsFields } from '@/components/features/shared/productForm/ProductEssentialsFields';
import VendorProductImportModal from '@/components/features/vendor/VendorProductImportModal';
import VendorPriceReplaceModal from '@/components/features/vendor/VendorPriceReplaceModal';
import VendorBulkEngine from '@/components/features/vendor/VendorBulkEngine';
import VendorBulkGrid from '@/components/features/vendor/VendorBulkGrid';
import FormSection, {
    FieldLabel,
    productFormInputCls,
    productFormSelectCls,
    productFormTextareaCls,
} from '@/components/features/shared/FormSection';
import {
    validateProductEssentials,
    focusFirstProductFormError,
    type ProductValidationField,
} from '@/components/features/shared/productFormValidation';
import { brandOverrideDeviations } from '@/lib/brandOverrideFields';
import {
    ProductCreatePreviewPanel,
    type ProductPreviewChecklist,
    type ProductPreviewFormState,
} from '@/components/features/vendor/ProductCreatePreviewPanel';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BrandMappingSummary {
    id: string;
    status: string;
    brandMasterProductId?: string;
    brandMasterProduct?: {
        id?: string;
        name: string;
        imageUrl: string | null;
        images?: string[] | null;
        packSize?: string | null;
        unit?: string | null;
        description?: string | null;
        sku?: string | null;
        hsn?: string | null;
        barcode?: string | null;
        fssaiRef?: string | null;
        vegNonVeg?: 'veg' | 'nonveg' | 'egg' | null;
        storageType?: string | null;
        shelfLifeDays?: number | null;
        countryOfOrigin?: string | null;
        tags?: string[] | null;
        aliasNames?: string[] | null;
        netWeight?: number | string | null;
        netWeightUnit?: string | null;
        packageWeight?: number | string | null;
        weightUnit?: string | null;
        packageLength?: number | string | null;
        packageWidth?: number | string | null;
        packageHeight?: number | string | null;
        dimensionUnit?: string | null;
        categoryId?: string | null;
        categoryIds?: string[] | null;
        categoryRel?: { id?: string; name: string; slug: string } | null;
        brand?: { name: string; slug: string } | null;
    } | null;
}

interface VendorProduct {
    id: string;
    name: string;
    slug: string;
    basePrice: number;
    originalPrice?: number;
    packSize: string | null;
    unit: string | null;
    imageUrl: string | null;
    isActive: boolean;
    isFeatured: boolean;
    description: string | null;
    creditEligible: boolean;
    categoryName: string;
    categorySlug: string;
    in_stock: boolean;
    qty_available: number;
    sku?: string | null;
    hsn?: string | null;
    brand?: string | null;
    barcode?: string | null;
    vendorSku?: string | null;
    aliasNames?: string[];
    countryOfOrigin?: string | null;
    shelfLifeDays?: number | null;
    fssaiRef?: string | null;
    substituteIds?: string[];
    taxPercent?: number | null;
    minOrderQty?: number | null;
    tags?: string[] | null;
    images?: string[] | null;
    category?: { id?: string; name: string; slug: string } | null;
    inventory?: { qtyAvailable: number; qtyReserved: number } | null;
    priceSlabs?: { minQty: number; maxQty?: number | null; price: number }[];
    approvalStatus?: 'pending' | 'approved' | 'rejected' | 'pending_edit';
    approvalNote?: string | null;
    /** Queued material edit (image) awaiting admin review — live fields stay unchanged until approve. */
    pendingEditPayload?: Record<string, unknown> | null;
    listingStatus?: 'draft' | 'submitted';
    vegNonVeg?: 'veg' | 'nonveg' | 'egg' | null;
    storageType?: string | null;
    metadata?: any;
    /** Live verified/auto_mapped brand overlay (list API via productBrandMappingsInclude). */
    brandMappings?: BrandMappingSummary[];
}

interface Category {
    id: string;
    name: string;
    slug: string;
    parentId?: string | null; // null = top-level Category; set = Sub-Category (rendered with leading "— ")
    children?: Category[];    // nested sub-categories returned by /api/v1/categories
}

interface BrandOption {
    id: string;
    name: string;
}

interface PriceSlabRow {
    minQty: string;
    price: string;
}

interface ProductForm {
    name: string;
    slug: string;
    // Multi-category — vendor picks 1..N category IDs. First entry becomes the
    // primary on the server (mirrored into Product.categoryId). Empty is allowed.
    categoryIds: string[];
    basePrice: string;
    originalPrice: string;
    packSize: string;
    unit: string;
    sku: string;
    catalogSku: string;
    vendorSku: string;
    hsn: string;
    brand: string;
    barcode: string;
    description: string;
    imageUrl: string;
    images: string[];
    tags: string[];
    aliasNames: string[];
    vegNonVeg: '' | 'veg' | 'nonveg' | 'egg';
    storageType: string;
    shelfLifeDays: string;
    countryOfOrigin: string;
    taxPercent: string;
    minOrderQty: string;
    creditEligible: boolean;
    isFeatured: boolean;
    fssaiRef: string;
    substituteIds: string[];
    priceSlabs: PriceSlabRow[];
    // Zoho Metadata
    account: string;
    accountCode: string;
    taxable: boolean;
    exemptionReason: string;
    taxabilityType: string;
    productType: string;
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
    platformCommission: string;
    itemStatus: string;
    activeOnlineStore: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EMPTY_FORM: ProductForm = {
    name: '',
    slug: '',
    categoryIds: [],
    basePrice: '',
    originalPrice: '',
    packSize: '',
    unit: '',
    sku: '',
    catalogSku: '',
    vendorSku: '',
    hsn: '',
    brand: '',
    barcode: '',
    description: '',
    imageUrl: '',
    images: [],
    tags: [],
    aliasNames: [],
    vegNonVeg: '',
    storageType: '',
    shelfLifeDays: '',
    countryOfOrigin: '',
    taxPercent: '0',
    minOrderQty: '1',
    creditEligible: true,
    isFeatured: false,
    fssaiRef: '',
    substituteIds: [],
    priceSlabs: [],
    account: '',
    accountCode: '',
    taxable: true,
    exemptionReason: '',
    taxabilityType: 'taxable',
    productType: 'goods',
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
    platformCommission: '',
    itemStatus: 'Active',
    activeOnlineStore: true,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Gross = taxable * (1 + tax/100)
function calcGrossRate(taxableRate: string, taxPercent: string): string {
    const t = parseFloat(taxableRate);
    const tp = parseFloat(taxPercent);
    if (isNaN(t) || isNaN(tp) || tp < 0) return '';
    return (t * (1 + tp / 100)).toFixed(2);
}

// Taxable = gross / (1 + tax/100)
function calcTaxableFromGross(grossRate: string, taxPercent: string): string {
    const g = parseFloat(grossRate);
    const tp = parseFloat(taxPercent);
    if (isNaN(g) || isNaN(tp) || tp < 0) return '';
    if (tp === 0) return g.toFixed(2);
    return (g / (1 + tp / 100)).toFixed(2);
}

function calcTaxAmount(taxableRate: string, taxPercent: string): string {
    const t = parseFloat(taxableRate);
    const tp = parseFloat(taxPercent);
    if (isNaN(t) || isNaN(tp) || tp <= 0) return '0.00';
    return (t * tp / 100).toFixed(2);
}

function calcSavingsPercent(base: string, original: string): number | null {
    const b = parseFloat(base);
    const o = parseFloat(original);
    if (isNaN(b) || isNaN(o) || o <= b) return null;
    return Math.round(((o - b) / o) * 100);
}

/** Coerce Prisma Decimal / number / non-empty string into a form string. */
function brandScalarToFormString(value: unknown): string {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
}

function brandStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
}

/** Map free-text brand unit onto the vendor UNIT_OPTIONS dropdown when possible. */
function matchUnitOption(unit: string | null | undefined): string {
    if (!unit?.trim()) return '';
    const trimmed = unit.trim();
    const hit = UNIT_OPTIONS.find((u) => u.toLowerCase() === trimmed.toLowerCase());
    return hit ?? trimmed;
}

function matchWeightUnitOption(unit: string | null | undefined): string {
    if (!unit?.trim()) return '';
    const trimmed = unit.trim();
    const hit = WEIGHT_UNIT_OPTIONS.find((u) => u.toLowerCase() === trimmed.toLowerCase());
    return hit ?? trimmed;
}

function matchDimensionUnitOption(unit: string | null | undefined): string {
    if (!unit?.trim()) return '';
    const trimmed = unit.trim();
    const hit = DIMENSION_UNIT_OPTIONS.find((u) => u.toLowerCase() === trimmed.toLowerCase());
    return hit ?? trimmed;
}

/** Prefill overridable form fields from a live brand master when brand values are non-empty. */
function applyBrandMasterOverride(
    formPayload: ProductForm,
    bmp: BrandMappingSummary['brandMasterProduct'] | null | undefined,
): ProductForm {
    if (!bmp) return formPayload;
    const masterImageList = Array.isArray(bmp.images)
        ? bmp.images.filter((u): u is string => typeof u === 'string' && u.length > 0)
        : [];
    const masterImageUrl =
        typeof bmp.imageUrl === 'string' && bmp.imageUrl.trim() ? bmp.imageUrl.trim() : '';
    const brandImages =
        masterImageList.length > 0 ? masterImageList : masterImageUrl ? [masterImageUrl] : [];
    const masterName = typeof bmp.name === 'string' ? bmp.name.trim() : '';
    const masterDescription =
        typeof bmp.description === 'string' ? bmp.description.trim() : '';
    const masterPackSize = typeof bmp.packSize === 'string' ? bmp.packSize.trim() : '';
    const masterUnit = typeof bmp.unit === 'string' ? bmp.unit.trim() : '';
    const masterBrand =
        typeof bmp.brand?.name === 'string' ? bmp.brand.name.trim() : '';
    const brandMultiCategoryIds =
        Array.isArray(bmp.categoryIds) && bmp.categoryIds.length > 0
            ? bmp.categoryIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
            : [];
    const brandPrimaryCategoryId =
        typeof bmp.categoryId === 'string' && bmp.categoryId
            ? bmp.categoryId
            : typeof bmp.categoryRel?.id === 'string' && bmp.categoryRel.id
                ? bmp.categoryRel.id
                : null;
    const masterSku = brandScalarToFormString(bmp.sku);
    const masterHsn = brandScalarToFormString(bmp.hsn);
    const masterBarcode = brandScalarToFormString(bmp.barcode);
    const masterFssaiRef = brandScalarToFormString(bmp.fssaiRef);
    const masterStorageType = brandScalarToFormString(bmp.storageType);
    const masterCountryOfOrigin = brandScalarToFormString(bmp.countryOfOrigin);
    const masterShelfLifeDays =
        bmp.shelfLifeDays != null && Number.isFinite(Number(bmp.shelfLifeDays))
            ? String(bmp.shelfLifeDays)
            : '';
    const masterVegNonVeg =
        bmp.vegNonVeg === 'veg' || bmp.vegNonVeg === 'nonveg' || bmp.vegNonVeg === 'egg'
            ? bmp.vegNonVeg
            : '';
    const masterTags = brandStringList(bmp.tags);
    const masterAliasNames = brandStringList(bmp.aliasNames);
    const masterPackageWeight = brandScalarToFormString(bmp.packageWeight);
    const masterWeightUnit = brandScalarToFormString(bmp.weightUnit);
    const masterPackageLength = brandScalarToFormString(bmp.packageLength);
    const masterPackageWidth = brandScalarToFormString(bmp.packageWidth);
    const masterPackageHeight = brandScalarToFormString(bmp.packageHeight);
    const masterDimensionUnit = brandScalarToFormString(bmp.dimensionUnit);

    return {
        ...formPayload,
        name: masterName || formPayload.name,
        description: masterDescription || formPayload.description,
        packSize: masterPackSize || formPayload.packSize,
        unit: masterUnit || formPayload.unit,
        brand: masterBrand || formPayload.brand,
        imageUrl: brandImages[0] || formPayload.imageUrl,
        images: brandImages.length > 0 ? brandImages : formPayload.images,
        // Prefer brand multi-set; never collapse a product multi-set to a single categoryRel.
        categoryIds:
            brandMultiCategoryIds.length > 0
                ? brandMultiCategoryIds
                : formPayload.categoryIds.length > 0
                    ? formPayload.categoryIds
                    : brandPrimaryCategoryId
                        ? [brandPrimaryCategoryId]
                        : formPayload.categoryIds,
        catalogSku: masterSku || formPayload.catalogSku,
        hsn: masterHsn || formPayload.hsn,
        barcode: masterBarcode || formPayload.barcode,
        fssaiRef: masterFssaiRef || formPayload.fssaiRef,
        vegNonVeg: masterVegNonVeg || formPayload.vegNonVeg,
        storageType: masterStorageType || formPayload.storageType,
        shelfLifeDays: masterShelfLifeDays || formPayload.shelfLifeDays,
        countryOfOrigin: masterCountryOfOrigin || formPayload.countryOfOrigin,
        tags: masterTags.length > 0 ? masterTags : formPayload.tags,
        aliasNames: masterAliasNames.length > 0 ? masterAliasNames : formPayload.aliasNames,
        packageWeight: masterPackageWeight || formPayload.packageWeight,
        weightUnit: masterWeightUnit || formPayload.weightUnit,
        packageLength: masterPackageLength || formPayload.packageLength,
        packageWidth: masterPackageWidth || formPayload.packageWidth,
        packageHeight: masterPackageHeight || formPayload.packageHeight,
        dimensionUnit: masterDimensionUnit || formPayload.dimensionUnit,
    };
}

type FormSnapshotMeta = {
    masterProductId: string | null;
    basedOnProductId: string | null;
    basedOnBrandMasterProductId: string | null;
};

function serializeFormSnapshot(form: ProductForm, meta: FormSnapshotMeta): string {
    return JSON.stringify({ form, ...meta });
}

function sameImageList(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
}

function logisticsFieldsFromListProduct(product: VendorProduct) {
    return {
        countryOfOrigin: product.countryOfOrigin ?? '',
        shelfLifeDays: product.shelfLifeDays != null ? String(product.shelfLifeDays) : '',
        vegNonVeg: (product.vegNonVeg || '') as '' | 'veg' | 'nonveg' | 'egg',
        storageType: product.storageType || '',
        minOrderQty: product.minOrderQty != null ? String(product.minOrderQty) : '1',
        vendorSku: product.vendorSku?.trim() ?? '',
    };
}

const DRAFT_AUTOSAVE_MS = 2000;

/* ------------------------------------------------------------------ */
/*  Pagination helper                                                  */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Reusable small components                                          */
/* ------------------------------------------------------------------ */

const inputCls = productFormInputCls;
const selectCls = productFormSelectCls;
const textareaCls = productFormTextareaCls;

/* ------------------------------------------------------------------ */
/*  Tag Input                                                          */
/* ------------------------------------------------------------------ */

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
                    <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#EEF8F1] text-primary text-[12px] font-bold rounded-[8px]">
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
    products: VendorProduct[];
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
                <div className="border border-[#EEEEEE] rounded-[10px] overflow-hidden">
                    {candidates.map(p => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => add(p.id)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#F5F5F5] text-left transition-colors border-b border-[#F5F5F5] last:border-0"
                        >
                            <Package size={14} className="text-[#AEAEAE] shrink-0" />
                            <span className="text-[13px] text-[#181725] truncate">{p.name}</span>
                            {p.packSize && <span className="text-[11px] text-[#AEAEAE] ml-auto shrink-0">{p.packSize}</span>}
                        </button>
                    ))}
                </div>
            )}
            {query.length > 0 && candidates.length === 0 && (
                <p className="text-[12px] text-[#AEAEAE] py-2">No matching products found</p>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

interface ProductSuggestion {
    id: string;
    name: string;
    slug: string;
    basePrice: number;
    originalPrice?: number | null;
    packSize?: string | null;
    unit?: string | null;
    sku?: string | null;
    hsn?: string | null;
    brand?: string | null;
    barcode?: string | null;
    description?: string | null;
    imageUrl?: string | null;
    images?: string[] | null;
    tags?: string[] | null;
    taxPercent?: number | null;
    minOrderQty?: number | null;
    creditEligible?: boolean;
    category?: { id: string; name: string; slug: string } | null;
    categoryIds?: string[];
    vendor?: { businessName: string } | null;
}

/** Shape returned by GET /api/v1/brand-master-products */
interface BrandMasterSuggestion {
    id: string;
    name: string;
    description?: string | null;
    packSize?: string | null;
    unit?: string | null;
    sku?: string | null;
    imageUrl?: string | null;
    images?: string[] | null;
    category?: string | null;
    hsn?: string | null;
    barcode?: string | null;
    fssaiRef?: string | null;
    vegNonVeg?: 'veg' | 'nonveg' | 'egg' | null;
    storageType?: string | null;
    shelfLifeDays?: number | null;
    countryOfOrigin?: string | null;
    tags?: string[] | null;
    aliasNames?: string[] | null;
    netWeight?: number | string | null;
    netWeightUnit?: string | null;
    packageWeight?: number | string | null;
    weightUnit?: string | null;
    packageLength?: number | string | null;
    packageWidth?: number | string | null;
    packageHeight?: number | string | null;
    dimensionUnit?: string | null;
    categoryId?: string | null;
    categoryIds?: string[] | null;
    categoryRel?: { id: string; name: string } | null;
    brand?: { id: string; name: string; slug: string; logoUrl?: string | null } | null;
}

export default function VendorProductsPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const deepLinkHandled = useRef(false);
    const [products, setProducts] = useState<VendorProduct[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [brands, setBrands] = useState<BrandOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'featured' | 'drafts'>('all');
    const [approvalFilter, setApprovalFilter] = useState<'all' | 'pending' | 'rejected' | 'approved'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<VendorProduct | null>(null);
    const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [loadingProduct, setLoadingProduct] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    // Product suggestion state
    const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
    const [ownMatches, setOwnMatches] = useState<{ id: string; name: string; approvalStatus: string; isActive: boolean }[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [basedOnProductId, setBasedOnProductId] = useState<string | null>(null);
    const [masterProductId, setMasterProductId] = useState<string | null>(null);
    const [basedOnBrandMasterProductId, setBasedOnBrandMasterProductId] = useState<string | null>(null);
    const [catalogSearch, setCatalogSearch] = useState('');
    const [noCatalogMatch, setNoCatalogMatch] = useState(false);
    const [masterSuggestions, setMasterSuggestions] = useState<Array<{
        id: string; sku: string; name: string; brand: string | null; imageUrl: string | null;
        category: { id: string; name: string } | null;
        categoryIds?: string[];
        categoryLeafMissing?: boolean;
        uom: string | null;
        taxPercent?: number | string;
        images?: string[];
    }>>([]);
    const [brandSuggestions, setBrandSuggestions] = useState<BrandMasterSuggestion[]>([]);
    const [categoryPickerKey, setCategoryPickerKey] = useState(0);
    const [brandSuggesting, setBrandSuggesting] = useState(false);
    const suggestionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    // Delete state
    const [deleteTarget, setDeleteTarget] = useState<VendorProduct | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Bulk Update — in-browser grid (primary) + Advanced engine drawer + row selection
    const [bulkOpen, setBulkOpen] = useState(false);
    const [gridOpen, setGridOpen] = useState(false);
    const [bulkEngineIds, setBulkEngineIds] = useState<string[] | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Bulk import
    const [showBulkImport, setShowBulkImport] = useState(false);
    const [showPriceReplace, setShowPriceReplace] = useState(false);
    const [brandFilter, setBrandFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [importRows, setImportRows] = useState<Array<{ name: string; sku: string; basePrice: number; packSize?: string; unit?: string; error?: string }>>([]);
    const [importSaving, setImportSaving] = useState(false);
    const importFileRef = useRef<HTMLInputElement>(null);

    const [vendorCodePreview, setVendorCodePreview] = useState('');

    // Draft autosave + unsaved-changes guard
    const [draftSaving, setDraftSaving] = useState(false);
    const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
    const [auditLogs, setAuditLogs] = useState<Array<{
        field: string;
        oldValue: string | null;
        newValue: string | null;
        changedAt: string;
        source: string;
        priceListName?: string | null;
        actorName?: string | null;
    }>>([]);
    const [lastSavedSnapshot, setLastSavedSnapshot] = useState('');
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    /** Brand master used for client-side override deviation checks (mirrors overlay source). */
    const [editBrandMasterProduct, setEditBrandMasterProduct] = useState<
        BrandMappingSummary['brandMasterProduct'] | null
    >(null);
    const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
    /** Post-overlay image baseline for dirty checks (brand overlay can differ from stored Product). */
    const loadedImagesRef = useRef<{ imageUrl: string; images: string[] }>({
        imageUrl: '',
        images: [],
    });
    const draftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const skipDraftAutosaveRef = useRef(false);
    const draftSlugRef = useRef<string | null>(null);
    const [draftSavedOnce, setDraftSavedOnce] = useState(false);

    const captureSnapshot = useCallback(
        () => serializeFormSnapshot(form, { masterProductId, basedOnProductId, basedOnBrandMasterProductId }),
        [form, masterProductId, basedOnProductId, basedOnBrandMasterProductId]
    );

    const isFormDirty = useCallback(() => {
        const current = captureSnapshot();
        const baseline =
            lastSavedSnapshot !== ''
                ? lastSavedSnapshot
                : serializeFormSnapshot(EMPTY_FORM, {
                    masterProductId: null,
                    basedOnProductId: null,
                    basedOnBrandMasterProductId: null,
                });
        return current !== baseline;
    }, [captureSnapshot, lastSavedSnapshot]);

    const syncSavedSnapshot = useCallback((snapshot?: string) => {
        setLastSavedSnapshot(snapshot ?? captureSnapshot());
    }, [captureSnapshot]);

    const canAutosaveDraft = useCallback(() => {
        if (!isPanelOpen || loadingProduct || saving || draftSaving) return false;
        if (editingProduct?.listingStatus === 'submitted') return false;
        // Never autosave placeholder drafts — require a real product name.
        return form.name.trim().length > 0;
    }, [isPanelOpen, loadingProduct, saving, draftSaving, editingProduct?.listingStatus, form.name]);

    const isFormEffectivelyEmpty = useCallback(() => {
        return (
            serializeFormSnapshot(form, { masterProductId, basedOnProductId, basedOnBrandMasterProductId }) ===
            serializeFormSnapshot(EMPTY_FORM, {
                masterProductId: null,
                basedOnProductId: null,
                basedOnBrandMasterProductId: null,
            })
        );
    }, [form, masterProductId, basedOnProductId, basedOnBrandMasterProductId]);

    const previewFormState = useMemo((): ProductPreviewFormState => {
        const slabs = form.priceSlabs
            .map((s) => ({
                minQty: parseInt(s.minQty, 10),
                price: parseFloat(s.price),
            }))
            .filter((s) => Number.isFinite(s.minQty) && s.minQty > 0 && Number.isFinite(s.price) && s.price > 0);
        return {
            name: form.name,
            brandName: form.brand || undefined,
            imageUrl: form.imageUrl || form.images[0] || undefined,
            sellingPrice: parseFloat(form.basePrice) || 0,
            mrp: parseFloat(form.originalPrice) || undefined,
            unit: form.unit || 'Pc',
            bulkEnabled: slabs.length > 0,
            priceSlabs: slabs,
            creditEligible: form.creditEligible,
        };
    }, [form]);

    const previewChecklist = useMemo((): ProductPreviewChecklist[] => {
        const hasSlabs = form.priceSlabs.some((s) => s.minQty.trim() && s.price.trim());
        return [
            { id: 'name', label: 'Product name', done: form.name.trim().length > 0, required: true },
            { id: 'category', label: 'Category', done: form.categoryIds.length > 0, required: true },
            {
                id: 'price',
                label: 'Selling price',
                done: !!form.basePrice && parseFloat(form.basePrice) > 0,
                required: true,
            },
            {
                id: 'image',
                label: 'Primary image',
                done: !!(form.imageUrl || form.images[0]),
                required: true,
            },
            {
                id: 'slabs',
                label: 'Bulk price slabs',
                done: !hasSlabs || form.priceSlabs.every((s) => !s.minQty || (s.minQty && s.price)),
                required: hasSlabs,
            },
        ];
    }, [form]);

    /* ---- Data fetching ---- */

    const fetchProducts = useCallback(async (showSpinner = true) => {
        try {
            if (showSpinner) setLoading(true);
            const res = await fetch('/api/v1/vendor/products?limit=500');
            const json = await res.json();
            if (json.success) setProducts(json.data.products);
        } catch (err) {
            console.error('Failed to load products:', err);
        } finally {
            if (showSpinner) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProducts();
        fetch('/api/v1/categories')
            .then(r => r.json())
            .then(json => {
                if (!json.success) return;
                // /api/v1/categories only returns top-level rows but nests each parent's
                // children inline. Flatten into one ordered list so the dropdown can show
                // sub-categories (Cheese, Milk under Dairy etc) — otherwise the vendor
                // can never tag a product with a sub-category.
                type CatRow = Category & { children?: Category[] };
                const flat: Category[] = [];
                for (const parent of (json.data as CatRow[])) {
                    flat.push(parent);
                    if (Array.isArray(parent.children)) {
                        for (const child of parent.children) flat.push(child);
                    }
                }
                setCategories(flat);
            })
            .catch(console.error);
        fetch('/api/v1/brands?limit=200&scope=picker')
            .then(r => r.json())
            .then(json => { if (json.success) setBrands((json.data?.brands ?? json.data ?? []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }))); })
            .catch(console.error);
        fetch('/api/v1/vendor/settings')
            .then(r => r.json())
            .then(json => {
                if (json.success && json.data?.slug) {
                    setVendorCodePreview(resolveVendorCode({
                        vendorCode: json.data.vendorCode as string | null | undefined,
                        slug: json.data.slug as string,
                    }));
                }
            })
            .catch(() => {});
    }, [fetchProducts]);

    // Reset to page 1 when search or filter changes
    useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter, approvalFilter, brandFilter, categoryFilter]);

    const brandFilterOptions = Array.from(
        new Set(products.map((p) => p.brand?.trim()).filter((b): b is string => Boolean(b))),
    ).sort((a, b) => a.localeCompare(b));
    const categoryFilterOptions = Array.from(
        new Map(
            products
                .filter((p) => p.category?.id && (p.category?.name || p.categoryName))
                .map((p) => [p.category!.id!, p.category?.name || p.categoryName]),
        ).entries(),
    ).sort((a, b) => a[1].localeCompare(b[1]));

    const filteredProducts = products.filter(p => {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
            !q ||
            p.name.toLowerCase().includes(q) ||
            (p.sku ?? '').toLowerCase().includes(q) ||
            (p.vendorSku ?? '').toLowerCase().includes(q) ||
            (p.brand ?? '').toLowerCase().includes(q);
        const matchesFilter =
            statusFilter === 'all' ? true :
            statusFilter === 'drafts' ? p.listingStatus === 'draft' :
            statusFilter === 'active' ? p.isActive :
            statusFilter === 'inactive' ? !p.isActive :
            statusFilter === 'featured' ? p.isFeatured :
            true;
        const matchesApproval =
            approvalFilter === 'all' ? true :
            approvalFilter === 'pending' ? (p.approvalStatus === 'pending' || p.approvalStatus === 'pending_edit') :
            approvalFilter === 'rejected' ? p.approvalStatus === 'rejected' :
            approvalFilter === 'approved' ? p.approvalStatus === 'approved' :
            true;
        const matchesBrand = !brandFilter || (p.brand ?? '').trim() === brandFilter;
        const matchesCategory = !categoryFilter || p.category?.id === categoryFilter;
        return matchesSearch && matchesFilter && matchesApproval && matchesBrand && matchesCategory;
    });
    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const paginatedProducts = filteredProducts.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);
    const pageRange = getPageRange(safeCurrentPage, totalPages);

    /* ---- Product suggestions (autocomplete) ---- */

    const fetchSuggestions = useCallback(async (query: string) => {
        if (query.length < 2) {
            setSuggestions([]);
            setMasterSuggestions([]);
            setBrandSuggestions([]);
            setOwnMatches([]);
            setShowSuggestions(false);
            setNoCatalogMatch(false);
            return;
        }
        setLoadingSuggestions(true);
        try {
            const trimmed = query.trim();
            const looksLikeSku = /^[A-Za-z0-9][A-Za-z0-9_-]+$/.test(trimmed);

            if (looksLikeSku) {
                const masterRes = await fetch(
                    `/api/v1/master-products?search=${encodeURIComponent(trimmed)}&exact=true&limit=1`,
                );
                const masterJson = await masterRes.json();
                if (masterJson.success && masterJson.data?.length === 1) {
                    setMasterSuggestions(masterJson.data);
                    setSuggestions([]);
                    setBrandSuggestions([]);
                    setOwnMatches([]);
                    setShowSuggestions(true);
                    setNoCatalogMatch(false);
                    return;
                }
            }

            const [res, masterRes, brandRes] = await Promise.all([
                fetch(`/api/v1/vendor/products/suggestions?q=${encodeURIComponent(trimmed)}`),
                fetch(`/api/v1/master-products?search=${encodeURIComponent(trimmed)}&limit=8`),
                fetch(`/api/v1/brand-master-products?q=${encodeURIComponent(trimmed)}&limit=8`),
            ]);
            const json = await res.json();
            const masterJson = await masterRes.json();
            const brandJson = await brandRes.json();
            const s = json.success ? (json.data.suggestions || []) : [];
            const own = json.success ? (json.data.ownMatches || []) : [];
            const masters = masterJson.success ? (masterJson.data || []) : [];
            const brandsList: BrandMasterSuggestion[] = brandJson.success
                ? (brandJson.data?.products || [])
                : [];
            setSuggestions(s);
            setMasterSuggestions(masters);
            setBrandSuggestions(brandsList);
            setOwnMatches(own);
            if (s.length > 0 || own.length > 0 || masters.length > 0 || brandsList.length > 0) {
                setShowSuggestions(true);
                setNoCatalogMatch(false);
            } else {
                setShowSuggestions(false);
                setNoCatalogMatch(trimmed.length >= 2);
            }
        } catch {
            setSuggestions([]);
            setMasterSuggestions([]);
            setBrandSuggestions([]);
            setOwnMatches([]);
            setNoCatalogMatch(false);
        } finally {
            setLoadingSuggestions(false);
        }
    }, []);

    const clearCatalogSelection = () => {
        setMasterProductId(null);
        setBasedOnProductId(null);
        setBasedOnBrandMasterProductId(null);
        setCatalogSearch('');
        setNoCatalogMatch(false);
        setShowSuggestions(false);
        setSuggestions([]);
        setMasterSuggestions([]);
        setBrandSuggestions([]);
        setOwnMatches([]);
        setForm(prev => ({
            ...prev,
            name: '',
            slug: '',
            sku: '',
            catalogSku: '',
            vendorSku: '',
            brand: '',
            categoryIds: [],
            imageUrl: '',
        }));
    };

    const isCatalogSearchEnabled = useCallback(() => {
        if (masterProductId || basedOnProductId || basedOnBrandMasterProductId) return false;
        if (!editingProduct) return true;
        if (editingProduct.approvalStatus === 'rejected') return true;
        if (editingProduct.listingStatus === 'draft') return true;
        return false;
    }, [editingProduct, masterProductId, basedOnProductId, basedOnBrandMasterProductId]);

    const handleProductNameChange = (name: string) => {
        setForm(prev => ({ ...prev, name, slug: slugify(name) }));
        clearFieldError('name');

        const canSearchCatalog = isCatalogSearchEnabled();
        if (!canSearchCatalog) return;

        setCatalogSearch(name);
        setNoCatalogMatch(false);
        if (suggestionTimeoutRef.current) clearTimeout(suggestionTimeoutRef.current);

        const trimmed = name.trim();
        if (trimmed.length < 2) {
            setShowSuggestions(false);
            setSuggestions([]);
            setMasterSuggestions([]);
            setBrandSuggestions([]);
            setOwnMatches([]);
            return;
        }

        suggestionTimeoutRef.current = setTimeout(() => {
            void fetchSuggestions(trimmed);
        }, 280);
    };

    const catalogSearchEnabled = isCatalogSearchEnabled();

    const renderCatalogSuggestionPanel = () => {
        if (!catalogSearchEnabled) return null;
        const hasCatalogHits =
            masterSuggestions.length > 0 || brandSuggestions.length > 0 || suggestions.length > 0;
        return (
            <>
                {showSuggestions && hasCatalogHits && (
                    <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-[#EEEEEE] rounded-[10px] shadow-lg max-h-[280px] overflow-y-auto">
                        {brandSuggestions.length > 0 && (
                            <>
                                <div className="px-3 py-1.5 bg-[#F8F9FB] border-b border-[#EEEEEE] text-[10px] font-bold text-[#AEAEAE] uppercase tracking-wider">
                                    Brand Catalog — instant approval
                                </div>
                                {brandSuggestions.map((b) => (
                                    <button
                                        key={b.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => fillFromBrandMaster(b)}
                                        className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-[#EEF8F1] transition-colors flex items-center justify-between gap-3 border-b border-[#F5F5F5] last:border-0"
                                    >
                                        <div className="min-w-0">
                                            <p className="font-bold text-[#181725] truncate">{b.name}</p>
                                            <p className="text-[11px] text-[#AEAEAE] truncate">
                                                {b.brand?.name ? `Brand: ${b.brand.name}` : ''}
                                                {b.sku ? `${b.brand?.name ? ' • ' : ''}SKU: ${b.sku}` : ''}
                                            </p>
                                        </div>
                                        {b.imageUrl && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={b.imageUrl}
                                                alt=""
                                                className="w-8 h-8 rounded-[6px] object-cover border border-[#EEEEEE] shrink-0"
                                            />
                                        )}
                                    </button>
                                ))}
                            </>
                        )}
                        {masterSuggestions.length > 0 && (
                            <>
                                <div className="px-3 py-1.5 bg-[#F8F9FB] border-b border-[#EEEEEE] text-[10px] font-bold text-[#AEAEAE] uppercase tracking-wider">
                                    Master Catalog — instant approval
                                </div>
                                {masterSuggestions.map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => fillFromMaster(m)}
                                        className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-[#EEF8F1] transition-colors flex items-center justify-between gap-3 border-b border-[#F5F5F5] last:border-0"
                                    >
                                        <div className="min-w-0">
                                            <p className="font-bold text-[#181725] truncate">{m.name}</p>
                                            <p className="text-[11px] text-[#AEAEAE] truncate">
                                                {m.brand ? `Brand: ${m.brand}` : ''}
                                                {m.sku ? `${m.brand ? ' • ' : ''}SKU: ${m.sku}` : ''}
                                            </p>
                                        </div>
                                        {m.imageUrl && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={m.imageUrl}
                                                alt=""
                                                className="w-8 h-8 rounded-[6px] object-cover border border-[#EEEEEE] shrink-0"
                                            />
                                        )}
                                    </button>
                                ))}
                            </>
                        )}
                        {suggestions.length > 0 && (
                            <>
                                <div className="px-3 py-1.5 bg-[#F8F9FB] border-b border-[#EEEEEE] text-[10px] font-bold text-[#AEAEAE] uppercase tracking-wider">
                                    Approved marketplace products
                                </div>
                                {suggestions.map((s) => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => fillFromSuggestion(s)}
                                        className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-[#EEF8F1] transition-colors flex items-center justify-between gap-3 border-b border-[#F5F5F5] last:border-0"
                                    >
                                        <div className="min-w-0">
                                            <p className="font-bold text-[#181725] truncate">{s.name}</p>
                                            <p className="text-[11px] text-[#AEAEAE] truncate">
                                                {s.vendor?.businessName ? `Sold by ${s.vendor.businessName}` : 'Catalog product'}
                                                {s.sku ? ` • SKU: ${s.sku}` : ''}
                                            </p>
                                        </div>
                                        {s.imageUrl && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={s.imageUrl}
                                                alt=""
                                                className="w-8 h-8 rounded-[6px] object-cover border border-[#EEEEEE] shrink-0"
                                            />
                                        )}
                                    </button>
                                ))}
                            </>
                        )}
                    </div>
                )}

                {ownMatches.length > 0 && showSuggestions && (
                    <div className="mt-1.5 rounded-[10px] bg-[#FFF7E6] border border-amber-200 px-3 py-2 text-[12px] text-amber-800">
                        <p className="font-bold mb-1">You already list similar products:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                            {ownMatches.map((o) => (
                                <li key={o.id}>
                                    {o.name}
                                    <span className="text-[#AEAEAE] ml-1">
                                        ({o.approvalStatus}{o.isActive ? '' : ', inactive'})
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {noCatalogMatch && form.name.trim().length >= 2 && !loadingSuggestions && (
                    <p className="text-[11px] text-[#7C7C7C] font-medium mt-1">
                        No catalog match — continue as a new product for admin approval.
                    </p>
                )}
            </>
        );
    };

    const renderProductNameField = (colClass: string) => (
        <div
            id="ff-name"
            className={cn('relative', colClass)}
            ref={catalogSearchEnabled ? suggestionsRef : undefined}
        >
            <FieldLabel required>Product Name</FieldLabel>
            <div className="relative">
                <input
                    type="text"
                    value={form.name}
                    onChange={(e) => handleProductNameChange(e.target.value)}
                    onFocus={() => {
                        if (catalogSearchEnabled && form.name.trim().length >= 2) {
                            void fetchSuggestions(form.name.trim());
                        }
                    }}
                    placeholder={catalogSearchEnabled ? 'Type name, SKU, or brand to search catalog…' : undefined}
                    className={cn(inputCls, fieldErrors.name && 'border-[#E74C3C]')}
                />
                {catalogSearchEnabled && loadingSuggestions && (
                    <Loader2
                        size={16}
                        className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary"
                    />
                )}
            </div>
            {fieldErrors.name && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{fieldErrors.name}</p>}
            {renderCatalogSuggestionPanel()}
        </div>
    );

    const fillFromMaster = (m: {
        id: string; sku: string; name: string; brand: string | null; imageUrl: string | null;
        category: { id: string; name: string } | null;
        categoryIds?: string[];
        categoryLeafMissing?: boolean;
        uom: string | null;
        taxPercent?: number | string;
        images?: string[];
    }) => {
        skipDraftAutosaveRef.current = true;
        setMasterProductId(m.id);
        setBasedOnProductId(null);
        setBasedOnBrandMasterProductId(null);
        setCatalogSearch(`${m.sku} — ${m.name}`);
        setNoCatalogMatch(false);
        setShowSuggestions(false);
        setMasterSuggestions([]);
        setBrandSuggestions([]);
        const categoryIds = m.categoryIds?.length
            ? m.categoryIds
            : m.category?.id
                ? [m.category.id]
                : [];
        setForm(prev => ({
            ...prev,
            name: m.name,
            slug: slugify(m.name),
            catalogSku: m.sku,
            vendorSku: '',
            sku: '',
            brand: m.brand || prev.brand,
            imageUrl: m.imageUrl || prev.imageUrl,
            images: m.images?.length ? m.images : prev.images,
            unit: m.uom || prev.unit,
            taxPercent: m.taxPercent != null ? String(m.taxPercent) : prev.taxPercent,
            categoryIds,
        }));
        setTimeout(() => {
            skipDraftAutosaveRef.current = false;
        }, 500);
    };

    const fillFromBrandMaster = (bmp: BrandMasterSuggestion) => {
        skipDraftAutosaveRef.current = true;
        setBasedOnBrandMasterProductId(bmp.id);
        setMasterProductId(null);
        setBasedOnProductId(null);
        setCatalogSearch(bmp.sku ? `${bmp.sku} — ${bmp.name}` : bmp.name);
        setNoCatalogMatch(false);
        setShowSuggestions(false);
        setBrandSuggestions([]);
        setMasterSuggestions([]);
        setSuggestions([]);

        const imageList = Array.isArray(bmp.images)
            ? bmp.images.filter((u): u is string => typeof u === 'string' && u.length > 0)
            : [];
        const primaryImage =
            imageList[0]
            || (typeof bmp.imageUrl === 'string' && bmp.imageUrl.trim() ? bmp.imageUrl.trim() : '');
        const categoryIds =
            Array.isArray(bmp.categoryIds) && bmp.categoryIds.length > 0
                ? bmp.categoryIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
                : bmp.categoryId
                    ? [bmp.categoryId]
                    : bmp.categoryRel?.id
                        ? [bmp.categoryRel.id]
                        : [];
        const vegNonVeg =
            bmp.vegNonVeg === 'veg' || bmp.vegNonVeg === 'nonveg' || bmp.vegNonVeg === 'egg'
                ? bmp.vegNonVeg
                : '';

        setForm(prev => ({
            ...prev,
            name: bmp.name,
            slug: slugify(bmp.name),
            catalogSku: bmp.sku || '',
            vendorSku: '',
            sku: '',
            description: bmp.description?.trim() || '',
            packSize: bmp.packSize?.trim() || '',
            unit: matchUnitOption(bmp.unit) || prev.unit,
            brand: bmp.brand?.name || prev.brand,
            categoryIds: categoryIds.length > 0 ? categoryIds : prev.categoryIds,
            imageUrl: primaryImage || prev.imageUrl,
            images: imageList.length > 0 ? imageList : (primaryImage ? [primaryImage] : prev.images),
            hsn: brandScalarToFormString(bmp.hsn) || prev.hsn,
            barcode: brandScalarToFormString(bmp.barcode) || prev.barcode,
            fssaiRef: brandScalarToFormString(bmp.fssaiRef) || prev.fssaiRef,
            vegNonVeg: vegNonVeg || prev.vegNonVeg,
            storageType: brandScalarToFormString(bmp.storageType) || prev.storageType,
            shelfLifeDays:
                bmp.shelfLifeDays != null && Number.isFinite(Number(bmp.shelfLifeDays))
                    ? String(bmp.shelfLifeDays)
                    : prev.shelfLifeDays,
            countryOfOrigin: brandScalarToFormString(bmp.countryOfOrigin) || prev.countryOfOrigin,
            tags: (() => {
                const t = brandStringList(bmp.tags);
                return t.length > 0 ? t : prev.tags;
            })(),
            aliasNames: (() => {
                const a = brandStringList(bmp.aliasNames);
                return a.length > 0 ? a : prev.aliasNames;
            })(),
            packageWeight: brandScalarToFormString(bmp.packageWeight) || prev.packageWeight,
            weightUnit: matchWeightUnitOption(bmp.weightUnit) || prev.weightUnit,
            packageLength: brandScalarToFormString(bmp.packageLength) || prev.packageLength,
            packageWidth: brandScalarToFormString(bmp.packageWidth) || prev.packageWidth,
            packageHeight: brandScalarToFormString(bmp.packageHeight) || prev.packageHeight,
            dimensionUnit: matchDimensionUnitOption(bmp.dimensionUnit) || prev.dimensionUnit,
        }));
        setTimeout(() => {
            skipDraftAutosaveRef.current = false;
        }, 500);
    };

    const suggestBrand = async (nameOverride?: string) => {
        const trimmed = (nameOverride ?? form.brand).trim();
        if (trimmed.length < 2 || brandSuggesting) return;
        const exact = brands.some(b => b.name.toLowerCase() === trimmed.toLowerCase());
        if (exact) return;
        setBrandSuggesting(true);
        try {
            const res = await fetch('/api/v1/vendor/brands/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: trimmed }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Brand suggestion failed');
            if (json.alreadyExists) {
                toast.success(`Using existing brand "${json.data.name}"`);
                updateField('brand', json.data.name);
            } else {
                toast.success(
                    `Requested "${trimmed}" as a new brand. Admin must approve it before products using this brand can go live.`,
                    { duration: 6000 },
                );
                updateField('brand', trimmed);
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Brand suggestion failed');
        } finally {
            setBrandSuggesting(false);
        }
    };

    const fillFromSuggestion = (s: ProductSuggestion) => {
        setBasedOnProductId(s.id);
        setMasterProductId(null);
        setBasedOnBrandMasterProductId(null);
        setCatalogSearch(s.sku ? `${s.sku} — ${s.name}` : s.name);
        setNoCatalogMatch(false);
        setShowSuggestions(false);
        setSuggestions([]);
        setBrandSuggestions([]);
        const matched = s.category?.slug ? categories.find(c => c.slug === s.category!.slug) : null;
        const seedCategoryIds =
            Array.isArray(s.categoryIds) && s.categoryIds.length > 0
                ? s.categoryIds
                : s.category?.id
                    ? [s.category.id]
                    : matched
                        ? [matched.id]
                        : [];
        setForm(prev => ({
            ...prev,
            name: s.name,
            slug: slugify(s.name),
            categoryIds: seedCategoryIds.length > 0 ? seedCategoryIds : prev.categoryIds,
            basePrice: s.basePrice != null ? String(s.basePrice) : prev.basePrice,
            originalPrice: s.originalPrice != null ? String(s.originalPrice) : '',
            packSize: s.packSize || '',
            unit: s.unit || '',
            // New listing needs its own POS — do not copy the source composed SKU.
            sku: '',
            vendorSku: '',
            catalogSku: s.sku || prev.catalogSku,
            hsn: s.hsn || prev.hsn,
            brand: s.brand || '',
            barcode: s.barcode || prev.barcode,
            description: s.description || '',
            imageUrl: s.imageUrl || '',
            images: Array.isArray(s.images) ? s.images : [],
            tags: Array.isArray(s.tags) ? s.tags : [],
            taxPercent: s.taxPercent != null ? String(s.taxPercent) : '0',
            minOrderQty: s.minOrderQty != null ? String(s.minOrderQty) : '1',
            creditEligible: true,
        }));
    };

    // Close suggestions when clicking outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    /* ---- Draft autosave payload ---- */

    const buildProductBody = useCallback((opts: { isDraft: boolean }) => {
        const isNewSubmission = !editingProduct && !masterProductId && !basedOnProductId && !basedOnBrandMasterProductId;
        const parsedBase = form.basePrice ? parseFloat(form.basePrice) : 0;

        const metadata = {
            accounting: {
                account: form.account.trim(),
                accountCode: form.accountCode.trim(),
                taxable: form.taxable,
                exemptionReason: form.exemptionReason.trim(),
                taxabilityType: form.taxabilityType.trim(),
                inventoryAccount: form.inventoryAccount.trim(),
                inventoryAccountCode: form.inventoryAccountCode.trim(),
                platformCommission: form.platformCommission ? Number(form.platformCommission) : undefined,
            },
            inventory: {
                reorderPoint: form.reorderPoint ? Number(form.reorderPoint) : undefined,
                openingStock: form.openingStock ? Number(form.openingStock) : undefined,
                valuationMethod: form.valuationMethod.trim(),
                trackInventory: form.trackInventory,
            },
            packaging: {
                packageWeight: form.packageWeight ? Number(form.packageWeight) : undefined,
                packageLength: form.packageLength ? Number(form.packageLength) : undefined,
                packageWidth: form.packageWidth ? Number(form.packageWidth) : undefined,
                packageHeight: form.packageHeight ? Number(form.packageHeight) : undefined,
                dimensionUnit: form.dimensionUnit.trim(),
                weightUnit: form.weightUnit.trim(),
            },
            identifiers: {
                ean: form.ean.trim(),
                isbn: form.isbn.trim(),
            },
            attributes: {
                itemType: form.itemType.trim(),
                productType: form.productType.trim(),
                source: form.source.trim(),
                referenceId: form.referenceId.trim(),
                lastSync: form.lastSync.trim(),
                sellable: form.sellable,
                purchasable: form.purchasable,
                itemStatus: form.itemStatus.trim(),
                activeOnlineStore: form.activeOnlineStore,
            }
        };

        const body: Record<string, unknown> = {
            name: form.name.trim() || 'Untitled product',
            slug: (() => {
                if (opts.isDraft) {
                    if (editingProduct?.slug) return editingProduct.slug;
                    if (form.slug?.trim()) return form.slug.trim();
                    if (form.name.trim()) return slugify(form.name.trim());
                    if (!draftSlugRef.current) {
                        draftSlugRef.current = `draft-${crypto.randomUUID().slice(0, 8)}`;
                    }
                    return draftSlugRef.current;
                }
                return form.slug || slugify(form.name.trim() || 'untitled-product');
            })(),
            listingStatus: opts.isDraft ? 'draft' : 'submitted',
            isActive: !opts.isDraft,
            packSize: form.packSize || undefined,
            unit: form.unit || undefined,
            description: form.description || undefined,
            imageUrl: form.imageUrl || undefined,
            creditEligible: true,
            isFeatured: form.isFeatured,
            sku: form.sku || undefined,
            hsn: form.hsn || undefined,
            fssaiRef: form.fssaiRef || undefined,
            brand: form.brand || undefined,
            barcode: form.barcode || undefined,
            taxPercent: form.taxPercent ? parseFloat(form.taxPercent) : 0,
            minOrderQty: form.minOrderQty ? parseInt(form.minOrderQty, 10) : 1,
            tags: form.tags.length > 0 ? form.tags : undefined,
            aliasNames: form.aliasNames.length > 0 ? form.aliasNames : undefined,
            substituteIds: form.substituteIds.length > 0 ? form.substituteIds : undefined,
            shelfLifeDays: form.shelfLifeDays.trim() !== '' && !Number.isNaN(Number(form.shelfLifeDays))
                ? parseInt(form.shelfLifeDays, 10)
                : undefined,
            countryOfOrigin: form.countryOfOrigin.trim() || undefined,
            vegNonVeg: form.vegNonVeg || undefined,
            storageType: form.storageType || undefined,
            images: form.images.filter(Boolean).length > 0 ? form.images.filter(Boolean) : undefined,
            metadata,
        };

        if (opts.isDraft) {
            body.basePrice = parsedBase > 0 ? parsedBase : 0.01;
        } else {
            body.basePrice = parsedBase;
        }

        if (form.originalPrice) {
            body.originalPrice = parseFloat(form.originalPrice);
        }

        if (form.categoryIds.length > 0) {
            body.categoryIds = form.categoryIds;
            body.categoryId = form.categoryIds[0];
        } else if (editingProduct && !opts.isDraft) {
            body.categoryIds = [];
        }

        const slabs = form.priceSlabs
            .filter(s => s.minQty && s.price)
            .map(s => ({
                minQty: parseInt(s.minQty, 10),
                price: parseFloat(s.price),
            }))
            .sort((a, b) => a.minQty - b.minQty);

        if (slabs.length > 0) {
            body.priceSlabs = slabs;
        }

        if (
            basedOnProductId &&
            (!editingProduct ||
                editingProduct.approvalStatus === 'rejected' ||
                editingProduct.listingStatus === 'draft')
        ) {
            body.basedOnProductId = basedOnProductId;
        }

        if (
            basedOnBrandMasterProductId &&
            (!editingProduct ||
                editingProduct.approvalStatus === 'rejected' ||
                editingProduct.listingStatus === 'draft')
        ) {
            body.basedOnBrandMasterProductId = basedOnBrandMasterProductId;
        }

        const catalogLinkedIdentity = !!(
            masterProductId ||
            basedOnBrandMasterProductId ||
            basedOnProductId
        );

        if (
            masterProductId &&
            (!editingProduct ||
                editingProduct.approvalStatus === 'rejected' ||
                editingProduct.listingStatus === 'draft')
        ) {
            body.masterProductId = masterProductId;
        }

        if (catalogLinkedIdentity) {
            // Catalog UI binds POS to vendorSku (master / brand / basedOn).
            if (form.vendorSku.trim()) {
                body.vendorSku = form.vendorSku.trim();
            }
            delete body.sku;
        } else {
            // Standalone pending/draft: form.sku is the POS code. Never treat an
            // approved listing's composed sku (e.g. VCODE-123) as POS.
            const useSkuAsPos =
                !editingProduct ||
                editingProduct.listingStatus === 'draft' ||
                editingProduct.approvalStatus === 'pending' ||
                editingProduct.approvalStatus === 'rejected';
            const pos = useSkuAsPos
                ? (form.sku.trim() || form.vendorSku.trim())
                : form.vendorSku.trim();
            if (pos) {
                body.vendorSku = pos;
                if (!opts.isDraft && isNewSubmission) {
                    delete body.sku;
                }
            }
        }

        if (isNewSubmission && !opts.isDraft) {
            delete body.sku;
        }

        if (editingProduct?.approvalStatus === 'approved' && !opts.isDraft) {
            // Name is editable on vendor listings (past orders keep OrderItem.productName).
            delete body.slug;
            delete body.brand;

            // Only send images when the vendor changed them vs the post-overlay
            // baseline. Always sending would false-queue brand-overlaid images as
            // pending_edit on every price-only save of a mapped product.
            const baseline = loadedImagesRef.current;
            const nextImageUrl = (form.imageUrl || '').trim();
            const nextImages = form.images.filter(Boolean);
            const imageUrlChanged = nextImageUrl !== (baseline.imageUrl || '').trim();
            const imagesChanged = !sameImageList(nextImages, baseline.images);

            if (!imageUrlChanged) {
                delete body.imageUrl;
            }
            if (!imagesChanged) {
                delete body.images;
            } else {
                // Allow clearing additional images (empty array); undefined would skip detection.
                body.images = nextImages;
            }
        }

        return body;
    }, [form, editingProduct, masterProductId, basedOnProductId, basedOnBrandMasterProductId]);

    const saveDraftRef = useRef<(force?: boolean) => Promise<boolean>>(async () => false);
    const discardEmptyDraftRef = useRef<() => Promise<boolean>>(async () => false);

    const adoptDraftProduct = useCallback((p: {
        id: string;
        name: string;
        slug: string;
        basePrice: unknown;
        originalPrice?: unknown;
        packSize?: string | null;
        unit?: string | null;
        imageUrl?: string | null;
        isFeatured?: boolean;
        description?: string | null;
        creditEligible?: boolean;
        categoryId?: string | null;
        sku?: string | null;
        approvalStatus?: string;
    }) => {
        const cat = categories.find(c => c.id === p.categoryId);
        const draftProduct: VendorProduct = {
            id: p.id,
            name: p.name,
            slug: p.slug,
            basePrice: Number(p.basePrice),
            originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
            packSize: p.packSize ?? null,
            unit: p.unit ?? null,
            imageUrl: p.imageUrl ?? null,
            isActive: false,
            isFeatured: p.isFeatured ?? false,
            description: p.description ?? null,
            creditEligible: true,
            categoryName: cat?.name ?? '',
            categorySlug: cat?.slug ?? '',
            in_stock: false,
            qty_available: 0,
            sku: p.sku ?? null,
            approvalStatus: (p.approvalStatus as VendorProduct['approvalStatus']) ?? 'pending',
            listingStatus: 'draft',
        };
        setEditingProduct(draftProduct);
        loadedImagesRef.current = {
            imageUrl: (typeof p.imageUrl === 'string' ? p.imageUrl : '') || '',
            images: [],
        };
        setProducts(prev => {
            if (prev.some(existing => existing.id === p.id)) {
                return prev.map(existing =>
                    existing.id === p.id ? { ...existing, ...draftProduct } : existing
                );
            }
            return [draftProduct, ...prev];
        });
        return draftProduct;
    }, [categories]);

    const saveDraft = useCallback(async (force = false): Promise<boolean> => {
        if (skipDraftAutosaveRef.current && !force) return false;
        if (!form.name.trim()) {
            // Clearing the name must not POST/PATCH "Untitled product".
            if (force) setDraftSaveError('Enter a product name to save a draft');
            return false;
        }
        if (!force) {
            if (!canAutosaveDraft() || !isFormDirty()) return false;
        }

        setDraftSaving(true);
        setDraftSaveError(null);
        try {
            const body = buildProductBody({ isDraft: true });
            let res: Response;

            if (editingProduct) {
                res = await fetch(`/api/v1/vendor/products/${editingProduct.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            } else {
                res = await fetch('/api/v1/vendor/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            }

            let json = await res.json();

            if (!json.success && !editingProduct && res.status === 409) {
                const slug = String(body.slug ?? '');
                const localMatch = products.find(
                    (p) => p.listingStatus === 'draft' && p.slug === slug,
                );
                if (localMatch) {
                    adoptDraftProduct(localMatch);
                    res = await fetch(`/api/v1/vendor/products/${localMatch.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    });
                    json = await res.json();
                } else if (!draftSlugRef.current || slug === 'untitled-product') {
                    draftSlugRef.current = `draft-${crypto.randomUUID().slice(0, 8)}`;
                    body.slug = draftSlugRef.current;
                    res = await fetch('/api/v1/vendor/products', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    });
                    json = await res.json();
                }
            }

            if (!json.success) {
                setDraftSaveError(json.error?.message ?? 'Couldn\'t save draft — retry');
                return false;
            }
            setDraftSaveError(null);
            setDraftSavedOnce(true);

            const p = json.data;
            syncSavedSnapshot();

            if (!editingProduct) {
                adoptDraftProduct(p);
            } else {
                setEditingProduct(prev => prev ? { ...prev, listingStatus: 'draft', isActive: false } : prev);
                setProducts(prev => prev.map(existing =>
                    existing.id === p.id
                        ? {
                            ...existing,
                            name: p.name,
                            basePrice: Number(p.basePrice),
                            listingStatus: 'draft',
                            isActive: false,
                            countryOfOrigin: p.countryOfOrigin ?? existing.countryOfOrigin ?? null,
                            shelfLifeDays:
                                p.shelfLifeDays != null ? Number(p.shelfLifeDays) : existing.shelfLifeDays ?? null,
                            vegNonVeg: p.vegNonVeg ?? existing.vegNonVeg ?? null,
                            storageType: p.storageType ?? existing.storageType ?? null,
                            vendorSku: p.vendorSku ?? existing.vendorSku ?? null,
                        }
                        : existing
                ));
            }
            return true;
        } catch {
            setDraftSaveError('Couldn\'t save draft — check connection and retry');
            return false;
        } finally {
            setDraftSaving(false);
        }
    }, [canAutosaveDraft, isFormDirty, buildProductBody, editingProduct, products, adoptDraftProduct, syncSavedSnapshot, form.name]);

    const discardEmptyDraft = useCallback(async (): Promise<boolean> => {
        if (skipDraftAutosaveRef.current) return false;
        if (!editingProduct || editingProduct.listingStatus !== 'draft') return false;
        if (!isFormEffectivelyEmpty()) return false;

        const id = editingProduct.id;
        try {
            const res = await fetch(`/api/v1/vendor/products/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!json.success) return false;

            setProducts(prev => prev.filter(p => p.id !== id));
            setEditingProduct(null);
            draftSlugRef.current = null;
            setDraftSavedOnce(false);
            setDraftSaveError(null);
            syncSavedSnapshot(
                serializeFormSnapshot(EMPTY_FORM, {
                    masterProductId: null,
                    basedOnProductId: null,
                    basedOnBrandMasterProductId: null,
                }),
            );
            return true;
        } catch {
            return false;
        }
    }, [editingProduct, isFormEffectivelyEmpty, syncSavedSnapshot]);

    useEffect(() => {
        saveDraftRef.current = saveDraft;
    }, [saveDraft]);

    useEffect(() => {
        discardEmptyDraftRef.current = discardEmptyDraft;
    }, [discardEmptyDraft]);

    /* ---- Panel open / close ---- */

    const openAddPanel = () => {
        if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
        skipDraftAutosaveRef.current = true;
        draftSlugRef.current = null;
        setDraftSaveError(null);
        setDraftSavedOnce(false);
        setEditingProduct(null);
        setForm(EMPTY_FORM);
        setFormError('');
        setFieldErrors({});
        setBasedOnProductId(null);
        setMasterProductId(null);
        setBasedOnBrandMasterProductId(null);
        setEditBrandMasterProduct(null);
        setShowUnlinkConfirm(false);
        loadedImagesRef.current = { imageUrl: '', images: [] };
        setCatalogSearch('');
        setNoCatalogMatch(false);
        setSuggestions([]);
        setMasterSuggestions([]);
        setBrandSuggestions([]);
        setShowSuggestions(false);
        setShowCloseConfirm(false);
        setLastSavedSnapshot('');
        setAuditLogs([]);
        setCategoryPickerKey((k) => k + 1);
        setIsPanelOpen(true);
        // Re-enable autosave after reset settles; do not create a DB row until the user edits or saves.
        Promise.resolve().then(() => {
            skipDraftAutosaveRef.current = false;
        });
    };

    const openEditPanel = async (product: VendorProduct) => {
        if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
        skipDraftAutosaveRef.current = true;
        setDraftSaveError(null);
        draftSlugRef.current = product.listingStatus === 'draft' ? product.slug : null;
        setDraftSavedOnce(product.listingStatus === 'draft');
        setEditingProduct(product);
        setForm(EMPTY_FORM);
        setFormError('');
        setFieldErrors({});
        setShowCloseConfirm(false);
        setShowUnlinkConfirm(false);
        setMasterProductId(null);
        setBasedOnBrandMasterProductId(null);
        setEditBrandMasterProduct(null);
        setCatalogSearch('');
        setIsPanelOpen(true);
        setLoadingProduct(true);

        // Fetch full product details (including priceSlabs) from API
        try {
            const res = await fetch(`/api/v1/vendor/products/${product.id}`);
            const json = await res.json();
            if (!json.success) {
                toast.error('Could not load full product details — showing saved list data.');
            }
            const p = json.success ? json.data : product;
            const listLogistics = logisticsFieldsFromListProduct(product);

            const histRes = await fetch(`/api/v1/vendor/products/${product.id}/price-history`);
            const histJson = await histRes.json();
            setAuditLogs(histJson.success ? histJson.data : []);

            const apiBrandMappings = Array.isArray(p.brandMappings)
                ? (p.brandMappings as BrandMappingSummary[])
                : product.brandMappings;
            setEditingProduct({
                ...product,
                approvalStatus: p.approvalStatus ?? product.approvalStatus,
                approvalNote: p.approvalNote ?? product.approvalNote ?? null,
                pendingEditPayload:
                    p.pendingEditPayload && typeof p.pendingEditPayload === 'object'
                        ? (p.pendingEditPayload as Record<string, unknown>)
                        : null,
                listingStatus: p.listingStatus ?? product.listingStatus ?? 'submitted',
                brandMappings: apiBrandMappings,
            });
            setMasterProductId(
                typeof p.masterProductId === 'string' ? p.masterProductId : null
            );
            setBasedOnProductId(null);
            const linkIds: string[] = Array.isArray(p.categoryLinks)
                ? (p.categoryLinks as Array<{ categoryId: string }>).map(l => l.categoryId)
                : [];
            const fallbackId: string | null = p.category?.id ?? null;
            const editCategoryIds = Array.isArray(p.categoryIds) && p.categoryIds.length > 0
                ? p.categoryIds as string[]
                : linkIds.length > 0
                    ? linkIds
                    : (fallbackId ? [fallbackId] : []);

            const masterRow = p.masterProduct as { sku?: string } | null | undefined;
            const liveMapping = apiBrandMappings?.[0];
            const brandMasterId =
                (typeof liveMapping?.brandMasterProductId === 'string'
                    ? liveMapping.brandMasterProductId
                    : null)
                || (typeof liveMapping?.brandMasterProduct?.id === 'string'
                    ? liveMapping.brandMasterProduct.id
                    : null);
            setBasedOnBrandMasterProductId(brandMasterId);
            setEditBrandMasterProduct(liveMapping?.brandMasterProduct ?? null);

            const catalogSku =
                (typeof liveMapping?.brandMasterProduct?.sku === 'string'
                    ? liveMapping.brandMasterProduct.sku
                    : '')
                || masterRow?.sku
                || '';
            const posSku =
                (typeof p.vendorSku === 'string' && p.vendorSku.trim()) ||
                parseVendorSku(p.sku ?? '', vendorCodePreview).posSku;
            const hasCatalogIdentity =
                Boolean(typeof p.masterProductId === 'string' && p.masterProductId)
                || Boolean(brandMasterId);
            // Catalog UI binds POS to vendorSku; standalone binds the SKU input to sku.
            const displaySku = hasCatalogIdentity ? (p.sku || '') : (posSku || p.sku || '');

            const meta = (p.metadata && typeof p.metadata === 'object' ? p.metadata : {}) as Record<string, any>;
            const acc = meta.accounting || {};
            const inv = meta.inventory || {};
            const pkg = meta.packaging || {};
            const ids = meta.identifiers || {};
            const att = meta.attributes || {};

            const formPayload = applyBrandMasterOverride(
                {
                    name: p.name || '',
                    slug: p.slug || '',
                    categoryIds: editCategoryIds,
                    basePrice: p.basePrice != null ? String(p.basePrice) : '',
                    originalPrice: p.originalPrice != null ? String(p.originalPrice) : '',
                    packSize: p.packSize || '',
                    unit: p.unit || '',
                    sku: displaySku,
                    catalogSku,
                    vendorSku: posSku,
                    hsn: p.hsn || '',
                    fssaiRef: p.fssaiRef || '',
                    brand: p.brand || '',
                    barcode: p.barcode || '',
                    description: p.description || '',
                    imageUrl: p.imageUrl || '',
                    images: Array.isArray(p.images) ? p.images : [],
                    tags: Array.isArray(p.tags) ? p.tags : [],
                    aliasNames: Array.isArray(p.aliasNames) ? p.aliasNames : [],
                    substituteIds: Array.isArray(p.substituteIds) ? p.substituteIds : [],
                    vegNonVeg: (p.vegNonVeg || listLogistics.vegNonVeg || '') as '' | 'veg' | 'nonveg' | 'egg',
                    storageType: p.storageType || listLogistics.storageType || '',
                    shelfLifeDays:
                        p.shelfLifeDays != null
                            ? String(p.shelfLifeDays)
                            : listLogistics.shelfLifeDays,
                    countryOfOrigin: p.countryOfOrigin || listLogistics.countryOfOrigin || '',
                    taxPercent: p.taxPercent != null ? String(p.taxPercent) : '0',
                    minOrderQty:
                        p.minOrderQty != null
                            ? String(p.minOrderQty)
                            : listLogistics.minOrderQty,
                    creditEligible: true,
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
                    platformCommission: acc.platformCommission != null ? String(acc.platformCommission) : '',
                    itemStatus: att.itemStatus || 'Active',
                    activeOnlineStore: att.activeOnlineStore ?? true,
                },
                apiBrandMappings?.[0]?.brandMasterProduct,
            );

            setForm(formPayload);
            // Baseline = what the vendor sees (includes brand overlay), not raw Product row.
            loadedImagesRef.current = {
                imageUrl: formPayload.imageUrl || '',
                images: formPayload.images.filter(Boolean),
            };
            setCategoryPickerKey((k) => k + 1);
            syncSavedSnapshot(
                serializeFormSnapshot(
                    formPayload,
                    {
                        masterProductId: typeof p.masterProductId === 'string' ? p.masterProductId : null,
                        basedOnProductId: null,
                        basedOnBrandMasterProductId: brandMasterId,
                    }
                )
            );
        } catch {
            // Fallback: populate from the product list data. We don't have full
            // categoryLinks here — best-effort resolve from the list's slug.
            const fallbackMatch = product.category?.slug
                ? categories.find(c => c.slug === product.category!.slug)
                : null;
            const listLogistics = logisticsFieldsFromListProduct(product);
            const fallbackPos =
                listLogistics.vendorSku ||
                parseVendorSku(product.sku ?? '', vendorCodePreview).posSku;
            const fallbackBrandMasterId =
                product.brandMappings?.[0]?.brandMasterProductId
                || product.brandMappings?.[0]?.brandMasterProduct?.id
                || null;
            setBasedOnBrandMasterProductId(fallbackBrandMasterId);
            setEditBrandMasterProduct(product.brandMappings?.[0]?.brandMasterProduct ?? null);
            const fallbackCatalogIdentity = Boolean(fallbackBrandMasterId);
            const fallbackForm = applyBrandMasterOverride(
                {
                    ...EMPTY_FORM,
                    name: product.name,
                    slug: product.slug,
                    categoryIds: fallbackMatch ? [fallbackMatch.id] : [],
                    basePrice: String(product.basePrice),
                    originalPrice: '',
                    packSize: product.packSize || '',
                    unit: product.unit || '',
                    sku: fallbackCatalogIdentity ? (product.sku || '') : (fallbackPos || product.sku || ''),
                    catalogSku: product.brandMappings?.[0]?.brandMasterProduct?.sku || '',
                    vendorSku: fallbackPos,
                    hsn: product.hsn || '',
                    fssaiRef: product.fssaiRef || '',
                    brand: product.brand || '',
                    barcode: product.barcode || '',
                    description: product.description || '',
                    imageUrl: product.imageUrl || '',
                    images: product.images ?? [],
                    tags: product.tags ?? [],
                    aliasNames: product.aliasNames ?? [],
                    vegNonVeg: listLogistics.vegNonVeg,
                    storageType: listLogistics.storageType,
                    shelfLifeDays: listLogistics.shelfLifeDays,
                    countryOfOrigin: listLogistics.countryOfOrigin,
                    taxPercent: product.taxPercent != null ? String(product.taxPercent) : '0',
                    minOrderQty: listLogistics.minOrderQty,
                    creditEligible: true,
                    isFeatured: product.isFeatured,
                    substituteIds: product.substituteIds ?? [],
                    priceSlabs: product.priceSlabs
                        ? product.priceSlabs.map((s) => ({
                            minQty: String(s.minQty),
                            price: String(s.price),
                        }))
                        : [],
                },
                product.brandMappings?.[0]?.brandMasterProduct,
            );
            setForm(fallbackForm);
            loadedImagesRef.current = {
                imageUrl: fallbackForm.imageUrl || '',
                images: fallbackForm.images.filter(Boolean),
            };
            setCategoryPickerKey((k) => k + 1);
            syncSavedSnapshot();
        } finally {
            setLoadingProduct(false);
            Promise.resolve().then(() => {
                skipDraftAutosaveRef.current = false;
            });
        }
    };

    // Deep link: /vendor/products?action=add or ?edit={productId}
    useEffect(() => {
        const action = searchParams.get('action');
        if (action === 'add' && !deepLinkHandled.current && !isPanelOpen) {
            deepLinkHandled.current = true;
            router.replace('/vendor/products', { scroll: false });
            openAddPanel();
            return;
        }

        const editId = searchParams.get('edit');
        if (!editId || deepLinkHandled.current || isPanelOpen) return;

        const openFromDeepLink = async () => {
            const fromList = products.find((p) => p.id === editId);
            if (fromList) {
                deepLinkHandled.current = true;
                router.replace('/vendor/products', { scroll: false });
                await openEditPanel(fromList);
                return;
            }
            if (loading) return;
            try {
                const res = await fetch(`/api/v1/vendor/products/${editId}`);
                const json = await res.json();
                if (!json.success) return;
                const p = json.data as VendorProduct & { masterProductId?: string | null };
                deepLinkHandled.current = true;
                router.replace('/vendor/products', { scroll: false });
                await openEditPanel({
                    id: p.id,
                    name: p.name,
                    slug: p.slug,
                    basePrice: Number(p.basePrice),
                    packSize: p.packSize,
                    unit: p.unit,
                    imageUrl: p.imageUrl,
                    isActive: p.isActive,
                    isFeatured: p.isFeatured,
                    description: p.description,
                    creditEligible: true,
                    categoryName: p.category?.name ?? '',
                    categorySlug: p.category?.slug ?? '',
                    in_stock: false,
                    qty_available: 0,
                    approvalStatus: p.approvalStatus,
                    approvalNote: p.approvalNote ?? null,
                    category: p.category,
                });
            } catch {
                /* silent */
            }
        };

        void openFromDeepLink();
    }, [searchParams, products, loading, isPanelOpen, router]);

    const closePanelImmediate = () => {
        if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
        draftSlugRef.current = null;
        setDraftSaveError(null);
        setDraftSavedOnce(false);
        setIsPanelOpen(false);
        setEditingProduct(null);
        setEditBrandMasterProduct(null);
        setShowCloseConfirm(false);
        setShowUnlinkConfirm(false);
        setLastSavedSnapshot('');
        setDraftSaving(false);
    };

    const flushDraftAutosave = useCallback(async () => {
        if (draftSaveTimeoutRef.current) {
            clearTimeout(draftSaveTimeoutRef.current);
            draftSaveTimeoutRef.current = null;
        }
        if (canAutosaveDraft() && isFormDirty()) {
            await saveDraftRef.current();
        }
    }, [canAutosaveDraft, isFormDirty]);

    const requestClosePanel = () => {
        void (async () => {
            // Cleared form → remove the autosaved draft instead of prompting to discard.
            if (editingProduct?.listingStatus === 'draft' && isFormEffectivelyEmpty()) {
                if (draftSaveTimeoutRef.current) {
                    clearTimeout(draftSaveTimeoutRef.current);
                    draftSaveTimeoutRef.current = null;
                }
                await discardEmptyDraftRef.current();
                closePanelImmediate();
                return;
            }
            await flushDraftAutosave();
            if (isFormDirty()) {
                setShowCloseConfirm(true);
                return;
            }
            closePanelImmediate();
        })();
    };

    // Debounced draft autosave / empty-draft cleanup while the panel is open.
    useEffect(() => {
        if (!isPanelOpen || loadingProduct || saving || draftSaving || skipDraftAutosaveRef.current) return;
        if (editingProduct?.listingStatus === 'submitted') return;

        if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);

        // Name/fields cleared back to empty → delete the autosaved draft.
        if (editingProduct?.listingStatus === 'draft' && isFormEffectivelyEmpty()) {
            draftSaveTimeoutRef.current = setTimeout(() => {
                void discardEmptyDraftRef.current();
            }, DRAFT_AUTOSAVE_MS);
            return () => {
                if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
            };
        }

        if (!canAutosaveDraft() || !isFormDirty()) return;

        draftSaveTimeoutRef.current = setTimeout(() => {
            void saveDraftRef.current();
        }, DRAFT_AUTOSAVE_MS);

        return () => {
            if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
        };
    }, [
        form,
        masterProductId,
        basedOnProductId,
        basedOnBrandMasterProductId,
        canAutosaveDraft,
        isFormDirty,
        isFormEffectivelyEmpty,
        isPanelOpen,
        loadingProduct,
        saving,
        draftSaving,
        editingProduct?.listingStatus,
        lastSavedSnapshot,
    ]);

    /* ---- Form field helpers ---- */

    const updateField = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
        setForm(prev => ({ ...prev, [key]: value }));
        clearFieldError(key as string);
    };

    const clearFieldError = (key: string) => {
        setFieldErrors(prev => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const mapServerErrorToField = (msg: string): ProductValidationField | null => {
        const m = msg.toLowerCase();
        if (m.includes('hsn')) return 'hsn';
        if (m.includes('image')) return 'imageUrl';
        if (m.includes('pos sku') || m.includes('vendor sku')) {
            if (typeof document !== 'undefined' && document.getElementById('ff-vendorSku')) {
                return 'vendorSku';
            }
            return 'sku';
        }
        if (m.includes('sku')) return 'sku';
        if (m.includes('categor')) return 'categoryIds';
        if (m.includes('brand')) return 'brand';
        if (m.includes('price')) return 'basePrice';
        if (m.includes('name')) return 'name';
        return null;
    };

    const applyServerError = (msg: string) => {
        const field = mapServerErrorToField(msg);
        if (field && document.getElementById(`ff-${field}`)) {
            setFormError('');
            setFieldErrors({ [field]: msg });
            focusFirstProductFormError({ [field]: msg });
        } else {
            setFieldErrors({});
            setFormError(msg);
            panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    /* ---- Price slabs ---- */

    const addPriceSlab = () => {
        setForm(prev => ({
            ...prev,
            priceSlabs: [...prev.priceSlabs, { minQty: '', price: '' }],
        }));
    };

    const updatePriceSlab = (index: number, field: keyof PriceSlabRow, value: string) => {
        setForm(prev => {
            const slabs = [...prev.priceSlabs];
            slabs[index] = { ...slabs[index], [field]: value };
            return { ...prev, priceSlabs: slabs };
        });
    };

    const removePriceSlab = (index: number) => {
        setForm(prev => ({
            ...prev,
            priceSlabs: prev.priceSlabs.filter((_, i) => i !== index),
        }));
    };

    /* ---- Submit ---- */

    const performProductSave = async () => {
        const publishingDraft = editingProduct?.listingStatus === 'draft';
        setSaving(true);
        setFormError('');
        setFieldErrors({});
        try {
            const body = buildProductBody({ isDraft: false });

            let res: Response;
            if (editingProduct) {
                res = await fetch(`/api/v1/vendor/products/${editingProduct.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            } else {
                res = await fetch('/api/v1/vendor/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            }

            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Failed to save product');

            const p = json.data as VendorProduct & {
                categoryId?: string;
                unlinkedBrandMappings?: Array<{ brandName?: string }>;
            };
            const unlinked = Array.isArray(p.unlinkedBrandMappings) ? p.unlinkedBrandMappings : [];
            const unlinkedBrandNames = [
                ...new Set(
                    unlinked
                        .map((m) => (typeof m.brandName === 'string' ? m.brandName.trim() : ''))
                        .filter(Boolean),
                ),
            ];

            syncSavedSnapshot();
            if (unlinked.length > 0) {
                // Drop overlay state before close so Mapped badge / banner / Unlink
                // cannot flash back if the panel remounts from the same product.
                setEditBrandMasterProduct(null);
                setEditingProduct((prev) => (prev ? { ...prev, brandMappings: [] } : prev));
            }
            closePanelImmediate();

            if (unlinked.length > 0 && p.approvalStatus === 'pending_edit') {
                const brandLabel = unlinkedBrandNames.join(', ') || 'brand';
                toast.success(
                    `Unlinked from ${brandLabel}. Image sent for review — your current image stays live until an admin approves it.`,
                );
            } else if (unlinked.length > 0) {
                const brandLabel = unlinkedBrandNames.join(', ') || 'brand';
                toast.success(`Unlinked from ${brandLabel} — your values are now live.`);
            } else if (!editingProduct && p.approvalStatus === 'pending') {
                toast.success('Product submitted — admin will review and assign a SKU before it goes live.');
            } else if (!editingProduct) {
                toast.success('Product added successfully.');
            } else if (editingProduct.approvalStatus === 'rejected' || publishingDraft) {
                if (p.approvalStatus === 'approved') {
                    toast.success('Product approved automatically — it is now live on the marketplace.');
                } else if (publishingDraft && p.approvalStatus === 'pending') {
                    toast.success('Product submitted — admin will review and assign a SKU before it goes live.');
                } else {
                    toast.success('Sent for admin review — we will notify you once approved.');
                }
            } else if (editingProduct.approvalStatus === 'pending') {
                if (p.approvalStatus === 'approved') {
                    toast.success('Product approved automatically — it is now live on the marketplace.');
                } else {
                    toast.success('Product updated (still pending review).');
                }
            } else if (p.approvalStatus === 'pending_edit') {
                toast.success(
                    'Image sent for review — your current image stays live until an admin approves it.',
                );
            } else {
                toast.success('Product updated.');
            }
            const cat = categories.find(c => c.id === p.categoryId);
            if (editingProduct) {
                // Merge updated fields into the existing entry
                setProducts(prev => prev.map(existing => existing.id === p.id ? {
                    ...existing,
                    basePrice: Number(p.basePrice),
                    originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
                    packSize: p.packSize ?? null,
                    unit: p.unit ?? null,
                    imageUrl: p.imageUrl ?? null,
                    isActive: p.isActive ?? existing.isActive,
                    description: p.description ?? null,
                    creditEligible: true,
                    isFeatured: p.isFeatured ?? existing.isFeatured,
                    categoryName: cat?.name ?? existing.categoryName,
                    categorySlug: cat?.slug ?? existing.categorySlug,
                    sku: p.sku ?? null,
                    hsn: p.hsn ?? null,
                    brand: p.brand ?? null,
                    barcode: p.barcode ?? null,
                    taxPercent: p.taxPercent != null ? Number(p.taxPercent) : null,
                    minOrderQty: p.minOrderQty ?? existing.minOrderQty,
                    tags: p.tags ?? null,
                    approvalStatus: p.approvalStatus ?? existing.approvalStatus,
                    approvalNote: p.approvalNote ?? null,
                    pendingEditPayload:
                        p.pendingEditPayload && typeof p.pendingEditPayload === 'object'
                            ? (p.pendingEditPayload as Record<string, unknown>)
                            : p.approvalStatus === 'pending_edit'
                                ? existing.pendingEditPayload ?? null
                                : null,
                    listingStatus: p.listingStatus ?? 'submitted',
                    countryOfOrigin: p.countryOfOrigin ?? existing.countryOfOrigin ?? null,
                    shelfLifeDays:
                        p.shelfLifeDays != null ? Number(p.shelfLifeDays) : existing.shelfLifeDays ?? null,
                    vegNonVeg: p.vegNonVeg ?? existing.vegNonVeg ?? null,
                    storageType: p.storageType ?? existing.storageType ?? null,
                    vendorSku: p.vendorSku ?? existing.vendorSku ?? null,
                    // After auto-unlink, list must show saved Product values (not brand overlay).
                    ...(unlinked.length > 0
                        ? {
                            brandMappings: [],
                            name: p.name ?? existing.name,
                            slug: p.slug ?? existing.slug,
                            images: p.images ?? existing.images ?? null,
                        }
                        : {}),
                } : existing));
            } else {
                // Prepend new product so it appears at the top immediately
                const optimistic: VendorProduct = {
                    id: p.id,
                    name: p.name,
                    slug: p.slug,
                    basePrice: Number(p.basePrice),
                    originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
                    packSize: p.packSize ?? null,
                    unit: p.unit ?? null,
                    imageUrl: p.imageUrl ?? null,
                    isActive: p.isActive ?? true,
                    isFeatured: p.isFeatured ?? false,
                    description: p.description ?? null,
                    creditEligible: true,
                    categoryName: cat?.name ?? '',
                    categorySlug: cat?.slug ?? '',
                    in_stock: false,
                    qty_available: 0,
                    sku: p.sku ?? null,
                    hsn: p.hsn ?? null,
                    brand: p.brand ?? null,
                    barcode: p.barcode ?? null,
                    taxPercent: p.taxPercent != null ? Number(p.taxPercent) : null,
                    minOrderQty: p.minOrderQty ?? 1,
                    tags: p.tags ?? null,
                    images: p.images ?? null,
                    approvalStatus: p.approvalStatus ?? 'pending',
                    approvalNote: p.approvalNote ?? null,
                    listingStatus: p.listingStatus ?? 'submitted',
                };
                setProducts(prev => [optimistic, ...prev]);
            }

            // Background refetch to sync with server (no loading spinner)
            fetchProducts(false);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Save failed';
            applyServerError(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
        const isNewSubmission = !editingProduct && !masterProductId && !basedOnProductId && !basedOnBrandMasterProductId;
        const publishingDraft = editingProduct?.listingStatus === 'draft';
        const needsCategory =
            (isNewSubmission || publishingDraft) &&
            !masterProductId &&
            !basedOnProductId &&
            !basedOnBrandMasterProductId;
        // Must mirror the rendered identity: the catalog-linked layout hides the
        // standalone SKU input and binds POS to vendorSku.
        const requireVendorSku = !!(
            masterProductId || basedOnBrandMasterProductId || basedOnProductId
        );

        const errors = validateProductEssentials(
            {
                ...form,
                sku: requireVendorSku ? form.vendorSku : form.sku,
            },
            {
                portal: 'vendor',
                requireVendorSku,
                requireBasePrice: true,
                skipCategory: !needsCategory,
            },
        );

        if (Object.keys(errors).length > 0) {
            setFormError('');
            setFieldErrors(errors);
            focusFirstProductFormError(errors);
            const firstMsg = Object.values(errors)[0];
            if (firstMsg) toast.error(firstMsg);
            return;
        }

        const liveMapping = editingProduct?.brandMappings?.[0];
        const brandMaster = editBrandMasterProduct ?? liveMapping?.brandMasterProduct ?? null;
        if (editingProduct && liveMapping?.id && brandMaster) {
            const body = buildProductBody({ isDraft: false });
            if (brandOverrideDeviations(body, brandMaster).length > 0) {
                setShowUnlinkConfirm(true);
                return;
            }
        }

        await performProductSave();
    };

    /* ---- Toggle active ---- */

    const toggleActive = async (product: VendorProduct) => {
        try {
            const res = await fetch(`/api/v1/vendor/products/${product.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !product.isActive }),
            });
            const json = await res.json();
            if (json.success) {
                setProducts(prev => prev.map(p => p.id === product.id ? { ...p, isActive: !p.isActive } : p));
            }
        } catch (err) {
            console.error('Toggle failed:', err);
        }
    };

    /* ---- Toggle featured ---- */

    const toggleFeatured = async (product: VendorProduct) => {
        // Optimistic update
        setProducts(prev => prev.map(p => p.id === product.id ? { ...p, isFeatured: !p.isFeatured } : p));
        try {
            const res = await fetch(`/api/v1/vendor/products/${product.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isFeatured: !product.isFeatured }),
            });
            const json = await res.json();
            if (!json.success) {
                // Revert on error
                setProducts(prev => prev.map(p => p.id === product.id ? { ...p, isFeatured: product.isFeatured } : p));
                toast.error('Failed to update featured status');
            }
        } catch {
            // Revert on error
            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, isFeatured: product.isFeatured } : p));
            toast.error('Failed to update featured status');
        }
    };

    /* ---- Unlink brand mapping (restore supplier values on storefront) ---- */

    const handleUnlinkMapping = async (product: VendorProduct, e?: React.MouseEvent) => {
        e?.stopPropagation();
        const mappingId = product.brandMappings?.[0]?.id;
        if (!mappingId) return;
        try {
            const res = await fetch(`/api/v1/vendor/brand-mappings/${mappingId}`, { method: 'DELETE' });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Unlink failed');
            toast.success('Unlinked — supplier values restored');
            setEditBrandMasterProduct(null);
            await fetchProducts(false);
            // Re-open edit panel without brand overlay so form shows saved Product values.
            if (editingProduct?.id === product.id && isPanelOpen) {
                await openEditPanel({ ...product, brandMappings: [] });
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Unlink failed');
        }
    };

    /* ---- Delete product ---- */

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/v1/vendor/products/${deleteTarget.id}`, { method: 'DELETE' });
            const json = await res.json();
            if (json.success) {
                setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
            }
        } catch (err) {
            console.error('Delete failed:', err);
        } finally {
            setDeleting(false);
            setDeleteTarget(null);
        }
    };

    /* ---- Row selection (Bulk Update Engine) ---- */

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const pageIds = paginatedProducts.map(p => p.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
    const toggleSelectPage = () => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allPageSelected) pageIds.forEach(id => next.delete(id));
            else pageIds.forEach(id => next.add(id));
            return next;
        });
    };

    /* ---- Bulk CSV import ---- */

    const parseImportCsv = (text: string) => {
        const lines = text.trim().split('\n').filter(Boolean);
        const rows = lines.map(line => {
            const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
            const [name, sku, rawPrice, packSize, unit] = parts;
            const basePrice = parseFloat(rawPrice ?? '');
            const error = !name ? 'Missing name' : !sku ? 'Missing SKU' : isNaN(basePrice) ? 'Invalid price' : undefined;
            return { name: name ?? '', sku: sku ?? '', basePrice: isNaN(basePrice) ? 0 : basePrice, packSize, unit, error };
        }).filter(r => r.sku.toLowerCase() !== 'sku' && r.name.toLowerCase() !== 'name'); // skip header
        setImportRows(rows);
    };

    const handleImportFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = e => parseImportCsv(e.target?.result as string);
        reader.readAsText(file);
    };

    const handleBulkImport = async () => {
        const validRows = importRows.filter(r => !r.error);
        if (validRows.length === 0) { toast.error('No valid rows to import'); return; }
        setImportSaving(true);
        try {
            const res = await fetch('/api/v1/vendor/products/bulk-import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows: validRows }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Failed');
            toast.success(`Imported: ${json.created} created, ${json.updated} updated`);
            setShowBulkImport(false);
            setImportRows([]);
            fetchProducts(false);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setImportSaving(false);
        }
    };

    const handleExport = (format: 'csv' | 'xlsx') => {
        const params = new URLSearchParams();
        params.set('format', format);
        if (statusFilter !== 'all') {
            if (statusFilter === 'active') params.set('isActive', 'true');
            if (statusFilter === 'inactive') params.set('isActive', 'false');
        }
        if (searchQuery) params.set('search', searchQuery);

        window.open(`/api/v1/vendor/products/export?${params.toString()}`, '_blank');
    };

    /* ---- Derived values ---- */

    const grossRate = calcGrossRate(form.basePrice, form.taxPercent);
    const taxAmount = calcTaxAmount(form.basePrice, form.taxPercent);
    const identityFromCatalog = !!masterProductId || !!basedOnProductId || !!basedOnBrandMasterProductId;
    const isNewSubmission = !editingProduct && !identityFromCatalog;
    const savings = calcSavingsPercent(grossRate, form.originalPrice);

    /* ------------------------------------------------------------------ */
    /*  Render                                                             */
    /* ------------------------------------------------------------------ */

    return (
        <div className="space-y-6 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[28px] font-bold text-[#000000] leading-none mb-1">Products</h1>
                    <p className="text-[#000000] text-[13px] font-medium opacity-70">Manage your product catalog</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative w-full md:w-[220px]">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#AEAEAE]" size={15} />
                        <input
                            type="text"
                            placeholder="Search products..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-[40px] w-full bg-white border border-[#EEEEEE] rounded-[10px] pl-10 pr-4 text-[13px] outline-none transition-all placeholder:text-[#AEAEAE] font-medium focus:border-[#299E60]/40 shadow-sm"
                        />
                    </div>

                    <button
                        onClick={() => setShowPriceReplace(true)}
                        className="h-[40px] px-3.5 border border-[#EEEEEE] bg-white rounded-[10px] text-[12px] font-bold text-[#7C7C7C] hover:bg-[#F5F5F5] transition-all flex items-center gap-1.5 shrink-0"
                    >
                        <IndianRupee size={13} className="text-primary" />
                        Price Bulk Update
                    </button>
                    <button
                        onClick={() => setGridOpen(true)}
                        className="h-[40px] px-3.5 border border-[#EEEEEE] bg-white rounded-[10px] text-[12px] font-bold text-[#7C7C7C] hover:bg-[#F5F5F5] transition-all flex items-center gap-1.5 shrink-0"
                    >
                        <FileSpreadsheet size={13} className="text-primary" />
                        Bulk Update
                    </button>

                    {products.some(p => p.listingStatus === 'draft') && (
                        <button
                            type="button"
                            onClick={() => setStatusFilter('drafts')}
                            className="h-[40px] px-3.5 border border-[#EEEEEE] bg-white rounded-[10px] text-[12px] font-bold text-[#4F6BED] hover:bg-[#F0F4FF] transition-all flex items-center gap-1.5 shrink-0"
                        >
                            <Clock size={13} />
                            Drafts ({products.filter(p => p.listingStatus === 'draft').length})
                        </button>
                    )}

                    <button
                        onClick={openAddPanel}
                        className="h-[40px] px-4 bg-primary text-white rounded-[10px] text-[13px] font-bold hover:bg-primary-dark transition-all shadow-sm flex items-center gap-2 shrink-0"
                    >
                        <Plus size={16} />
                        Add Product
                    </button>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 flex-wrap">
                <select
                    aria-label="Filter by brand"
                    value={brandFilter}
                    onChange={(e) => setBrandFilter(e.target.value)}
                    className="h-[34px] px-2 rounded-[8px] text-[12px] font-bold border border-[#EEEEEE] bg-white text-[#7C7C7C]"
                >
                    <option value="">All brands</option>
                    {brandFilterOptions.map((b) => (
                        <option key={b} value={b}>{b}</option>
                    ))}
                </select>
                <select
                    aria-label="Filter by category"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="h-[34px] px-2 rounded-[8px] text-[12px] font-bold border border-[#EEEEEE] bg-white text-[#7C7C7C]"
                >
                    <option value="">All categories</option>
                    {categoryFilterOptions.map(([id, name]) => (
                        <option key={id} value={id}>{name}</option>
                    ))}
                </select>
                {(['all', 'drafts', 'active', 'inactive', 'featured'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setStatusFilter(tab)}
                        className={cn(
                            'h-[34px] px-4 rounded-[8px] text-[12px] font-bold transition-all flex items-center gap-1.5',
                            statusFilter === tab
                                ? tab === 'drafts'
                                    ? 'bg-[#4F6BED] text-white shadow-sm'
                                    : 'bg-primary text-white shadow-sm'
                                : 'bg-white border border-[#EEEEEE] text-[#7C7C7C] hover:bg-[#F5F5F5]'
                        )}
                    >
                        {tab === 'featured' && <Star size={12} className={statusFilter === 'featured' ? 'fill-white' : 'fill-[#AEAEAE] text-[#AEAEAE]'} />}
                        {tab === 'all' ? 'All' : tab === 'drafts' ? 'Drafts' : tab === 'active' ? 'Active' : tab === 'inactive' ? 'Inactive' : 'Featured'}
                        <span className={cn(
                            'ml-0.5 text-[10px] font-[900] px-1.5 py-0.5 rounded-[4px]',
                            statusFilter === tab ? 'bg-white/20 text-white' : 'bg-[#F5F5F5] text-[#AEAEAE]'
                        )}>
                            {tab === 'all' ? products.length :
                             tab === 'drafts' ? products.filter(p => p.listingStatus === 'draft').length :
                             tab === 'active' ? products.filter(p => p.isActive).length :
                             tab === 'inactive' ? products.filter(p => !p.isActive).length :
                             products.filter(p => p.isFeatured).length}
                        </span>
                    </button>
                ))}
            </div>

            {/* Approval filter */}
            <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[11px] font-bold text-[#AEAEAE] uppercase mr-1">Approval:</span>
                {(['all', 'pending', 'rejected', 'approved'] as const).map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setApprovalFilter(tab)}
                        className={cn(
                            'h-[30px] px-3 rounded-[8px] text-[11px] font-bold transition-all flex items-center gap-1.5',
                            approvalFilter === tab
                                ? tab === 'rejected'
                                    ? 'bg-[#E74C3C] text-white shadow-sm'
                                    : tab === 'approved'
                                      ? 'bg-primary text-white shadow-sm'
                                      : tab === 'pending'
                                        ? 'bg-[#F59E0B] text-white shadow-sm'
                                        : 'bg-[#181725] text-white shadow-sm'
                                : 'bg-white border border-[#EEEEEE] text-[#7C7C7C] hover:bg-[#F5F5F5]'
                        )}
                    >
                        {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                        <span className={cn(
                            'text-[10px] font-[900] px-1.5 py-0.5 rounded-[4px]',
                            approvalFilter === tab ? 'bg-white/20 text-white' : 'bg-[#F5F5F5] text-[#AEAEAE]'
                        )}>
                            {tab === 'all'
                                ? products.length
                                : tab === 'pending'
                                    ? products.filter(
                                        (p) =>
                                            p.approvalStatus === 'pending'
                                            || p.approvalStatus === 'pending_edit',
                                    ).length
                                    : products.filter((p) => p.approvalStatus === tab).length}
                        </span>
                    </button>
                ))}
            </div>

            {/* Products Table */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="animate-spin text-primary" size={32} />
                    </div>
                ) : filteredProducts.length === 0 ? (
                    <div className="py-20 text-center">
                        <Package size={40} className="text-[#E5E7EB] mx-auto mb-3" />
                        <p className="text-[14px] font-bold text-[#AEAEAE]">
                            {searchQuery ? `No products matching "${searchQuery}"` : 'No products yet. Add your first product!'}
                        </p>
                    </div>
                ) : (
                    <>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE]">
                                    <th className="pl-6 pr-2 py-4 w-[44px]">
                                        <input
                                            type="checkbox"
                                            checked={allPageSelected}
                                            onChange={toggleSelectPage}
                                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-[#299E60] cursor-pointer"
                                            title="Select all on this page"
                                        />
                                    </th>
                                    <th className="px-6 py-4 text-left text-[12px] font-bold text-[#AEAEAE] uppercase whitespace-nowrap">Product</th>
                                    <th className="px-6 py-4 text-left text-[12px] font-bold text-[#AEAEAE] uppercase whitespace-nowrap w-[160px]">Category</th>
                                    <th className="px-6 py-4 text-center text-[12px] font-bold text-[#AEAEAE] uppercase whitespace-nowrap w-[170px]">Price (Gross)</th>
                                    <th className="px-6 py-4 text-center text-[12px] font-bold text-[#AEAEAE] uppercase whitespace-nowrap w-[96px]">Stock</th>
                                    <th className="px-6 py-4 text-center text-[12px] font-bold text-[#AEAEAE] uppercase whitespace-nowrap w-[132px]">Approval</th>
                                    <th className="px-6 py-4 text-center text-[12px] font-bold text-[#AEAEAE] uppercase whitespace-nowrap w-[116px]">Status</th>
                                    <th className="px-6 py-4 text-center text-[12px] font-bold text-[#AEAEAE] uppercase whitespace-nowrap w-[212px]">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F5F5F5]">
                                {paginatedProducts.map((product) => {
                                    const liveMapping = product.brandMappings?.[0];
                                    const brandMaster = liveMapping?.brandMasterProduct;
                                    const isMapped = Boolean(liveMapping?.id && brandMaster);
                                    const displayName = isMapped ? brandMaster!.name : product.name;
                                    const displayImage =
                                        (isMapped
                                            ? (brandMaster!.imageUrl || brandMaster!.images?.[0] || null)
                                            : null) || product.imageUrl;
                                    const displayPack =
                                        (isMapped ? brandMaster!.packSize : null) || product.packSize;
                                    const displayCategory =
                                        (isMapped ? brandMaster!.categoryRel?.name : null) || product.categoryName;
                                    const showStruckName =
                                        isMapped &&
                                        product.name.trim().toLowerCase() !== brandMaster!.name.trim().toLowerCase();

                                    return (
                                    <tr
                                        key={product.id}
                                        className={cn(
                                            'transition-colors',
                                            product.approvalStatus === 'rejected' && !selectedIds.has(product.id) && 'bg-[#FFF8F8]',
                                            selectedIds.has(product.id) ? 'bg-[#EEF8F1]/50' : 'hover:bg-[#FAFAFA]'
                                        )}
                                    >
                                        <td className="pl-6 pr-2 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(product.id)}
                                                onChange={() => toggleSelect(product.id)}
                                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-[#299E60] cursor-pointer"
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-[44px] h-[44px] rounded-[10px] bg-[#F1F4F9] overflow-hidden shrink-0 flex items-center justify-center">
                                                    {displayImage ? (
                                                        <img src={displayImage} alt={displayName} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Package size={18} className="text-[#AEAEAE]" />
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <p className="text-[14px] font-bold text-[#181725] truncate">{displayName}</p>
                                                        {isMapped && (
                                                            <span
                                                                className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#EEF8F1] text-primary"
                                                                title={
                                                                    brandMaster!.brand?.name
                                                                        ? `Brand override — ${brandMaster!.brand.name}`
                                                                        : 'Brand override'
                                                                }
                                                            >
                                                                Mapped
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[12px] text-[#7C7C7C] truncate min-h-[18px] leading-[18px]">
                                                        {displayPack}
                                                        {displayPack && showStruckName && <span className="mx-1.5 text-[#E5E7EB]">|</span>}
                                                        {showStruckName && (
                                                            <span className="text-[#AEAEAE] line-through">{product.name}</span>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-[13px] text-[#7C7C7C] font-medium">{displayCategory || '\u2014'}</td>
                                        <td className="px-6 py-4 text-center">
                                             <div className="flex flex-col items-center justify-center">
                                                 <span className="text-[14px] font-black text-[#181725] tabular-nums">
                                                     ₹{(Number(product.basePrice) * (1 + (product.taxPercent ?? 0) / 100)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                 </span>
                                                 <span className="text-[10px] text-[#7C7C7C] font-semibold mt-0.5 whitespace-nowrap bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-[4px]">
                                                     ₹{Number(product.basePrice).toFixed(2)} + {product.taxPercent ?? 0}% GST
                                                 </span>
                                             </div>
                                         </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={cn(
                                                'text-[12px] font-bold px-2.5 py-1 rounded-[6px]',
                                                product.qty_available > 0
                                                    ? 'bg-[#EEF8F1] text-primary'
                                                    : 'bg-[#F8F9FB] text-[#AEAEAE]'
                                            )}>
                                                {product.qty_available > 0 ? product.qty_available : '0'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <span className={cn(
                                                    'text-[11px] font-[900] px-2.5 py-1.5 rounded-[6px] uppercase',
                                                    product.approvalStatus === 'approved' ? 'bg-[#EEF8F1] text-primary' :
                                                    product.approvalStatus === 'rejected' ? 'bg-[#FFF0F0] text-[#E74C3C]' :
                                                    'bg-[#FFF7E6] text-[#F59E0B]'
                                                )}>
                                                    {product.approvalStatus === 'approved' ? 'Approved' :
                                                     product.approvalStatus === 'rejected' ? 'Rejected' :
                                                     product.approvalStatus === 'pending_edit' ? 'Edit Pending' : 'Pending'}
                                                </span>
                                                {product.approvalStatus === 'rejected' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void openEditPanel(product)}
                                                        className="text-[10px] font-bold text-[#E74C3C] hover:underline"
                                                    >
                                                        View reason
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={cn(
                                                'text-[11px] font-[900] px-2.5 py-1.5 rounded-[6px] uppercase',
                                                product.listingStatus === 'draft'
                                                    ? 'bg-[#F0F4FF] text-[#4F6BED]'
                                                    : product.isActive
                                                        ? 'bg-[#EEF8F1] text-primary'
                                                        : 'bg-[#FFF0F0] text-[#E74C3C]'
                                            )}>
                                                {product.listingStatus === 'draft'
                                                    ? 'Draft'
                                                    : !product.isActive && product.approvalStatus === 'approved'
                                                        ? 'Archived'
                                                    : product.isActive
                                                        ? 'Active'
                                                        : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <button
                                                    onClick={() => toggleFeatured(product)}
                                                    className={cn(
                                                        'p-2 rounded-[8px] transition-colors',
                                                        product.isFeatured
                                                            ? 'text-yellow-500 hover:bg-yellow-50'
                                                            : 'text-[#AEAEAE] hover:bg-[#F5F5F5]'
                                                    )}
                                                    title={product.isFeatured ? 'Remove from featured' : 'Mark as featured'}
                                                >
                                                    <Star
                                                        size={16}
                                                        className={product.isFeatured ? 'fill-yellow-400 text-yellow-500' : ''}
                                                    />
                                                </button>
                                                <button
                                                    onClick={() => openEditPanel(product)}
                                                    className="p-2 hover:bg-[#EEF8F1] rounded-[8px] transition-colors text-primary"
                                                    title="Edit"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                {/* Slot stays reserved so the toggle/delete controls line up on every row */}
                                                <div className="w-[32px] shrink-0 flex justify-center">
                                                    {liveMapping?.id && (
                                                        <button
                                                            onClick={(e) => void handleUnlinkMapping(product, e)}
                                                            className="p-2 hover:bg-[#FFF0F0] rounded-[8px] transition-colors text-[#AEAEAE] hover:text-[#E74C3C]"
                                                            title="Unlink — revert to supplier values"
                                                        >
                                                            <Unlink size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => toggleActive(product)}
                                                    className="relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
                                                    style={{ backgroundColor: product.isActive ? '#299E60' : '#D1D5DB' }}
                                                    title={product.isActive ? 'Archive (hide from store)' : 'Unarchive'}
                                                >
                                                    <span
                                                        className="inline-block h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform duration-200"
                                                        style={{ transform: product.isActive ? 'translateX(20px)' : 'translateX(3px)' }}
                                                    />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteTarget(product)}
                                                    className="p-2 hover:bg-[#FFF0F0] rounded-[8px] transition-colors text-[#AEAEAE] hover:text-[#E74C3C]"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-between px-6 py-4 border-t border-[#F5F5F5] flex-wrap gap-4">
                        {/* Count */}
                        <div className="flex items-center gap-4 flex-wrap">
                            <p className="text-[13px] text-[#7C7C7C] font-medium">
                                Showing{' '}
                                <span className="text-[#181725] font-bold">
                                    {(safeCurrentPage - 1) * pageSize + 1}–{Math.min(safeCurrentPage * pageSize, filteredProducts.length)}
                                </span>
                                {' '}of{' '}
                                <span className="text-[#181725] font-bold">{filteredProducts.length}</span>
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

                        {/* Page numbers */}
                        {totalPages > 1 && (
                            <div className="flex items-center gap-1">
                                {/* Prev */}
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={safeCurrentPage === 1}
                                    className="w-[34px] h-[34px] flex items-center justify-center rounded-[8px] border border-[#EEEEEE] text-[#7C7C7C] hover:bg-[#F5F5F5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                </button>

                                {pageRange.map((item, idx) =>
                                    item === 'gap' ? (
                                        <span key={`gap-${idx}`} className="w-[34px] h-[34px] flex items-center justify-center text-[#AEAEAE] text-[13px]">…</span>
                                    ) : (
                                        <button
                                            key={item}
                                            onClick={() => setCurrentPage(item)}
                                            className={cn(
                                                'w-[34px] h-[34px] flex items-center justify-center rounded-[8px] text-[13px] font-bold transition-colors',
                                                item === safeCurrentPage
                                                    ? 'bg-primary text-white'
                                                    : 'border border-[#EEEEEE] text-[#7C7C7C] hover:bg-[#F5F5F5]'
                                            )}
                                        >
                                            {item}
                                        </button>
                                    )
                                )}

                                {/* Next */}
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={safeCurrentPage === totalPages}
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

            {/* ============================================================ */}
            {/*  Slide-over Panel                                             */}
            {/* ============================================================ */}
            {isPanelOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-[60] bg-black/40 transition-opacity"
                        onClick={(e) => { if (e.target === e.currentTarget) requestClosePanel(); }}
                    />

                    {/* Panel */}
                    <div
                        ref={panelRef}
                        className="fixed top-0 right-0 h-full w-full xl:max-w-[min(100%,1200px)] bg-white z-[70] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
                    >
                        {/* Panel Header */}
                        <div className="flex items-center justify-between px-4 lg:px-6 py-4 border-b border-[#EEEEEE] shrink-0">
                            <div>
                                <h2 className="text-[22px] font-[900] text-[#181725]">
                                    {editingProduct ? 'Edit Product' : 'Add Product'}
                                </h2>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {editingProduct && (
                                        <p className="text-[12px] text-[#AEAEAE] font-medium">
                                            ID: {editingProduct.id}
                                        </p>
                                    )}
                                    {editingProduct?.brandMappings?.[0]?.id && (
                                        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#EEF8F1] text-primary">
                                            Mapped
                                        </span>
                                    )}
                                    {(draftSaving || draftSaveError || (draftSavedOnce && editingProduct?.listingStatus === 'draft')) && (
                                        <span className={cn(
                                            'inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-[6px]',
                                            draftSaveError
                                                ? 'text-[#E74C3C] bg-[#FFF0F0]'
                                                : 'text-[#7C7C7C] bg-[#F5F5F5]',
                                        )}>
                                            {draftSaving ? (
                                                <>
                                                    <Loader2 size={10} className="animate-spin" />
                                                    Saving draft…
                                                </>
                                            ) : draftSaveError ? (
                                                <>
                                                    {draftSaveError}
                                                    <button
                                                        type="button"
                                                        className="underline ml-1"
                                                        onClick={() => void saveDraftRef.current(true)}
                                                    >
                                                        Retry
                                                    </button>
                                                </>
                                            ) : (
                                                'Draft saved'
                                            )}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                {editingProduct?.brandMappings?.[0]?.id && (
                                    <button
                                        type="button"
                                        onClick={(e) => void handleUnlinkMapping(editingProduct, e)}
                                        disabled={loadingProduct || saving}
                                        className="h-[40px] px-3 rounded-[12px] flex items-center gap-1.5 hover:bg-[#FFF0F0] text-[#7C7C7C] hover:text-[#E74C3C] transition-all disabled:opacity-50"
                                        title="Unlink — revert to supplier values"
                                    >
                                        <Unlink size={16} />
                                        <span className="text-[13px] font-bold">Unlink</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={requestClosePanel}
                                    className="w-[40px] h-[40px] rounded-[12px] flex items-center justify-center hover:bg-[#F8F9FB] text-[#7C7C7C] hover:text-[#181725] transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-1 min-h-0">
                        <div className="flex-1 overflow-y-auto bg-[#F8F9FB] px-4 lg:px-8 py-4">
                            <form id="vendor-product-form" onSubmit={handleSubmit} className="space-y-4">
                                    {loadingProduct ? (
                                        <div className="flex items-center justify-center py-32">
                                            <Loader2 className="animate-spin text-primary" size={32} />
                                        </div>
                                    ) : (
                                    <>
                                    {/* Error */}
                                    {formError && (
                                        <div className="bg-[#FFF0F0] text-[#E74C3C] text-[13px] font-medium p-3.5 rounded-[10px] flex items-center gap-2">
                                            <Info size={16} className="shrink-0" />
                                            {formError}
                                        </div>
                                    )}

                                    {editingProduct?.approvalStatus === 'rejected' && (
                                        <div className="bg-[#FFF0F0] border border-[#F5C6C6] text-[#C0392B] text-[13px] p-4 rounded-[10px] flex items-start gap-3">
                                            <AlertCircle size={18} className="shrink-0 mt-0.5" />
                                            <div className="space-y-1">
                                                <p className="font-bold text-[#181725]">Product rejected</p>
                                                <p className="text-[#7C7C7C]">
                                                    {editingProduct.approvalNote?.trim() || 'No reason provided.'}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {editingProduct?.approvalStatus === 'pending_edit' && (() => {
                                        const pending = editingProduct.pendingEditPayload;
                                        const queuedUrl =
                                            typeof pending?.imageUrl === 'string' && pending.imageUrl.trim()
                                                ? pending.imageUrl.trim()
                                                : Array.isArray(pending?.images)
                                                    ? pending.images.find(
                                                        (u): u is string => typeof u === 'string' && u.trim().length > 0,
                                                    )
                                                    : undefined;
                                        if (!queuedUrl) return null;
                                        return (
                                            <div className="bg-[#FFF7E6] border border-[#F5D78E] text-[#8B6914] text-[13px] p-4 rounded-[10px] flex items-start gap-3">
                                                <Clock size={18} className="shrink-0 mt-0.5 text-[#F59E0B]" />
                                                <div className="flex-1 space-y-2 min-w-0">
                                                    <p className="font-bold text-[#181725]">Image edit pending review</p>
                                                    <p className="text-[#7C7C7C]">
                                                        Your current image stays live on the storefront until an admin approves the new one.
                                                    </p>
                                                    <div className="flex items-center gap-2 pt-1">
                                                        <img
                                                            src={queuedUrl}
                                                            alt="Queued product image"
                                                            className="w-14 h-14 rounded-[8px] object-cover border border-[#F5D78E] bg-white"
                                                        />
                                                        <span className="text-[11px] font-bold text-[#F59E0B] uppercase tracking-wide">
                                                            Queued
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {editingProduct?.brandMappings?.[0]?.id && (
                                        <div className="rounded-[10px] bg-[#EEF8F1] border border-[#299E60]/30 px-4 py-3 flex items-start gap-3">
                                            <Info size={16} className="shrink-0 mt-0.5 text-primary" />
                                            <p className="text-[12px] font-medium text-primary">
                                                Brand override — storefront shows the brand SKU. Price and stock edits keep the link. Changing brand details (name, pack, HSN, images, etc.) and saving will unlink this product so your values go live.
                                            </p>
                                        </div>
                                    )}

                                    <ProductEssentialsFields
                                        portal="vendor"
                                        identityMode={
                                            masterProductId || basedOnBrandMasterProductId || basedOnProductId
                                                ? 'catalog-linked'
                                                : 'standalone'
                                        }
                                        nameField={renderProductNameField(
                                            masterProductId || basedOnBrandMasterProductId || basedOnProductId
                                                ? 'sm:col-span-2 xl:col-span-4'
                                                : 'sm:col-span-2 xl:col-span-5',
                                        )}
                                        catalogBanner={
                                            (!editingProduct || editingProduct.approvalStatus === 'rejected') && identityFromCatalog ? (
                                                <div className="rounded-[10px] bg-[#EEF8F1] border border-[#299E60]/30 px-4 py-3 flex items-center justify-between gap-3">
                                                    <p className="text-[12px] font-medium text-primary">
                                                        {basedOnBrandMasterProductId
                                                            ? `Linked to brand catalog — ${catalogSearch || form.name}`
                                                            : masterProductId
                                                                ? `Linked to master catalog — ${catalogSearch || form.name}`
                                                                : `Based on approved product — ${catalogSearch || form.name}`}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={clearCatalogSelection}
                                                        className="text-[12px] font-bold text-primary hover:underline shrink-0"
                                                    >
                                                        Change
                                                    </button>
                                                </div>
                                            ) : undefined
                                        }
                                        sku={form.sku}
                                        hsn={form.hsn}
                                        brand={form.brand}
                                        catalogSku={form.catalogSku}
                                        vendorSku={form.vendorSku}
                                        onSkuChange={(v) => updateField('sku', v)}
                                        onHsnChange={(v) => updateField('hsn', v)}
                                        onBrandChange={(v) => updateField('brand', v)}
                                        onVendorSkuChange={(v) => updateField('vendorSku', v)}
                                        categoryIds={form.categoryIds}
                                        onCategoryIdsChange={(ids) => updateField('categoryIds', ids)}
                                        categoryEndpoint="/api/v1/vendor/categories/suggest"
                                        categoryPickerKey={String(categoryPickerKey)}
                                        categoryDisabled={false}
                                        lockParent={false}
                                        categoryHelper={
                                            masterProductId ? (
                                                <p className="text-[11px] text-[#7C7C7C] font-medium mt-1">
                                                    Seeded from the master catalog — you can change categories for this listing.
                                                </p>
                                            ) : undefined
                                        }
                                        imageUrl={form.imageUrl}
                                        onImageUrlChange={(url) => updateField('imageUrl', url)}
                                        pricing={{
                                            basePrice: form.basePrice,
                                            originalPrice: form.originalPrice,
                                            taxPercent: form.taxPercent,
                                            taxabilityType: form.taxabilityType,
                                            exemptionReason: form.exemptionReason,
                                            taxable: form.taxable,
                                        }}
                                        onBasePriceChange={(v) => updateField('basePrice', v)}
                                        onOriginalPriceChange={(v) => updateField('originalPrice', v)}
                                        onTaxPercentChange={(v) => updateField('taxPercent', v)}
                                        onTaxabilityTypeChange={(v) => updateField('taxabilityType', v)}
                                        onExemptionReasonChange={(v) => updateField('exemptionReason', v)}
                                        onTaxableChange={(v) => updateField('taxable', v)}
                                        brands={brands}
                                        onSuggestBrand={suggestBrand}
                                        brandSuggesting={brandSuggesting}
                                        errors={fieldErrors}
                                        taxAmount={taxAmount}
                                        savings={savings}
                                    >
                                            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                                                <div id="ff-countryOfOrigin">
                                                    <FieldLabel required>Country of Origin</FieldLabel>
                                                    <input type="text" value={form.countryOfOrigin} onChange={e => updateField('countryOfOrigin', e.target.value)} className={cn(inputCls, fieldErrors.countryOfOrigin && 'border-[#E74C3C]')} />
                                                </div>
                                                <div id="ff-vegNonVeg">
                                                    <FieldLabel required>Veg / Non-Veg</FieldLabel>
                                                    <select value={form.vegNonVeg} onChange={e => updateField('vegNonVeg', e.target.value as '' | 'veg' | 'nonveg' | 'egg')} className={cn(selectCls, fieldErrors.vegNonVeg && 'border-[#E74C3C]')}>
                                                        <option value="">Select…</option>
                                                        <option value="veg">Veg</option>
                                                        <option value="nonveg">Non-Veg</option>
                                                        <option value="egg">Egg</option>
                                                    </select>
                                                </div>
                                                <div id="ff-storageType">
                                                    <FieldLabel required>Storage type</FieldLabel>
                                                    <select value={form.storageType} onChange={e => updateField('storageType', e.target.value)} className={cn(selectCls, fieldErrors.storageType && 'border-[#E74C3C]')}>
                                                        <option value="">Select…</option>
                                                        <option value="ambient">Ambient</option>
                                                        <option value="refrigerated">Refrigerated</option>
                                                        <option value="frozen">Frozen</option>
                                                        <option value="dry">Dry Storage</option>
                                                        <option value="cool">Cool / Dark</option>
                                                    </select>
                                                </div>
                                                <div id="ff-shelfLifeDays">
                                                    <FieldLabel required>Shelf Life (days)</FieldLabel>
                                                    <input type="number" min="0" value={form.shelfLifeDays} onChange={e => updateField('shelfLifeDays', e.target.value)} className={cn(inputCls, fieldErrors.shelfLifeDays && 'border-[#E74C3C]')} />
                                                </div>
                                                <div id="ff-minOrderQty">
                                                    <FieldLabel required>MOQ</FieldLabel>
                                                    <input type="number" min="1" value={form.minOrderQty} onChange={e => updateField('minOrderQty', e.target.value)} className={cn(inputCls, fieldErrors.minOrderQty && 'border-[#E74C3C]')} />
                                                </div>
                                            </div>

                                            <div id="ff-substituteIds">
                                                <FieldLabel>Substitute Mapping</FieldLabel>
                                                <p className="text-[11px] text-[#AEAEAE] mb-2">Optional — suggest alternate products if out of stock</p>
                                                <SubstituteProductPicker
                                                    selectedIds={form.substituteIds}
                                                    currentProductId={editingProduct?.id}
                                                    products={products}
                                                    onChange={(ids) => updateField('substituteIds', ids)}
                                                />
                                                {fieldErrors.substituteIds && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{fieldErrors.substituteIds}</p>}
                                            </div>
                                    </ProductEssentialsFields>

                                <FormSection title="Bulk pricing tiers" icon={<Tag size={16} />} sectionId="bulk" className="!p-4 !space-y-3">
                                            <div className="flex items-start justify-between gap-4 mb-2">
                                                <p className="text-[12px] text-[#AEAEAE] font-medium">
                                                    Each tier applies from its min quantity. Up to 3 tiers — taxable ex-GST; gross uses product GST %.
                                                </p>
                                                {form.priceSlabs.length < 3 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setForm(prev => ({
                                                            ...prev,
                                                            priceSlabs: [...prev.priceSlabs, { minQty: '', price: '' }],
                                                        }))}
                                                        className="h-[32px] px-3.5 bg-[#EEF8F1] hover:bg-[#53B175] text-primary hover:text-white rounded-[8px] text-[12px] font-bold flex items-center gap-1.5 transition-colors shrink-0"
                                                    >
                                                        <Plus size={13} /> Add Bulk Tier
                                                    </button>
                                                )}
                                            </div>

                                            <div className="space-y-4">
                                                {form.priceSlabs.map((slab, index) => (
                                                    <div key={index} className="rounded-[14px] border border-[#EEEEEE] overflow-hidden">
                                                        <div className="flex items-center justify-between px-5 py-3 bg-[#FAFAFA] border-b border-[#EEEEEE]">
                                                            <div className="flex items-center gap-2.5">
                                                                <span className="w-[28px] h-[28px] rounded-full bg-primary text-white text-[12px] font-bold flex items-center justify-center">
                                                                    {index + 1}
                                                                </span>
                                                                <h4 className="text-[14px] font-bold text-[#181725]">Bulk Tier {index + 1}</h4>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                aria-label={`Remove bulk tier ${index + 1}`}
                                                                onClick={() => setForm(prev => ({
                                                                    ...prev,
                                                                    priceSlabs: prev.priceSlabs.filter((_, idx) => idx !== index),
                                                                }))}
                                                                className="p-1.5 hover:bg-[#FFF0F0] rounded-[6px] transition-colors text-[#AEAEAE] hover:text-[#E74C3C]"
                                                            >
                                                                <Trash2 size={15} />
                                                            </button>
                                                        </div>

                                                        <div className="p-5">
                                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                                <div>
                                                                    <FieldLabel>Min Quantity</FieldLabel>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={slab.minQty}
                                                                        onChange={e => setForm(prev => ({
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
                                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE] text-[14px]">₹</span>
                                                                        <input
                                                                            type="number"
                                                                            step="0.01"
                                                                            min="0"
                                                                            value={slab.price}
                                                                            onChange={e => setForm(prev => ({
                                                                                ...prev,
                                                                                priceSlabs: prev.priceSlabs.map((s, idx) => idx === index ? { ...s, price: e.target.value } : s),
                                                                            }))}
                                                                            className={cn(inputCls, 'pl-8')}
                                                                            placeholder="0.00"
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <FieldLabel>Gross (incl. GST)</FieldLabel>
                                                                    <div className="relative">
                                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary font-bold text-[14px]">₹</span>
                                                                        <input
                                                                            type="text"
                                                                            readOnly
                                                                            value={calcGrossRate(slab.price, form.taxPercent)}
                                                                            className={cn(inputCls, 'pl-8 font-bold text-primary bg-[#EEF8F1]/40')}
                                                                            placeholder="—"
                                                                        />
                                                                    </div>
                                                                    <p className="text-[11px] text-[#AEAEAE] mt-1">
                                                                        Using product tax {form.taxPercent || '0'}%
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}

                                                {form.priceSlabs.length === 0 && (
                                                    <div className="text-center py-8 text-[#AEAEAE]">
                                                        <BarChart3 size={32} className="mx-auto mb-2 text-[#E5E7EB]" />
                                                        <p className="text-[13px] font-medium">No bulk tiers yet. Click &quot;Add Bulk Tier&quot; to add quantity-based pricing.</p>
                                                    </div>
                                                )}
                                            </div>
                                </FormSection>

                                <FormSection title="Status & availability" icon={<Clock size={16} />} sectionId="status" className="!p-4 !space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <FieldLabel>Item Status</FieldLabel>
                                                <select
                                                    value={form.itemStatus}
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
                                                        checked={form.activeOnlineStore}
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

                                <FormSection title="Accounting" icon={<SettingsIcon size={16} />} sectionId="accounting" className="!p-4 !space-y-3">
                                            
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <FieldLabel>Sales Account</FieldLabel>
                                                    <input
                                                        type="text"
                                                        value={form.account}
                                                        onChange={e => updateField('account', e.target.value)}
                                                        placeholder="Sales account name"
                                                        className={inputCls}
                                                    />
                                                </div>
                                                <div>
                                                    <FieldLabel>Sales Account Code</FieldLabel>
                                                    <input
                                                        type="text"
                                                        value={form.accountCode}
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
                                                        value={form.inventoryAccount}
                                                        onChange={e => updateField('inventoryAccount', e.target.value)}
                                                        placeholder="Inventory account name"
                                                        className={inputCls}
                                                    />
                                                </div>
                                                <div>
                                                    <FieldLabel>Inventory Account Code</FieldLabel>
                                                    <input
                                                        type="text"
                                                        value={form.inventoryAccountCode}
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
                                                        value={form.platformCommission}
                                                        onChange={e => updateField('platformCommission', e.target.value)}
                                                        placeholder="0.00"
                                                        className={inputCls}
                                                    />
                                                    <p className="mt-1 text-[11px] text-[#7C7C7C]">Accounting metadata only — does not change settlement math.</p>
                                                </div>
                                            </div>
                                </FormSection>

                                <FormSection title="Inventory" icon={<BarChart3 size={16} />} sectionId="inventory" className="!p-4 !space-y-3">
                                            
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <FieldLabel>Opening Stock</FieldLabel>
                                                    <input
                                                        type="number"
                                                        value={form.openingStock}
                                                        onChange={e => updateField('openingStock', e.target.value)}
                                                        placeholder="0"
                                                        className={inputCls}
                                                    />
                                                </div>
                                                <div>
                                                    <FieldLabel>Reorder Point</FieldLabel>
                                                    <input
                                                        type="number"
                                                        value={form.reorderPoint}
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
                                                        value={form.valuationMethod}
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
                                                            checked={form.trackInventory}
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

                                <FormSection title="Packaging & dimensions" icon={<Package size={16} />} sectionId="packaging" className="!p-4 !space-y-3">
                                            
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <FieldLabel>Pack Size</FieldLabel>
                                                    <input
                                                        type="text"
                                                        value={form.packSize}
                                                        onChange={e => updateField('packSize', e.target.value)}
                                                        className={inputCls}
                                                        placeholder="e.g. 1 kg, 500 ml"
                                                    />
                                                </div>
                                                <div>
                                                    <FieldLabel>Unit</FieldLabel>
                                                    <select
                                                        value={form.unit}
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
                                                        value={form.packageWeight}
                                                        onChange={e => updateField('packageWeight', e.target.value)}
                                                        placeholder="0.00"
                                                        className={inputCls}
                                                    />
                                                </div>
                                                <div>
                                                    <FieldLabel>Weight Unit</FieldLabel>
                                                    <select
                                                        value={form.weightUnit}
                                                        onChange={e => updateField('weightUnit', e.target.value)}
                                                        className={selectCls}
                                                    >
                                                        {WEIGHT_UNIT_OPTIONS.map(u => (
                                                            <option key={u} value={u}>{u}</option>
                                                        ))}
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
                                                            value={form.packageLength}
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
                                                            value={form.packageWidth}
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
                                                            value={form.packageHeight}
                                                            onChange={e => updateField('packageHeight', e.target.value)}
                                                            placeholder="0.00"
                                                            className={inputCls}
                                                        />
                                                    </div>
                                                    <div>
                                                        <FieldLabel>Dimension Unit</FieldLabel>
                                                        <select
                                                            value={form.dimensionUnit}
                                                            onChange={e => updateField('dimensionUnit', e.target.value)}
                                                            className={selectCls}
                                                        >
                                                            {DIMENSION_UNIT_OPTIONS.map(u => (
                                                                <option key={u} value={u}>{u}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                </FormSection>

                                <FormSection title="Additional identifiers" icon={<Tag size={16} />} sectionId="identifiers" className="!p-4 !space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <FieldLabel>EAN</FieldLabel>
                                                    <input
                                                        type="text"
                                                        value={form.ean}
                                                        onChange={e => updateField('ean', e.target.value)}
                                                        placeholder="European Article Number"
                                                        className={inputCls}
                                                    />
                                                </div>
                                                <div>
                                                    <FieldLabel>ISBN</FieldLabel>
                                                    <input
                                                        type="text"
                                                        value={form.isbn}
                                                        onChange={e => updateField('isbn', e.target.value)}
                                                        placeholder="International Standard Book No."
                                                        className={inputCls}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <FieldLabel>Barcode</FieldLabel>
                                                    <input
                                                        type="text"
                                                        value={form.barcode}
                                                        onChange={e => updateField('barcode', e.target.value)}
                                                        placeholder="e.g. 8901234567890"
                                                        className={inputCls}
                                                    />
                                                </div>
                                            </div>
                                </FormSection>

                                <FormSection title="Additional details" icon={<BoxIcon size={16} />} sectionId="details" className="!p-4 !space-y-3">
                                        <div>
                                            <FieldLabel>Description</FieldLabel>
                                            <textarea
                                                value={form.description}
                                                onChange={e => updateField('description', e.target.value)}
                                                rows={3}
                                                className={textareaCls}
                                                placeholder="Enter product description"
                                            />
                                        </div>
                                        <div>
                                            <FieldLabel>Tags</FieldLabel>
                                            <TagInput
                                                tags={form.tags}
                                                onChange={(tags) => updateField('tags', tags)}
                                            />
                                        </div>
                                        <div>
                                            <FieldLabel>Alias / search keywords</FieldLabel>
                                            <TagInput
                                                tags={form.aliasNames}
                                                onChange={(aliasNames) => updateField('aliasNames', aliasNames)}
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <FieldLabel>FSSAI Reference</FieldLabel>
                                                    <input
                                                        type="text"
                                                        value={form.fssaiRef}
                                                        onChange={e => updateField('fssaiRef', e.target.value)}
                                                        placeholder="FSSAI License Ref"
                                                        className={inputCls}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#EEEEEE]">
                                                <div>
                                                    <FieldLabel>Product Type</FieldLabel>
                                                    <select
                                                        value={form.productType}
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
                                                        value={form.itemType}
                                                        onChange={e => updateField('itemType', e.target.value)}
                                                        className={selectCls}
                                                    >
                                                        <option value="standard">Standard</option>
                                                        <option value="variant">Variant</option>
                                                        <option value="kit">Kit</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#EEEEEE]">
                                                <div>
                                                    <FieldLabel>Source</FieldLabel>
                                                    <input
                                                        type="text"
                                                        value={form.source}
                                                        onChange={e => updateField('source', e.target.value)}
                                                        placeholder="Data source"
                                                        className={inputCls}
                                                    />
                                                </div>
                                                <div>
                                                    <FieldLabel>Reference ID</FieldLabel>
                                                    <input
                                                        type="text"
                                                        value={form.referenceId}
                                                        onChange={e => updateField('referenceId', e.target.value)}
                                                        placeholder="External Ref ID"
                                                        className={inputCls}
                                                    />
                                                </div>
                                                <div>
                                                    <FieldLabel>Last Sync</FieldLabel>
                                                    <input
                                                        type="text"
                                                        value={form.lastSync}
                                                        onChange={e => updateField('lastSync', e.target.value)}
                                                        placeholder="e.g. 2026-06-29"
                                                        className={inputCls}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-[#EEEEEE]">
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={form.sellable}
                                                        onChange={(e) => updateField('sellable', e.target.checked)}
                                                        className="w-5 h-5 accent-[#299E60]"
                                                    />
                                                    <div>
                                                        <span className="text-[13px] font-bold text-[#181725]">Sellable</span>
                                                    </div>
                                                </label>
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={form.purchasable}
                                                        onChange={(e) => updateField('purchasable', e.target.checked)}
                                                        className="w-5 h-5 accent-[#299E60]"
                                                    />
                                                    <div>
                                                        <span className="text-[13px] font-bold text-[#181725]">Purchasable</span>
                                                    </div>
                                                </label>
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={form.isFeatured}
                                                        onChange={(e) => updateField('isFeatured', e.target.checked)}
                                                        className="w-5 h-5 accent-[#F59E0B]"
                                                    />
                                                    <div>
                                                        <span className="text-[13px] font-bold text-[#181725]">Featured</span>
                                                    </div>
                                                </label>
                                                <label className="flex items-center gap-3 cursor-default">
                                                    <input
                                                        type="checkbox"
                                                        checked
                                                        disabled
                                                        readOnly
                                                        aria-readonly="true"
                                                        className="w-5 h-5 accent-[#7B1FA2] disabled:opacity-100"
                                                    />
                                                    <div>
                                                        <span className="text-[13px] font-bold text-[#181725]">DiSCCO credit</span>
                                                        <span className="block text-[11px] text-[#AEAEAE] font-medium">Pay later on credit line</span>
                                                    </div>
                                                </label>
                                            </div>
                                </FormSection>

                                    {editingProduct && (
                                        <div className="border border-[#EEEEEE] rounded-[12px] p-4 space-y-2">
                                            <h3 className="text-[13px] font-bold text-[#181725]">Price history</h3>
                                            {auditLogs.length === 0 ? (
                                                <p className="text-[12px] text-[#AEAEAE]">No price changes recorded yet.</p>
                                            ) : (
                                                <ul className="space-y-2 max-h-[220px] overflow-y-auto">
                                                    {auditLogs.slice(0, 40).map((log, idx) => (
                                                        <li
                                                            key={`${log.field}-${log.changedAt}-${idx}`}
                                                            className="text-[11px] text-[#7C7C7C] border-b border-[#F5F5F5] pb-1.5 last:border-0"
                                                        >
                                                            <span className="font-bold text-[#181725]">{log.field}</span>
                                                            {log.priceListName ? (
                                                                <span className="text-primary"> · {log.priceListName}</span>
                                                            ) : null}
                                                            {' · '}
                                                            <span className="text-[#AEAEAE]">{log.source}</span>
                                                            {' · '}
                                                            {new Date(log.changedAt).toLocaleString()}
                                                            {log.actorName ? (
                                                                <span className="text-[#AEAEAE]"> · {log.actorName}</span>
                                                            ) : null}
                                                            <div className="mt-0.5 font-mono text-[10px] break-all">
                                                                <span className="text-[#E74C3C]">{log.oldValue ?? '—'}</span>
                                                                {' → '}
                                                                <span className="text-primary">{log.newValue ?? '—'}</span>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )}
                                    </>
                                    )}
                                </form>
                        </div>
                        <aside className="hidden xl:block w-[300px] shrink-0 border-l border-[#EEEEEE] bg-white p-4 overflow-y-auto">
                            <ProductCreatePreviewPanel form={previewFormState} checklist={previewChecklist} />
                        </aside>
                        </div>

                        <div className="xl:hidden border-t border-[#EEEEEE] bg-white px-4 py-3 shrink-0">
                            <ProductCreatePreviewPanel form={previewFormState} checklist={previewChecklist} />
                        </div>

                        {/* Panel Footer */}
                        <div className="px-4 lg:px-6 py-4 border-t border-[#EEEEEE] shrink-0 flex items-center gap-3">
                            <button
                                type="button"
                                onClick={requestClosePanel}
                                className="flex-1 h-[48px] bg-[#F8F9FB] border border-[#EEEEEE] text-[#181725] rounded-[12px] text-[14px] font-bold hover:bg-[#EEEEEE] transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void saveDraft(true)}
                                disabled={draftSaving || saving || loadingProduct}
                                className="flex-1 h-[48px] bg-[#FFCF4D] border border-[#E6B800] text-[#4A3800] rounded-[12px] text-[14px] font-bold hover:bg-[#F5C542] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {draftSaving && <Loader2 size={16} className="animate-spin" />}
                                Save as Draft
                            </button>
                            <button
                                type="submit"
                                form="vendor-product-form"
                                disabled={saving || loadingProduct || draftSaving}
                                className="flex-1 h-[48px] bg-primary text-white rounded-[12px] text-[14px] font-bold hover:bg-primary-dark transition-all flex items-center justify-center gap-2 shadow-sm shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {saving && <Loader2 size={16} className="animate-spin" />}
                                {saving
                                    ? 'Saving...'
                                    : editingProduct?.listingStatus === 'draft'
                                        ? 'Publish'
                                        : editingProduct?.approvalStatus === 'rejected'
                                            ? 'Resubmit for Review'
                                            : editingProduct
                                                ? 'Update Product'
                                                : 'Save'}
                            </button>
                        </div>
                    </div>
                </>
            )}

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

            {/* Save & Unlink confirmation (brand override field edited) */}
            {showUnlinkConfirm && (
                <>
                    <div
                        className="fixed inset-0 bg-black/40 z-[80]"
                        onClick={() => !saving && setShowUnlinkConfirm(false)}
                    />
                    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                        <div className="bg-white rounded-[16px] shadow-xl max-w-[420px] w-full p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-[40px] h-[40px] rounded-full bg-[#EEF8F1] flex items-center justify-center shrink-0">
                                    <Unlink size={20} className="text-primary" />
                                </div>
                                <h3 className="text-[18px] font-bold text-[#181725]">Save &amp; Unlink</h3>
                            </div>
                            <p className="text-[14px] text-[#7C7C7C] mb-6">
                                Saving will unlink this product from{' '}
                                <strong className="text-[#181725]">
                                    {editBrandMasterProduct?.brand?.name
                                        || editingProduct?.brandMappings?.[0]?.brandMasterProduct?.brand?.name
                                        || 'this brand'}
                                </strong>
                                . Your values go live; you can map it again anytime.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowUnlinkConfirm(false)}
                                    disabled={saving}
                                    className="flex-1 h-[44px] border border-[#EEEEEE] rounded-[10px] text-[14px] font-bold text-[#181725] hover:bg-[#F8F9FB] transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void performProductSave()}
                                    disabled={saving}
                                    className="flex-1 h-[44px] bg-primary text-white rounded-[10px] text-[14px] font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {saving && <Loader2 size={16} className="animate-spin" />}
                                    {saving ? 'Saving...' : 'Save & Unlink'}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <>
                    <div className="fixed inset-0 bg-black/40 z-[60]" onClick={() => !deleting && setDeleteTarget(null)} />
                    <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
                        <div className="bg-white rounded-[16px] shadow-xl max-w-[420px] w-full p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-[40px] h-[40px] rounded-full bg-[#FFF0F0] flex items-center justify-center shrink-0">
                                    <Trash2 size={20} className="text-[#E74C3C]" />
                                </div>
                                <h3 className="text-[18px] font-bold text-[#181725]">Delete Product</h3>
                            </div>
                            <p className="text-[14px] text-[#7C7C7C] mb-6">
                                Are you sure you want to delete <strong className="text-[#181725]">{deleteTarget.name}</strong>? This will remove the product from your catalog.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setDeleteTarget(null)}
                                    disabled={deleting}
                                    className="flex-1 h-[44px] border border-[#EEEEEE] rounded-[10px] text-[14px] font-bold text-[#181725] hover:bg-[#F8F9FB] transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="flex-1 h-[44px] bg-[#E74C3C] text-white rounded-[10px] text-[14px] font-bold hover:bg-[#d44234] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {deleting && <Loader2 size={16} className="animate-spin" />}
                                    {deleting ? 'Deleting...' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Vendor Premium Bulk Modals */}
            <VendorProductImportModal
                open={showBulkImport}
                onClose={() => setShowBulkImport(false)}
                onComplete={() => fetchProducts(false)}
            />

            <VendorPriceReplaceModal
                open={showPriceReplace}
                onClose={() => setShowPriceReplace(false)}
                onComplete={() => fetchProducts(false)}
            />

            <VendorBulkEngine
                open={bulkOpen}
                onClose={() => { setBulkOpen(false); setBulkEngineIds(null); }}
                products={products}
                selectedIds={bulkEngineIds ?? Array.from(selectedIds)}
                onComplete={() => { fetchProducts(false); setSelectedIds(new Set()); setBulkEngineIds(null); }}
            />

            <VendorBulkGrid
                open={gridOpen}
                onClose={() => setGridOpen(false)}
                products={products.map((p) => ({
                    ...p,
                    sku: p.vendorSku || p.sku,
                    categoryName: p.category?.name ?? '',
                    basePrice: Number(p.basePrice) || 0,
                    barcode: p.barcode,
                    aliasNames: p.aliasNames,
                    countryOfOrigin: p.countryOfOrigin,
                    metadata: p.metadata as Record<string, unknown> | undefined,
                }))}
                onComplete={() => fetchProducts(false)}
                categories={categories}
                brands={brands}
                onOpenAdvanced={() => {
                    setBulkEngineIds(
                        selectedIds.size > 0
                            ? Array.from(selectedIds)
                            : products.map((p) => p.id),
                    );
                    setBulkOpen(true);
                }}
                onImport={() => setShowBulkImport(true)}
                onExport={handleExport}
                readOnlyCommission
            />

            {/* Floating selection action bar */}
            {selectedIds.size > 0 && !bulkOpen && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[55] flex items-center gap-3 bg-[#181725] text-white rounded-[14px] shadow-2xl px-5 py-3 animate-in slide-in-from-bottom-4 duration-200">
                    <span className="text-[13px] font-bold">{selectedIds.size} selected</span>
                    <button
                        onClick={() => setBulkOpen(true)}
                        className="h-[36px] px-4 bg-primary hover:bg-primary-dark rounded-[10px] text-[13px] font-bold flex items-center gap-1.5 transition-colors"
                    >
                        <Wand2 size={14} /> Bulk edit
                    </button>
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="h-[36px] px-3 text-[13px] font-bold text-[#AEAEAE] hover:text-white transition-colors"
                    >
                        Clear
                    </button>
                </div>
            )}
        </div>
    );
}
