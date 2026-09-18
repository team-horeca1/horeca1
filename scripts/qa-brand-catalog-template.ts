import * as XLSX from 'xlsx';
import {
  generateBrandCatalogTemplate,
  parseBrandCatalogImport,
  brandImportProductFields,
  BRAND_TEMPLATE_HEADERS,
  exportBrandCatalogToXlsx,
} from '../src/modules/import-export/brand-excel.service';

const expectedExtras = [
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
  'Pack Size',
] as const;

for (const h of expectedExtras) {
  if (!(BRAND_TEMPLATE_HEADERS as readonly string[]).includes(h)) {
    throw new Error(`Missing template header: ${h}`);
  }
}

const buf = generateBrandCatalogTemplate();
const { rows, errors } = parseBrandCatalogImport(buf);
if (errors.length) throw new Error(`parse errors: ${JSON.stringify(errors)}`);
if (rows.length !== 1) throw new Error(`expected 1 sample row, got ${rows.length}`);

const fields = brandImportProductFields(rows[0]);
const checks: Array<[string, unknown]> = [
  ['description', fields.description],
  ['tags', fields.tags],
  ['aliasNames', fields.aliasNames],
  ['netWeight', fields.netWeight],
  ['netWeightUnit', fields.netWeightUnit],
  ['packageWeight', fields.packageWeight],
  ['weightUnit', fields.weightUnit],
  ['packageLength', fields.packageLength],
  ['packageWidth', fields.packageWidth],
  ['packageHeight', fields.packageHeight],
  ['dimensionUnit', fields.dimensionUnit],
  ['packSize', fields.packSize],
  ['unit', fields.unit],
];
for (const [k, v] of checks) {
  if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) {
    throw new Error(`sample missing ${k}`);
  }
}

const exportBuf = exportBrandCatalogToXlsx([
  {
    name: 'Test Milk 1L',
    sku: 'T-MILK-1L',
    packSize: '1 L',
    unit: 'Bottle',
    parentCategory: 'Dairy',
    subCategory: 'Milk',
    imageUrl: null,
    description: 'Full cream milk',
    tags: ['dairy', 'milk'],
    aliasNames: ['toned milk'],
    netWeight: 1,
    netWeightUnit: 'l',
    packageWeight: 1.1,
    weightUnit: 'kg',
    packageLength: 7,
    packageWidth: 7,
    packageHeight: 24,
    dimensionUnit: 'cm',
    hsn: '0401',
    barcode: null,
    ean: null,
    vegNonVeg: 'veg',
    storageType: 'refrigerated',
    shelfLifeDays: 7,
    countryOfOrigin: 'India',
    fssaiRef: 'FSSAI-1',
  },
]);
const round = parseBrandCatalogImport(exportBuf);
if (round.errors.length) throw new Error(`export roundtrip errors: ${JSON.stringify(round.errors)}`);
const r = round.rows[0];
if (!r || r.description !== 'Full cream milk') throw new Error('description roundtrip failed');
if (!r.tags?.includes('dairy') || !r.aliasNames?.includes('toned milk')) {
  throw new Error('tags/alias roundtrip failed');
}
if (r.netWeight !== 1 || r.packageLength !== 7 || r.dimensionUnit !== 'cm') {
  throw new Error('weight/dimension roundtrip failed');
}

const legacyWs = XLSX.utils.aoa_to_sheet([
  ['Item Name', 'SKU', 'Parent Category', 'Sub-Category', 'Usage unit', 'Unit Name', 'Alias Name'],
  ['Legacy Item', 'LEG-1', 'Dairy', 'Milk', '500 ml', 'Pouch', 'old alias'],
]);
const legacyWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(legacyWb, legacyWs, 'Brand Store');
const legacyBuf = Buffer.from(XLSX.write(legacyWb, { type: 'buffer', bookType: 'xlsx' }));
const legacy = parseBrandCatalogImport(legacyBuf);
if (legacy.rows[0]?.packSize !== '500 ml' || !legacy.rows[0]?.aliasNames?.includes('old alias')) {
  throw new Error(`legacy headers failed: ${JSON.stringify(legacy.rows[0])}`);
}

console.log('PASS brand catalog template + parse + export roundtrip + legacy aliases');
