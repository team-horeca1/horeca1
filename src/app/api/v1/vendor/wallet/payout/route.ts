// POST /api/v1/vendor/wallet/payout — request instant settlement of accrued balance
import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { vendorSettlementService } from '@/modules/vendor/vendorSettlement.service';
import { Errors } from '@/middleware/errorHandler';

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'wallet.view');
    const vendorId = await resolveVendorId(ctx, req);
    const result = await vendorSettlementService.requestInstantPayout(vendorId);
    if (!result) {
      throw Errors.badRequest('No balance available for payout. Deliver paid orders first.');
    }
    return NextResponse.json({
      success: true,
      data: {
        settlementId: result.settlementId,
        netAmount: result.netAmount,
        orderCount: result.orderCount,
        message: 'Payout initiated. Funds will reflect in your bank within 1–2 business days.',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
