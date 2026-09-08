'use client';

import React, { useState } from 'react';
import { BarChart3, Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProductEssentialsFields } from '@/components/features/shared/productForm/ProductEssentialsFields';
import FormSection, {
    FieldLabel,
    productFormInputCls,
    productFormSelectCls,
    productFormTextareaCls,
} from '@/components/features/shared/FormSection';
import { MultiImageUpload } from '@/components/ui/ImageUpload';
import { gstSlabSelectOptions } from '@/lib/constants/gstSlabs';
import {
    UNIT_OPTIONS,
    WEIGHT_UNIT_OPTIONS,
    DIMENSION_UNIT_OPTIONS,
} from '@/lib/productUnits';

const inputCls = productFormInputCls;
const selectCls = productFormSelectCls;
const textareaCls = productFormTextareaCls;

export interface ApprovalProductFormData {
    name: string;
    sku: string;
    vendorSku: string;
    catalogSku: string;
    hsn: string;
    brand: string;
    categoryIds: string[];
    description: string;
    basePrice: string;
    originalPrice: string;
    taxPercent: string;
    taxabilityType: string;
    exemptionReason: string;
    taxable: boolean;
    unit: string;
    minOrderQty: string;
    imageUrl: string;
    images: string[];
    packSize: string;
    tags: string[];
    aliasNames: string[];
    fssaiRef: string;
    barcode: string;
    vegNonVeg: '' | 'veg' | 'nonveg' | 'egg';
    storageType: string;
    shelfLifeDays: string;
    countryOfOrigin: string;
    packageWeight: string;
    packageLength: string;
    packageWidth: string;
    packageHeight: string;
    dimensionUnit: string;
    weightUnit: string;
    ean: string;
    isbn: string;
    priceSlabs: Array<{ minQty: string; price: string }>;
}

export const EMPTY_APPROVAL_PRODUCT_FORM: ApprovalProductFormData = {
    name: '',
    sku: '',
    vendorSku: '',
    catalogSku: '',
    hsn: '',
    brand: '',
    categoryIds: [],
    description: '',
    basePrice: '',
    originalPrice: '',
    taxPercent: '0',
    taxabilityType: 'taxable',
    exemptionReason: '',
    taxable: true,
    unit: 'piece',
    minOrderQty: '1',
    imageUrl: '',
    images: [],
    packSize: '',
    tags: [],
    aliasNames: [],
    fssaiRef: '',
    barcode: '',
    vegNonVeg: '',
    storageType: '',
    shelfLifeDays: '',
    countryOfOrigin: '',
    packageWeight: '',
    packageLength: '',
    packageWidth: '',
    packageHeight: '',
    dimensionUnit: 'cm',
    weightUnit: 'kg',
    ean: '',
    isbn: '',
    priceSlabs: [],
};

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

function str(value: unknown, fallback = ''): string {
    if (value == null || value === '') return fallback;
    return String(value);
}

function strList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function pickVeg(value: unknown): ApprovalProductFormData['vegNonVeg'] {
    return value === 'veg' || value === 'nonveg' || value === 'egg' ? value : '';
}

export interface ApprovalProductSeedSource {
    name?: string | null;
    sku?: string | null;
    vendorSku?: string | null;
    hsn?: string | null;
    brand?: string | null;
    description?: string | null;
    basePrice?: unknown;
    originalPrice?: unknown;
    taxPercent?: unknown;
    unit?: string | null;
    uom?: string | null;
    minOrderQty?: unknown;
    imageUrl?: string | null;
    images?: string[] | null;
    packSize?: string | null;
    tags?: string[] | null;
    aliasNames?: string[] | null;
    fssaiRef?: string | null;
    barcode?: string | null;
    vegNonVeg?: string | null;
    storageType?: string | null;
    shelfLifeDays?: unknown;
    countryOfOrigin?: string | null;
    metadata?: unknown;
    category?: { id: string; name?: string } | null;
    categoryLinks?: Array<{
        categoryId?: string;
        isPrimary?: boolean;
        category?: { id: string; name?: string } | null;
    }>;
    masterProduct?: { id: string; sku: string; name: string } | null;
    priceSlabs?: Array<{ minQty: number; price: unknown }>;
    pendingEditPayload?: Record<string, unknown> | null;
    approvalStatus?: string;
}

