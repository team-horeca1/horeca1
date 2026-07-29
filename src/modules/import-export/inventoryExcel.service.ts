import * as XLSX from 'xlsx';

export interface InventoryExportRow {
  sku: string;
  productName: string;
  qtyAvailable: number;
  qtyReserved: number;
  net: number;
  qtyInTransit: number;
  qtyDamaged: number;
  qtyReturned: number;
  lowStockThreshold: number;
}

/** Parsed import row — Reserved / Net / Product Name are never imported. */
export interface InventoryImportParsedRow {
  sku: string;
  qtyAvailable: string;
  lowStockThreshold: string;
  qtyInTransit: string;
  qtyDamaged: string;
  qtyReturned: string;
  warehousePincode: string;
}

const EXPORT_HEADERS = [
  'SKU',
  'Product Name',
  'Qty Available',
  'Qty Reserved',
  'Net',
  'Qty In Transit',
  'Qty Damaged',
  'Qty Returned',
  'Low Stock Threshold',
] as const;

const IMPORT_HEADERS = [
  'SKU',
  'Qty Available',
  'Low Stock Threshold',
  'Qty In Transit',
  'Qty Damaged',
  'Qty Returned',
  'Warehouse Pincode',
] as const;

const IMPORT_INSTRUCTIONS: Record<string, string> = {
  SKU: 'Required — product SKU, vendor SKU, or product ID from Export',
  'Qty Available': 'Required — whole number ≥ 0',
  'Low Stock Threshold': 'Optional — alert when stock falls below this',
  'Qty In Transit': 'Optional — whole number ≥ 0 (from Export)',
  'Qty Damaged': 'Optional — whole number ≥ 0 (from Export)',
  'Qty Returned': 'Optional — whole number ≥ 0 (from Export)',
  'Warehouse Pincode': 'Optional — only when you have multiple warehouses; leave blank for active warehouse',
};

function rowToExportRecord(row: InventoryExportRow): Record<string, string | number> {
  return {
    SKU: row.sku,
    'Product Name': row.productName,
    'Qty Available': row.qtyAvailable,
    'Qty Reserved': row.qtyReserved,
    Net: row.net,
    'Qty In Transit': row.qtyInTransit,
    'Qty Damaged': row.qtyDamaged,
    'Qty Returned': row.qtyReturned,
    'Low Stock Threshold': row.lowStockThreshold,
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

  // Readme so Export → edit → reupload is clear about writable vs ignored columns
  const readme = XLSX.utils.aoa_to_sheet([
    ['Inventory bulk upload — column guide'],
    [],
    ['Writable on Bulk Upload', 'SKU, Qty Available, Low Stock Threshold, Qty In Transit, Qty Damaged, Qty Returned'],
    ['Ignored (do not edit for upload)', 'Product Name, Qty Reserved, Net'],
    ['Qty Reserved', 'System-managed from orders — never overwritten by import'],
    ['Net', 'Calculated as Qty Available − Qty Reserved — never stored'],
  ]);
  readme['!cols'] = [{ wch: 36 }, { wch: 72 }];
  XLSX.utils.book_append_sheet(wb, readme, 'Readme');

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
    else if (h === 'Qty In Transit') sampleRow[h] = 0;
    else if (h === 'Qty Damaged') sampleRow[h] = 0;
    else if (h === 'Qty Returned') sampleRow[h] = 0;
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

function mapImportRow(row: Record<string, string | number>): InventoryImportParsedRow {
  return {
    sku: String(row.SKU ?? row.sku ?? '').trim(),
    qtyAvailable: String(row['Qty Available'] ?? row.qtyAvailable ?? row.qty ?? '').trim(),
    lowStockThreshold: String(row['Low Stock Threshold'] ?? row.lowStockThreshold ?? '').trim(),
    qtyInTransit: String(row['Qty In Transit'] ?? row.qtyInTransit ?? '').trim(),
    qtyDamaged: String(row['Qty Damaged'] ?? row.qtyDamaged ?? '').trim(),
    qtyReturned: String(row['Qty Returned'] ?? row.qtyReturned ?? '').trim(),
    warehousePincode: String(row['Warehouse Pincode'] ?? row.warehousePincode ?? '').trim(),
  };
}

export function parseInventoryImportCsv(text: string): InventoryImportParsedRow[] {
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
    .map(mapImportRow);
}
