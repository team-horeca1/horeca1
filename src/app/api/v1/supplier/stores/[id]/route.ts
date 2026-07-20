/**
 * PATCH /api/v1/supplier/stores/[id] — update / disable Online Store
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { updateOnlineStore } from '@/modules/supplier/supplier.service';
import { resolveSupplierActorUserId } from '@/lib/resolveVendorId';

const Body = z.object({
  storeName: z.string().min(2).max(255).optional(),
  storeDisplayName: z.string().max(255).optional(),
  addressLine: z.string().max(2000).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    const id = new URL(req.url).pathname.split('/').filter(Boolean).at(-1);
    if (!id) throw Errors.badRequest('Store id required');
    const actorId = await resolveSupplierActorUserId(ctx, req);
    const body = Body.parse(await req.json());
    const data = await updateOnlineStore(actorId, id, body);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return errorResponse(err);
  }
});
