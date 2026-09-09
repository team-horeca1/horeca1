/**
 * Brand profile constants — seeded from Profile Mastersheet CSV attribute master (rows 84–93).
 * Single source for cascading Brand Type → Sub-Type → Product Categories dropdowns.
 */

export const BUSINESS_SIZES = ['Small', 'Medium', 'Large', 'Enterprise'] as const;

export const DISTRIBUTION_PRESENCE_OPTIONS = [
  'Local',
  'Regional',
  'Metro Cities',
  'Pan India',
  'National',
] as const;

export const TARGET_SEGMENT_PRESETS = [
  'Premium Restaurants',
  'Fine Dine Restaurants',
  'Hotels + QSR',
  'QSR + Retail',
  'Cafes + Gyms',
  'Cloud Kitchens',
  'Modern Trade',
  'Consumer Focused',
  'Commercial Kitchens',
] as const;

export const BRAND_TIERS = ['Premium', 'Mid', 'Mass'] as const;

export const MARKETPLACE_VISIBILITY_OPTIONS = ['Public', 'Restricted'] as const;

export const BRAND_LEAD_STATUSES = ['Lead', 'Contacted', 'Active'] as const;

/** Brand types from attribute master (Level 2). */
export const BRAND_TYPES = [
  'D2C',
  'FMCG',
  'Import Brand',
  'HoReCa Specialist',
  'Retail Brand',
  'Private Label',
] as const;

export type BrandType = (typeof BRAND_TYPES)[number];

/** Dropdown sentinel — never persisted. Typed value is stored on Brand.brandType / subType. */
export const OTHER_OPTION = 'Other';

export const PROFILE_LABEL_MAX = 80;

export function isPresetBrandType(brandType: string): boolean {
  return (BRAND_TYPES as readonly string[]).includes(brandType);
}

export function isOtherSentinel(value: string): boolean {
  return value.trim().toLowerCase() === OTHER_OPTION.toLowerCase();
}

export function brandTypeSelectValue(brandType: string): string {
  if (!brandType) return '';
  if (isPresetBrandType(brandType)) return brandType;
  return OTHER_OPTION;
}

export function brandSubTypeSelectValue(brandType: string, subType: string): string {
  if (!subType) return '';
  const presets = subTypesForBrandType(brandType);
  if (presets.includes(subType)) return subType;
  return OTHER_OPTION;
}

/** Sub-types keyed by brand type (Level 3). */
export const SUB_TYPES_BY_TYPE: Record<string, readonly string[]> = {
  D2C: ['Food Brand', 'Beverage Brand'],
  FMCG: ['Snacks', 'Dairy'],
  'Import Brand': ['Japanese Ingredients', 'Italian Ingredients'],
  'HoReCa Specialist': ['Bakery Solutions'],
  'Retail Brand': ['Frozen Foods'],
  'Private Label': ['Cloud Kitchen Supply'],
};

/** Product category presets keyed by "BrandType|SubType" (Level 4). Maps to Brand.categories. */
export const PRODUCT_CATEGORIES_BY_SUBTYPE: Record<string, readonly string[]> = {
  'D2C|Food Brand': ['Sauces'],
  'D2C|Beverage Brand': ['Healthy Drinks', 'Beverages'],
  'FMCG|Snacks': ['National Brand', 'Frozen Snacks', 'Snacks'],
  'FMCG|Dairy': ['Cheese & Butter', 'Cheese + Butter', 'Dairy'],
  'Import Brand|Japanese Ingredients': ['Sushi Products', 'Japanese Ingredients'],
  'Import Brand|Italian Ingredients': ['Pasta & Olive Oil', 'Pasta + Olive Oil', 'Italian Ingredients'],
  'HoReCa Specialist|Bakery Solutions': ['Commercial Kitchens', 'Bakery Solutions'],
  'Retail Brand|Frozen Foods': ['Modern Trade', 'Frozen Foods'],
  'Private Label|Cloud Kitchen Supply': ['Bulk Packs', 'Commercial Packs', 'Bulk Kitchen Supply'],
};

/** Level-5 attribute hints from CSV (maps to brandTier presets). */
export const TIER_HINTS_BY_SUBTYPE: Record<string, readonly string[]> = {
  'D2C|Food Brand': ['Premium'],
  'D2C|Beverage Brand': ['Premium'],
  'FMCG|Snacks': ['Mass Market'],
  'FMCG|Dairy': ['HoReCa Focused'],
  'Import Brand|Japanese Ingredients': ['Premium'],
  'Import Brand|Italian Ingredients': ['Premium'],
  'HoReCa Specialist|Bakery Solutions': ['B2B'],
  'Retail Brand|Frozen Foods': ['Consumer Focused'],
  'Private Label|Cloud Kitchen Supply': ['B2B'],
};

export function subTypesForBrandType(brandType: string): readonly string[] {
  return SUB_TYPES_BY_TYPE[brandType] ?? [];
}

export function productCategoriesForSubType(brandType: string, subType: string): readonly string[] {
  return PRODUCT_CATEGORIES_BY_SUBTYPE[`${brandType}|${subType}`] ?? [];
}

export function tierHintsForSubType(brandType: string, subType: string): readonly string[] {
  return TIER_HINTS_BY_SUBTYPE[`${brandType}|${subType}`] ?? [];
}
