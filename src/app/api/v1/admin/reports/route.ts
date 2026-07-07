// GET /api/v1/admin/reports — Platform analytics + CSV export
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';

function periodStart(period: string | null): Date {
  const now = Date.now();
  switch (period) {
    case '7d': return new Date(now - 7 * 86_400_000);
    case '90d': return new Date(now - 90 * 86_400_000);
    case '30d':
    default: return new Date(now - 30 * 86_400_000);
  }
}

export const GET = adminOnly(async (req: NextRequest) => {
  try {
    const url = new URL(req.url);
    const period = url.searchParams.get('period') ?? '30d';
    const type = url.searchParams.get('type') ?? 'overview';
    const format = url.searchParams.get('format');
    const start = periodStart(period);

    if (type === 'sales_by_vendor' || type === 'overview') {
      const rows = await prisma.order.groupBy({
        by: ['vendorId'],
        where: {
          status: 'delivered',
          deliveredAt: { gte: start },
        },
        _sum: {
          totalAmount: true,
          settlementPlatformFee: true,
          settlementNetVendorAmount: true,
        },
        _count: { id: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
      });

      const vendorIds = rows.map((r) => r.vendorId);
      const vendors = await prisma.vendor.findMany({
        where: { id: { in: vendorIds } },
        select: { id: true, businessName: true },
      });
      const vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v.businessName]));

      const data = rows.map((r) => ({
        vendorId: r.vendorId,
        vendorName: vendorMap[r.vendorId] ?? 'Unknown',
        orderCount: r._count.id,
        gross: Number(r._sum.totalAmount ?? 0),
        platformFee: Number(r._sum.settlementPlatformFee ?? 0),
        netVendor: Number(r._sum.settlementNetVendorAmount ?? 0),
      }));

      if (format === 'csv') {
        const header = 'Vendor,Orders,Gross,Platform Fee,Vendor Net\n';
        const body = data.map((r) =>
          [`"${r.vendorName}"`, r.orderCount, r.gross.toFixed(2), r.platformFee.toFixed(2), r.netVendor.toFixed(2)].join(','),
        ).join('\n');
        return new NextResponse(header + body, {
          headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="sales-by-vendor-${period}.csv"` },
        });
      }

      if (type === 'sales_by_vendor') {
        return NextResponse.json({ success: true, data: { rows: data, period } });
      }

      const platformRevenue = data.reduce((s, r) => s + r.platformFee, 0);
      const totalGmv = data.reduce((s, r) => s + r.gross, 0);

      const [returnsCount, settlementsPending] = await Promise.all([
        prisma.returnRequest.count({
          where: { createdAt: { gte: start }, status: 'refunded' },
        }),
        prisma.vendorSettlement.aggregate({
          where: { status: 'pending', createdAt: { gte: start } },
          _sum: { netAmount: true },
          _count: { id: true },
        }),
      ]);

      const monthlyRaw = await prisma.$queryRaw<Array<{ month: string; gmv: number; fees: number }>>`
        SELECT
          TO_CHAR(delivered_at AT TIME ZONE 'UTC', 'Mon') AS month,
          COALESCE(SUM(settlement_gross_amount), SUM(total_amount), 0)::float AS gmv,
          COALESCE(SUM(settlement_platform_fee), 0)::float AS fees
        FROM orders
        WHERE status = 'delivered'
          AND delivered_at >= ${start}
        GROUP BY DATE_TRUNC('month', delivered_at), TO_CHAR(delivered_at AT TIME ZONE 'UTC', 'Mon')
        ORDER BY DATE_TRUNC('month', delivered_at) ASC
      `;

      return NextResponse.json({
        success: true,
        data: {
          period,
          summary: {
            totalGmv,
            platformRevenue,
            returnsRefunded: returnsCount,
            pendingSettlements: Number(settlementsPending._sum.netAmount ?? 0),
            pendingSettlementBatches: settlementsPending._count.id,
          },
          salesByVendor: data.slice(0, 10),
          monthlyTrend: monthlyRaw.map((r) => ({ name: r.month, gmv: Number(r.gmv), fees: Number(r.fees) })),
        },
      });
    }

    if (type === 'returns') {
      const returns = await prisma.returnRequest.findMany({
        where: { createdAt: { gte: start } },
        include: {
          order: { select: { orderNumber: true, vendor: { select: { businessName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      const rows = returns.map((r) => ({
        id: r.id,
        status: r.status,
        refundAmount: r.refundAmount != null ? Number(r.refundAmount) : null,
        vendorName: r.order.vendor.businessName,
        orderNumber: r.order.orderNumber,
        createdAt: r.createdAt.toISOString(),
      }));

      if (format === 'csv') {
        const header = 'Date,Vendor,Order,Status,Refund Amount\n';
        const body = rows.map((r) =>
          [r.createdAt.slice(0, 10), `"${r.vendorName}"`, r.orderNumber, r.status, r.refundAmount?.toFixed(2) ?? ''].join(','),
        ).join('\n');
        return new NextResponse(header + body, {
          headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="returns-${period}.csv"` },
        });
      }

      return NextResponse.json({ success: true, data: { rows, period } });
    }

    if (type === 'settlements') {
      const settlements = await prisma.vendorSettlement.findMany({
        where: { createdAt: { gte: start } },
        include: { vendor: { select: { businessName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      const rows = settlements.map((s) => ({
        vendorName: s.vendor.businessName,
        status: s.status,
        gross: Number(s.grossAmount),
        platformFee: Number(s.platformFee),
        netAmount: Number(s.netAmount),
        periodStart: s.periodStart.toISOString().slice(0, 10),
        periodEnd: s.periodEnd.toISOString().slice(0, 10),
      }));

      if (format === 'csv') {
        const header = 'Vendor,Period Start,Period End,Status,Gross,Platform Fee,Net\n';
        const body = rows.map((r) =>
          [`"${r.vendorName}"`, r.periodStart, r.periodEnd, r.status, r.gross.toFixed(2), r.platformFee.toFixed(2), r.netAmount.toFixed(2)].join(','),
        ).join('\n');
        return new NextResponse(header + body, {
          headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="settlements-${period}.csv"` },
        });
      }

      return NextResponse.json({ success: true, data: { rows, period } });
    }

    return NextResponse.json({ success: false, error: { message: 'Unknown report type' } }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
});
