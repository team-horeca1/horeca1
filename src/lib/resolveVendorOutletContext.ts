/**
 * Resolve vendor + default Online Store outlet for vendor portal API routes.
 * Supplier Foundation: multi-warehouse retired — always use Vendor.defaultOutletId.
 */

import { NextRequest } from 'next/server';
import type { AuthContext } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';

export interface VendorOutletContext {
  vendorId: string;
  businessAccountId: string;
  outletId: string;
  accessibleOutletIds: string[];
  multiWarehouseEnabled: boolean;
  teamRole: Awaited<ReturnType<typeof resolveVendorContext>>['teamRole'];
}

async function getStoreDefaultOutletId(
  vendorId: string,
  businessAccountId: string,
  defaultOutletId: string | null,
): Promise<string | null> {
  if (defaultOutletId) {
    const ok = await prisma.outlet.findFirst({
      where: { id: defaultOutletId, businessAccountId, isActive: true },
      select: { id: true },
    });
    if (ok) return ok.id;
  }
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
  // Persist default if missing so future calls are stable
  if (first) {
    await prisma.vendor.update({
      where: { id: vendorId },
      data: { defaultOutletId: first.id, multiWarehouseEnabled: false },
    }).catch(() => undefined);
  }
  return first?.id ?? null;
}

/**
 * Resolve the stock/fulfillment outlet for an Online Store (always the default outlet).
 */
export async function resolveVendorOutletContext(
  ctx: AuthContext,
  req?: NextRequest,
  options?: { allowAllOutlets?: boolean },
): Promise<VendorOutletContext> {
  void options;
  const { vendorId, teamRole } = await resolveVendorContext(ctx, req!);

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { businessAccountId: true, defaultOutletId: true },
  });
  if (!vendor) throw Errors.notFound('Online Store');

  const outletId = await getStoreDefaultOutletId(
    vendorId,
    vendor.businessAccountId,
    vendor.defaultOutletId,
  );
  if (!outletId) {
    throw Errors.badRequest('Online Store has no default outlet. Re-save store address or contact support.');
  }

  return {
    vendorId,
    businessAccountId: vendor.businessAccountId,
    outletId,
    accessibleOutletIds: [],
    multiWarehouseEnabled: false,
    teamRole,
  };
}

/** Prisma filter for order lists scoped to fulfillment warehouse. */
export function buildFulfillmentOutletWhere(
  voc: VendorOutletContext,
  allOutlets?: boolean,
): { fulfillmentOutletId?: string } {
  void allOutlets;
  return { fulfillmentOutletId: voc.outletId };
}

/** Prisma filter for inventory scoped to the Online Store default outlet. */
export function buildInventoryOutletWhere(
  voc: VendorOutletContext,
  allOutlets?: boolean,
): { outletId?: string } {
  void allOutlets;
  return { outletId: voc.outletId };
}
