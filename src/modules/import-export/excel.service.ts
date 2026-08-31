import * as XLSX from 'xlsx';
import { z } from 'zod';

// Product import supports two header families:
//   • Legacy 6to9 sheet (Product Name, Category, Taxable Rate, Bulk Rates …)
//   • Vendor_Item_Template / Zoho sheet (Item Name, Parent Category, Sub-Category,
//     Additional Sub-Category, Net Rate, Stock On Hand, Bulk Qty 1 …)

// ── Shared helpers ──

const INSTRUCTION_ROW_MARKERS = [
  'vendor provided',
  'choose one',
  'choose multiple',
  'system fetched',
  'system generated',
  'taxable rate; vendor provided',
  'to make the item active',
  'to make it visible online',
  'refer hyperpure',
  'non-editable field only',
  '% of gross sale',
];

/** Columns that must stay as exact strings (leading zeros, long IDs). */
const ID_COLUMN_KEYS = new Set([
  'Vendor ID',
  'Item ID',
  'SKU',
  'HSN',
  'HSN Code',
  'UPC',
  'EAN',
  'ISBN',
  'Reference ID',
]);

function stringifyIdValue(val: unknown): string | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') {
    if (Number.isFinite(val) && Math.abs(val) < 1e15) {
      return String(Math.trunc(val));
    }
    return val.toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 0 });
  }
  const str = String(val).trim();
  if (!str) return undefined;
  if (/^\d+\.?\d*e[+-]?\d+$/i.test(str)) {
    const n = Number(str);
    if (!isNaN(n)) {
      return n.toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 20 });
    }
  }
  return str;
}

export function normalizeVegNonVeg(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const s = String(raw).trim().toLowerCase();
  if (s === 'veg' || s === 'vegetarian') return 'veg';
  if (s === 'nonveg' || s === 'non-veg' || s === 'non veg') return 'nonveg';
  if (s === 'egg' || s === 'eggetarian') return 'egg';
  return undefined;
}

/** Resolve image URL from explicit URL or local upload filename. */
export function resolveImportImageUrl(imageUrl?: string, imageName?: string): string | undefined {
  const url = imageUrl?.trim();
  if (url) return url;
  const name = imageName?.trim();
  if (!name) return undefined;
  if (name.startsWith('http://') || name.startsWith('https://')) return name;
  return `/uploads/${name.replace(/^\/+/, '')}`;
}

function isInstructionRow(cleaned: Record<string, unknown>): boolean {
  const values = Object.values(cleaned)
    .map((v) => String(v ?? '').toLowerCase().trim())
    .filter(Boolean);
  if (values.length === 0) return true;

  const instructionHits = values.filter((v) =>
    INSTRUCTION_ROW_MARKERS.some((m) => v.includes(m)),
  );
  if (instructionHits.length >= 2) return true;

  const name = String(cleaned['Product Name'] ?? cleaned['Item Name'] ?? '').toLowerCase().trim();
  if (!name) return instructionHits.length >= 1;
  return INSTRUCTION_ROW_MARKERS.some((m) => name.includes(m));
}

