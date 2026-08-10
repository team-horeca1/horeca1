'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Package, Loader2, X, Check, Info, ImageIcon, Search, Box,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import FormSection, {
  FieldLabel,
  productFormInputCls,
  productFormSelectCls,
  productFormTextareaCls,
} from '@/components/features/shared/FormSection';
import { CategoryHierarchyPicker } from '@/components/features/brand/CategoryHierarchyPicker';
import { ImageUpload } from '@/components/ui/ImageUpload';
import {
  UNIT_OPTIONS,
  WEIGHT_UNIT_OPTIONS,
  DIMENSION_UNIT_OPTIONS,
} from '@/lib/productUnits';
import { toast } from 'sonner';

export type BrandVegNonVeg = '' | 'veg' | 'nonveg' | 'egg';

export interface BrandProductFormData {
  name: string;
  packSize: string;
  unit: string;
  categoryIds: string[];
  imageUrl: string;
  sku: string;
  description: string;
  masterProductId?: string;
  hsn: string;
  barcode: string;
  ean: string;
  vegNonVeg: BrandVegNonVeg;
  storageType: string;
  shelfLifeDays: string;
  countryOfOrigin: string;
  fssaiRef: string;
  netWeight: string;
  netWeightUnit: string;
  packageWeight: string;
  weightUnit: string;
  packageLength: string;
  packageWidth: string;
  packageHeight: string;
  dimensionUnit: string;
  tags: string[];
  aliasNames: string[];
}

export const EMPTY_BRAND_PRODUCT_FORM: BrandProductFormData = {
  name: '',
  packSize: '',
  unit: '',
  categoryIds: [],
  imageUrl: '',
  sku: '',
  description: '',
  masterProductId: '',
  hsn: '',
  barcode: '',
  ean: '',
  vegNonVeg: '',
  storageType: '',
  shelfLifeDays: '',
  countryOfOrigin: '',
  fssaiRef: '',
  netWeight: '',
  netWeightUnit: '',
  packageWeight: '',
  weightUnit: 'kg',
  packageLength: '',
  packageWidth: '',
  packageHeight: '',
  dimensionUnit: 'cm',
  tags: [],
  aliasNames: [],
};

interface MasterSuggestion {
  id: string;
  name: string;
  brand?: string | null;
  sku?: string | null;
  imageUrl?: string | null;
  packSize?: string | null;
  uom?: string | null;
  categoryId?: string | null;
}

function ChipInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      const next = input
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t && !values.includes(t));
      if (next.length) onChange([...values, ...next]);
      setInput('');
    }
  };

  return (
    <div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {values.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#EEF8F1] text-[#299E60] text-[12px] font-bold rounded-[8px]"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(values.filter((t) => t !== tag))}
                className="hover:text-[#E74C3C] transition-colors"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        className={productFormInputCls}
        placeholder={placeholder}
      />
    </div>
  );
}

export interface BrandProductFormProps {
  editingId: string | null;
  form: BrandProductFormData;
  onChange: (
    next: BrandProductFormData | ((prev: BrandProductFormData) => BrandProductFormData),
  ) => void;
  formError: string | null;
  brandName: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

export default function BrandProductForm({
  editingId,
  form,
  onChange,
  formError,
  brandName,
  saving,
  onClose,
  onSubmit,
}: BrandProductFormProps) {
  const [searchingMasters, setSearchingMasters] = useState(false);
  const [masterSuggestions, setMasterSuggestions] = useState<MasterSuggestion[]>([]);
  const [showMasterSuggestions, setShowMasterSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const setField = <K extends keyof BrandProductFormData>(key: K, value: BrandProductFormData[K]) => {
    onChange((prev) => ({ ...prev, [key]: value }));
  };

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

      let res = await fetch(
        `/api/v1/master-products?brand=${encodeURIComponent(brandName)}&search=${encodeURIComponent(q)}&limit=10`,
      );
      let json = await res.json();

      if (json.success && (!json.data || json.data.length === 0)) {
        res = await fetch(`/api/v1/master-products?search=${encodeURIComponent(q)}&limit=10`);
        json = await res.json();
      }

      if (json.success) {
        setMasterSuggestions(json.data || []);
        setShowMasterSuggestions(true);
      }
    } catch {
      /* ignore */
    } finally {
      setSearchingMasters(false);
    }
  };

