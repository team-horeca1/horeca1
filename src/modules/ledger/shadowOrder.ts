import type { Prisma } from '@prisma/client';
import { reversalLines } from './post';
import { rupeesToPaise, type DraftLine } from './money';
import { shadowPost } from './shadow';
import {
  allocateSpend,
  creditDelivery,
  fundedDelivery,
  gatewayFee,
  onlineCapture,
  sourceForReference,
  walletSpend,
  type WalletBucket,
} from './rules';

const CREDIT_METHODS = new Set(['credit', 'vendor_credit', 'wallet', 'h1_wallet', 'discco']);

function isCreditMethod(method: string | null | undefined): boolean {
  return !!method && CREDIT_METHODS.has(method);
}

function platformCredit(method: string | null | undefined): boolean {
  return method === 'wallet' || method === 'h1_wallet';
}

async function flagOrder(tx: Prisma.TransactionClient, orderId: string, flag: string): Promise<void> {
  try {
    await tx.$executeRawUnsafe('SAVEPOINT ledger_flag');
  } catch {
    return;
  }
  try {
    await tx.$executeRaw`
      INSERT INTO ledger_order_flags (order_id, flag)
      VALUES (${orderId}::uuid, ${flag})
      ON CONFLICT (order_id) DO UPDATE SET flag = EXCLUDED.flag
    `;
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT ledger_flag');
  } catch {
    try {
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT ledger_flag');
    } catch {
      // The flag table is optional until the migration is applied.
    }
  }
}

async function spendBuckets(
  tx: Prisma.TransactionClient,
  userId: string,
  orderId: string,
  spendPaise: number,
): Promise<WalletBucket[]> {
  const rows = await tx.walletTransaction.findMany({
    where: { wallet: { userId } },
    orderBy: { createdAt: 'asc' },
    select: {
      type: true,
      amount: true,
      referenceId: true,
      referenceType: true,
      source: true,
      funderType: true,
      funderId: true,
      createdAt: true,
    },
  });
  const lots: WalletBucket[] = [];
  for (const row of rows) {
    const paise = rupeesToPaise(row.amount);
    if (row.type === 'debit') {
      if (row.referenceId === orderId) continue;
      // A debit can only use money that already existed. Replaying in time order
      // stops a later credit note from being treated as already spent.
      const used = allocateSpend(lots, paise);
      for (const taken of used) {
        const match = lots.find((lot) => lot.tag === taken.tag && lot.createdAt === taken.createdAt && lot.paise > 0);
        if (match) match.paise -= taken.paise;
      }
      continue;
    }
    const mapped = sourceForReference(row.referenceType);
    const source = row.source === 'credit_note' || mapped?.source === 'credit_note' ? 'credit_note' : 'reward';
    if (mapped == null && row.source !== 'credit_note' && row.source !== 'reward') continue;
    if (mapped && mapped.source !== 'reward' && mapped.source !== 'credit_note') continue;
    const supplier = row.funderId;
    lots.push({
      source,
      paise,
      createdAt: row.createdAt.toISOString(),
      funderType: source === 'credit_note' ? 'supplier' : 'platform',
      funderId: source === 'credit_note' ? supplier : null,
      tag: source === 'credit_note' && supplier ? `cn:${supplier}` : 'reward',
    });
  }
  const available = lots.filter((lot) => lot.paise > 0);
  const chosen = allocateSpend(available, spendPaise);
  if (chosen.reduce((sum, lot) => sum + lot.paise, 0) < spendPaise) {
    chosen.push({
      source: 'reward',
      paise: spendPaise - chosen.reduce((sum, lot) => sum + lot.paise, 0),
      createdAt: new Date(0).toISOString(),
      funderType: 'platform',
      funderId: null,
      tag: 'reward',
    });
  }
  return chosen;
}

