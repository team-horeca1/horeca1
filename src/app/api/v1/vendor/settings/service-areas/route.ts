// POST   /api/v1/vendor/settings/service-areas — Add a service area
// PATCH  /api/v1/vendor/settings/service-areas — Update a service area
// DELETE /api/v1/vendor/settings/service-areas — Remove a service area

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorOutletContext } from '@/lib/resolveVendorOutletContext';
import { resolveSupplierActorUserId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { assertPincodeAvailableForSupplier } from '@/modules/supplier/foundation.service';

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

// POST — add new service area pincode (Online Store scoped; default outlet)
export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const outletCtx = await resolveVendorOutletContext(ctx, req);
    requirePermission(ctx, 'settings.edit');
    const body = await req.json();
    const { pincode } = addSchema.parse(body);
    const trimmed = pincode.trim();

    const supplierUserId = await resolveSupplierActorUserId(ctx, req);
    await assertPincodeAvailableForSupplier(supplierUserId, trimmed, outletCtx.vendorId);

    const existing = await prisma.serviceArea.findFirst({
      where: {
        vendorId: outletCtx.vendorId,
        pincode: trimmed,
        outletId: outletCtx.outletId,
      },
    });
    if (existing) throw Errors.conflict('Service area with this pincode already exists on this Online Store');

    const area = await prisma.serviceArea.create({
      data: {
        vendorId: outletCtx.vendorId,
        outletId: outletCtx.outletId,
        pincode: trimmed,
        isActive: true,
      },
      select: { id: true, pincode: true, isActive: true, outletId: true },
    });

    // Mark delivery setup step complete
    const vendor = await prisma.vendor.findUnique({
      where: { id: outletCtx.vendorId },
      select: { setupProgress: true },
    });
    const progress = { ...((vendor?.setupProgress ?? {}) as Record<string, boolean>), delivery: true };
    await prisma.vendor.update({
      where: { id: outletCtx.vendorId },
      data: { setupProgress: progress },
    }).catch(() => undefined);

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

    if (isActive) {
      const supplierUserId = await resolveSupplierActorUserId(ctx, req);
      await assertPincodeAvailableForSupplier(supplierUserId, area.pincode, outletCtx.vendorId);
    }

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