function parseAdditionalSubCategories(raw: unknown): string[] {
  if (raw === undefined || raw === null || raw === '') return [];
  return String(raw)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function formatCategoryLabel(row: {
  parentCategory?: string;
  subCategory?: string;
  legacyCategory?: string;
  additionalSubCategories?: string[];
}): string | undefined {
  const parts: string[] = [];
  if (row.parentCategory && row.subCategory) {
    parts.push(`${row.parentCategory} > ${row.subCategory}`);
  } else if (row.subCategory) {
    parts.push(row.subCategory);
  } else if (row.legacyCategory) {
    parts.push(row.legacyCategory);
  } else if (row.parentCategory) {
    parts.push(row.parentCategory);
  }
  if (row.additionalSubCategories?.length) {
    parts.push(`+${row.additionalSubCategories.join(', ')}`);
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cleanRow(raw: Record<string, any>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  const numericKeys = [
    'Taxable Rate (Amt)',
    'Net Rate',
    'Tax %',
    'Gross Rate 1Pc (visible to the Customer)',
    'Bulk Rates 1 - Qty',
    'Bulk Rates 1 - Gross Rate / Unit',
    'Bulk Qty 1 - Quantity',
    'Bulk Qty 1 - Net Rate / Pc',
    'Bulk Rates 2 - Qty',
    'Bulk Rates 2 - Gross Rate / Unit',
    'Bulk Qty 2 - Quantity',
    'Bulk Qty 2 - Net Rate / Pc',
    'Bulk Rates 3 - Qty',
    'Bulk Rates 3 - Gross Rate / Unit',
    'Bulk Qty 3 - Quantity',
    'Bulk Qty 3 - Net Rate / Pc',
    '6pm to 9am Promo Rate - Single Unit',
    '6pm to 9am Bulk Rates 1 - Qty',
    '6pm to 9am Bulk Rates 1 - Unit',
    '6pm to 9am Bulk Rates 2 - Qty',
    '6pm to 9am Bulk Rates 2 - Gross Rate / Unit',
    '6pm to 9am Bulk Rates 3 - Qty',
    '6pm to 9am Bulk Rates 3 - Gross Rate / Unit',
    'Available Stock',
    'Stock On Hand',
    'MOQ',
    'sortOrder',
    'Platform Commission',
    'Reorder Point',
    'Opening Stock',
    'Package Weight',
    'Package Length',
    'Package Width',
    'Package Height',
  ];

  for (const [key, val] of Object.entries(raw)) {
    // Normalize the header to the canonical schema key: match case-insensitively
    // and resolve known aliases. Without this, a CSV that says "Image URL"
    // (the CSV export header) never reaches the schema's "product image url"
    // key, so the column is silently dropped on import.
    const trimmedKey = key.trim();
    const k = HEADER_MAP[trimmedKey.toLowerCase()] ?? trimmedKey;
    let v = typeof val === 'string' ? val.trim() : val;

    if (ID_COLUMN_KEYS.has(k)) {
      v = stringifyIdValue(v);
    } else if (k === 'Veg / Non-Veg') {
      v = normalizeVegNonVeg(v) ?? (typeof v === 'string' ? v.trim() : v);
    } else if (numericKeys.includes(k) && typeof v === 'string') {
      const stripped = v.replace(/[₹$,%]/g, '').trim();
      if (stripped === '') {
        v = undefined;
      } else {
        const num = Number(stripped);
        if (!isNaN(num)) {
          v = num;
        }
      }
    } else if (numericKeys.includes(k) && typeof v === 'number') {
      // keep numeric
    }

    cleaned[k] = v;
    if (cleaned[k] === '') cleaned[k] = undefined;
  }
  return cleaned;
}

// Gross = taxable * (1 + tax/100)
function toGross(taxable: number, taxPercent: number): number {
  return Math.round(taxable * (1 + taxPercent / 100) * 100) / 100;
}

// Taxable = gross / (1 + tax/100)
function toTaxable(gross: number, taxPercent: number): number {
  if (taxPercent <= 0) return gross;
  return Math.round((gross / (1 + taxPercent / 100)) * 100) / 100;
}

// ══════════════════════════════════════════════════════════════════════════════
// Product Import
// ══════════════════════════════════════════════════════════════════════════════

// Schema accepts legacy + Vendor_Item_Template (Zoho) column headers
const productImportRowSchema = z
  .object({
    'Item ID': z.coerce.string().optional(),
    'Vendor ID': z.coerce.string().optional(),
    'SKU': z.coerce.string().optional(),
    'Product Name': z.coerce.string().optional(),
    'Item Name': z.coerce.string().optional(),
    'HSN': z.coerce.string().optional(),
    'HSN Code': z.coerce.string().optional(),
    'Unit': z.coerce.string().optional(),
    'Usage unit': z.coerce.string().optional(),
    'Unit Name': z.coerce.string().optional(),
    'Brand': z.coerce.string().optional(),
    'Category': z.coerce.string().optional(),
    'Parent Category': z.coerce.string().optional(),
    'Sub-Category': z.coerce.string().optional(),
    'Additional Sub-Category': z.coerce.string().optional(),
    'Taxable Rate (Amt)': z.coerce.number().positive().optional(),
    'Net Rate': z.coerce.number().positive().optional(),
    'Tax %': z.coerce.number().min(0).max(100).optional(),
    'Gross Rate 1Pc (visible to the Customer)': z.coerce.number().optional(),
    'Bulk Rates 1 - Qty': z.coerce.number().int().min(1).optional(),
    'Bulk Rates 1 - Gross Rate / Unit': z.coerce.number().positive().optional(),
    'Bulk Qty 1 - Quantity': z.coerce.number().int().min(1).optional(),
    'Bulk Qty 1 - Net Rate / Pc': z.coerce.number().positive().optional(),
    'Bulk Rates 2 - Qty': z.coerce.number().int().min(1).optional(),
    'Bulk Rates 2 - Gross Rate / Unit': z.coerce.number().positive().optional(),
    'Bulk Qty 2 - Quantity': z.coerce.number().int().min(1).optional(),
    'Bulk Qty 2 - Net Rate / Pc': z.coerce.number().positive().optional(),
    'Bulk Rates 3 - Qty': z.coerce.number().int().min(1).optional(),
    'Bulk Rates 3 - Gross Rate / Unit': z.coerce.number().positive().optional(),
    'Bulk Qty 3 - Quantity': z.coerce.number().int().min(1).optional(),
    'Bulk Qty 3 - Net Rate / Pc': z.coerce.number().positive().optional(),
    '6pm to 9am Promo Rate - Single Unit': z.coerce.number().positive().optional(),
    '6pm to 9am Bulk Rates 1 - Qty': z.coerce.number().int().min(1).optional(),
    '6pm to 9am Bulk Rates 1 - Unit': z.coerce.number().positive().optional(),
    '6pm to 9am Bulk Rates 2 - Qty': z.coerce.number().int().min(1).optional(),
    '6pm to 9am Bulk Rates 2 - Gross Rate / Unit': z.coerce.number().positive().optional(),
    '6pm to 9am Bulk Rates 3 - Qty': z.coerce.number().int().min(1).optional(),
    '6pm to 9am Bulk Rates 3 - Gross Rate / Unit': z.coerce.number().positive().optional(),
    'Available Stock': z.coerce.number().optional(),
    'Stock On Hand': z.coerce.number().optional(),
    'Image URL': z.coerce.string().optional(),
    'Image Name': z.coerce.string().optional(),
    'Alias Name': z.coerce.string().optional(),
    'UPC': z.coerce.string().optional(),
    'Veg / Non-Veg': z.coerce.string().optional(),
    'Storage type': z.coerce.string().optional(),
    'MOQ': z.coerce.number().int().min(1).optional(),
    'Pack Size': z.coerce.string().optional(),
    'Description': z.coerce.string().optional(),
    'Item Description': z.coerce.string().optional(),
    'MRP': z.coerce.number().positive().optional(),
    'Gross Rate': z.coerce.number().positive().optional(),
    'Gross rate': z.coerce.number().positive().optional(),
    'Credit Eligible': z.coerce.string().optional().or(z.coerce.boolean()),
    'Shelf Life (days)': z.coerce.number().int().min(0).optional(),
    'Shelf Life': z.coerce.number().int().min(0).optional(),
    'Country of Origin': z.coerce.string().optional(),
    'Tags': z.coerce.string().optional(),
    // Zoho and other metadata fields
    'Account': z.coerce.string().optional(),
    'Account Code': z.coerce.string().optional(),
    'Taxable': z.coerce.string().optional().or(z.coerce.boolean()),
    'Exemption Reason': z.coerce.string().optional(),
    'Taxability Type': z.coerce.string().optional(),
    'Product Type': z.coerce.string().optional(),
    'Source': z.coerce.string().optional(),
    'Reference ID': z.coerce.string().optional(),
    'Last Sync': z.coerce.string().optional(),
    'Inventory Account': z.coerce.string().optional(),
    'Inventory Account Code': z.coerce.string().optional(),
    'Valuation Method': z.coerce.string().optional(),
    'Reorder Point': z.coerce.number().optional(),
    'Opening Stock': z.coerce.number().optional(),
    'Item Type': z.coerce.string().optional(),
    'Sellable': z.coerce.string().optional().or(z.coerce.boolean()),
    'Purchasable': z.coerce.string().optional().or(z.coerce.boolean()),
    'Track Inventory': z.coerce.string().optional().or(z.coerce.boolean()),
    'Package Weight': z.coerce.number().optional(),
    'Package Length': z.coerce.number().optional(),
    'Package Width': z.coerce.number().optional(),
    'Package Height': z.coerce.number().optional(),
    'Dimension Unit': z.coerce.string().optional(),
    'Weight Unit': z.coerce.string().optional(),
    'EAN': z.coerce.string().optional(),
    'ISBN': z.coerce.string().optional(),
    'Variant Mapping': z.coerce.string().optional(),
    'Platform Commission': z.coerce.number().optional(),
    'Item Status': z.coerce.string().optional(),
    'Active on Online Store': z.coerce.string().optional().or(z.coerce.boolean()),
  })
  .superRefine((data, ctx) => {
    const name = (data['Product Name'] || data['Item Name'] || '').trim();
    if (!name) {
      ctx.addIssue({
        code: 'custom',
        message: 'Product Name is required',
        path: ['Product Name'],
      });
    }
    const taxableRate = data['Taxable Rate (Amt)'] ?? data['Net Rate'];
    if (taxableRate === undefined || taxableRate <= 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Taxable Rate must be > 0',
        path: ['Taxable Rate (Amt)'],
      });
    }
  });

export type RawImportRow = z.infer<typeof productImportRowSchema>;

// Lowercased header → canonical schema key. Built from the schema's own keys
// (so any casing variant resolves) plus explicit aliases for headers that drift
// between the CSV export, the XLSX export, and hand-edited sheets. This is what
// makes the importer resilient regardless of which export produced the file.
const HEADER_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const key of Object.keys(productImportRowSchema.shape)) {
    map[key.toLowerCase()] = key;
  }
  const aliases: Record<string, string> = {
    'item name': 'Item Name',
    'hsn code': 'HSN Code',
    'product image url': 'Image URL',
    'image url': 'Image URL',
    'image name': 'Image Name',
    'image_url': 'Image URL',
    'net rate': 'Net Rate',
    'taxable rate': 'Net Rate',
    'stock on hand': 'Stock On Hand',
    'usage unit': 'Usage unit',
    'unit name': 'Unit Name',
    'bulk qty 1 - quantity': 'Bulk Qty 1 - Quantity',
    'bulk qty 1 - net rate / pc': 'Bulk Qty 1 - Net Rate / Pc',
    'bulk qty 1 - taxable rate / pc': 'Bulk Qty 1 - Net Rate / Pc',
    'bulk qty 2 - quantity': 'Bulk Qty 2 - Quantity',
    'bulk qty 2 - net rate / pc': 'Bulk Qty 2 - Net Rate / Pc',
    'bulk qty 2 - taxable rate / pc': 'Bulk Qty 2 - Net Rate / Pc',
    'bulk qty 3 - quantity': 'Bulk Qty 3 - Quantity',
    'bulk qty 3 - net rate / pc': 'Bulk Qty 3 - Net Rate / Pc',
    'bulk qty 3 - taxable rate / pc': 'Bulk Qty 3 - Net Rate / Pc',
    'additional sub-category': 'Additional Sub-Category',
    'additional sub category': 'Additional Sub-Category',
    'sub-category': 'Sub-Category',
    'sub category': 'Sub-Category',
    'parent category': 'Parent Category',
    'gross rate 1pc': 'Gross Rate 1Pc (visible to the Customer)',
    'promo rate': '6pm to 9am Promo Rate - Single Unit',
    'veg / non-veg': 'Veg / Non-Veg',
    'storage type': 'Storage type',
  };
  for (const [alias, canonical] of Object.entries(aliases)) {
    map[alias] = canonical;
  }
  return map;
})();

