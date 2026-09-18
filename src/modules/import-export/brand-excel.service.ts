import * as XLSX from 'xlsx';
import type { BrandMasterSubmitInput } from '@/modules/brand/brand.validator';

export interface BrandImportRow {
  row: number;
  name: string;
  sku?: string;
  packSize?: string;
  unit?: string;
  parentCategory?: string;
  subCategory?: string;
  imageUrl?: string;
  description?: string;
  aliasNames?: string[];
  tags?: string[];
  hsn?: string;
  barcode?: string;
  ean?: string;
  vegNonVeg?: 'veg' | 'nonveg' | 'egg';
  storageType?: string;
  shelfLifeDays?: number;
  countryOfOrigin?: string;
  fssaiRef?: string;
  netWeight?: number;
  netWeightUnit?: string;
  packageWeight?: number;
  weightUnit?: string;
  packageLength?: number;
  packageWidth?: number;
  packageHeight?: number;
  dimensionUnit?: string;
}

/** Headers aligned with BrandProductForm — keep order stable for round-trip export. */
export const BRAND_TEMPLATE_HEADERS = [
  'Item Name',
  'SKU',
  'HSN Code',
  'Barcode',
  'EAN',
  'Parent Category',
  'Sub-Category',
  'Pack Size',
  'Unit Name',
  'Veg / Non-Veg',
  'Storage type',
  'Shelf Life Days',
  'Country of Origin',
  'FSSAI',
  'Description',
  'Tags',
  'Alias Names',
  'Net Weight',
  'Net Weight Unit',
  'Package Weight',
  'Weight Unit',
  'Package Length',
  'Package Width',
  'Package Height',
  'Dimension Unit',
  'Image URL',
] as const;

const INSTRUCTION_MARKERS = [
  'vendor provided', 'choose one', 'system fetched', 'system generated', 'for search',
  'veg, nonveg', 'ambient', 'url', 'comma-separated', 'optional',
];

function isInstructionRow(name: string): boolean {
  const lower = name.toLowerCase();
  return INSTRUCTION_MARKERS.some((m) => lower.includes(m));
}

function cellStr(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return String(v).trim() || undefined;
}

function cellList(v: unknown): string[] | undefined {
  const s = cellStr(v);
  if (!s) return undefined;
  const parts = s.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function cellNumber(v: unknown): { value?: number; error?: string; label: string } {
  const label = 'number';
  const s = cellStr(v);
  if (!s) return { label };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) {
    return { error: 'must be a non-negative number', label };
  }
  return { value: n, label };
}

const STORAGE_ALIASES: Record<string, string> = {
  ambient: 'ambient',
  refrigerated: 'refrigerated',
  chilled: 'refrigerated',
  frozen: 'frozen',
  dry: 'dry',
  drystorage: 'dry',
  cool: 'cool',
  cooldark: 'cool',
};

function parseVegNonVeg(raw: unknown): 'veg' | 'nonveg' | 'egg' | undefined {
  const s = cellStr(raw)?.toLowerCase().replace(/[\s_-]+/g, '');
  if (!s) return undefined;
  if (s === 'veg' || s === 'vegetarian') return 'veg';
  if (s === 'nonveg' || s === 'nonvegetarian' || s === 'nveg') return 'nonveg';
  if (s === 'egg' || s === 'eggetarian') return 'egg';
  return undefined;
}

function parseStorageType(raw: unknown): string | undefined {
  const s = cellStr(raw);
  if (!s) return undefined;
  const key = s.toLowerCase().replace(/[\s/_-]+/g, '');
  return STORAGE_ALIASES[key] ?? s;
}

