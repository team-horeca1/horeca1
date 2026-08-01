import { z } from 'zod';
import { DELIVERY_FAIL_REASONS } from '@/modules/fulfillment/delivery.scope';

export const deliveryLinkTokenParamSchema = z
  .string()
  .trim()
  .min(16)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid delivery link token');

export const deliveryLinkCompleteSchema = z.object({
  otp: z.string().trim().regex(/^\d{4}$/, 'OTP must be a 4-digit code'),
});

export const deliveryLinkFailSchema = z
  .object({
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
  });
