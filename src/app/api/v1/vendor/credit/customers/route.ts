// GET /api/v1/vendor/credit/customers — the vendor's customer list for the
// Credit tab: every buyer who has ordered from this vendor plus CRM-mapped
// customers, each joined with their CreditWallet for this vendor (or null
// when no credit line is set up yet). Client doc: "Clicks 'Credit Tab' >>
// Sees Customer List >> Fills Credit Limit >> Chooses Payment Terms".
// PROTECTED: Vendor only + creditLine.view

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveCreditDisplayStatus } from '@/modules/credit/creditWallet.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'creditLine.view');
    const vendorId = await resolveVendorId(ctx, req);

    const [orderStats, crmCustomers, wallets] = await Promise.all([
      prisma.order.groupBy({
        by: ['userId'],
        where: { vendorId, status: { not: 'cancelled' } },
        _count: { id: true },
        _max: { createdAt: true },
      }),
      prisma.vendorCustomer.findMany({
        where: { vendorId },
        select: { userId: true },
      }),
      prisma.creditWallet.findMany({
        where: { vendorId },
        include: {
          assignedOwner: {
            select: {
              id: true,
              user: { select: { fullName: true, businessName: true, email: true } },
            },
          },
        },
      }),
    ]);

    const userIds = new Set<string>([
      ...orderStats.map((s) => s.userId),
      ...crmCustomers.map((c) => c.userId),
      ...wallets.map((w) => w.userId),
    ]);
    if (userIds.size === 0) {
      return NextResponse.json({ success: true, data: { customers: [] } });
    }

    const users = await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, fullName: true, businessName: true, email: true, phone: true },
    });

    const statsByUser = new Map(orderStats.map((s) => [s.userId, s]));
    const walletByUser = new Map(wallets.map((w) => [w.userId, w]));

    const customers = users
      .map((u) => {
        const stats = statsByUser.get(u.id);
        const w = walletByUser.get(u.id);
        return {
          userId: u.id,
          name: u.businessName ?? u.fullName ?? u.email ?? u.id,
          fullName: u.fullName,
          email: u.email,
          phone: u.phone,
          orderCount: stats?._count.id ?? 0,
          lastOrderAt: stats?._max.createdAt ?? null,
          wallet: w
            ? {
                id: w.id,
                creditLimit: Number(w.creditLimit),
                usedCredit: Number(w.usedCredit),
                availableCredit: Number(w.availableCredit),
                outstandingAmount: Number(w.outstandingAmount),
                reservedAmount: Number(w.reservedAmount),
                creditSource: w.creditSource,
                status: w.status,
                workflowStatus: w.workflowStatus,
                assignedOwnerId: w.assignedOwnerId,
                ownerName: w.assignedOwner
                  ? (w.assignedOwner.user.fullName ?? w.assignedOwner.user.businessName ?? w.assignedOwner.user.email)
                  : null,
                vendorNotes: w.vendorNotes,
                displayStatus: resolveCreditDisplayStatus(w.status, w.workflowStatus),
                currentDueDate: w.currentDueDate,
                overdueDays: w.overdueDays,
                // Current overrides so the edit form pre-fills; null = platform default.
                repaymentMode: w.overrideRepaymentMode,
                billingModel: w.overrideBillingModel,
                creditTenureDays: w.overrideCreditTenure,
                gracePeriodDays: w.overrideGracePeriod,
                blacklistDays: w.overrideBlacklistDays,
                interestRatePct: w.overrideInterestRate != null ? Number(w.overrideInterestRate) : null,
                interestFrequencyDays: w.overrideInterestFreqDays,
                penaltyAmount: w.overridePenaltyAmount != null ? Number(w.overridePenaltyAmount) : null,
                penaltyFrequencyDays: w.overridePenaltyFreqDays,
              }
            : null,
          displayStatus: w
            ? resolveCreditDisplayStatus(w.status, w.workflowStatus)
            : 'IN_PROGRESS',
        };
      })
      // Credit customers first (highest exposure on top), then frequent buyers.
      .sort((a, b) => {
        if (!!b.wallet !== !!a.wallet) return b.wallet ? 1 : -1;
        if (b.wallet && a.wallet) return b.wallet.creditLimit - a.wallet.creditLimit;
        return b.orderCount - a.orderCount;
      });

    return NextResponse.json({ success: true, data: { customers } });
  } catch (error) {
    return errorResponse(error);
  }
});
