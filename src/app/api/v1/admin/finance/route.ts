// GET /api/v1/admin/finance — Admin finance overview
// Returns real revenue stats, monthly chart data, and payment records
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';

export const GET = adminOnly(async (_req: NextRequest, _ctx) => {
  try {
    const now = new Date();
    const eightMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 7, 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalRevenue,
      lastMonthRevenue,
      thisMonthRevenue,
      monthlyData,
      recentPayments,
      platformFeeAgg,
      orderFeeAgg,
    ] = await Promise.all([
      // Total revenue from all confirmed/delivered orders
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: { in: ['delivered', 'confirmed', 'processing', 'shipped'] } },
      }),

      // Last month revenue
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
          status: { in: ['delivered', 'confirmed', 'processing', 'shipped'] },
          createdAt: { gte: startOfLastMonth, lt: startOfMonth },
        },
      }),

      // This month revenue
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
          status: { in: ['delivered', 'confirmed', 'processing', 'shipped'] },
          createdAt: { gte: startOfMonth },
        },
      }),

      // Monthly revenue for past 8 months for chart
      prisma.$queryRaw<Array<{ month: string; total: number }>>`
        SELECT
          TO_CHAR(created_at AT TIME ZONE 'UTC', 'Mon') AS month,
          COALESCE(SUM(total_amount), 0)::float AS total
        FROM orders
        WHERE created_at >= ${eightMonthsAgo}
          AND status IN ('delivered', 'confirmed', 'processing', 'shipped')
        GROUP BY DATE_TRUNC('month', created_at), TO_CHAR(created_at AT TIME ZONE 'UTC', 'Mon')
        ORDER BY DATE_TRUNC('month', created_at) ASC
      `,

      // Recent payment records
      prisma.payment.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          status: true,
          method: true,
          createdAt: true,
          vendor: { select: { id: true, businessName: true } },
        },
      }),

      prisma.vendorSettlement.aggregate({
        _sum: { platformFee: true },
      }),

      prisma.order.aggregate({
        _sum: { settlementPlatformFee: true },
        where: { settlementPlatformFee: { not: null } },
      }),
    ]);

    const total = Number(totalRevenue._sum?.totalAmount ?? 0);
    const thisMonth = Number(thisMonthRevenue._sum?.totalAmount ?? 0);
    const lastMonth = Number(lastMonthRevenue._sum?.totalAmount ?? 0);
    const monthTrend = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;
    const commissionFromSettlements = Number(platformFeeAgg._sum.platformFee ?? 0);
    const commissionFromOrders = Number(orderFeeAgg._sum.settlementPlatformFee ?? 0);
    const commission = commissionFromOrders > 0 ? commissionFromOrders : commissionFromSettlements;

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalRevenue: total,
          thisMonthRevenue: thisMonth,
          monthTrend: monthTrend.toFixed(1),
          commission,
        },
        monthlyData: monthlyData.map(r => ({
          name: r.month,
          total: Number(r.total),
        })),
        recentPayments: recentPayments.map(p => ({
          id: p.id,
          vendor: p.vendor.businessName,
          vendorId: p.vendor.id,
          amount: Number(p.amount),
          status: p.status,
          method: p.method || '—',
          date: p.createdAt,
        })),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
