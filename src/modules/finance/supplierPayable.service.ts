import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { Errors } from '@/middleware/errorHandler';
import { paiseToRupees, rupeesToPaise } from '@/modules/finance/money';
import {
  appliedRecoveryPaise,
  assessPayable,
  isCashMethod,
  outstandingPaise,
  resolvePayableRate,
  type PayableAssessment,
  type PayableStatus,
  type ProcessedRefundInput,
} from '@/modules/finance/supplierPayable.calc';

type Db = Prisma.TransactionClient | typeof prisma;

const OPEN_BATCH = new Set(['draft', 'in_review', 'finalised']);

function money(paise: number): string {
  return paiseToRupees(paise);
}

function quoteOf(breakdown: Prisma.JsonValue): { feePaise: number; feeUnknown: boolean; commissionPaise: number; netPaise: number } {
  if (!breakdown || typeof breakdown !== 'object' || Array.isArray(breakdown)) {
    return { feePaise: 0, feeUnknown: false, commissionPaise: 0, netPaise: 0 };
  }
  const row = breakdown as Record<string, unknown>;
  const amount = (value: unknown) => rupeesToPaise(typeof value === 'string' || typeof value === 'number' ? value : '0');
  return {
    feePaise: amount(row.quoteFee),
    feeUnknown: row.quoteFeeUnknown === true,
    commissionPaise: amount(row.quoteCommission),
    netPaise: amount(row.quoteNet),
  };
}

function previewOf(status: string, breakdown: Prisma.JsonValue) {
  if (status !== 'awaiting_completion' && status !== 'pending_capture') {
    return { feePaise: 0, feeUnknown: false, commissionPaise: 0, netPaise: 0 };
  }
  return quoteOf(breakdown);
}

function paymentInputs(payments: Array<{ amount: { toString(): string }; status: string; method: string | null; razorpayFeePaise: number | null; razorpayPaymentId: string | null }>) {
  return payments.map((payment) => ({
    amount: payment.amount.toString(),
    status: payment.status,
    method: payment.method,
    razorpayFeePaise: payment.razorpayFeePaise,
    hasRazorpayPayment: Boolean(payment.razorpayPaymentId),
  }));
}

