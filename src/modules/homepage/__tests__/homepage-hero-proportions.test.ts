import { describe, expect, it } from 'vitest';
import {
  HERO_FALLBACK,
  clampHeroPos,
  isSafeHeroHref,
  trimHeroCopy,
} from '@/modules/homepage/homepage-hero.constants';

describe('homepage-hero mobile and desktop geometry', () => {
  it('has mobile default Y offset at 16% so copy fits within 200px banner', () => {
    expect(HERO_FALLBACK.copyOffsetYMobile).toBe(16);
    expect(HERO_FALLBACK.copyOffsetXMobile).toBe(4);
  });

  it('keeps desktop default offsets intact', () => {
    expect(HERO_FALLBACK.copyOffsetX).toBe(4);
    expect(HERO_FALLBACK.copyOffsetY).toBe(58);
  });

  it('clamps positions between 0 and 100', () => {
    expect(clampHeroPos(-10)).toBe(0);
    expect(clampHeroPos(150)).toBe(100);
    expect(clampHeroPos(42.6)).toBe(43);
  });

  it('validates safe hero hrefs', () => {
    expect(isSafeHeroHref('/category')).toBe(true);
    expect(isSafeHeroHref('https://example.com/promo')).toBe(true);
    expect(isSafeHeroHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHeroHref('')).toBe(false);
  });

  it('trims whitespace but preserves internal newlines for multi-line banner copy', () => {
    expect(trimHeroCopy('  Line 1\nLine 2  ')).toBe('Line 1\nLine 2');
  });
});
