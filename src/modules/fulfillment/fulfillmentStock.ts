import { prisma } from '@/lib/prisma';
import { isMultiWarehouseEnabled } from '@/lib/config/multiWarehouse';

export type InvRow = {
  outletId: string;
  qtyAvailable: number;
  qtyReserved?: number;
};

export type FulfillmentStockContext = {
  vendorId: string;
  multiWarehouseEnabled: boolean;
  primaryOutletId: string;
  outletIds: string[];
  /** outletId → pincodes (empty array means “use legacy vendor-wide areas”) */
  outletPincodes: Map<string, string[]>;
  /** Legacy service areas with outletId = null */
  legacyPincodes: string[];
};

function sellableOf(row: InvRow | undefined): number {
  if (!row) return 0;
  return Math.max(0, row.qtyAvailable - (row.qtyReserved ?? 0));
}

export async function loadFulfillmentStockContext(
  vendorId: string,
): Promise<FulfillmentStockContext | null> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { businessAccountId: true, multiWarehouseEnabled: true },
  });
  if (!vendor) return null;

  const [ba, outlets, serviceAreas] = await Promise.all([
    prisma.businessAccount.findUnique({
      where: { id: vendor.businessAccountId },
      select: { primaryOutletId: true },
    }),
    prisma.outlet.findMany({
      where: { businessAccountId: vendor.businessAccountId, isActive: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.serviceArea.findMany({
      where: { vendorId, isActive: true },
      select: { outletId: true, pincode: true },
    }),
  ]);

  if (outlets.length === 0) return null;

  const primaryOutletId = ba?.primaryOutletId ?? outlets[0]!.id;
  const outletPincodes = new Map<string, string[]>();
  const legacyPincodes: string[] = [];
  for (const sa of serviceAreas) {
    if (sa.outletId == null) {
      legacyPincodes.push(sa.pincode);
    } else {
      const list = outletPincodes.get(sa.outletId) ?? [];
      list.push(sa.pincode);
      outletPincodes.set(sa.outletId, list);
    }
  }

  return {
    vendorId,
    multiWarehouseEnabled: isMultiWarehouseEnabled(vendor.multiWarehouseEnabled),
    primaryOutletId,
    outletIds: outlets.map((o) => o.id),
    outletPincodes,
    legacyPincodes,
  };
}

/** Same pincode rule as FulfillmentRouterService.rankOutlets */
export function outletServesPincode(
  ctx: FulfillmentStockContext,
  outletId: string,
  deliveryPincode: string | null | undefined,
): boolean {
  // No pin → do not treat as "serves everywhere" (prevents browse stock inflation).
  if (!deliveryPincode) return false;
  const scoped = ctx.outletPincodes.get(outletId);
  if (!scoped || scoped.length === 0) {
    if (ctx.legacyPincodes.length === 0) return true;
    return ctx.legacyPincodes.includes(deliveryPincode);
  }
  return scoped.includes(deliveryPincode);
}

/**
 * Outlet IDs whose stock should be shown / enforced for this delivery pin.
 * - No pincode → primary only (avoid summing all warehouses)
 * - Pincode with no serving outlet → [] (sellable 0 — hard-hide on browse)
 * - One outlet / MW off path → primary
 */
export function stockOutletIdsForDelivery(
  ctx: FulfillmentStockContext,
  deliveryPincode?: string | null,
): string[] {
  if (!deliveryPincode) {
    return [ctx.primaryOutletId];
  }
  if (!ctx.multiWarehouseEnabled || ctx.outletIds.length === 1) {
    // Single warehouse: only sellable if that outlet covers the pin (or legacy vendor-wide).
    return outletServesPincode(ctx, ctx.primaryOutletId, deliveryPincode)
      ? [ctx.primaryOutletId]
      : [];
  }
  return ctx.outletIds.filter((id) =>
    outletServesPincode(ctx, id, deliveryPincode),
  );
}

/**
 * Sellable units for display / cart cap.
 * Multi-warehouse: max across candidate outlets (order ships from one warehouse).
 * Single-warehouse: that outlet’s sellable only.
 */
export function sellableFromInventoryRows(
  rows: InvRow[],
  candidateOutletIds: string[],
): number {
  if (candidateOutletIds.length === 0) return 0;
  const byOutlet = new Map(rows.map((r) => [r.outletId, r]));
  let max = 0;
  for (const id of candidateOutletIds) {
    max = Math.max(max, sellableOf(byOutlet.get(id)));
  }
  return max;
}

export function sellableForContext(
  ctx: FulfillmentStockContext,
  rows: InvRow[],
  deliveryPincode?: string | null,
): number {
  return sellableFromInventoryRows(rows, stockOutletIdsForDelivery(ctx, deliveryPincode));
}

/** DB lookup for cart enforce / one-off checks. */
export async function getFulfillmentAwareSellable(opts: {
  vendorId: string;
  productId: string;
  deliveryPincode?: string | null;
}): Promise<{ qty: number; productName: string }> {
  const [ctx, product, rows] = await Promise.all([
    loadFulfillmentStockContext(opts.vendorId),
    prisma.product.findUnique({
      where: { id: opts.productId },
      select: { name: true },
    }),
    prisma.inventory.findMany({
      where: { productId: opts.productId },
      select: { outletId: true, qtyAvailable: true, qtyReserved: true },
    }),
  ]);

  const productName = product?.name ?? 'Item';
  if (!ctx) {
    // No outlets — treat as aggregate fallback (legacy)
    const qty = rows.reduce(
      (s, r) => s + Math.max(0, r.qtyAvailable - (r.qtyReserved ?? 0)),
      0,
    );
    return { qty, productName };
  }

  return {
    qty: sellableForContext(ctx, rows, opts.deliveryPincode),
    productName,
  };
}

/**
 * Best available qty for a product across ranked checkout candidates
 * (used when the full cart cannot be fulfilled — show max rather than primary’s 0).
 */
export async function bestSellableAmongOutlets(
  productId: string,
  outletIds: string[],
): Promise<number> {
  if (outletIds.length === 0) return 0;
  const rows = await prisma.inventory.findMany({
    where: { productId, outletId: { in: outletIds } },
    select: { outletId: true, qtyAvailable: true, qtyReserved: true },
  });
  return sellableFromInventoryRows(rows, outletIds);
}
