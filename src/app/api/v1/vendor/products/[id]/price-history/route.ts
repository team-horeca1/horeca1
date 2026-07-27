// GET /api/v1/vendor/products/:id/price-history — dedicated price change log for a product
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 2];
}

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'products.edit');
    const productId = extractId(req);

    const product = await prisma.product.findFirst({
      where: { id: productId, vendorId },
      select: { id: true },
    });
    if (!product) throw Errors.notFound('Product');

    const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '100');
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 100;

    const logs = await prisma.priceHistory.findMany({
      where: { productId, vendorId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        field: true,
        oldValue: true,
        newValue: true,
        source: true,
        reason: true,
        priceListId: true,
        createdAt: true,
        priceList: { select: { id: true, name: true } },
        actor: { select: { fullName: true, email: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: logs.map((l) => ({
        id: l.id,
        field: l.field,
        oldValue: l.oldValue,
        newValue: l.newValue,
        source: l.source,
        reason: l.reason,
        priceListId: l.priceListId,
        priceListName: l.priceList?.name ?? null,
        changedAt: l.createdAt,
        actorName: l.actor?.fullName ?? l.actor?.email ?? null,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
