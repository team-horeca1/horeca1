import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { Errors } from '@/middleware/errorHandler';
import { paiseToRupees, rupeesToPaise } from '@/modules/finance/money';
import { claimOrders, releaseFinanceClaims, sweepOrphanFinanceClaims } from '@/modules/finance/claims';
import { refreshSupplierPayable, recomputeDraftBatch } from '@/modules/finance/supplierPayable.service';
import {
  cancelDraft,
  finaliseBatch,
  markBatchSettled,
  SettlementTransitionError,
  type BatchRecord,
} from '@/modules/finance/supplierSettlement.state';

function asRecord(batch: {
  status: BatchRecord['status'];
  createdById: string;
  finalisedById: string | null;
  settledById: string | null;
  settledAt: Date | null;
  bankReference: string | null;
  cancelledById: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  netAmount: Prisma.Decimal;
}): BatchRecord {
  return {
    status: batch.status,
    createdById: batch.createdById,
    finalisedById: batch.finalisedById,
    settledById: batch.settledById,
    settledAt: batch.settledAt?.toISOString() ?? null,
    bankReference: batch.bankReference,
    cancelledById: batch.cancelledById,
    cancelledAt: batch.cancelledAt?.toISOString() ?? null,
    cancelReason: batch.cancelReason,
    netPaise: rupeesToPaise(batch.netAmount.toString()),
  };
}

function fail(error: unknown): never {
  if (error instanceof SettlementTransitionError) throw Errors.badRequest(error.message);
  throw error;
}

async function applyOpenRecovery(tx: Prisma.TransactionClient, vendorId: string, batchId: string, lineNetPaise: number) {
  const open = await tx.supplierPayableEvent.findMany({
    where: { vendorId, eventType: 'recovery', appliedBatchId: null },
    orderBy: { createdAt: 'asc' },
  });
  let room = Math.max(0, lineNetPaise);
  for (const event of open) {
    if (room <= 0) break;
    const amount = rupeesToPaise(event.amount.toString());
    if (amount > room) continue;
    await tx.supplierPayableEvent.update({
      where: { id: event.id },
      data: { appliedBatchId: batchId },
    });
    room -= amount;
  }
}

export async function createFinanceDraft(input: {
  vendorId: string;
  actorId: string;
  orderIds?: string[];
  idempotencyKey?: string;
  periodStart?: Date;
  periodEnd?: Date;
}) {
  if (input.idempotencyKey) {
    const existing = await prisma.financeSettlementBatch.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return { batch: existing, replayed: true };
  }
  await sweepOrphanFinanceClaims();
  for (const orderId of input.orderIds ?? []) {
    await refreshSupplierPayable(orderId);
  }
  if (!input.orderIds) {
    const orders = await prisma.order.findMany({
      where: { vendorId: input.vendorId, status: 'delivered' },
      select: { id: true },
      take: 500,
    });
    for (const order of orders) await refreshSupplierPayable(order.id);
  }

  return prisma.$transaction(async (tx) => {
    const candidates = await tx.supplierPayableLine.findMany({
      where: {
        vendorId: input.vendorId,
        status: 'eligible',
        ...(input.orderIds ? { orderId: { in: input.orderIds } } : {}),
      },
    });
    if (candidates.length === 0) throw Errors.badRequest('No eligible supplier lines to settle');
    const { claimed, blocked } = await claimOrders(
      tx,
      candidates.map((line) => line.orderId),
      'finance',
    );
    const lines = candidates.filter((line) => claimed.includes(line.orderId));
    if (lines.length === 0) {
      throw Errors.badRequest('Those orders are already claimed by another settlement');
    }
    const now = new Date();
    const periodStart = input.periodStart ?? now;
    const periodEnd = input.periodEnd ?? now;
    const batch = await tx.financeSettlementBatch.create({
      data: {
        batchNumber: `SPB-${now.getFullYear()}-${now.getTime().toString().slice(-8)}`,
        vendorId: input.vendorId,
        status: 'draft',
        periodStart,
        periodEnd,
        createdById: input.actorId,
        idempotencyKey: input.idempotencyKey,
        orderCount: lines.length,
      },
    });
    await tx.supplierSettlementClaim.updateMany({
      where: { orderId: { in: lines.map((line) => line.orderId) }, releasedAt: null, owner: 'finance' },
      data: { financeBatchId: batch.id },
    });
    await tx.supplierPayableLine.updateMany({
      where: { id: { in: lines.map((line) => line.id) } },
      data: { financeBatchId: batch.id, status: 'in_batch' },
    });
    const lineNet = lines.reduce((sum, line) => sum + rupeesToPaise(line.netPayable.toString()), 0);
    await applyOpenRecovery(tx, input.vendorId, batch.id, lineNet);
    await tx.financeSettlementEvent.create({
      data: {
        batchId: batch.id,
        action: 'drafted',
        actorId: input.actorId,
        metadata: { blocked, orderIds: lines.map((line) => line.orderId) },
      },
    });
    await recomputeDraftBatch(tx, batch.id);
    return { batch: await tx.financeSettlementBatch.findUniqueOrThrow({ where: { id: batch.id } }), replayed: false };
  });
}

