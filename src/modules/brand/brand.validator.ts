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

export const updateBrandSchema = createBrandSchema.partial();

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
  images: z.array(z.string().url()).max(20).optional(),
  tags: z.array(z.string().max(80)).max(50).optional(),
  aliasNames: z.array(z.string().max(255)).max(50).optional(),
});

export const updateBrandProductSchema = createBrandProductSchema.partial();

export type CreateBrandProductInput = z.infer<typeof createBrandProductSchema>;

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
