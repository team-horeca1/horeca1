import { describe, it, expect } from 'vitest';
import { slugify, buildProductSlugBase, mintUniqueImportSlug } from '../productSlug';

describe('productSlug', () => {
  it('slugify cleans strings properly', () => {
    expect(slugify('Amul Butter 500g Pack!')).toBe('amul-butter-500g-pack');
    expect(slugify('  Spécial   Characters--Test  ')).toBe('spcial-characters-test');
    expect(slugify('')).toBe('');
  });

  it('buildProductSlugBase constructs store-product-name-sku', () => {
    const slug = buildProductSlugBase('Dairy Direct', 'Amul Butter 500g', 'AMUL-BTR-500');
    expect(slug).toBe('dairy-direct-amul-butter-500g-amul-btr-500');
  });

  it('buildProductSlugBase works when store or sku is absent', () => {
    expect(buildProductSlugBase(null, 'Amul Butter 500g', 'AMUL-BTR-500')).toBe('amul-butter-500g-amul-btr-500');
    expect(buildProductSlugBase('Dairy Direct', 'Amul Butter 500g', null)).toBe('dairy-direct-amul-butter-500g');
    expect(buildProductSlugBase(null, 'Amul Butter 500g', null)).toBe('amul-butter-500g');
  });

  it('mintUniqueImportSlug auto-increments -1, -2 for repeat products', () => {
    const used = new Set<string>();
    const s1 = mintUniqueImportSlug(used, 'Store A', 'Cheese Block 1kg', 'CHS-1');
    const s2 = mintUniqueImportSlug(used, 'Store A', 'Cheese Block 1kg', 'CHS-1');
    const s3 = mintUniqueImportSlug(used, 'Store A', 'Cheese Block 1kg', 'CHS-1');

    expect(s1).toBe('store-a-cheese-block-1kg-chs-1');
    expect(s2).toBe('store-a-cheese-block-1kg-chs-1-1');
    expect(s3).toBe('store-a-cheese-block-1kg-chs-1-2');
  });

  it('keeps length <= 255 characters even with large names and increment suffixes', () => {
    const hugeName = 'A'.repeat(300);
    const hugeSku = 'B'.repeat(100);
    const used = new Set<string>();
    const s1 = mintUniqueImportSlug(used, 'Store', hugeName, hugeSku);
    const s2 = mintUniqueImportSlug(used, 'Store', hugeName, hugeSku);

    expect(s1.length).toBeLessThanOrEqual(255);
    expect(s2.length).toBeLessThanOrEqual(255);
    expect(s1).not.toBe(s2);
  });
});