// Normalized row after parsing — flat fields + bulk slabs + hierarchical categories
export interface ParsedProductRow {
  sku?: string;
  name: string;
  hsn?: string;
  unit?: string;
  brand?: string;
  /** Primary category label for preview UI (Parent > Sub, legacy Category, etc.) */
  category?: string;
  /** Flat Category column from legacy import sheets */
  legacyCategory?: string;
  parentCategory?: string;
  subCategory?: string;
  additionalSubCategories?: string[];
  basePrice: number; // taxable rate
  taxPercent: number;
  grossRate: number;
  promoPrice?: number; // taxable promo single unit
  promoStartTime?: string;
  promoEndTime?: string;
  stock?: number;
  imageUrl?: string;
  imageName?: string;
  aliasName?: string;
  upc?: string;
  vegNonVeg?: string;
  storageType?: string;
  moq?: number;
  packSize?: string;
  description?: string;
  originalPrice?: number;
  creditEligible?: boolean;
  isActive?: boolean;
  shelfLifeDays?: number;
  countryOfOrigin?: string;
  tags?: string[];
  bulkSlabs: {
    minQty: number;
    grossRate: number;
    taxableRate: number;
    promoGrossRate?: number;
    promoTaxableRate?: number;
  }[];
  metadata?: Record<string, any>;
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
}

export interface ProductImportResult {
  rows: ParsedProductRow[];
  errors: ImportError[];
}

