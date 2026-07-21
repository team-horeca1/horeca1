/**
 * PATCH /api/v1/supplier/businesses/[id] — update Business details
 * DELETE /api/v1/supplier/businesses/[id] — delete Business + its Online Stores
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { deleteBusiness, updateBusiness } from '@/modules/supplier/supplier.service';
import { resolveSupplierActorUserId } from '@/lib/resolveVendorId';
import { normalizeVendorTypeSelections } from '@/lib/constants/vendorProfile';

const Body = z.object({
  legalName: z.string().min(2).max(255).optional(),
  displayName: z.string().max(255).optional(),
  gstin: z.string().max(20).optional(),
  vendorTypeSelections: z.array(z.object({
    type: z.string().min(1),
    slug: z.string().optional(),
    subTypes: z.array(z.string()).default([]),
  })).optional(),
  businessSize: z.string().max(50).optional().nullable(),
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    const id = new URL(req.url).pathname.split('/').filter(Boolean).at(-1);
    if (!id) throw Errors.badRequest('Business id required');
    const actorId = await resolveSupplierActorUserId(ctx, req);
    const body = Body.parse(await req.json());
    const typeSelections = body.vendorTypeSelections !== undefined
      ? normalizeVendorTypeSelections(body.vendorTypeSelections)
      : undefined;
    const data = await updateBusiness(actorId, id, {
      legalName: body.legalName,
      displayName: body.displayName,
      gstin: body.gstin,
      businessSize: body.businessSize,
      ...(typeSelections !== undefined ? { vendorTypeSelections: typeSelections } : {}),
    });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  try {
    const id = new URL(req.url).pathname.split('/').filter(Boolean).at(-1);
    if (!id) throw Errors.badRequest('Business id required');
    const actorId = await resolveSupplierActorUserId(ctx, req);
    const data = await deleteBusiness(actorId, id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return errorResponse(err);
  }
});
