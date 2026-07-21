/**
 * GET  /api/v1/supplier/businesses — list supplier Businesses + Online Stores
 * POST /api/v1/supplier/businesses — create Business only (stores via .../stores)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import {
  createBusiness,
  listSupplierBusinesses,
} from '@/modules/supplier/supplier.service';
import { resolveSupplierActorUserId } from '@/lib/resolveVendorId';
import { normalizeVendorTypeSelections } from '@/lib/constants/vendorProfile';

const CreateBody = z.object({
  legalName: z.string().min(2).max(255),
  displayName: z.string().max(255).optional(),
  gstin: z.string().max(20).optional(),
  vendorTypeSelections: z.array(z.object({
    type: z.string().min(1),
    slug: z.string().optional(),
    subTypes: z.array(z.string()).default([]),
  })).optional(),
  businessSize: z.string().max(50).optional(),
});

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const actorId = await resolveSupplierActorUserId(ctx, req);
    const data = await listSupplierBusinesses(actorId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return errorResponse(err);
  }
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const actorId = await resolveSupplierActorUserId(ctx, req);
    const body = CreateBody.parse(await req.json());
    const typeSelections = normalizeVendorTypeSelections(body.vendorTypeSelections);
    const data = await createBusiness(actorId, {
      legalName: body.legalName,
      displayName: body.displayName,
      gstin: body.gstin,
      businessSize: body.businessSize,
      vendorTypeSelections: typeSelections.length > 0 ? typeSelections : undefined,
    });
    // Ensure User.role can access vendor portal (skip when Admin View)
    if (ctx.role === 'customer') {
      const { prisma } = await import('@/lib/prisma');
      await prisma.user.update({
        where: { id: actorId },
        data: { role: 'vendor' },
      }).catch(() => undefined);
    }
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
});
