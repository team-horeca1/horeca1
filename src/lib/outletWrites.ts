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
 */

import type { Prisma, Outlet } from '@prisma/client';
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
      data: addressData,
    });
    return { outlet, adopted: true };
  }

  const outlet = await tx.outlet.create({
    data: {
      businessAccountId,
      name: fields.name,
      code: fields.code ?? null,
      ...addressData,
    },
  });
  return { outlet, adopted: false };
}
