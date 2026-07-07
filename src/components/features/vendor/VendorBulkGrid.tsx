'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Search, Save, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// In-browser editable grid ("Excel-like") for fast bulk edits of pricing, metadata and identifiers.
// Inline-edit cells → Save patches each changed row via the vendor product API.

interface GridProduct {
  id: string;
  name: string;
  sku?: string | null;
  categoryName?: string;
  basePrice: number;
  originalPrice?: number;
  taxPercent?: number | null;
  minOrderQty?: number | null;
  isActive: boolean;
  creditEligible: boolean;
  hsn?: string | null;
  brand?: string | null;
  unit?: string | null;
  packSize?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  vegNonVeg?: 'veg' | 'nonveg' | 'egg' | null;
  storageType?: string | null;
  countryOfOrigin?: string | null;
  barcode?: string | null;
  aliasNames?: string[];
  metadata?: Record<string, unknown>;
  inventory?: { qtyAvailable: number } | null;
  priceSlabs?: { minQty: number; price: number }[];
  vendor?: {
    id: string;
    businessName: string;
    vendorCode?: string | null;
  } | null;
}

type EditableField =
  | 'name' | 'sku' | 'hsn' | 'brand' | 'parentCategory' | 'subCategory' | 'additionalSubCategory'
  | 'basePrice' | 'taxPercent' | 'minOrderQty' | 'isActive' | 'creditEligible'
  | 'unit' | 'packSize' | 'description' | 'imageUrl' | 'vegNonVeg' | 'storageType'
  // Metadata fields:
  | 'vendorId' | 'itemId' | 'itemStatus' | 'account' | 'accountCode'
  | 'taxable' | 'exemptionReason' | 'taxabilityType' | 'productType' | 'intraStateTaxName' | 'intraStateTaxType'
  | 'interStateTaxName' | 'interStateTaxType' | 'source' | 'referenceId' | 'lastSyncTime'
  | 'inventoryAccount' | 'inventoryAccountCode' | 'inventoryValuationMethod' | 'reorderPoint' | 'openingStock'
  | 'stockOnHand' | 'itemType' | 'sellable' | 'purchasable' | 'trackInventory' | 'platformCommission'
  | 'packageWeight' | 'packageLength' | 'packageWidth' | 'packageHeight' | 'dimensionUnit' | 'weightUnit'
  | 'aliasName' | 'upc' | 'ean' | 'isbn' | 'countryOfOrigin' | 'variantMapping' | 'substituteMapping'
  | 'bulkQty1Quantity' | 'bulkQty1NetRate';

type RowEdits = Partial<Record<EditableField, any>>;

/** Frozen left columns — widths must match sticky `left` offsets exactly. */
const STICKY_COL = { vendor: 120, itemId: 200, name: 280 } as const;
const STICKY_LEFT_PX = [0, STICKY_COL.vendor, STICKY_COL.vendor + STICKY_COL.itemId] as const;

function stickyLeftStyle(colIdx: number): React.CSSProperties | undefined {
  if (colIdx > 2) return undefined;
  return { left: STICKY_LEFT_PX[colIdx] };
}

function formatItemIdDisplay(p: GridProduct): { display: string; full: string } {
  const metaId = p.metadata?.itemId;
  const full = metaId != null && String(metaId).trim() !== '' ? String(metaId) : p.id;
  if (full.length <= 22) return { display: full, full };
  return { display: `${full.slice(0, 4)}…${full.slice(-4)}`, full };
}

function stickyBodyBg(colIdx: number, isDirty: boolean, rowError: string | undefined): string {
  if (colIdx === 2) {
    if (rowError) return 'bg-red-50';
    if (isDirty) return 'bg-green-50';
    return 'bg-white';
  }
  return 'bg-gray-50';
}