  const handleSelectMasterProduct = (m: MasterSuggestion) => {
    onChange((prev) => ({
      ...prev,
      name: m.name,
      packSize: m.packSize ?? prev.packSize,
      unit: m.uom ?? prev.unit,
      imageUrl: m.imageUrl ?? prev.imageUrl,
      sku: m.sku ?? prev.sku,
      categoryIds: m.categoryId ? [m.categoryId] : prev.categoryIds,
      masterProductId: m.id,
    }));
    setShowMasterSuggestions(false);
    toast.info(`Pre-filled from master catalog: "${m.name}"`);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/40 transition-opacity"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      />
      <div className="fixed top-0 right-0 h-full w-full bg-white z-[70] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between px-4 lg:px-6 py-4 border-b border-[#EEEEEE] shrink-0">
          <div>
            <h2 className="text-[22px] font-[900] text-[#181725]">
              {editingId ? 'Edit Product' : 'Add Product'}
            </h2>
            {editingId && (
              <p className="text-[12px] text-[#AEAEAE] font-medium mt-0.5">ID: {editingId}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-[40px] h-[40px] rounded-[12px] flex items-center justify-center hover:bg-[#F8F9FB] text-[#7C7C7C] hover:text-[#181725] transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-[#F8F9FB] px-4 lg:px-8 py-4">
          <div className="max-w-[900px] mx-auto w-full space-y-6">
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

              <FormSection title="Identity" icon={<Info size={16} />} sectionId="identity">
                <div>
                  <FieldLabel required>Product Name</FieldLabel>
                  <div className="relative" ref={searchRef}>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        onChange((prev) => ({ ...prev, name: val, masterProductId: '' }));
                        handleSearchMasterProducts(val);
                      }}
                      onFocus={() => {
                        if (form.name.trim().length >= 2) {
                          handleSearchMasterProducts(form.name);
                        }
                      }}
                      placeholder="e.g. Tomato Ketchup 1kg"
                      className={productFormInputCls}
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
                        {masterSuggestions.map((m) => (
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
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={m.imageUrl}
                                alt=""
                                className="w-8 h-8 rounded-[6px] object-cover border border-[#EEEEEE] shrink-0"
                              />
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
                    onChange={(e) => setField('description', e.target.value)}
                    rows={3}
                    className={productFormTextareaCls}
                    placeholder="Enter product description"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required={!form.masterProductId && !editingId}>SKU</FieldLabel>
                    <input
                      type="text"
                      value={form.sku}
                      onChange={(e) => setField('sku', e.target.value.toUpperCase())}
                      placeholder="e.g. MAN-SYR-001"
                      readOnly={!!form.masterProductId}
                      className={cn(
                        productFormInputCls,
                        form.masterProductId && 'bg-[#F8F9FB] cursor-not-allowed',
                      )}
                    />
                  </div>
                  <div>
                    <FieldLabel>HSN</FieldLabel>
                    <input
                      type="text"
                      value={form.hsn}
                      onChange={(e) => setField('hsn', e.target.value)}
                      placeholder="e.g. 210690"
                      className={productFormInputCls}
                    />
                  </div>
                  <div>
                    <FieldLabel>Barcode</FieldLabel>
                    <input
                      type="text"
                      value={form.barcode}
                      onChange={(e) => setField('barcode', e.target.value)}
                      placeholder="e.g. 8901234567890"
                      className={productFormInputCls}
                    />
                  </div>
                  <div>
                    <FieldLabel>EAN</FieldLabel>
                    <input
                      type="text"
                      value={form.ean}
                      onChange={(e) => setField('ean', e.target.value)}
                      placeholder="European Article Number"
                      className={productFormInputCls}
                    />
                  </div>
                </div>
              </FormSection>

              <FormSection
                title="Categories & media"
                icon={<ImageIcon size={16} />}
                sectionId="categories-media"
              >
                <CategoryHierarchyPicker
                  label="Categories"
                  helper="Pick a parent category, then a sub-category. First sub-category is primary."
                  value={form.categoryIds}
                  onChange={(next) => setField('categoryIds', next)}
                />

                <div className="pt-2 border-t border-[#EEEEEE] space-y-4">
                  <ImageUpload
                    label="Product image"
                    value={form.imageUrl}
                    onChange={(url) => setField('imageUrl', url)}
                    folder="brands"
                    size="md"
                  />
                </div>
              </FormSection>

              <FormSection title="Specifications" icon={<Box size={16} />} sectionId="specifications">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>Veg / Non-Veg</FieldLabel>
                    <select
                      value={form.vegNonVeg}
                      onChange={(e) => setField('vegNonVeg', e.target.value as BrandVegNonVeg)}
                      className={productFormSelectCls}
                    >
                      <option value="">Select…</option>
                      <option value="veg">Veg</option>
                      <option value="nonveg">Non-Veg</option>
                      <option value="egg">Egg</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Storage type</FieldLabel>
                    <select
                      value={form.storageType}
                      onChange={(e) => setField('storageType', e.target.value)}
                      className={productFormSelectCls}
                    >
                      <option value="">Select…</option>
                      <option value="ambient">Ambient</option>
                      <option value="refrigerated">Refrigerated</option>
                      <option value="frozen">Frozen</option>
                      <option value="dry">Dry Storage</option>
                      <option value="cool">Cool / Dark</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Shelf life (days)</FieldLabel>
                    <input
                      type="number"
                      min="0"
                      value={form.shelfLifeDays}
                      onChange={(e) => setField('shelfLifeDays', e.target.value)}
                      className={productFormInputCls}
                      placeholder="e.g. 180"
                    />
                  </div>
                  <div>
                    <FieldLabel>Country of origin</FieldLabel>
                    <input
                      type="text"
                      value={form.countryOfOrigin}
                      onChange={(e) => setField('countryOfOrigin', e.target.value)}
                      className={productFormInputCls}
                      placeholder="e.g. India"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel>FSSAI reference</FieldLabel>
                    <input
                      type="text"
                      value={form.fssaiRef}
                      onChange={(e) => setField('fssaiRef', e.target.value)}
                      className={productFormInputCls}
                      placeholder="FSSAI license / product ref"
                    />
                  </div>
                </div>
              </FormSection>

              <FormSection title="Packaging" icon={<Package size={16} />} sectionId="packaging">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>Pack size (quantity)</FieldLabel>
                    <input
                      type="text"
                      value={form.packSize}
                      onChange={(e) => setField('packSize', e.target.value)}
                      placeholder="e.g. 1 ltr, 500 ml, 10 kg"
                      className={productFormInputCls}
                    />
                    <p className="text-[11px] text-[#AEAEAE] mt-1">How much is in one sellable unit</p>
                  </div>
                  <div>
                    <FieldLabel>Unit</FieldLabel>
                    <select
                      value={form.unit}
                      onChange={(e) => setField('unit', e.target.value)}
                      className={productFormSelectCls}
                    >
                      <option value="">Select unit</option>
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                      {form.unit
                        && !(UNIT_OPTIONS as readonly string[]).includes(form.unit) && (
                        <option value={form.unit}>{form.unit}</option>
                      )}
                    </select>
                    <p className="text-[11px] text-[#AEAEAE] mt-1">Packaging type — not the quantity</p>
                  </div>
                  <div>
                    <FieldLabel>Net weight</FieldLabel>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={form.netWeight}
                      onChange={(e) => setField('netWeight', e.target.value)}
                      placeholder="0.000"
                      className={productFormInputCls}
                    />
                  </div>
                  <div>
                    <FieldLabel>Net weight unit</FieldLabel>
                    <select
                      value={form.netWeightUnit}
                      onChange={(e) => setField('netWeightUnit', e.target.value)}
                      className={productFormSelectCls}
                    >
                      <option value="">Select…</option>
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="l">l</option>
                      <option value="ml">ml</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[#EEEEEE]">
                  <div>
                    <FieldLabel>Package Weight</FieldLabel>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.packageWeight}
                      onChange={(e) => setField('packageWeight', e.target.value)}
                      placeholder="0.00"
                      className={productFormInputCls}
                    />
                  </div>
                  <div>
                    <FieldLabel>Weight Unit</FieldLabel>
                    <select
                      value={form.weightUnit}
                      onChange={(e) => setField('weightUnit', e.target.value)}
                      className={productFormSelectCls}
                    >
                      {WEIGHT_UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-[#EEEEEE]">
                  <h4 className="text-[14px] font-bold text-[#181725]">Dimensions</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <FieldLabel>Length</FieldLabel>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.packageLength}
                        onChange={(e) => setField('packageLength', e.target.value)}
                        placeholder="0.00"
                        className={productFormInputCls}
                      />
                    </div>
                    <div>
                      <FieldLabel>Width</FieldLabel>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.packageWidth}
                        onChange={(e) => setField('packageWidth', e.target.value)}
                        placeholder="0.00"
                        className={productFormInputCls}
                      />
                    </div>
                    <div>
                      <FieldLabel>Height</FieldLabel>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.packageHeight}
                        onChange={(e) => setField('packageHeight', e.target.value)}
                        placeholder="0.00"
                        className={productFormInputCls}
                      />
                    </div>
                    <div>
                      <FieldLabel>Dimension Unit</FieldLabel>
                      <select
                        value={form.dimensionUnit}
                        onChange={(e) => setField('dimensionUnit', e.target.value)}
                        className={productFormSelectCls}
                      >
                        {DIMENSION_UNIT_OPTIONS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </FormSection>

              <FormSection title="Search terms" icon={<Search size={16} />} sectionId="search-terms">
                <div>
                  <FieldLabel>Alias / search keywords</FieldLabel>
                  <ChipInput
                    values={form.aliasNames}
                    onChange={(next) => setField('aliasNames', next)}
                    placeholder="Alternate names customers might search for — press Enter"
                  />
                </div>
                <div>
                  <FieldLabel>Tags</FieldLabel>
                  <ChipInput
                    values={form.tags}
                    onChange={(next) => setField('tags', next)}
                    placeholder="Type tags separated by commas, press Enter"
                  />
                </div>
              </FormSection>
          </div>
        </div>

        <div className="px-4 lg:px-6 py-4 border-t border-[#EEEEEE] shrink-0 bg-white">
          <div className="max-w-[900px] mx-auto w-full flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-[48px] bg-[#F8F9FB] border border-[#EEEEEE] text-[#181725] rounded-[12px] text-[14px] font-bold hover:bg-[#EEEEEE] transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={saving}
              className="flex-1 h-[48px] bg-[#299E60] text-white rounded-[12px] text-[14px] font-bold hover:bg-[#238a54] transition-all flex items-center justify-center gap-2 shadow-sm shadow-[#299E60]/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {editingId ? 'Save Changes' : 'Submit Product'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
