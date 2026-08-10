/**
 * Shared field list + deviation check for brand-master overrides.
 *
 * Mirrors the fields `applyBrandMasterOverride` paints onto the vendor product form.
 * Compare the incoming payload against the brand master (not the stored Product):
 * untouched form fields still equal the master; a field the vendor changed will differ.
 *
 * Price, MOQ, stock, credit, and featured flags are intentionally absent — those keep the link.
 */

export const BRAND_OVERRIDE_FIELDS = [
  'name',
  'description',
  'packSize',
  'unit',
  'hsn',
  'barcode',
  'fssaiRef',
  'vegNonVeg',
  'storageType',
  'shelfLifeDays',
  'countryOfOrigin',
  'tags',
  'aliasNames',
  'categoryIds',
  'imageUrl',
  'images',
  'packageWeight',
  'weightUnit',
  'packageLength',
  'packageWidth',
  'packageHeight',
  'dimensionUnit',
] as const;

export type BrandOverrideField = (typeof BRAND_OVERRIDE_FIELDS)[number];

const PACKAGING_FIELDS = [
  'packageWeight',
  'weightUnit',
  'packageLength',
  'packageWidth',
  'packageHeight',
  'dimensionUnit',
] as const satisfies readonly BrandOverrideField[];

type PackagingField = (typeof PACKAGING_FIELDS)[number];

/** Loose brand-master shape (API include, Prisma row, or form-held summary). */
export type BrandMasterForOverride = {
  name?: unknown;
  description?: unknown;
  packSize?: unknown;
  unit?: unknown;
  hsn?: unknown;
  barcode?: unknown;
  fssaiRef?: unknown;
  vegNonVeg?: unknown;
  storageType?: unknown;
  shelfLifeDays?: unknown;
  countryOfOrigin?: unknown;
  tags?: unknown;
  aliasNames?: unknown;
  categoryId?: unknown;
  categoryIds?: unknown;
  categoryRel?: { id?: unknown } | null;
  imageUrl?: unknown;
  images?: unknown;
  packageWeight?: unknown;
  weightUnit?: unknown;
  packageLength?: unknown;
  packageWidth?: unknown;
  packageHeight?: unknown;
  dimensionUnit?: unknown;
};

/** Coerce Prisma Decimal / number / non-empty string into a comparable form string. */
function scalarToFormString(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  // Prisma Decimal (and similar) expose toFixed.
  if (
    value != null &&
    typeof value === 'object' &&
    typeof (value as { toFixed?: unknown }).toFixed === 'function'
  ) {
    const s = String(value).trim();
    return s && s !== '[object Object]' ? s : '';
  }
  return '';
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function brandImages(bmp: BrandMasterForOverride): string[] {
  const masterImageList = Array.isArray(bmp.images)
    ? bmp.images.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : [];
  const masterImageUrl =
    typeof bmp.imageUrl === 'string' && bmp.imageUrl.trim() ? bmp.imageUrl.trim() : '';
  return masterImageList.length > 0 ? masterImageList : masterImageUrl ? [masterImageUrl] : [];
}

/**
 * Categories the brand actually overlays onto the form.
 * Only the multi-set is treated as an override — matching applyBrandMasterOverride's
 * "prefer brand multi-set" path. Primary categoryId alone is a fallback when the
 * form is empty and must not false-unlink products that already had their own set.
 */
function brandOverrideCategoryIds(bmp: BrandMasterForOverride): string[] {
  if (Array.isArray(bmp.categoryIds) && bmp.categoryIds.length > 0) {
    return bmp.categoryIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  }
  return [];
}

function packagingBag(payload: Record<string, unknown>): Record<string, unknown> | null {
  const meta = payload.metadata;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const packaging = (meta as Record<string, unknown>).packaging;
  if (!packaging || typeof packaging !== 'object' || Array.isArray(packaging)) return null;
  return packaging as Record<string, unknown>;
}

/**
 * Read an override field from a form-shaped payload or an API body
 * (packaging may live under metadata.packaging).
 * Returns `undefined` when the field was not supplied at all.
 */
function readPayloadField(
  payload: Record<string, unknown>,
  field: BrandOverrideField,
): unknown {
  if (PACKAGING_FIELDS.includes(field as PackagingField)) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      return payload[field];
    }
    const nested = packagingBag(payload);
    if (nested && Object.prototype.hasOwnProperty.call(nested, field)) {
      return nested[field];
    }
    return undefined;
  }
  if (!Object.prototype.hasOwnProperty.call(payload, field)) {
    return undefined;
  }
  return payload[field];
}

