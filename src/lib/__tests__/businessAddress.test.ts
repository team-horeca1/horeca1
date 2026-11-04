import { describe, expect, it } from 'vitest';
import {
  EMPTY_BUSINESS_ADDRESS,
  addressesEqual,
  billingOf,
  effectiveDelivery,
  fromBillingAndPickup,
  fromSingleAddress,
  stateSelectOptions,
  toBrandBillingPayload,
  toVendorFlatPayload,
  toVendorNestedPayload,
  toVendorProfilePatch,
  withSameAsBillingSync,
} from '@/lib/businessAddress';
import { INDIAN_STATES } from '@/lib/constants/customerProfile';

describe('businessAddress', () => {
  it('defaults sameAsBilling to true on empty', () => {
    expect(EMPTY_BUSINESS_ADDRESS.sameAsBilling).toBe(true);
  });

  it('fromBillingAndPickup marks same when pickup empty', () => {
    const v = fromBillingAndPickup(
      { addressLine: 'Plot 1', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
      {},
    );
    expect(v.sameAsBilling).toBe(true);
    expect(effectiveDelivery(v)).toEqual(billingOf(v));
  });

  it('fromBillingAndPickup unchecks same when pickup differs', () => {
    const v = fromBillingAndPickup(
      { addressLine: 'Plot 1', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
      { addressLine: 'Godown 9', city: 'Thane', state: 'Maharashtra', pincode: '400601' },
    );
    expect(v.sameAsBilling).toBe(false);
    expect(v.addressLine).toBe('Godown 9');
    expect(v.billingAddressLine).toBe('Plot 1');
  });

  it('withSameAsBillingSync copies billing into delivery', () => {
    const synced = withSameAsBillingSync({
      ...EMPTY_BUSINESS_ADDRESS,
      billingAddressLine: 'A',
      billingCity: 'B',
      billingState: 'Maharashtra',
      billingPincode: '400001',
      sameAsBilling: true,
      addressLine: 'old',
      city: 'old',
      state: 'old',
      pincode: '000000',
    });
    expect(synced.addressLine).toBe('A');
    expect(synced.city).toBe('B');
    expect(synced.pincode).toBe('400001');
  });

  it('toVendorNestedPayload and flat payload stay aligned', () => {
    const v = fromBillingAndPickup(
      { addressLine: 'Bill St', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
      { addressLine: 'Pick St', city: 'Nashik', state: 'Maharashtra', pincode: '422001' },
    );
    const nested = toVendorNestedPayload(v);
    const flat = toVendorFlatPayload(v);
    expect(nested.billingAddress.addressLine).toBe(flat.addressLine);
    expect(nested.pickupAddress.addressLine).toBe(flat.pickupAddressLine);
    expect(nested.primaryOutlet.pincode).toBe(flat.pickupPincode);
  });

  it('toVendorProfilePatch dual-writes flat and nested', () => {
    const patch = toVendorProfilePatch(
      fromBillingAndPickup(
        { addressLine: 'X', city: 'Y', state: 'Goa', pincode: '403001' },
        { addressLine: 'X', city: 'Y', state: 'Goa', pincode: '403001' },
      ),
    );
    expect(patch.billingAddressLine).toBe('X');
    expect((patch.billingAddress as { city: string }).city).toBe('Y');
    expect(patch.pickupPincode).toBe('403001');
  });

  it('toBrandBillingPayload mirrors billing into dual keys', () => {
    const payload = toBrandBillingPayload(
      fromSingleAddress(
        { addressLine: 'HQ', city: 'Delhi', state: 'Delhi', pincode: '110001' },
        { locationName: 'Delhi HQ' },
      ),
    );
    expect(payload.addressLine).toBe('HQ');
    expect(payload.billingAddressLine).toBe('HQ');
    expect(payload.billingCity).toBe('Delhi');
    expect(payload.outletName).toBe('Delhi HQ');
  });

  it('addressesEqual is trim-aware', () => {
    expect(
      addressesEqual(
        { addressLine: ' A ', city: 'B', state: 'C', pincode: '400001' },
        { addressLine: 'A', city: 'B', state: 'C', pincode: '400001' },
      ),
    ).toBe(true);
  });

  it('stateSelectOptions prepends custom saved state', () => {
    const opts = stateSelectOptions('Custom Territory');
    expect(opts[0]).toBe('Custom Territory');
    expect(opts).toContain(INDIAN_STATES[0]);
  });
});