async function reverseOrderEntries(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const entries = await tx.journalEntry.findMany({
    where: { eventRefId: orderId, reversesEntryId: null },
    include: { lines: { include: { account: true } } },
  });
  if (entries.length === 0) return;
  const already = await tx.journalEntry.findMany({
    where: { reversesEntryId: { in: entries.map((entry) => entry.id) } },
    select: { reversesEntryId: true },
  });
  const done = new Set(already.map((row) => row.reversesEntryId));
  for (const entry of entries) {
    if (done.has(entry.id)) continue;
    const original: DraftLine[] = entry.lines.map((row) => ({
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
      eventRefId: orderId,
      idempotencyKey: `order:${orderId}:reverse:${entry.id}`,
      reversesEntryId: entry.id,
      lines: reversalLines(original),
    });
  }
}

/** Post the shadow entries for one order from the rows already written in this transaction. */
export async function shadowOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  moment: 'place' | 'deliver' | 'cancel' | 'abandon' | 'pay',
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      vendorId: true,
      subtotal: true,
      walletApplied: true,
      totalAmount: true,
      paymentMethod: true,
      paymentStatus: true,
      vendor: { select: { platformFeePct: true } },
    },
  });
  if (!order) return;
  if (order.paymentMethod === 'cod') {
    await flagOrder(tx, order.id, 'legacy_unsupported');
    return;
  }

  if (moment === 'cancel' || moment === 'abandon') {
    await reverseOrderEntries(tx, order.id);
    return;
  }

  const subtotal = rupeesToPaise(order.subtotal);
  const walletApplied = rupeesToPaise(order.walletApplied);
  const rate = order.vendor.platformFeePct == null ? null : Number(order.vendor.platformFeePct);
  const credit = isCreditMethod(order.paymentMethod);
  const h1Credit = platformCredit(order.paymentMethod);

  if ((moment === 'place' || moment === 'pay') && walletApplied > 0) {
    const used = await spendBuckets(tx, order.userId, order.id, walletApplied);
    await shadowPost(tx, {
      eventType: 'wallet_spend',
      eventRefType: 'order',
      eventRefId: order.id,
      idempotencyKey: `order:${order.id}:wallet_spend`,
      lines: walletSpend(order.userId, order.id, used),
    });
  }

  if (moment === 'pay' && !credit) {
    const captured = await tx.payment.findFirst({
      where: { orderId: order.id, status: 'captured' },
      select: { amount: true, razorpayFeePaise: true, razorpayPaymentId: true },
    });
    if (captured && Number(captured.amount) > 0) {
      await shadowPost(tx, {
        eventType: 'online_capture',
        eventRefType: 'order',
        eventRefId: order.id,
        idempotencyKey: `payment:${captured.razorpayPaymentId ?? order.id}:capture`,
        lines: onlineCapture(order.id, rupeesToPaise(captured.amount)),
      });
      if (captured.razorpayFeePaise != null && captured.razorpayFeePaise > 0) {
        await shadowPost(tx, {
          eventType: 'gateway_fee',
          eventRefType: 'order',
          eventRefId: order.id,
          idempotencyKey: `order:${order.id}:gateway_fee`,
          lines: gatewayFee(order.vendorId, captured.razorpayFeePaise),
        });
      }
    }
  }

  if (moment !== 'deliver') return;

  if (rate == null) {
    await flagOrder(tx, order.id, 'commission_unconfigured');
    return;
  }

  if (credit) {
    const posted = creditDelivery(order.userId, order.vendorId, h1Credit, order.id, subtotal, rate);
    await shadowPost(tx, {
      eventType: 'credit_deliver',
      eventRefType: 'order',
      eventRefId: order.id,
      idempotencyKey: `order:${order.id}:credit_deliver`,
      remarks: h1Credit ? 'horeca1_credit' : 'supplier_credit',
      lines: posted.lines,
    });
    return;
  }

  if (order.paymentStatus !== 'paid' && walletApplied < subtotal) return;

  const posted = fundedDelivery(order.id, order.vendorId, subtotal, rate);
  await shadowPost(tx, {
    eventType: 'funded_deliver',
    eventRefType: 'order',
    eventRefId: order.id,
    idempotencyKey: `order:${order.id}:funded_deliver`,
    lines: posted.lines,
  });
  const payment = await tx.payment.findFirst({
    where: { orderId: order.id, status: { in: ['captured', 'refunded'] } },
    select: { amount: true, razorpayFeePaise: true, razorpayPaymentId: true },
  });
  if (payment && Number(payment.amount) > 0) {
    await shadowPost(tx, {
      eventType: 'online_capture',
      eventRefType: 'order',
      eventRefId: order.id,
      idempotencyKey: `payment:${payment.razorpayPaymentId ?? order.id}:capture`,
      lines: onlineCapture(order.id, rupeesToPaise(payment.amount)),
    });
    if (payment.razorpayFeePaise != null && payment.razorpayFeePaise > 0) {
      await shadowPost(tx, {
        eventType: 'gateway_fee',
        eventRefType: 'order',
        eventRefId: order.id,
        idempotencyKey: `order:${order.id}:gateway_fee`,
        lines: gatewayFee(order.vendorId, payment.razorpayFeePaise),
      });
    }
  }
}
