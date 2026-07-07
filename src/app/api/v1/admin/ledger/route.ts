// GET /api/v1/admin/ledger — Platform revenue, vendor payouts, settlements
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  requirePermission(ctx, 'payments.view');
  try {
    const url = new URL(req.url);
    const tab = url.searchParams.get('tab') ?? 'revenue';
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const vendorId = url.searchParams.get('vendorId');
    const format = url.searchParams.get('format');

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(`${to}T23:59:59.999Z`);

    if (tab === 'revenue') {
      const orders = await prisma.order.findMany({
        where: {
          status: 'delivered',
          settlementPlatformFee: { not: null },
          ...(vendorId ? { vendorId } : {}),
          ...(Object.keys(dateFilter).length ? { deliveredAt: dateFilter } : {}),
        },
        select: {
          id: true,
          orderNumber: true,
          deliveredAt: true,
          settlementGrossAmount: true,
          settlementPlatformFee: true,
          settlementGatewayFee: true,
          settlementNetVendorAmount: true,
          vendor: { select: { id: true, businessName: true } },
        },
        orderBy: { deliveredAt: 'desc' },
        take: 500,
      });

      const rows = orders.map((o) => ({
        id: o.id,
        date: o.deliveredAt?.toISOString() ?? '',
        vendorId: o.vendor.id,
        vendorName: o.vendor.businessName,
        reference: o.orderNumber,
        gross: Number(o.settlementGrossAmount ?? 0),
        platformFee: Number(o.settlementPlatformFee ?? 0),
        gatewayFee: Number(o.settlementGatewayFee ?? 0),
        netVendor: Number(o.settlementNetVendorAmount ?? 0),
      }));

      const totals = rows.reduce(
        (acc, r) => ({
          gross: acc.gross + r.gross,
          platformFee: acc.platformFee + r.platformFee,
          gatewayFee: acc.gatewayFee + r.gatewayFee,
          netVendor: acc.netVendor + r.netVendor,
        }),
        { gross: 0, platformFee: 0, gatewayFee: 0, netVendor: 0 },
      );

      if (format === 'csv') {
        const header = 'Date,Vendor,Order,Gross,Platform Fee,Gateway,Vendor Net\n';
        const body = rows.map((r) =>
          [
            r.date.slice(0, 10),
            `"${r.vendorName}"`,
            r.reference,
            r.gross.toFixed(2),
            r.platformFee.toFixed(2),
            r.gatewayFee.toFixed(2),
            r.netVendor.toFixed(2),
          ].join(','),
        ).join('\n');
        return new NextResponse(header + body, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="platform-ledger.csv"',
          },
        });
      }

      return NextResponse.json({ success: true, data: { rows, totals } });
    }

    if (tab === 'settlements') {
      const settlements = await prisma.vendorSettlement.findMany({
        where: {
          ...(vendorId ? { vendorId } : {}),
          ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
        },
        include: {
          vendor: { select: { businessName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });

      const rows = settlements.map((s) => ({
        id: s.id,
        vendorName: s.vendor.businessName,
        status: s.status,
        gross: Number(s.grossAmount),
        platformFee: Number(s.platformFee),
        gatewayFee: Number(s.gatewayFee),
        netAmount: Number(s.netAmount),
        bankReference: s.bankReference,
        periodStart: s.periodStart.toISOString().slice(0, 10),
        periodEnd: s.periodEnd.toISOString().slice(0, 10),
        settledAt: s.settledAt?.toISOString() ?? null,
      }));

      if (format === 'csv') {
        const header = 'Vendor,Period Start,Period End,Status,Gross,Platform Fee,Net,Bank Ref\n';
        const body = rows.map((r) =>
          [
            `"${r.vendorName}"`,
            r.periodStart,
            r.periodEnd,
            r.status,
            r.gross.toFixed(2),
            r.platformFee.toFixed(2),
            r.netAmount.toFixed(2),
            r.bankReference ?? '',
          ].join(','),
        ).join('\n');
        return new NextResponse(header + body, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="settlements.csv"',
          },
        });
      }

      return NextResponse.json({ success: true, data: { rows } });
    }

    // payouts tab — pending wallet balances
    const wallets = await prisma.vendorWallet.findMany({
      where: {
        balance: { gt: 0 },
        ...(vendorId ? { vendorId } : {}),
      },
      include: {
        vendor: { select: { businessName: true } },
      },
      orderBy: { balance: 'desc' },
      take: 100,
    });

    const rows = wallets.map((w) => ({
      vendorId: w.vendorId,
      vendorName: w.vendor.businessName,
      balance: Number(w.balance),
      pendingAmount: Number(w.pendingAmount),
    }));

    return NextResponse.json({ success: true, data: { rows } });
  } catch (error) {
    return errorResponse(error);
  }
});
