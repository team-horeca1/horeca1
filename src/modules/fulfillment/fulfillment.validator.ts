import { z } from 'zod';
import {
  DELIVERY_FAIL_REASONS,
  DELIVERY_FILTER_KEYS,
} from '@/modules/fulfillment/delivery.scope';
import { DELIVERY_RESOURCE_TYPES } from '@/modules/fulfillment/fulfillment.types';

const phoneSchema = z
  .string()
  .trim()
  .min(8, 'Phone is required')
  .max(20)
  .regex(/^[+\d][\d\s\-()]{7,19}$/, 'Enter a valid phone number');

export const listFulfilmentsQuerySchema = z.object({
  /** Delivery filter chip (New / Processing / stage) — expands to DB statuses in the service. */
  status: z.enum(DELIVERY_FILTER_KEYS).optional(),
  outletId: z.string().uuid().optional(),
  deliveryResourceId: z.string().uuid().optional(),
  paymentMethod: z.string().max(30).optional(),
  search: z.string().max(100).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const assignBoyFields = {
  deliveryResourceId: z.string().uuid().optional(),
  deliveryBoyName: z.string().trim().min(1).max(150).optional(),
  deliveryBoyPhone: phoneSchema.optional(),
  eta: z.string().datetime().optional(),
};

function refineAssignBoy(
  val: {
    deliveryResourceId?: string;
    deliveryBoyName?: string;
    deliveryBoyPhone?: string;
  },
  ctx: z.RefinementCtx,
) {
  if (val.deliveryResourceId) return;
  if (!val.deliveryBoyName?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Select a delivery boy or enter a name',
      path: ['deliveryBoyName'],
    });
  }
  if (!val.deliveryBoyPhone?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Phone is required for a new delivery boy',
      path: ['deliveryBoyPhone'],
    });
  } else {
    const phoneCheck = phoneSchema.safeParse(val.deliveryBoyPhone);
    if (!phoneCheck.success) {
      for (const issue of phoneCheck.error.issues) {
        ctx.addIssue({ ...issue, path: ['deliveryBoyPhone'] });
      }
    }
  }
}

export const fulfilmentActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('mark_packed'),
  }),
  z
    .object({
      action: z.literal('assign_and_dispatch'),
      ...assignBoyFields,
    })
    .superRefine(refineAssignBoy),
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

export const fulfilmentBulkActionSchema = z
  .object({
    action: z.literal('assign_and_dispatch'),
    fulfilmentIds: z.array(z.string().uuid()).min(1).max(50),
    ...assignBoyFields,
  })
  .superRefine(refineAssignBoy);

export const createDeliveryResourceSchema = z.object({
  type: z.enum(DELIVERY_RESOURCE_TYPES),
  name: z.string().min(1).max(150),
  phone: z.string().max(20).optional(),
});
