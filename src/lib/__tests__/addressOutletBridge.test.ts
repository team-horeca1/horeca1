import { describe, expect, it } from 'vitest';
import { mapOutletToUnifiedAddress } from '@/lib/addressOutletBridge';
import type { Outlet, SavedAddress } from '@prisma/client';

function outlet(partial: Partial<Outlet>): Outlet {
  return {
    id: 'out-1',
    businessAccountId: 'ba-1',
    name: 'VASHI KITCHEN',
    code: null,
    addressLine: 'VASHI NAKA',
    flatInfo: null,
    landmark: null,
    city: 'Thane',
    state: 'Maharashtra',
    pincode: '400703',
    latitude: null,
    longitude: null,
    placeId: null,
    billingName: 'BIKANER',
    requiresAddressUpdate: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as Outlet;
}

function saved(partial: Partial<SavedAddress>): SavedAddress {
  return {
    id: 'sa-1',
    userId: 'u-1',
    outletId: 'out-1',
    label: 'Business',
    businessName: 'VASHI KITCHEN',
    fullAddress: 'Pincode 400703 — street later',
    shortAddress: 'Pincode 400703 — street later',
    flatInfo: null,
    landmark: null,
    city: 'Thane',
    state: 'Maharashtra',
    pincode: '400703',
    latitude: 0,
    longitude: 0,
    placeId: null,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as SavedAddress;
}

describe('mapOutletToUnifiedAddress', () => {
  it('prefers a real outlet street over a signup placeholder saved row', () => {
    const dto = mapOutletToUnifiedAddress(
      outlet({ addressLine: 'VASHI NAKA' }),
      saved({ fullAddress: 'Pincode 400703 — street later' }),
      'out-1',
      'BIKANER',
    );
    expect(dto.fullAddress).toBe('VASHI NAKA');
    expect(dto.label).toBe('VASHI KITCHEN');
    expect(dto.businessName).toBe('BIKANER');
  });

  it('does not show Business as the outlet name', () => {
    const dto = mapOutletToUnifiedAddress(
      outlet({ name: 'Business', billingName: null }),
      saved({ label: 'Business', businessName: 'BIKANER' }),
      'out-1',
      'BIKANER',
    );
    expect(dto.label).not.toBe('Business');
    expect(dto.businessName).toBe('BIKANER');
  });

  it('keeps THANE NAKA when opening edit (not blanked by placeholder logic)', () => {
    const dto = mapOutletToUnifiedAddress(
      outlet({
        name: 'THANE KITCHEN',
        addressLine: 'THANE NAKA',
        pincode: '400708',
      }),
      null,
      'out-1',
      'BIKANER',
    );
    expect(dto.fullAddress).toBe('THANE NAKA');
    expect(dto.label).toBe('THANE KITCHEN');
  });
});
