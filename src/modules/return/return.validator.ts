import { z } from 'zod';
import {
  RETURN_DISPOSITIONS,
  RETURN_ITEM_DECISIONS,
  RETURN_ITEM_REASONS,
  RETURN_STATUSES,
  RETURN_TYPES,
} from '@/modules/return/return.types';

const lineDecisionSchema = z.object({
  returnItemId: z.string().uuid(),
  decision: z.enum(
    RETURN_ITEM_DECISIONS.filter((d) => d !== 'pending') as [
      'approved',
      'partial',
      'rejected',
    ],
  ),
  approvedQty: z.number().int().min(0).optional(),
  note: z.string().max(500).optional(),
});

const dispositionItemSchema = z.object({
  returnItemId: z.string().uuid(),
  disposition: z.enum(RETURN_DISPOSITIONS),
});

export const listReturnsQuerySchema = z.object({
  status: z.enum(RETURN_STATUSES).optional(),
  type: z.enum(RETURN_TYPES).optional(),
  outletId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const customerCreateReturnSchema = z.object({
  reason: z.string().min(10, 'Please provide more detail (at least 10 characters)').max(2000),
  type: z.enum(RETURN_TYPES).optional().default('return'),
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        quantity: z.number().int().positive(),
        reason: z.enum(RETURN_ITEM_REASONS),
        note: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .optional(),
});

export const returnActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    items: z.array(lineDecisionSchema).optional(),
    adminNote: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal('partial_approve'),
    items: z.array(lineDecisionSchema).min(1),
    adminNote: z.string().max(1000).optional(),
  }),
  z
    .object({
      action: z.literal('reject'),
      reason: z.string().min(10).max(1000),
      adminNote: z.string().max(1000).optional(),
    })
    .superRefine((val, ctx) => {
      const note = (val.adminNote ?? val.reason).trim();
      if (note.length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reason'],
          message: 'A note to the customer (at least 10 characters) is required when rejecting.',
        });
      }
    }),
  z.object({
    action: z.literal('schedule_pickup'),
    pickupAt: z.string().datetime(),
    pickupAddress: z.string().max(1000).optional(),
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal('mark_goods_received'),
    receivedAt: z.string().datetime().optional(),
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal('complete_inspection'),
    passed: z.boolean(),
    notes: z.string().max(2000).optional(),
    verifiedBy: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal('reject_goods'),
    reason: z.string().min(3).max(1000),
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal('set_disposition'),
    items: z.array(dispositionItemSchema).min(1),
  }),
  z.object({
    action: z.literal('generate_replacement'),
    items: z
      .array(
        z.object({
          returnItemId: z.string().uuid(),
          quantity: z.number().int().positive(),
        }),
      )
      .optional(),
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal('generate_credit_note'),
    amount: z.number().positive().optional(),
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal('process_refund'),
    amount: z.number().positive().optional(),
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal('close'),
    notes: z.string().max(1000).optional(),
  }),
]);
