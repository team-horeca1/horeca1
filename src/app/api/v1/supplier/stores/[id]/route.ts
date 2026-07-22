/**
 * GET    /api/v1/supplier/stores/[id] — Online Store detail (edit prefill)
 * PATCH  /api/v1/supplier/stores/[id] — update Online Store
 * DELETE /api/v1/supplier/stores/[id] — delete Online Store (no orders; not last store)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import {
  deleteOnlineStore,
  getOnlineStore,
  updateOnlineStore,
} from '@/modules/supplier/supplier.service';
import { resolveSupplierActorUserId } from '@/lib/resolveVendorId';
import { DELIVERY_CAPABILITIES } from '@/lib/validators/vendor-kyc';

const Body = z.object({
  storeName: z.string().min(2).max(255).optional(),
  storeDisplayName: z.string().max(255).optional(),
  addressLine: z.string().max(2000).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
  isActive: z.boolean().optional(),
  authorizedPersonName: z.string().max(255).optional(),
  authorizedPersonPhone: z.string().max(20).optional(),
  authorizedPersonEmail: z.string().max(255).optional(),
  gstNumber: z.string().max(20).optional(),
  panNumber: z.string().max(20).optional(),
  fssaiNumber: z.string().max(50).optional(),
  udyamNumber: z.string().max(50).optional(),
  cinNumber: z.string().max(50).optional(),
  bankAccountName: z.string().max(100).optional(),
  bankAccountNumber: z.string().max(30).optional(),
  bankIfsc: z.string().max(20).optional(),
  bankName: z.string().max(100).optional(),
  bankAccountType: z.enum(['savings', 'current']).optional(),
  pickupAddressLine: z.string().max(2000).optional(),
  pickupCity: z.string().max(100).optional(),
  pickupState: z.string().max(100).optional(),
  pickupPincode: z.string().max(10).optional(),
  deliveryCapability: z.enum(DELIVERY_CAPABILITIES).optional(),
  serviceablePincodes: z.array(z.string().max(10)).max(200).optional(),
});

function storeIdFromUrl(url: string): string {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  return parts.at(-1) ?? '';
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const id = storeIdFromUrl(req.url);
    if (!id) throw Errors.badRequest('Store id required');
    const actorId = await resolveSupplierActorUserId(ctx, req);
    const data = await getOnlineStore(actorId, id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return errorResponse(err);
  }
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    const id = storeIdFromUrl(req.url);
    if (!id) throw Errors.badRequest('Store id required');
    const actorId = await resolveSupplierActorUserId(ctx, req);
    const body = Body.parse(await req.json());
    const data = await updateOnlineStore(actorId, id, body);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  try {
    const id = storeIdFromUrl(req.url);
    if (!id) throw Errors.badRequest('Store id required');
    const actorId = await resolveSupplierActorUserId(ctx, req);
    const data = await deleteOnlineStore(actorId, id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return errorResponse(err);
  }
});