function parseShelfLifeDays(raw: unknown): { value?: number; error?: string } {
  const s = cellStr(raw);
  if (!s) return {};
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0 || n > 3650) {
    return { error: 'Shelf Life Days must be a whole number from 0 to 3650' };
  }
  return { value: n };
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function pickCell(r: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (r[key] !== undefined && r[key] !== null && r[key] !== '') return r[key];
  }
  const lowerMap = new Map(
    Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v]),
  );
  for (const key of keys) {
    const val = lowerMap.get(key.toLowerCase());
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return undefined;
}

export function parseBrandCatalogImport(buffer: Buffer): {
  rows: BrandImportRow[];
  errors: Array<{ row: number; message: string }>;
} {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames.includes('Brand Store') ? 'Brand Store' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const rows: BrandImportRow[] = [];
  const parsedErrors: Array<{ row: number; message: string }> = [];

  raw.forEach((r, idx) => {
    const rowNum = idx + 2;
    const name = cellStr(pickCell(r, 'Item Name', 'Product Name', 'Name'));
    if (!name || isInstructionRow(name)) return;

    const shelfLife = parseShelfLifeDays(
      pickCell(r, 'Shelf Life Days', 'Shelf Life (days)', 'Shelf Life'),
    );
    if (shelfLife.error) {
      parsedErrors.push({ row: rowNum, message: shelfLife.error });
      return;
    }

    const netWeight = cellNumber(pickCell(r, 'Net Weight'));
    if (netWeight.error) {
      parsedErrors.push({ row: rowNum, message: `Net Weight ${netWeight.error}` });
      return;
    }
    const packageWeight = cellNumber(pickCell(r, 'Package Weight'));
    if (packageWeight.error) {
      parsedErrors.push({ row: rowNum, message: `Package Weight ${packageWeight.error}` });
      return;
    }
    const packageLength = cellNumber(pickCell(r, 'Package Length'));
    if (packageLength.error) {
      parsedErrors.push({ row: rowNum, message: `Package Length ${packageLength.error}` });
      return;
    }
    const packageWidth = cellNumber(pickCell(r, 'Package Width'));
    if (packageWidth.error) {
      parsedErrors.push({ row: rowNum, message: `Package Width ${packageWidth.error}` });
      return;
    }
    const packageHeight = cellNumber(pickCell(r, 'Package Height'));
    if (packageHeight.error) {
      parsedErrors.push({ row: rowNum, message: `Package Height ${packageHeight.error}` });
      return;
    }

    rows.push({
      row: rowNum,
      name,
      sku: cellStr(pickCell(r, 'SKU')),
      hsn: cellStr(pickCell(r, 'HSN Code', 'HSN')),
      barcode: cellStr(pickCell(r, 'Barcode', 'UPC')),
      ean: cellStr(pickCell(r, 'EAN')),
      parentCategory: cellStr(pickCell(r, 'Parent Category')),
      subCategory: cellStr(pickCell(r, 'Sub-Category', 'Sub Category')),
      packSize: cellStr(pickCell(r, 'Pack Size', 'Usage unit')),
      unit: cellStr(pickCell(r, 'Unit Name', 'Unit')),
      vegNonVeg: parseVegNonVeg(pickCell(r, 'Veg / Non-Veg', 'Veg/Non-Veg')),
      storageType: parseStorageType(pickCell(r, 'Storage type', 'Storage Type')),
      shelfLifeDays: shelfLife.value,
      countryOfOrigin: cellStr(pickCell(r, 'Country of Origin')),
      fssaiRef: cellStr(pickCell(r, 'FSSAI', 'FSSAI Ref', 'FSSAI Reference')),
      description: cellStr(pickCell(r, 'Description', 'Item Description')),
      tags: cellList(pickCell(r, 'Tags')),
      aliasNames: cellList(pickCell(r, 'Alias Names', 'Alias Name')),
      netWeight: netWeight.value,
      netWeightUnit: cellStr(pickCell(r, 'Net Weight Unit')),
      packageWeight: packageWeight.value,
      weightUnit: cellStr(pickCell(r, 'Weight Unit')),
      packageLength: packageLength.value,
      packageWidth: packageWidth.value,
      packageHeight: packageHeight.value,
      dimensionUnit: cellStr(pickCell(r, 'Dimension Unit')),
      imageUrl: cellStr(pickCell(r, 'Image URL')),
    });
  });

  return { rows, errors: parsedErrors };
}

