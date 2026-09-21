// POST   /api/v1/vendor/settings/service-areas — Add a service area
// PATCH  /api/v1/vendor/settings/service-areas — Update a service area / bulk days
// DELETE /api/v1/vendor/settings/service-areas — Remove a service area

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorOutletContext } from '@/lib/resolveVendorOutletContext';
import { requirePermission } from '@/lib/permissions/engine';
import { lookupPincode } from '@/lib/pincodeLookup';

const SERVICE_AREA_SELECT = {
  id: true,
  pincode: true,
  isActive: true,
  outletId: true,
  cityLabel: true,
  areaLabel: true,
  deliversMon: true,
  deliversTue: true,
  deliversWed: true,
  deliversThu: true,
  deliversFri: true,
  deliversSat: true,
  deliversSun: true,
  cutoffTime: true,
  thirdPartyDeliveryAvailable: true,
} as const;

const addSchema = z.object({
  pincode: z.string().min(4).max(10),
  outletId: z.string().uuid().optional(),
});

const cutoffSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM');

const updateSchema = z.object({
  id: z.string().uuid().optional(),
  ids: z.array(z.string().uuid()).min(1).optional(),
  isActive: z.boolean().optional(),
  cityLabel: z.string().max(100).nullable().optional(),
  areaLabel: z.string().max(100).nullable().optional(),
  deliversMon: z.boolean().optional(),
  deliversTue: z.boolean().optional(),
  deliversWed: z.boolean().optional(),
  deliversThu: z.boolean().optional(),
  deliversFri: z.boolean().optional(),
  deliversSat: z.boolean().optional(),
  deliversSun: z.boolean().optional(),
  cutoffTime: cutoffSchema.optional(),
  thirdPartyDeliveryAvailable: z.boolean().optional(),
}).refine((d) => d.id || (d.ids && d.ids.length > 0), {
  message: 'Provide id or ids',
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

async function getPlatformDeliveryDefaults() {
  const row = await prisma.platformSetting.findFirst({
    select: {
      defaultDeliversMon: true,
      defaultDeliversTue: true,
      defaultDeliversWed: true,
      defaultDeliversThu: true,
      defaultDeliversFri: true,
      defaultDeliversSat: true,
      defaultDeliversSun: true,
      defaultCutoffTime: true,
    },
  });
  return {
    deliversMon: row?.defaultDeliversMon ?? true,
    deliversTue: row?.defaultDeliversTue ?? false,
    deliversWed: row?.defaultDeliversWed ?? true,
    deliversThu: row?.defaultDeliversThu ?? false,
    deliversFri: row?.defaultDeliversFri ?? true,
    deliversSat: row?.defaultDeliversSat ?? false,
    deliversSun: row?.defaultDeliversSun ?? false,
    cutoffTime: row?.defaultCutoffTime ?? '16:00',
  };
}

// POST — add new service area pincode (prefill Delivery Plan defaults + city/area suggestion)
export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const outletCtx = await resolveVendorOutletContext(ctx, req);
    requirePermission(ctx, 'settings.edit');
    const body = await req.json();
    const { pincode } = addSchema.parse(body);
    const trimmed = pincode.trim();

    const existing = await prisma.serviceArea.findFirst({
      where: {
        vendorId: outletCtx.vendorId,
        pincode: trimmed,
        outletId: outletCtx.outletId,
      },
    });
    if (existing) throw Errors.conflict('Service area with this pincode already exists on this Online Store');

    const defaults = await getPlatformDeliveryDefaults();
    const suggestion = lookupPincode(trimmed);

    const area = await prisma.serviceArea.create({
      data: {
        vendorId: outletCtx.vendorId,
        outletId: outletCtx.outletId,
        pincode: trimmed,
        isActive: true,
        cityLabel: suggestion?.city ?? null,
        areaLabel: suggestion?.area ?? null,
        ...defaults,
        thirdPartyDeliveryAvailable: false,
      },
      select: SERVICE_AREA_SELECT,
    });

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

// PATCH — toggle active, update schedule fields, or bulk-apply days
export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const outletCtx = await resolveVendorOutletContext(ctx, req);
    requirePermission(ctx, 'settings.edit');
    const body = updateSchema.parse(await req.json());

    const dayFields = {
      ...(body.deliversMon !== undefined && { deliversMon: body.deliversMon }),
      ...(body.deliversTue !== undefined && { deliversTue: body.deliversTue }),
      ...(body.deliversWed !== undefined && { deliversWed: body.deliversWed }),
      ...(body.deliversThu !== undefined && { deliversThu: body.deliversThu }),
      ...(body.deliversFri !== undefined && { deliversFri: body.deliversFri }),
      ...(body.deliversSat !== undefined && { deliversSat: body.deliversSat }),
      ...(body.deliversSun !== undefined && { deliversSun: body.deliversSun }),
    };

    // Bulk-apply days only (visible rows from UI)
    if (body.ids && body.ids.length > 0) {
      if (Object.keys(dayFields).length === 0) {
        throw Errors.badRequest('Bulk update requires day fields');
      }
      const owned = await prisma.serviceArea.findMany({
        where: { vendorId: outletCtx.vendorId, id: { in: body.ids } },
        select: { id: true },
      });
      if (owned.length !== body.ids.length) throw Errors.notFound('Service area');

      await prisma.serviceArea.updateMany({
        where: { vendorId: outletCtx.vendorId, id: { in: body.ids } },
        data: dayFields,
      });

      const rows = await prisma.serviceArea.findMany({
        where: { vendorId: outletCtx.vendorId, id: { in: body.ids } },
        select: SERVICE_AREA_SELECT,
      });
      return NextResponse.json({ success: true, data: rows });
    }

    if (!body.id) throw Errors.badRequest('Missing id');

    const area = await prisma.serviceArea.findFirst({
      where: { id: body.id, vendorId: outletCtx.vendorId },
    });
    if (!area) throw Errors.notFound('Service area');

    const updated = await prisma.serviceArea.update({
      where: { id: body.id },
      data: {
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.cityLabel !== undefined && { cityLabel: body.cityLabel }),
        ...(body.areaLabel !== undefined && { areaLabel: body.areaLabel }),
        ...dayFields,
        ...(body.cutoffTime !== undefined && { cutoffTime: body.cutoffTime }),
        ...(body.thirdPartyDeliveryAvailable !== undefined && {
          thirdPartyDeliveryAvailable: body.thirdPartyDeliveryAvailable,
        }),
      },
      select: SERVICE_AREA_SELECT,
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
