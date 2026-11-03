import { describe, expect, it } from 'vitest';
import {
  defaultOutletName,
  isRealStreetAddress,
  isSyntheticOutletName,
  normalizeOutletName,
  stripLegacyMainOutletSuffix,
} from '@/lib/constants/customerProfile';

describe('outlet name — no Main', () => {
  it('defaultOutletName no longer appends Main', () => {
    expect(defaultOutletName('Vashi', '')).toBe('Vashi');
    expect(defaultOutletName('', 'Legal Co')).toBe('Legal Co');
    expect(defaultOutletName('', '')).toBe('');
  });

  it('strips legacy Main suffixes', () => {
    expect(stripLegacyMainOutletSuffix('Vashi — Main')).toBe('Vashi');
    expect(stripLegacyMainOutletSuffix('Rockville Bar & Diner - Main')).toBe('Rockville Bar & Diner');
    expect(stripLegacyMainOutletSuffix('Primary Outlet')).toBe('');
    expect(stripLegacyMainOutletSuffix('Main Outlet')).toBe('');
    expect(stripLegacyMainOutletSuffix('Central Kitchen')).toBe('Central Kitchen');
  });

  it('treats blank/exact placeholders as synthetic; heals legacy Main as real', () => {
    expect(isSyntheticOutletName(null)).toBe(true);
    expect(isSyntheticOutletName('')).toBe(true);
    // Legacy auto-suffix — real business label remains after strip.
    expect(isSyntheticOutletName('Vashi — Main')).toBe(false);
    expect(isSyntheticOutletName('Eat Repeat — Main')).toBe(false);
    expect(isSyntheticOutletName('Primary Outlet')).toBe(true);
    expect(isSyntheticOutletName('Branch Outlet')).toBe(true);
    expect(isSyntheticOutletName('Main Outlet')).toBe(true);
    expect(isSyntheticOutletName('Main')).toBe(true);
    expect(isSyntheticOutletName('Rockville Vashi Branch')).toBe(false);
    expect(isSyntheticOutletName('Vashi')).toBe(false);
  });

  it('treats a saved street as real and ignores signup placeholders', () => {
    expect(isRealStreetAddress(null)).toBe(false);
    expect(isRealStreetAddress('')).toBe(false);
    expect(isRealStreetAddress('Address pending — complete in account settings')).toBe(false);
    expect(isRealStreetAddress('Address not set')).toBe(false);
    expect(isRealStreetAddress('Pincode 400703 — street later')).toBe(false);
    expect(isRealStreetAddress('3XGR+2WX, Jambul Marg')).toBe(true);
    expect(isRealStreetAddress('Shop 4, Jambul Marg, Vashi')).toBe(true);
  });

  it('normalizeOutletName heals Main into a plain outlet label', () => {
    expect(normalizeOutletName('Vashi — Main')).toBe('Vashi');
    expect(normalizeOutletName('Anees — Main')).toBe('Anees');
    expect(normalizeOutletName('Primary Outlet')).toBe('');
    expect(normalizeOutletName('Central Kitchen')).toBe('Central Kitchen');
  });
});
