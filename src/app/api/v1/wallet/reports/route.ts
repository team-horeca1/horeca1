// GET /api/v1/wallet/reports?type=overdue|utilization|interest|audit|statement|all — admin only.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.view');
    const type = new URL(req.url).searchParams.get('type') || 'all';
    const data: Record<string, unknown> = {};
    const want = (t: string) => type === t || type === 'all';

    if (want('overdue')) {
      const rows = await prisma.creditWallet.findMany({
        where: { outstandingAmount: { gt: 0 }, currentDueDate: { lt: new Date() } },
        include: { user: { select: { fullName: true, phone: true } }, vendor: { select: { businessName: true } } },
        orderBy: { overdueDays: 'desc' },
      });
      data.overdue = rows.map((w) => ({
        customer: w.user.fullName,
        phone: w.user.phone,
        vendor: w.vendor?.businessName ?? 'H1 Wallet',
        creditLimit: Number(w.creditLimit),
        outstanding: Number(w.outstandingAmount),
        dueDate: w.currentDueDate,
        overdueDays: w.overdueDays,
        status: w.status,
        highlightRed: w.overdueDays > 15,
      }));
    }

    if (want('utilization')) {
      const wallets = await prisma.creditWallet.findMany({
        select: { creditLimit: true, usedCredit: true, outstandingAmount: true, status: true },
      });
      const repay = await prisma.creditWalletRepayment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } });
      data.utilization = {
        totalCreditIssued: wallets.reduce((a, w) => a + Number(w.creditLimit), 0),
        totalCreditUtilized: wallets.reduce((a, w) => a + Number(w.usedCredit), 0),
        totalRepayments: Number(repay._sum.amount ?? 0),
        outstandingAmount: wallets.reduce((a, w) => a + Number(w.outstandingAmount), 0),
        activeCustomers: wallets.filter((w) => w.status === 'ACTIVE').length,
        blacklistedCustomers: wallets.filter((w) => w.status === 'BLACKLISTED').length,
      };
    }

    if (want('interest')) {
      const rows = await prisma.creditWalletPenalty.findMany({
        where: { type: 'INTEREST' },
        include: { wallet: { include: { user: { select: { fullName: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      data.interest = rows.map((p) => ({
        customer: p.wallet.user.fullName,
        interestApplied: Number(p.amount),
        date: p.appliedDate,
        outstandingBaseAmount: Number(p.wallet.overdueBaseAmount ?? p.wallet.outstandingAmount),
      }));
    }

    if (want('statement')) {
      // Bank-statement style ledger: every money movement on every credit wallet,
      // newest first, with its running available-credit balance. Debit = money the
      // customer drew/owes (spend + interest/late fee); Credit = money applied back
      // (repayment + cancellation reversal); CREDIT_ASSIGN is an informational
      // limit setup, not a debit/credit against outstanding.
      const isDebit = (t: string) => t === 'ORDER_DEBIT' || t === 'PENALTY';
      const isCredit = (t: string) => t === 'REPAYMENT' || t === 'REVERSAL';
      const rows = await prisma.creditWalletTxn.findMany({
        include: {
          wallet: {
            include: {
              user: { select: { fullName: true, phone: true } },
              vendor: { select: { businessName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      });
      data.statement = rows.map((t) => {
        const debit = isDebit(t.type);
        const credit = isCredit(t.type);
        return {
          id: t.id,
          customer: t.wallet.user.fullName,
          phone: t.wallet.user.phone,
          wallet: t.wallet.vendor?.businessName ?? 'H1 Wallet',
          type: t.type,
          direction: debit ? 'debit' : credit ? 'credit' : 'info',
          amount: Number(t.amount),
          debit: debit ? Number(t.amount) : null,
          credit: credit ? Number(t.amount) : null,
          balanceAfter: Number(t.balanceAfterTxn),
          note: t.note,
          referenceId: t.referenceId,
          timestamp: t.createdAt,
        };
      });
    }

    if (want('audit')) {
      const rows = await prisma.creditWalletAuditLog.findMany({
        include: { wallet: { include: { user: { select: { fullName: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      data.audit = rows.map((l) => ({
        customer: l.wallet.user.fullName,
        action: l.action,
        performedBy: l.performedBy,
        previousValue: l.previousValue,
        newValue: l.newValue,
        remarks: l.remarks,
        timestamp: l.createdAt,
      }));
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});
