import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import {
  registrationExportCsv,
  registrationExportMatrix,
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
