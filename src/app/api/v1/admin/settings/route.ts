// GET   /api/v1/admin/settings — read the global platform configuration
// PATCH /api/v1/admin/settings — update it (admin, settings.edit)
// The config is a single row; we get-or-create it so the page always has data.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { errorResponse } from '@/middleware/errorHandler';
import type { PlatformSetting } from '@prisma/client';
import { normalizeGstSlabs } from '@/lib/constants/gstSlabs';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';

function serialize(s: PlatformSetting) {
  return {
    platformName: s.platformName,
    contactEmail: s.contactEmail ?? '',
    supportPhone: s.supportPhone ?? '',
    defaultCommissionPct: Number(s.defaultCommissionPct),
    minOrderValue: Number(s.minOrderValue),
    freeDeliveryThreshold: Number(s.freeDeliveryThreshold),
    emailNotifications: s.emailNotifications,
    smsNotifications: s.smsNotifications,
    pushNotifications: s.pushNotifications,
    gstSlabs: normalizeGstSlabs(s.gstSlabs),
    updatedAt: s.updatedAt,
  };
}

async function getOrCreate(): Promise<PlatformSetting> {
  const existing = await prisma.platformSetting.findFirst();
  return existing ?? prisma.platformSetting.create({ data: {} });
}

export const GET = adminOnly(async (_req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.view');
    return NextResponse.json({ success: true, data: serialize(await getOrCreate()) });
  } catch (error) {
    return errorResponse(error);
  }
});

const patchSchema = z.object({
  platformName: z.string().min(1).max(120).optional(),
  contactEmail: z.union([z.string().email(), z.literal('')]).optional(),
  supportPhone: z.string().max(30).optional(),
  defaultCommissionPct: z.number().min(0).max(100).optional(),
  minOrderValue: z.number().min(0).optional(),
  freeDeliveryThreshold: z.number().min(0).optional(),
  emailNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  gstSlabs: z.array(z.number().min(0).max(100)).min(1).optional(),
});

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit');
    const input = patchSchema.parse(await req.json());
    const current = await getOrCreate();

    const updated = await prisma.platformSetting.update({
      where: { id: current.id },
      data: {
        ...(input.platformName !== undefined && { platformName: input.platformName }),
        ...(input.contactEmail !== undefined && { contactEmail: input.contactEmail || null }),
        ...(input.supportPhone !== undefined && { supportPhone: input.supportPhone || null }),
        ...(input.defaultCommissionPct !== undefined && { defaultCommissionPct: input.defaultCommissionPct }),
        ...(input.minOrderValue !== undefined && { minOrderValue: input.minOrderValue }),
        ...(input.freeDeliveryThreshold !== undefined && { freeDeliveryThreshold: input.freeDeliveryThreshold }),
        ...(input.emailNotifications !== undefined && { emailNotifications: input.emailNotifications }),
        ...(input.smsNotifications !== undefined && { smsNotifications: input.smsNotifications }),
        ...(input.pushNotifications !== undefined && { pushNotifications: input.pushNotifications }),
        ...(input.gstSlabs !== undefined && { gstSlabs: normalizeGstSlabs(input.gstSlabs) }),
      },
    });
    logAction(ctx, req, {
      action: AUDIT_ACTIONS.settingsUpdate,
      entity: 'PlatformSetting',
      entityId: current.id,
      before: serialize(current),
      after: serialize(updated),
    });
    return NextResponse.json({ success: true, data: serialize(updated) });
  } catch (error) {
    return errorResponse(error);
  }
});