export async function cancelFinanceDraft(batchId: string, actorId: string, reason: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const batch = await tx.financeSettlementBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw Errors.notFound('Settlement batch');
      const next = cancelDraft(asRecord(batch), actorId, reason, new Date().toISOString());
      const detached = await tx.supplierPayableLine.findMany({
        where: { financeBatchId: batchId },
        select: { orderId: true },
      });
      await tx.supplierPayableLine.updateMany({
        where: { financeBatchId: batchId },
        data: { financeBatchId: null, status: 'eligible' },
      });
      await tx.supplierPayableEvent.updateMany({
        where: { appliedBatchId: batchId },
        data: { appliedBatchId: null },
      });
      await releaseFinanceClaims(tx, batchId);
      const updated = await tx.financeSettlementBatch.update({
        where: { id: batchId },
        data: {
          status: 'cancelled',
          cancelledById: next.cancelledById,
          cancelledAt: new Date(next.cancelledAt!),
          cancelReason: next.cancelReason,
        },
      });
      await tx.financeSettlementEvent.create({
        data: { batchId, action: 'cancelled', actorId, reason: next.cancelReason },
      });
      for (const line of detached) await refreshSupplierPayable(line.orderId, tx);
      return updated;
    });
  } catch (error) {
    fail(error);
  }
}

export async function finaliseFinanceBatch(batchId: string, actorId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const batch = await tx.financeSettlementBatch.findUnique({
        where: { id: batchId },
        include: { lines: { include: { order: { include: { returnRequests: { select: { id: true, status: true, resolutionType: true, refundAmount: true } } } } } } },
      });
      if (!batch) throw Errors.notFound('Settlement batch');
      const next = finaliseBatch(asRecord(batch), actorId);
      for (const line of batch.lines) {
        const lockedRefundIds = line.order.returnRequests
          .filter((row) => row.status === 'closed' && row.resolutionType === 'refund' && row.refundAmount != null)
          .map((row) => row.id);
        const breakdown = (line.breakdown && typeof line.breakdown === 'object' && !Array.isArray(line.breakdown))
          ? line.breakdown as Record<string, unknown>
          : {};
        await tx.supplierPayableLine.update({
          where: { id: line.id },
          data: { breakdown: { ...breakdown, lockedRefundIds } },
        });
      }
      const updated = await tx.financeSettlementBatch.update({
        where: { id: batchId },
        data: { status: 'finalised', finalisedById: actorId },
      });
      await tx.financeSettlementEvent.create({
        data: { batchId, action: 'finalised', actorId },
      });
      return { ...updated, status: next.status };
    });
  } catch (error) {
    fail(error);
  }
}

