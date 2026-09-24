// PATCH /api/v1/admin/homepage/hero/reorder — set slide order

import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse } from '@/middleware/errorHandler';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { reorderHomepageHeroSlides } from '@/modules/homepage/homepage-hero.service';

const schema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit');
    const { orderedIds } = schema.parse(await req.json());
    const slides = await reorderHomepageHeroSlides(orderedIds);

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.homepageHeroReorder,
      entity: 'HomepageHeroSlide',
      after: { orderedIds },
    });

    revalidatePath('/');
    return NextResponse.json({ success: true, data: { slides } });
  } catch (error) {
    return errorResponse(error);
  }
});
