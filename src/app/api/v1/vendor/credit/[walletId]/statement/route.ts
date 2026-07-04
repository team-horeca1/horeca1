// GET /api/v1/vendor/credit/:walletId/statement — CSV statement download
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';

function extractWalletId(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('credit');
  return parts[idx + 1] ?? '';
}

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'creditLine.view');
    const vendorId = await resolveVendorId(ctx, req);
    const walletId = extractWalletId(req);

    const wallet = await prisma.creditWallet.findFirst({
      where: { id: walletId, vendorId },
      include: {
        user: { select: { fullName: true, businessName: true, email: true } },
        transactions: { orderBy: { createdAt: 'desc' }, take: 500 },
        repayments: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!wallet) throw Errors.notFound('Credit wallet');

    const customerName = wallet.user.businessName ?? wallet.user.fullName ?? 'Customer';
    const lines = [
      `Credit Statement — ${customerName}`,
      `Generated,${new Date().toISOString()}`,
      `Limit,${wallet.creditLimit}`,
      `Outstanding,${wallet.outstandingAmount}`,
      `Due Date,${wallet.currentDueDate?.toISOString() ?? ''}`,
      '',
      'Date,Type,Amount,Balance After,Note',
    ];

    for (const t of wallet.transactions) {
      lines.push([
        t.createdAt.toISOString(),
        t.type,
        Number(t.amount),
        Number(t.balanceAfterTxn),
        `"${(t.note ?? '').replace(/"/g, '""')}"`,
      ].join(','));
    }

    lines.push('', 'Repayments');
    lines.push('Date,Amount,Method,Status');
    for (const r of wallet.repayments) {
      lines.push([r.createdAt.toISOString(), Number(r.amount), r.repaymentMethod, r.status].join(','));
    }

    const csv = lines.join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="credit-statement-${walletId.slice(0, 8)}.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
