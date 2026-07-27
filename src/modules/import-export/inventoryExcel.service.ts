import * as XLSX from 'xlsx';

export interface InventoryExportRow {
  sku: string;
  productName: string;
  qtyAvailable: number;
  qtyInTransit: number;
  qtyDamaged: number;
  qtyReturned: number;
  lowStockThreshold: number;
  warehouse?: string;
  warehousePincode?: string | null;
  unit?: string | null;
}

const EXPORT_HEADERS = [
  'SKU',
  'Product Name',
  'Qty Available',
  'Qty In Transit',
  'Qty Damaged',
  'Qty Returned',
  'Low Stock Threshold',
  'Warehouse',
  'Warehouse Pincode',
  'Unit',
] as const;

const IMPORT_HEADERS = ['SKU', 'Qty Available', 'Low Stock Threshold', 'Warehouse Pincode'] as const;

const IMPORT_INSTRUCTIONS: Record<string, string> = {
  SKU: 'Required — product SKU or vendor SKU',
  'Qty Available': 'Required — whole number ≥ 0',
  'Low Stock Threshold': 'Optional — alert when stock falls below this',
  'Warehouse Pincode': 'Optional — only when you have multiple warehouses; leave blank for active warehouse',
};

function rowToExportRecord(row: InventoryExportRow): Record<string, string | number> {
  return {
    SKU: row.sku,
    'Product Name': row.productName,
    'Qty Available': row.qtyAvailable,
    'Qty In Transit': row.qtyInTransit,
    'Qty Damaged': row.qtyDamaged,
    'Qty Returned': row.qtyReturned,
    'Low Stock Threshold': row.lowStockThreshold,
    Warehouse: row.warehouse ?? '',
    'Warehouse Pincode': row.warehousePincode ?? '',
    Unit: row.unit ?? '',
  };
}

export function exportInventoryToCsv(rows: InventoryExportRow[]): string {
  const data = rows.map(rowToExportRecord);
  const ws = XLSX.utils.json_to_sheet(
    data.length > 0 ? data : [Object.fromEntries(EXPORT_HEADERS.map((h) => [h, '']))],
    { header: [...EXPORT_HEADERS] },
  );
  return XLSX.utils.sheet_to_csv(ws);
}

export function exportInventoryToXlsx(rows: InventoryExportRow[]): Buffer {
  const wb = XLSX.utils.book_new();
  const data = rows.map(rowToExportRecord);
  const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [Object.fromEntries(EXPORT_HEADERS.map((h) => [h, '']))], {
    header: [...EXPORT_HEADERS],
  });
  ws['!cols'] = EXPORT_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export function generateInventoryImportTemplate(opts?: { multiWarehouse?: boolean }): Buffer {
  const headers = opts?.multiWarehouse
    ? [...IMPORT_HEADERS]
    : IMPORT_HEADERS.filter((h) => h !== 'Warehouse Pincode');

  const instructionRow: Record<string, string> = {};
  const sampleRow: Record<string, string | number> = {};
  for (const h of headers) {
    instructionRow[h] = IMPORT_INSTRUCTIONS[h] ?? '';
    if (h === 'SKU') sampleRow[h] = 'Z0001';
    else if (h === 'Qty Available') sampleRow[h] = 100;
    else if (h === 'Low Stock Threshold') sampleRow[h] = 10;
    else if (h === 'Warehouse Pincode') sampleRow[h] = '400001';
    else sampleRow[h] = '';
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([instructionRow, sampleRow], { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 18) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Stock Update');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export function generateInventoryImportErrorReport(
  errors: Array<{ sku: string; error: string }>,
): Buffer {
  const wb = XLSX.utils.book_new();
  const data =
    errors.length > 0
      ? errors.map((e) => ({ SKU: e.sku, Error: e.error }))
      : [{ SKU: '', Error: '' }];
  const ws = XLSX.utils.json_to_sheet(data, { header: ['SKU', 'Error'] });
  ws['!cols'] = [{ wch: 20 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Import Errors');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export function parseInventoryImportCsv(text: string): Array<Record<string, string>> {
  const wb = XLSX.read(text, { type: 'string' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: '' });
  return raw
    .filter((row) => {
      const sku = String(row.SKU ?? row.sku ?? '').trim();
      if (!sku) return false;
      const lower = sku.toLowerCase();
      if (lower === 'sku' || lower.includes('required')) return false;
      return true;
    })
    .map((row) => ({
      sku: String(row.SKU ?? row.sku ?? '').trim(),
      qtyAvailable: String(row['Qty Available'] ?? row.qtyAvailable ?? row.qty ?? '').trim(),
      lowStockThreshold: String(row['Low Stock Threshold'] ?? row.lowStockThreshold ?? '').trim(),
      warehousePincode: String(row['Warehouse Pincode'] ?? row.warehousePincode ?? '').trim(),
    }));
}
