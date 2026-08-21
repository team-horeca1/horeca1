import { describe, expect, it } from 'vitest';
import {
  resolveSellableDisplayName,
  resolveSellableImages,
} from '@/lib/productDisplayIdentity';

describe('resolveSellableDisplayName (QA-03)', () => {
  it('keeps vendor SKU name when brand master name differs', () => {
    expect(resolveSellableDisplayName('Fresh Onions')).toBe('Fresh Onions');
  });

  it('does not fall back to brand master when vendor name is present', () => {
    expect(resolveSellableDisplayName('Alphonso Mangoes')).toBe(
      'Alphonso Mangoes',
    );
  });

  it('trims whitespace', () => {
    expect(resolveSellableDisplayName('  Potatoes  ')).toBe('Potatoes');
  });
});

describe('resolveSellableImages (QA-03)', () => {
  it('prefers supplier images over brand master', () => {
    const result = resolveSellableImages(['/images/onion.png'], {
      imageUrl: 'https://cdn.example/flour.png',
    });
    expect(result.images).toEqual(['/images/onion.png']);
    expect(result.usedBrandFallback).toBe(false);
  });

  it('falls back to brand master only when supplier has no media', () => {
    const result = resolveSellableImages([], {
      imageUrl: 'https://cdn.example/flour.png',
    });
    expect(result.images).toEqual(['https://cdn.example/flour.png']);
    expect(result.usedBrandFallback).toBe(true);
  });
});
