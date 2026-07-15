/**
 * Shared outlet write logic for customer self-serve address paths.
 *
 * A freshly-provisioned customer (see provisionDefaultAccount) gets a
 * placeholder primary Outlet: requiresAddressUpdate=true and
 * addressLine=PLACEHOLDER_OUTLET_ADDRESS. The first real address the user adds
 * — from the map picker, checkout, or the navbar location overlay — should
 * *become* that primary outlet, not spawn a second outlet that leaves the
 * primary stuck "Address needed / INACTIVE". Once the primary is filled,
 * subsequent adds create genuine extra branches.
 *
 * Both POST /api/v1/addresses and POST /api/v1/account/[id]/outlets route
 * through adoptOrCreateOutlet so they stay consistent.
 *
 * Duplicate same-location creates (multi-click Add / Confirm) are blocked by
 * matching placeId, addressLine+pincode, or near-identical lat/lng — including
 * reactivating a previously soft-removed outlet at the same location.
 */

import type { Prisma, Outlet } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { PLACEHOLDER_OUTLET_ADDRESS } from '@/lib/constants/customerProfile';
import { hasUsableDeliveryLocation } from '@/lib/addressUsability';

export interface OutletAddressFields {
  name: string;
  code?: string | null;
  addressLine: string;
  flatInfo?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
}

const COORD_EPS = 0.0001;

function normLine(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normPin(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '').slice(0, 6);
}

function sameLocation(
  a: {
    placeId?: string | null;
    addressLine?: string | null;
    pincode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  b: OutletAddressFields,
): boolean {
  const placeA = (a.placeId ?? '').trim();
  const placeB = (b.placeId ?? '').trim();
  if (placeA && placeB && placeA === placeB) return true;

  const pinA = normPin(a.pincode);
  const pinB = normPin(b.pincode);
  const lineA = normLine(a.addressLine);
  const lineB = normLine(b.addressLine);
  if (lineA && lineB && lineA === lineB && pinA && pinB && pinA === pinB) return true;

  if (
    a.latitude != null && a.longitude != null
    && b.latitude != null && b.longitude != null
    && Math.abs(a.latitude - b.latitude) < COORD_EPS
    && Math.abs(a.longitude - b.longitude) < COORD_EPS
  ) {
    return true;
  }
  return false;
}

function locationDedupeKey(o: {
  placeId?: string | null;
  addressLine?: string | null;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string | null {
  const place = (o.placeId ?? '').trim();
  if (place) return `place:${place}`;
  const line = normLine(o.addressLine);
  const pin = normPin(o.pincode);
  if (line && pin) return `line:${line}|${pin}`;
  if (o.latitude != null && o.longitude != null) {
    return `coord:${o.latitude.toFixed(4)},${o.longitude.toFixed(4)}`;
  }
  return null;
}

/**
 * Fill the account's empty placeholder primary outlet with this address, or
 * create a new branch outlet when the primary is already set up.
 *
 * When adopting, the primary outlet's existing name is preserved (it's the
 * business's main branch identity) — only the address is synced in.
 *
 * Must run inside a transaction so the caller can keep the linked SavedAddress
 * in sync atomically.
 */
export async function adoptOrCreateOutlet(
  tx: Prisma.TransactionClient,
  businessAccountId: string,
  fields: OutletAddressFields,
): Promise<{ outlet: Outlet; adopted: boolean }> {
  const addressData = {
    addressLine: fields.addressLine,
    flatInfo: fields.flatInfo ?? null,
    landmark: fields.landmark ?? null,
    city: fields.city ?? null,
    state: fields.state ?? null,
    pincode: fields.pincode ?? null,
    latitude: fields.latitude ?? null,
    longitude: fields.longitude ?? null,
    placeId: fields.placeId ?? null,
    requiresAddressUpdate: !hasUsableDeliveryLocation(fields),
  };

  const account = await tx.businessAccount.findUnique({
    where: { id: businessAccountId },
    select: { primaryOutletId: true },
  });

  // Only the still-empty placeholder primary is eligible for adoption. Keying on
  // the placeholder addressLine (not just requiresAddressUpdate) guarantees we
  // never overwrite an outlet that already has a real address but lacks a
  // serviceable pincode.
  const placeholderPrimary = account?.primaryOutletId
    ? await tx.outlet.findFirst({
        where: {
          id: account.primaryOutletId,
          businessAccountId,
          requiresAddressUpdate: true,
          addressLine: PLACEHOLDER_OUTLET_ADDRESS,
        },
        select: { id: true },
      })
    : null;

  if (placeholderPrimary) {
    const outlet = await tx.outlet.update({
      where: { id: placeholderPrimary.id },
      data: { ...addressData, isActive: true },
    });
    return { outlet, adopted: true };
  }

  const candidates = await tx.outlet.findMany({
    where: { businessAccountId },
    orderBy: { createdAt: 'asc' },
  });

  const activeMatch = candidates.find((o) => o.isActive && sameLocation(o, fields));
  if (activeMatch) {
    const outlet = await tx.outlet.update({
      where: { id: activeMatch.id },
      data: addressData,
    });
    return { outlet, adopted: true };
  }

  const inactiveMatch = candidates.find((o) => !o.isActive && sameLocation(o, fields));
  if (inactiveMatch) {
    const outlet = await tx.outlet.update({
      where: { id: inactiveMatch.id },
      data: {
        ...addressData,
        isActive: true,
        // Keep existing branch name unless caller provided a meaningful one
        ...(fields.name.trim() ? { name: fields.name.trim() } : {}),
        ...(fields.code !== undefined ? { code: fields.code ?? null } : {}),
      },
    });
    return { outlet, adopted: true };
  }

  const outlet = await tx.outlet.create({
    data: {
      businessAccountId,
      name: fields.name,
      code: fields.code ?? null,
      isActive: true,
      ...addressData,
    },
  });
  return { outlet, adopted: false };
}

/**
 * Soft-deactivate duplicate active outlets for one BA (same placeId / address+pin /
 * coords). Keeps primary when present, else the oldest. Idempotent.
 */
export async function softDeactivateDuplicateActiveOutlets(
  businessAccountId: string,
): Promise<number> {
  const account = await prisma.businessAccount.findUnique({
    where: { id: businessAccountId },
    select: { primaryOutletId: true },
  });
  const primaryId = account?.primaryOutletId ?? null;

  const active = await prisma.outlet.findMany({
    where: { businessAccountId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      placeId: true,
      addressLine: true,
      pincode: true,
      latitude: true,
      longitude: true,
      createdAt: true,
    },
  });

  const keepByKey = new Map<string, string>();
  const toDeactivate: string[] = [];

  for (const o of active) {
    const key = locationDedupeKey(o);
    if (!key) continue;
    const existing = keepByKey.get(key);
    if (!existing) {
      keepByKey.set(key, o.id);
      continue;
    }
    if (primaryId && o.id === primaryId) {
      toDeactivate.push(existing);
      keepByKey.set(key, o.id);
    } else if (primaryId && existing === primaryId) {
      toDeactivate.push(o.id);
    } else {
      toDeactivate.push(o.id);
    }
  }

  if (toDeactivate.length === 0) return 0;

  await prisma.outlet.updateMany({
    where: { id: { in: toDeactivate }, businessAccountId },
    data: { isActive: false },
  });
  return toDeactivate.length;
}
