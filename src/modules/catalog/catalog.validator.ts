import { z } from 'zod';

export const vendorProductsSchema = z.object({
  categoryId: z.string().uuid().optional(),
  search: z.string().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  pincode: z.string().regex(/^\d{6}$/).optional(),
});

export const searchProductsSchema = z.object({
  q: z.string().min(1, 'Search query required'),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export const createProductSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  categoryId: z.string().uuid().optional(),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  packSize: z.string().optional(),
  unit: z.string().optional(),
  basePrice: z.number().positive(),
  creditEligible: z.boolean().optional().transform(() => true),
});