async function clearProvisionalWalletCredit(
  tx: Prisma.TransactionClient,
  orderId: string,
  vendorId: string,
  batchId: string,
) {
  const legacy = await tx.vendorSettlementOrder.findFirst({ where: { orderId }, select: { id: true } });
  if (legacy) return { posted: false, reason: 'legacy_settlement' as const };
  const already = await tx.vendorWalletTxn.findFirst({
    where: { referenceId: orderId, referenceType: 'finance_settlement_release' },
  });
  if (already) return { posted: false, reason: 'already_released' as const };
  const credit = await tx.vendorWalletTxn.findFirst({
    where: { referenceId: orderId, referenceType: 'order', type: 'order_credit' },
  });
  if (!credit) return { posted: false, reason: 'no_wallet_credit' as const };
  const refunds = await tx.vendorWalletTxn.findMany({
    where: { referenceId: orderId, referenceType: 'order_refund', type: 'refund_debit' },
  });
  const creditPaise = rupeesToPaise((credit.netAmount ?? credit.amount).toString());
  const refundPaise = refunds.reduce((sum, row) => sum + rupeesToPaise(row.amount.toString()), 0);
  const remaining = Math.max(0, creditPaise - refundPaise);
  if (remaining <= 0) return { posted: false, reason: 'nothing_remaining' as const };

  const wallet = await tx.vendorWallet.upsert({
    where: { vendorId },
    create: { vendorId, balance: 0, pendingAmount: 0 },
    update: {},
  });
  const nextBalance = rupeesToPaise(wallet.balance.toString()) - remaining;
  const nextPending = Math.max(0, rupeesToPaise(wallet.pendingAmount.toString()) - remaining);
  await tx.vendorWalletTxn.create({
    data: {
      walletId: wallet.id,
      type: 'settlement_debit',
      amount: paiseToRupees(remaining),
      balanceAfter: paiseToRupees(nextBalance),
      referenceId: orderId,
      referenceType: 'finance_settlement_release',
      netAmount: paiseToRupees(remaining),
      notes: `Clears the provisional wallet credit for this order after finance batch ${batchId} was marked settled. This is not a bank transfer.`,
    },
  });
  await tx.vendorWallet.update({
    where: { id: wallet.id },
    data: {
      balance: paiseToRupees(nextBalance),
      pendingAmount: paiseToRupees(nextPending),
    },
  });
  return { posted: true, amountPaise: remaining };
}

export async function markFinanceBatchSettled(batchId: string, actorId: string, utr: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const batch = await tx.financeSettlementBatch.findUnique({
        where: { id: batchId },
        include: { lines: { select: { orderId: true, vendorId: true } } },
      });
      if (!batch) throw Errors.notFound('Settlement batch');
      const next = markBatchSettled(asRecord(batch), actorId, utr, new Date().toISOString());
      if (batch.status === 'settled') {
        return { batch, replayed: true, walletReleases: [] as Array<{ orderId: string; posted: boolean }> };
      }
      const updated = await tx.financeSettlementBatch.update({
        where: { id: batchId },
        data: {
          status: 'settled',
          settledById: actorId,
          settledAt: new Date(next.settledAt!),
          bankReference: next.bankReference,
        },
      });
      await tx.supplierPayableLine.updateMany({
        where: { financeBatchId: batchId },
        data: { status: 'settled' },
      });
      const walletReleases = [];
      for (const line of batch.lines) {
        walletReleases.push({
          orderId: line.orderId,
          ...(await clearProvisionalWalletCredit(tx, line.orderId, line.vendorId, batchId)),
        });
      }
      await tx.financeSettlementEvent.create({
        data: {
          batchId,
          action: 'settled',
          actorId,
          metadata: {
            bankReference: next.bankReference,
            bankVerified: false,
            walletReleases,
          },
          reason: 'Operator recorded a UTR. The bank was not contacted.',
        },
      });
      return { batch: updated, replayed: false, walletReleases };
    });
  } catch (error) {
    fail(error);
  }
}

export async function runWeeklyFinanceDrafts() {
  await sweepOrphanFinanceClaims();
  const vendors = await prisma.vendor.findMany({
    where: { settlementCycle: 'weekly' },
    select: { id: true },
  });
  let drafts = 0;
  for (const vendor of vendors) {
    const open = await prisma.financeSettlementBatch.findFirst({
      where: { vendorId: vendor.id, status: { in: ['draft', 'in_review', 'finalised'] } },
      select: { id: true },
    });
    if (open) continue;
    try {
      await createFinanceDraft({
        vendorId: vendor.id,
        actorId: vendor.id,
        idempotencyKey: `weekly:${vendor.id}:${new Date().toISOString().slice(0, 10)}`,
      });
      drafts += 1;
    } catch (error) {
      if (error instanceof Error && /No eligible/.test(error.message)) continue;
      throw error;
    }
  }
  return { vendors: vendors.length, drafts };
}
