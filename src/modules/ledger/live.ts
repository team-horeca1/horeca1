import type { Prisma } from '@prisma/client';
import { ledgerLiveEnabled } from './flags';
import { reversalLines } from './post';
import { rupeesToPaise, type DraftLine } from './money';
import { shadowPost } from './shadow';

/**
 * Live-only wallet restore after a gateway refund. Returns the spent wallet
 * amount to the same journal buckets the spend used. No-op unless LEDGER_LIVE is on.
 */
export async function liveRestoreWalletAfterRefund(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  if (!ledgerLiveEnabled()) return;
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, walletApplied: true },
  });
  if (!order || rupeesToPaise(order.walletApplied) <= 0) return;
  const existing = await tx.walletTransaction.findFirst({
    where: { referenceId: order.id, referenceType: 'order_redemption_refund', type: 'credit' },
  });
  if (existing) return;

  const spend = await tx.journalEntry.findFirst({
    where: { idempotencyKey: `order:${order.id}:wallet_spend` },
    include: { lines: { include: { account: true } } },
  });
  const wallet = await tx.wallet.upsert({
    where: { userId: order.userId },
    create: { userId: order.userId, balance: order.walletApplied },
    update: { balance: { increment: order.walletApplied } },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'credit',
      amount: order.walletApplied,
      referenceId: order.id,
      referenceType: 'order_redemption_refund',
      source: 'reward',
      funderType: 'platform',
      notes: 'Returned after the Razorpay refund',
    },
  });
  if (!spend) return;
  const original: DraftLine[] = spend.lines.map((row) => ({
    code: row.account.code,
    name: row.account.name,
    type: row.account.type as DraftLine['type'],
    ownerType: row.account.ownerType,
    ownerId: row.account.ownerId,
    debitPaise: row.debitPaise,
    creditPaise: row.creditPaise,
    sourceTag: row.sourceTag,
    funderType: row.funderType,
    funderId: row.funderId,
    memo: row.memo,
  }));
  await shadowPost(tx, {
    eventType: 'order_reversal',
    eventRefType: 'order',
    eventRefId: order.id,
    idempotencyKey: `order:${order.id}:refund-wallet`,
    reversesEntryId: spend.id,
    lines: reversalLines(original),
  });
}

/** Live-only. Reverse the wallet and credit journal lines in proportion to a partial cancel. */
export async function livePartialReversal(
  tx: Prisma.TransactionClient,
  orderId: string,
  ratio: number,
): Promise<void> {
  if (!ledgerLiveEnabled()) return;
  if (!(ratio > 0) || ratio >= 1) return;
  const entries = await tx.journalEntry.findMany({
    where: { eventRefId: orderId, eventType: { in: ['wallet_spend', 'credit_deliver', 'funded_deliver'] }, reversesEntryId: null },
    include: { lines: { include: { account: true } } },
  });
  for (const entry of entries) {
    const scaled: DraftLine[] = entry.lines.map((row) => ({
      code: row.account.code,
      name: row.account.name,
      type: row.account.type as DraftLine['type'],
      ownerType: row.account.ownerType,
      ownerId: row.account.ownerId,
      debitPaise: Math.round(row.creditPaise * ratio),
      creditPaise: Math.round(row.debitPaise * ratio),
      sourceTag: row.sourceTag,
      funderType: row.funderType,
      funderId: row.funderId,
      memo: 'partial cancel',
    })).filter((row) => row.debitPaise > 0 || row.creditPaise > 0);
    const debit = scaled.reduce((sum, row) => sum + row.debitPaise, 0);
    const credit = scaled.reduce((sum, row) => sum + row.creditPaise, 0);
    if (debit !== credit || debit <= 0) continue;
    await shadowPost(tx, {
      eventType: 'order_reversal',
      eventRefType: 'order',
      eventRefId: orderId,
      idempotencyKey: `order:${orderId}:partial:${entry.id}:${Math.round(ratio * 10000)}`,
      reversesEntryId: entry.id,
      lines: scaled,
    });
  }
}

/** Live-only. A quantity cut must not imply a negative wallet spend. */
export function assertLiveQuantityKeepsWallet(walletApplied: number, goodsValue: number): void {
  if (!ledgerLiveEnabled()) return;
  if (walletApplied < 0) throw new Error('Wallet amount cannot be negative');
  if (walletApplied > goodsValue + 0.009) {
    throw new Error('This edit would take more Wallet than the order is worth');
  }
}
