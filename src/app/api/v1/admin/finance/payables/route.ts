import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { AUDIT_ACTIONS, logAction } from '@/lib/auditLog';
import { listSupplierPayables } from '@/modules/finance/supplierPayable.service';
import { createFinanceDraft } from '@/modules/finance/supplierSettlement.service';
import { paiseToRupees } from '@/modules/finance/money';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.view');
    const url = new URL(req.url);
    const data = await listSupplierPayables({
      q: url.searchParams.get('q') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      commission: (url.searchParams.get('commission') ?? '') as 'configured' | 'unconfigured' | 'zero' | '',
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      sort: url.searchParams.get('sort') ?? undefined,
      page: Number(url.searchParams.get('page') ?? '1'),
    });
    return NextResponse.json({
      success: true,
      data: {
        ...data,
        kpis: {
          ...data.kpis,
          outstanding: paiseToRupees(data.kpis.outstandingPaise),
          eligible: paiseToRupees(data.kpis.eligiblePaise),
          pendingCapture: paiseToRupees(data.kpis.pendingCapturePaise),
          awaitingCompletion: paiseToRupees(data.kpis.awaitingCompletionPaise),
          commission: paiseToRupees(data.kpis.commissionPaise),
          settledPeriod: paiseToRupees(data.kpis.settledPeriodPaise),
          onHold: paiseToRupees(data.kpis.onHoldPaise),
          blockedSale: paiseToRupees(data.kpis.blockedSalePaise),
        },
        rows: data.rows.map((row) => ({
          ...row,
          eligibleSale: paiseToRupees(row.eligibleSalePaise),
          commission: paiseToRupees(row.commissionPaise),
          adjustments: paiseToRupees(row.adjustmentPaise),
          outstanding: paiseToRupees(row.outstandingPaise),
          eligible: paiseToRupees(row.eligiblePaise),
          onHold: paiseToRupees(row.onHoldPaise),
          settled: paiseToRupees(row.settledPaise),
        })),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

const draftSchema = z.object({
  vendorId: z.string().uuid(),
  orderIds: z.array(z.string().uuid()).optional(),
  idempotencyKey: z.string().min(8).max(80).optional(),
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.create');
    const body = draftSchema.parse(await req.json());
    const result = await createFinanceDraft({ ...body, actorId: ctx.userId });
    void logAction(ctx, req, {
      action: AUDIT_ACTIONS.supplierSettlementDraft,
      entity: 'FinanceSettlementBatch',
      entityId: result.batch.id,
      after: { batchNumber: result.batch.batchNumber, status: result.batch.status, replayed: result.replayed },
    });
    return NextResponse.json({ success: true, data: result.batch, replayed: result.replayed });
  } catch (error) {
    return errorResponse(error);
  }
});