export function parseProductImport(buffer: Buffer): ProductImportResult {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  // Prefer a Products sheet; skip the Categories reference sheet when present.
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase() === 'products') ||
    wb.SheetNames.find((n) => n.toLowerCase() !== 'categories') ||
    wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);

  const rows: ParsedProductRow[] = [];
  const errors: ImportError[] = [];

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 2; // +2 for header row + 0-index
    const cleaned = cleanRow(raw);

    if (isInstructionRow(cleaned)) return;

    const result = productImportRowSchema.safeParse(cleaned);

    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          row: rowNum,
          field: issue.path.join('.'),
          message: issue.message,
        });
      }
      return;
    }

    const r = result.data;
    const name = (r['Product Name'] || r['Item Name'] || '').trim();
    const taxPercent = r['Tax %'] ?? 0;
    const taxableRate = (r['Taxable Rate (Amt)'] ?? r['Net Rate'])!;
    const grossRate = r['Gross Rate 1Pc (visible to the Customer)'] ?? toGross(taxableRate, taxPercent);

    const parentCategory = r['Parent Category']?.trim() || undefined;
    const subCategory = r['Sub-Category']?.trim() || undefined;
    const legacyCategory = r['Category']?.trim() || undefined;
    const additionalSubCategories = parseAdditionalSubCategories(r['Additional Sub-Category']);

    // Parse promo single unit (gross) → convert to taxable
    let promoPrice: number | undefined;
    const promoGross = r['6pm to 9am Promo Rate - Single Unit'];
    if (promoGross && promoGross > 0) {
      promoPrice = toTaxable(promoGross, taxPercent);
    }

    // Parse bulk slabs (legacy gross columns + Zoho net-rate columns)
    const bulkSlabs: ParsedProductRow['bulkSlabs'] = [];

    const s1Qty = r['Bulk Rates 1 - Qty'] ?? r['Bulk Qty 1 - Quantity'];
    const s1Gross = r['Bulk Rates 1 - Gross Rate / Unit'];
    const s1Net = r['Bulk Qty 1 - Net Rate / Pc'];
    if (s1Qty && (s1Gross || s1Net)) {
      const slab1: ParsedProductRow['bulkSlabs'][0] = s1Gross
        ? {
            minQty: s1Qty,
            grossRate: s1Gross,
            taxableRate: toTaxable(s1Gross, taxPercent),
          }
        : {
            minQty: s1Qty,
            taxableRate: s1Net!,
            grossRate: toGross(s1Net!, taxPercent),
          };
      const ps1Qty = r['6pm to 9am Bulk Rates 1 - Qty'];
      const ps1Gross = r['6pm to 9am Bulk Rates 1 - Unit'];
      if (ps1Qty && ps1Gross && ps1Qty === s1Qty) {
        slab1.promoGrossRate = ps1Gross;
        slab1.promoTaxableRate = toTaxable(ps1Gross, taxPercent);
      }
      bulkSlabs.push(slab1);
    }

    const s2Qty = r['Bulk Rates 2 - Qty'] ?? r['Bulk Qty 2 - Quantity'];
    const s2Gross = r['Bulk Rates 2 - Gross Rate / Unit'];
    const s2Net = r['Bulk Qty 2 - Net Rate / Pc'];
    if (s2Qty && (s2Gross || s2Net)) {
      const slab2: ParsedProductRow['bulkSlabs'][0] = s2Gross
        ? {
            minQty: s2Qty,
            grossRate: s2Gross,
            taxableRate: toTaxable(s2Gross, taxPercent),
          }
        : {
            minQty: s2Qty,
            taxableRate: s2Net!,
            grossRate: toGross(s2Net!, taxPercent),
          };
      const ps2Qty = r['6pm to 9am Bulk Rates 2 - Qty'];
      const ps2Gross = r['6pm to 9am Bulk Rates 2 - Gross Rate / Unit'];
      if (ps2Qty && ps2Gross && ps2Qty === s2Qty) {
        slab2.promoGrossRate = ps2Gross;
        slab2.promoTaxableRate = toTaxable(ps2Gross, taxPercent);
      }
      bulkSlabs.push(slab2);
    }

    const s3Qty = r['Bulk Rates 3 - Qty'] ?? r['Bulk Qty 3 - Quantity'];
    const s3Gross = r['Bulk Rates 3 - Gross Rate / Unit'];
    const s3Net = r['Bulk Qty 3 - Net Rate / Pc'];
    if (s3Qty && (s3Gross || s3Net)) {
      const slab3: ParsedProductRow['bulkSlabs'][0] = s3Gross
        ? {
            minQty: s3Qty,
            grossRate: s3Gross,
            taxableRate: toTaxable(s3Gross, taxPercent),
          }
        : {
            minQty: s3Qty,
            taxableRate: s3Net!,
            grossRate: toGross(s3Net!, taxPercent),
          };
      const ps3Qty = r['6pm to 9am Bulk Rates 3 - Qty'];
      const ps3Gross = r['6pm to 9am Bulk Rates 3 - Gross Rate / Unit'];
      if (ps3Qty && ps3Gross && ps3Qty === s3Qty) {
        slab3.promoGrossRate = ps3Gross;
        slab3.promoTaxableRate = toTaxable(ps3Gross, taxPercent);
      }
      bulkSlabs.push(slab3);
    }

    if (bulkSlabs.length > 3) {
      bulkSlabs.length = 3;
    }

    const parsedRow: ParsedProductRow = {
      sku: r['SKU'],
      name,
      hsn: r['HSN'] || r['HSN Code'],
      unit: r['Unit'] || r['Usage unit'] || r['Unit Name'],
      brand: r['Brand'],
      parentCategory,
      subCategory,
      additionalSubCategories: additionalSubCategories.length > 0 ? additionalSubCategories : undefined,
      legacyCategory,
      basePrice: taxableRate,
      taxPercent,
      grossRate,
      promoPrice,
      promoStartTime: promoPrice ? '18:00' : undefined,
      promoEndTime: promoPrice ? '09:00' : undefined,
      stock: (() => {
        const raw = r['Available Stock'] ?? r['Stock On Hand'];
        if (raw === undefined) return undefined;
        return Math.max(0, Math.trunc(raw));
      })(),
      imageUrl: resolveImportImageUrl(r['Image URL'], r['Image Name']),
      imageName: r['Image Name'],
      aliasName: r['Alias Name'],
      upc: r['UPC'],
      vegNonVeg: normalizeVegNonVeg(r['Veg / Non-Veg']),
      storageType: r['Storage type'],
      moq: r['MOQ'],
      packSize: r['Pack Size'] || r['Usage unit'] || undefined,
      description: r['Description'] || r['Item Description'] || undefined,
      originalPrice: (() => {
        const mrp = r['MRP'] ?? r['Gross Rate'] ?? r['Gross rate'];
        if (mrp == null) return undefined;
        const n = Number(mrp);
        return Number.isFinite(n) && n > 0 ? n : undefined;
      })(),
      creditEligible: true,
      isActive: (() => {
        const v = String(r['Item Status'] ?? r['Active on Online Store'] ?? '').toLowerCase();
        if (!v) return undefined;
        return v === 'active' || v === 'yes' || v === 'true';
      })(),
      shelfLifeDays: r['Shelf Life (days)'] ?? r['Shelf Life'] ?? undefined,
      countryOfOrigin: r['Country of Origin'] || undefined,
      tags: r['Tags'] ? String(r['Tags']).split(/[,;]/).map((t) => t.trim()).filter(Boolean) : undefined,
      bulkSlabs,
      metadata: {
        itemId: r['Item ID'],
        vendorId: r['Vendor ID'],
        accounting: {
          account: r['Account'],
          accountCode: r['Account Code'],
          taxable: r['Taxable'],
          exemptionReason: r['Exemption Reason'],
          taxabilityType: r['Taxability Type'],
          inventoryAccount: r['Inventory Account'],
          inventoryAccountCode: r['Inventory Account Code'],
          platformCommission: r['Platform Commission'],
        },
        inventories: {
          reorderPoint: r['Reorder Point'],
          openingStock: r['Opening Stock'],
          valuationMethod: r['Valuation Method'],
          trackInventory: r['Track Inventory'],
        },
        packaging: {
          packageWeight: r['Package Weight'],
          packageLength: r['Package Length'],
          packageWidth: r['Package Width'],
          packageHeight: r['Package Height'],
          dimensionUnit: r['Dimension Unit'],
          weightUnit: r['Weight Unit'],
        },
        identifiers: {
          ean: r['EAN'],
          isbn: r['ISBN'],
        },
        attributes: {
          itemType: r['Item Type'],
          productType: r['Product Type'],
          source: r['Source'],
          referenceId: r['Reference ID'],
          lastSync: r['Last Sync'],
          sellable: r['Sellable'],
          purchasable: r['Purchasable'],
          itemStatus: r['Item Status'],
          activeOnlineStore: r['Active on Online Store'],
        }
      }
    };
    parsedRow.category = formatCategoryLabel(parsedRow) ?? legacyCategory;
    rows.push(parsedRow);
  });

  return { rows, errors };
}

// ══════════════════════════════════════════════════════════════════════════════
// Product Export
// ══════════════════════════════════════════════════════════════════════════════