async function agreementRate(
  db: Db,
  vendorId: string,
  at: Date,
): Promise<string | null> {
  const row = await db.supplierCommissionAgreement.findFirst({
    where: {
      vendorId,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    select: { ratePct: true },
  });
  return row ? row.ratePct.toString() : null;
}

async function currentVendorRate(db: Db, vendorId: string): Promise<string | null> {
  const vendor = await db.vendor.findUnique({
    where: { id: vendorId },
    select: { platformFeePct: true },
  });
  return vendor?.platformFeePct == null ? null : vendor.platformFeePct.toString();
}

function processedRefunds(input: {
  payments: Array<{ id: string; amount: Prisma.Decimal; status: string; method: string | null; razorpayPaymentId?: string | null }>;
  returnRequests: Array<{ id: string; status: string; resolutionType: string | null; refundAmount: Prisma.Decimal | null }>;
}): ProcessedRefundInput[] {
  const fromReturns = input.returnRequests
    .filter((row) => row.status === 'closed' && row.resolutionType === 'refund' && row.refundAmount != null && Number(row.refundAmount) > 0)
    .map((row) => ({ id: row.id, amount: row.refundAmount!.toString() }));
  const returnPaise = fromReturns.reduce((sum, row) => sum + rupeesToPaise(row.amount), 0);
  const refundedCash = input.payments.reduce((sum, payment) => {
    if (payment.status !== 'refunded' || !isCashMethod(payment.method, Boolean(payment.razorpayPaymentId))) return sum;
    return sum + Math.max(0, rupeesToPaise(payment.amount.toString()));
  }, 0);
  // Cash-method filtering happens in the calculator. The shortfall here is only
  // the part of a refunded payment that no closed return already explains.
  const shortfall = refundedCash - returnPaise;
  if (shortfall > 0) {
    const payment = input.payments.find((row) => row.status === 'refunded');
    fromReturns.push({
      id: `gateway:${payment?.id ?? 'refund'}`,
      amount: paiseToRupees(shortfall),
    });
  }
  return fromReturns;
}

async function manualPaise(db: Db, orderId: string): Promise<{ credit: number; debit: number }> {
  const rows = await db.supplierPayableEvent.findMany({
    where: { orderId, eventType: 'manual_adjustment', approvalStatus: 'approved' },
    select: { amount: true, payload: true },
  });
  let credit = 0;
  let debit = 0;
  for (const row of rows) {
    const direction = (row.payload as { direction?: string } | null)?.direction;
    const paise = rupeesToPaise(row.amount.toString());
    if (direction === 'credit') credit += paise;
    else debit += paise;
  }
  return { credit, debit };
}

export async function refreshSupplierPayable(orderId: string, db: Db = prisma) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      payments: { select: { id: true, amount: true, status: true, method: true, razorpayFeePaise: true, razorpayPaymentId: true } },
      coupon: { select: { vendorId: true } },
      returnRequests: { select: { id: true, status: true, resolutionType: true, refundAmount: true } },
      payableLine: { include: { batch: { select: { id: true, status: true } }, holds: { where: { releasedAt: null }, take: 1 } } },
    },
  });
  if (!order || order.status === 'draft') return null;

  const existing = order.payableLine;
  const locked = existing?.batch?.status === 'finalised' || existing?.batch?.status === 'settled' || existing?.status === 'settled';
  const refunds = processedRefunds(order);
  const manual = await manualPaise(db, orderId);
  const asOf = order.deliveredAt ?? new Date();
  const snapshottedAt = existing?.rateSnapshottedAt ?? null;
  const liveRate = resolvePayableRate({
    snapshottedAt,
    snapshottedRate: existing?.commissionRatePct == null ? null : existing.commissionRatePct.toString(),
    rateAtDelivery: snapshottedAt ? null : await agreementRate(db, order.vendorId, asOf),
    currentRate: snapshottedAt ? null : await currentVendorRate(db, order.vendorId),
  });
  const openHold = (existing?.holds.length ?? 0) > 0;
  const batchOpen = existing?.batch != null && (existing.batch.status === 'draft' || existing.batch.status === 'in_review');

  if (locked && existing) {
    await recordRecovery(db, existing.id, order.id, order.vendorId, {
      orderStatus: order.status,
      paymentMethod: order.paymentMethod,
      vendorId: order.vendorId,
      subtotal: order.subtotal.toString(),
      promoDiscount: order.promoDiscount.toString(),
      couponDiscount: order.couponDiscount.toString(),
      couponVendorId: order.coupon?.vendorId ?? null,
      payments: paymentInputs(order.payments),
      processedRefunds: refunds,
      ratePct: liveRate,
      onHold: false,
      inOpenBatch: false,
      manualCreditPaise: manual.credit,
      manualDebitPaise: manual.debit,
    }, existing.breakdown);
    return db.supplierPayableLine.findUnique({ where: { id: existing.id } });
  }

  const wouldBe = assessPayable({
    orderStatus: order.status,
    paymentMethod: order.paymentMethod,
    vendorId: order.vendorId,
    subtotal: order.subtotal.toString(),
    promoDiscount: order.promoDiscount.toString(),
    couponDiscount: order.couponDiscount.toString(),
    couponVendorId: order.coupon?.vendorId ?? null,
    payments: paymentInputs(order.payments),
    processedRefunds: refunds,
    ratePct: liveRate,
    onHold: openHold,
    inOpenBatch: false,
    manualCreditPaise: manual.credit,
    manualDebitPaise: manual.debit,
  });
  const keepInDraft = batchOpen && wouldBe.status === 'eligible';
  const assessed = keepInDraft
    ? assessPayable({
      orderStatus: order.status,
      paymentMethod: order.paymentMethod,
      vendorId: order.vendorId,
      subtotal: order.subtotal.toString(),
      promoDiscount: order.promoDiscount.toString(),
      couponDiscount: order.couponDiscount.toString(),
      couponVendorId: order.coupon?.vendorId ?? null,
      payments: paymentInputs(order.payments),
      processedRefunds: refunds,
      ratePct: liveRate,
      onHold: openHold,
      inOpenBatch: true,
      manualCreditPaise: manual.credit,
      manualDebitPaise: manual.debit,
    })
    : wouldBe;

  const snapshotRate = assessed.status !== 'commission_unconfigured'
    && assessed.status !== 'pending_capture'
    && assessed.status !== 'awaiting_completion'
    && assessed.status !== 'closed'
    && liveRate != null
    && order.status === 'delivered';

  const data = lineData(assessed, order.vendorId, keepInDraft ? existing!.financeBatchId : null);
  const line = await db.supplierPayableLine.upsert({
    where: { orderId: order.id },
    create: {
      orderId: order.id,
      ...data,
      commissionRatePct: liveRate,
      rateSnapshottedAt: snapshotRate ? new Date() : null,
    },
    update: {
      ...data,
      ...(existing?.rateSnapshottedAt
        ? {}
        : {
          commissionRatePct: liveRate,
          rateSnapshottedAt: snapshotRate ? new Date() : null,
        }),
    },
  });

  if (existing?.financeBatchId && existing.batch?.status === 'draft') {
    await recomputeDraftBatch(db, existing.financeBatchId);
  }
  return line;
}

