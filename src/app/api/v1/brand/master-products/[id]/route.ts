// PATCH /api/v1/brand/master-products/[id] — edit a pending/rejected master submission
// PROTECTED: brand only.

import { NextRequest, NextResponse } from 'next/server';
import { BrandService } from '@/modules/brand/brand.service';
import { brandMasterUpdateSchema } from '@/modules/brand/brand.validator';
import { brandOnly } from '@/middleware/rbac';
import { resolveUserId, resolveBrandContext } from '@/lib/resolveBrandId';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse } from '@/middleware/errorHandler';
import type { AuthContext } from '@/middleware/auth';

const brandService = new BrandService();

export const PATCH = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    await resolveBrandContext(ctx, req);
    requirePermission(ctx, 'products.edit');
    const userId = await resolveUserId(ctx, req);
    const productId = req.nextUrl.pathname.split('/').at(-1)!;
    const input = brandMasterUpdateSchema.parse(await req.json());
    const master = await brandService.updatePendingMasterProduct(userId, productId, input, ctx.activeBrandId);
    return NextResponse.json({ success: true, data: master });
  } catch (error) {
    return errorResponse(error);
  }
});