export interface ProductExportRow {
  name: string;
  sku?: string | null;
  vendorSku?: string | null;
  hsn?: string | null;
  unit?: string | null;
  brand?: string | null;
  categoryName?: string | null;
  parentCategory?: string | null;
  subCategory?: string | null;
  additionalSubCategories?: string[];
  basePrice: number; // taxable rate
  taxPercent: number;
  promoPrice?: number | null; // taxable promo single unit
  imageUrl?: string | null;
  imageName?: string | null;
  description?: string | null;
  stock?: number;
  approvalStatus?: string;
  barcode?: string | null;
  aliasName?: string | null;
  minOrderQty?: number | null;
  vegNonVeg?: string | null;
  storageType?: string | null;
  vendorId?: string | null;
  itemId?: string | null;
  // Price slabs (up to 2)
  priceSlabs?: {
    minQty: number;
    price: number; // taxable rate
    promoPrice?: number | null; // taxable promo rate
  }[];
  metadata?: Record<string, unknown>;
}

/** Canonical import/export column order (Vendor_Item_Template aligned). */
export function getImportTemplateHeaders(): string[] {
  return [
    'Vendor ID',
    'Item ID',
    ...Object.keys(productImportRowSchema.shape).filter((k) => k !== 'product image url'),
  ];
}

/** Clean catalog export headers — no duplicate Net/Taxable/Bulk Rates/Stock/Unit columns. */
export function getProductExportHeaders(): string[] {
  return [
    'Vendor ID',
    'Item ID',
    'Item Name',
    'SKU',
    'HSN Code',
    'Brand',
    'Parent Category',
    'Sub-Category',
    'Additional Sub-Category',
    'Item Status',
    'Active on Online Store',
    'Taxable Rate',
    'Tax %',
    'Gross Rate 1Pc (visible to the Customer)',
    'Bulk Qty 1 - Quantity',
    'Bulk Qty 1 - Taxable Rate / Pc',
    'Bulk Qty 2 - Quantity',
    'Bulk Qty 2 - Taxable Rate / Pc',
    'Bulk Qty 3 - Quantity',
    'Bulk Qty 3 - Taxable Rate / Pc',
    'MOQ',
    'Stock On Hand',
    'Image URL',
    'Usage unit',
    'Alias Name',
    'UPC',
    'EAN',
    'Veg / Non-Veg',
    'Storage type',
    'Account',
    'Account Code',
    'Taxable',
    'Exemption Reason',
    'Taxability Type',
    'Product Type',
    'Platform Commission',
    'Inventory Account',
    'Inventory Account Code',
    'Reorder Point',
    'Opening Stock',
    'Package Weight',
    'Package Length',
    'Package Width',
    'Package Height',
    'Dimension Unit',
    'Weight Unit',
    'Description',
  ];
}

const TEMPLATE_INSTRUCTIONS: Record<string, string> = {
  'Vendor ID': 'System Fetched',
  'Item ID': 'System Generated',
  'Item Name': 'Vendor Provided',
  'Product Name': 'Vendor Provided',
  'SKU': 'Vendor Provided',
  'HSN Code': 'Vendor Provided',
  'HSN': 'Vendor Provided',
  'Brand': 'Vendor Provided',
  'Parent Category': 'Choose One',
  'Sub-Category': 'Choose One',
  'Additional Sub-Category': 'Choose multiple',
  'Category': 'Choose One',
  'Item Status': 'to make the item active / inactive',
  'Active on Online Store': 'to make it visible online',
  'Net Rate': 'Taxable rate; vendor provided',
  'Taxable Rate': 'Taxable rate; vendor provided',
  'Taxable Rate (Amt)': 'Taxable rate; vendor provided',
  'Account Code': 'System generated',
  'Platform Commission': 'non-editable field only; Admin assigns from admin panel',
  'Image URL': 'Full URL or leave blank if using Image Name',
  'Image Name': 'Filename under /uploads',
  'Alias Name': 'for search',
  'UPC': 'barcode',
  'EAN': 'barcode',
  'Bulk Qty 1 - Quantity': 'Refer Hyperpure',
  'Bulk Qty 1 - Net Rate / Pc': 'Refer Hyperpure',
  'Bulk Qty 1 - Taxable Rate / Pc': 'Refer Hyperpure',
  'Veg / Non-Veg': 'veg, nonveg, or egg',
  'Storage type': 'Ambient / Chilled / Frozen',
};

