// GET|PATCH /api/v1/vendor/credit/config — supplier credit defaults
// Hierarchy: Global → VendorCreditConfig → per-customer overrides

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { creditWalletService } from '@/modules/credit/creditWallet.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'creditLine.view');
    const vendorId = await resolveVendorId(ctx, req);
    const [global, vendor] = await Promise.all([
      creditWalletService.getGlobalConfig(),
      creditWalletService.getVendorConfig(vendorId),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        global,
        vendor: vendor
          ? {
              repaymentMode: vendor.repaymentMode,
              billingModel: vendor.billingModel,
              defaultCreditLimit: vendor.defaultCreditLimit != null ? Number(vendor.defaultCreditLimit) : null,
              creditTenureDays: vendor.creditTenureDays,
              gracePeriodDays: vendor.gracePeriodDays,
              blacklistDays: vendor.blacklistDays,
              interestRatePct: vendor.interestRatePct != null ? Number(vendor.interestRatePct) : null,
              interestFrequencyDays: vendor.interestFrequencyDays,
              penaltyAmount: vendor.penaltyAmount != null ? Number(vendor.penaltyAmount) : null,
              penaltyFrequencyDays: vendor.penaltyFrequencyDays,
              creditEnabled: vendor.creditEnabled,
            }
          : null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

const patchSchema = z.object({
  repaymentMode: z.enum(['REPAY_BEFORE_NEXT_USE', 'ALLOW_USAGE_TILL_DUE']).nullable().optional(),
  billingModel: z.enum(['BILL_TO_BILL', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY']).nullable().optional(),
  defaultCreditLimit: z.number().min(0).max(50_000_000).nullable().optional(),
  creditTenureDays: z.number().int().min(0).max(365).nullable().optional(),
  gracePeriodDays: z.number().int().min(0).max(365).nullable().optional(),
  blacklistDays: z.number().int().min(0).max(3650).nullable().optional(),
  interestRatePct: z.number().min(0).max(100).nullable().optional(),
  interestFrequencyDays: z.number().int().min(1).max(365).nullable().optional(),
  penaltyAmount: z.number().min(0).max(100000).nullable().optional(),
  penaltyFrequencyDays: z.number().int().min(1).max(365).nullable().optional(),
  creditEnabled: z.boolean().optional(),
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'creditLine.approve');
    const vendorId = await resolveVendorId(ctx, req);
    const body = patchSchema.parse(await req.json());
    const row = await creditWalletService.upsertVendorConfig(vendorId, body, ctx.userId);
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    return errorResponse(error);
  }
});
