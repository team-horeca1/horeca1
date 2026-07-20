/**
 * GET  /api/v1/supplier/businesses — list supplier Businesses + Online Stores
 * POST /api/v1/supplier/businesses — create Business + first Online Store
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import {
  createBusinessWithStore,
  listSupplierBusinesses,
} from '@/modules/supplier/supplier.service';
import { resolveSupplierActorUserId } from '@/lib/resolveVendorId';

const CreateBody = z.object({
  legalName: z.string().min(2).max(255),
  displayName: z.string().max(255).optional(),
  gstin: z.string().max(20).optional(),
  storeName: z.string().min(2).max(255),
  storeDisplayName: z.string().max(255).optional(),
  addressLine: z.string().max(2000).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
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
    const data = await createBusinessWithStore(actorId, body);
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
