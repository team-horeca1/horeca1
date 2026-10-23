import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { cleanReferral } from '@/lib/affiliateReferral';
import {
  affiliateDetailCsv,
  affiliateDetailMatrix,
  registrationExportCsv,
  registrationExportMatrix,
  summarizeAffiliateCodes,
  type AffiliateAccountType,
  type AffiliateCodeSummary,
  type RegistrationExportKind,
  type RegistrationExportRow,
} from './registrationExportFormat';

const EXPORT_LIMIT = 20000;

function whereFor(kind: RegistrationExportKind) {
  if (kind === 'customer') return { isCustomer: true, isVendor: false, isBrand: false };
  if (kind === 'vendor') return { isVendor: true };
  return { isBrand: true };
}

export async function loadRegistrationExportRows(kind: RegistrationExportKind): Promise<RegistrationExportRow[]> {
  const accounts = await prisma.businessAccount.findMany({
    where: whereFor(kind),
    orderBy: { createdAt: 'desc' },
    take: EXPORT_LIMIT,
    select: {
      id: true,
      legalName: true,
      gstin: true,
      fssaiNumber: true,
      mobilePhone: true,
      referralCode: true,
      createdAt: true,
      members: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        take: 1,
        select: { user: { select: { email: true, phone: true } } },
      },
      vendors: {
        select: { id: true, gstNumber: true, fssaiNumber: true },
      },
      brand: { select: { id: true } },
    },
  });

  const vendorIds = accounts.flatMap((account) => account.vendors.map((vendor) => vendor.id));
  const brandIds = accounts.flatMap((account) => (account.brand ? [account.brand.id] : []));

  const vendorCounts = kind === 'vendor' && vendorIds.length > 0
    ? await prisma.product.groupBy({
        by: ['vendorId'],
        where: { vendorId: { in: vendorIds }, isActive: true, archivedAt: null },
        _count: { _all: true },
      })
    : [];
  const brandCounts = kind === 'brand' && brandIds.length > 0
    ? await prisma.brandMasterProduct.groupBy({
        by: ['brandId'],
        where: { brandId: { in: brandIds }, isActive: true },
        _count: { _all: true },
      })
    : [];

  const vendorCountById = new Map<string, number>();
  for (const row of vendorCounts) {
    if (row.vendorId) vendorCountById.set(row.vendorId, row._count._all);
  }
  const brandCountById = new Map<string, number>();
  for (const row of brandCounts) {
    brandCountById.set(row.brandId, row._count._all);
  }

  return accounts.map((account) => {
    const member = account.members[0]?.user;
    const vendorGst = account.vendors.find((vendor) => vendor.gstNumber)?.gstNumber ?? null;
    const vendorFssai = account.vendors.find((vendor) => vendor.fssaiNumber)?.fssaiNumber ?? null;
    let liveProductCount: number | null = null;
    if (kind === 'vendor') {
      liveProductCount = account.vendors.reduce(
        (sum, vendor) => sum + (vendorCountById.get(vendor.id) ?? 0),
        0,
      );
    } else if (kind === 'brand' && account.brand) {
      liveProductCount = brandCountById.get(account.brand.id) ?? 0;
    }
    return {
      accountId: account.id,
      businessName: account.legalName,
      mobile: member?.phone || account.mobilePhone || null,
      email: member?.email ?? null,
      createdAt: account.createdAt,
      gstin: account.gstin || vendorGst,
      fssai: account.fssaiNumber || vendorFssai,
      liveProductCount,
      referralCode: account.referralCode,
    };
  });
}

export interface AffiliateDetailRow extends RegistrationExportRow {
  accountType: AffiliateAccountType;
}

export interface AffiliateListFilters {
  kinds: RegistrationExportKind[];
  code?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
}

function accountTypeOf(flags: { isCustomer: boolean; isVendor: boolean; isBrand: boolean }): AffiliateAccountType {
  if (flags.isVendor) return 'vendor';
  if (flags.isBrand) return 'brand';
  return 'customer';
}

function kindWhere(kind: RegistrationExportKind): Prisma.BusinessAccountWhereInput {
  if (kind === 'customer') return { isCustomer: true, isVendor: false, isBrand: false };
  if (kind === 'vendor') return { isVendor: true };
  return { isBrand: true };
}

