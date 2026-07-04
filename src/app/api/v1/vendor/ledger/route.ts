// GET /api/v1/vendor/ledger — Unified running ledger for the vendor
// Combines: order payments, credit transactions, wallet transactions, settlements
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';

type LedgerEntry = {
  id: string;
  date: string;
  type: 'order' | 'credit_debit' | 'credit_payment' | 'wallet_credit' | 'wallet_debit' | 'settlement';
  description: string;
  referenceNumber: string | null;
  credit: number;
  debit: number;
  balance: number;
};

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    // Ledger combines payments + credit + wallet history — finance data; same
    // gate as wallet so Viewers/storefront buyers can't enumerate it.
    requirePermission(ctx, 'payments.view');
    const vendorId = await resolveVendorId(ctx, req);
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
    const take = 50;

    const dateFilter = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to + 'T23:59:59.999Z') } : {}),
    };

    // Fetch all relevant data in parallel
    const [deliveredOrders, creditWalletTxns, walletData] = await Promise.all([
      prisma.order.findMany({
        where: {
          vendorId,
          status: 'delivered',
          ...(Object.keys(dateFilter).length ? { updatedAt: dateFilter } : {}),
        },
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          paymentStatus: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),

      prisma.creditWalletTxn.findMany({
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
      }),

      prisma.vendorWallet.findUnique({
        where: { vendorId },
        include: {
          transactions: {
            orderBy: { createdAt: 'desc' },
            ...(Object.keys(dateFilter).length ? { where: { createdAt: dateFilter } } : {}),
          },
          settlements: {
            where: { status: 'settled' },
            orderBy: { settledAt: 'desc' },
            ...(Object.keys(dateFilter).length
              ? { where: { status: 'settled', settledAt: dateFilter } }
              : {}),
          },
        },
      }),
    ]);

    // Build unified ledger entries
    const entries: LedgerEntry[] = [];

    for (const order of deliveredOrders) {
      entries.push({
        id: `order-${order.id}`,
        date: order.updatedAt.toISOString(),
        type: 'order',
        description: `Order delivered — ${order.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}`,
        referenceNumber: order.orderNumber,
        credit: Number(order.totalAmount),
        debit: 0,
        balance: 0, // running balance computed below
      });
    }

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
            ? `Credit repayment from ${customerName}`
            : `${txn.type} — ${customerName}`,
        referenceNumber: orderRef,
        credit: isPayment ? Number(txn.amount) : 0,
        debit: isDebit ? Number(txn.amount) : 0,
        balance: 0,
      });
    }

    if (walletData) {
      for (const txn of walletData.transactions) {
        entries.push({
          id: `wallet-${txn.id}`,
          date: txn.createdAt.toISOString(),
          type: txn.type === 'order_credit' || txn.type === 'adjustment' ? 'wallet_credit' : 'wallet_debit',
          description:
            txn.type === 'order_credit'
              ? 'Order payment credited to wallet'
              : txn.type === 'settlement_debit'
              ? 'Settlement transfer'
              : txn.notes ?? txn.type,
          referenceNumber: txn.referenceId,
          credit: ['order_credit', 'adjustment'].includes(txn.type) ? Number(txn.amount) : 0,
          debit: ['settlement_debit', 'refund_debit'].includes(txn.type) ? Number(txn.amount) : 0,
          balance: 0,
        });
      }

      for (const s of walletData.settlements) {
        entries.push({
          id: `settlement-${s.id}`,
          date: (s.settledAt ?? s.createdAt).toISOString(),
          type: 'settlement',
          description: `Settlement — ${s.periodStart.toISOString().split('T')[0]} to ${s.periodEnd.toISOString().split('T')[0]}`,
          referenceNumber: s.bankReference,
          credit: 0,
          debit: Number(s.netAmount),
          balance: 0,
        });
      }
    }

    // Sort all entries by date desc
    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Compute running balance (newest first = subtract as we go back)
    const walletBalance = Number(walletData?.balance ?? 0);
    let running = walletBalance;
    for (const entry of entries) {
      entry.balance = running;
      running = running - entry.credit + entry.debit;
    }

    // Paginate
    const total = entries.length;
    const start = (page - 1) * take;
    const pageItems = entries.slice(start, start + take);

    return NextResponse.json({
      success: true,
      data: {
        entries: pageItems,
        pagination: { page, take, total, totalPages: Math.ceil(total / take) },
        summary: {
          walletBalance,
          pendingAmount: Number(walletData?.pendingAmount ?? 0),
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
