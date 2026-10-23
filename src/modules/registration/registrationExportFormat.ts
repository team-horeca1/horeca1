/**
 * Registration CSV/XLSX rows for Earnchilada attribution exports.
 * Pure formatting — no database access.
 */

export type RegistrationExportKind = 'customer' | 'vendor' | 'brand';
export type AffiliateAccountType = RegistrationExportKind;

export interface AffiliateCodeSummary {
  code: string;
  customers: number;
  suppliers: number;
  brands: number;
}

export function summarizeAffiliateCodes(
  rows: Array<{ referralCode: string; accountType: AffiliateAccountType }>,
): { totalRegistrations: number; codes: AffiliateCodeSummary[] } {
  const map = new Map<string, AffiliateCodeSummary>();
  for (const row of rows) {
    const current = map.get(row.referralCode) ?? {
      code: row.referralCode,
      customers: 0,
      suppliers: 0,
      brands: 0,
    };
    if (row.accountType === 'customer') current.customers += 1;
    else if (row.accountType === 'vendor') current.suppliers += 1;
    else current.brands += 1;
    map.set(row.referralCode, current);
  }
  const codes = [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  return { totalRegistrations: rows.length, codes };
}

export function affiliateAccountTypeLabel(kind: AffiliateAccountType): string {
  if (kind === 'vendor') return 'Supplier';
  if (kind === 'brand') return 'Brand';
  return 'Customer';
}

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
  /** Owner user id — admin customer detail uses /admin/customers/[userId]. */
  userId?: string | null;
  /** Primary vendor id — admin supplier detail uses /admin/vendors/[vendorId]. */
  vendorId?: string | null;
  /** Brand id — admin brand detail uses /admin/brands/[brandId]. */
  brandId?: string | null;
}

/** Super Admin deep-link for an attributed registration. */
export function affiliateDetailHref(row: {
  accountType: AffiliateAccountType;
  userId?: string | null;
  vendorId?: string | null;
  brandId?: string | null;
}): string | null {
  if (row.accountType === 'customer' && row.userId) return `/admin/customers/${row.userId}`;
  if (row.accountType === 'vendor' && row.vendorId) return `/admin/vendors/${row.vendorId}`;
  if (row.accountType === 'brand' && row.brandId) return `/admin/brands/${row.brandId}`;
  return null;
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

export function affiliateDetailHeaders(): string[] {
  return [
    'Account ID',
    'Business Name',
    'Mobile Number',
    'Email',
    'Created At',
    'Account Type',
    'GSTIN',
    'FSSAI',
    'Live Product Count',
    'Referral Code',
  ];
}

export function affiliateDetailCsv(
  rows: Array<RegistrationExportRow & { accountType: AffiliateAccountType }>,
): string {
  const header = affiliateDetailHeaders().map(csvCell).join(',');
  const body = rows.map((row) => [
    row.accountId,
    row.businessName,
    row.mobile ?? '',
    row.email ?? '',
    row.createdAt.toISOString(),
    affiliateAccountTypeLabel(row.accountType),
    row.gstin ?? '',
    row.fssai ?? '',
    row.accountType === 'customer' || row.liveProductCount == null ? '' : String(row.liveProductCount),
    row.referralCode ?? '',
  ].map(csvCell).join(','));
  return [header, ...body].join('\n');
}

export function affiliateDetailMatrix(
  rows: Array<RegistrationExportRow & { accountType: AffiliateAccountType }>,
): string[][] {
  return [
    affiliateDetailHeaders(),
    ...rows.map((row) => [
      row.accountId,
      row.businessName,
      row.mobile ?? '',
      row.email ?? '',
      row.createdAt.toISOString(),
      affiliateAccountTypeLabel(row.accountType),
      row.gstin ?? '',
      row.fssai ?? '',
      row.accountType === 'customer' || row.liveProductCount == null ? '' : String(row.liveProductCount),
      row.referralCode ?? '',
    ].map((cell) => spreadsheetSafe(cell))),
  ];
}

export function registrationExportMatrix(kind: RegistrationExportKind, rows: RegistrationExportRow[]): string[][] {
  return [
    registrationExportHeaders(kind),
    ...rows.map((row) => rowCells(kind, row).map((cell) => spreadsheetSafe(cell))),
  ];
}