function categoryIdsFromSource(source: ApprovalProductSeedSource): string[] {
    const links = source.categoryLinks ?? [];
    const primaryFromLink = links.find((l) => l.isPrimary);
    const primaryId = primaryFromLink?.categoryId ?? primaryFromLink?.category?.id ?? source.category?.id ?? '';
    const extras = links
        .map((l) => l.categoryId ?? l.category?.id ?? '')
        .filter((id) => id && id !== primaryId);
    return primaryId ? [primaryId, ...extras] : extras;
}

export function seedApprovalProductForm(source: ApprovalProductSeedSource): ApprovalProductFormData {
    const meta = asRecord(source.metadata);
    const packaging = asRecord(meta.packaging);
    const identifiers = asRecord(meta.identifiers);
    const accounting = asRecord(meta.accounting);
    const taxabilityType = str(accounting.taxabilityType, 'taxable');
    const veg = pickVeg(source.vegNonVeg);
    const slabsSource = source.priceSlabs ?? [];

    return {
        ...EMPTY_APPROVAL_PRODUCT_FORM,
        name: str(source.name),
        sku: str(source.sku),
        vendorSku: str(source.vendorSku ?? source.sku),
        catalogSku: str(source.masterProduct?.sku),
        hsn: str(source.hsn),
        brand: str(source.brand),
        categoryIds: categoryIdsFromSource(source),
        description: str(source.description),
        basePrice: str(source.basePrice),
        originalPrice: str(source.originalPrice),
        taxPercent: str(source.taxPercent, '0'),
        taxabilityType,
        exemptionReason: str(accounting.exemptionReason),
        taxable: taxabilityType !== 'exempt',
        unit: str(source.unit ?? source.uom, 'piece'),
        minOrderQty: str(source.minOrderQty, '1'),
        imageUrl: str(source.imageUrl),
        images: strList(source.images),
        packSize: str(source.packSize),
        tags: strList(source.tags),
        aliasNames: strList(source.aliasNames),
        fssaiRef: str(source.fssaiRef),
        barcode: str(source.barcode),
        vegNonVeg: veg,
        storageType: str(source.storageType),
        shelfLifeDays: str(source.shelfLifeDays),
        countryOfOrigin: str(source.countryOfOrigin),
        packageWeight: str(packaging.packageWeight),
        packageLength: str(packaging.packageLength),
        packageWidth: str(packaging.packageWidth),
        packageHeight: str(packaging.packageHeight),
        dimensionUnit: str(packaging.dimensionUnit, 'cm'),
        weightUnit: str(packaging.weightUnit, 'kg'),
        ean: str(identifiers.ean),
        isbn: str(identifiers.isbn),
        priceSlabs: slabsSource
            .map((slab) => {
                const row = asRecord(slab);
                return {
                    minQty: str(row.minQty),
                    price: str(row.price),
                };
            })
            .filter((row) => row.minQty || row.price),
    };
}

