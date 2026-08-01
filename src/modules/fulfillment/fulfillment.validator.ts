import { z } from 'zod';
import {
  DELIVERY_FAIL_REASONS,
  DELIVERY_UI_STATUSES,
} from '@/modules/fulfillment/delivery.scope';
import { DELIVERY_RESOURCE_TYPES } from '@/modules/fulfillment/fulfillment.types';

const phoneSchema = z
  .string()
  .trim()
  .min(8, 'Phone is required')
  .max(20)
  .regex(/^[+\d][\d\s\-()]{7,19}$/, 'Enter a valid phone number');

export const listFulfilmentsQuerySchema = z.object({
  /** Delivery UI status chip — expands to DB FulfilmentStatus[] in the service. */
  status: z.enum(DELIVERY_UI_STATUSES).optional(),
  outletId: z.string().uuid().optional(),
  deliveryResourceId: z.string().uuid().optional(),
  paymentMethod: z.string().max(30).optional(),
  search: z.string().max(100).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const fulfilmentActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('mark_packed'),
  }),
  z.object({
    action: z.literal('assign_and_dispatch'),
    deliveryBoyName: z.string().trim().min(1).max(150),
    deliveryBoyPhone: phoneSchema,
    eta: z.string().datetime().optional(),
  }),
  z
    .object({
      action: z.literal('record_failed_delivery'),
      failedReason: z.enum(DELIVERY_FAIL_REASONS),
      failedReasonOther: z.string().trim().max(1000).optional(),
    })
    .superRefine((val, ctx) => {
      if (val.failedReason === 'other' && !val.failedReasonOther?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please describe the reason when selecting Other',
          path: ['failedReasonOther'],
        });
      }
    }),
  z.object({
    action: z.literal('reschedule_dispatch'),
    eta: z.string().datetime().optional(),
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal('override_mark_delivered'),
    note: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal('mark_delivered'),
    otp: z.string().trim().regex(/^\d{4}$/, 'OTP must be a 4-digit code'),
  }),
]);

export const fulfilmentBulkActionSchema = z.object({
  action: z.literal('assign_and_dispatch'),
  fulfilmentIds: z.array(z.string().uuid()).min(1).max(50),
  deliveryBoyName: z.string().trim().min(1).max(150),
  deliveryBoyPhone: phoneSchema,
  eta: z.string().datetime().optional(),
});

export const createDeliveryResourceSchema = z.object({
  type: z.enum(DELIVERY_RESOURCE_TYPES),
  name: z.string().min(1).max(150),
  phone: z.string().max(20).optional(),
});