// Maps a grid metadata field to its nested path in Product.metadata — matching the
// importer/exporter shape EXACTLY (metadata.{accounting,inventory,packaging,identifiers,
// attributes}). Fields not listed here are real Product columns handled top-level in the
// PATCH body (name/sku/price/…) or are display-only system fields (vendorId/itemId).
const META_MAP: Partial<Record<string, [section: string, key: string]>> = {
  account: ['accounting', 'account'],
  accountCode: ['accounting', 'accountCode'],
  taxable: ['accounting', 'taxable'],
  exemptionReason: ['accounting', 'exemptionReason'],
  taxabilityType: ['accounting', 'taxabilityType'],
  intraStateTaxName: ['accounting', 'intraStateTaxName'],
  intraStateTaxType: ['accounting', 'intraStateTaxType'],
  interStateTaxName: ['accounting', 'interStateTaxName'],
  interStateTaxType: ['accounting', 'interStateTaxType'],
  inventoryAccount: ['accounting', 'inventoryAccount'],
  inventoryAccountCode: ['accounting', 'inventoryAccountCode'],
  platformCommission: ['accounting', 'platformCommission'],
  reorderPoint: ['inventory', 'reorderPoint'],
  openingStock: ['inventory', 'openingStock'],
  inventoryValuationMethod: ['inventory', 'valuationMethod'],
  trackInventory: ['inventory', 'trackInventory'],
  packageWeight: ['packaging', 'packageWeight'],
  packageLength: ['packaging', 'packageLength'],
  packageWidth: ['packaging', 'packageWidth'],
  packageHeight: ['packaging', 'packageHeight'],
  dimensionUnit: ['packaging', 'dimensionUnit'],
  weightUnit: ['packaging', 'weightUnit'],
  ean: ['identifiers', 'ean'],
  isbn: ['identifiers', 'isbn'],
  itemType: ['attributes', 'itemType'],
  productType: ['attributes', 'productType'],
  source: ['attributes', 'source'],
  referenceId: ['attributes', 'referenceId'],
  lastSyncTime: ['attributes', 'lastSync'],
  sellable: ['attributes', 'sellable'],
  purchasable: ['attributes', 'purchasable'],
  variantMapping: ['attributes', 'variantMapping'],
  itemStatus: ['attributes', 'itemStatus'],
};