function lineData(assessed: PayableAssessment, vendorId: string, financeBatchId: string | null) {
  return {
    vendorId,
    status: assessed.status as PayableStatus,
    commercialBase: money(assessed.commercialBasePaise),
    collectedAmount: money(assessed.netCollectedPaise),
    refundedAmount: money(assessed.refundedPaise),
    recognisedBase: money(assessed.recognisedBasePaise),
    commissionAmount: money(assessed.commissionPaise),
    razorpayFee: assessed.razorpayFeeUnknown ? null : money(assessed.razorpayFeePaise),
    razorpayFeeUnknown: assessed.razorpayFeeUnknown,
    netPayable: money(assessed.netPayablePaise),
    provisionalBase: money(assessed.provisionalBasePaise),
    blockedSale: money(assessed.blockedSalePaise),
    aboveCash: money(assessed.aboveCashPaise),
    financeBatchId,
    calculatedAt: new Date(),
    breakdown: {
      taxTreatment: assessed.taxTreatment,
      supplierPromo: money(assessed.supplierPromoPaise),
      supplierCoupon: money(assessed.supplierCouponPaise),
      platformCoupon: money(assessed.platformCouponPaise),
      grossCollected: money(assessed.grossCollectedPaise),
      refundsRejected: money(assessed.refundsRejectedPaise),
      provisionalCommission: money(assessed.provisionalCommissionPaise),
      quoteFee: money(assessed.quoteFeePaise),
      quoteFeeUnknown: assessed.quoteFeeUnknown,
      quoteCommission: money(assessed.quoteCommissionPaise),
      quoteNet: money(assessed.quoteNetPaise),
      ratePct: assessed.ratePct,
      aboveCash: money(assessed.aboveCashPaise),
    },
  };
}

async function recordRecovery(
  db: Db,
  lineId: string,
  orderId: string,
  vendorId: string,
  base: Parameters<typeof assessPayable>[0],
  breakdown: Prisma.JsonValue,
) {
  const stored = (breakdown as { lockedRefundIds?: string[] } | null)?.lockedRefundIds;
  if (!stored) {
    const current = base.processedRefunds.map((refund) => refund.id);
    const previous = (breakdown && typeof breakdown === 'object' && !Array.isArray(breakdown))
      ? breakdown as Record<string, unknown>
      : {};
    await db.supplierPayableLine.update({
      where: { id: lineId },
      data: { breakdown: { ...previous, lockedRefundIds: current } },
    });
    return;
  }
  const lockedIds = new Set(stored);
  const known = base.processedRefunds.filter((refund) => lockedIds.has(refund.id));
  const newcomers = base.processedRefunds.filter((refund) => !lockedIds.has(refund.id));
  let running = known;
  for (const refund of newcomers) {
    const before = assessPayable({ ...base, processedRefunds: running });
    const after = assessPayable({ ...base, processedRefunds: [...running, refund] });
    const recovery = before.netPayablePaise - after.netPayablePaise;
    if (recovery > 0) {
      const sourceId = refund.id;
      const existing = await db.supplierPayableEvent.findUnique({
        where: { sourceType_sourceId: { sourceType: 'recovery', sourceId } },
        select: { id: true },
      });
      if (!existing) {
        await db.supplierPayableEvent.create({
          data: {
            lineId,
            orderId,
            vendorId,
            eventType: 'recovery',
            sourceType: 'recovery',
            sourceId,
            amount: money(recovery),
            reason: 'Refund or correction after the supplier amount was locked',
            payload: { refundId: refund.id },
          },
        });
      }
    }
    running = [...running, refund];
  }
}

