'use client';

/**
 * ProductImportModal (shared) — the single source of truth for product bulk
 * import in BOTH the admin and vendor portals. The two portals differ only by
 * config (endpoints + an optional vendor selector), so they share this one
 * component and can never drift apart.
 *
 * Flow: upload → review (Excel-like grid OR focused detail) → result+undo.
 * All money is rendered in ₹ (this is an India-only B2B platform).
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  X, Upload, Download, Loader2, ChevronLeft, ChevronRight,
  CheckCircle, AlertTriangle, ArrowRight, RotateCcw, Eye, Check, Store, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ColumnDef {
  key: string;
  label: string;
  width: string;
  type: string;
  bg?: string;
  sticky?: boolean;
  readOnly?: boolean;
  options?: string[];
}

export interface ImportModalConfig {
  /** POST endpoint for preview+commit (FormData). */
  importEndpoint: string;
  /** GET endpoint that returns the .xlsx template. */
  templateUrl: string;
  /** PATCH base used by Undo, e.g. `/api/v1/vendor/products` → `${base}/${id}`. */
  productPatchBase: string;
  /** GET categories endpoint (tolerates tree or {categories:[]} shapes). */
  categoriesEndpoint: string;
  /** When provided, renders a vendor selector (admin importing on behalf of a vendor). */
  vendors?: Array<{ id: string; businessName: string }>;
}

type EditSlab = { minQty: number; grossRate: number; promoGrossRate?: number | null };
type EditRow = Partial<{
  name: string;
  sku: string;
  hsn: string;
  brand: string;
  unit: string;
  category: string;
  basePrice: number;
  taxPercent: number;
  promoPrice: number;
  stock: number;
  imageUrl: string;
  imageName: string;
  slabs: EditSlab[];
  // Flat attributes
  parentCategory: string;
  subCategory: string;
  additionalSubCategories: string[];
  vegNonVeg: string;
  storageType: string;
  moq: number;
  aliasName: string;
  upc: string;
  // Metadata fields
  account: string;
  accountCode: string;
  taxable: boolean;
  exemptionReason: string;
  taxabilityType: string;
  productType: string;
  platformCommission: number;
  inventoryAccount: string;
  inventoryAccountCode: string;
  valuationMethod: string;
  trackInventory: boolean;
  reorderPoint: number;
  openingStock: number;
  packageWeight: number;
  packageLength: number;
  packageWidth: number;
  packageHeight: number;
  dimensionUnit: string;
  weightUnit: string;
  ean: string;
  isbn: string;
  itemType: string;
  source: string;
  referenceId: string;
  lastSync: string;
  sellable: boolean;
  purchasable: boolean;
  variantMapping: string;
  itemStatus: string;
  activeOnlineStore: boolean;
}>;

interface PreviewSlab { minQty: number; price: number; grossRate: number; promoPrice?: number | null; promoGrossRate?: number | null }

interface PreviewItem {
  row: number;
  action: 'create' | 'update' | 'skip';
  name: string;
  sku?: string;
  hsn?: string;
  brand?: string;
  unit?: string;
  category?: string;
  basePrice: number;
  grossRate: number;
  taxPercent: number;
  promoPrice?: number | null;
  stock?: number;
  imageUrl?: string | null;
  imageName?: string | null;
  bulkSlabCount: number;
  bulkSlabs?: PreviewSlab[];
  hasPromo: boolean;
  existing?: {
    id: string; name: string; basePrice: number;
    taxPercent: number; stock: number; brand?: string; sku?: string;
  };
  skipReason?: string;
  // New flat attributes
  parentCategory?: string;
  subCategory?: string;
  additionalSubCategories?: string[];
  vegNonVeg?: string;
  storageType?: string;
  moq?: number;
  aliasName?: string;
  upc?: string;
  metadata?: Record<string, any>;
}

interface ParseError { row: number; field?: string; message: string }

interface PreviewData {
  totalRows: number;
  creates: number;
  updates: number;
  skips: number;
  errors: ParseError[];
  items: PreviewItem[];
}

interface CommitResult {
  created: number;
  updated: number;
  imported: number;
  blocked: boolean;
  errors: { row: number; field?: string; message: string }[];
  errorReport?: string;
  backupId: string;
}

type Step = 'upload' | 'review' | 'result';

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  config: ImportModalConfig;
}

