// GET /api/v1/vendor/dashboard — Vendor dashboard stats
// PROTECTED: Vendor only (vendors + admins)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorOutletContext, buildFulfillmentOutletWhere, buildInventoryOutletWhere } from '@/lib/resolveVendorOutletContext';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  requirePermission(ctx, 'dashboard.view');
  try {
    const allOutlets = req.nextUrl.searchParams.get('outletId') === 'all';
    const voc = await resolveVendorOutletContext(ctx, req, { allowAllOutlets: true });
    const vendorId = voc.vendorId;
    const orderScope = { vendorId, ...buildFulfillmentOutletWhere(voc, allOutlets) };
    const invScope = { vendorId, ...buildInventoryOutletWhere(voc, allOutlets) };

    // IST-aware day/month boundaries
    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const todayStartIST = new Date(nowIST);
    todayStartIST.setUTCHours(0, 0, 0, 0);
    todayStartIST.setTime(todayStartIST.getTime() - 5.5 * 60 * 60 * 1000); // back to UTC

    const monthStartIST = new Date(nowIST);
    monthStartIST.setUTCDate(1);
    monthStartIST.setUTCHours(0, 0, 0, 0);
    monthStartIST.setTime(monthStartIST.getTime() - 5.5 * 60 * 60 * 1000);

    const activeStatuses = ['confirmed', 'processing', 'shipped', 'delivered'] as const;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalOrders,
      revenueResult,
      todaySalesResult,
      mtdSalesResult,
      pendingPaymentsResult,
      activeProducts,
      inventoryRows,
      ordersByStatusRaw,
      pendingOrders,
      recentOrders,
      vendorWallet,
      overdueResult,
      pendingSettlement,
      completedSettlementResult,
      platformFeesResult,
      fastMoversRaw,
      allVendorOrders,
      creditAggregate,
      packingCount,
      dispatchCount,
      delayedCount,
      upcomingDueAggregate,
      creditCustomersCount,
    ] = await Promise.all([
      prisma.order.count({ where: orderScope }),

      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { ...orderScope, status: { in: [...activeStatuses] } },
      }),

      // Sales placed (& confirmed) today
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { ...orderScope, status: { in: [...activeStatuses] }, createdAt: { gte: todayStartIST } },
      }),

      // Month-to-date sales
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { ...orderScope, status: { in: [...activeStatuses] }, createdAt: { gte: monthStartIST } },
      }),

      // Unpaid / partially paid order value (outstanding receivables)
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
          ...orderScope,
          paymentStatus: { in: ['unpaid', 'partial'] },
          status: { notIn: ['cancelled'] },
        },
      }),

      prisma.product.count({ where: { vendorId, isActive: true } }),

      prisma.inventory.findMany({
        where: invScope,
        select: { qtyAvailable: true, qtyReserved: true, lowStockThreshold: true },
      }),

      prisma.order.groupBy({
        by: ['status'],
        where: orderScope,
        _count: { id: true },
      }),

      // Pending orders needing action — oldest first (most urgent)
      prisma.order.findMany({
        where: { ...orderScope, status: 'pending' },
        take: 20,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          createdAt: true,
          notes: true,
          user: { select: { id: true, fullName: true, businessName: true, email: true } },
          _count: { select: { items: true } },
        },
      }),

      // Recent 10 orders for the activity table
      prisma.order.findMany({
        where: orderScope,
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          paymentStatus: true,
          createdAt: true,
          user: { select: { id: true, fullName: true, email: true } },
          _count: { select: { items: true } },
        },
      }),

      // Vendor wallet balance
      prisma.vendorWallet.findUnique({
        where: { vendorId },
        select: { balance: true, pendingAmount: true },
      }),

      // Overdue credit — wallets past due date with outstanding balance
      prisma.creditWallet.aggregate({
        _sum: { outstandingAmount: true },
        where: {
          vendorId,
          outstandingAmount: { gt: 0 },
          currentDueDate: { lt: new Date() },
        },
      }),

      // Pending settlement amount
      prisma.vendorSettlement.aggregate({
        _sum: { netAmount: true },
        where: { vendorId, status: 'pending' },
      }),

      // Completed settlement amount
      prisma.vendorSettlement.aggregate({
        _sum: { netAmount: true },
        where: { vendorId, status: 'settled' },
      }),

      // Platform fees paid/due
      prisma.vendorSettlement.aggregate({
        _sum: { platformFee: true },
        where: { vendorId },
      }),

      // Fast movers — top 5 products by qty sold in delivered orders (last 30 days)
      prisma.$queryRaw<{ productId: string; productName: string; totalQty: bigint; revenue: string }[]>(
        Prisma.sql`
          SELECT oi.product_id AS "productId",
                 oi.product_name AS "productName",
                 SUM(oi.quantity) AS "totalQty",
                 SUM(oi.total_price) AS "revenue"
          FROM order_items oi
          INNER JOIN orders o ON o.id = oi.order_id
          WHERE o.vendor_id = ${vendorId}::uuid
            AND o.status = 'delivered'
            AND o.created_at >= ${thirtyDaysAgo}
          GROUP BY oi.product_id, oi.product_name
          ORDER BY SUM(oi.quantity) DESC
          LIMIT 5
        `
      ),

      // All orders for this vendor — used to compute customer segments in JS
      prisma.order.findMany({
        where: orderScope,
        select: { userId: true, createdAt: true },
      }),

      // Credit utilization aggregate (CreditWallet engine)
      prisma.creditWallet.aggregate({
        where: { vendorId },
        _sum: { creditLimit: true, outstandingAmount: true },
      }),

      // Fulfillment: packing pending (processing), dispatch pending (shipped), delayed (48h+)
      prisma.order.count({ where: { ...orderScope, status: 'processing' } }),
      prisma.order.count({ where: { ...orderScope, status: 'shipped' } }),
      prisma.order.count({
        where: {
          ...orderScope,
          status: { in: ['confirmed', 'processing', 'shipped'] },
          createdAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        },
      }),

      // Upcoming due in 7 days — wallets with due date within the next week
      prisma.creditWallet.aggregate({
        where: {
          vendorId,
          outstandingAmount: { gt: 0 },
          currentDueDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
        _sum: { outstandingAmount: true },
      }),

      // Credit customers count — wallets with outstanding balance
      prisma.creditWallet.count({
        where: { vendorId, outstandingAmount: { gt: 0 } },
      }),
    ]);

    const lowStockCount = inventoryRows.filter(
      (inv) => inv.qtyAvailable - inv.qtyReserved <= inv.lowStockThreshold,
    ).length;

    const outOfStockCount = inventoryRows.filter(
      (inv) => inv.qtyAvailable - inv.qtyReserved <= 0,
    ).length;

    const ordersByStatus: Record<string, number> = {};
    for (const group of ordersByStatusRaw) {
      ordersByStatus[group.status] = group._count.id;
    }

    // ── Fast movers: normalise BigInt/Decimal from raw query ──
    const fastMovers = fastMoversRaw.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      totalQty: Number(row.totalQty),
      revenue: Number(row.revenue),
    }));

    // ── Customer counts: computed from allVendorOrders in JS ──
    const latestOrderByUser = new Map<string, Date>();
    const earliestOrderByUser = new Map<string, Date>();
    for (const order of allVendorOrders) {
      const prev = latestOrderByUser.get(order.userId);
      if (!prev || order.createdAt > prev) latestOrderByUser.set(order.userId, order.createdAt);
      const earliest = earliestOrderByUser.get(order.userId);
      if (!earliest || order.createdAt < earliest) earliestOrderByUser.set(order.userId, order.createdAt);
    }
    const totalCustomers = latestOrderByUser.size;
    let newCustomers = 0;
    let dormantCustomers = 0;
    for (const [userId, lastOrder] of latestOrderByUser.entries()) {
      const firstOrder = earliestOrderByUser.get(userId)!;
      const isNew = firstOrder >= thirtyDaysAgo;
      const isDormant = lastOrder < thirtyDaysAgo;
      if (isNew) newCustomers++;
      if (isDormant) dormantCustomers++;
    }
    const customerCounts = { total: totalCustomers, new: newCustomers, dormant: dormantCustomers };

    // ── Credit utilization ──
    const totalCreditLimit = Number(creditAggregate._sum.creditLimit ?? 0);
    const totalCreditUsed = Number(creditAggregate._sum.outstandingAmount ?? 0);
    const creditUtilizationPct =
      totalCreditLimit > 0 ? Math.round((totalCreditUsed / totalCreditLimit) * 100) : 0;
    const creditUtilization = {
      totalLimit: totalCreditLimit,
      totalUsed: totalCreditUsed,
      pct: creditUtilizationPct,
    };

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalOrders,
          totalRevenue: revenueResult._sum.totalAmount ?? 0,
          todaySales: todaySalesResult._sum.totalAmount ?? 0,
          mtdSales: mtdSalesResult._sum.totalAmount ?? 0,
          pendingPayments: pendingPaymentsResult._sum.totalAmount ?? 0,
          activeProducts,
          lowStockCount,
          outOfStockCount,
          pendingOrdersCount: pendingOrders.length,
          walletBalance: Number(vendorWallet?.balance ?? 0),
          pendingSettlement: Number(pendingSettlement._sum.netAmount ?? 0),
          settlementCompleted: Number(completedSettlementResult._sum.netAmount ?? 0),
          platformFees: Number(platformFeesResult._sum.platformFee ?? 0),
          overdueAmount: Number(overdueResult._sum.outstandingAmount ?? 0),
          pendingWalletAmount: Number(vendorWallet?.pendingAmount ?? 0),
          upcomingDue: Number(upcomingDueAggregate._sum.outstandingAmount ?? 0),
          creditCustomersCount,
        },
        ordersByStatus,
        pendingOrders,
        recentOrders,
        fastMovers,
        customerCounts,
        creditUtilization,
        fulfillment: {
          packingPending: packingCount,
          dispatchPending: dispatchCount,
          deliveryDelayed: delayedCount,
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