function exportCell(v: unknown): string | number {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

function mapProductToImportColumns(p: ProductExportRow): Record<string, string | number> {
  const tax = p.taxPercent || 0;
  const slab1 = p.priceSlabs?.[0];
  const slab2 = p.priceSlabs?.[1];
  const slab3 = p.priceSlabs?.[2];
  const meta = (p.metadata && typeof p.metadata === 'object' ? p.metadata : {}) as Record<string, unknown>;
  const acc = (meta.accounting || {}) as Record<string, unknown>;
  const inv = (meta.inventory || {}) as Record<string, unknown>;
  const pkg = (meta.packaging || {}) as Record<string, unknown>;
  const ids = (meta.identifiers || {}) as Record<string, unknown>;
  const att = (meta.attributes || {}) as Record<string, unknown>;

  return {
    'Vendor ID': p.vendorId || String(meta.vendorId || ''),
    'Item ID': p.itemId || String(meta.itemId || ''),
    'Item Name': p.name,
    'SKU': p.vendorSku || p.sku || '',
    'HSN Code': p.hsn || '',
    'Brand': p.brand || '',
    'Parent Category': p.parentCategory || '',
    'Sub-Category': p.subCategory || '',
    'Additional Sub-Category': p.additionalSubCategories?.join(', ') || '',
    'Category': p.categoryName || '',
    'Net Rate': Number(p.basePrice),
    'Taxable Rate': Number(p.basePrice),
    'Tax %': tax,
    'Gross Rate 1Pc (visible to the Customer)': toGross(Number(p.basePrice), tax),
    'Bulk Qty 1 - Quantity': slab1?.minQty ?? '',
    'Bulk Qty 1 - Net Rate / Pc': slab1 ? Number(slab1.price) : '',
    'Bulk Qty 1 - Taxable Rate / Pc': slab1 ? Number(slab1.price) : '',
    'Bulk Qty 2 - Quantity': slab2?.minQty ?? '',
    'Bulk Qty 2 - Net Rate / Pc': slab2 ? Number(slab2.price) : '',
    'Bulk Qty 2 - Taxable Rate / Pc': slab2 ? Number(slab2.price) : '',
    'Bulk Qty 3 - Quantity': slab3?.minQty ?? '',
    'Bulk Qty 3 - Net Rate / Pc': slab3 ? Number(slab3.price) : '',
    'Bulk Qty 3 - Taxable Rate / Pc': slab3 ? Number(slab3.price) : '',
    '6pm to 9am Promo Rate - Single Unit': p.promoPrice ? toGross(Number(p.promoPrice), tax) : '',
    'Stock On Hand': p.stock ?? 0,
    'MOQ': p.minOrderQty ?? 1,
    'Image URL': p.imageUrl || '',
    'Image Name': p.imageName || '',
    'Alias Name': p.aliasName || '',
    'UPC': p.barcode || '',
    'Veg / Non-Veg': p.vegNonVeg || '',
    'Storage type': p.storageType || '',
    'Account': String(acc.account || ''),
    'Account Code': String(acc.accountCode || ''),
    'Taxable': exportCell(acc.taxable),
    'Exemption Reason': String(acc.exemptionReason || ''),
    'Taxability Type': String(acc.taxabilityType || ''),
    'Product Type': String(att.productType || ''),
    'Source': String(att.source || ''),
    'Reference ID': String(att.referenceId || ''),
    'Last Sync': String(att.lastSync || ''),
    'Inventory Account': String(acc.inventoryAccount || ''),
    'Inventory Account Code': String(acc.inventoryAccountCode || ''),
    'Valuation Method': String(inv.valuationMethod || ''),
    'Reorder Point': exportCell(inv.reorderPoint),
    'Opening Stock': exportCell(inv.openingStock),
    'Item Type': String(att.itemType || ''),
    'Sellable': exportCell(att.sellable),
    'Purchasable': exportCell(att.purchasable),
    'Track Inventory': exportCell(inv.trackInventory),
    'Package Weight': exportCell(pkg.packageWeight),
    'Package Length': exportCell(pkg.packageLength),
    'Package Width': exportCell(pkg.packageWidth),
    'Package Height': exportCell(pkg.packageHeight),
    'Dimension Unit': String(pkg.dimensionUnit || ''),
    'Weight Unit': String(pkg.weightUnit || ''),
    'EAN': String(ids.ean || ''),
    'ISBN': String(ids.isbn || ''),
    'Platform Commission': exportCell(acc.platformCommission),
    'Item Status': String(att.itemStatus || ''),
    'Active on Online Store': exportCell(att.activeOnlineStore),
    'Usage unit': p.unit || '',
    Description: p.description || '',
  };
}

function applyTextFormatToIdColumns(ws: XLSX.WorkSheet, headers: string[]): void {
  const idHeaders = new Set(['Vendor ID', 'Item ID', 'SKU', 'HSN', 'HSN Code', 'UPC', 'EAN', 'ISBN']);
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const headerCell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    const header = headerCell?.v ? String(headerCell.v) : '';
    if (!idHeaders.has(header)) continue;
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell) cell.z = '@';
    }
  }
}

