/**
 * Bridge between SavedAddress rows and Outlet rows for the customer storefront.
 * Active business accounts treat outlets as delivery locations; this keeps list,
 * edit, and delete APIs consistent whether the client holds a SavedAddress id
 * or an Outlet id.
 */
import type { Outlet, SavedAddress } from '@prisma/client';
import { hasUsableDeliveryLocation } from '@/lib/addressUsability';
import {
  isRealStreetAddress,
  isSyntheticOutletName,
  normalizeOutletName,
} from '@/lib/constants/customerProfile';

export interface UnifiedAddressDto {
  id: string;
  outletId: string;
  label: string;
  businessName: string;
  fullAddress: string;
  shortAddress: string;
  flatInfo?: string;
  landmark?: string;
  pincode?: string;
  city?: string;
  state?: string;
  latitude: number;
  longitude: number;
  placeId?: string;
  isDefault: boolean;
}

/**
 * Map outlet (+ optional saved row) into the storefront/admin edit form shape.
 * Outlet name → label. Billing name → businessName.
 * Prefer a real street from the outlet when the saved row is still a signup placeholder.
 */
export function mapOutletToUnifiedAddress(
  outlet: Outlet,
  saved: SavedAddress | null | undefined,
  primaryOutletId: string | null,
  accountLegalName?: string | null,
): UnifiedAddressDto {
  const rawOutletName = (outlet.name || '').trim();
  const healedOutletName =
    normalizeOutletName(rawOutletName)
    || (!isSyntheticOutletName(saved?.label) && saved?.label !== 'Business'
      ? (saved?.label || '').trim()
      : '')
    || '';
  const billingName =
    (outlet.billingName || '').trim()
    || (saved?.businessName || '').trim()
    || (accountLegalName || '').trim()
    || healedOutletName;

  const savedLine = (saved?.fullAddress || '').trim();
  const outletLine = (outlet.addressLine || '').trim();
  // Prefer a real street from either side. Never prefer a signup placeholder
  // over a typed outlet.addressLine (that was blanking the edit form).
  const fullAddress =
    isRealStreetAddress(outletLine, healedOutletName)
      ? outletLine
      : isRealStreetAddress(savedLine, healedOutletName)
        ? savedLine
        : outletLine && !savedLine
          ? outletLine
          : savedLine || outletLine;

  const shortAddress =
    saved?.shortAddress
    && isRealStreetAddress(saved.fullAddress, healedOutletName)
      ? saved.shortAddress
      : fullAddress.split(',').slice(0, 2).join(', ');

  return {
    id: saved?.id ?? outlet.id,
    outletId: outlet.id,
    // Form binds outlet name ← label (never the literal "Business").
    label: healedOutletName || 'Outlet',
    // Form binds billing name ← businessName.
    businessName: billingName,
    fullAddress,
    shortAddress,
    flatInfo: saved?.flatInfo ?? outlet.flatInfo ?? undefined,
    landmark: saved?.landmark ?? outlet.landmark ?? undefined,
    pincode: saved?.pincode ?? outlet.pincode ?? undefined,
    city: saved?.city ?? outlet.city ?? undefined,
    state: saved?.state ?? outlet.state ?? undefined,
    latitude: saved?.latitude ?? outlet.latitude ?? 0,
    longitude: saved?.longitude ?? outlet.longitude ?? 0,
    placeId: saved?.placeId ?? outlet.placeId ?? undefined,
    isDefault: outlet.id === primaryOutletId,
  };
}

export function outletRequiresAddressUpdate(outlet: {
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  requiresAddressUpdate: boolean;
}): boolean {
  return !hasUsableDeliveryLocation(outlet) && outlet.requiresAddressUpdate;
}
