import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export const GATEWAY_FEE_PCT = 2;
const CREDIT_PAYMENTS = ['credit', 'vendor_credit', 'h1_wallet', 'wallet'];

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function isCreditPayment(method: string | null | undefined): boolean {
  return !!method && CREDIT_PAYMENTS.includes(method);
}

export function isGatewayPayment(method: string | null | undefined): boolean {
  return !!method && ['online', 'prepaid', 'razorpay'].includes(method);
}

async function getDefaultPlatformFeePct(db: Prisma.TransactionClient | typeof prisma): Promise<number> {
  const settings = await db.platformSetting.findFirst({
    select: { defaultCommissionPct: true },
  });
  return Number(settings?.defaultCommissionPct ?? 10);
}

/** Resolve effective platform fee % for a vendor (custom override or global default). */
export async function resolvePlatformFeePct(
  vendorId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  const vendor = await db.vendor.findUnique({
    where: { id: vendorId },
    select: { platformFeePct: true },
  });
  if (vendor?.platformFeePct != null) {
    return Number(vendor.platformFeePct);
  }
  return getDefaultPlatformFeePct(db);
}

export function computeOrderSettlementAmounts(
  gross: number,
  paymentMethod: string | null,
  platformFeePct: number,
): { grossAmount: number; platformFee: number; gatewayFee: number; netAmount: number } {
  const platformFee = roundMoney(gross * (platformFeePct / 100));
  const gatewayFee = isGatewayPayment(paymentMethod)
    ? roundMoney(gross * (GATEWAY_FEE_PCT / 100))
    : 0;
  const netAmount = roundMoney(gross - platformFee - gatewayFee);
  return { grossAmount: gross, platformFee, gatewayFee, netAmount };
}

async function ensureWallet(
  vendorId: string,
  tx: Prisma.TransactionClient,
) {
  return tx.vendorWallet.upsert({
    where: { vendorId },
    create: { vendorId, balance: 0, pendingAmount: 0 },
    update: {},
  });
}

/**
 * Credit vendor wallet when an order is delivered. Idempotent per order.
 * Skips vendor-credit orders (receivable lives in CreditWallet).
 */
export async function creditVendorOnDelivery(
  orderId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const existing = await tx.vendorWalletTxn.findFirst({
    where: {
      referenceId: orderId,
      referenceType: 'order',
      type: 'order_credit',
    },
  });
  if (existing) return;

  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      vendorId: true,
      orderNumber: true,
      totalAmount: true,
      paymentMethod: true,
      paymentStatus: true,
      status: true,
      settlementNetVendorAmount: true,
    },
  });
  if (!order || order.status !== 'delivered') return;
  if (isCreditPayment(order.paymentMethod)) return;
  if (isGatewayPayment(order.paymentMethod) && order.paymentStatus !== 'paid') return;

  const gross = Number(order.totalAmount);
  if (gross <= 0) return;

  const platformFeePct = await resolvePlatformFeePct(order.vendorId, tx);
  const { grossAmount, platformFee, gatewayFee, netAmount } = computeOrderSettlementAmounts(
    gross,
    order.paymentMethod,
    platformFeePct,
  );
  if (netAmount <= 0) return;

  await tx.order.update({
    where: { id: order.id },
    data: {
      settlementGrossAmount: grossAmount,
      settlementPlatformFeePct: platformFeePct,
      settlementPlatformFee: platformFee,
      settlementGatewayFee: gatewayFee,
      settlementNetVendorAmount: netAmount,
    },
  });

  const wallet = await ensureWallet(order.vendorId, tx);
  const newBalance = roundMoney(Number(wallet.balance) + netAmount);

  await tx.vendorWalletTxn.create({
    data: {
      walletId: wallet.id,
      type: 'order_credit',
      amount: netAmount,
      balanceAfter: newBalance,
      referenceId: order.id,
      referenceType: 'order',
      grossAmount,
      platformFee,
      gatewayFee,
      netAmount,
      notes: `Order ${order.orderNumber} delivered — gross ₹${grossAmount}, platform fee ₹${platformFee}${gatewayFee > 0 ? `, gateway ₹${gatewayFee}` : ''}`,
    },
  });

  await tx.vendorWallet.update({
    where: { id: wallet.id },
    data: {
      balance: newBalance,
      pendingAmount: { increment: netAmount },
    },
  });
}