function dayStart(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayEnd(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function loadAffiliateRegistrations(filters: AffiliateListFilters): Promise<AffiliateDetailRow[]> {
  if (filters.kinds.length === 0) return [];
  const code = filters.code ? cleanReferral(filters.code) : null;
  if (filters.code && !code) return [];

  const createdAt: Prisma.DateTimeFilter = {};
  const from = filters.from ? dayStart(filters.from) : null;
  const to = filters.to ? dayEnd(filters.to) : null;
  if (from) createdAt.gte = from;
  if (to) createdAt.lte = to;

  const search = filters.search?.trim();
  const accounts = await prisma.businessAccount.findMany({
    where: {
      referralCode: code ?? { not: null },
      OR: filters.kinds.map(kindWhere),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
      ...(search
        ? {
            AND: [{
              OR: [
                { legalName: { contains: search, mode: 'insensitive' } },
                { mobilePhone: { contains: search } },
                { gstin: { contains: search, mode: 'insensitive' } },
                {
                  members: {
                    some: {
                      user: {
                        OR: [
                          { email: { contains: search, mode: 'insensitive' } },
                          { phone: { contains: search } },
                          { fullName: { contains: search, mode: 'insensitive' } },
                        ],
                      },
                    },
                  },
                },
              ],
            }],
          }
        : {}),
    },
    orderBy: [{ referralCode: 'asc' }, { createdAt: 'desc' }],
    take: EXPORT_LIMIT,
    select: {
      id: true,
      legalName: true,
      gstin: true,
      fssaiNumber: true,
      mobilePhone: true,
      referralCode: true,
      createdAt: true,
      isCustomer: true,
      isVendor: true,
      isBrand: true,
      members: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        take: 1,
        select: { user: { select: { id: true, email: true, phone: true } } },
      },
      vendors: {
        orderBy: [{ isPrimaryStore: 'desc' }, { createdAt: 'asc' }],
        select: { id: true, gstNumber: true, fssaiNumber: true },
      },
      brand: { select: { id: true } },
    },
  });

  const vendorIds = accounts.flatMap((account) => account.vendors.map((vendor) => vendor.id));
  const brandIds = accounts.flatMap((account) => (account.brand ? [account.brand.id] : []));
  const vendorCounts = vendorIds.length > 0
    ? await prisma.product.groupBy({
        by: ['vendorId'],
        where: { vendorId: { in: vendorIds }, isActive: true, archivedAt: null },
        _count: { _all: true },
      })
    : [];
  const brandCounts = brandIds.length > 0
    ? await prisma.brandMasterProduct.groupBy({
        by: ['brandId'],
        where: { brandId: { in: brandIds }, isActive: true },
        _count: { _all: true },
      })
    : [];
  const vendorCountById = new Map<string, number>();
  for (const row of vendorCounts) {
    if (row.vendorId) vendorCountById.set(row.vendorId, row._count._all);
  }
  const brandCountById = new Map<string, number>();
  for (const row of brandCounts) brandCountById.set(row.brandId, row._count._all);

  return accounts.flatMap((account) => {
    if (!account.referralCode) return [];
    const accountType = accountTypeOf(account);
    if (!filters.kinds.includes(accountType)) return [];
    const member = account.members[0]?.user;
    const primaryVendor = account.vendors[0] ?? null;
    const vendorGst = account.vendors.find((vendor) => vendor.gstNumber)?.gstNumber ?? null;
    const vendorFssai = account.vendors.find((vendor) => vendor.fssaiNumber)?.fssaiNumber ?? null;
    let liveProductCount: number | null = null;
    if (accountType === 'vendor') {
      liveProductCount = account.vendors.reduce((sum, vendor) => sum + (vendorCountById.get(vendor.id) ?? 0), 0);
    } else if (accountType === 'brand' && account.brand) {
      liveProductCount = brandCountById.get(account.brand.id) ?? 0;
    }
    return [{
      accountId: account.id,
      businessName: account.legalName,
      mobile: member?.phone || account.mobilePhone || null,
      email: member?.email ?? null,
      createdAt: account.createdAt,
      gstin: account.gstin || vendorGst,
      fssai: account.fssaiNumber || vendorFssai,
      liveProductCount,
      referralCode: account.referralCode,
      accountType,
      userId: member?.id ?? null,
      vendorId: primaryVendor?.id ?? null,
      brandId: account.brand?.id ?? null,
    }];
  });
}

export async function loadAffiliateOverview(kinds: RegistrationExportKind[]): Promise<{
  totalRegistrations: number;
  codesTracked: number;
  codes: AffiliateCodeSummary[];
}> {
  const rows = await loadAffiliateRegistrations({ kinds });
  const summary = summarizeAffiliateCodes(rows.map((row) => ({
    referralCode: row.referralCode ?? '',
    accountType: row.accountType,
  })).filter((row) => row.referralCode));
  return {
    totalRegistrations: summary.totalRegistrations,
    codesTracked: summary.codes.length,
    codes: summary.codes,
  };
}

export async function renderAffiliateExport(
  filters: AffiliateListFilters,
  format: 'csv' | 'xlsx',
): Promise<{ body: Buffer; contentType: string; filename: string }> {
  const rows = await loadAffiliateRegistrations(filters);
  const suffix = filters.code ? `-${cleanReferral(filters.code)}` : '';
  const filename = `horeca1-affiliates${suffix}`;
  if (format === 'xlsx') {
    const sheet = XLSX.utils.aoa_to_sheet(affiliateDetailMatrix(rows));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Affiliates');
    const body = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return {
      body,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${filename}.xlsx`,
    };
  }
  return {
    body: Buffer.from(`\uFEFF${affiliateDetailCsv(rows)}`, 'utf8'),
    contentType: 'text/csv; charset=utf-8',
    filename: `${filename}.csv`,
  };
}

export async function renderRegistrationExport(
  kind: RegistrationExportKind,
  format: 'csv' | 'xlsx',
): Promise<{ body: Buffer; contentType: string; filename: string }> {
  const rows = await loadRegistrationExportRows(kind);
  const filename = `horeca1-${kind}-registrations`;
  if (format === 'xlsx') {
    const matrix = registrationExportMatrix(kind, rows);
    const sheet = XLSX.utils.aoa_to_sheet(matrix);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Registrations');
    const body = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return {
      body,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${filename}.xlsx`,
    };
  }
  const csv = `\uFEFF${registrationExportCsv(kind, rows)}`;
  return {
    body: Buffer.from(csv, 'utf8'),
    contentType: 'text/csv; charset=utf-8',
    filename: `${filename}.csv`,
  };
}