/** Fields shared by catalog update and pending master submit. */
export function brandImportProductFields(row: BrandImportRow): {
  name: string;
  sku?: string;
  packSize?: string;
  unit?: string;
  uom?: string;
  imageUrl?: string;
  description?: string;
  hsn?: string;
  barcode?: string;
  ean?: string;
  vegNonVeg?: 'veg' | 'nonveg' | 'egg';
  storageType?: string;
  shelfLifeDays?: number;
  countryOfOrigin?: string;
  fssaiRef?: string;
  netWeight?: number;
  netWeightUnit?: string;
  packageWeight?: number;
  weightUnit?: string;
  packageLength?: number;
  packageWidth?: number;
  packageHeight?: number;
  dimensionUnit?: string;
  tags?: string[];
  aliasNames?: string[];
} {
  const imageUrl = row.imageUrl && isHttpUrl(row.imageUrl) ? row.imageUrl : undefined;
  return {
    name: row.name,
    sku: row.sku,
    packSize: row.packSize,
    unit: row.unit,
    uom: row.unit,
    imageUrl,
    description: row.description,
    hsn: row.hsn,
    barcode: row.barcode,
    ean: row.ean,
    vegNonVeg: row.vegNonVeg,
    storageType: row.storageType,
    shelfLifeDays: row.shelfLifeDays,
    countryOfOrigin: row.countryOfOrigin,
    fssaiRef: row.fssaiRef,
    netWeight: row.netWeight,
    netWeightUnit: row.netWeightUnit,
    packageWeight: row.packageWeight,
    weightUnit: row.weightUnit,
    packageLength: row.packageLength,
    packageWidth: row.packageWidth,
    packageHeight: row.packageHeight,
    dimensionUnit: row.dimensionUnit,
    tags: row.tags,
    aliasNames: row.aliasNames,
  };
}

export function toPendingMasterSubmit(
  row: BrandImportRow,
  categoryId: string,
): BrandMasterSubmitInput {
  const fields = brandImportProductFields(row);
  return {
    name: fields.name,
    sku: fields.sku,
    categoryId,
    packSize: fields.packSize,
    uom: fields.uom,
    imageUrl: fields.imageUrl,
    description: fields.description,
    hsn: fields.hsn,
    barcode: fields.barcode,
    ean: fields.ean,
    vegNonVeg: fields.vegNonVeg,
    storageType: fields.storageType,
    shelfLifeDays: fields.shelfLifeDays,
    countryOfOrigin: fields.countryOfOrigin,
    fssaiRef: fields.fssaiRef,
    netWeight: fields.netWeight,
    netWeightUnit: fields.netWeightUnit,
    packageWeight: fields.packageWeight,
    weightUnit: fields.weightUnit,
    packageLength: fields.packageLength,
    packageWidth: fields.packageWidth,
    packageHeight: fields.packageHeight,
    dimensionUnit: fields.dimensionUnit,
    tags: fields.tags,
    aliasNames: fields.aliasNames,
  };
}

