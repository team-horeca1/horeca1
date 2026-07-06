import { z } from 'zod';

export const updateStockSchema = z.object({
  outletId: z.string().uuid().optional(),
  qtyAvailable: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
});

export const bulkCheckSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
    })
  ),
});
