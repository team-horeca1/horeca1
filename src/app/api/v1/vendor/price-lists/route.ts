// GET  /api/v1/vendor/price-lists — List all price lists for the vendor
// POST /api/v1/vendor/price-lists — Create a new price list
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorId } from '@/lib/resolveVendorId';

const createSchema = z.object({
  name: z.string().min(1).max(255),
  discountPercent: z.number().min(0).max(100).default(0),
  // Optional list-level validity window (ISO datetime strings or null).
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
});

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'priceLists.view');
    const vendorId = await resolveVendorId(ctx, req);

    const priceLists = await prisma.priceList.findMany({
      where: { vendorId, isActive: true },
      include: {
        assignments: true,
        _count: { select: { items: true, customers: true, assignments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: priceLists });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'priceLists.create');
    const vendorId = await resolveVendorId(ctx, req);
    const body = createSchema.parse(await req.json());

    const priceList = await prisma.priceList.create({
      data: {
        vendorId,
        name: body.name,
        discountPercent: body.discountPercent,
        validFrom: body.validFrom ? new Date(body.validFrom) : null,
        validTo: body.validTo ? new Date(body.validTo) : null,
      },
    });

    return NextResponse.json({ success: true, data: priceList }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
