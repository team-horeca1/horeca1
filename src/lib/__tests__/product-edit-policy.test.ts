import { describe, it, expect } from 'vitest';
import { detectMaterialChanges, isTaxPercentMaterial } from '../product-edit-policy';

describe('detectMaterialChanges', () => {
  const defaultProduct = {
    name: 'Amul Processed Cheese Block ETG 1 Kg',
    brand: 'Amul',
    hsn: '0406',
    packSize: '1 Kg',
    unit: 'Kg',
    vegNonVeg: 'veg' as const,
    masterProductId: '9f639bc8-f708-44af-8a22-6533fac9e4fd',
    categoryId: 'cheese-id-123',
    imageUrl: 'https://example.com/cheese.jpg',
    images: ['https://example.com/cheese.jpg'],
  };

  const defaultCategoryIds = ['cheese-id-123', 'dairy-id-456'];

  it('does not treat vegNonVeg as material', () => {
    const result = detectMaterialChanges(defaultProduct, defaultCategoryIds, {
      vegNonVeg: 'nonveg',
    });
    expect(result.hasMaterialChanges).toBe(false);
    expect(result.materialPayload.vegNonVeg).toBeUndefined();
  });

  it('does not treat brand/name/hsn/pack/unit as material', () => {
    const result = detectMaterialChanges(defaultProduct, defaultCategoryIds, {
      brand: 'Other Brand',
      name: 'Totally Different Name',
      hsn: '9999',
      packSize: '500 g',
      unit: 'g',
      masterProductId: 'other-master-id',
    });
    expect(result.hasMaterialChanges).toBe(false);
    expect(result.materialPayload).toEqual({});
  });

  it('does not treat primary category change as material', () => {
    const result = detectMaterialChanges(
      defaultProduct,
      defaultCategoryIds,
      {},
      ['milk-id-999', 'dairy-id-456'],
    );
    expect(result.hasMaterialChanges).toBe(false);
    expect(result.materialPayload.categoryIds).toBeUndefined();
  });

  it('detects no material changes when category list adds or removes additional categories but primary stays the same', () => {
    const resultAdd = detectMaterialChanges(defaultProduct, defaultCategoryIds, {}, [
      'cheese-id-123',
      'dairy-id-456',
      'food-id-789',
    ]);
    expect(resultAdd.hasMaterialChanges).toBe(false);

    const resultRemove = detectMaterialChanges(defaultProduct, defaultCategoryIds, {}, [
      'cheese-id-123',
    ]);
    expect(resultRemove.hasMaterialChanges).toBe(false);
  });

  it('detects material change when imageUrl changes', () => {
    const result = detectMaterialChanges(defaultProduct, defaultCategoryIds, {
      imageUrl: 'https://example.com/cheese-new.jpg',
    });
    expect(result.hasMaterialChanges).toBe(true);
    expect(result.materialPayload.imageUrl).toBe('https://example.com/cheese-new.jpg');
  });

  it('detects material change when images list changes', () => {
    const result = detectMaterialChanges(defaultProduct, defaultCategoryIds, {
      images: ['https://example.com/cheese.jpg', 'https://example.com/cheese-extra.jpg'],
    });
    expect(result.hasMaterialChanges).toBe(true);
    expect(result.materialPayload.images).toEqual([
      'https://example.com/cheese.jpg',
      'https://example.com/cheese-extra.jpg',
    ]);
  });

  it('detects no material change on image fields if they are not provided in incoming payload', () => {
    const result = detectMaterialChanges(defaultProduct, defaultCategoryIds, {
      description: 'new description',
      vegNonVeg: 'egg',
    });
    expect(result.hasMaterialChanges).toBe(false);
  });

  it('isTaxPercentMaterial always returns false', () => {
    expect(isTaxPercentMaterial({ taxPercent: 18, hsn: '0406' }, { hsn: '0406' })).toBe(false);
  });
});
