// PATCH  /api/v1/vendor/promotions/:id — Update a promotion
// DELETE /api/v1/vendor/promotions/:id — Delete a promotion
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { findConflictingBxgyPromotion } from '@/modules/promotion/promotion.service';

function extractId(req: NextRequest) {
  return new URL(req.url).pathname.split('/').at(-1) ?? '';
}

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  minOrderValue: z.number().min(0).nullable().optional(),
  minQty: z.number().int().min(1).nullable().optional(),
  buyProductId: z.string().uuid().nullable().optional(),
  discountPct: z.number().min(0).max(100).nullable().optional(),
  discountFlat: z.number().min(0).nullable().optional(),
  getProductId: z.string().uuid().nullable().optional(),
  getQty: z.number().int().min(1).nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'promotions.create');

    const promoId = extractId(req);
    const body = updateSchema.parse(await req.json());

    const existing = await prisma.promotion.findFirst({ where: { id: promoId, vendorId } });
    if (!existing) throw Errors.notFound('Promotion');

    const nextBuyProductId = body.buyProductId !== undefined ? body.buyProductId : existing.buyProductId;
    if (existing.type === 'bxgy' && nextBuyProductId) {
      const conflict = await findConflictingBxgyPromotion(prisma, vendorId, nextBuyProductId, promoId);
      if (conflict) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message: `Another live BXGY offer already targets this buy product ("${conflict.name}").`,
            },
          },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.promotion.update({
      where: { id: promoId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate) : null }),
        ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate) : null }),
        ...(body.minOrderValue !== undefined && { minOrderValue: body.minOrderValue }),
        ...(body.minQty !== undefined && { minQty: body.minQty }),
        ...(body.buyProductId !== undefined && { buyProductId: body.buyProductId }),
        ...(body.discountPct !== undefined && { discountPct: body.discountPct }),
        ...(body.discountFlat !== undefined && { discountFlat: body.discountFlat }),
        ...(body.getProductId !== undefined && { getProductId: body.getProductId }),
        ...(body.getQty !== undefined && { getQty: body.getQty }),
        ...(body.usageLimit !== undefined && { usageLimit: body.usageLimit }),
      },
      include: {
        buyProduct: { select: { id: true, name: true } },
        getProduct: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'promotions.create');

    const promoId = extractId(req);
    const existing = await prisma.promotion.findFirst({ where: { id: promoId, vendorId } });
    if (!existing) throw Errors.notFound('Promotion');

    await prisma.promotion.delete({ where: { id: promoId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
