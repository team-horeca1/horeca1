import type { PrismaClient, Prisma } from '@prisma/client';

// Horeca1 auto-SKU format: "H1-SKU-00001" (fallback for imports/backfill only).
// Admin-entered SKUs (e.g. RIC-BAS-001) are the canonical identifier for new masters.
export const MASTER_SKU_PREFIX = 'H1-SKU-';

/** Valid admin-entered master SKU: 2–40 chars, alphanumeric + hyphens/underscores. */
export const MASTER_SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/;

export function normalizeMasterSku(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validateMasterSku(sku: string): { ok: true; normalized: string } | { ok: false; message: string } {
  const normalized = normalizeMasterSku(sku);
  if (normalized.length < 2 || normalized.length > 40) {
    return { ok: false, message: 'SKU must be 2–40 characters' };
  }
  if (!MASTER_SKU_PATTERN.test(normalized)) {
    return { ok: false, message: 'SKU may only contain letters, numbers, hyphens, and underscores' };
  }
  return { ok: true, normalized };
}

export function formatMasterSku(n: number): string {
  return `${MASTER_SKU_PREFIX}${String(n).padStart(5, '0')}`;
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Next available master SKU. Reads the highest existing sku and increments.
 * Call inside the same transaction as the create to avoid a race under
 * concurrent master-product creation.
 */
export async function nextMasterSku(db: Db): Promise<string> {
  const last = await db.masterProduct.findFirst({
    where: {
      sku: {
        startsWith: MASTER_SKU_PREFIX,
      },
    },
    orderBy: { sku: 'desc' },
    select: { sku: true },
  });
  const lastNum = last?.sku.match(/(\d+)\s*$/)?.[1];
  const next = lastNum ? parseInt(lastNum, 10) + 1 : 1;
  return formatMasterSku(next);
}

// Vendor listing SKU: `{vendorCode}-{posSku}` (e.g. MAN-MANJRSYP123).
export const VENDOR_SKU_SEPARATOR = '-';

/** Short code until admin assigns `Vendor.vendorCode` (Phase 2). */
export function deriveVendorCodeFromSlug(slug: string): string {
  const segment = slug.split('-').find((s) => s.length > 0) ?? slug;
  return segment.slice(0, 20).toUpperCase();
}

/** Valid admin-assigned vendor code: 2–20 chars, alphanumeric + hyphens/underscores. */
export const VENDOR_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,19}$/;

export function normalizeVendorCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validateVendorCode(
  code: string,
): { ok: true; normalized: string } | { ok: false; message: string } {
  const normalized = normalizeVendorCode(code);
  if (normalized.length < 2 || normalized.length > 20) {
    return { ok: false, message: 'Vendor code must be 2–20 characters' };
  }
  if (!VENDOR_CODE_PATTERN.test(normalized)) {
    return {
      ok: false,
      message: 'Vendor code may only contain letters, numbers, hyphens, and underscores',
    };
  }
  return { ok: true, normalized };
}

export function resolveVendorCode(vendor: { vendorCode?: string | null; slug: string }): string {
  const explicit = vendor.vendorCode?.trim();
  if (explicit) return explicit.toUpperCase();
  return deriveVendorCodeFromSlug(vendor.slug);
}

export function formatVendorSku(vendorCode: string, posSku: string): string {
  const code = vendorCode.trim().toUpperCase();
  const pos = posSku.trim();
  if (!code || !pos) {
    throw new Error('vendorCode and posSku are required');
  }
  return `${code}${VENDOR_SKU_SEPARATOR}${pos}`;
}

export function parseVendorSku(
  full: string,
  vendorCode?: string,
): { vendorCode: string; posSku: string } {
  const trimmed = full.trim();
  if (!trimmed) return { vendorCode: vendorCode?.toUpperCase() ?? '', posSku: '' };

  if (vendorCode) {
    const prefix = `${vendorCode.toUpperCase()}${VENDOR_SKU_SEPARATOR}`;
    if (trimmed.toUpperCase().startsWith(prefix)) {
      return { vendorCode: vendorCode.toUpperCase(), posSku: trimmed.slice(prefix.length) };
    }
  }

  const sepIdx = trimmed.indexOf(VENDOR_SKU_SEPARATOR);
  if (sepIdx > 0) {
    return {
      vendorCode: trimmed.slice(0, sepIdx).toUpperCase(),
      posSku: trimmed.slice(sepIdx + 1),
    };
  }

  return { vendorCode: vendorCode?.toUpperCase() ?? '', posSku: trimmed };
}

function normPos(s: string): string {
  return s.trim().toLowerCase();
}

/** True when a vendor listing row represents the same POS code (vendorSku, legacy sku, or composed sku). */
export function posSkuMatchesListing(
  posSku: string,
  listing: { vendorSku?: string | null; sku?: string | null },
  vendorCode: string,
): boolean {
  const target = posSku.trim();
  if (!target) return false;
  const t = normPos(target);

  if (listing.vendorSku && normPos(listing.vendorSku) === t) return true;

  const sku = listing.sku?.trim() ?? '';
  if (!sku) return false;
  if (normPos(sku) === t) return true;
  if (normPos(sku) === normPos(formatVendorSku(vendorCode, target))) return true;

  const parsed = parseVendorSku(sku, vendorCode);
  return Boolean(parsed.posSku && normPos(parsed.posSku) === t);
}
