/**
 * Resolve (businessAccountId, outletId) for storefront actions — cart, checkout,
 * promos. Admins and single-location buyers don't need a manually picked "outlet"
 * on the JWT: a saved delivery address (h1_addr cookie) is enough. We match or
 * create an Outlet under their account from that address at request time.
 */

import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/middleware/auth';
import { Errors } from '@/middleware/errorHandler';
import { provisionDefaultAccount } from '@/lib/provisionAccount';
import { DELIVERY_COOKIE } from '@/lib/deliveryLocation';
import type { CartContext } from '@/modules/cart/cart.service';
import {
  effectiveCustomerBusinessAccountId,
  effectiveCustomerUserId,
} from '@/lib/resolveCustomerImpersonation';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StorefrontContext = CartContext;

async function ensureBusinessAccountId(userId: string, role: string): Promise<string> {
  const membership = await prisma.businessAccountMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: { businessAccountId: true },
  });
  if (membership) return membership.businessAccountId;

  // Storefront buyers: customers and admins testing checkout both get a personal BA.
  if (role !== 'customer' && role !== 'admin') {
    throw Errors.badRequest('Select a delivery address before placing orders.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true, businessName: true, pincode: true, gstNumber: true },
  });
  if (!user) throw Errors.unauthorized();

  const provision = await provisionDefaultAccount({
    userId,
    kind: 'customer',
    fullName: user.fullName,
    businessName: user.businessName,
    pincode: user.pincode ?? undefined,
    gstin: user.gstNumber ?? undefined,
  });
  return provision.businessAccountId;
}

async function getSelectedSavedAddress(userId: string) {
  try {
    const jar = await cookies();
    const addrId = jar.get(DELIVERY_COOKIE)?.value;
    if (addrId && UUID_RE.test(addrId)) {
      const byCookie = await prisma.savedAddress.findFirst({ where: { id: addrId, userId } });
      if (byCookie) return byCookie;
    }
  } catch {
    // Outside a request scope (e.g. worker) — fall through to default lookup.
  }

  return prisma.savedAddress.findFirst({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
}

type SavedAddrRow = NonNullable<Awaited<ReturnType<typeof getSelectedSavedAddress>>>;

async function findOrCreateOutletForAddress(
  businessAccountId: string,
  addr: SavedAddrRow,
): Promise<string> {
  if (addr.outletId) {
    const linked = await prisma.outlet.findFirst({
      where: { id: addr.outletId, businessAccountId },
      select: { id: true },
    });
    if (linked) return linked.id;
  }

  const outlets = await prisma.outlet.findMany({
    where: { businessAccountId },
    select: {
      id: true,
      placeId: true,
      latitude: true,
      longitude: true,
      pincode: true,
      addressLine: true,
    },
  });

  let match = outlets.find((o) => o.placeId && o.placeId === addr.placeId);
  if (!match && addr.latitude && addr.longitude) {
    match = outlets.find(
      (o) =>
        o.latitude != null &&
        o.longitude != null &&
        Math.abs(o.latitude - addr.latitude) < 0.0001 &&
        Math.abs(o.longitude - addr.longitude) < 0.0001,
    );
  }
  if (!match) {
    match = outlets.find(
      (o) => o.addressLine === addr.fullAddress && o.pincode === addr.pincode,
    );
  }
  if (match) {
    if (!addr.outletId) {
      await prisma.savedAddress.update({
        where: { id: addr.id },
        data: { outletId: match.id },
      });
    }
    return match.id;
  }

  const hasUsablePincode = !!addr.pincode && /^\d{6}$/.test(addr.pincode);
  const outlet = await prisma.outlet.create({
    data: {
      businessAccountId,
      name: addr.businessName || addr.label || 'Delivery Location',
      addressLine: addr.fullAddress,
      flatInfo: addr.flatInfo,
      landmark: addr.landmark,
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      latitude: addr.latitude,
      longitude: addr.longitude,
      placeId: addr.placeId,
      requiresAddressUpdate: !hasUsablePincode,
    },
  });

  await prisma.savedAddress.update({
    where: { id: addr.id },
    data: { outletId: outlet.id },
  });

  const account = await prisma.businessAccount.findUnique({
    where: { id: businessAccountId },
    select: { primaryOutletId: true },
  });
  if (!account?.primaryOutletId) {
    await prisma.businessAccount.update({
      where: { id: businessAccountId },
      data: { primaryOutletId: outlet.id },
    });
  }

  return outlet.id;
}

/**
 * Resolve storefront scope from session + saved delivery address.
 * Delivery cookie (h1_addr) / SavedAddress is preferred over JWT activeOutletId
 * so checkout stamps the outlet the buyer actually selected for delivery.
 * Throws if no delivery location can be determined.
 */
export async function resolveStorefrontContext(ctx: AuthContext): Promise<StorefrontContext> {
  const userId = effectiveCustomerUserId(ctx);
  const { role } = ctx;

  let businessAccountId = effectiveCustomerBusinessAccountId(ctx);
  if (!businessAccountId) {
    businessAccountId = await ensureBusinessAccountId(userId, role);
  }

  // Prefer h1_addr SavedAddress over JWT — cookie and JWT can disagree after
  // address-only or outlet-only switches.
  const savedAddr = await getSelectedSavedAddress(userId);
  if (savedAddr) {
    const outletId = await findOrCreateOutletForAddress(businessAccountId, savedAddr);
    return { userId, businessAccountId, outletId };
  }

  const jwtOutletId = ctx.impersonatedCustomer ? null : ctx.activeOutletId;
  if (jwtOutletId) {
    const ok = await prisma.outlet.findFirst({
      where: { id: jwtOutletId, businessAccountId },
      select: { id: true },
    });
    if (ok) return { userId, businessAccountId, outletId: jwtOutletId };
  }

  const account = await prisma.businessAccount.findUnique({
    where: { id: businessAccountId },
    select: {
      primaryOutletId: true,
      outlets: { select: { id: true }, orderBy: { createdAt: 'asc' }, take: 1 },
    },
  });
  const outletId = account?.primaryOutletId ?? account?.outlets[0]?.id ?? null;

  if (!outletId) {
    throw Errors.badRequest('Select a delivery address before placing orders.');
  }

  return { userId, businessAccountId, outletId };
}
