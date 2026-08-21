// POST /api/v1/vendor/credit/bulk — bulk assign / update credit lines
// PROTECTED: Vendor + creditLine.approve

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { creditWalletService } from '@/modules/credit/creditWallet.service';

const overridesSchema = z.object({
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

const rowSchema = z.object({
  userId: z.string().uuid(),
  creditLimit: z.number().min(0).max(50_000_000),
  overrides: overridesSchema.optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
});

const schema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'creditLine.approve');
    const vendorId = await resolveVendorId(ctx, req);
    const body = schema.parse(await req.json());

    // Multi-tenancy: every target must be a customer of this vendor.
    const userIds = body.rows.map((r) => r.userId);
    const [ordered, crm, wallets] = await Promise.all([
      prisma.order.findMany({
        where: { vendorId, userId: { in: userIds } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.vendorCustomer.findMany({
        where: { vendorId, userId: { in: userIds } },
        select: { userId: true },
      }),
      prisma.creditWallet.findMany({
        where: { vendorId, userId: { in: userIds } },
        select: { userId: true },
      }),
    ]);
    const allowed = new Set([
      ...ordered.map((o) => o.userId),
      ...crm.map((c) => c.userId),
      ...wallets.map((w) => w.userId),
    ]);

    const rejected: Array<{ userId: string; error: string }> = [];
    const eligible = body.rows.filter((r) => {
      if (!allowed.has(r.userId)) {
        rejected.push({ userId: r.userId, error: 'Not a customer of this store' });
        return false;
      }
      return true;
    });

    const result = await creditWalletService.bulkAssignCredit(
      eligible.map((r) => ({
        userId: r.userId,
        creditLimit: r.creditLimit,
        overrides: r.overrides,
        validFrom: r.validFrom ? new Date(r.validFrom) : undefined,
        validUntil: r.validUntil ? new Date(r.validUntil) : undefined,
      })),
      vendorId,
      ctx.userId,
    );

    return NextResponse.json({
      success: true,
      data: {
        succeeded: result.succeeded,
        failed: [...rejected, ...result.failed],
        affected: result.succeeded,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