export function generateBrandCatalogTemplate(): Buffer {
  const headers = [...BRAND_TEMPLATE_HEADERS];
  const hintByHeader: Record<(typeof BRAND_TEMPLATE_HEADERS)[number], string> = {
    'Item Name': 'Vendor Provided',
    SKU: 'Vendor Provided',
    'HSN Code': 'Vendor Provided',
    Barcode: 'Optional',
    EAN: 'Optional',
    'Parent Category': 'Choose One',
    'Sub-Category': 'Choose One',
    'Pack Size': 'e.g. 1 ltr',
    'Unit Name': 'e.g. Bottle',
    'Veg / Non-Veg': 'veg, nonveg, or egg',
    'Storage type': 'ambient, refrigerated, frozen, dry, or cool',
    'Shelf Life Days': 'e.g. 365',
    'Country of Origin': 'India',
    FSSAI: 'Optional',
    Description: 'Optional product description',
    Tags: 'Comma-separated',
    'Alias Names': 'Comma-separated search aliases',
    'Net Weight': 'e.g. 1',
    'Net Weight Unit': 'kg / g / ml / l',
    'Package Weight': 'Optional shipping weight',
    'Weight Unit': 'kg / g',
    'Package Length': 'Optional',
    'Package Width': 'Optional',
    'Package Height': 'Optional',
    'Dimension Unit': 'cm / mm / in',
    'Image URL': 'https://…',
  };
  const exampleByHeader: Record<(typeof BRAND_TEMPLATE_HEADERS)[number], string | number> = {
    'Item Name': 'Manama Khus Syrup 1 Ltr',
    SKU: 'MAN-KHUS-1L',
    'HSN Code': '210690',
    Barcode: '',
    EAN: '',
    'Parent Category': 'Beverages',
    'Sub-Category': 'Syrups',
    'Pack Size': '1 ltr',
    'Unit Name': 'Bottle',
    'Veg / Non-Veg': 'veg',
    'Storage type': 'Ambient',
    'Shelf Life Days': 365,
    'Country of Origin': 'India',
    FSSAI: '',
    Description: 'Khus flavoured syrup for beverages',
    Tags: 'syrup, khus, beverage',
    'Alias Names': 'khus syrup, vetiver syrup',
    'Net Weight': 1,
    'Net Weight Unit': 'l',
    'Package Weight': 1.2,
    'Weight Unit': 'kg',
    'Package Length': 8,
    'Package Width': 8,
    'Package Height': 28,
    'Dimension Unit': 'cm',
    'Image URL': '',
  };
  const hint = headers.map((h) => hintByHeader[h]);
  const example = headers.map((h) => exampleByHeader[h]);
  const ws = XLSX.utils.aoa_to_sheet([headers, hint, example]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Brand Store');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export interface BrandExportRow {
  name: string;
  sku: string | null;
  hsn?: string | null;
  barcode?: string | null;
  ean?: string | null;
  packSize: string | null;
  unit: string | null;
  vegNonVeg?: string | null;
  storageType?: string | null;
  shelfLifeDays?: number | null;
  countryOfOrigin?: string | null;
  fssaiRef?: string | null;
  parentCategory: string;
  subCategory: string;
  imageUrl: string | null;
  description?: string | null;
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
}

function exportCell(v: unknown): string | number {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return v;
  return String(v);
}

export function exportBrandCatalogToXlsx(products: BrandExportRow[]): Buffer {
  const headers = [...BRAND_TEMPLATE_HEADERS];
  const data = products.map((p) => [
    p.name,
    p.sku ?? '',
    p.hsn ?? '',
    p.barcode ?? '',
    p.ean ?? '',
    p.parentCategory,
    p.subCategory,
    p.packSize ?? '',
    p.unit ?? '',
    p.vegNonVeg ?? '',
    p.storageType ?? '',
    p.shelfLifeDays ?? '',
    p.countryOfOrigin ?? '',
    p.fssaiRef ?? '',
    p.description ?? '',
    p.tags?.length ? p.tags.join(', ') : '',
    p.aliasNames?.length ? p.aliasNames.join(', ') : '',
    exportCell(p.netWeight),
    p.netWeightUnit ?? '',
    exportCell(p.packageWeight),
    p.weightUnit ?? '',
    exportCell(p.packageLength),
    exportCell(p.packageWidth),
    exportCell(p.packageHeight),
    p.dimensionUnit ?? '',
    p.imageUrl ?? '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Brand Store');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
