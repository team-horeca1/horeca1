'use client';

import React from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import FormSection from '@/components/features/shared/FormSection';
import { CategoryHierarchyPicker } from '@/components/features/brand/CategoryHierarchyPicker';
import { BrandSinglePicker } from '@/components/features/brand/BrandSinglePicker';
import { ImageUpload } from '@/components/ui/ImageUpload';
import {
  FieldLabel,
  productFormInputCls,
  productFormSelectCls,
} from './productFormFieldStyles';

const inputCls = productFormInputCls;
const selectCls = productFormSelectCls;

export interface ProductEssentialsBrand {
  id: string;
  name: string;
}

export interface ProductEssentialsPricing {
  basePrice: string;
  originalPrice: string;
  taxPercent: string;
  taxabilityType: string;
  exemptionReason: string;
  taxable?: boolean;
}

export interface ProductEssentialsFieldsProps {
  portal: 'vendor' | 'admin';
  nameField: React.ReactNode;
  catalogBanner?: React.ReactNode;
  identityMode: 'standalone' | 'catalog-linked';
  sku: string;
  hsn: string;
  brand: string;
  catalogSku?: string;
  vendorSku?: string;
  skuReadOnly?: boolean;
  onSkuChange: (value: string) => void;
  onHsnChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onVendorSkuChange?: (value: string) => void;
  categoryIds: string[];
  onCategoryIdsChange: (ids: string[]) => void;
  categoryEndpoint: string;
  categoryPickerKey: string;
  categoryDisabled?: boolean;
  lockParent?: boolean;
  categoryHelper?: React.ReactNode;
  maxAdditionalCategories?: number;
  imageUrl: string;
  onImageUrlChange: (url: string) => void;
  imageFolder?: 'products' | 'categories' | 'vendors' | 'banners' | 'misc';
  pricing: ProductEssentialsPricing;
  onBasePriceChange: (value: string) => void;
  onOriginalPriceChange: (value: string) => void;
  onTaxPercentChange: (value: string) => void;
  onTaxabilityTypeChange: (value: string) => void;
  onExemptionReasonChange: (value: string) => void;
  onTaxableChange?: (value: boolean) => void;
  brands: ProductEssentialsBrand[];
  onSuggestBrand: (name: string) => void;
  brandSuggesting?: boolean;
  errors: Record<string, string | undefined>;
  taxAmount?: string;
  savings?: number | null;
  basePriceRequired?: boolean;
  taxPercentOptions?: string[];
  children?: React.ReactNode;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] text-[#E74C3C] font-semibold mt-1.5">{message}</p>;
}

