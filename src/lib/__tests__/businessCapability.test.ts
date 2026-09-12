import { describe, expect, it } from 'vitest';
import {
  SUPPLIER_HUB_PATH,
  supplierDashboardPath,
  supplierLandingPath,
} from '@/lib/businessCapability';

describe('supplierDashboardPath', () => {
  it('sends several supplier businesses to the picker', () => {
    expect(supplierDashboardPath(['biz-a', 'biz-b'])).toBe(SUPPLIER_HUB_PATH);
  });

  it('opens the single supplier business store list', () => {
    expect(supplierDashboardPath(['biz-only'])).toBe(supplierLandingPath('biz-only'));
    expect(supplierDashboardPath(['biz-only'])).toBe('/vendor/businesses/biz-only');
  });

  it('falls back to the picker when ids are missing', () => {
    expect(supplierDashboardPath([])).toBe(SUPPLIER_HUB_PATH);
    expect(supplierDashboardPath([null, '', undefined])).toBe(SUPPLIER_HUB_PATH);
  });
});
