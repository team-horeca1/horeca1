import { describe, expect, it } from 'vitest';
import {
  defaultOutletName,
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

  it('treats Main-style names as synthetic until stripped', () => {
    expect(isSyntheticOutletName(null)).toBe(true);
    expect(isSyntheticOutletName('')).toBe(true);
    expect(isSyntheticOutletName('Vashi — Main')).toBe(true);
    expect(isSyntheticOutletName('Primary Outlet')).toBe(true);
    expect(isSyntheticOutletName('Branch Outlet')).toBe(true);
    expect(isSyntheticOutletName('Main Outlet')).toBe(true);
    expect(isSyntheticOutletName('Rockville Vashi Branch')).toBe(false);
    expect(isSyntheticOutletName('Vashi')).toBe(false);
  });

  it('normalizeOutletName heals Main into a plain outlet label', () => {
    expect(normalizeOutletName('Vashi — Main')).toBe('Vashi');
    expect(normalizeOutletName('Anees — Main')).toBe('Anees');
    expect(normalizeOutletName('Primary Outlet')).toBe('');
    expect(normalizeOutletName('Central Kitchen')).toBe('Central Kitchen');
  });
});
