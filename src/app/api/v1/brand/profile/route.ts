// GET  /api/v1/brand/profile — Get brand's own profile
// POST /api/v1/brand/profile — Create brand profile (first time)
// PATCH /api/v1/brand/profile — Update brand profile
// REQUIRES: role=brand or admin (admin uses impersonation cookie)

import { NextRequest, NextResponse } from 'next/server';
import { BrandService } from '@/modules/brand/brand.service';
import { createBrandSchema, updateBrandSchema } from '@/modules/brand/brand.validator';
import { brandOnly } from '@/middleware/rbac';
import { resolveUserId, resolveBrandContext } from '@/lib/resolveBrandId';
import { requirePermission } from '@/lib/permissions/engine';
import type { AuthContext } from '@/middleware/auth';

const brandService = new BrandService();

export const GET = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  requirePermission(ctx, 'settings.view');
  const userId = await resolveUserId(ctx, req);
  const profile = await brandService.getMyProfile(userId);
  return NextResponse.json({ success: true, data: profile });
});

export const POST = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  requirePermission(ctx, 'brands.create');
  const userId = await resolveUserId(ctx, req);
  const body = await req.json();
  const input = createBrandSchema.parse(body);
  const brand = await brandService.createBrand({ userId, ...input });
  return NextResponse.json({ success: true, data: brand }, { status: 201 });
});

export const PATCH = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  await resolveBrandContext(ctx, req); // tenant guard
  requirePermission(ctx, 'settings.edit');
  const userId = await resolveUserId(ctx, req);
  const body = await req.json();
  const input = updateBrandSchema.parse(body);
  const brand = await brandService.updateProfile(userId, input);
  return NextResponse.json({ success: true, data: brand });
});

