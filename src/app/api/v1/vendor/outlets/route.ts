import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { prisma } from '@/lib/prisma';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        businessAccountId: true,
        businessAccount: { select: { primaryOutletId: true, displayName: true, legalName: true } },
      },
    });
    if (!vendor) return NextResponse.json({ success: true, data: { businessAccount: null, outlets: [] } });

    const outlets = await prisma.outlet.findMany({
      where: {
        businessAccountId: vendor.businessAccountId,
        isActive: true,
        ...(ctx.accessibleOutletIds.length > 0
          ? { id: { in: ctx.accessibleOutletIds } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        code: true,
        addressLine: true,
        city: true,
        pincode: true,
        requiresAddressUpdate: true,
      },
      orderBy: { name: 'asc' },
    });

    const enriched = await Promise.all(
      outlets.map(async (o) => {
        const [serviceAreaCount, stockAgg] = await Promise.all([
          prisma.serviceArea.count({ where: { vendorId, outletId: o.id, isActive: true } }),
          prisma.inventory.aggregate({
            where: { vendorId, outletId: o.id },
            _sum: { qtyAvailable: true },
            _count: { id: true },
          }),
        ]);
        return {
          ...o,
          isPrimary: o.id === vendor.businessAccount.primaryOutletId,
          serviceAreaCount,
          skuCount: stockAgg._count.id,
          totalQty: stockAgg._sum.qtyAvailable ?? 0,
        };
      }),
    );

    return NextResponse.json({
      success: true,
      data: {
        businessAccount: {
          id: vendor.businessAccountId,
          name: vendor.businessAccount.displayName ?? vendor.businessAccount.legalName,
          primaryOutletId: vendor.businessAccount.primaryOutletId,
        },
        outlets: enriched,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