export function buildVendorProductPatch(form: ApprovalProductFormData): Record<string, unknown> {
    const parsedBase = parseFloat(form.basePrice);
    const payload: Record<string, unknown> = {
        name: form.name.trim(),
        taxPercent: Number(form.taxPercent) || 0,
        minOrderQty: Number(form.minOrderQty) || 1,
        creditEligible: true,
        metadata: {
            accounting: {
                taxable: form.taxable,
                exemptionReason: form.exemptionReason.trim(),
                taxabilityType: form.taxabilityType.trim(),
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
        },
    };
    if (!Number.isNaN(parsedBase)) payload.basePrice = parsedBase;
    if (form.imageUrl.trim()) payload.imageUrl = form.imageUrl.trim();
    if (form.sku.trim()) payload.sku = form.sku.trim();
    if (form.vendorSku.trim()) payload.vendorSku = form.vendorSku.trim();
    if (form.hsn.trim()) payload.hsn = form.hsn.trim();
    if (form.barcode.trim()) payload.barcode = form.barcode.trim();
    if (form.brand.trim()) payload.brand = form.brand.trim();
    if (form.unit) payload.unit = form.unit;
    if (form.categoryIds.length > 0) {
        payload.categoryId = form.categoryIds[0];
        payload.primaryCategoryId = form.categoryIds[0];
        payload.categoryIds = form.categoryIds;
    }
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.originalPrice && Number(form.originalPrice) > 0) {
        payload.originalPrice = Number(form.originalPrice);
    }
    if (form.packSize.trim()) payload.packSize = form.packSize.trim();
    payload.tags = form.tags;
    payload.images = form.images.filter(Boolean);
    if (form.fssaiRef.trim()) payload.fssaiRef = form.fssaiRef.trim();
    payload.aliasNames = form.aliasNames;
    if (form.vegNonVeg) payload.vegNonVeg = form.vegNonVeg;
    if (form.storageType) payload.storageType = form.storageType;
    if (form.shelfLifeDays.trim() !== '' && !Number.isNaN(Number(form.shelfLifeDays))) {
        payload.shelfLifeDays = parseInt(form.shelfLifeDays, 10);
    }
    if (form.countryOfOrigin.trim()) payload.countryOfOrigin = form.countryOfOrigin.trim();
    const slabs = form.priceSlabs
        .filter((s) => s.minQty && s.price)
        .map((s) => ({ minQty: Number(s.minQty), price: Number(s.price) }));
    payload.priceSlabs = slabs;
    return payload;
}

