/**
 * GET  /api/v1/supplier/businesses/[id]/stores
 * POST /api/v1/supplier/businesses/[id]/stores — create Online Store under Business
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { listStoresForBusiness } from '@/modules/supplier/foundation.service';
import { createOnlineStore } from '@/modules/supplier/supplier.service';
import { prisma } from '@/lib/prisma';
import { resolveSupplierActorUserId } from '@/lib/resolveVendorId';

const CreateBody = z.object({
  storeName: z.string().min(2).max(255),
  storeDisplayName: z.string().max(255).optional(),
  addressLine: z.string().max(2000).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
});

function businessIdFromUrl(url: string): string {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  // .../supplier/businesses/<id>/stores
  const idx = parts.indexOf('businesses');
  return parts[idx + 1] ?? '';
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const businessAccountId = businessIdFromUrl(req.url);
    if (!businessAccountId) throw Errors.badRequest('Business id required');
    const actorId = await resolveSupplierActorUserId(ctx, req);

    const membership = await prisma.businessAccountMember.findUnique({
      where: {
        userId_businessAccountId: { userId: actorId, businessAccountId },
      },
      select: { id: true },
    });
    if (!membership) {
      throw Errors.forbidden('You are not a member of this Business');
    }

    const data = await listStoresForBusiness(businessAccountId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return errorResponse(err);
  }
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const businessAccountId = businessIdFromUrl(req.url);
    if (!businessAccountId) throw Errors.badRequest('Business id required');
    const actorId = await resolveSupplierActorUserId(ctx, req);
    const body = CreateBody.parse(await req.json());
    const data = await createOnlineStore(actorId, businessAccountId, body);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
});
