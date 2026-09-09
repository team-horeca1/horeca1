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
  aliasName?: string;
  hsn?: string;
  barcode?: string;
  ean?: string;
  vegNonVeg?: 'veg' | 'nonveg' | 'egg';
  storageType?: string;
  shelfLifeDays?: number;
  countryOfOrigin?: string;
  fssaiRef?: string;
}

const BRAND_TEMPLATE_HEADERS = [
  'Item Name',
  'SKU',
  'HSN Code',
  'Barcode',
  'EAN',
  'Parent Category',
  'Sub-Category',
  'Usage unit',
  'Unit Name',
  'Veg / Non-Veg',
  'Storage type',
  'Shelf Life Days',
  'Country of Origin',
  'FSSAI',
  'Image URL',
  'Alias Name',
] as const;

const INSTRUCTION_MARKERS = [
  'vendor provided', 'choose one', 'system fetched', 'system generated', 'for search',
  'veg, nonveg', 'ambient', 'url',
];

function isInstructionRow(name: string): boolean {
  const lower = name.toLowerCase();
  return INSTRUCTION_MARKERS.some((m) => lower.includes(m));
}

function cellStr(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return String(v).trim() || undefined;
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
    const name = cellStr(r['Item Name']);
    if (!name || isInstructionRow(name)) return;

    const shelfLife = parseShelfLifeDays(r['Shelf Life Days'] ?? r['Shelf Life']);
    if (shelfLife.error) {
      parsedErrors.push({ row: rowNum, message: shelfLife.error });
      return;
    }

    rows.push({
      row: rowNum,
      name,
      sku: cellStr(r['SKU']),
      hsn: cellStr(r['HSN Code'] ?? r['HSN']),
      barcode: cellStr(r['Barcode'] ?? r['UPC']),
      ean: cellStr(r['EAN']),
      parentCategory: cellStr(r['Parent Category']),
      subCategory: cellStr(r['Sub-Category'] ?? r['Sub Category']),
      packSize: cellStr(r['Usage unit'] ?? r['Pack Size']),
      unit: cellStr(r['Unit Name'] ?? r['Unit']),
      vegNonVeg: parseVegNonVeg(r['Veg / Non-Veg'] ?? r['Veg/Non-Veg']),
      storageType: parseStorageType(r['Storage type'] ?? r['Storage Type']),
      shelfLifeDays: shelfLife.value,
      countryOfOrigin: cellStr(r['Country of Origin']),
      fssaiRef: cellStr(r['FSSAI'] ?? r['FSSAI Ref']),
      imageUrl: cellStr(r['Image URL']),
      aliasName: cellStr(r['Alias Name']),
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
  hsn?: string;
  barcode?: string;
  ean?: string;
  vegNonVeg?: 'veg' | 'nonveg' | 'egg';
  storageType?: string;
  shelfLifeDays?: number;
  countryOfOrigin?: string;
  fssaiRef?: string;
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
    hsn: row.hsn,
    barcode: row.barcode,
    ean: row.ean,
    vegNonVeg: row.vegNonVeg,
    storageType: row.storageType,
    shelfLifeDays: row.shelfLifeDays,
    countryOfOrigin: row.countryOfOrigin,
    fssaiRef: row.fssaiRef,
    aliasNames: row.aliasName ? [row.aliasName] : undefined,
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
    hsn: fields.hsn,
    barcode: fields.barcode,
    ean: fields.ean,
    vegNonVeg: fields.vegNonVeg,
    storageType: fields.storageType,
    shelfLifeDays: fields.shelfLifeDays,
    countryOfOrigin: fields.countryOfOrigin,
    fssaiRef: fields.fssaiRef,
    aliasNames: fields.aliasNames,
  };
}

export function generateBrandCatalogTemplate(): Buffer {
  const headers = [...BRAND_TEMPLATE_HEADERS];
  const hint = [
    'Vendor Provided', 'Vendor Provided', 'Vendor Provided', 'Optional', 'Optional',
    'Choose One', 'Choose One', 'e.g. 1 ltr', 'e.g. Bottle',
    'veg, nonveg, or egg', 'ambient, refrigerated, frozen, dry, or cool', 'e.g. 365', 'India', 'Optional',
    'URL', 'for search',
  ];
  const example = [
    'Manama Khus Syrup 1 Ltr', 'MAN-KHUS-1L', '210690', '', '',
    'Beverages', 'Syrups', '1 ltr', 'Bottle',
    'veg', 'Ambient', '365', 'India', '',
    '', 'khus syrup',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, hint, example]);
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
  description: string | null;
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
    p.imageUrl ?? '',
    p.description ?? '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Brand Store');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
