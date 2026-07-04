import { z } from 'zod';

export const picklistItemSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  qty: z.number().int().positive(),
});

export const createPicklistSchema = z.object({
  orderId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
  items: z.array(picklistItemSchema).optional(),
});

export const updatePicklistStatusSchema = z.object({
  status: z.enum(['printed', 'picked', 'cancelled']),
});

export const createDispatchSchema = z.object({
  orderId: z.string().uuid().optional(),
  picklistId: z.string().uuid().optional(),
  driverName: z.string().max(100).optional(),
  vehicleNumber: z.string().max(30).optional(),
  notes: z.string().max(500).optional(),
});

export const updateDispatchStatusSchema = z.object({
  status: z.enum(['out_for_delivery', 'delivered', 'cancelled']),
  notes: z.string().max(500).optional(),
});

export const grnItemSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string().optional(),
  qty: z.number().int().positive(),
});

export const createGrnSchema = z.object({
  referenceNo: z.string().max(50).optional(),
  supplier: z.string().max(150).optional(),
  notes: z.string().max(500).optional(),
  items: z.array(grnItemSchema).min(1),
  receive: z.boolean().optional(),
});

export const updateGrnStatusSchema = z.object({
  status: z.enum(['received', 'cancelled']),
});

export type PicklistItem = z.infer<typeof picklistItemSchema>;
export type GrnItem = z.infer<typeof grnItemSchema>;