export function ProductEssentialsFields({
  portal,
  nameField,
  catalogBanner,
  identityMode,
  sku,
  hsn,
  brand,
  catalogSku = '',
  vendorSku = '',
  skuReadOnly,
  onSkuChange,
  onHsnChange,
  onBrandChange,
  onVendorSkuChange,
  categoryIds,
  onCategoryIdsChange,
  categoryEndpoint,
  categoryPickerKey,
  categoryDisabled,
  lockParent,
  categoryHelper,
  maxAdditionalCategories,
  imageUrl,
  onImageUrlChange,
  imageFolder,
  pricing,
  onBasePriceChange,
  onOriginalPriceChange,
  onTaxPercentChange,
  onTaxabilityTypeChange,
  onExemptionReasonChange,
  onTaxableChange,
  brands,
  onSuggestBrand,
  brandSuggesting,
  errors,
  taxAmount,
  savings,
  basePriceRequired,
  taxPercentOptions,
  children,
}: ProductEssentialsFieldsProps) {
  const suggestLabel = portal === 'admin' ? 'admin' : 'vendor';
  const useTaxSelect = portal === 'admin' && !!taxPercentOptions?.length;

  const handleBasePriceChange = (base: string) => {
    onBasePriceChange(base);
    const tp = parseFloat(pricing.taxPercent || '0');
    const b = parseFloat(base);
    if (!isNaN(b) && !isNaN(tp)) {
      onOriginalPriceChange((b * (1 + tp / 100)).toFixed(2));
    }
  };

  const handleTaxPercentChange = (tp: string) => {
    onTaxPercentChange(tp);
    const base = parseFloat(pricing.basePrice);
    const percent = parseFloat(tp);
    if (!isNaN(base) && !isNaN(percent)) {
      onOriginalPriceChange((base * (1 + percent / 100)).toFixed(2));
    }
  };

  const handleGrossChange = (gross: string) => {
    onOriginalPriceChange(gross);
    const tp = parseFloat(pricing.taxPercent || '0');
    const g = parseFloat(gross);
    if (!isNaN(g) && !isNaN(tp)) {
      onBasePriceChange((g / (1 + tp / 100)).toFixed(2));
    }
  };

  const brandPicker = (
    <BrandSinglePicker
      value={brand}
      onChange={onBrandChange}
      brands={brands}
      onSuggest={onSuggestBrand}
      suggesting={brandSuggesting}
      hasError={!!errors.brand}
      size="compact"
      suggestLabel={suggestLabel}
    />
  );

  return (
    <FormSection
      title="Product essentials"
      icon={<Info size={16} />}
      requiredBadge
      sectionId="essentials"
      className="!p-4 !space-y-3"
    >
      {catalogBanner}

      {identityMode === 'catalog-linked' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 gap-3">
          {nameField}
          <div className="xl:col-span-2">
            <FieldLabel>Catalog SKU</FieldLabel>
            <input
              type="text"
              value={catalogSku}
              readOnly
              className={cn(inputCls, 'bg-[#F8F9FB] cursor-not-allowed')}
            />
          </div>
          <div id="ff-vendorSku" className="xl:col-span-2">
            <FieldLabel required>Your POS SKU</FieldLabel>
            <input
              type="text"
              value={vendorSku}
              onChange={(e) => onVendorSkuChange?.(e.target.value)}
              placeholder="Your in-store / POS code"
              className={cn(inputCls, errors.vendorSku && 'border-[#E74C3C]')}
            />
            <FieldError message={errors.vendorSku} />
          </div>
          <div id="ff-hsn" className="xl:col-span-2">
            <FieldLabel required>HSN Code</FieldLabel>
            <input
              type="text"
              value={hsn}
              onChange={(e) => onHsnChange(e.target.value)}
              className={cn(inputCls, errors.hsn && 'border-[#E74C3C]')}
            />
            <FieldError message={errors.hsn} />
          </div>
          <div id="ff-brand" className="sm:col-span-2 xl:col-span-2">
            <FieldLabel required>Brand</FieldLabel>
            {brandPicker}
            <FieldError message={errors.brand} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 gap-3">
          {nameField}
          <div id="ff-sku" className="xl:col-span-2">
            <FieldLabel required>SKU</FieldLabel>
            <input
              type="text"
              value={sku}
              onChange={(e) => onSkuChange(portal === 'admin' ? e.target.value.toUpperCase() : e.target.value)}
              placeholder={portal === 'admin' ? 'RIC-BAS-001' : undefined}
              readOnly={skuReadOnly}
              className={cn(
                inputCls,
                skuReadOnly && 'bg-[#F8F9FB] cursor-not-allowed',
                errors.sku && 'border-[#E74C3C]',
              )}
            />
            <FieldError message={errors.sku} />
          </div>
          <div id="ff-hsn" className="xl:col-span-2">
            <FieldLabel required>HSN Code</FieldLabel>
            <input
              type="text"
              value={hsn}
              onChange={(e) => onHsnChange(e.target.value)}
              placeholder={portal === 'admin' ? 'e.g. 1006' : undefined}
              className={cn(inputCls, errors.hsn && 'border-[#E74C3C]')}
            />
            <FieldError message={errors.hsn} />
          </div>
          <div id="ff-brand" className="sm:col-span-2 xl:col-span-3">
            <FieldLabel required>Brand</FieldLabel>
            {brandPicker}
            <FieldError message={errors.brand} />
          </div>
        </div>
      )}

      <div id="ff-categoryIds">
        <CategoryHierarchyPicker
          key={`cat-${categoryPickerKey}`}
          value={categoryIds}
          onChange={onCategoryIdsChange}
          label="Categories"
          endpoint={categoryEndpoint}
          disabled={categoryDisabled}
          lockParent={lockParent}
          maxAdditional={maxAdditionalCategories}
          helper={portal === 'admin' ? 'Pick a parent category, then a sub-category.' : undefined}
        />
        <FieldError message={errors.categoryIds} />
        {categoryHelper}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pt-1">
        <div className="space-y-3">
          <div id="ff-imageUrl">
            <FieldLabel required>Primary image</FieldLabel>
            <ImageUpload
              value={imageUrl}
              onChange={onImageUrlChange}
              folder={imageFolder}
              label="Primary Image"
              size={portal === 'admin' ? 'lg' : undefined}
            />
            <FieldError message={errors.imageUrl} />
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-[13px] font-bold text-[#181725]">Pricing &amp; GST</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div id="ff-basePrice">
              <FieldLabel required={basePriceRequired}>Taxable (ex-GST)</FieldLabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE] font-medium">₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pricing.basePrice}
                  onChange={(e) => handleBasePriceChange(e.target.value)}
                  placeholder="0.00"
                  className={cn(inputCls, 'pl-7', errors.basePrice && 'border-[#E74C3C]')}
                />
              </div>
              <FieldError message={errors.basePrice} />
            </div>
            <div id="ff-taxPercent">
              <FieldLabel>Tax % (GST)</FieldLabel>
              {useTaxSelect ? (
                <select
                  value={pricing.taxPercent}
                  onChange={(e) => handleTaxPercentChange(e.target.value)}
                  className={selectCls}
                >
                  {taxPercentOptions!.map(t => (
                    <option key={t} value={t}>{t}%</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={pricing.taxPercent}
                  onChange={(e) => handleTaxPercentChange(e.target.value)}
                  placeholder="0"
                  className={cn(inputCls, errors.taxPercent && 'border-[#E74C3C]')}
                />
              )}
              <FieldError message={errors.taxPercent} />
            </div>
            <div>
              <FieldLabel>Gross (incl. GST)</FieldLabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary font-bold">₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pricing.originalPrice}
                  onChange={(e) => handleGrossChange(e.target.value)}
                  placeholder="0.00"
                  className={cn(inputCls, 'pl-7 font-bold text-primary bg-primary-light/10')}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Taxability</FieldLabel>
              <select
                value={pricing.taxabilityType}
                onChange={(e) => {
                  const next = e.target.value;
                  onTaxabilityTypeChange(next);
                  if (next === 'taxable') {
                    onExemptionReasonChange('');
                    onTaxableChange?.(true);
                  } else {
                    onTaxableChange?.(false);
                  }
                }}
                className={selectCls}
              >
                <option value="taxable">Taxable</option>
                <option value="exempt">Exempt</option>
              </select>
            </div>
          </div>
          {pricing.taxabilityType === 'exempt' && (
            <div>
              <FieldLabel>Exemption reason</FieldLabel>
              <input
                type="text"
                value={pricing.exemptionReason}
                onChange={(e) => onExemptionReasonChange(e.target.value)}
                placeholder="Enter exemption reason"
                className={inputCls}
              />
            </div>
          )}
          {parseFloat(pricing.basePrice) > 0 && taxAmount != null && (
            <p className="text-[11px] text-[#7C7C7C] font-medium">
              GST amount: ₹{taxAmount}
              {savings != null && savings > 0 && ` · ${savings}% off MRP`}
            </p>
          )}
        </div>
      </div>

      {children}
    </FormSection>
  );
}
