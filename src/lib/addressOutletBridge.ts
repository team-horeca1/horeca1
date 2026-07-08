/**
 * Bridge between SavedAddress rows and Outlet rows for the customer storefront.
 * Active business accounts treat outlets as delivery locations; this keeps list,
 * edit, and delete APIs consistent whether the client holds a SavedAddress id
 * or an Outlet id.
 */
import type { Outlet, SavedAddress } from '@prisma/client';
import { hasUsableDeliveryLocation } from '@/lib/addressUsability';

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

export function mapOutletToUnifiedAddress(
  outlet: Outlet,
  saved: SavedAddress | null | undefined,
  primaryOutletId: string | null,
): UnifiedAddressDto {
  const outletName = outlet.name;
  const savedLabel = saved?.label;
  const label =
    savedLabel && savedLabel !== outletName
      ? savedLabel
      : 'Business';

  return {
    id: saved?.id ?? outlet.id,
    outletId: outlet.id,
    label,
    businessName: outletName,
    fullAddress: saved?.fullAddress ?? outlet.addressLine,
    shortAddress:
      saved?.shortAddress
      ?? outlet.addressLine.split(',').slice(0, 2).join(', '),
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
