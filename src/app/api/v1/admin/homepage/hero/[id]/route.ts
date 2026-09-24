// PATCH  /api/v1/admin/homepage/hero/[id] — update one slide
// DELETE /api/v1/admin/homepage/hero/[id] — delete one slide

import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import {
  deleteHomepageHeroSlide,
  getHomepageHeroSlideById,
  snapshotHeroSlide,
  updateHomepageHeroSlide,
} from '@/modules/homepage/homepage-hero.service';
import { bodyToSlideInput, slideBodySchema } from '@/modules/homepage/homepage-hero.schema';

function extractId(req: NextRequest): string {
  const id = req.nextUrl.pathname.split('/').at(-1);
  if (!id) throw Errors.badRequest('Missing slide id');
  return id;
}

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit');
    const id = extractId(req);
    const before = await getHomepageHeroSlideById(id);
    const body = slideBodySchema.parse(await req.json());
    const slide = await updateHomepageHeroSlide(id, bodyToSlideInput(body));

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.homepageHeroUpdate,
      entity: 'HomepageHeroSlide',
      entityId: slide.id,
      before: snapshotHeroSlide(before),
      after: snapshotHeroSlide(slide),
    });

    revalidatePath('/');
    return NextResponse.json({ success: true, data: slide });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit');
    const id = extractId(req);
    const before = await getHomepageHeroSlideById(id);
    await deleteHomepageHeroSlide(id);

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.homepageHeroDelete,
      entity: 'HomepageHeroSlide',
      entityId: id,
      before: snapshotHeroSlide(before),
    });

    revalidatePath('/');
    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error);
  }
});
