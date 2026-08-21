import { z } from 'zod';

export const createBrandSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().optional(),
  logoUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
  website: z.string().url().optional(),
  tagline: z.string().max(512).optional(),
  categories: z.array(z.string().max(80)).max(12).optional(),
  bgColor: z.string().max(20).optional(),
  showcaseImages: z.array(z.string().url()).max(5).optional(),
});

/** PATCH may clear media by sending null (settings UI remove buttons). */
export const updateBrandSchema = createBrandSchema.partial().extend({
  logoUrl: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  bannerUrl: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
});

export const createBrandProductSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  packSize: z.string().max(100).optional(),
  unit: z.string().max(50).optional(),
  sku: z.string().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  categoryIds: z.array(z.string().uuid()).max(12).optional(),
  sortOrder: z.number().int().optional(),
  masterProductId: z.string().uuid().optional(),
  // Product-detail fields (no tax / pricing — those stay on supplier Product)
  hsn: z.string().max(50).optional(),
  barcode: z.string().max(100).optional(),
  ean: z.string().max(50).optional(),
  vegNonVeg: z.enum(['veg', 'nonveg', 'egg']).optional(),
  storageType: z.string().max(50).optional(),
  shelfLifeDays: z.number().int().min(0).max(3650).optional(),
  countryOfOrigin: z.string().max(100).optional(),
  fssaiRef: z.string().max(50).optional(),
  netWeight: z.number().nonnegative().optional(),
  netWeightUnit: z.string().max(20).optional(),
  // Shipping / carton packaging (distinct from netWeight)
  packageWeight: z.number().nonnegative().optional(),
  weightUnit: z.string().max(20).optional(),
  packageLength: z.number().nonnegative().optional(),
  packageWidth: z.number().nonnegative().optional(),
  packageHeight: z.number().nonnegative().optional(),
  dimensionUnit: z.string().max(20).optional(),
  images: z.array(z.string().url()).max(20).optional(),
  tags: z.array(z.string().max(80)).max(50).optional(),
  aliasNames: z.array(z.string().max(255)).max(50).optional(),
});

export const updateBrandProductSchema = createBrandProductSchema.partial();

export type CreateBrandProductInput = z.infer<typeof createBrandProductSchema>;

/** Detail fields accepted on brand→master submit and stashed in MasterProduct.metadata.brandDetails. */
export const brandSubmitDetailSchema = createBrandProductSchema.pick({
  description: true,
  hsn: true,
  barcode: true,
  ean: true,
  vegNonVeg: true,
  storageType: true,
  shelfLifeDays: true,
  countryOfOrigin: true,
  fssaiRef: true,
  netWeight: true,
  netWeightUnit: true,
  packageWeight: true,
  weightUnit: true,
  packageLength: true,
  packageWidth: true,
  packageHeight: true,
  dimensionUnit: true,
  images: true,
  tags: true,
  aliasNames: true,
});

export type BrandSubmitDetail = z.infer<typeof brandSubmitDetailSchema>;

/** POST /api/v1/brand/master-products body (pending master catalog entry). */
export const brandMasterSubmitSchema = z
  .object({
    name: z.string().min(2).max(255),
    sku: z.string().min(2).max(40),
    categoryId: z.string().uuid(),
    imageUrl: z.string().url().optional(),
    /** Brand form sends `uom`; maps to MasterProduct.uom / BrandMasterProduct.unit. */
    uom: z.string().max(50).optional(),
    packSize: z.string().max(100).optional(),
  })
  .merge(brandSubmitDetailSchema);

export type BrandMasterSubmitInput = z.infer<typeof brandMasterSubmitSchema>;

export const BRAND_SUBMIT_DETAILS_META_KEY = 'brandDetails' as const;

const BRAND_SUBMIT_DETAIL_KEYS = [
  'description',
  'hsn',
  'barcode',
  'ean',
  'vegNonVeg',
  'storageType',
  'shelfLifeDays',
  'countryOfOrigin',
  'fssaiRef',
  'netWeight',
  'netWeightUnit',
  'packageWeight',
  'weightUnit',
  'packageLength',
  'packageWidth',
  'packageHeight',
  'dimensionUnit',
  'images',
  'tags',
  'aliasNames',
] as const satisfies ReadonlyArray<keyof BrandSubmitDetail>;

/** Pick only defined detail fields for MasterProduct.metadata.brandDetails. */
export function pickBrandSubmitDetails(
  input: Partial<BrandSubmitDetail>,
): BrandSubmitDetail {
  const details: BrandSubmitDetail = {};
  for (const key of BRAND_SUBMIT_DETAIL_KEYS) {
    const value = input[key];
    if (value !== undefined) {
      (details as Record<string, unknown>)[key] = value;
    }
  }
  return details;
}

/** Read brandDetails from MasterProduct.metadata (tolerant of missing/malformed JSON). */
export function readBrandSubmitDetails(metadata: unknown): BrandSubmitDetail {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const raw = (metadata as Record<string, unknown>)[BRAND_SUBMIT_DETAILS_META_KEY];
  const parsed = brandSubmitDetailSchema.partial().safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

/**
 * Map stashed submit details onto BrandMasterProduct create/update fields.
 * Omits undefined so Prisma does not overwrite existing values with null on upsert update.
 */
export function brandMasterFieldsFromSubmitDetails(
  details: BrandSubmitDetail,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (details.description !== undefined) fields.description = details.description;
  if (details.hsn !== undefined) fields.hsn = details.hsn;
  if (details.barcode !== undefined) fields.barcode = details.barcode;
  if (details.ean !== undefined) fields.ean = details.ean;
  if (details.vegNonVeg !== undefined) fields.vegNonVeg = details.vegNonVeg;
  if (details.storageType !== undefined) fields.storageType = details.storageType;
  if (details.shelfLifeDays !== undefined) fields.shelfLifeDays = details.shelfLifeDays;
  if (details.countryOfOrigin !== undefined) fields.countryOfOrigin = details.countryOfOrigin;
  if (details.fssaiRef !== undefined) fields.fssaiRef = details.fssaiRef;
  if (details.netWeight !== undefined) fields.netWeight = details.netWeight;
  if (details.netWeightUnit !== undefined) fields.netWeightUnit = details.netWeightUnit;
  if (details.packageWeight !== undefined) fields.packageWeight = details.packageWeight;
  if (details.weightUnit !== undefined) fields.weightUnit = details.weightUnit;
  if (details.packageLength !== undefined) fields.packageLength = details.packageLength;
  if (details.packageWidth !== undefined) fields.packageWidth = details.packageWidth;
  if (details.packageHeight !== undefined) fields.packageHeight = details.packageHeight;
  if (details.dimensionUnit !== undefined) fields.dimensionUnit = details.dimensionUnit;
  if (details.images !== undefined) fields.images = details.images;
  if (details.tags !== undefined) fields.tags = details.tags;
  if (details.aliasNames !== undefined) fields.aliasNames = details.aliasNames;
  return fields;
}

export const listBrandsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  cursor: z.string().uuid().optional(),
  /** `picker` = all approved brands for product forms; `public` = storefront listing (excludes admin placeholders). */
  scope: z.enum(['public', 'picker']).default('public'),
});

export const reviewMappingSchema = z.object({
  status: z.enum(['verified', 'rejected']),
  reviewNote: z.string().optional(),
  // Optional: re-target the mapping to a different BrandMasterProduct.
  // When set, status must be 'verified' (admin is correcting the auto-mapper's pick).
  brandMasterProductId: z.string().uuid().optional(),
});

export const runAutoMapSchema = z.object({
  brandMasterProductId: z.string().uuid(),
});
