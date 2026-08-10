/** Shared product unit enums used by vendor, admin, and brand product forms. */

export const UNIT_OPTIONS = [
  'kg',
  'g',
  'ml',
  'L',
  'piece',
  'pack',
  'box',
  'dozen',
  'case',
  'bag',
  'bottle',
  'can',
  'carton',
  'tray',
] as const;

export const WEIGHT_UNIT_OPTIONS = ['kg', 'g', 'lbs'] as const;

export const DIMENSION_UNIT_OPTIONS = ['cm', 'mm', 'inch'] as const;

export type ProductUnit = (typeof UNIT_OPTIONS)[number];
export type WeightUnit = (typeof WEIGHT_UNIT_OPTIONS)[number];
export type DimensionUnit = (typeof DIMENSION_UNIT_OPTIONS)[number];