export async function recomputeDraftBatch(db: Db, batchId: string) {
  const batch = await db.financeSettlementBatch.findUnique({
    where: { id: batchId },
    select: { status: true },
  });
  if (!batch || batch.status !== 'draft') return;
  const lines = await db.supplierPayableLine.findMany({
    where: { financeBatchId: batchId },
  });
  const applied = await db.supplierPayableEvent.findMany({
    where: { appliedBatchId: batchId, eventType: 'recovery' },
    select: { amount: true },
  });
  const commercial = lines.reduce((sum, line) => sum + rupeesToPaise(line.recognisedBase.toString()), 0);
  const commission = lines.reduce((sum, line) => sum + rupeesToPaise(line.commissionAmount.toString()), 0);
  const lineNet = lines.reduce((sum, line) => sum + rupeesToPaise(line.netPayable.toString()), 0);
  const recovery = applied.reduce((sum, row) => sum + rupeesToPaise(row.amount.toString()), 0);
  const appliedRecovery = Math.min(recovery, Math.max(0, lineNet));
  await db.financeSettlementBatch.update({
    where: { id: batchId },
    data: {
      commercialBase: money(commercial),
      commissionAmount: money(commission),
      adjustmentAmount: money(-appliedRecovery),
      netAmount: money(lineNet - appliedRecovery),
      orderCount: lines.length,
    },
  });
}

export async function setSupplierCommission(input: {
  vendorId: string;
  ratePct: number | null;
  reason: string;
  actorId: string;
}) {
  const reason = input.reason.trim();
  if (reason.length < 8) throw Errors.badRequest('A reason of at least 8 characters is required');
  if (input.ratePct != null && (!Number.isFinite(input.ratePct) || input.ratePct < 0 || input.ratePct > 100)) {
    throw Errors.badRequest('Commission rate must be between 0 and 100, or empty when it is not configured');
  }
  const result = await prisma.$transaction(async (tx) => {
    const vendor = await tx.vendor.findUnique({
      where: { id: input.vendorId },
      select: { platformFeePct: true },
    });
    if (!vendor) throw Errors.notFound('Supplier');
    const previous = vendor.platformFeePct == null ? null : vendor.platformFeePct.toString();
    const now = new Date();
    await tx.supplierCommissionAgreement.updateMany({
      where: { vendorId: input.vendorId, effectiveTo: null },
      data: { effectiveTo: now },
    });
    if (input.ratePct != null) {
      await tx.supplierCommissionAgreement.create({
        data: {
          vendorId: input.vendorId,
          ratePct: input.ratePct.toFixed(2),
          effectiveFrom: now,
          reason,
          actorId: input.actorId,
        },
      });
    }
    await tx.vendor.update({
      where: { id: input.vendorId },
      data: { platformFeePct: input.ratePct == null ? null : input.ratePct.toFixed(2) },
    });
    return { previous, next: input.ratePct == null ? null : input.ratePct.toFixed(2) };
  });
  await refreshVendorPayables(input.vendorId);
  return result;
}

export async function refreshVendorPayables(vendorId: string) {
  const orders = await prisma.order.findMany({
    where: { vendorId, status: { not: 'draft' } },
    select: { id: true },
    take: 500,
  });
  for (const order of orders) {
    await refreshSupplierPayable(order.id);
  }
}

