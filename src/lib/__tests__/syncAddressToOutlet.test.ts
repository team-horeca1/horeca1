import { describe, expect, it } from 'vitest';
import {
  accountCanManageOutlets,
  pickBuyerAccountForOutletSync,
  type OutletSyncAccount,
} from '@/lib/syncAddressToOutlet';

function account(partial: Partial<OutletSyncAccount> & { id: string }): OutletSyncAccount {
  return {
    isPrimary: false,
    primaryOutletId: null,
    outlets: [],
    ...partial,
  };
}

describe('accountCanManageOutlets', () => {
  it('allows restaurant / retail only', () => {
    expect(accountCanManageOutlets(account({ id: 'r', isCustomer: true, isVendor: false, isBrand: false }))).toBe(true);
    expect(accountCanManageOutlets(account({ id: 's', isCustomer: false, isVendor: true, isBrand: false }))).toBe(false);
    expect(accountCanManageOutlets(account({ id: 'b', isCustomer: false, isVendor: false, isBrand: true }))).toBe(false);
  });

  it('allows legacy callers that omit capability flags', () => {
    expect(accountCanManageOutlets(account({ id: 'legacy' }))).toBe(true);
  });
});

describe('pickBuyerAccountForOutletSync', () => {
  const restaurant = account({
    id: 'rest',
    isCustomer: true,
    isVendor: false,
    isBrand: false,
    isPrimary: true,
  });
  const supplier = account({
    id: 'sup',
    isCustomer: false,
    isVendor: true,
    isBrand: false,
  });

  it('keeps the current restaurant', () => {
    expect(pickBuyerAccountForOutletSync([supplier, restaurant], restaurant)?.id).toBe('rest');
  });

  it('does not treat a supplier as the current outlet owner', () => {
    expect(pickBuyerAccountForOutletSync([supplier, restaurant], supplier)?.id).toBe('rest');
  });

  it('returns null when there is no restaurant', () => {
    expect(pickBuyerAccountForOutletSync([supplier], supplier)).toBeNull();
  });
});