export function exportProductsToXlsx(
  products: ProductExportRow[],
  categories?: CategoryExportRow[],
): Buffer {
  const wb = XLSX.utils.book_new();
  const headers = getProductExportHeaders();

  const productData = products.map((p) => {
    const row = mapProductToImportColumns(p);
    const ordered: Record<string, string | number> = {};
    for (const h of headers) ordered[h] = row[h] ?? '';
    return ordered;
  });

  const pws = XLSX.utils.json_to_sheet(
    productData.length > 0 ? productData : [Object.fromEntries(headers.map((h) => [h, '']))],
    { header: headers },
  );
  pws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 16) }));
  applyTextFormatToIdColumns(pws, headers);
  XLSX.utils.book_append_sheet(wb, pws, 'Products');

  // ── Categories sheet (if provided) ──
  if (categories && categories.length > 0) {
    const catData = categories.map(c => ({
      'Name': c.name,
      'Slug': c.slug,
      'Parent': c.parentName || '',
      'Image URL': c.imageUrl || '',
      'Sort Order': c.sortOrder,
      'Active': c.isActive ? 'Yes' : 'No',
      'Status': c.approvalStatus,
      'Products': c.productCount ?? 0,
    }));
    const cws = XLSX.utils.json_to_sheet(catData);
    cws['!cols'] = Object.keys(catData[0] || {}).map(h => ({ wch: Math.max(h.length + 2, 12) }));
    XLSX.utils.book_append_sheet(wb, cws, 'Categories');
  }

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export function exportProductsToCsv(products: ProductExportRow[]): string {
  const headers = getProductExportHeaders();
  const data = products.map((p) => {
    const row = mapProductToImportColumns(p);
    const ordered: Record<string, string | number> = {};
    for (const h of headers) ordered[h] = row[h] ?? '';
    return ordered;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [Object.fromEntries(headers.map((h) => [h, '']))], { header: headers });
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  return XLSX.utils.sheet_to_csv(ws);
}

// Generate a template XLSX aligned with Vendor_Item_Template.xlsx (Zoho-style)
export function generateImportTemplate(): Buffer {
  const wb = XLSX.utils.book_new();
  const headers = getImportTemplateHeaders();

  const sampleValues: Record<string, string | number> = {
    'Item Name': 'Sample Product 1 Kg',
    'SKU': 'Z0001',
    'HSN Code': '04061000',
    'Brand': 'BrandName',
    'Parent Category': 'Dairy',
    'Sub-Category': 'Milk',
    'Net Rate': 100,
    'Tax %': 5,
    'Usage unit': 'Pc',
    'Stock On Hand': 500,
    'MOQ': 1,
    'Bulk Qty 1 - Quantity': 10,
    'Bulk Qty 1 - Net Rate / Pc': 95,
    'Veg / Non-Veg': 'veg',
    'Storage type': 'Ambient',
  };

  const instructionRow: Record<string, string> = {};
  const sampleRow: Record<string, string | number> = {};
  for (const h of headers) {
    instructionRow[h] = TEMPLATE_INSTRUCTIONS[h] ?? '';
    sampleRow[h] = sampleValues[h] ?? '';
  }

  const pws = XLSX.utils.json_to_sheet([instructionRow, sampleRow], { header: headers });
  pws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 16) }));
  applyTextFormatToIdColumns(pws, headers);
  XLSX.utils.book_append_sheet(wb, pws, 'Products');

  // Categories reference — Parent / Sub-Category pairs for the hierarchy picker
  const catRows = [
    { 'Parent Category': 'Dairy', 'Sub-Category': 'Milk' },
    { 'Parent Category': 'Dairy', 'Sub-Category': 'Cheese' },
    { 'Parent Category': 'Bakery & Desserts', 'Sub-Category': 'Flour & Atta' },
  ];
  const cws = XLSX.utils.json_to_sheet(catRows);
  cws['!cols'] = [
    { wch: 24 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, cws, 'Categories');

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

const PRICE_UPDATE_HEADERS = [
  'Product Name',
  'SKU',
  'MOQ',
  'Main Price',
  'Tax %',
  'Gross',
  'Bulk Qty 1',
  'Taxable Rate 1',
  'Gross 1',
  'Bulk Qty 2',
  'Taxable Rate 2',
  'Gross 2',
  'Bulk Qty 3',
  'Taxable Rate 3',
  'Gross 3',
] as const;

export type PriceExportProduct = {
  name: string;
  sku: string;
  moq: number;
  basePrice: number;
  taxPercent: number;
  slabs: Array<{ minQty: number; price: number }>;
};

/** Live price sheet for Price Bulk Update — all current products, editable then re-upload. */
export function exportPriceUpdateSheet(products: PriceExportProduct[]): Buffer {
  const wb = XLSX.utils.book_new();
  const data =
    products.length > 0
      ? products.map((p) => {
          const tax = p.taxPercent || 0;
          const s1 = p.slabs[0];
          const s2 = p.slabs[1];
          const s3 = p.slabs[2];
          return {
            'Product Name': p.name,
            SKU: p.sku,
            MOQ: p.moq,
            'Main Price': p.basePrice,
            'Tax %': tax,
            // Placeholder — overwritten with formulas below so Gross tracks Main Price × tax
            Gross: toGross(p.basePrice, tax),
            'Bulk Qty 1': s1?.minQty ?? '',
            'Taxable Rate 1': s1 ? Number(s1.price) : '',
            'Gross 1': s1 ? toGross(Number(s1.price), tax) : '',
            'Bulk Qty 2': s2?.minQty ?? '',
            'Taxable Rate 2': s2 ? Number(s2.price) : '',
            'Gross 2': s2 ? toGross(Number(s2.price), tax) : '',
            'Bulk Qty 3': s3?.minQty ?? '',
            'Taxable Rate 3': s3 ? Number(s3.price) : '',
            'Gross 3': s3 ? toGross(Number(s3.price), tax) : '',
          };
        })
      : [Object.fromEntries(PRICE_UPDATE_HEADERS.map((h) => [h, '']))];

  const ws = XLSX.utils.json_to_sheet(data, { header: [...PRICE_UPDATE_HEADERS] });
  ws['!cols'] = PRICE_UPDATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));

  // Columns: A Name, B SKU, C MOQ, D Main Price, E Tax %, F Gross,
  // G Bulk Qty 1, H Taxable Rate 1, I Gross 1, J/K/L tier2, M/N/O tier3
  const rowCount = products.length > 0 ? products.length : 0;
  for (let i = 0; i < rowCount; i++) {
    const r = i + 2; // header is row 1
    ws[`F${r}`] = { t: 'n', f: `D${r}*(1+E${r}/100)` };
    const p = products[i]!;
    if (p.slabs[0]) ws[`I${r}`] = { t: 'n', f: `H${r}*(1+$E${r}/100)` };
    if (p.slabs[1]) ws[`L${r}`] = { t: 'n', f: `K${r}*(1+$E${r}/100)` };
    if (p.slabs[2]) ws[`O${r}`] = { t: 'n', f: `N${r}*(1+$E${r}/100)` };
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Prices');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

/** Empty sample template (tests / docs). Prefer exportPriceUpdateSheet for vendors. */
export function generatePriceUpdateTemplate(): Buffer {
  return exportPriceUpdateSheet([
    {
      name: 'Sample Product',
      sku: 'H1-SEED-0001',
      moq: 1,
      basePrice: 100,
      taxPercent: 5,
      slabs: [
        { minQty: 10, price: 95 },
        { minQty: 50, price: 90 },
      ],
    },
  ]);
}

export type PriceUpdateRow = {
  row: number;
  sku: string;
  moq?: number;
  basePrice: number;
  taxPercent: number;
  slabs: Array<{ minQty: number; price: number }>;
};

export function parsePriceUpdate(buffer: Buffer): {
  rows: PriceUpdateRow[];
  errors: ImportError[];
} {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase() === 'prices') ||
    wb.SheetNames.find((n) => n.toLowerCase() !== 'categories') ||
    wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);
  const rows: PriceUpdateRow[] = [];
  const errors: ImportError[] = [];

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 2;
    const cleaned = cleanRow(raw);
    const sku = String(cleaned['SKU'] ?? cleaned['sku'] ?? '').trim();
    const mainRaw = cleaned['Main Price'] ?? cleaned['main price'] ?? cleaned['Net Rate'] ?? cleaned['net rate'];
    if (!sku && mainRaw == null) {
      return;
    }
    if (
      /catalog/i.test(sku) ||
      /required/i.test(sku) ||
      /leave blank/i.test(sku) ||
      /instruction/i.test(sku)
    ) {
      return;
    }

    if (!sku) {
      errors.push({ row: rowNum, field: 'SKU', message: 'SKU is required' });
      return;
    }

    const net = Number(mainRaw);
    if (!Number.isFinite(net) || net <= 0) {
      errors.push({ row: rowNum, field: 'Main Price', message: 'must be a positive number' });
      return;
    }

    const taxRaw = cleaned['Tax %'] ?? cleaned['Tax%'] ?? cleaned['tax %'] ?? cleaned['taxPercent'];
    const taxPercent = Number(taxRaw);
    if (!Number.isFinite(taxPercent) || taxPercent < 0) {
      errors.push({ row: rowNum, field: 'Tax %', message: 'must be a number ≥ 0' });
      return;
    }

    let moq: number | undefined;
    const moqRaw = cleaned['MOQ'] ?? cleaned['moq'] ?? cleaned['Min Order Qty'];
    if (moqRaw !== undefined && moqRaw !== null && String(moqRaw).trim() !== '') {
      const m = Number(moqRaw);
      if (!Number.isFinite(m) || m < 1) {
        errors.push({ row: rowNum, field: 'MOQ', message: 'must be an integer ≥ 1' });
        return;
      }
      moq = Math.floor(m);
    }

    const slabs: Array<{ minQty: number; price: number }> = [];
    for (let i = 1; i <= 3; i++) {
      const qty = Number(
        cleaned[`Bulk Qty ${i}`] ??
          cleaned[`Bulk Qty ${i} - Quantity`] ??
          cleaned[`bulk qty ${i}`],
      );
      const price = Number(
        cleaned[`Taxable Rate ${i}`] ??
          cleaned[`Bulk Qty ${i} - Net Rate / Pc`] ??
          cleaned[`taxable rate ${i}`],
      );
      if (Number.isFinite(qty) && qty >= 1 && Number.isFinite(price) && price > 0) {
        slabs.push({ minQty: Math.floor(qty), price });
      }
    }
    if (slabs.length > 3) slabs.length = 3;

    rows.push({
      row: rowNum,
      sku,
      moq,
      basePrice: net,
      taxPercent,
      slabs,
    });
  });

  return { rows, errors };
}

