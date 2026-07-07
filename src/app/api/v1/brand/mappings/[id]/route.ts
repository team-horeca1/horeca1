// PATCH /api/v1/brand/mappings/[id] — Brand owner rejects a mapping
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BrandService } from '@/modules/brand/brand.service';
import { brandOnly } from '@/middleware/rbac';
import { resolveUserId } from '@/lib/resolveBrandId';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import type { AuthContext } from '@/middleware/auth';

const brandService = new BrandService();

const bodySchema = z.object({
  action: z.enum(['reject']),
  reviewNote: z.string().max(500).optional(),
});

export const PATCH = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'products.edit');
    const userId = await resolveUserId(ctx, req);
    const id = req.nextUrl.pathname.split('/').pop()!;
    const body = bodySchema.parse(await req.json());
    if (body.action === 'reject') {
      const data = await brandService.brandRejectMapping(userId, id, body.reviewNote);
      return NextResponse.json({ success: true, data });
    }
    return NextResponse.json({ success: false, error: { message: 'Unknown action' } }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
});
