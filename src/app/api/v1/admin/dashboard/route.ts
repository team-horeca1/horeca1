// GET /api/v1/admin/dashboard — Admin dashboard stats
// WHY: Powers the admin dashboard overview page with key metrics:
//      total users, vendors, orders, revenue, order status breakdown,
//      recent orders, and new user signups this month
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';

export const GET = adminOnly(async (_req: NextRequest, ctx) => {
  requirePermission(ctx, 'dashboard.view');
  try {
    // Run all stat queries in parallel for performance
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const eightMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 7, 1);

    const [
      totalUsers,
      totalVendors,
      totalOrders,
      revenueResult,
      ordersByStatus,
      recentOrders,
      newUsersThisMonth,
      pendingProducts,
      pendingCategories,
      pendingVendors,
      monthlyOrders,
    ] = await Promise.all([
      // Total users (all roles)
      prisma.user.count(),

      // Total vendors
      prisma.vendor.count(),

      // Total orders
      prisma.order.count(),

      // Total revenue (sum of totalAmount for delivered/paid orders)
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: { in: ['delivered', 'confirmed', 'processing', 'shipped'] } },
      }),

      // Orders grouped by status
      prisma.order.groupBy({
        by: ['status'],
        _count: { id: true },
      }),

      // Last 10 orders with vendor + customer info
      prisma.order.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          paymentStatus: true,
          createdAt: true,
          vendor: {
            select: { id: true, businessName: true },
          },
          user: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),

      // New users this month
      prisma.user.count({
        where: { createdAt: { gte: startOfMonth } },
      }),

      // Pending approvals
      prisma.product.count({ where: { approvalStatus: 'pending' } }),
      prisma.category.count({ where: { approvalStatus: 'pending' } }),
      prisma.vendor.count({ where: { isVerified: false } }),

      // Monthly order count + revenue for past 8 months
      prisma.$queryRaw<Array<{ month: string; orders: bigint; revenue: number }>>`
        SELECT
          TO_CHAR(created_at AT TIME ZONE 'UTC', 'Mon YYYY') AS month,
          COUNT(*)::bigint AS orders,
          COALESCE(SUM(total_amount), 0)::float AS revenue
        FROM orders
        WHERE created_at >= ${eightMonthsAgo}
        GROUP BY DATE_TRUNC('month', created_at), TO_CHAR(created_at AT TIME ZONE 'UTC', 'Mon YYYY')
        ORDER BY DATE_TRUNC('month', created_at) ASC
      `,
    ]);

    // Transform ordersByStatus into a clean map: { pending: 5, confirmed: 12, ... }
    const statusCounts: Record<string, number> = {};
    for (const group of ordersByStatus) {
      statusCounts[group.status] = group._count.id;
    }

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalVendors,
          totalOrders,
          totalRevenue: revenueResult._sum.totalAmount ?? 0,
          newUsersThisMonth,
        },
        ordersByStatus: statusCounts,
        pendingApprovals: {
          products: pendingProducts,
          categories: pendingCategories,
          vendors: pendingVendors,
          total: pendingProducts + pendingCategories + pendingVendors,
        },
        recentOrders,
        monthlyData: monthlyOrders.map(r => ({
          month: r.month,
          orders: Number(r.orders),
          revenue: Number(r.revenue),
        })),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
