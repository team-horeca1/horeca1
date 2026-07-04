// GET  /api/v1/admin/settlements — list settlement batches
// POST /api/v1/admin/settlements — create batch for a vendor + period, or mark transferred
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { vendorSettlementService } from '@/modules/vendor/vendorSettlement.service';

export const GET = adminOnly(async (req: NextRequest) => {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const vendorId = url.searchParams.get('vendorId');
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const take = 30;

    const where = {
      ...(status ? { status: status as 'pending' | 'processing' | 'settled' | 'failed' } : {}),
      ...(vendorId ? { vendorId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.vendorSettlement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
        include: {
          vendor: { select: { id: true, businessName: true, slug: true } },
          _count: { select: { orders: true } },
        },
      }),
      prisma.vendorSettlement.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        settlements: items.map((s) => ({
          id: s.id,
          vendorId: s.vendorId,
          vendorName: s.vendor.businessName,
          grossAmount: Number(s.grossAmount),
          platformFee: Number(s.platformFee),
          gatewayFee: Number(s.gatewayFee),
          netAmount: Number(s.netAmount),
          status: s.status,
          bankReference: s.bankReference,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          settledAt: s.settledAt,
          orderCount: s._count.orders,
          createdAt: s.createdAt,
        })),
        pagination: { page, take, total, totalPages: Math.ceil(total / take) },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

const createSchema = z.object({
  vendorId: z.string().uuid(),
  periodStart: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  periodEnd: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
});

export const POST = adminOnly(async (req: NextRequest) => {
  try {
    const body = createSchema.parse(await req.json());
    const periodStart = new Date(body.periodStart);
    const periodEnd = new Date(body.periodEnd);
    periodEnd.setHours(23, 59, 59, 999);

    const result = await vendorSettlementService.createSettlementBatch(
      body.vendorId,
      periodStart,
      periodEnd,
    );
    if (!result) {
      return NextResponse.json({
        success: false,
        error: 'No unsettled orders in this period for the vendor',
      }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});