const inr = (n: number | null | undefined) =>
  n == null || isNaN(Number(n)) ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function ProductImportModal({ open, onClose, onComplete, config }: Props) {
  const [step, setStep] = useState<Step>('upload');

  // Upload step
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Admin-only vendor selection
  const [vendorId, setVendorId] = useState('');

  // Review step
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [skipRows, setSkipRows] = useState<Set<number>>(new Set());
  const [reviewIdx, setReviewIdx] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [edits, setEdits] = useState<Record<number, EditRow>>({});

  // Categories (flattened name list for the dropdowns)
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (!open || categories.length > 0) return;
    fetch(config.categoriesEndpoint)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) return;
        // Tolerate both shapes: {data:[tree]} (vendor) and {data:{categories:[]}} (admin).
        const raw = Array.isArray(j.data) ? j.data : (j.data?.categories ?? []);
        type Cat = { id: string; name: string; children?: Cat[] };
        const flat: Array<{ id: string; name: string }> = [];
        const walk = (list: Cat[]) => {
          for (const c of list) {
            flat.push({ id: c.id, name: c.name });
            if (c.children?.length) walk(c.children);
          }
        };
        walk(raw as Cat[]);
        setCategories(flat);
      })
      .catch(() => {});
  }, [open, categories.length, config.categoriesEndpoint]);

  // Commit step
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [backupData, setBackupData] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);

  const reset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setParsing(false);
    setVendorId('');
    setPreview(null);
    setSkipRows(new Set());
    setReviewIdx(0);
    setViewMode('list');
    setEdits({});
    setCommitting(false);
    setResult(null);
    setBackupData(null);
    setUndoing(false);
    setUndone(false);
  }, []);

  const setEdit = useCallback(<K extends keyof EditRow>(row: number, key: K, value: EditRow[K] | undefined) => {
    setEdits((prev) => {
      const next = { ...prev };
      const rowEdits: EditRow = { ...(next[row] ?? {}) };
      if (value === undefined) delete rowEdits[key];
      else rowEdits[key] = value;
      if (Object.keys(rowEdits).length === 0) delete next[row];
      else next[row] = rowEdits;
      return next;
    });
  }, []);

  // Edit one bulk-slab tier (0 or 1) for a row. Seeds from the current edit
  // or the parsed slabs, updates the tier, drops tiers that aren't fully
  // filled, and stores the result as an `slabs` edit.
  const setSlab = useCallback((row: number, item: PreviewItem, tier: 0 | 1, field: keyof EditSlab, value: number | null) => {
    setEdits((prev) => {
      const existingSlabs = prev[row]?.slabs ?? (item.bulkSlabs ?? []).map((s) => ({ minQty: s.minQty, grossRate: s.grossRate, promoGrossRate: s.promoGrossRate }));
      const arr: EditSlab[] = [
        { ...(existingSlabs[0] ?? { minQty: 0, grossRate: 0, promoGrossRate: null }) },
        { ...(existingSlabs[1] ?? { minQty: 0, grossRate: 0, promoGrossRate: null }) },
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      arr[tier][field] = value as any;
      const cleaned = arr.filter((s) => Number(s.minQty) > 0 && Number(s.grossRate) > 0);
      const next = { ...prev };
      next[row] = { ...(next[row] ?? {}), slabs: cleaned };
      return next;
    });
  }, []);
  const COLUMNS: ColumnDef[] = useMemo(() => {
    const list = [
      { key: 'name', label: 'Product Name', width: 'w-[280px]', type: 'text', sticky: true },
      { key: 'action', label: 'Action', width: 'w-[80px]', type: 'custom', readOnly: true },
      { key: 'image', label: 'Image', width: 'w-[180px]', type: 'custom' },
      { key: 'sku', label: 'SKU', width: 'w-[130px]', type: 'text' },
      { key: 'hsn', label: 'HSN Code', width: 'w-[110px]', type: 'text' },
      { key: 'brand', label: 'Brand', width: 'w-[140px]', type: 'text' },
      { key: 'unit', label: 'Unit', width: 'w-[90px]', type: 'text' },
      { key: 'category', label: 'Category', width: 'w-[160px]', type: 'select' },
      { key: 'parentCategory', label: 'Parent Category', width: 'w-[150px]', type: 'text' },
      { key: 'subCategory', label: 'Sub-Category', width: 'w-[150px]', type: 'text' },
      { key: 'additionalSubCategory', label: 'Additional Sub-Category', width: 'w-[180px]', type: 'text' },
      { key: 'basePrice', label: 'Taxable ₹', width: 'w-[115px]', type: 'number', bg: 'bg-[#EEF6F1]' },
      { key: 'taxPercent', label: 'Tax %', width: 'w-[90px]', type: 'number', bg: 'bg-[#EEF6F1]' },
      { key: 'grossPrice', label: 'Gross ₹', width: 'w-[110px]', type: 'custom', bg: 'bg-[#EEF6F1]' },
      { key: 'slab1Qty', label: 'Slab1 Qty', width: 'w-[90px]', type: 'custom', bg: 'bg-[#FBF7EC]' },
      { key: 'slab1Rate', label: 'Slab1 ₹', width: 'w-[100px]', type: 'custom', bg: 'bg-[#FBF7EC]' },
      { key: 'slab1PromoRate', label: 'Slab1 Promo ₹', width: 'w-[110px]', type: 'custom', bg: 'bg-[#FBF7EC]' },
      { key: 'slab2Qty', label: 'Slab2 Qty', width: 'w-[90px]', type: 'custom', bg: 'bg-[#FBF7EC]' },
      { key: 'slab2Rate', label: 'Slab2 ₹', width: 'w-[100px]', type: 'custom', bg: 'bg-[#FBF7EC]' },
      { key: 'slab2PromoRate', label: 'Slab2 Promo ₹', width: 'w-[110px]', type: 'custom', bg: 'bg-[#FBF7EC]' },
      { key: 'promoPrice', label: 'Promo ₹', width: 'w-[100px]', type: 'number' },
      { key: 'stock', label: 'Stock', width: 'w-[90px]', type: 'number' },
      { key: 'imageUrl', label: 'Image URL', width: 'w-[200px]', type: 'text' },
      { key: 'aliasName', label: 'Alias Name', width: 'w-[150px]', type: 'text' },
      { key: 'upc', label: 'UPC', width: 'w-[120px]', type: 'text' },
      { key: 'vegNonVeg', label: 'Veg / Non-Veg', width: 'w-[120px]', type: 'select', options: ['', 'veg', 'nonveg', 'egg'] },
      { key: 'storageType', label: 'Storage type', width: 'w-[120px]', type: 'text' },
      { key: 'moq', label: 'MOQ', width: 'w-[90px]', type: 'number' },
      { key: 'account', label: 'Account', width: 'w-[140px]', type: 'text' },
      { key: 'accountCode', label: 'Account Code', width: 'w-[120px]', type: 'text' },
      { key: 'taxable', label: 'Taxable', width: 'w-[85px]', type: 'checkbox' },
      { key: 'exemptionReason', label: 'Exemption Reason', width: 'w-[160px]', type: 'text' },
      { key: 'taxabilityType', label: 'Taxability Type', width: 'w-[130px]', type: 'text' },
      { key: 'productType', label: 'Product Type', width: 'w-[110px]', type: 'text' },
      { key: 'platformCommission', label: 'Platform Commission', width: 'w-[140px]', type: 'number' },
      { key: 'inventoryAccount', label: 'Inventory Account', width: 'w-[160px]', type: 'text' },
      { key: 'inventoryAccountCode', label: 'Inventory Account Code', width: 'w-[160px]', type: 'text' },
      { key: 'valuationMethod', label: 'Inventory Valuation Method', width: 'w-[180px]', type: 'text' },
      { key: 'trackInventory', label: 'Track Inventory', width: 'w-[110px]', type: 'checkbox' },
      { key: 'reorderPoint', label: 'Reorder Point', width: 'w-[110px]', type: 'number' },
      { key: 'openingStock', label: 'Opening Stock', width: 'w-[110px]', type: 'number' },
      { key: 'packageWeight', label: 'Package Weight', width: 'w-[110px]', type: 'number' },
      { key: 'packageLength', label: 'Package Length', width: 'w-[110px]', type: 'number' },
      { key: 'packageWidth', label: 'Package Width', width: 'w-[110px]', type: 'number' },
      { key: 'packageHeight', label: 'Package Height', width: 'w-[110px]', type: 'number' },
      { key: 'dimensionUnit', label: 'Dimension Unit', width: 'w-[110px]', type: 'text' },
      { key: 'weightUnit', label: 'Weight Unit', width: 'w-[110px]', type: 'text' },
      { key: 'ean', label: 'EAN', width: 'w-[115px]', type: 'text' },
      { key: 'isbn', label: 'ISBN', width: 'w-[115px]', type: 'text' },
      { key: 'itemType', label: 'Item Type', width: 'w-[110px]', type: 'text' },
      { key: 'source', label: 'Source', width: 'w-[110px]', type: 'text' },
      { key: 'referenceId', label: 'Reference ID', width: 'w-[130px]', type: 'text' },
      { key: 'lastSync', label: 'Last Sync', width: 'w-[150px]', type: 'text' },
      { key: 'sellable', label: 'Sellable', width: 'w-[85px]', type: 'checkbox' },
      { key: 'purchasable', label: 'Purchasable', width: 'w-[85px]', type: 'checkbox' },
      { key: 'variantMapping', label: 'Variant Mapping', width: 'w-[145px]', type: 'text' },
      { key: 'itemStatus', label: 'Item Status', width: 'w-[110px]', type: 'text' },
      { key: 'activeOnlineStore', label: 'Active on Online Store', width: 'w-[140px]', type: 'checkbox' },
    ];
    // The legacy single "Category" column is only for OLD flat sheets. Hide it whenever
    // the sheet uses the Parent / Sub / Additional hierarchy (the canonical model) — i.e.
    // show it only for rows that have a category label but NO hierarchy fields.
    const hasLegacyCategory = preview?.items.some(
      (i) => i.category && !i.parentCategory && !i.subCategory && !(i.additionalSubCategories?.length),
    );
    if (preview && !hasLegacyCategory) {
      return list.filter((c) => c.key !== 'category');
    }
    return list;
  }, [preview]);

  const getVal = useCallback((item: PreviewItem, field: string): any => {
    const rowEdit = edits[item.row] ?? {};
    if (rowEdit[field as keyof EditRow] !== undefined) {
      return rowEdit[field as keyof EditRow];
    }

    if (field === 'name') return item.name;
    if (field === 'sku') return item.sku ?? '';
    if (field === 'hsn') return item.hsn ?? '';
    if (field === 'brand') return item.brand ?? '';
    if (field === 'unit') return item.unit ?? '';
    if (field === 'basePrice') return item.basePrice;
    if (field === 'taxPercent') return item.taxPercent;
    if (field === 'promoPrice') return item.promoPrice ?? '';
    if (field === 'stock') return item.stock ?? '';
    if (field === 'imageUrl') return item.imageUrl ?? '';
    if (field === 'imageName') return item.imageName ?? '';
    
    if (field === 'parentCategory') return item.parentCategory ?? '';
    if (field === 'subCategory') return item.subCategory ?? '';
    if (field === 'additionalSubCategory') {
      const edited = edits[item.row]?.additionalSubCategories;
      if (edited !== undefined) return edited.join(', ');
      return item.additionalSubCategories?.join(', ') ?? '';
    }
    if (field === 'vegNonVeg') return item.vegNonVeg ?? '';
    if (field === 'storageType') return item.storageType ?? '';
    if (field === 'moq') return item.moq ?? 1;
    if (field === 'aliasName') return item.aliasName ?? '';
    if (field === 'upc') return item.upc ?? '';

    const meta = item.metadata || {};
    const acc = meta.accounting || {};
    const inv = meta.inventory || {};
    const pkg = meta.packaging || {};
    const ids = meta.identifiers || {};
    const att = meta.attributes || {};

    if (field === 'account') return acc.account ?? '';
    if (field === 'accountCode') return acc.accountCode ?? '';
    if (field === 'taxable') return acc.taxable ?? false;
    if (field === 'exemptionReason') return acc.exemptionReason ?? '';
    if (field === 'taxabilityType') return acc.taxabilityType ?? '';
    if (field === 'productType') return att.productType ?? '';
    if (field === 'source') return att.source ?? '';
    if (field === 'referenceId') return att.referenceId ?? '';
    if (field === 'lastSync') return att.lastSync ?? '';
    if (field === 'inventoryAccount') return acc.inventoryAccount ?? '';
    if (field === 'inventoryAccountCode') return acc.inventoryAccountCode ?? '';
    if (field === 'valuationMethod') return inv.valuationMethod ?? '';
    if (field === 'reorderPoint') return inv.reorderPoint ?? '';
    if (field === 'openingStock') return inv.openingStock ?? '';
    if (field === 'itemType') return att.itemType ?? '';
    if (field === 'sellable') return att.sellable ?? false;
    if (field === 'purchasable') return att.purchasable ?? false;
    if (field === 'trackInventory') return inv.trackInventory ?? false;
    if (field === 'packageWeight') return pkg.packageWeight ?? '';
    if (field === 'packageLength') return pkg.packageLength ?? '';
    if (field === 'packageWidth') return pkg.packageWidth ?? '';
    if (field === 'packageHeight') return pkg.packageHeight ?? '';
    if (field === 'dimensionUnit') return pkg.dimensionUnit ?? '';
    if (field === 'weightUnit') return pkg.weightUnit ?? '';
    if (field === 'ean') return ids.ean ?? '';
    if (field === 'isbn') return ids.isbn ?? '';
    if (field === 'variantMapping') return att.variantMapping ?? '';
    if (field === 'platformCommission') return acc.platformCommission ?? '';
    if (field === 'itemStatus') return att.itemStatus ?? '';
    if (field === 'activeOnlineStore') return att.activeOnlineStore ?? false;

    return '';
  }, [edits]);

  const setVal = useCallback((row: number, field: string, value: any) => {
    // The "Additional Sub-Category" cell is a comma-separated string in the grid, but the
    // committed field is an array (`additionalSubCategories`). Map singular → array here so
    // the edit isn't silently dropped by the server-side whitelist.
    if (field === 'additionalSubCategory') {
      const arr = typeof value === 'string'
        ? value.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
        : [];
      setEdit(row, 'additionalSubCategories', arr);
      return;
    }
    setEdits((prev) => {
      const next = { ...prev };
      const rowEdits = { ...(next[row] ?? {}) };
      if (value === undefined || value === '') {
        delete rowEdits[field as keyof EditRow];
      } else {
        rowEdits[field as keyof EditRow] = value;
      }
      if (Object.keys(rowEdits).length === 0) delete next[row];
      else next[row] = rowEdits;
      return next;
    });
  }, [setEdit]);
  const handleClose = () => {
    if (!committing && !parsing) { reset(); onClose(); }
  };

  const acceptFile = (f: File | null) => {
    if (!f) return;
    if (!/\.(xlsx|csv)$/i.test(f.name)) { toast.error('Please upload a .xlsx or .csv file'); return; }
    setFile(f);
  };

  const handlePreview = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', 'preview');
      if (config.vendors && vendorId) fd.append('vendorId', vendorId);

      const res = await fetch(config.importEndpoint, { method: 'POST', body: fd });
      const json = await res.json();

      if (json.success && json.data) {
        setPreview(json.data);
        setSkipRows(new Set());
        setReviewIdx(0);
        setStep('review');
      } else {
        setPreview({
          totalRows: 0, creates: 0, updates: 0, skips: 0,
          errors: [{ row: 0, message: json.error?.message || 'Failed to parse file' }],
          items: [],
        });
        setStep('review');
      }
    } catch {
      setPreview({ totalRows: 0, creates: 0, updates: 0, skips: 0, errors: [{ row: 0, message: 'Network error' }], items: [] });
      setStep('review');
    } finally {
      setParsing(false);
    }
  };

  const handleCommit = async (force = false) => {
    if (!file || !preview) return;
    setCommitting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', 'commit');
      if (config.vendors && vendorId) fd.append('vendorId', vendorId);
      if (skipRows.size > 0) fd.append('skipRows', JSON.stringify([...skipRows]));
      if (Object.keys(edits).length > 0) fd.append('edits', JSON.stringify(edits));
      if (force) fd.append('force', 'true');

      const res = await fetch(config.importEndpoint, { method: 'POST', body: fd });
      const json = await res.json();

      if (json.success && json.data) {
        const d = json.data;
        const created = d.created ?? 0;
        const updated = d.updated ?? 0;
        setResult({
          created,
          updated,
          imported: d.imported ?? (created + updated),
          blocked: d.blocked === true,
          errors: d.errors || [],
          errorReport: d.errorReport,
          backupId: d.backupId,
        });
        if (d.backup) setBackupData(JSON.stringify(d.backup));
        setStep('result');
        // Only treat as a finished import when the server didn't block the commit.
        if (d.blocked !== true) onComplete();
      } else {
        setResult({ created: 0, updated: 0, imported: 0, blocked: false, errors: [{ row: 0, message: json.error?.message || 'Commit failed' }], backupId: '' });
        setStep('result');
      }
    } catch {
      setResult({ created: 0, updated: 0, imported: 0, blocked: false, errors: [{ row: 0, message: 'Network error' }], backupId: '' });
      setStep('result');
    } finally {
      setCommitting(false);
    }
  };

  const handleUndo = async () => {
    if (!backupData) return;
    setUndoing(true);
    try {
      const backup = JSON.parse(backupData);
      for (const p of backup) {
        await fetch(`${config.productPatchBase}/${p.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: p.name, sku: p.sku, hsn: p.hsn, brand: p.brand, unit: p.unit,
            basePrice: p.basePrice, taxPercent: p.taxPercent, promoPrice: p.promoPrice,
          }),
        });
      }
      setUndone(true);
      onComplete();
    } catch {
      /* best effort */
    } finally {
      setUndoing(false);
    }
  };

  const downloadBackup = () => {
    if (!backupData) return;
    const blob = new Blob([backupData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadErrorReport = () => {
    if (!result?.errorReport) return;
    const blob = new Blob([result.errorReport], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_errors_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTemplate = () => window.open(config.templateUrl, '_blank');

  const toggleSkip = (row: number) => {
    setSkipRows(prev => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row); else next.add(row);
      return next;
    });
  };

  const activeItems = preview?.items.filter(i => !skipRows.has(i.row)) ?? [];
  const currentItem = activeItems[reviewIdx];
  const missingSubCategoryRows = preview?.items
    .filter((i) => !!i.parentCategory && !i.subCategory)
    .map((i) => i.row) ?? [];

  if (!open) return null;

  return (
    <>
      {/* Full-tab panel — fills the whole viewport so the review grid has all
          the space it needs (replaces the old cramped centered popup). */}
      <div className="fixed inset-0 z-[61] bg-white flex flex-col animate-in fade-in duration-150">

          {/* Header */}
          <div className={cn("flex items-center justify-between border-b border-[#EEEEEE] shrink-0", step === 'review' && viewMode === 'list' ? "px-6 py-3" : "px-8 py-5")}>
            <div className="flex items-center gap-4">
              {step === 'review' && (
                <button onClick={() => setStep('upload')} className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center hover:bg-[#F8F9FB] text-[#7C7C7C] transition-all">
                  <ChevronLeft size={18} />
                </button>
              )}
              <div>
                <h2 className="text-[20px] font-[900] text-[#181725]">
                  {step === 'upload' && 'Import Products'}
                  {step === 'review' && 'Review Import'}
                  {step === 'result' && 'Import Complete'}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  {['upload', 'review', 'result'].map((s, i) => (
                    <React.Fragment key={s}>
                      <div className={cn(
                        'w-[8px] h-[8px] rounded-full transition-colors',
                        step === s ? 'bg-[#299E60]' : i < ['upload', 'review', 'result'].indexOf(step) ? 'bg-[#299E60]/40' : 'bg-[#DCDCDC]',
                      )} />
                      {i < 2 && <div className="w-[16px] h-[2px] bg-[#EEEEEE]" />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={handleClose} className="w-[40px] h-[40px] rounded-[12px] flex items-center justify-center hover:bg-[#F8F9FB] text-[#7C7C7C] hover:text-[#181725] transition-all">
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className={cn("flex-1 min-h-0 bg-[#F8F9FB] flex flex-col", step === 'review' && viewMode === 'list' ? "overflow-hidden p-4" : "overflow-y-auto p-8")}>

            {/* Step 1: Upload */}
            {step === 'upload' && (
              <div className="max-w-[620px] mx-auto space-y-6 py-6">
                {config.vendors && (
                  <div className="bg-white rounded-[16px] border border-[#EEEEEE] shadow-sm p-6 space-y-3">
                    <h3 className="text-[16px] font-bold text-[#181725] flex items-center gap-2"><Store size={16} /> Import for vendor</h3>
                    <p className="text-[13px] text-[#7C7C7C] font-medium">Choose whose catalog these products belong to. Leave blank for a catalog-level import (no stock/slabs).</p>
                    <select value={vendorId} onChange={e => setVendorId(e.target.value)} className={selectCls}>
                      <option value="">— Catalog level (no vendor) —</option>
                      {config.vendors.map(v => <option key={v.id} value={v.id}>{v.businessName}</option>)}
                    </select>
                  </div>
                )}

                <div className="bg-white rounded-[16px] border border-[#EEEEEE] shadow-sm p-6 space-y-4">
                  <h3 className="text-[16px] font-bold text-[#181725]">1. Download template</h3>
                  <p className="text-[13px] text-[#7C7C7C] font-medium leading-relaxed">
                    Download the Excel template to prepare your catalog sheet. Fill in fields like Product Name, SKU, Category, and base prices.
                  </p>
                  <button onClick={downloadTemplate} className="h-[44px] px-6 bg-white border border-[#EEEEEE] hover:bg-[#F8F9FB] rounded-[10px] text-[13px] font-bold text-[#181725] flex items-center gap-2 transition-all">
                    <Download size={15} /> Download template.xlsx
                  </button>
                </div>

                <div className="bg-white rounded-[16px] border border-[#EEEEEE] shadow-sm p-6 space-y-4">
                  <h3 className="text-[16px] font-bold text-[#181725]">2. Upload file</h3>
                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={e => { e.preventDefault(); setIsDragOver(false); acceptFile(e.dataTransfer.files[0]); }}
                    onClick={() => fileRef.current?.click()}
                    className={cn(
                      'border-2 border-dashed rounded-[12px] p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[220px]',
                      isDragOver ? 'border-[#299E60] bg-[#EEF8F1]/40' : 'border-[#EEEEEE] hover:border-[#299E60]/50 hover:bg-[#EEF8F1]/10',
                    )}
                  >
                    <Upload size={32} className="text-[#AEAEAE] mb-3" />
                    {file ? (
                      <div>
                        <p className="text-[14px] font-bold text-[#181725]">{file.name}</p>
                        <p className="text-[12px] text-[#AEAEAE] mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-[14px] font-bold text-[#181725]">Drop Excel/CSV here or click to browse</p>
                        <p className="text-[11px] text-[#AEAEAE] mt-1">Accepts .xlsx or .csv files</p>
                      </div>
                    )}
                    <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.csv" onChange={e => e.target.files?.[0] && acceptFile(e.target.files[0])} />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button onClick={handleClose} className="h-[44px] px-6 text-[13px] font-bold text-[#7C7C7C] hover:text-[#181725] transition-colors">Cancel</button>
                  <button onClick={handlePreview} disabled={!file || parsing} className="h-[44px] px-8 bg-[#299E60] hover:bg-[#238a54] disabled:bg-[#DCDCDC] text-white rounded-[12px] text-[13px] font-bold flex items-center justify-center gap-2 shadow-sm disabled:cursor-not-allowed">
                    {parsing ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                    {parsing ? 'Parsing file...' : 'Next'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Review */}
            {step === 'review' && preview && (
              <div className="flex flex-col flex-1 min-h-0 space-y-2.5">
                {/* Status Bar */}
                <div className="flex items-center justify-between py-2 px-4 bg-white border border-[#EEEEEE] rounded-[10px] shadow-sm flex-wrap gap-3">
                  <div className="flex items-center gap-6">
                    <p className="text-[13px] text-[#7C7C7C] font-semibold">Total: <strong className="text-[#181725]">{preview.totalRows}</strong></p>
                    <p className="text-[13px] text-emerald-600 font-semibold">Create: <strong>{preview.creates}</strong></p>
                    <p className="text-[13px] text-blue-600 font-semibold">Update: <strong>{preview.updates}</strong></p>
                    {skipRows.size > 0 && <p className="text-[13px] text-amber-600 font-semibold">Skip: <strong>{skipRows.size}</strong></p>}
                  </div>
                  <button onClick={() => setViewMode(v => v === 'list' ? 'detail' : 'list')} className="h-[36px] px-4 rounded-[8px] bg-[#F8F9FB] border border-[#EEEEEE] text-[12px] font-bold hover:bg-[#EEEEEE] transition-all flex items-center gap-1.5 text-[#181725]">
                    <Eye size={13} /> {viewMode === 'list' ? 'Focused detail review' : 'Spreadsheet view'}
                  </button>
                </div>

                {/* Errors strip */}
                {preview.errors.length > 0 && (
                  <div className="py-2 px-4 bg-[#FFF0F0] border border-[#E74C3C]/20 rounded-[10px] text-[13px] font-semibold text-[#E74C3C] space-y-1">
                    <p className="flex items-center gap-2"><AlertTriangle size={15} /> Rows with errors are skipped automatically:</p>
                    <ul className="list-disc pl-5 font-normal text-[#181725] text-[12.5px] max-h-[100px] overflow-y-auto space-y-0.5">
                      {preview.errors.map((err, i) => (<li key={i}>Row {err.row}{err.field ? ` · ${err.field}` : ''}: {err.message}</li>))}
                    </ul>
                  </div>
                )}
                {missingSubCategoryRows.length > 0 && (
                  <div className="py-2 px-4 bg-amber-50 border border-amber-200 rounded-[10px] text-[12.5px] text-amber-800">
                    <p className="font-semibold">
                      Parent category was provided without a sub-category in row{missingSubCategoryRows.length > 1 ? 's' : ''} {missingSubCategoryRows.join(', ')}.
                    </p>
                    <p className="mt-1">Pick a valid sub-category before commit; parent-only mappings are blocked.</p>
                  </div>
                )}

                {/* Spreadsheet (list) view — dense Excel-style grid */}
                {viewMode === 'list' && (
                  <div className="flex-1 bg-white rounded-[10px] border border-[#E2E2E2] overflow-hidden flex flex-col min-h-0 shadow-sm">
                    <div className="flex-1 min-h-0 overflow-auto">
                      <table className="text-left border-collapse text-[11.5px] text-[#181725] min-w-[5000px] [&_td]:border-r [&_td]:border-[#EFEFEF] [&_th]:border-r [&_th]:border-[#E2E2E2]">
                        <thead className="sticky top-0 z-30">
                          <tr className="bg-[#F3F4F6] text-[10px] font-bold text-[#6B7280] uppercase tracking-wide">
                            <th className="px-2 py-1.5 w-[44px] text-center sticky left-0 bg-[#F3F4F6] z-40 border-r border-[#E2E2E2]">#</th>
                            <th className="px-2 py-1.5 w-[280px] sticky left-[44px] bg-[#F3F4F6] z-40 border-r border-[#E2E2E2]">Product Name</th>
                            {COLUMNS.slice(1).map((col) => (
                              <th key={col.key} className={cn("px-2.5 py-1.5 border-b border-[#E2E2E2] font-bold text-center", col.width, col.bg || '')}>
                                {col.label}
                              </th>
                            ))}
                            <th className="px-2 py-1.5 w-[48px] text-center sticky right-0 bg-[#F3F4F6] z-40 border-r-0">Skip</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.items.map((item) => {
                            const skipped = skipRows.has(item.row);
                            const rowEdit = edits[item.row] ?? {};
                            const hasLocalEdits = Object.keys(rowEdit).length > 0;
                            // Slab tiers (gross rate/unit) from edit or parsed file.
                            const slabSrc = rowEdit.slabs ?? (item.bulkSlabs ?? []).map(s => ({ minQty: s.minQty, grossRate: s.grossRate, promoGrossRate: s.promoGrossRate }));
                            const s1q = slabSrc[0]?.minQty ?? ''; const s1r = slabSrc[0]?.grossRate ?? ''; const s1p = slabSrc[0]?.promoGrossRate ?? '';
                            const s2q = slabSrc[1]?.minQty ?? ''; const s2r = slabSrc[1]?.grossRate ?? ''; const s2p = slabSrc[1]?.promoGrossRate ?? '';
                            const rowBg = skipped
                              ? 'bg-[#FAFAFA]'
                              : hasLocalEdits ? 'bg-amber-50/50'
                              : item.action === 'create' ? 'bg-emerald-50/25'
                              : 'bg-white';
                            return (
                              <tr key={item.row} className={cn(rowBg, skipped && 'opacity-40', 'border-b border-[#EFEFEF] hover:bg-[#299E60]/[0.04]')}>
                                <td className={cn('px-2 py-1 text-center font-semibold text-[#9CA3AF] sticky left-0 z-20 border-r border-[#EFEFEF]', rowBg)}>{item.row}</td>
                                <td className={cn('px-1 py-0.5 sticky left-[44px] z-20 border-r border-[#EFEFEF]', rowBg)}>
                                  <input type="text" value={getVal(item, 'name')} onChange={e => setVal(item.row, 'name', e.target.value)} className={cellInput} />
                                </td>
                                {COLUMNS.slice(1).map((col) => {
                                  if (col.type === 'custom') {
                                    if (col.key === 'action') {
                                      return (
                                        <td key={col.key} className="px-2 py-1 text-center">
                                          <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide',
                                            item.action === 'create' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-700')}>
                                            {item.action === 'create' ? 'New' : 'Upd'}
                                          </span>
                                        </td>
                                      );
                                    }
                                    if (col.key === 'image') {
                                      return (
                                        <td key={col.key} className="px-1 py-0.5">
                                          <div className="flex items-center gap-1.5 px-0.5">
                                            <div
                                              onClick={() => {
                                                const url = getVal(item, 'imageUrl') || (getVal(item, 'imageName') ? `/uploads/${getVal(item, 'imageName')}` : '');
                                                if (url) window.open(url, '_blank');
                                              }}
                                              className="w-7 h-7 rounded border border-[#EEEEEE] overflow-hidden flex-shrink-0 cursor-pointer hover:opacity-85 flex items-center justify-center bg-gray-50"
                                              title="Click to view image"
                                            >
                                              {getVal(item, 'imageUrl') || getVal(item, 'imageName') ? (
                                                <img
                                                  src={getVal(item, 'imageUrl') || `/uploads/${getVal(item, 'imageName')}`}
                                                  alt=""
                                                  className="w-full h-full object-cover"
                                                  onError={(e) => {
                                                    (e.target as HTMLElement).style.display = 'none';
                                                  }}
                                                />
                                              ) : (
                                                <span className="text-[8px] text-gray-400">None</span>
                                              )}
                                            </div>
                                            <input
                                              type="text"
                                              value={getVal(item, 'imageName')}
                                              onChange={e => setVal(item.row, 'imageName', e.target.value)}
                                              placeholder="Image Name"
                                              className={cellInput}
                                            />
                                          </div>
                                        </td>
                                      );
                                    }
                                    if (col.key === 'grossPrice') {
                                      const price = getVal(item, 'basePrice') || 0;
                                      const tax = getVal(item, 'taxPercent') || 0;
                                      const gross = Math.round(price * (1 + tax / 100) * 100) / 100;
                                      return (
                                        <td key={col.key} className={cn("px-2 py-1 text-right font-bold text-[#181725] tabular-nums", col.bg)}>
                                          {inr(gross)}
                                        </td>
                                      );
                                    }
                                    if (col.key === 'slab1Qty') {
                                      return (
                                        <td key={col.key} className={cn("px-1 py-0.5", col.bg)}>
                                          <input type="number" value={s1q} placeholder="—" onChange={e => setSlab(item.row, item, 0, 'minQty', parseInt(e.target.value) || 0)} className={cn(cellInput, 'text-right')} />
                                        </td>
                                      );
                                    }
                                    if (col.key === 'slab1Rate') {
                                      return (
                                        <td key={col.key} className={cn("px-1 py-0.5", col.bg)}>
                                          <input type="number" step="0.01" value={s1r} placeholder="—" onChange={e => setSlab(item.row, item, 0, 'grossRate', parseFloat(e.target.value) || 0)} className={cn(cellInput, 'text-right')} />
                                        </td>
                                      );
                                    }
                                    if (col.key === 'slab1PromoRate') {
                                      return (
                                        <td key={col.key} className={cn("px-1 py-0.5", col.bg)}>
                                          <input type="number" step="0.01" value={s1p} placeholder="—" onChange={e => setSlab(item.row, item, 0, 'promoGrossRate', e.target.value === '' ? null : (parseFloat(e.target.value) || 0))} className={cn(cellInput, 'text-right')} />
                                        </td>
                                      );
                                    }
                                    if (col.key === 'slab2Qty') {
                                      return (
                                        <td key={col.key} className={cn("px-1 py-0.5", col.bg)}>
                                          <input type="number" value={s2q} placeholder="—" onChange={e => setSlab(item.row, item, 1, 'minQty', parseInt(e.target.value) || 0)} className={cn(cellInput, 'text-right')} />
                                        </td>
                                      );
                                    }
                                    if (col.key === 'slab2Rate') {
                                      return (
                                        <td key={col.key} className={cn("px-1 py-0.5", col.bg)}>
                                          <input type="number" step="0.01" value={s2r} placeholder="—" onChange={e => setSlab(item.row, item, 1, 'grossRate', parseFloat(e.target.value) || 0)} className={cn(cellInput, 'text-right')} />
                                        </td>
                                      );
                                    }
                                    if (col.key === 'slab2PromoRate') {
                                      return (
                                        <td key={col.key} className={cn("px-1 py-0.5", col.bg)}>
                                          <input type="number" step="0.01" value={s2p} placeholder="—" onChange={e => setSlab(item.row, item, 1, 'promoGrossRate', e.target.value === '' ? null : (parseFloat(e.target.value) || 0))} className={cn(cellInput, 'text-right')} />
                                        </td>
                                      );
                                    }
                                  }

                                  if (col.type === 'checkbox') {
                                    return (
                                      <td key={col.key} className={cn("p-0 text-center", col.width, col.bg || '')}>
                                        <div className="flex items-center justify-center w-full h-[32px]">
                                          <input
                                            type="checkbox"
                                            checked={getVal(item, col.key) === true || String(getVal(item, col.key)).toLowerCase() === 'true'}
                                            onChange={(e) => setVal(item.row, col.key, e.target.checked)}
                                            className="w-4 h-4 accent-[#299E60] cursor-pointer"
                                          />
                                        </div>
                                      </td>
                                    );
                                  }

                                  if (col.type === 'select') {
                                    const val = getVal(item, col.key);
                                    return (
                                      <td key={col.key} className={cn("px-1 py-0.5 focus-within:ring-1 focus-within:ring-[#299E60]", col.width, col.bg || '')}>
                                        <select
                                          value={val}
                                          onChange={e => setVal(item.row, col.key, e.target.value || undefined)}
                                          className={cn(cellInput, 'appearance-none', col.key === 'category' && !val && 'text-rose-400')}
                                        >
                                          <option value="">— Select —</option>
                                          {col.key === 'category' ? (
                                            categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)
                                          ) : (
                                            (col.options || []).map((opt: string) => <option key={opt} value={opt}>{opt || '—'}</option>)
                                          )}
                                        </select>
                                      </td>
                                    );
                                  }

                                  // Default inputs
                                  return (
                                    <td key={col.key} className={cn("p-0 focus-within:ring-1 focus-within:ring-[#299E60]", col.width, col.bg || '')}>
                                      <input
                                        type={col.type}
                                        value={getVal(item, col.key)}
                                        onChange={(e) => {
                                          const rawVal = e.target.value;
                                          const finalVal = col.type === 'number' ? (rawVal === '' ? undefined : (parseFloat(rawVal) || 0)) : rawVal;
                                          setVal(item.row, col.key, finalVal);
                                        }}
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
                                <td className={cn('px-1 py-1 text-center sticky right-0 z-20 border-r-0', rowBg)}>
                                  <button onClick={() => toggleSkip(item.row)} title={skipped ? 'Include row' : 'Skip row'} className={cn('w-[22px] h-[22px] rounded flex items-center justify-center transition-colors mx-auto',
                                    skipped ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-gray-100 text-[#9CA3AF] hover:bg-rose-50 hover:text-rose-600')}>
                                    <X size={12} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-2 border-t border-[#EEEEEE] bg-[#FAFAFA] text-[11px] text-[#9CA3AF] font-medium flex items-center gap-2">
                      <Info size={12} /> Scroll horizontally for all columns · # / Name / Skip stay pinned · Gross is computed from Taxable × Tax% · edited rows highlight amber · enter both Qty and Rate for a slab tier
                    </div>
                  </div>
                )}

                {/* Detail view */}
                {viewMode === 'detail' && currentItem && (
                  <div className="flex-1 bg-white rounded-[16px] border border-[#EEEEEE] shadow-sm p-8 flex flex-col md:flex-row gap-8 min-h-0 overflow-y-auto">
                    <div className="flex-1 space-y-6">
                      <div className="flex items-center justify-between border-b border-[#F5F5F5] pb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-[12px] font-extrabold bg-[#F8F9FB] border border-[#EEEEEE] text-[#7C7C7C] w-[34px] h-[34px] rounded-full flex items-center justify-center">{reviewIdx + 1}/{activeItems.length}</span>
                          <h4 className="text-[18px] font-black text-[#181725]">{currentItem.name}</h4>
                        </div>
                        <span className={cn('px-2.5 py-1 rounded text-[11px] font-extrabold uppercase tracking-wide',
                          currentItem.action === 'create' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800')}>
                          {currentItem.action === 'create' ? 'Create new item' : 'Update existing'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <FieldGroup label="Product Name">
                          <input type="text" value={edits[currentItem.row]?.name ?? currentItem.name} onChange={e => setEdit(currentItem.row, 'name', e.target.value)} className={inputCls} />
                        </FieldGroup>
                        <FieldGroup label="SKU">
                          <input type="text" value={edits[currentItem.row]?.sku ?? (currentItem.sku ?? '')} onChange={e => setEdit(currentItem.row, 'sku', e.target.value)} className={inputCls} />
                        </FieldGroup>
                        <FieldGroup label="HSN">
                          <input type="text" value={edits[currentItem.row]?.hsn ?? (currentItem.hsn ?? '')} onChange={e => setEdit(currentItem.row, 'hsn', e.target.value)} className={inputCls} />
                        </FieldGroup>
                        <FieldGroup label="Brand">
                          <input type="text" value={edits[currentItem.row]?.brand ?? (currentItem.brand ?? '')} onChange={e => setEdit(currentItem.row, 'brand', e.target.value)} className={inputCls} />
                        </FieldGroup>
                        <FieldGroup label="Unit">
                          <input type="text" value={edits[currentItem.row]?.unit ?? (currentItem.unit ?? '')} onChange={e => setEdit(currentItem.row, 'unit', e.target.value)} className={inputCls} />
                        </FieldGroup>
                        <FieldGroup label="Parent Category">
                          <input type="text" list="import-cat-list" placeholder="—"
                            value={edits[currentItem.row]?.parentCategory ?? (currentItem.parentCategory ?? '')}
                            onChange={e => setEdit(currentItem.row, 'parentCategory', e.target.value || undefined)} className={inputCls} />
                        </FieldGroup>
                        <FieldGroup label="Sub-Category">
                          <input type="text" list="import-cat-list" placeholder="—"
                            value={edits[currentItem.row]?.subCategory ?? (currentItem.subCategory ?? '')}
                            onChange={e => setEdit(currentItem.row, 'subCategory', e.target.value || undefined)} className={inputCls} />
                        </FieldGroup>
                        <FieldGroup label="Additional Sub-Category">
                          <input type="text" list="import-cat-list" placeholder="Comma-separated"
                            value={(edits[currentItem.row]?.additionalSubCategories ?? currentItem.additionalSubCategories ?? []).join(', ')}
                            onChange={e => setEdit(currentItem.row, 'additionalSubCategories', e.target.value.split(/[,;|]/).map(s => s.trim()).filter(Boolean))} className={inputCls} />
                        </FieldGroup>
                        <datalist id="import-cat-list">
                          {categories.map(c => <option key={c.id} value={c.name} />)}
                        </datalist>
                        <FieldGroup label="Stock">
                          <input type="number" value={edits[currentItem.row]?.stock ?? (currentItem.stock ?? 0)} onChange={e => setEdit(currentItem.row, 'stock', parseInt(e.target.value) || 0)} className={inputCls} />
                        </FieldGroup>
                        <FieldGroup label="Taxable Rate (₹)">
                          <input type="number" step="0.01" value={edits[currentItem.row]?.basePrice ?? currentItem.basePrice} onChange={e => setEdit(currentItem.row, 'basePrice', parseFloat(e.target.value) || 0)} className={inputCls} />
                        </FieldGroup>
                        <FieldGroup label="GST %">
                          <input type="number" value={edits[currentItem.row]?.taxPercent ?? currentItem.taxPercent} onChange={e => setEdit(currentItem.row, 'taxPercent', parseInt(e.target.value) || 0)} className={inputCls} />
                        </FieldGroup>
                        <FieldGroup label="Promo Rate (₹)">
                          <input type="number" step="0.01" placeholder="—"
                            value={edits[currentItem.row]?.promoPrice ?? (currentItem.promoPrice ?? '')}
                            onChange={e => setEdit(currentItem.row, 'promoPrice', e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0))} className={inputCls} />
                        </FieldGroup>
                        <FieldGroup label="Image URL">
                          <input type="text" value={edits[currentItem.row]?.imageUrl ?? (currentItem.imageUrl ?? '')} onChange={e => setEdit(currentItem.row, 'imageUrl', e.target.value)} placeholder="—" className={inputCls} />
                        </FieldGroup>
                        <FieldGroup label="Image Name">
                          <input type="text" value={edits[currentItem.row]?.imageName ?? (currentItem.imageName ?? '')} onChange={e => setEdit(currentItem.row, 'imageName', e.target.value)} placeholder="—" className={inputCls} />
                        </FieldGroup>
                      </div>

                      <div className="flex items-center gap-3 border-t border-[#F5F5F5] pt-6">
                        <button disabled={reviewIdx === 0} onClick={() => setReviewIdx(r => r - 1)} className="h-[40px] px-4 bg-[#F8F9FB] border border-[#EEEEEE] hover:bg-[#EEEEEE] disabled:opacity-40 rounded-[8px] text-[12px] font-bold text-[#181725] flex items-center gap-1.5"><ChevronLeft size={14} /> Prev</button>
                        <button disabled={reviewIdx === activeItems.length - 1} onClick={() => setReviewIdx(r => r + 1)} className="h-[40px] px-4 bg-[#F8F9FB] border border-[#EEEEEE] hover:bg-[#EEEEEE] disabled:opacity-40 rounded-[8px] text-[12px] font-bold text-[#181725] flex items-center gap-1.5 ml-auto">Next <ChevronRight size={14} /></button>
                      </div>
                    </div>

                    <div className="w-full md:w-[320px] bg-[#F8F9FB] rounded-[16px] border border-[#EEEEEE] p-6 space-y-6">
                      {(edits[currentItem.row]?.imageUrl ?? currentItem.imageUrl) && (
                        <div>
                          <h5 className="text-[12px] font-bold text-[#7C7C7C] uppercase tracking-wider mb-3">Product Image</h5>
                          <div className="bg-white border border-[#EEEEEE] rounded-[12px] overflow-hidden flex items-center justify-center p-2 shadow-sm">
                            <img src={edits[currentItem.row]?.imageUrl ?? currentItem.imageUrl ?? ''} alt="" className="max-h-[160px] object-contain rounded-[8px]" />
                          </div>
                        </div>
                      )}

                      <div>
                        <h5 className="text-[12px] font-bold text-[#7C7C7C] uppercase tracking-wider mb-3">Pricing slabs</h5>
                        {currentItem.bulkSlabs && currentItem.bulkSlabs.length > 0 ? (
                          <div className="space-y-2">
                            {currentItem.bulkSlabs.map((slab, index) => (
                              <div key={index} className="bg-white border border-[#EEEEEE] rounded-[10px] p-3 flex flex-col gap-1.5 text-[12.5px]">
                                <div className="flex justify-between items-center w-full">
                                  <span className="font-bold text-[#7C7C7C]">Qty ≥ {slab.minQty}</span>
                                  <span className="font-black text-[#181725]">{inr(slab.price)}</span>
                                </div>
                                {slab.promoPrice && (
                                  <div className="flex justify-between items-center w-full text-[11px] text-amber-600 font-semibold border-t border-[#F5F5F5] pt-1.5 mt-0.5">
                                    <span>Promo Qty ≥ {slab.minQty}</span>
                                    <span>{inr(slab.promoPrice)}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-[12px] text-[#AEAEAE] italic">No bulk pricing slabs defined.</p>}
                      </div>

                      {currentItem.existing && (
                        <div>
                          <h5 className="text-[12px] font-bold text-[#7C7C7C] uppercase tracking-wider mb-3">Catalog comparison</h5>
                          <div className="bg-blue-50/40 border border-blue-100 rounded-[10px] p-4 text-[12.5px] space-y-2.5">
                            <p className="font-bold text-blue-800">Current values:</p>
                            <div className="grid grid-cols-2 gap-2 text-[#7C7C7C]">
                              <span>Taxable rate:</span><span className="font-bold text-[#181725]">{inr(currentItem.existing.basePrice)}</span>
                              <span>Tax rate:</span><span className="font-bold text-[#181725]">{currentItem.existing.taxPercent}%</span>
                              <span>Stock:</span><span className="font-bold text-[#181725]">{currentItem.existing.stock}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 pt-3">
                  <button onClick={() => setStep('upload')} className="h-[44px] px-6 text-[13px] font-bold text-[#7C7C7C] hover:text-[#181725] transition-colors">Back</button>
                  <button onClick={() => handleCommit()} disabled={committing || activeItems.length === 0} className="h-[44px] px-8 bg-[#299E60] hover:bg-[#238a54] disabled:bg-[#DCDCDC] text-white rounded-[12px] text-[13px] font-bold flex items-center justify-center gap-2 shadow-sm disabled:cursor-not-allowed">
                    {committing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                    {committing ? 'Importing…' : `Import ${activeItems.length} product${activeItems.length === 1 ? '' : 's'}`}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Result */}
            {step === 'result' && result && (
              <div className="max-w-[560px] mx-auto py-8 text-center space-y-8 animate-in fade-in duration-300">
                <div className="flex flex-col items-center gap-3">
                  {result.blocked ? (
                    <>
                      <div className="w-[64px] h-[64px] rounded-full bg-[#FFF0F0] flex items-center justify-center text-[#E74C3C] border border-[#E74C3C]/10 shadow-sm">
                        <AlertTriangle size={30} strokeWidth={2.5} />
                      </div>
                      <h3 className="text-[22px] font-black text-[#181725]">Import blocked</h3>
                      <p className="text-[13px] text-[#7C7C7C] font-semibold">Nothing was saved. Fix the rows below, or commit the valid rows anyway.</p>
                    </>
                  ) : (
                    <>
                      <div className="w-[64px] h-[64px] rounded-full bg-[#EBFDF2] flex items-center justify-center text-[#299E60] border border-[#299E60]/10 shadow-sm">
                        <Check size={32} strokeWidth={3} />
                      </div>
                      <h3 className="text-[22px] font-black text-[#181725]">Import complete</h3>
                      <p className="text-[13px] text-[#7C7C7C] font-semibold">{result.imported} product{result.imported === 1 ? '' : 's'} synchronized.</p>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 bg-white border border-[#EEEEEE] rounded-[16px] p-6 shadow-sm">
                  <div className="text-center border-r border-[#EEEEEE]">
                    <p className="text-[32px] font-black text-[#299E60]">{result.created}</p>
                    <p className="text-[12px] font-bold text-[#AEAEAE] uppercase tracking-wider mt-1">Created new</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[32px] font-black text-[#3B82F6]">{result.updated}</p>
                    <p className="text-[12px] font-bold text-[#AEAEAE] uppercase tracking-wider mt-1">Updated existing</p>
                  </div>
                </div>

                {result.errors.length > 0 && (
                  <div className="bg-[#FFF0F0] border border-[#E74C3C]/20 rounded-[16px] p-5 text-left text-[13px] font-semibold text-[#E74C3C] space-y-3">
                    <p className="flex items-center gap-2"><AlertTriangle size={16} /> {result.blocked ? 'Strict mode blocked the import — the following rows have errors:' : 'Some rows failed:'}</p>
                    <ul className="list-disc pl-5 font-normal text-[#181725] text-[12.5px] max-h-[140px] overflow-y-auto space-y-1">
                      {result.errors.map((err, i) => (<li key={i}>Row {err.row}{err.field ? ` · ${err.field}` : ''}: {err.message}</li>))}
                    </ul>
                  </div>
                )}

                {result.errorReport && (
                  <button onClick={downloadErrorReport} className="h-[40px] mx-auto px-5 bg-white border border-[#E74C3C]/30 hover:bg-[#FFF0F0] text-[#E74C3C] rounded-[10px] text-[12px] font-bold flex items-center gap-1.5 transition-all">
                    <Download size={14} /> Download error report
                  </button>
                )}

                {result.blocked && (
                  <button onClick={() => handleCommit(true)} disabled={committing} className="h-[44px] w-full px-8 bg-[#299E60] hover:bg-[#238a54] disabled:bg-[#DCDCDC] text-white rounded-[12px] text-[13px] font-bold flex items-center justify-center gap-2 shadow-sm disabled:cursor-not-allowed">
                    {committing ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={3} />}
                    {committing ? 'Committing…' : 'Commit valid rows anyway'}
                  </button>
                )}

                {backupData && !undone && (
                  <div className="bg-white border border-[#EEEEEE] rounded-[16px] p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <p className="text-[13px] font-bold text-[#181725]">Undo this import?</p>
                        <p className="text-[11.5px] text-[#AEAEAE] font-medium mt-0.5">Restore the pre-import state for all updated items.</p>
                      </div>
                      <button onClick={handleUndo} disabled={undoing} className="h-[36px] px-4 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-800 rounded-[8px] text-[12px] font-bold flex items-center gap-1.5 transition-all">
                        {undoing ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Undo import
                      </button>
                    </div>
                  </div>
                )}

                {undone && (
                  <div className="p-4 bg-amber-50 border border-amber-200/40 text-amber-800 text-[13px] font-semibold rounded-[12px] shadow-sm flex items-center gap-2 justify-center">
                    <RotateCcw size={15} /> Pre-import product data restored.
                  </div>
                )}

                <div className="flex items-center justify-center gap-3 border-t border-[#EEEEEE] pt-6">
                  {backupData && (
                    <button onClick={downloadBackup} className="h-[44px] px-6 border border-[#EEEEEE] hover:bg-[#F8F9FB] rounded-[12px] text-[13px] font-bold text-[#181725] flex items-center gap-2 transition-all">
                      <Download size={14} /> Download backup.json
                    </button>
                  )}
                  <button onClick={handleClose} className="h-[44px] px-8 bg-[#181725] hover:bg-black text-white rounded-[12px] text-[13px] font-bold transition-all shadow-sm">Done</button>
                </div>
              </div>
            )}
          </div>
      </div>
    </>
  );
}

const selectCls = 'w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] font-medium outline-none focus:border-[#299E60]/40 focus:ring-2 focus:ring-[#299E60]/10 bg-[#FAFAFA] focus:bg-white transition-all';
const inputCls = selectCls;
const cellInput = 'bg-transparent border border-transparent hover:border-[#D1D5DB] focus:border-[#299E60] focus:bg-white focus:ring-1 focus:ring-[#299E60]/20 px-1.5 py-1 rounded-[4px] outline-none w-full text-[11.5px] tabular-nums';

function FieldGroup({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-2">{label}</label>
      {children}
    </div>
  );
}