export function buildMasterProductPatch(
    form: ApprovalProductFormData,
    opts: { skuEditable: boolean },
): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        name: form.name.trim(),
        brand: form.brand.trim(),
        imageUrl: form.imageUrl.trim() || null,
        images: form.images.filter(Boolean),
        aliasNames: form.aliasNames,
        packSize: form.packSize.trim() || null,
        uom: form.unit || null,
        taxPercent: Number(form.taxPercent) || 0,
    };
    if (form.categoryIds.length > 0) {
        payload.categoryId = form.categoryIds[0];
        payload.categoryIds = form.categoryIds;
    }
    if (opts.skuEditable && form.sku.trim()) payload.sku = form.sku.trim();
    return payload;
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
    const [input, setInput] = useState('');

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
            e.preventDefault();
            const next = input
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t && !tags.includes(t));
            if (next.length) onChange([...tags, ...next]);
            setInput('');
        }
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F8E8EC] text-[#6B1D2E] text-[12px] font-bold rounded-[8px]">
                        {tag}
                        <button type="button" onClick={() => onChange(tags.filter((t) => t !== tag))} className="hover:text-[#E74C3C]">
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

interface Props {
    form: ApprovalProductFormData;
    onChange: (patch: Partial<ApprovalProductFormData>) => void;
    brands: Array<{ id: string; name: string }>;
    onSuggestBrand: (name: string) => void;
    brandSuggesting?: boolean;
    errors: Record<string, string | undefined>;
    gstSlabs: string[];
    identityMode: 'standalone' | 'catalog-linked';
    skuReadOnly?: boolean;
    catalogBanner?: React.ReactNode;
    pickerKey: string;
    showVendorCommerce?: boolean;
}

export function ApprovalProductEditForm({
    form,
    onChange,
    brands,
    onSuggestBrand,
    brandSuggesting,
    errors,
    gstSlabs,
    identityMode,
    skuReadOnly,
    catalogBanner,
    pickerKey,
    showVendorCommerce = true,
}: Props) {
    const update = (field: keyof ApprovalProductFormData, value: ApprovalProductFormData[keyof ApprovalProductFormData]) => {
        onChange({ [field]: value });
    };

    return (
        <div className="w-full space-y-6 p-4 lg:p-6 bg-[#F8F9FB]">
            <ProductEssentialsFields
                portal="admin"
                identityMode={identityMode}
                catalogBanner={catalogBanner}
                nameField={
                    <div id="ff-name" className="sm:col-span-2 xl:col-span-5">
                        <FieldLabel required>Item Name</FieldLabel>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => update('name', e.target.value)}
                            placeholder="Enter product name"
                            className={cn(inputCls, errors.name && 'border-[#E74C3C]')}
                        />
                        {errors.name && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{errors.name}</p>}
                    </div>
                }
                sku={form.sku}
                vendorSku={form.vendorSku}
                catalogSku={form.catalogSku}
                hsn={form.hsn}
                brand={form.brand}
                skuReadOnly={skuReadOnly}
                onSkuChange={(v) => update('sku', v)}
                onVendorSkuChange={(v) => update('vendorSku', v)}
                onHsnChange={(v) => update('hsn', v)}
                onBrandChange={(v) => update('brand', v)}
                categoryIds={form.categoryIds}
                onCategoryIdsChange={(ids) => update('categoryIds', ids)}
                categoryEndpoint="/api/v1/admin/categories"
                categoryPickerKey={pickerKey}
                maxAdditionalCategories={4}
                imageUrl={form.imageUrl}
                onImageUrlChange={(url) => update('imageUrl', url)}
                imageFolder="products"
                pricing={{
                    basePrice: form.basePrice,
                    originalPrice: form.originalPrice,
                    taxPercent: form.taxPercent,
                    taxabilityType: form.taxabilityType,
                    exemptionReason: form.exemptionReason,
                    taxable: form.taxable,
                }}
                onBasePriceChange={(v) => update('basePrice', v)}
                onOriginalPriceChange={(v) => update('originalPrice', v)}
                onTaxPercentChange={(v) => update('taxPercent', v)}
                onTaxabilityTypeChange={(v) => update('taxabilityType', v)}
                onExemptionReasonChange={(v) => update('exemptionReason', v)}
                onTaxableChange={(v) => update('taxable', v)}
                brands={brands}
                onSuggestBrand={onSuggestBrand}
                brandSuggesting={brandSuggesting}
                errors={errors}
                basePriceRequired={showVendorCommerce}
                taxPercentOptions={gstSlabSelectOptions(gstSlabs.map(Number), form.taxPercent)}
            >
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                    <div id="ff-countryOfOrigin">
                        <FieldLabel required>Country of Origin</FieldLabel>
                        <input
                            type="text"
                            value={form.countryOfOrigin}
                            onChange={(e) => update('countryOfOrigin', e.target.value)}
                            placeholder="e.g. India"
                            className={cn(inputCls, errors.countryOfOrigin && 'border-[#E74C3C]')}
                        />
                        {errors.countryOfOrigin && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{errors.countryOfOrigin}</p>}
                    </div>
                    <div id="ff-vegNonVeg">
                        <FieldLabel required>Veg / Non-Veg</FieldLabel>
                        <select
                            value={form.vegNonVeg}
                            onChange={(e) => update('vegNonVeg', e.target.value as ApprovalProductFormData['vegNonVeg'])}
                            className={cn(selectCls, errors.vegNonVeg && 'border-[#E74C3C]')}
                        >
                            <option value="">Select…</option>
                            <option value="veg">Veg</option>
                            <option value="nonveg">Non-Veg</option>
                            <option value="egg">Egg</option>
                        </select>
                        {errors.vegNonVeg && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{errors.vegNonVeg}</p>}
                    </div>
                    <div id="ff-storageType">
                        <FieldLabel required>Storage type</FieldLabel>
                        <select
                            value={form.storageType}
                            onChange={(e) => update('storageType', e.target.value)}
                            className={cn(selectCls, errors.storageType && 'border-[#E74C3C]')}
                        >
                            <option value="">Select…</option>
                            <option value="ambient">Ambient</option>
                            <option value="refrigerated">Refrigerated</option>
                            <option value="frozen">Frozen</option>
                            <option value="dry">Dry Storage</option>
                            <option value="cool">Cool / Dark</option>
                        </select>
                        {errors.storageType && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{errors.storageType}</p>}
                    </div>
                    <div id="ff-shelfLifeDays">
                        <FieldLabel required>Shelf Life (days)</FieldLabel>
                        <input
                            type="number"
                            min="0"
                            value={form.shelfLifeDays}
                            onChange={(e) => update('shelfLifeDays', e.target.value)}
                            placeholder="e.g. 365"
                            className={cn(inputCls, errors.shelfLifeDays && 'border-[#E74C3C]')}
                        />
                        {errors.shelfLifeDays && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{errors.shelfLifeDays}</p>}
                    </div>
                    {showVendorCommerce && (
                        <div id="ff-minOrderQty">
                            <FieldLabel required>MOQ</FieldLabel>
                            <input
                                type="number"
                                min="1"
                                value={form.minOrderQty}
                                onChange={(e) => update('minOrderQty', e.target.value)}
                                className={cn(inputCls, errors.minOrderQty && 'border-[#E74C3C]')}
                            />
                            {errors.minOrderQty && <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{errors.minOrderQty}</p>}
                        </div>
                    )}
                    <div>
                        <FieldLabel>Pack Size</FieldLabel>
                        <input
                            type="text"
                            value={form.packSize}
                            onChange={(e) => update('packSize', e.target.value)}
                            className={inputCls}
                            placeholder="e.g. 1 Ltr"
                        />
                    </div>
                    <div>
                        <FieldLabel>Unit</FieldLabel>
                        <select value={form.unit} onChange={(e) => update('unit', e.target.value)} className={selectCls}>
                            <option value="">Select unit</option>
                            {UNIT_OPTIONS.map((u) => (
                                <option key={u} value={u}>{u}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </ProductEssentialsFields>

            <FormSection title="Compliance" sectionId="compliance">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <FieldLabel>FSSAI Reference</FieldLabel>
                        <input
                            type="text"
                            value={form.fssaiRef}
                            onChange={(e) => update('fssaiRef', e.target.value)}
                            placeholder="FSSAI License Ref"
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <FieldLabel>Barcode</FieldLabel>
                        <input
                            type="text"
                            value={form.barcode}
                            onChange={(e) => update('barcode', e.target.value)}
                            placeholder="e.g. 8901234567890"
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <FieldLabel>EAN</FieldLabel>
                        <input type="text" value={form.ean} onChange={(e) => update('ean', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <FieldLabel>ISBN</FieldLabel>
                        <input type="text" value={form.isbn} onChange={(e) => update('isbn', e.target.value)} className={inputCls} />
                    </div>
                </div>
            </FormSection>

            <FormSection title="Packaging & dimensions" sectionId="packaging">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <FieldLabel>Package Weight</FieldLabel>
                        <input type="number" step="0.01" value={form.packageWeight} onChange={(e) => update('packageWeight', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <FieldLabel>Weight Unit</FieldLabel>
                        <select value={form.weightUnit} onChange={(e) => update('weightUnit', e.target.value)} className={selectCls}>
                            {WEIGHT_UNIT_OPTIONS.map((u) => (
                                <option key={u} value={u}>{u}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-4 gap-4">
                    <div>
                        <FieldLabel>Length</FieldLabel>
                        <input type="number" step="0.01" value={form.packageLength} onChange={(e) => update('packageLength', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <FieldLabel>Width</FieldLabel>
                        <input type="number" step="0.01" value={form.packageWidth} onChange={(e) => update('packageWidth', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <FieldLabel>Height</FieldLabel>
                        <input type="number" step="0.01" value={form.packageHeight} onChange={(e) => update('packageHeight', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <FieldLabel>Unit</FieldLabel>
                        <select value={form.dimensionUnit} onChange={(e) => update('dimensionUnit', e.target.value)} className={selectCls}>
                            {DIMENSION_UNIT_OPTIONS.map((u) => (
                                <option key={u} value={u}>{u}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </FormSection>

            <FormSection title="Additional details" sectionId="details">
                <div>
                    <FieldLabel>Description</FieldLabel>
                    <textarea
                        value={form.description}
                        onChange={(e) => update('description', e.target.value)}
                        rows={3}
                        className={textareaCls}
                        placeholder="Enter product description"
                    />
                </div>
                <MultiImageUpload
                    values={form.images.filter(Boolean)}
                    onChange={(urls) => update('images', urls)}
                    folder="products"
                    label="Additional Images"
                    max={8}
                />
                <div>
                    <FieldLabel>Tags</FieldLabel>
                    <TagInput tags={form.tags} onChange={(tags) => update('tags', tags)} />
                </div>
                <div>
                    <FieldLabel>Alias Names</FieldLabel>
                    <TagInput tags={form.aliasNames} onChange={(names) => update('aliasNames', names)} />
                </div>
            </FormSection>

            {showVendorCommerce && (
                <FormSection title="Bulk pricing tiers" sectionId="bulk">
                    <div className="flex items-start justify-between gap-4 mb-2">
                        <p className="text-[12px] text-[#AEAEAE] font-medium">
                            Each tier applies from its min quantity. Up to 3 tiers (taxable rate, ex-GST).
                        </p>
                        {form.priceSlabs.length < 3 && (
                            <button
                                type="button"
                                onClick={() => update('priceSlabs', [...form.priceSlabs, { minQty: '', price: '' }])}
                                className="h-[40px] px-5 bg-[#6B1D2E] text-white rounded-[10px] text-[13px] font-bold flex items-center gap-2 shrink-0"
                            >
                                <Plus size={14} />
                                Add Bulk Tier
                            </button>
                        )}
                    </div>
                    <div className="space-y-4">
                        {form.priceSlabs.map((slab, index) => (
                            <div key={`${slab.minQty}-${index}`} className="rounded-[14px] border border-[#EEEEEE] overflow-hidden bg-white">
                                <div className="flex items-center justify-between px-5 py-3 bg-[#FAFAFA] border-b border-[#EEEEEE]">
                                    <h4 className="text-[14px] font-bold text-[#181725]">Bulk Tier {index + 1}</h4>
                                    <button
                                        type="button"
                                        onClick={() => update('priceSlabs', form.priceSlabs.filter((_, idx) => idx !== index))}
                                        className="p-1.5 hover:bg-[#FFF0F0] rounded-[6px] text-[#AEAEAE] hover:text-[#E74C3C]"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                                <div className="p-5 grid grid-cols-2 gap-4">
                                    <div>
                                        <FieldLabel>Min Quantity</FieldLabel>
                                        <input
                                            type="number"
                                            min="1"
                                            value={slab.minQty}
                                            onChange={(e) => update(
                                                'priceSlabs',
                                                form.priceSlabs.map((s, idx) => idx === index ? { ...s, minQty: e.target.value } : s),
                                            )}
                                            className={inputCls}
                                        />
                                    </div>
                                    <div>
                                        <FieldLabel>Taxable Rate (per Unit)</FieldLabel>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={slab.price}
                                            onChange={(e) => update(
                                                'priceSlabs',
                                                form.priceSlabs.map((s, idx) => idx === index ? { ...s, price: e.target.value } : s),
                                            )}
                                            className={inputCls}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                        {form.priceSlabs.length === 0 && (
                            <div className="text-center py-8 text-[#AEAEAE]">
                                <BarChart3 size={32} className="mx-auto mb-2 text-[#E5E7EB]" />
                                <p className="text-[13px] font-medium">No bulk tiers yet.</p>
                            </div>
                        )}
                    </div>
                </FormSection>
            )}
        </div>
    );
}