// ══════════════════════════════════════════════════════════════════════════════
// Category Import/Export (unchanged column format)
// ══════════════════════════════════════════════════════════════════════════════

const categoryImportRowSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  parentSlug: z.string().optional(),
  imageUrl: z.string().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export type CategoryImportRow = z.infer<typeof categoryImportRowSchema>;

interface CategoryImportResult {
  rows: CategoryImportRow[];
  errors: ImportError[];
}

export function parseCategoryImport(buffer: Buffer): CategoryImportResult {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'categories') || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);

  const rows: CategoryImportRow[] = [];
  const errors: ImportError[] = [];

  rawRows.forEach((raw, idx) => {
    const cleaned = cleanRow(raw);
    const result = categoryImportRowSchema.safeParse(cleaned);
    if (result.success) {
      rows.push(result.data);
    } else {
      for (const issue of result.error.issues) {
        errors.push({
          row: idx + 2,
          field: issue.path.join('.'),
          message: issue.message,
        });
      }
    }
  });

  return { rows, errors };
}

export interface CategoryExportRow {
  name: string;
  slug: string;
  parentName?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
  approvalStatus: string;
  productCount?: number;
}

export function exportCategoriesToXlsx(categories: CategoryExportRow[]): Buffer {
  const data = categories.map(c => ({
    Name: c.name,
    Slug: c.slug,
    Parent: c.parentName || '',
    'Image URL': c.imageUrl || '',
    'Sort Order': c.sortOrder,
    Active: c.isActive ? 'Yes' : 'No',
    Status: c.approvalStatus,
    Products: c.productCount ?? 0,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = Object.keys(data[0] || {}).map(key => ({ wch: Math.max(key.length + 2, 12) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Categories');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export function exportCategoriesToCsv(categories: CategoryExportRow[]): string {
  const data = categories.map(c => ({
    name: c.name,
    slug: c.slug,
    parentName: c.parentName || '',
    imageUrl: c.imageUrl || '',
    sortOrder: c.sortOrder,
    isActive: c.isActive ? 'Yes' : 'No',
    approvalStatus: c.approvalStatus,
    productCount: c.productCount ?? 0,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Categories');
  return XLSX.utils.sheet_to_csv(ws);
}

// ══════════════════════════════════════════════════════════════════════════════
// Customer Import
// ══════════════════════════════════════════════════════════════════════════════

const customerImportRowSchema = z.object({
  'Name': z.string().min(1, 'Name is required'),
  'Phone': z.coerce.string().min(5, 'Phone must be at least 5 characters'),
  'Email': z.string().email('Invalid email address').optional(),
  'Business Name': z.string().min(1, 'Business Name is required'),
  'Trade Name': z.string().optional(),
  'GSTIN': z.string().optional(),
  'PAN': z.string().optional(),
  'FSSAI': z.string().optional(),
  'Billing Address': z.string().optional(),
  'Billing City': z.string().optional(),
  'Billing State': z.string().optional(),
  'Billing Pincode': z.coerce.string().optional(),
  'Delivery Address': z.string().min(1, 'Delivery Address is required'),
  'Delivery Pincode': z.coerce.string().min(1, 'Delivery Pincode is required'),
  'Territory': z.string().optional(),
  'Sales Executive': z.string().optional(),
  'Tags': z.string().optional(),
  // P0-4: customer master-datasheet attributes.
  'Business Type': z.string().optional(),
  'Sub-Type': z.string().optional(),
  'Cuisine': z.string().optional(),
  'Business Size': z.string().optional(),
  'Business Structure': z.string().optional(),
  'Service Model': z.string().optional(),
  'Monthly Purchase Band': z.string().optional(),
  'Procurement Frequency': z.string().optional(),
  'Designation': z.string().optional(),
  'Lead Status': z.string().optional(),
  'Credit Type': z.string().optional(),
  'AI Tags': z.string().optional(),
  'Behaviour Tags': z.string().optional(),
});

export interface ParsedCustomerRow {
  name: string;
  phone: string;
  email?: string;
  businessName: string;
  tradeName?: string;
  gstin?: string;
  pan?: string;
  fssai?: string;
  billingAddress?: string;
  billingCity?: string;
  billingState?: string;
  billingPincode?: string;
  deliveryAddress: string;
  deliveryPincode: string;
  territory?: string;
  salesExecutive?: string;
  tags?: string[];
  businessType?: string;
  subType?: string;
  cuisine?: string;
  businessSize?: string;
  businessStructure?: string;
  serviceModel?: string;
  monthlyPurchaseBand?: string;
  procurementFrequency?: string;
  designation?: string;
  leadStatus?: string;
  creditType?: string;
  aiTags?: string[];
  behaviourTags?: string[];
}

export interface CustomerImportResult {
  rows: ParsedCustomerRow[];
  errors: ImportError[];
}

export function parseCustomerImport(buffer: Buffer): CustomerImportResult {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'customers') || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);

  const rows: ParsedCustomerRow[] = [];
  const errors: ImportError[] = [];

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 2;
    const cleaned = cleanRow(raw);
    const result = customerImportRowSchema.safeParse(cleaned);

    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          row: rowNum,
          field: issue.path.join('.'),
          message: issue.message,
        });
      }
      return;
    }

    const r = result.data;
    const splitTags = (v?: string): string[] =>
      v ? v.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0) : [];

    rows.push({
      name: r['Name'],
      phone: String(r['Phone']),
      email: r['Email'],
      businessName: r['Business Name'],
      tradeName: r['Trade Name'],
      gstin: r['GSTIN'],
      pan: r['PAN'],
      fssai: r['FSSAI'],
      billingAddress: r['Billing Address'],
      billingCity: r['Billing City'],
      billingState: r['Billing State'],
      billingPincode: r['Billing Pincode'] ? String(r['Billing Pincode']) : undefined,
      deliveryAddress: r['Delivery Address'],
      deliveryPincode: String(r['Delivery Pincode']),
      territory: r['Territory'],
      salesExecutive: r['Sales Executive'],
      tags: splitTags(r['Tags']),
      businessType: r['Business Type'],
      subType: r['Sub-Type'],
      cuisine: r['Cuisine'],
      businessSize: r['Business Size'],
      businessStructure: r['Business Structure'],
      serviceModel: r['Service Model'],
      monthlyPurchaseBand: r['Monthly Purchase Band'],
      procurementFrequency: r['Procurement Frequency'],
      designation: r['Designation'],
      leadStatus: r['Lead Status'],
      creditType: r['Credit Type'],
      aiTags: splitTags(r['AI Tags']),
      behaviourTags: splitTags(r['Behaviour Tags']),
    });
  });

  return { rows, errors };
}
