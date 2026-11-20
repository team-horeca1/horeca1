import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { AUDIT_ACTIONS, logAction } from '@/lib/auditLog';
import { listSupplierPayables } from '@/modules/finance/supplierPayable.service';
import { createFinanceDraft, paySupplierNow } from '@/modules/finance/supplierSettlement.service';
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
      pageSize: Number(url.searchParams.get('pageSize') ?? '20'),
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
          customerPaid: paiseToRupees(data.kpis.customerPaidPaise),
          razorpayFee: paiseToRupees(data.kpis.razorpayFeePaise),
          razorpayFeeUnknown: data.kpis.razorpayFeeUnknown,
          quotedNet: paiseToRupees(data.kpis.quotedNetPaise),
          settledPeriod: paiseToRupees(data.kpis.settledPeriodPaise),
          onHold: paiseToRupees(data.kpis.onHoldPaise),
          blockedSale: paiseToRupees(data.kpis.blockedSalePaise),
        },
        rows: data.rows.map((row) => ({
          ...row,
          eligibleSale: paiseToRupees(row.eligibleSalePaise),
          razorpayFee: paiseToRupees(row.razorpayFeePaise),
          razorpayFeeUnknown: row.razorpayFeeUnknown,
          commission: paiseToRupees(row.commissionPaise),
          adjustments: paiseToRupees(row.adjustmentPaise),
          outstanding: paiseToRupees(row.outstandingPaise),
          eligible: paiseToRupees(row.eligiblePaise),
          shownToPay: paiseToRupees(row.shownToPayPaise),
          onHold: paiseToRupees(row.onHoldPaise),
          settled: paiseToRupees(row.settledPaise),
          dates: row.dates.map((day) => ({
            date: day.date,
            orderCount: day.orderCount,
            orderIds: day.orderIds,
            net: paiseToRupees(day.netPaise),
            payable: day.payable,
            waitingDelivery: day.waitingDelivery,
            feeUnknown: day.feeUnknown,
            unconfigured: day.unconfigured,
          })),
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
  utr: z.string().min(6).optional(),
  note: z.string().min(3).max(500).optional(),
  amount: z.string().min(1).max(20).optional(),
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.create');
    const body = draftSchema.parse(await req.json());
    if (body.utr && body.note) {
      const paid = await paySupplierNow({
        vendorId: body.vendorId,
        actorId: ctx.userId,
        utr: body.utr,
        note: body.note,
        expectedNet: body.amount,
        orderIds: body.orderIds,
      });
      void logAction(ctx, req, {
        action: AUDIT_ACTIONS.supplierSettlementSettle,
        entity: 'FinanceSettlementBatch',
        entityId: paid.batch.id,
        after: {
          supplierId: body.vendorId,
          amount: paid.batch.netAmount.toString(),
          utr: body.utr,
          note: body.note,
          bankVerified: false,
        },
      });
      return NextResponse.json({ success: true, data: paid.batch });
    }
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
