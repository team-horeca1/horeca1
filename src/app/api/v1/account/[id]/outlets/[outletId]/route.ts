/**
 * PATCH  /api/v1/account/[id]/outlets/[outletId] — update outlet (requires outlets.edit)
 * DELETE /api/v1/account/[id]/outlets/[outletId] — soft-delete outlet (requires outlets.delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { assertAccountPermission } from '@/lib/accountAccess';

const PatchBody = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().max(50).nullable().optional(),
  addressLine: z.string().min(1).optional(),
  flatInfo: z.string().max(255).nullable().optional(),
  landmark: z.string().max(255).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  pincode: z.string().max(10).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  placeId: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  requiresAddressUpdate: z.boolean().optional(),
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { id, outletId } = extractIds(req);
    await assertAccountPermission(ctx.userId, id, 'outlets.edit', ctx.activeOutletId);
    const existing = await prisma.outlet.findFirst({
      where: { id: outletId, businessAccountId: id },
      select: { id: true, pincode: true, requiresAddressUpdate: true },
    });
    if (!existing) throw Errors.notFound('Outlet');
    const body = PatchBody.parse(await req.json());

    // Auto-clear "address needed" once a valid 6-digit pincode lands.
    // Pincode is what serviceability + checkout actually need; lat/lng is nice-to-have
    // for future map features. Without this, users were stuck with the amber chip
    // forever because the legacy seed never asked for coordinates.
    const data: Record<string, unknown> = { ...body };
    if (body.requiresAddressUpdate === undefined) {
      const incomingPincode = body.pincode === undefined ? existing.pincode : body.pincode;
      if (incomingPincode && /^\d{6}$/.test(incomingPincode)) {
        data.requiresAddressUpdate = false;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.outlet.update({ where: { id: outletId }, data });

      // Update corresponding SavedAddress if one exists
      await tx.savedAddress.updateMany({
        where: { outletId: outletId },
        data: {
          ...(body.name !== undefined && { label: body.name, businessName: body.name }),
          ...(body.addressLine !== undefined && { fullAddress: body.addressLine, shortAddress: body.addressLine.split(',').slice(0, 2).join(', ') }),
          ...(body.flatInfo !== undefined && { flatInfo: body.flatInfo }),
          ...(body.landmark !== undefined && { landmark: body.landmark }),
          ...(body.pincode !== undefined && { pincode: body.pincode }),
          ...(body.city !== undefined && { city: body.city }),
          ...(body.state !== undefined && { state: body.state }),
          ...(body.latitude !== undefined && { latitude: body.latitude ?? 0 }),
          ...(body.longitude !== undefined && { longitude: body.longitude ?? 0 }),
          ...(body.placeId !== undefined && { placeId: body.placeId }),
        },
      });

      return u;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) { return errorResponse(err); }
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { id, outletId } = extractIds(req);
    await assertAccountPermission(ctx.userId, id, 'outlets.delete', ctx.activeOutletId);
    const existing = await prisma.outlet.findFirst({ where: { id: outletId, businessAccountId: id }, select: { id: true } });
    if (!existing) throw Errors.notFound('Outlet');

    const activeCount = await prisma.outlet.count({
      where: { businessAccountId: id, isActive: true },
    });
    if (activeCount <= 1) {
      throw Errors.badRequest('Cannot remove your only delivery outlet — edit it instead');
    }

    await prisma.$transaction(async (tx) => {
      await tx.outlet.update({ where: { id: outletId }, data: { isActive: false } });
      // Delete corresponding SavedAddress as well to keep it clean
      await tx.savedAddress.deleteMany({ where: { outletId: outletId } });
    });

    return NextResponse.json({ success: true });
  } catch (err) { return errorResponse(err); }
});

function extractIds(req: NextRequest) {
  // /api/v1/account/<id>/outlets/<outletId>
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return { id: segments[segments.length - 3], outletId: segments[segments.length - 1] };
}