function normalizePayloadScalar(value: unknown): string {
  return scalarToFormString(value);
}

function normalizePayloadStringList(value: unknown): string[] {
  return stringList(value);
}

/**
 * Effective brand-master values that applyBrandMasterOverride would paint
 * (only non-empty / non-empty-array entries).
 */
function brandPaintedValues(
  bmp: BrandMasterForOverride,
): Partial<Record<BrandOverrideField, string | string[]>> {
  const out: Partial<Record<BrandOverrideField, string | string[]>> = {};

  const name = typeof bmp.name === 'string' ? bmp.name.trim() : '';
  if (name) out.name = name;

  const description = typeof bmp.description === 'string' ? bmp.description.trim() : '';
  if (description) out.description = description;

  const packSize = typeof bmp.packSize === 'string' ? bmp.packSize.trim() : '';
  if (packSize) out.packSize = packSize;

  const unit = typeof bmp.unit === 'string' ? bmp.unit.trim() : '';
  if (unit) out.unit = unit;

  const hsn = scalarToFormString(bmp.hsn);
  if (hsn) out.hsn = hsn;

  const barcode = scalarToFormString(bmp.barcode);
  if (barcode) out.barcode = barcode;

  const fssaiRef = scalarToFormString(bmp.fssaiRef);
  if (fssaiRef) out.fssaiRef = fssaiRef;

  if (bmp.vegNonVeg === 'veg' || bmp.vegNonVeg === 'nonveg' || bmp.vegNonVeg === 'egg') {
    out.vegNonVeg = bmp.vegNonVeg;
  }

  const storageType = scalarToFormString(bmp.storageType);
  if (storageType) out.storageType = storageType;

  if (bmp.shelfLifeDays != null && Number.isFinite(Number(bmp.shelfLifeDays))) {
    out.shelfLifeDays = String(bmp.shelfLifeDays);
  }

  const countryOfOrigin = scalarToFormString(bmp.countryOfOrigin);
  if (countryOfOrigin) out.countryOfOrigin = countryOfOrigin;

  const tags = stringList(bmp.tags);
  if (tags.length > 0) out.tags = tags;

  const aliasNames = stringList(bmp.aliasNames);
  if (aliasNames.length > 0) out.aliasNames = aliasNames;

  const categoryIds = brandOverrideCategoryIds(bmp);
  if (categoryIds.length > 0) out.categoryIds = categoryIds;

  const images = brandImages(bmp);
  if (images.length > 0) {
    out.images = images;
    out.imageUrl = images[0];
  }

  const packageWeight = scalarToFormString(bmp.packageWeight);
  if (packageWeight) out.packageWeight = packageWeight;

  const weightUnit = scalarToFormString(bmp.weightUnit);
  if (weightUnit) out.weightUnit = weightUnit;

  const packageLength = scalarToFormString(bmp.packageLength);
  if (packageLength) out.packageLength = packageLength;

  const packageWidth = scalarToFormString(bmp.packageWidth);
  if (packageWidth) out.packageWidth = packageWidth;

  const packageHeight = scalarToFormString(bmp.packageHeight);
  if (packageHeight) out.packageHeight = packageHeight;

  const dimensionUnit = scalarToFormString(bmp.dimensionUnit);
  if (dimensionUnit) out.dimensionUnit = dimensionUnit;

  return out;
}

const ARRAY_FIELDS = new Set<BrandOverrideField>([
  'tags',
  'aliasNames',
  'categoryIds',
  'images',
]);

/**
 * Returns the override field names where `payload` differs from values the brand
 * master would have painted. Empty result means "no brand-owned field was edited"
 * (price / MOQ / stock / credit / featured changes alone do not appear here).
 */
export function brandOverrideDeviations(
  payload: Record<string, unknown>,
  brandMaster: BrandMasterForOverride | null | undefined,
): string[] {
  if (!brandMaster) return [];

  const painted = brandPaintedValues(brandMaster);
  const deviations: string[] = [];

  for (const field of BRAND_OVERRIDE_FIELDS) {
    const brandValue = painted[field];
    if (brandValue === undefined) continue;

    const raw = readPayloadField(payload, field);
    // Field not present on this payload — cannot tell (partial PATCH).
    if (raw === undefined) continue;

    if (ARRAY_FIELDS.has(field)) {
      const payloadList = normalizePayloadStringList(raw);
      if (!sameStringArray(payloadList, brandValue as string[])) {
        deviations.push(field);
      }
      continue;
    }

    const payloadScalar = normalizePayloadScalar(raw);
    if (payloadScalar !== brandValue) {
      deviations.push(field);
    }
  }

  return deviations;
}
