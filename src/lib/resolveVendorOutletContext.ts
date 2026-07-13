/**
 * Resolve vendor + active warehouse (outlet) for vendor portal API routes.
 */

import { NextRequest } from 'next/server';
import type { AuthContext } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { VENDOR_ID_COOKIE, VENDOR_OUTLET_COOKIE } from '@/lib/adminImpersonationCookies';

export interface VendorOutletContext {
  vendorId: string;
  businessAccountId: string;
  outletId: string;
  accessibleOutletIds: string[];
  multiWarehouseEnabled: boolean;
  teamRole: Awaited<ReturnType<typeof resolveVendorContext>>['teamRole'];
}

async function getVendorPrimaryOutletId(businessAccountId: string): Promise<string | null> {
  const ba = await prisma.businessAccount.findUnique({
    where: { id: businessAccountId },
    select: { primaryOutletId: true },
  });
  if (ba?.primaryOutletId) return ba.primaryOutletId;
  const first = await prisma.outlet.findFirst({
    where: { businessAccountId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return first?.id ?? null;
}

function assertOutletAccess(ctx: AuthContext, outletId: string): void {
  if (ctx.accessibleOutletIds.length > 0 && !ctx.accessibleOutletIds.includes(outletId)) {
    throw Errors.forbidden('You do not have access to that outlet');
  }
}

/**
 * Resolve the warehouse context for a vendor API request.
 *
 * @param req - optional; reads `?outletId=` when account-wide user overrides active outlet
 * @param options.allOutlets - when true, returns outletId as primary but signals aggregated mode via caller
 */
export async function resolveVendorOutletContext(
  ctx: AuthContext,
  req?: NextRequest,
  options?: { allowAllOutlets?: boolean },
): Promise<VendorOutletContext> {
  const { vendorId, teamRole } = await resolveVendorContext(ctx, req!);

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { businessAccountId: true, multiWarehouseEnabled: true },
  });
  if (!vendor) throw Errors.notFound('Vendor');

  const queryOutletId = req?.nextUrl.searchParams.get('outletId') ?? undefined;
  const allOutlets = options?.allowAllOutlets && queryOutletId === 'all';

  // Admin vendor Admin View: JWT activeOutletId belongs to the admin's BA.
  // Prefer the impersonation outlet cookie instead.
  const vendorImpersonating = !!req?.cookies.get(VENDOR_ID_COOKIE)?.value;
  const impersonationOutletId = vendorImpersonating
    ? req?.cookies.get(VENDOR_OUTLET_COOKIE)?.value
    : undefined;

  let outletId: string | null = null;
  if (!allOutlets) {
    const candidate =
      queryOutletId ??
      impersonationOutletId ??
      (vendorImpersonating ? undefined : ctx.activeOutletId) ??
      (await getVendorPrimaryOutletId(vendor.businessAccountId));

    if (candidate) {
      const belongsToVendor = await prisma.outlet.findFirst({
        where: { id: candidate, businessAccountId: vendor.businessAccountId, isActive: true },
        select: { id: true },
      });
      outletId = belongsToVendor?.id ?? (await getVendorPrimaryOutletId(vendor.businessAccountId));
    }
  }

  if (!outletId && !allOutlets) {
    throw Errors.badRequest('No active outlet. Select a warehouse to continue.');
  }

  if (outletId && !vendorImpersonating) {
    assertOutletAccess(ctx, outletId);
  }

  const primaryId = outletId ?? (await getVendorPrimaryOutletId(vendor.businessAccountId));
  if (!primaryId) throw Errors.badRequest('Vendor has no outlets configured');

  return {
    vendorId,
    businessAccountId: vendor.businessAccountId,
    outletId: primaryId,
    accessibleOutletIds: vendorImpersonating ? [] : ctx.accessibleOutletIds,
    multiWarehouseEnabled: vendor.multiWarehouseEnabled,
    teamRole,
  };
}

/** Prisma filter for order lists scoped to fulfillment warehouse. */
export function buildFulfillmentOutletWhere(
  voc: VendorOutletContext,
  allOutlets?: boolean,
): { fulfillmentOutletId?: string | { in: string[] } } {
  if (allOutlets) {
    if (voc.accessibleOutletIds.length > 0) {
      return { fulfillmentOutletId: { in: voc.accessibleOutletIds } };
    }
    return {};
  }
  return { fulfillmentOutletId: voc.outletId };
}

/** Prisma filter for inventory / warehouse ops scoped to outlet. */
export function buildInventoryOutletWhere(
  voc: VendorOutletContext,
  allOutlets?: boolean,
): { outletId?: string | { in: string[] } } {
  if (!voc.multiWarehouseEnabled) {
    return { outletId: voc.outletId };
  }
  if (allOutlets) {
    if (voc.accessibleOutletIds.length > 0) {
      return { outletId: { in: voc.accessibleOutletIds } };
    }
    return {};
  }
  return { outletId: voc.outletId };
}
