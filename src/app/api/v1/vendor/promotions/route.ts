// GET  /api/v1/vendor/promotions — List all promotions for this vendor
// POST /api/v1/vendor/promotions — Create a new promotion
// WHY: Vendors run time-bound deals, bulk discounts, and BXGY offers to drive
//      order volume from their customer base.
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId, resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { livePromotionWhere, findConflictingBxgyPromotion } from '@/modules/promotion/promotion.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const vendorId = await resolveVendorId(ctx, req);
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('active') === '1';

    const promotions = await prisma.promotion.findMany({
      where: {
        vendorId,
        ...(activeOnly ? { ...livePromotionWhere() } : {}),
      },
      include: {
        buyProduct: { select: { id: true, name: true } },
        getProduct: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: promotions });
  } catch (error) {
    return errorResponse(error);
  }
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['pct_discount', 'flat_discount', 'bxgy']),
  isActive: z.boolean().optional().default(true),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  minOrderValue: z.number().min(0).optional().nullable(),
  minQty: z.number().int().min(1).optional().nullable(),
  buyProductId: z.string().uuid().optional().nullable(),
  discountPct: z.number().min(0).max(100).optional().nullable(),
  discountFlat: z.number().min(0).optional().nullable(),
  getProductId: z.string().uuid().optional().nullable(),
  getQty: z.number().int().min(1).optional().nullable(),
  usageLimit: z.number().int().min(1).optional().nullable(),
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'promotions.create');

    const body = createSchema.parse(await req.json());

    if (body.type === 'bxgy' && body.buyProductId) {
      const conflict = await findConflictingBxgyPromotion(prisma, vendorId, body.buyProductId);
      if (conflict) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message: `A live BXGY offer already exists for this buy product ("${conflict.name}"). Deactivate it first or edit the existing offer.`,
            },
          },
          { status: 400 },
        );
      }
    }

    const promotion = await prisma.promotion.create({
      data: {
        vendorId,
        name: body.name,
        type: body.type,
        isActive: body.isActive ?? true,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        minOrderValue: body.minOrderValue ?? null,
        minQty: body.minQty ?? null,
        buyProductId: body.buyProductId ?? null,
        discountPct: body.discountPct ?? null,
        discountFlat: body.discountFlat ?? null,
        getProductId: body.getProductId ?? null,
        getQty: body.getQty ?? null,
        usageLimit: body.usageLimit ?? null,
      },
      include: {
        buyProduct: { select: { id: true, name: true } },
        getProduct: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: promotion });
  } catch (error) {
    return errorResponse(error);
  }
});
