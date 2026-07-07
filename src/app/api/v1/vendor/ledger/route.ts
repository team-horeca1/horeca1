// GET /api/v1/vendor/ledger — Wallet-first ledger with fee breakdown
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';

export type LedgerFilter = 'all' | 'earnings' | 'refunds' | 'settlements' | 'credit';

type LedgerEntry = {
  id: string;
  date: string;
  type: 'earnings' | 'refund' | 'settlement' | 'adjustment' | 'credit_debit' | 'credit_payment';
  description: string;
  referenceNumber: string | null;
  gross: number | null;
  platformFee: number | null;
  gatewayFee: number | null;
  credit: number;
  debit: number;
  balance: number;
};

const WALLET_TYPE_MAP: Record<string, LedgerEntry['type']> = {
  order_credit: 'earnings',
  refund_debit: 'refund',
  settlement_debit: 'settlement',
  adjustment: 'adjustment',
};

function walletTxnToEntry(
  txn: {
    id: string;
    type: string;
    amount: unknown;
    balanceAfter: unknown;
    referenceId: string | null;
    notes: string | null;
    createdAt: Date;
    grossAmount: unknown;
    platformFee: unknown;
    gatewayFee: unknown;
    netAmount: unknown;
  },
  orderNumber?: string | null,
): LedgerEntry {
  const mapped = WALLET_TYPE_MAP[txn.type] ?? 'adjustment';
  const amount = Number(txn.amount);
  const isCredit = txn.type === 'order_credit' || txn.type === 'adjustment';
  return {
    id: `wallet-${txn.id}`,
    date: txn.createdAt.toISOString(),
    type: mapped,
    description:
      txn.type === 'order_credit'
        ? 'Order earnings credited'
        : txn.type === 'settlement_debit'
          ? 'Settlement payout'
          : txn.type === 'refund_debit'
            ? 'Refund debited'
            : txn.notes ?? txn.type,
    referenceNumber: orderNumber ?? txn.referenceId,
    gross: txn.grossAmount != null ? Number(txn.grossAmount) : null,
    platformFee: txn.platformFee != null ? Number(txn.platformFee) : null,
    gatewayFee: txn.gatewayFee != null ? Number(txn.gatewayFee) : null,
    credit: isCredit ? amount : 0,
    debit: isCredit ? 0 : amount,
    balance: Number(txn.balanceAfter),
  };
}

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.view');
    const vendorId = await resolveVendorId(ctx, req);
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const filter = (url.searchParams.get('filter') ?? 'all') as LedgerFilter;
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const take = 50;

    const dateFilter = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
    };

    const wallet = await prisma.vendorWallet.findUnique({
      where: { vendorId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          ...(Object.keys(dateFilter).length ? { where: { createdAt: dateFilter } } : {}),
        },
      },
    });

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [monthAgg, creditWalletTxns] = await Promise.all([
      prisma.order.aggregate({
        where: {
          vendorId,
          status: 'delivered',
          deliveredAt: { gte: startOfMonth },
        },
        _sum: {
          settlementGrossAmount: true,
          settlementPlatformFee: true,
        },
      }),
      filter === 'all' || filter === 'credit'
        ? prisma.creditWalletTxn.findMany({
            where: {
              wallet: { vendorId },
              ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
            },
            include: {
              wallet: {
                select: {
                  user: { select: { fullName: true, businessName: true } },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const orderIds = wallet?.transactions
      .filter((t) => t.referenceType === 'order' && t.referenceId)
      .map((t) => t.referenceId as string) ?? [];
    const orderNumbers = orderIds.length > 0
      ? Object.fromEntries(
          (await prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true },
          })).map((o) => [o.id, o.orderNumber]),
        )
      : {};

    const entries: LedgerEntry[] = [];

    if (wallet) {
      for (const txn of wallet.transactions) {
        const mapped = WALLET_TYPE_MAP[txn.type];
        if (!mapped) continue;
        if (filter === 'earnings' && txn.type !== 'order_credit') continue;
        if (filter === 'refunds' && txn.type !== 'refund_debit') continue;
        if (filter === 'settlements' && txn.type !== 'settlement_debit') continue;
        if (filter === 'credit') continue;

        const orderRef = txn.referenceId ? orderNumbers[txn.referenceId] : null;
        entries.push(walletTxnToEntry(txn, orderRef));
      }
    }

    if (filter === 'all' || filter === 'credit') {
      const creditOrderIds = creditWalletTxns
        .filter((t) => t.type === 'ORDER_DEBIT' && t.referenceId)
        .map((t) => t.referenceId as string);
      const creditOrderNumbers = creditOrderIds.length > 0
        ? Object.fromEntries(
            (await prisma.order.findMany({
              where: { id: { in: creditOrderIds } },
              select: { id: true, orderNumber: true },
            })).map((o) => [o.id, o.orderNumber]),
          )
        : {};

      for (const txn of creditWalletTxns) {
        const customerName =
          txn.wallet.user.businessName ?? txn.wallet.user.fullName ?? 'Customer';
        const orderRef = txn.referenceId ? creditOrderNumbers[txn.referenceId] ?? null : null;
        const isDebit = txn.type === 'ORDER_DEBIT';
        const isPayment = txn.type === 'REPAYMENT' || txn.type === 'REVERSAL';
        entries.push({
          id: `credit-${txn.id}`,
          date: txn.createdAt.toISOString(),
          type: isDebit ? 'credit_debit' : 'credit_payment',
          description: isDebit
            ? `Credit order — ${customerName}`
            : isPayment
              ? `Credit repayment — ${customerName}`
              : `${txn.type} — ${customerName}`,
          referenceNumber: orderRef,
          gross: isDebit ? Number(txn.amount) : null,
          platformFee: null,
          gatewayFee: null,
          credit: isPayment ? Number(txn.amount) : 0,
          debit: isDebit ? Number(txn.amount) : 0,
          balance: 0,
        });
      }
    }

    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const total = entries.length;
    const start = (page - 1) * take;
    const pageItems = entries.slice(start, start + take);

    return NextResponse.json({
      success: true,
      data: {
        entries: pageItems,
        pagination: { page, take, total, totalPages: Math.ceil(total / take) || 1 },
        summary: {
          walletBalance: Number(wallet?.balance ?? 0),
          pendingAmount: Number(wallet?.pendingAmount ?? 0),
          monthGross: Number(monthAgg._sum.settlementGrossAmount ?? 0),
          monthPlatformFees: Number(monthAgg._sum.settlementPlatformFee ?? 0),
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
