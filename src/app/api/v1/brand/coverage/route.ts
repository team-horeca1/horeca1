// GET  /api/v1/brand/coverage — Product-level distributor coverage
// POST /api/v1/brand/coverage — Trigger re-run of auto-mapping engine
// REQUIRES: role=brand or admin (admin uses impersonation cookie)
// Optional query: vendorId (UUID) — scopes rows + stats to one distributor store

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BrandService } from '@/modules/brand/brand.service';
import { brandOnly } from '@/middleware/rbac';
import { resolveUserId } from '@/lib/resolveBrandId';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import type { AuthContext } from '@/middleware/auth';

const brandService = new BrandService();

const vendorIdQuery = z.string().uuid();

export const GET = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'products.view');
    const userId = await resolveUserId(ctx, req);
    const rawVendorId = req.nextUrl.searchParams.get('vendorId');
    let vendorId: string | undefined;
    if (rawVendorId) {
      const parsed = vendorIdQuery.safeParse(rawVendorId);
      if (!parsed.success) throw Errors.badRequest('vendorId must be a valid UUID');
      vendorId = parsed.data;
    }
    const coverage = await brandService.getDistributorCoverage(userId, vendorId);
    return NextResponse.json({ success: true, data: coverage });
  } catch (err) {
    return errorResponse(err);
  }
});

export const POST = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  requirePermission(ctx, 'products.edit');
  const userId = await resolveUserId(ctx, req);
  const result = await brandService.triggerMapping(userId);
  return NextResponse.json({ success: true, data: result });
});
