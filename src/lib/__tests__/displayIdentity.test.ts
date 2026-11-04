import { describe, expect, it } from 'vitest';
import {
  accountFacingName,
  buildOrderBillingSnapshot,
  buyerBillingName,
  formatAddressLines,
  formatAddressShort,
  outletTitle,
  parseOrderBillingSnapshot,
  supplierBillFrom,
  supplierShipFrom,
} from '@/lib/displayIdentity';
import { toCustomerOutletPayload, fromBillingAndPickup } from '@/lib/businessAddress';

describe('displayIdentity', () => {
  it('formatAddressLines includes flat, landmark, city, state, pin', () => {
    expect(formatAddressLines({
      flatInfo: 'Flat 2',
      addressLine: 'Street 1',
      landmark: 'Temple',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    })).toBe('Flat 2, Street 1, Near Temple, Mumbai, Maharashtra, 400001');
  });

  it('buyerBillingName prefers outlet override then legalName', () => {
    expect(buyerBillingName({
      outletBillingName: 'Kitchen Bill To',
      legalName: 'Legal Co',
      displayName: 'Trade',
    })).toBe('Kitchen Bill To');
    expect(buyerBillingName({
      legalName: 'Legal Co',
      displayName: 'Trade',
    })).toBe('Legal Co');
  });

  it('accountFacingName prefers display then legal', () => {
    expect(accountFacingName({ displayName: 'Trade', legalName: 'Legal' })).toBe('Trade');
    expect(accountFacingName({ legalName: 'Legal', fallback: 'Person' })).toBe('Legal');
  });

  it('outletTitle never prefers bare pincode over name', () => {
    expect(outletTitle({ name: 'Vashi', pincode: '400703' })).toBe('Vashi');
    expect(outletTitle({ pincode: '400703' })).toBe('PIN 400703');
  });

  it('supplierShipFrom falls back to billFrom when pickup empty', () => {
    const vendor = {
      addressLine: 'Reg St',
      city: 'Pune',
      state: 'Maharashtra',
      addressPincode: '411001',
    };
    expect(formatAddressShort(supplierBillFrom(vendor))).toContain('Reg St');
    expect(formatAddressShort(supplierShipFrom(vendor))).toContain('Reg St');
    expect(formatAddressShort(supplierShipFrom({
      ...vendor,
      pickupAddressLine: 'Godown',
      pickupCity: 'Thane',
      pickupState: 'Maharashtra',
      pickupPincode: '400601',
    }))).toContain('Godown');
  });

  it('billing snapshot round-trips', () => {
    const snap = buildOrderBillingSnapshot({
      buyerBillingName: 'Buyer Co',
      buyerGstin: '27AAAAA0000A1Z5',
      buyerBilling: { addressLine: 'Bill St', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
      supplierLegalName: 'Vendor Co',
      supplierGstin: '27BBBBB0000B1Z5',
      supplierBillFrom: { addressLine: 'Office', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
      supplierShipFrom: { addressLine: 'Wh', city: 'Thane', state: 'Maharashtra', pincode: '400601' },
    });
    const parsed = parseOrderBillingSnapshot(snap);
    expect(parsed?.buyer.billingName).toBe('Buyer Co');
    expect(parsed?.supplier.shipFrom.addressLine).toBe('Wh');
  });
});

describe('toCustomerOutletPayload', () => {
  it('keeps billing and delivery distinct and nulls billingName when equal to legal', () => {
    const value = fromBillingAndPickup(
      { addressLine: 'Bill St', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
      { addressLine: 'Del St', city: 'Thane', state: 'Maharashtra', pincode: '400601' },
      { locationName: 'Vashi', billingName: 'Legal Co' },
    );
    const payload = toCustomerOutletPayload(value, { accountLegalName: 'Legal Co' });
    expect(payload.companyProfile.billingAddressLine).toBe('Bill St');
    expect(payload.outlet.addressLine).toBe('Del St');
    expect(payload.outlet.billingName).toBeNull();
  });
});