export interface PayableListQuery {
  q?: string;
  status?: string;
  commission?: 'configured' | 'unconfigured' | 'zero' | '';
  from?: string;
  to?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export async function listSupplierPayables(query: PayableListQuery) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));
  const vendors = await prisma.vendor.findMany({
    where: query.q
      ? {
        OR: [
          { businessName: { contains: query.q, mode: 'insensitive' } },
          { displayName: { contains: query.q, mode: 'insensitive' } },
          { vendorCode: { contains: query.q, mode: 'insensitive' } },
        ],
      }
      : undefined,
    select: {
      id: true,
      businessName: true,
      displayName: true,
      vendorCode: true,
      logoUrl: true,
      platformFeePct: true,
      settlementCycle: true,
    },
    take: 300,
  });

  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  if (to) to.setHours(23, 59, 59, 999);
  const period = from || to
    ? { gte: from ?? new Date(0), lte: to ?? new Date() }
    : null;

  const vendorIds = vendors.map((vendor) => vendor.id);
  if (vendorIds.length > 0) {
    const unrefreshed = await prisma.order.findMany({
      where: {
        vendorId: { in: vendorIds },
        status: { not: 'draft' },
        payableLine: null,
      },
      select: { id: true },
      take: 50,
    });
    for (const order of unrefreshed) {
      await refreshSupplierPayable(order.id);
    }
  }
  const lines = vendorIds.length === 0
    ? []
    : await prisma.supplierPayableLine.findMany({
      where: { vendorId: { in: vendorIds } },
      include: { order: { select: { deliveredAt: true, orderNumber: true } } },
    });
  const batches = vendorIds.length === 0
    ? []
    : await prisma.financeSettlementBatch.findMany({
      where: { vendorId: { in: vendorIds } },
      orderBy: { createdAt: 'desc' },
    });
  const recoveries = vendorIds.length === 0
    ? []
    : await prisma.supplierPayableEvent.findMany({
      where: { vendorId: { in: vendorIds }, eventType: 'recovery', appliedBatchId: null },
      select: { vendorId: true, amount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

  const recoveryPaiseByVendor = new Map<string, number[]>();
  for (const row of recoveries) {
    const amounts = recoveryPaiseByVendor.get(row.vendorId) ?? [];
    amounts.push(rupeesToPaise(row.amount.toString()));
    recoveryPaiseByVendor.set(row.vendorId, amounts);
  }

  const rows = vendors.map((vendor) => {
    const own = lines.filter((line) => line.vendorId === vendor.id);
    const openRecoveryPaise = recoveryPaiseByVendor.get(vendor.id) ?? [];
    const recovery = openRecoveryPaise.reduce((sum, amount) => sum + amount, 0);
    const eligibleNetPaise = own
      .filter((line) => line.status === 'eligible')
      .reduce((sum, line) => sum + rupeesToPaise(line.netPayable.toString()), 0);
    const openBatches = batches.filter((batch) => batch.vendorId === vendor.id && OPEN_BATCH.has(batch.status));
    const parts = [
      ...own.filter((line) => line.status === 'eligible' || line.status === 'on_hold').map((line) => ({
        status: line.status,
        netPayablePaise: rupeesToPaise(line.netPayable.toString()),
      })),
      ...openBatches.map((batch) => ({
        status: 'in_batch' as const,
        netPayablePaise: rupeesToPaise(batch.netAmount.toString()),
      })),
    ];
    const preview = own.reduce((sum, line) => {
      const quote = previewOf(line.status, line.breakdown);
      return {
        feePaise: sum.feePaise + quote.feePaise,
        feeUnknown: sum.feeUnknown || quote.feeUnknown,
        commissionPaise: sum.commissionPaise + quote.commissionPaise,
        netPaise: sum.netPaise + quote.netPaise,
      };
    }, { feePaise: 0, feeUnknown: false, commissionPaise: 0, netPaise: 0 });
    const settledBatches = batches.filter((batch) => batch.vendorId === vendor.id && batch.status === 'settled');
    const latestSettled = settledBatches.reduce<(typeof settledBatches)[number] | undefined>((latest, batch) => {
      if (!batch.settledAt) return latest;
      if (!latest?.settledAt || batch.settledAt.getTime() > latest.settledAt.getTime()) return batch;
      return latest;
    }, undefined);
    const settledPaise = settledBatches.reduce((sum, batch) => sum + rupeesToPaise(batch.netAmount.toString()), 0);
    return {
      vendorId: vendor.id,
      supplier: (vendor.displayName?.trim() || vendor.businessName).trim(),
      supplierCode: vendor.vendorCode,
      logoUrl: vendor.logoUrl,
      ratePct: vendor.platformFeePct == null ? null : vendor.platformFeePct.toString(),
      commissionConfigured: vendor.platformFeePct != null,
      settlementCycle: vendor.settlementCycle,
      eligibleSalePaise: own.reduce((sum, line) => sum + rupeesToPaise(line.collectedAmount.toString()), 0),
      razorpayFeePaise: own.reduce((sum, line) => sum + (line.razorpayFee == null ? 0 : rupeesToPaise(line.razorpayFee.toString())), 0) + preview.feePaise,
      razorpayFeeUnknown: own.some((line) => line.razorpayFeeUnknown) || preview.feeUnknown,
      commissionPaise: own.reduce((sum, line) => sum + rupeesToPaise(line.commissionAmount.toString()), 0) + preview.commissionPaise,
      shownToPayPaise: Math.max(0, eligibleNetPaise - appliedRecoveryPaise(openRecoveryPaise, eligibleNetPaise)),
      waitingDelivery: own.some((line) => line.status === 'awaiting_completion'),
      adjustmentPaise: own.reduce((sum, line) => sum + rupeesToPaise(line.aboveCash.toString()), 0),
      outstandingPaise: outstandingPaise(parts, recovery),
      eligiblePaise: eligibleNetPaise,
      onHoldPaise: own.filter((line) => line.status === 'on_hold').reduce((sum, line) => sum + rupeesToPaise(line.netPayable.toString()), 0),
      settledPaise,
      latestSettlement: latestSettled?.settledAt?.toISOString() ?? null,
      unconfigured: own.some((line) => line.status === 'commission_unconfigured') || vendor.platformFeePct == null,
      orders: own.map((line) => ({ orderId: line.orderId, orderNumber: line.order.orderNumber })),
    };
  });

  let filtered = rows;
  if (query.commission === 'unconfigured') filtered = filtered.filter((row) => row.ratePct == null);
  if (query.commission === 'configured') filtered = filtered.filter((row) => row.ratePct != null && Number(row.ratePct) !== 0);
  if (query.commission === 'zero') filtered = filtered.filter((row) => row.ratePct != null && Number(row.ratePct) === 0);
  if (query.status === 'eligible') filtered = filtered.filter((row) => row.eligiblePaise > 0);
  if (query.status === 'on_hold') filtered = filtered.filter((row) => row.onHoldPaise > 0);
  if (query.status === 'outstanding') filtered = filtered.filter((row) => row.outstandingPaise !== 0);
  if (query.status === 'settled') filtered = filtered.filter((row) => row.settledPaise > 0);

  const sort = query.sort ?? 'outstanding';
  filtered.sort((a, b) => {
    const dir = sort.startsWith('-') ? -1 : 1;
    const key = sort.replace(/^-/, '');
    const attention = (row: { shownToPayPaise: number; eligibleSalePaise: number }) => (
      row.shownToPayPaise > 0 ? row.shownToPayPaise : row.eligibleSalePaise
    );
    const settledAt = (iso: string | null) => {
      if (!iso) return 0;
      const ms = Date.parse(iso);
      return Number.isFinite(ms) ? ms : 0;
    };
    const map: Record<string, number> = {
      supplier: a.supplier.localeCompare(b.supplier),
      outstanding: attention(a) - attention(b),
      eligible: a.eligiblePaise - b.eligiblePaise,
      commission: a.commissionPaise - b.commissionPaise,
      settled: a.settledPaise - b.settledPaise,
      latest: settledAt(a.latestSettlement) - settledAt(b.latestSettlement),
      ready: (a.eligiblePaise > 0 ? 1 : 0) - (b.eligiblePaise > 0 ? 1 : 0),
    };
    const primary = (map[key] ?? a.outstandingPaise - b.outstandingPaise) * (key === 'supplier' ? 1 : dir);
    if (primary !== 0) return primary;
    return attention(b) - attention(a);
  });

  const outstanding = filtered.reduce((sum, row) => sum + row.outstandingPaise, 0);
  const eligible = filtered.reduce((sum, row) => sum + row.shownToPayPaise, 0);
  const onHold = filtered.reduce((sum, row) => sum + row.onHoldPaise, 0);
  const pendingCapture = lines
    .filter((line) => line.status === 'pending_capture')
    .reduce((sum, line) => sum + rupeesToPaise(line.commercialBase.toString()), 0);
  const awaiting = lines
    .filter((line) => line.status === 'awaiting_completion')
    .reduce((sum, line) => sum + rupeesToPaise(line.provisionalBase.toString()), 0);
  const blocked = lines
    .filter((line) => line.status === 'commission_unconfigured')
    .reduce((sum, line) => sum + rupeesToPaise(line.blockedSale.toString()), 0);
  const commission = lines.reduce((sum, line) => {
    if (period) {
      const deliveredAt = line.order.deliveredAt;
      if (!deliveredAt || deliveredAt < period.gte || deliveredAt > period.lte) return sum;
    }
    return sum + rupeesToPaise(line.commissionAmount.toString()) + previewOf(line.status, line.breakdown).commissionPaise;
  }, 0);
  const quotedNet = lines.reduce((sum, line) => sum + previewOf(line.status, line.breakdown).netPaise, 0);
  const settledPeriod = batches
    .filter((batch) => batch.status === 'settled' && (!period || (batch.settledAt != null && batch.settledAt >= period.gte && batch.settledAt <= period.lte)))
    .reduce((sum, batch) => sum + rupeesToPaise(batch.netAmount.toString()), 0);

  const start = (page - 1) * pageSize;
  return {
    kpis: {
      outstandingPaise: outstanding,
      eligiblePaise: eligible,
      customerPaidPaise: lines.reduce((sum, line) => sum + rupeesToPaise(line.collectedAmount.toString()), 0),
      razorpayFeePaise: lines.reduce((sum, line) => sum + (line.razorpayFee == null ? 0 : rupeesToPaise(line.razorpayFee.toString())) + previewOf(line.status, line.breakdown).feePaise, 0),
      razorpayFeeUnknown: lines.some((line) => line.razorpayFeeUnknown || previewOf(line.status, line.breakdown).feeUnknown),
      quotedNetPaise: quotedNet,
      pendingCapturePaise: pendingCapture,
      awaitingCompletionPaise: awaiting,
      commissionPaise: commission,
      settledPeriodPaise: settledPeriod,
      onHoldPaise: onHold,
      blockedSalePaise: blocked,
      periodAppliesTo: ['commission', 'settled'],
      outstandingIsCurrent: true,
    },
    rows: filtered.slice(start, start + pageSize),
    pagination: { page, pageSize, total: filtered.length },
    batches: batches.slice(0, 30).map((batch) => ({
      id: batch.id,
      batchNumber: batch.batchNumber,
      vendorId: batch.vendorId,
      status: batch.status,
      net: batch.netAmount.toString(),
      commission: batch.commissionAmount.toString(),
      adjustment: batch.adjustmentAmount.toString(),
      orderCount: batch.orderCount,
      createdById: batch.createdById,
      finalisedById: batch.finalisedById,
      settledById: batch.settledById,
      settledAt: batch.settledAt,
      bankReference: batch.bankReference,
      periodStart: batch.periodStart,
      periodEnd: batch.periodEnd,
    })),
  };
}

export async function getSupplierPayableDetail(vendorId: string) {
  await refreshVendorPayables(vendorId);
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      id: true,
      businessName: true,
      displayName: true,
      vendorCode: true,
      platformFeePct: true,
      settlementCycle: true,
      logoUrl: true,
    },
  });
  if (!vendor) throw Errors.notFound('Supplier');
  const lines = await prisma.supplierPayableLine.findMany({
    where: { vendorId },
    include: {
      order: { select: { orderNumber: true, status: true, paymentStatus: true, paymentMethod: true, deliveredAt: true, totalAmount: true } },
      holds: { where: { releasedAt: null }, take: 1 },
    },
    orderBy: { calculatedAt: 'desc' },
  });
  const batches = await prisma.financeSettlementBatch.findMany({
    where: { vendorId },
    include: { events: { orderBy: { createdAt: 'asc' } }, _count: { select: { lines: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const recoveries = await prisma.supplierPayableEvent.findMany({
    where: { vendorId, eventType: 'recovery' },
    orderBy: { createdAt: 'desc' },
  });
  const agreements = await prisma.supplierCommissionAgreement.findMany({
    where: { vendorId },
    orderBy: { effectiveFrom: 'desc' },
    take: 10,
  });
  return { vendor, lines, batches, recoveries, agreements };
}

export async function setSettlementCycle(vendorId: string, cycle: 'manual' | 'weekly') {
  await prisma.vendor.update({ where: { id: vendorId }, data: { settlementCycle: cycle } });
}

export async function placeHold(lineId: string, actorId: string, reason: string) {
  const trimmed = reason.trim();
  if (trimmed.length < 8) throw Errors.badRequest('A hold reason is required');
  return prisma.$transaction(async (tx) => {
    const line = await tx.supplierPayableLine.findUnique({ where: { id: lineId } });
    if (!line) throw Errors.notFound('Payable');
    if (line.status === 'settled' || line.status === 'in_batch') {
      throw Errors.badRequest('A line inside a batch or already settled cannot be held');
    }
    await tx.supplierPayableHold.create({
      data: { lineId, reason: trimmed, openedById: actorId },
    });
    await tx.supplierPayableEvent.create({
      data: {
        lineId,
        orderId: line.orderId,
        vendorId: line.vendorId,
        eventType: 'hold',
        sourceType: 'hold',
        sourceId: `${lineId}:${Date.now()}`,
        reason: trimmed,
        actorId,
      },
    });
    return refreshSupplierPayable(line.orderId, tx);
  });
}

export async function releaseHold(lineId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const line = await tx.supplierPayableLine.findUnique({ where: { id: lineId } });
    if (!line) throw Errors.notFound('Payable');
    await tx.supplierPayableHold.updateMany({
      where: { lineId, releasedAt: null },
      data: { releasedAt: new Date(), releasedById: actorId },
    });
    await tx.supplierPayableEvent.create({
      data: {
        lineId,
        orderId: line.orderId,
        vendorId: line.vendorId,
        eventType: 'release',
        sourceType: 'release',
        sourceId: `${lineId}:release:${Date.now()}`,
        actorId,
      },
    });
    return refreshSupplierPayable(line.orderId, tx);
  });
}

export async function proposeAdjustment(input: {
  orderId: string;
  amountPaise: number;
  direction: 'credit' | 'debit';
  reason: string;
  actorId: string;
}) {
  const reason = input.reason.trim();
  if (reason.length < 8) throw Errors.badRequest('An adjustment reason is required');
  if (input.amountPaise <= 0) throw Errors.badRequest('Adjustment amount must be greater than zero');
  const line = await prisma.supplierPayableLine.findUnique({ where: { orderId: input.orderId } });
  if (!line) throw Errors.notFound('Payable');
  if (line.status === 'settled') throw Errors.badRequest('Settled lines are corrected with a recovery, not an edit');
  const id = crypto.randomUUID();
  await prisma.supplierPayableEvent.create({
    data: {
      lineId: line.id,
      orderId: input.orderId,
      vendorId: line.vendorId,
      eventType: 'manual_adjustment',
      sourceType: 'manual_adjustment',
      sourceId: id,
      amount: money(input.amountPaise),
      reason,
      actorId: input.actorId,
      approvalStatus: 'pending',
      payload: { direction: input.direction },
    },
  });
  return { id, approvalStatus: 'pending' as const };
}

export async function approveAdjustment(sourceId: string, actorId: string) {
  const event = await prisma.supplierPayableEvent.findUnique({ where: { sourceType_sourceId: { sourceType: 'manual_adjustment', sourceId } } });
  if (!event || event.eventType !== 'manual_adjustment') throw Errors.notFound('Adjustment');
  if (event.approvalStatus !== 'pending') throw Errors.badRequest('This adjustment is not waiting for approval');
  if (event.actorId === actorId) throw Errors.badRequest('A different person must approve this adjustment');
  await prisma.supplierPayableEvent.update({
    where: { id: event.id },
    data: { approvalStatus: 'approved' },
  });
  return refreshSupplierPayable(event.orderId);
}

export function statementCsv(detail: Awaited<ReturnType<typeof getSupplierPayableDetail>>): string {
  const header = ['Order', 'Status', 'Commercial base', 'Collected', 'Rate', 'Commission', 'Net payable', 'Why'];
  const rows = detail.lines.map((line) => {
    const breakdown = line.breakdown as { ratePct?: string | null };
    return [
      line.order.orderNumber,
      line.status,
      line.commercialBase.toString(),
      line.collectedAmount.toString(),
      breakdown.ratePct ?? 'Commission not configured',
      line.commissionAmount.toString(),
      line.netPayable.toString(),
      line.status,
    ].join(',');
  });
  return [header.join(','), ...rows].join('\n');
}
