// GET/PATCH /api/v1/vendor/setup — Supplier Foundation setup wizard progress
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { assertGoLiveReady } from '@/modules/supplier/foundation.service';

const SETUP_STEPS = [
  'business',
  'online_store',
  'delivery',
  'team',
  'profile',
  'products',
  'inventory',
  'credit',
  'payment_modes',
  'go_live',
] as const;

const REQUIRED_BEFORE_GO_LIVE = ['business', 'online_store', 'delivery', 'profile'] as const;

const patchSchema = z.object({
  step: z.enum(SETUP_STEPS),
  completed: z.boolean(),
  skipped: z.boolean().optional(),
});

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'dashboard.view');
    const vendorId = await resolveVendorId(ctx, req);
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { setupProgress: true, isVerified: true, isActive: true },
    });
    const progress = (vendor?.setupProgress ?? {}) as Record<string, boolean>;
    // Seed foundation steps when missing for existing stores
    if (progress.business !== true) progress.business = true;
    if (progress.online_store !== true) progress.online_store = true;

    const goLiveCheck = await assertGoLiveReady(vendorId);
    const wizardComplete =
      progress.go_live === true
      || (vendor?.isVerified === true && vendor?.isActive === true);
    const completedRequired =
      wizardComplete || REQUIRED_BEFORE_GO_LIVE.every((s) => progress[s] === true);

    return NextResponse.json({
      success: true,
      data: {
        steps: SETUP_STEPS,
        progress,
        completedRequired,
        wizardComplete,
        isVerified: vendor?.isVerified,
        goLive: goLiveCheck,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'dashboard.view');
    const vendorId = await resolveVendorId(ctx, req);
    const body = patchSchema.parse(await req.json());
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { setupProgress: true, isVerified: true, isActive: true },
    });
    const progress = { ...((vendor?.setupProgress ?? {}) as Record<string, boolean>) };

    if (body.step === 'go_live' && body.completed) {
      const check = await assertGoLiveReady(vendorId, { enforceProduct: true });
      if (!check.ready && !check.isLegacyLive) {
        throw Errors.badRequest(
          `Cannot go live yet. Missing: ${check.missing.join(', ')}`,
        );
      }
      progress.go_live = true;
      await prisma.vendor.update({
        where: { id: vendorId },
        data: {
          setupProgress: progress,
          isActive: true,
        },
        select: { id: true },
      });
      return NextResponse.json({ success: true, data: progress });
    }

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
