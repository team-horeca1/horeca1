/**
 * Catalog pricing bridge — attaches customer-specific prices to PUBLIC
 * catalog API responses (vendor store listing, product detail, deals,
 * search, alternates).
 *
 * These routes serve anonymous traffic, so auth is OPTIONAL here: no
 * session (or no special pricing) means products pass through untouched
 * and the storefront keeps rendering base/slab prices. When the buyer IS
 * logged in, each product they have a special price for gains:
 *
 *   customerPricing: { unitPrice: number, source: ResolutionSource }
 *
 * The DAL/product pages treat that as the effective price (and hide
 * bulk-slab tiers, which the resolver outranks). Cart/checkout/order
 * already resolve independently, so what the customer sees here is
 * exactly what they pay there.
 */

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getDeliveryGeo } from '@/lib/deliveryLocation';
import {
  resolveCatalogPrices,
  type CatalogPrice,
  type CustomerContext,
} from '@/modules/pricing/pricing.service';

/** Minimal product shape the resolver needs; routes pass their raw rows. */
interface PriceableProduct {
  id: string;
  vendorId?: string | null;
  basePrice: unknown;
  brand?: string | null;
  vendor?: { id: string } | null;
}

/**
 * Build a CustomerContext from the current session, or null when browsing
 * anonymously. Outlet geo (pincode/city/state) is fetched for the active
 * outlet so pincode/area rules can match.
 */
export async function getCatalogCustomerContext(): Promise<CustomerContext | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const u = session.user as unknown as Record<string, unknown>;
  const outletId = (u.activeOutletId as string) ?? null;
  const outlet = outletId
    ? await prisma.outlet.findUnique({
        where: { id: outletId },
        select: { pincode: true, city: true, state: true },
      })
    : null;

  // If the buyer picked a "Deliver to" address, location pricing follows IT,
  // not the registered outlet. Falls back to the outlet when nothing is chosen.
  const delivery = await getDeliveryGeo(session.user.id);

  return {
    userId: session.user.id,
    businessAccountId: (u.activeBusinessAccountId as string) ?? null,
    outletId,
    outletPincode: delivery?.pincode ?? outlet?.pincode ?? null,
    outletCity: delivery?.city ?? outlet?.city ?? null,
    outletState: delivery?.state ?? outlet?.state ?? null,
    tags: [], // per-vendor CRM tags are merged inside the resolver
  };
}

/**
 * Attach `customerPricing` to every product the logged-in customer has a
 * special price for. Anonymous sessions and resolver failures both leave
 * the products untouched — pricing must never break public browsing.
 */
export async function attachCustomerPricing<T extends PriceableProduct>(
  products: T[],
): Promise<Array<T & { customerPricing?: CatalogPrice }>> {
  if (products.length === 0) return products;

  try {
    const customer = await getCatalogCustomerContext();
    if (!customer) return products;

    const inputs = products.flatMap((p) => {
      const vendorId = p.vendorId ?? p.vendor?.id;
      if (!vendorId || p.basePrice == null) return [];
      return [{ id: p.id, vendorId, basePrice: p.basePrice as number | string, brand: p.brand }];
    });
    if (inputs.length === 0) return products;

    const priceMap = await resolveCatalogPrices(inputs, customer);
    if (priceMap.size === 0) return products;

    return products.map((p) => {
      const cp = priceMap.get(p.id);
      return cp ? { ...p, customerPricing: cp } : p;
    });
  } catch (err) {
    console.error('[catalog-pricing] attachCustomerPricing failed, serving base prices:', err);
    return products;
  }
}
