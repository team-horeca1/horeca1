// GET  /api/v1/admin/homepage/hero — list all slides
// POST /api/v1/admin/homepage/hero — create a slide

import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse } from '@/middleware/errorHandler';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import {
  bodyToSlideInput,
  slideBodySchema,
} from '@/modules/homepage/homepage-hero.schema';
import {
  createHomepageHeroSlide,
  listHomepageHeroSlides,
  snapshotHeroSlide,
} from '@/modules/homepage/homepage-hero.service';

export const GET = adminOnly(async (_req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.view');
    const slides = await listHomepageHeroSlides();
    return NextResponse.json({ success: true, data: { slides } });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit');
    const body = slideBodySchema.parse(await req.json().catch(() => ({})));
    const slide = await createHomepageHeroSlide(bodyToSlideInput(body));

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.homepageHeroCreate,
      entity: 'HomepageHeroSlide',
      entityId: slide.id,
      after: snapshotHeroSlide(slide),
    });

    revalidatePath('/');
    return NextResponse.json({ success: true, data: slide }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
