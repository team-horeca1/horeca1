// GET/PATCH /api/v1/vendor/setup — server-backed setup wizard progress
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';

const SETUP_STEPS = [
  'profile', 'delivery', 'products', 'inventory', 'credit', 'team', 'payment_modes', 'go_live',
] as const;

const patchSchema = z.object({
  step: z.enum(SETUP_STEPS),
  completed: z.boolean(),
  skipped: z.boolean().optional(),
});

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const vendorId = await resolveVendorId(ctx, req);
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { setupProgress: true, isVerified: true, isActive: true },
    });
    const progress = (vendor?.setupProgress ?? {}) as Record<string, boolean>;
    const required = ['profile', 'delivery', 'products'];
    const completedRequired = required.every((s) => progress[s]);
    return NextResponse.json({
      success: true,
      data: {
        steps: SETUP_STEPS,
        progress,
        completedRequired,
        wizardComplete: progress.go_live === true,
        isVerified: vendor?.isVerified,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const vendorId = await resolveVendorId(ctx, req);
    const body = patchSchema.parse(await req.json());
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { setupProgress: true },
    });
    const progress = { ...((vendor?.setupProgress ?? {}) as Record<string, boolean>) };
    progress[body.step] = body.completed;
    if (body.skipped) progress[`${body.step}_skipped`] = true;

    const updated = await prisma.vendor.update({
      where: { id: vendorId },
      data: { setupProgress: progress },
      select: { setupProgress: true },
    });
    return NextResponse.json({ success: true, data: updated.setupProgress });
  } catch (error) {
    return errorResponse(error);
  }
});
