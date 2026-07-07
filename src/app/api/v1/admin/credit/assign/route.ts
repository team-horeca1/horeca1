// POST /api/v1/admin/credit/assign — assign / update a customer's credit line
// (H1 wallet when vendorId is null, else a vendor credit line). Admin only.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { creditWalletService } from '@/modules/credit/creditWallet.service';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';

const overrides = z.object({
  repaymentMode: z.enum(['REPAY_BEFORE_NEXT_USE', 'ALLOW_USAGE_TILL_DUE']).optional(),
  billingModel: z.enum(['BILL_TO_BILL', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY']).optional(),
  creditTenureDays: z.number().int().min(0).max(365).optional(),
  gracePeriodDays: z.number().int().min(0).max(365).optional(),
  blacklistDays: z.number().int().min(0).max(3650).optional(),
  interestRatePct: z.number().min(0).max(100).optional(),
  interestFrequencyDays: z.number().int().min(1).max(365).optional(),
  penaltyAmount: z.number().min(0).max(100000).optional(),
  penaltyFrequencyDays: z.number().int().min(1).max(365).optional(),
}).partial();

const schema = z.object({
  userId: z.string().uuid(),
  vendorId: z.string().uuid().nullable().optional(),
  creditLimit: z.number().min(0).max(50000000),
  overrides: overrides.optional(),
  remark: z.string().max(500).optional(),
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.create');
    const body = schema.parse(await req.json());
    const wallet = await creditWalletService.assignCredit(
      body.userId,
      body.vendorId ?? null,
      body.creditLimit,
      body.overrides ?? {},
      ctx.userId,
      body.remark ?? 'Credit assigned by admin',
    );
    return NextResponse.json({ success: true, data: wallet }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