export default function VendorBulkGrid({
  open,
  onClose,
  products,
  onComplete,
  patchUrl,
  categories = [],
  brands = [],
  onOpenAdvanced,
  readOnlyCommission = true,
  isAdmin = false,
}: {
  open: boolean;
  onClose: () => void;
  products: GridProduct[];
  onComplete: () => void;
  patchUrl?: (id: string) => string;
  categories?: { id: string; name: string; parentId?: string | null }[];
  brands?: { name: string }[];
  onOpenAdvanced?: () => void;
  /** When true, Platform Commission column is read-only (vendor portal default). */
  readOnlyCommission?: boolean;
  isAdmin?: boolean;
}) {
  const [edits, setEdits] = useState<Record<string, RowEdits>>({});
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  const categoryNames = useMemo(() => {
    return Array.from(new Set(categories.filter((c) => !c.parentId).map((c) => c.name).filter(Boolean)));
  }, [categories]);

  const subCategoryNames = useMemo(() => {
    return Array.from(new Set(categories.filter((c) => !!c.parentId).map((c) => c.name).filter(Boolean)));
  }, [categories]);

  const brandNames = useMemo(() => {
    return Array.from(new Set(brands.map((b) => b.name).filter(Boolean)));
  }, [brands]);

  const COLUMNS = useMemo(() => [
    { key: 'vendorId', label: 'Vendor ID', width: 'w-[120px]', type: 'text', readOnly: true },
    { key: 'itemId', label: 'Item ID', width: 'w-[200px]', type: 'text', readOnly: true },
    { key: 'name', label: 'Item Name', width: 'w-[280px]', type: 'text' },
    { key: 'sku', label: 'SKU', width: 'w-[140px]', type: 'text' },
    { key: 'hsn', label: 'HSN Code', width: 'w-[110px]', type: 'text' },
    { key: 'brand', label: 'Brand', width: 'w-[140px]', type: 'select', options: ['', ...brandNames] },
    { key: 'parentCategory', label: 'Parent Category', width: 'w-[160px]', type: 'select', options: ['', ...categoryNames] },
    { key: 'subCategory', label: 'Sub-Category', width: 'w-[160px]', type: 'select', options: ['', ...subCategoryNames] },
    { key: 'additionalSubCategory', label: 'Additional Sub-Category', width: 'w-[180px]', type: 'select', options: ['', ...subCategoryNames] },
    { key: 'itemStatus', label: 'Item Status', width: 'w-[110px]', type: 'select', options: ['', 'Active', 'Inactive', 'Draft'] },
    { key: 'isActive', label: 'Active on Online Store', width: 'w-[130px]', type: 'checkbox' },
    { key: 'basePrice', label: 'Net Rate', width: 'w-[110px]', type: 'number' },
    { key: 'account', label: 'Account', width: 'w-[130px]', type: 'text' },
    { key: 'accountCode', label: 'Account Code', width: 'w-[110px]', type: 'text' },
    { key: 'taxable', label: 'Taxable', width: 'w-[85px]', type: 'checkbox' },
    { key: 'exemptionReason', label: 'Exemption Reason', width: 'w-[160px]', type: 'text' },
    { key: 'taxabilityType', label: 'Taxability Type', width: 'w-[130px]', type: 'text' },
    { key: 'productType', label: 'Product Type', width: 'w-[110px]', type: 'text' },
    { key: 'intraStateTaxName', label: 'Intra State Tax Name', width: 'w-[150px]', type: 'text' },
    { key: 'taxPercent', label: 'Tax % (GST)', width: 'w-[130px]', type: 'number' },
    { key: 'intraStateTaxType', label: 'Intra State Tax Type', width: 'w-[140px]', type: 'text' },
    { key: 'interStateTaxName', label: 'Inter State Tax Name', width: 'w-[150px]', type: 'text' },
    { key: 'interStateTaxType', label: 'Inter State Tax Type', width: 'w-[140px]', type: 'text' },
    { key: 'source', label: 'Source', width: 'w-[110px]', type: 'text' },
    { key: 'referenceId', label: 'Reference ID', width: 'w-[130px]', type: 'text' },
    { key: 'lastSyncTime', label: 'Last Sync Time', width: 'w-[150px]', type: 'text' },
    { key: 'unit', label: 'Usage unit', width: 'w-[110px]', type: 'text' },
    { key: 'packSize', label: 'Unit Name', width: 'w-[110px]', type: 'text' },
    { key: 'inventoryAccount', label: 'Inventory Account', width: 'w-[150px]', type: 'text' },
    { key: 'inventoryAccountCode', label: 'Inventory Account Code', width: 'w-[150px]', type: 'text' },
    { key: 'inventoryValuationMethod', label: 'Inventory Valuation Method', width: 'w-[170px]', type: 'text' },
    { key: 'reorderPoint', label: 'Reorder Point', width: 'w-[110px]', type: 'number' },
    { key: 'openingStock', label: 'Opening Stock', width: 'w-[110px]', type: 'number' },
    { key: 'stockOnHand', label: 'Stock On Hand', width: 'w-[110px]', type: 'number' },
    { key: 'itemType', label: 'Item Type', width: 'w-[110px]', type: 'text' },
    { key: 'sellable', label: 'Sellable', width: 'w-[85px]', type: 'checkbox' },
    { key: 'purchasable', label: 'Purchasable', width: 'w-[85px]', type: 'checkbox' },
    { key: 'trackInventory', label: 'Track Inventory', width: 'w-[110px]', type: 'checkbox' },
    { key: 'description', label: 'Description', width: 'w-[200px]', type: 'text' },
    { key: 'platformCommission', label: 'Platform Commission', width: 'w-[140px]', type: 'number', readOnly: readOnlyCommission },
    { key: 'imageUrl', label: 'Image URL', width: 'w-[200px]', type: 'text' },
    { key: 'packageWeight', label: 'Package Weight', width: 'w-[110px]', type: 'number' },
    { key: 'packageLength', label: 'Package Length', width: 'w-[110px]', type: 'number' },
    { key: 'packageWidth', label: 'Package Width', width: 'w-[110px]', type: 'number' },
    { key: 'packageHeight', label: 'Package Height', width: 'w-[110px]', type: 'number' },
    { key: 'dimensionUnit', label: 'Dimension Unit', width: 'w-[110px]', type: 'text' },
    { key: 'weightUnit', label: 'Weight Unit', width: 'w-[110px]', type: 'text' },
    { key: 'aliasName', label: 'Alias Name', width: 'w-[140px]', type: 'text' },
    { key: 'upc', label: 'UPC', width: 'w-[110px]', type: 'text' },
    { key: 'ean', label: 'EAN', width: 'w-[110px]', type: 'text' },
    { key: 'isbn', label: 'ISBN', width: 'w-[110px]', type: 'text' },
    { key: 'countryOfOrigin', label: 'Country of Origin', width: 'w-[140px]', type: 'text' },
    { key: 'vegNonVeg', label: 'Veg / Non-Veg', width: 'w-[120px]', type: 'select', options: ['', 'veg', 'nonveg', 'egg'] },
    { key: 'storageType', label: 'Storage type', width: 'w-[120px]', type: 'text' },
    { key: 'minOrderQty', label: 'MOQ', width: 'w-[90px]', type: 'number' },
    { key: 'variantMapping', label: 'Variant Mapping', width: 'w-[140px]', type: 'text' },
    { key: 'substituteMapping', label: 'Substitute Mapping', width: 'w-[150px]', type: 'text' },
    { key: 'bulkQty1Quantity', label: 'Bulk Qty 1 - Quantity', width: 'w-[150px]', type: 'number' },
    { key: 'bulkQty1NetRate', label: 'Bulk Qty 1 - Net Rate / Pc', width: 'w-[160px]', type: 'number' },
  ], [brandNames, categoryNames, subCategoryNames, readOnlyCommission]);

  const subCategoriesForParent = (parentName: string) => {
    if (!parentName) return subCategoryNames;
    const parent = categories.find((c) => c.name === parentName && !c.parentId);
    if (!parent) return subCategoryNames;
    return categories.filter((c) => c.parentId === parent.id).map((c) => c.name);
  };

  useEffect(() => {
    if (open) {
      Promise.resolve().then(() => {
        setEdits({});
        setQuery('');
        setSaveErrors({});
      });
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q),
    );
  }, [products, query]);

  if (!open) return null;

  const dirtyIds = Object.keys(edits).filter((id) => Object.keys(edits[id]).length > 0);

  const getProductCategory = (p: GridProduct) => {
    if (!categories || categories.length === 0) return null;
    return categories.find((c) => c.name === p.categoryName) || null;
  };

  const getVal = (p: GridProduct, field: EditableField): any => {
    if (edits[p.id]?.[field] !== undefined) {
      return edits[p.id][field];
    }
    // Check top level
    if (field === 'vendorId') return p.metadata?.vendorId || p.vendor?.vendorCode || '';
    if (field === 'itemId') return p.metadata?.itemId || p.id || '';
    if (field === 'name') return p.name;
    if (field === 'sku') return p.sku ?? '';
    if (field === 'hsn') return p.hsn ?? '';
    if (field === 'brand') {
      const dbBrand = p.brand ?? '';
      if (!dbBrand) return '';
      if (brandNames.includes(dbBrand)) return dbBrand;
      // Fuzzy match
      const fuzzy = brandNames.find(
        (b) => dbBrand.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(dbBrand.toLowerCase())
      );
      return fuzzy || '';
    }
    if (field === 'basePrice') return p.basePrice;
    if (field === 'taxPercent') {
      return p.taxPercent ?? 0;
    }
    if (field === 'minOrderQty') return p.minOrderQty ?? 1;
    if (field === 'isActive') return p.isActive;
    if (field === 'creditEligible') return p.creditEligible;
    if (field === 'unit') return p.unit ?? '';
    if (field === 'packSize') return p.packSize ?? '';
    if (field === 'description') return p.description ?? '';
    if (field === 'imageUrl') return p.imageUrl ?? '';
    if (field === 'vegNonVeg') return p.vegNonVeg ?? '';
    if (field === 'storageType') return p.storageType ?? '';
    if (field === 'countryOfOrigin') return p.countryOfOrigin ?? '';
    if (field === 'stockOnHand') return p.inventory?.qtyAvailable ?? '';
    if (field === 'aliasName') return p.aliasNames?.[0] ?? '';
    if (field === 'upc') return p.barcode ?? '';
    if (field === 'bulkQty1Quantity') return p.priceSlabs?.[0]?.minQty ?? '';
    if (field === 'bulkQty1NetRate') return p.priceSlabs?.[0]?.price ?? '';

    if (field === 'parentCategory') {
      const metaVal = p.metadata?.['Parent Category'];
      if (metaVal) return metaVal;
      const cat = getProductCategory(p);
      if (cat) {
        if (cat.parentId) {
          const parent = categories.find((c) => c.id === cat.parentId);
          return parent ? parent.name : '';
        }
        return cat.name;
      }
      return '';
    }

    // Check subCategory resolution
    if (field === 'subCategory') {
      const metaVal = p.metadata?.['Sub-Category'];
      if (metaVal) return metaVal;
      const cat = getProductCategory(p);
      if (cat && cat.parentId) {
        return cat.name;
      }
      return '';
    }

    // Check additionalSubCategory
    if (field === 'additionalSubCategory') {
      return p.metadata?.['Additional Sub-Category'] ?? '';
    }

    // Nested metadata read — matches the importer/exporter shape exactly.
    const path = META_MAP[field];
    if (path) {
      const [section, key] = path;
      const sec = (p.metadata as Record<string, any> | undefined)?.[section] as
        | Record<string, any>
        | undefined;
      return sec && sec[key] != null ? sec[key] : '';
    }
    return '';
  };

  const boolVal = (p: GridProduct, field: EditableField): boolean => {
    const raw = getVal(p, field);
    return raw === true || String(raw).toLowerCase() === 'true';
  };

  const textVal = (p: GridProduct, field: EditableField): string => {
    const raw = getVal(p, field);
    return raw === undefined || raw === null ? '' : String(raw);
  };

  const setVal = (id: string, field: EditableField, value: any) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const save = async () => {
    if (dirtyIds.length === 0) {
      toast('No changes to save');
      return;
    }
    setSaving(true);
    setSaveErrors({});
    let ok = 0;
    let fail = 0;
    const rowErrors: Record<string, string> = {};

    for (const id of dirtyIds) {
      const e = edits[id];
      const p = products.find((prod) => prod.id === id);
      if (!p) continue;

      const body: Record<string, unknown> = {};
      const meta: Record<string, unknown> = { ...(p.metadata ?? {}) };

      if (e.name !== undefined) body.name = e.name;
      if (e.sku !== undefined) body.sku = e.sku;
      if (e.hsn !== undefined) body.hsn = e.hsn;
      if (e.brand !== undefined) body.brand = e.brand;
      if (e.basePrice !== undefined) body.basePrice = parseFloat(String(e.basePrice)) || 0;
      if (e.taxPercent !== undefined) {
        const rate = parseFloat(String(e.taxPercent)) || 0;
        body.taxPercent = rate;
        meta.accounting = {
          ...((meta.accounting as Record<string, unknown>) ?? {}),
          intraStateTaxRate: rate,
          interStateTaxRate: rate,
        };
      }
      if (e.minOrderQty !== undefined) body.minOrderQty = parseInt(String(e.minOrderQty), 10) || 1;
      if (e.isActive !== undefined) body.isActive = Boolean(e.isActive);
      if (e.creditEligible !== undefined) body.creditEligible = Boolean(e.creditEligible);
      if (e.unit !== undefined) body.unit = e.unit;
      if (e.packSize !== undefined) body.packSize = e.packSize;
      if (e.description !== undefined) body.description = e.description;
      if (e.imageUrl !== undefined) body.imageUrl = e.imageUrl;
      if (e.vegNonVeg !== undefined) body.vegNonVeg = e.vegNonVeg || null;
      if (e.storageType !== undefined) body.storageType = e.storageType;
      if (e.countryOfOrigin !== undefined) body.countryOfOrigin = e.countryOfOrigin;
      if (e.aliasName !== undefined) body.aliasNames = e.aliasName ? [String(e.aliasName)] : [];
      if (e.upc !== undefined) body.barcode = e.upc || null;

      const finalParent = e.parentCategory !== undefined ? e.parentCategory : getVal(p, 'parentCategory');
      const finalSub = e.subCategory !== undefined ? e.subCategory : getVal(p, 'subCategory');
      const finalAdditional =
        e.additionalSubCategory !== undefined ? e.additionalSubCategory : getVal(p, 'additionalSubCategory');

      if (e.parentCategory !== undefined || e.subCategory !== undefined || e.additionalSubCategory !== undefined) {
        if (finalParent && !finalSub) {
          rowErrors[id] = 'Sub-category required when parent is set';
          fail++;
          continue;
        }
        const categoryIds: string[] = [];
        if (finalSub) {
          const subCat = categories.find((c) => c.name === finalSub && !!c.parentId);
          if (subCat) categoryIds.push(subCat.id);
        }
        if (finalAdditional) {
          const addCat = categories.find((c) => c.name === finalAdditional && !!c.parentId);
          if (addCat && !categoryIds.includes(addCat.id)) categoryIds.push(addCat.id);
        }
        if (categoryIds.length > 0) {
          body.categoryId = categoryIds[0];
          body.categoryIds = categoryIds;
        }
      }

      if (e.bulkQty1Quantity !== undefined || e.bulkQty1NetRate !== undefined) {
        const existingSlab = p.priceSlabs?.[0];
        body.priceSlabs = [
          {
            minQty: parseInt(String(e.bulkQty1Quantity ?? existingSlab?.minQty ?? 1), 10) || 1,
            price: parseFloat(String(e.bulkQty1NetRate ?? existingSlab?.price ?? p.basePrice)) || p.basePrice,
          },
        ];
      }

      let hasMetaChange = e.taxPercent !== undefined;
      for (const fieldKey of Object.keys(META_MAP) as EditableField[]) {
        if (e[fieldKey] === undefined) continue;
        const [section, key] = META_MAP[fieldKey]!;
        meta[section] = { ...((meta[section] as Record<string, unknown>) ?? {}), [key]: e[fieldKey] };
        hasMetaChange = true;
      }
      if (hasMetaChange) {
        body.metadata = meta;
      }

      try {
        const url = patchUrl ? patchUrl(id) : `/api/v1/vendor/products/${id}`;
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.success) {
          rowErrors[id] = json.error?.message || json.message || 'Save failed';
          fail++;
          continue;
        }

        if (e.stockOnHand !== undefined) {
          const qty = parseInt(String(e.stockOnHand), 10);
          if (!isNaN(qty) && qty >= 0) {
            const invUrl = isAdmin ? '/api/v1/admin/inventory/bulk' : '/api/v1/vendor/inventory';
            const invBody = isAdmin
              ? { productIds: [id], mode: 'set', value: qty }
              : { items: [{ productId: id, qtyAvailable: qty }] };
            const invRes = await fetch(invUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(invBody),
            });
            const invJson = await invRes.json();
            if (!invJson.success) {
              rowErrors[id] = invJson.error?.message || 'Stock update failed';
              fail++;
              continue;
            }
          }
        }

        ok++;
      } catch {
        rowErrors[id] = 'Network error';
        fail++;
      }
    }

    setSaving(false);
    setSaveErrors(rowErrors);

    if (fail === 0) {
      toast.success(`Saved ${ok} product${ok !== 1 ? 's' : ''}`);
      onComplete();
      onClose();
    } else if (ok > 0) {
      toast.error(`Saved ${ok}, ${fail} failed — fix highlighted rows and retry`);
      onComplete();
    } else {
      toast.error(`All ${fail} saves failed`);
    }
  };

  const cellInput =
    'w-full h-[32px] px-2.5 border-0 bg-transparent text-[12px] outline-none focus:bg-white font-normal text-[#181725] transition-colors';

  return (
    <div className="fixed inset-0 z-[10005] flex flex-col bg-white animate-in fade-in duration-150">
      {/* Header */}
      <div className="shrink-0 border-b border-[#EEEEEE] px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-[8px] transition-colors"
          >
            <X size={20} className="text-[#7C7C7C]" />
          </button>
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold text-[#181725]">Bulk Update</h2>
            <p className="text-[12px] text-[#AEAEAE]">
              Edit price, tax, metadata and availability inline — like a spreadsheet.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">

          {onOpenAdvanced && (
            <button
              type="button"
              onClick={onOpenAdvanced}
              className="h-[38px] px-3.5 border border-[#EEEEEE] bg-white rounded-[10px] text-[12px] font-bold text-[#7C7C7C] hover:bg-gray-50 hover:text-[#181725] transition-all flex items-center gap-1.5 shrink-0"
            >
              <Wand2 size={13} className="text-[#299E60]" />
              Advanced
            </button>
          )}
          <div className="relative hidden sm:block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="w-[220px] h-[38px] pl-9 pr-3 border border-[#EEEEEE] rounded-[10px] text-[13px] outline-none focus:border-[#299E60]/40"
            />
          </div>
          <span className="text-[12px] font-semibold text-[#7C7C7C]">
            {dirtyIds.length} edited
          </span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || dirtyIds.length === 0}
            className="h-[40px] px-5 bg-[#299E60] text-white rounded-[10px] text-[13px] font-bold hover:bg-[#238a54] transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save changes
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        <style>{`
          .custom-excel-scrollbar::-webkit-scrollbar {
            width: 14px !important;
            height: 14px !important;
            display: block !important;
          }
          .custom-excel-scrollbar::-webkit-scrollbar-track {
            background: #F3F4F6 !important;
            border-radius: 4px !important;
          }
          .custom-excel-scrollbar::-webkit-scrollbar-thumb {
            background: #9CA3AF !important;
            border: 2.5px solid #F3F4F6 !important;
            border-radius: 6px !important;
          }
          .custom-excel-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #4B5563 !important;
          }
        `}</style>
        <div className="bg-white border border-[#D1D5DB] rounded-lg shadow-sm overflow-hidden h-full">
          <div className="w-full h-full overflow-auto custom-excel-scrollbar">
            <table className="min-w-max table-fixed border-collapse text-[13px] bg-white">
              <colgroup>
                <col style={{ width: STICKY_COL.vendor }} />
                <col style={{ width: STICKY_COL.itemId }} />
                <col style={{ width: STICKY_COL.name }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#F3F4F6]">
                <tr className="text-left text-[11px] font-bold text-[#4B5563] uppercase tracking-wide h-[36px]">
                  {COLUMNS.map((col, colIdx) => {
                    const isSticky = colIdx < 3;
                    const stickyClass = isSticky
                      ? cn('sticky z-30 bg-[#F3F4F6] overflow-hidden truncate max-w-0', colIdx === 2 && 'shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]')
                      : '';
                    return (
                    <th
                      key={col.key}
                      style={stickyLeftStyle(colIdx)}
                      className={cn('px-2.5 py-1.5 border-r border-b border-[#D1D5DB] text-center font-bold', col.width, stickyClass)}
                    >
                      {col.label}
                      {col.key === 'platformCommission' && readOnlyCommission && (
                        <span className="block text-[9px] font-normal normal-case text-[#9CA3AF]">Admin only</span>
                      )}
                    </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const isDirty = !!edits[p.id] && Object.keys(edits[p.id]).length > 0;
                  const rowError = saveErrors[p.id];
                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        'border-b border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors h-[32px]',
                        isDirty && 'bg-green-50/70 hover:bg-green-50',
                        rowError && 'bg-red-50/80',
                      )}
                      title={rowError || undefined}
                    >
                      {COLUMNS.map((col, colIdx) => {
                        const fieldKey = col.key as EditableField;
                        const isSticky = colIdx < 3;
                        const stickyClass = isSticky
                          ? cn(
                              'sticky z-20 overflow-hidden truncate max-w-0',
                              stickyBodyBg(colIdx, isDirty, rowError),
                              colIdx === 2 && 'shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]',
                            )
                          : '';

                        if (col.readOnly) {
                          const displayText =
                            fieldKey === 'itemId'
                              ? formatItemIdDisplay(p).display
                              : textVal(p, fieldKey);
                          const titleText =
                            fieldKey === 'itemId'
                              ? formatItemIdDisplay(p).full
                              : displayText || undefined;
                          return (
                            <td
                              key={col.key}
                              title={titleText}
                              style={stickyLeftStyle(colIdx)}
                              className={cn(
                                'px-2.5 py-1 text-[#9CA3AF] select-none border-r border-b border-[#E5E7EB] truncate text-[12px] align-middle',
                                col.width,
                                isSticky ? stickyClass : 'bg-gray-50/50',
                              )}
                            >
                              {displayText || '—'}
                            </td>
                          );
                        }

                        if (col.key === 'imageUrl') {
                          const imgUrl = textVal(p, fieldKey);
                          return (
                            <td key={col.key} className={cn("p-0 border-r border-b border-[#E5E7EB] align-middle", col.width)}>
                              <div className="flex items-center gap-1 px-1 h-[32px]">
                                {imgUrl ? (
                                  <img
                                    src={imgUrl}
                                    alt=""
                                    className="w-7 h-7 rounded object-cover shrink-0 cursor-pointer border border-[#EEEEEE]"
                                    onClick={() => window.open(imgUrl, '_blank')}
                                  />
                                ) : null}
                                <input
                                  type="text"
                                  value={imgUrl}
                                  onChange={(ev) => setVal(p.id, fieldKey, ev.target.value)}
                                  className={cn(cellInput, 'text-left min-w-0')}
                                  placeholder="—"
                                />
                              </div>
                            </td>
                          );
                        }

                        if (col.type === 'checkbox') {
                          return (
                            <td key={col.key} className={cn("p-0 border-r border-b border-[#E5E7EB] align-middle text-center", col.width)}>
                              <div className="flex items-center justify-center w-full h-[32px]">
                                <input
                                  type="checkbox"
                                  checked={boolVal(p, fieldKey)}
                                  onChange={(e) => setVal(p.id, fieldKey, e.target.checked)}
                                  className="w-4 h-4 accent-[#299E60] cursor-pointer"
                                />
                              </div>
                            </td>
                          );
                        }

                        if (col.type === 'select') {
                          const parentName = textVal(p, 'parentCategory');
                          const baseOptions =
                            col.key === 'subCategory' || col.key === 'additionalSubCategory'
                              ? ['', ...subCategoriesForParent(parentName)]
                              : [...(col.options || [])];
                          const options = [...baseOptions];
                          const currentVal = textVal(p, fieldKey);
                          if (currentVal && !options.includes(currentVal)) {
                            options.push(currentVal);
                          }
                          return (
                            <td
                              key={col.key}
                              style={stickyLeftStyle(colIdx)}
                              className={cn(
                                'p-0 border-r border-b border-[#E5E7EB] align-middle focus-within:ring-1 focus-within:ring-[#299E60] focus-within:bg-white overflow-hidden',
                                col.width,
                                stickyClass,
                              )}
                            >
                              <select
                                value={currentVal}
                                onChange={(e) => setVal(p.id, fieldKey, e.target.value)}
                                className="w-full h-[32px] px-2.5 text-[12px] bg-transparent border-0 outline-none focus:bg-white cursor-pointer"
                              >
                                {options.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt || '—'}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={col.key}
                            style={stickyLeftStyle(colIdx)}
                            className={cn(
                              'p-0 border-r border-b border-[#E5E7EB] align-middle focus-within:ring-1 focus-within:ring-[#299E60] focus-within:bg-white overflow-hidden',
                              col.width,
                              isSticky ? stickyClass : '',
                            )}
                          >
                            <input
                              type={col.type}
                              value={textVal(p, fieldKey)}
                              onChange={(e) => setVal(p.id, fieldKey, e.target.value)}
                              className={cn(
                                cellInput,
                                col.type === 'number' ? 'text-right font-mono' : 'text-left',
                                col.key === 'sku' || col.key === 'hsn' ? 'font-mono text-[11px]' : ''
                              )}
                              placeholder="—"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-[#AEAEAE] text-[13px]">
                      No products match “{query}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
