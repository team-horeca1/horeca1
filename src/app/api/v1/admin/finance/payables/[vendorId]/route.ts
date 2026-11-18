import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { AUDIT_ACTIONS, logAction } from '@/lib/auditLog';
import { getSupplierPayableDetail, setSettlementCycle } from '@/modules/finance/supplierPayable.service';

function vendorIdFrom(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.view');
    const detail = await getSupplierPayableDetail(vendorIdFrom(req));
    return NextResponse.json({
      success: true,
      data: {
        vendor: {
          ...detail.vendor,
          platformFeePct: detail.vendor.platformFeePct == null ? null : detail.vendor.platformFeePct.toString(),
        },
        lines: detail.lines.map((line) => ({
          ...line,
          commercialBase: line.commercialBase.toString(),
          collectedAmount: line.collectedAmount.toString(),
          recognisedBase: line.recognisedBase.toString(),
          commissionAmount: line.commissionAmount.toString(),
          razorpayFee: line.razorpayFee == null ? null : line.razorpayFee.toString(),
          razorpayFeeUnknown: line.razorpayFeeUnknown,
          netPayable: line.netPayable.toString(),
          provisionalBase: line.provisionalBase.toString(),
          blockedSale: line.blockedSale.toString(),
          aboveCash: line.aboveCash.toString(),
          order: {
            ...line.order,
            totalAmount: line.order.totalAmount.toString(),
          },
        })),
        batches: detail.batches.map((batch) => ({
          id: batch.id,
          batchNumber: batch.batchNumber,
          status: batch.status,
          netAmount: batch.netAmount.toString(),
          bankReference: batch.bankReference,
          orderCount: batch._count.lines,
        })),
        recoveries: detail.recoveries.map((row) => ({
          id: row.id,
          amount: row.amount.toString(),
          reason: row.reason,
          appliedBatchId: row.appliedBatchId,
          createdAt: row.createdAt,
        })),
        agreements: detail.agreements.map((row) => ({
          id: row.id,
          ratePct: row.ratePct.toString(),
          effectiveFrom: row.effectiveFrom,
          effectiveTo: row.effectiveTo,
          reason: row.reason,
        })),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

const cycleSchema = z.object({ settlementCycle: z.enum(['manual', 'weekly']) });

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.create');
    const vendorId = vendorIdFrom(req);
    const body = cycleSchema.parse(await req.json());
    await setSettlementCycle(vendorId, body.settlementCycle);
    void logAction(ctx, req, {
      action: AUDIT_ACTIONS.supplierCommissionUpdate,
      entity: 'Vendor',
      entityId: vendorId,
      after: { settlementCycle: body.settlementCycle },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
