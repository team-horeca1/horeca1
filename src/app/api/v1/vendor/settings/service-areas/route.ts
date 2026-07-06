// POST   /api/v1/vendor/settings/service-areas — Add a service area
// PATCH  /api/v1/vendor/settings/service-areas — Update a service area
// DELETE /api/v1/vendor/settings/service-areas — Remove a service area

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorOutletContext } from '@/lib/resolveVendorOutletContext';
import { requirePermission } from '@/lib/permissions/engine';

const addSchema = z.object({
  pincode: z.string().min(4).max(10),
  outletId: z.string().uuid().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

// POST — add new service area pincode
export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const outletCtx = await resolveVendorOutletContext(ctx, req);
    requirePermission(ctx, 'settings.edit');
    const body = await req.json();
    const { pincode, outletId: bodyOutletId } = addSchema.parse(body);

    const outletId = outletCtx.multiWarehouseEnabled
      ? (bodyOutletId ?? outletCtx.outletId)
      : null;

    const existing = await prisma.serviceArea.findFirst({
      where: { vendorId: outletCtx.vendorId, pincode, outletId },
    });
    if (existing) throw Errors.conflict('Service area with this pincode already exists');

    const area = await prisma.serviceArea.create({
      data: { vendorId: outletCtx.vendorId, outletId, pincode, isActive: true },
      select: { id: true, pincode: true, isActive: true, outletId: true },
    });

    return NextResponse.json({ success: true, data: area }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

// PATCH — toggle active/inactive
export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const outletCtx = await resolveVendorOutletContext(ctx, req);
    requirePermission(ctx, 'settings.edit');
    const body = await req.json();
    const { id, isActive } = updateSchema.parse(body);

    const area = await prisma.serviceArea.findFirst({ where: { id, vendorId: outletCtx.vendorId } });
    if (!area) throw Errors.notFound('Service area');

    const updated = await prisma.serviceArea.update({
      where: { id },
      data: { isActive },
      select: { id: true, pincode: true, isActive: true, outletId: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

// DELETE — remove service area
export const DELETE = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const outletCtx = await resolveVendorOutletContext(ctx, req);
    requirePermission(ctx, 'settings.edit');
    const body = await req.json();
    const { id } = deleteSchema.parse(body);

    const area = await prisma.serviceArea.findFirst({ where: { id, vendorId: outletCtx.vendorId } });
    if (!area) throw Errors.notFound('Service area');

    await prisma.serviceArea.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
