/**
 * PATCH /api/v1/supplier/businesses/[id] — update Business details
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { updateBusiness } from '@/modules/supplier/supplier.service';
import { resolveSupplierActorUserId } from '@/lib/resolveVendorId';

const Body = z.object({
  legalName: z.string().min(2).max(255).optional(),
  displayName: z.string().max(255).optional(),
  gstin: z.string().max(20).optional(),
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    const id = new URL(req.url).pathname.split('/').filter(Boolean).at(-1);
    if (!id) throw Errors.badRequest('Business id required');
    const actorId = await resolveSupplierActorUserId(ctx, req);
    const body = Body.parse(await req.json());
    const data = await updateBusiness(actorId, id, body);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return errorResponse(err);
  }
});
