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
  // Zoho kinds: 'selected' = only added products (default); 'percent' = all products at -discountPercent%.
  kind: z.enum(['selected', 'percent']).optional().default('selected'),
  discountPercent: z.number().min(0).max(100).optional(),
  priority: z.number().int().min(0).max(9999).optional(),
  // Optional list-level validity window (ISO datetime strings or null).
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
}).refine(
  (b) => b.kind !== 'percent' || (typeof b.discountPercent === 'number' && b.discountPercent > 0),
  { message: 'An "All products" list needs discountPercent > 0' },
);

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
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
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
        // 'selected' lists must not carry a list-wide discount (membership = priced items).
        discountPercent: body.kind === 'percent' ? body.discountPercent ?? 0 : 0,
        ...(body.priority !== undefined && { priority: body.priority }),
        validFrom: body.validFrom ? new Date(body.validFrom) : null,
        validTo: body.validTo ? new Date(body.validTo) : null,
      },
    });

    return NextResponse.json({ success: true, data: priceList }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
