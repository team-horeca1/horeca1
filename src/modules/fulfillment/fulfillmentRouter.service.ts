import { prisma } from '@/lib/prisma';
import { distanceKm } from '@/lib/geo';
import { Errors } from '@/middleware/errorHandler';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { isMultiWarehouseEnabled } from '@/lib/config/multiWarehouse';
import {
  bestSellableAmongOutlets,
  loadFulfillmentStockContext,
  stockOutletIdsForDelivery,
} from '@/modules/fulfillment/fulfillmentStock';

export interface FulfillmentCandidate {
  outletId: string;
  name: string;
  distanceKm: number;
}

export interface FulfillmentRouteInput {
  vendorId: string;
  deliveryPincode: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  items: Array<{ productId: string; quantity: number }>;
}

export class FulfillmentRouterService {
  private inventory = new InventoryService();

  async resolveFulfillmentOutlet(input: FulfillmentRouteInput): Promise<string> {
    const vendor = await prisma.vendor.findUnique({
      where: { id: input.vendorId },
      select: { businessAccountId: true, multiWarehouseEnabled: true },
    });
    if (!vendor) throw Errors.notFound('Vendor');

    const outlets = await prisma.outlet.findMany({
      where: { businessAccountId: vendor.businessAccountId, isActive: true },
      select: {
        id: true,
        name: true,
        pincode: true,
        latitude: true,
        longitude: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (outlets.length === 0) {
      throw Errors.badRequest('Vendor has no warehouse outlets configured');
    }

    const primaryOutletId =
      (await prisma.businessAccount.findUnique({
        where: { id: vendor.businessAccountId },
        select: { primaryOutletId: true },
      }))?.primaryOutletId ?? outlets[0]!.id;

    if (!isMultiWarehouseEnabled(vendor.multiWarehouseEnabled) || outlets.length === 1) {
      await this.assertStockAtOutlet(
        primaryOutletId,
        input.items,
        outlets.map((o) => o.id),
      );
      return primaryOutletId;
    }

    const candidates = await this.rankOutlets(
      input.vendorId,
      outlets,
      input.deliveryPincode,
      input.deliveryLat,
      input.deliveryLng,
    );

    for (const c of candidates) {
      const check = await this.inventory.bulkCheck(input.items, c.outletId);
      if (check.every((r) => r.available)) return c.outletId;
    }

    const primaryCheck = await this.inventory.bulkCheck(input.items, primaryOutletId);
    if (primaryCheck.every((r) => r.available)) return primaryOutletId;

    // Prefer reporting the best available among serving candidates (not primary's 0
    // when another warehouse has stock but still can't cover the full cart qty).
    const fail = primaryCheck.find((r) => !r.available);
    const candidateIds = [
      ...new Set([
        ...candidates.map((c) => c.outletId),
        primaryOutletId,
      ]),
    ];
    const best =
      fail
        ? await bestSellableAmongOutlets(fail.productId, candidateIds)
        : 0;
    throw Errors.outOfStock(
      fail?.productName ?? 'Item',
      Math.max(best, fail?.qtyAvailable ?? 0),
    );
  }

  private async assertStockAtOutlet(
    outletId: string,
    items: Array<{ productId: string; quantity: number }>,
    reportOutletIds?: string[],
  ): Promise<void> {
    const check = await this.inventory.bulkCheck(items, outletId);
    const fail = check.find((r) => !r.available);
    if (!fail) return;
    const ids = reportOutletIds?.length ? reportOutletIds : [outletId];
    const best = await bestSellableAmongOutlets(fail.productId, ids);
    throw Errors.outOfStock(fail.productName, Math.max(best, fail.qtyAvailable));
  }

  private async rankOutlets(
    vendorId: string,
    outlets: Array<{
      id: string;
      name: string;
      pincode: string | null;
      latitude: number | null;
      longitude: number | null;
    }>,
    deliveryPincode: string | null,
    deliveryLat: number | null,
    deliveryLng: number | null,
  ): Promise<FulfillmentCandidate[]> {
    const serviceAreas = await prisma.serviceArea.findMany({
      where: { vendorId, isActive: true },
      select: { outletId: true, pincode: true },
    });

    const outletServesPincode = (outletId: string): boolean => {
      if (!deliveryPincode) return true;
      const scoped = serviceAreas.filter((sa) => sa.outletId === outletId);
      if (scoped.length === 0) {
        const legacy = serviceAreas.filter((sa) => sa.outletId === null);
        if (legacy.length === 0) return true;
        return legacy.some((sa) => sa.pincode === deliveryPincode);
      }
      return scoped.some((sa) => sa.pincode === deliveryPincode);
    };

    const withDistance: FulfillmentCandidate[] = [];
    for (const o of outlets) {
      if (!outletServesPincode(o.id)) continue;
      let dist = Number.MAX_SAFE_INTEGER;
      if (
        deliveryLat != null &&
        deliveryLng != null &&
        o.latitude != null &&
        o.longitude != null
      ) {
        dist = distanceKm(deliveryLat, deliveryLng, o.latitude, o.longitude);
      } else if (deliveryPincode && o.pincode === deliveryPincode) {
        dist = 0;
      }
      withDistance.push({ outletId: o.id, name: o.name, distanceKm: dist });
    }

    if (withDistance.length === 0) {
      return outlets.map((o) => ({ outletId: o.id, name: o.name, distanceKm: Number.MAX_SAFE_INTEGER }));
    }

    return withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
  }
}

/** Outlet IDs used for storefront stock display (same rules as checkout). */
export async function resolveStockDisplayOutletIds(
  vendorId: string,
  deliveryPincode?: string | null,
): Promise<string[] | null> {
  const ctx = await loadFulfillmentStockContext(vendorId);
  if (!ctx) return null;
  return stockOutletIdsForDelivery(ctx, deliveryPincode);
}
