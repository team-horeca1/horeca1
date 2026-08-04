import { z } from 'zod';
import {
  BLOCKED_RETURN_ACTION_MESSAGES,
  BLOCKED_RETURN_ACTIONS,
  CREATE_RETURN_TYPES,
  RETURN_DISPOSITIONS,
  RETURN_ITEM_DECISIONS,
  RETURN_ITEM_REASONS,
  RETURN_PICKUP_FAIL_REASONS,
  RETURN_STATUSES,
  RETURN_TYPES,
  RETURN_UI_STATUSES,
  type BlockedReturnAction,
  type ReturnActionBody,
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
  /** Vendor UI chip (`review`, `pickup`, …) or raw DB status — service expands to `in`. */
  status: z.union([z.enum(RETURN_UI_STATUSES), z.enum(RETURN_STATUSES)]).optional(),
  /** Includes legacy `replacement` for filters; new creates use CREATE_RETURN_TYPES. */
  type: z.enum(RETURN_TYPES).optional(),
  outletId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

/** Shared filters for CSV export + summary (no pagination). */
export const reportReturnsQuerySchema = listReturnsQuerySchema.omit({
  cursor: true,
  limit: true,
});

export const customerCreateReturnSchema = z.object({
  reason: z.string().min(10, 'Please provide more detail (at least 10 characters)').max(2000),
  type: z.enum(CREATE_RETURN_TYPES).optional().default('return'),
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

const activeReturnActionSchema = z.discriminatedUnion('action', [
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
  z
    .object({
      action: z.literal('schedule_pickup'),
      deliveryResourceId: z.string().uuid().optional(),
      deliveryBoyName: z.string().trim().min(1).max(150).optional(),
      deliveryBoyPhone: z
        .string()
        .trim()
        .min(8)
        .max(20)
        .regex(/^[+\d][\d\s\-()]{7,19}$/, 'Enter a valid phone number')
        .optional(),
      notes: z.string().max(1000).optional(),
    })
    .superRefine((val, ctx) => {
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
      }
    }),
  z.object({
    action: z.literal('skip_pickup'),
    reason: z.string().trim().min(10).max(1000),
  }),
  z.object({
    action: z.literal('resend_pickup_otp'),
  }),
  z.object({
    action: z.literal('mark_goods_received'),
    otp: z.string().trim().regex(/^\d{4}$/, 'OTP must be a 4-digit code'),
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
    action: z.literal('generate_credit_note'),
    amount: z.number().positive().optional(),
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal('close'),
    notes: z.string().max(1000).optional(),
  }),
]);

function isBlockedReturnAction(action: unknown): action is BlockedReturnAction {
  return (
    typeof action === 'string' &&
    (BLOCKED_RETURN_ACTIONS as readonly string[]).includes(action)
  );
}

/**
 * Vendor return actions. Blocked actions (`generate_replacement`, `process_refund`)
 * fail with a clear message before the active union is evaluated.
 */
export const returnActionSchema: z.ZodType<ReturnActionBody> = z.preprocess(
  (raw) => {
    if (raw && typeof raw === 'object' && 'action' in raw) {
      const action = (raw as { action: unknown }).action;
      if (isBlockedReturnAction(action)) {
        throw new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            message: BLOCKED_RETURN_ACTION_MESSAGES[action],
            path: ['action'],
          },
        ]);
      }
    }
    return raw;
  },
  activeReturnActionSchema,
) as z.ZodType<ReturnActionBody>;

// ─── Public /r/[token] ───────────────────────────────────────────────────────

export const returnPickupLinkTokenParamSchema = z
  .string()
  .trim()
  .min(16)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid return pickup link token');

export const returnPickupLinkCompleteSchema = z.object({
  otp: z.string().trim().regex(/^\d{4}$/, 'OTP must be a 4-digit code'),
});

export const returnPickupLinkFailSchema = z
  .object({
    failedReason: z.enum(RETURN_PICKUP_FAIL_REASONS),
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
