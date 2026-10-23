/**
 * Registration CSV/XLSX rows for Earnchilada attribution exports.
 * Pure formatting — no database access.
 */

export type RegistrationExportKind = 'customer' | 'vendor' | 'brand';

export interface RegistrationExportRow {
  accountId: string;
  businessName: string;
  mobile: string | null;
  email: string | null;
  createdAt: Date;
  gstin: string | null;
  fssai: string | null;
  /** Null when the column does not apply (customers). */
  liveProductCount: number | null;
  referralCode: string | null;
}

export function registrationExportPermission(kind: RegistrationExportKind): 'customers.view' | 'vendors.view' | 'brands.view' {
  if (kind === 'vendor') return 'vendors.view';
  if (kind === 'brand') return 'brands.view';
  return 'customers.view';
}

export function registrationExportHeaders(kind: RegistrationExportKind): string[] {
  const headers = [
    'Account ID',
    'Business Name',
    'Mobile Number',
    'Email',
    'Created At',
    'GSTIN',
    'FSSAI',
  ];
  if (kind !== 'customer') headers.push('Live Product Count');
  headers.push('Referral Code');
  return headers;
}

/** Prefix spreadsheet formulas so a business name cannot execute in Excel. */
export function spreadsheetSafe(value: string | number | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) return `'${s}`;
  return s;
}

function csvCell(value: string | number | null | undefined): string {
  const s = spreadsheetSafe(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function rowCells(kind: RegistrationExportKind, row: RegistrationExportRow): string[] {
  const cells = [
    row.accountId,
    row.businessName,
    row.mobile ?? '',
    row.email ?? '',
    row.createdAt.toISOString(),
    row.gstin ?? '',
    row.fssai ?? '',
  ];
  if (kind !== 'customer') cells.push(row.liveProductCount == null ? '' : String(row.liveProductCount));
  cells.push(row.referralCode ?? '');
  return cells;
}

export function registrationExportCsv(kind: RegistrationExportKind, rows: RegistrationExportRow[]): string {
  const header = registrationExportHeaders(kind).map(csvCell).join(',');
  const body = rows.map((row) => rowCells(kind, row).map(csvCell).join(','));
  return [header, ...body].join('\n');
}

export function registrationExportMatrix(kind: RegistrationExportKind, rows: RegistrationExportRow[]): string[][] {
  return [
    registrationExportHeaders(kind),
    ...rows.map((row) => rowCells(kind, row).map((cell) => spreadsheetSafe(cell))),
  ];
}
