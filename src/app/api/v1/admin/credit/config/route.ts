// GET  /api/v1/admin/credit/config — global credit defaults.
// PATCH /api/v1/admin/credit/config — update them (audited). Admin only.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction } from '@/lib/auditLog';
import { creditWalletService } from '@/modules/credit/creditWallet.service';

export const GET = adminOnly(async (_req, ctx) => {
  try {
    requirePermission(ctx, 'payments.view');
    const config = await creditWalletService.getGlobalConfig();
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    return errorResponse(error);
  }
});

const patchSchema = z.object({
  repaymentMode: z.enum(['REPAY_BEFORE_NEXT_USE', 'ALLOW_USAGE_TILL_DUE']).optional(),
  billingModel: z.enum(['BILL_TO_BILL', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY']).optional(),
  creditLimit: z.number().min(0).optional(),
  creditTenureDays: z.number().int().min(0).max(365).optional(),
  gracePeriodDays: z.number().int().min(0).max(365).optional(),
  blacklistDays: z.number().int().min(0).max(3650).optional(),
  interestRatePct: z.number().min(0).max(100).optional(),
  interestFrequencyDays: z.number().int().min(1).max(365).optional(),
  penaltyAmount: z.number().min(0).max(100000).optional(),
  penaltyFrequencyDays: z.number().int().min(1).max(365).optional(),
  eligiblePurchaseCount: z.number().int().min(0).max(1000).optional(),
  unlockCreditAmount: z.number().min(0).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' });

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.create');
    const body = patchSchema.parse(await req.json());
    const before = await creditWalletService.getGlobalConfig();

    const existing = await prisma.globalCreditConfig.findFirst();
    const data = {
      ...(body.repaymentMode !== undefined && { repaymentMode: body.repaymentMode }),
      ...(body.billingModel !== undefined && { billingModel: body.billingModel }),
      ...(body.creditLimit !== undefined && { creditLimit: new Prisma.Decimal(body.creditLimit) }),
      ...(body.creditTenureDays !== undefined && { creditTenureDays: body.creditTenureDays }),
      ...(body.gracePeriodDays !== undefined && { gracePeriodDays: body.gracePeriodDays }),
      ...(body.blacklistDays !== undefined && { blacklistDays: body.blacklistDays }),
      ...(body.interestRatePct !== undefined && { interestRatePct: new Prisma.Decimal(body.interestRatePct) }),
      ...(body.interestFrequencyDays !== undefined && { interestFrequencyDays: body.interestFrequencyDays }),
      ...(body.penaltyAmount !== undefined && { penaltyAmount: new Prisma.Decimal(body.penaltyAmount) }),
      ...(body.penaltyFrequencyDays !== undefined && { penaltyFrequencyDays: body.penaltyFrequencyDays }),
      ...(body.eligiblePurchaseCount !== undefined && { eligiblePurchaseCount: body.eligiblePurchaseCount }),
      ...(body.unlockCreditAmount !== undefined && { unlockCreditAmount: new Prisma.Decimal(body.unlockCreditAmount) }),
    };

    const saved = existing
      ? await prisma.globalCreditConfig.update({ where: { id: existing.id }, data })
      : await prisma.globalCreditConfig.create({ data });

    await logAction(ctx, req, {
      action: 'credit_config.update',
      entity: 'global_credit_config',
      entityId: saved.id,
      before,
      after: body,
    });

    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    return errorResponse(error);
  }
});