/**
 * Debit vendor wallet when a prepaid/COD order refund is approved.
 * Uses snapshotted net amount when available.
 */
export async function debitVendorOnRefund(
  vendorId: string,
  orderId: string,
  refundAmount: number,
  note: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const run = async (client: Prisma.TransactionClient) => {
    const order = await client.order.findUnique({
      where: { id: orderId },
      select: {
        settlementNetVendorAmount: true,
        settlementGrossAmount: true,
        totalAmount: true,
      },
    });
    const debitTarget = order?.settlementNetVendorAmount != null
      ? Number(order.settlementNetVendorAmount)
      : refundAmount;
    if (debitTarget <= 0) return;

    const existing = await client.vendorWalletTxn.findFirst({
      where: {
        referenceId: orderId,
        referenceType: 'order_refund',
        type: 'refund_debit',
      },
    });
    if (existing) return;

    const wallet = await ensureWallet(vendorId, client);
    const debit = roundMoney(Math.min(debitTarget, Number(wallet.balance)));
    if (debit <= 0) return;

    const gross = order?.settlementNetVendorAmount != null
      ? Number(order.settlementGrossAmount ?? order.totalAmount)
      : refundAmount;

    const newBalance = roundMoney(Number(wallet.balance) - debit);
    await client.vendorWalletTxn.create({
      data: {
        walletId: wallet.id,
        type: 'refund_debit',
        amount: debit,
        balanceAfter: newBalance,
        referenceId: orderId,
        referenceType: 'order_refund',
        grossAmount: gross,
        netAmount: debit,
        notes: note,
      },
    });
    await client.vendorWallet.update({
      where: { id: wallet.id },
      data: {
        balance: newBalance,
        pendingAmount: { decrement: debit },
      },
    });
  };

  if (tx) {
    await run(tx);
  } else {
    await prisma.$transaction(run);
  }
}

/**
 * Create a settlement batch for a vendor over a date range and debit wallet.
 */
