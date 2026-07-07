// GET /api/v1/brand/analytics — Brand reach + sales analytics dashboard data
// REQUIRES: role=brand or admin (admin uses impersonation cookie)

import { NextRequest, NextResponse } from 'next/server';
import { BrandService } from '@/modules/brand/brand.service';
import { brandOnly } from '@/middleware/rbac';
import { resolveBrandContext } from '@/lib/resolveBrandId';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import type { AuthContext } from '@/middleware/auth';

const brandService = new BrandService();

export const GET = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  requirePermission(ctx, 'analytics.view');
  try {
    const { brandId } = await resolveBrandContext(ctx, req);
    const data = await brandService.getAnalytics(brandId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});
