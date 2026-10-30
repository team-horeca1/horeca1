import { describe, expect, it } from 'vitest';
import { defaultOutletName, isSyntheticOutletName } from '@/lib/constants/customerProfile';

describe('isSyntheticOutletName', () => {
  it('treats blank and short names as not captured', () => {
    expect(isSyntheticOutletName(null)).toBe(true);
    expect(isSyntheticOutletName('')).toBe(true);
    expect(isSyntheticOutletName(' A ')).toBe(true);
  });

  it('treats legacy auto-generated Main names as synthetic', () => {
    expect(isSyntheticOutletName(defaultOutletName('Vashi', ''))).toBe(true);
    expect(isSyntheticOutletName('Rockville Bar & Diner — Main')).toBe(true);
    expect(isSyntheticOutletName('Primary Outlet')).toBe(true);
    expect(isSyntheticOutletName('Branch Outlet')).toBe(true);
  });

  it('accepts a typed branch name', () => {
    expect(isSyntheticOutletName('Rockville Vashi Branch')).toBe(false);
    expect(isSyntheticOutletName('Central Kitchen')).toBe(false);
  });
});