export async function createSettlementBatch(
  vendorId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<{ settlementId: string; netAmount: number; orderCount: number } | null> {
  return prisma.$transaction(async (tx) => {
    const wallet = await ensureWallet(vendorId, tx);

    const creditedOrders = await tx.vendorWalletTxn.findMany({
      where: {
        walletId: wallet.id,
        type: 'order_credit',
        referenceType: 'order',
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: { referenceId: true, amount: true, grossAmount: true, platformFee: true, gatewayFee: true, netAmount: true },
    });

    if (creditedOrders.length === 0) return null;

    const orderIds = creditedOrders
      .map((t) => t.referenceId)
      .filter((id): id is string => !!id);

    const alreadySettled = await tx.vendorSettlementOrder.findMany({
      where: { orderId: { in: orderIds } },
      select: { orderId: true },
    });
    const settledSet = new Set(alreadySettled.map((s) => s.orderId));
    const unsettledOrderIds = orderIds.filter((id) => !settledSet.has(id));
    if (unsettledOrderIds.length === 0) return null;

    const orders = await tx.order.findMany({
      where: { id: { in: unsettledOrderIds } },
      select: {
        id: true,
        totalAmount: true,
        paymentMethod: true,
        settlementGrossAmount: true,
        settlementPlatformFee: true,
        settlementGatewayFee: true,
        settlementNetVendorAmount: true,
      },
    });

    const platformFeePct = await resolvePlatformFeePct(vendorId, tx);
    let grossTotal = 0;
    let platformTotal = 0;
    let gatewayTotal = 0;
    let netTotal = 0;
    const orderRows: Array<{
      orderId: string;
      orderAmount: number;
      platformFee: number;
      netAmount: number;
    }> = [];

    for (const order of orders) {
      const txn = creditedOrders.find((t) => t.referenceId === order.id);
      let gross: number;
      let platformFee: number;
      let gatewayFee: number;
      let netAmount: number;

      if (order.settlementNetVendorAmount != null) {
        gross = Number(order.settlementGrossAmount ?? order.totalAmount);
        platformFee = Number(order.settlementPlatformFee ?? 0);
        gatewayFee = Number(order.settlementGatewayFee ?? 0);
        netAmount = Number(order.settlementNetVendorAmount);
      } else if (txn?.netAmount != null) {
        gross = Number(txn.grossAmount ?? order.totalAmount);
        platformFee = Number(txn.platformFee ?? 0);
        gatewayFee = Number(txn.gatewayFee ?? 0);
        netAmount = Number(txn.netAmount);
      } else {
        gross = Number(order.totalAmount);
        const computed = computeOrderSettlementAmounts(gross, order.paymentMethod, platformFeePct);
        platformFee = computed.platformFee;
        gatewayFee = computed.gatewayFee;
        netAmount = computed.netAmount;
      }

      grossTotal += gross;
      platformTotal += platformFee;
      gatewayTotal += gatewayFee;
      netTotal += netAmount;
      orderRows.push({
        orderId: order.id,
        orderAmount: gross,
        platformFee,
        netAmount,
      });
    }

    netTotal = roundMoney(netTotal);
    const balance = Number(wallet.balance);
    const settleAmount = roundMoney(Math.min(netTotal, balance));
    if (settleAmount <= 0) return null;

    const settlement = await tx.vendorSettlement.create({
      data: {
        vendorId,
        walletId: wallet.id,
        grossAmount: roundMoney(grossTotal),
        platformFee: roundMoney(platformTotal),
        gatewayFee: roundMoney(gatewayTotal),
        netAmount: settleAmount,
        status: 'pending',
        periodStart,
        periodEnd,
        orders: {
          create: orderRows.map((o) => ({
            orderId: o.orderId,
            orderAmount: o.orderAmount,
            platformFee: o.platformFee,
            netAmount: o.netAmount,
          })),
        },
      },
    });

    const newBalance = roundMoney(balance - settleAmount);
    await tx.vendorWalletTxn.create({
      data: {
        walletId: wallet.id,
        type: 'settlement_debit',
        amount: settleAmount,
        balanceAfter: newBalance,
        referenceId: settlement.id,
        referenceType: 'settlement',
        grossAmount: roundMoney(grossTotal),
        platformFee: roundMoney(platformTotal),
        gatewayFee: roundMoney(gatewayTotal),
        netAmount: settleAmount,
        notes: `Settlement batch ${periodStart.toISOString().split('T')[0]} – ${periodEnd.toISOString().split('T')[0]}`,
      },
    });

    await tx.vendorWallet.update({
      where: { id: wallet.id },
      data: {
        balance: newBalance,
        pendingAmount: { decrement: settleAmount },
      },
    });

    return {
      settlementId: settlement.id,
      netAmount: settleAmount,
      orderCount: orderRows.length,
    };
  });
}

export async function markSettlementTransferred(
  settlementId: string,
  bankReference: string,
): Promise<void> {
  await prisma.vendorSettlement.update({
    where: { id: settlementId },
    data: {
      status: 'settled',
      bankReference,
      settledAt: new Date(),
    },
  });
}

/**
 * Request instant payout — settles all unsettled order credits for this vendor.
 */
export async function requestInstantPayout(vendorId: string): Promise<{
  settlementId: string;
  netAmount: number;
  orderCount: number;
} | null> {
  const oldestCredit = await prisma.vendorWalletTxn.findFirst({
    where: {
      type: 'order_credit',
      referenceType: 'order',
      wallet: { vendorId },
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });

  const periodStart = oldestCredit?.createdAt ?? new Date(Date.now() - 7 * 86400000);
  const periodEnd = new Date();
  const result = await createSettlementBatch(vendorId, periodStart, periodEnd);
  if (!result) return null;
  await markSettlementTransferred(result.settlementId, `INSTANT-${Date.now()}`);
  return result;
}

/**
 * Weekly settlement cron — batch all vendors with wallet balance > 0.
 */
export async function runWeeklySettlements(): Promise<{
  vendorsProcessed: number;
  settlementsCreated: number;
}> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 86400000);

  const wallets = await prisma.vendorWallet.findMany({
    where: { balance: { gt: 0 } },
    select: { vendorId: true },
  });

  let settlementsCreated = 0;
  for (const w of wallets) {
    const result = await createSettlementBatch(w.vendorId, periodStart, periodEnd);
    if (result) settlementsCreated += 1;
  }

  return { vendorsProcessed: wallets.length, settlementsCreated };
}

export const vendorSettlementService = {
  creditVendorOnDelivery,
  debitVendorOnRefund,
  createSettlementBatch,
  markSettlementTransferred,
  requestInstantPayout,
  runWeeklySettlements,
  computeOrderSettlementAmounts,
  resolvePlatformFeePct,
  isGatewayPayment,
};
