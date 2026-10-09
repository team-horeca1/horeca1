// GET  /api/v1/brand/product-links?vendorId= — brand SKUs and the store product linked to each
// POST /api/v1/brand/product-links — manually link one brand SKU to one store product (verified)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BrandService } from '@/modules/brand/brand.service';
import { brandOnly } from '@/middleware/rbac';
import { resolveUserId, resolveBrandContext } from '@/lib/resolveBrandId';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import type { AuthContext } from '@/middleware/auth';

const brandService = new BrandService();
const vendorIdQuery = z.string().uuid();

const linkSchema = z.object({
  vendorId: z.string().uuid(),
  masterProductId: z.string().uuid(),
  distributorProductId: z.string().uuid(),
});

export const GET = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { brandId } = await resolveBrandContext(ctx, req);
    requirePermission(ctx, 'products.view');
    const userId = await resolveUserId(ctx, req);
    const parsed = vendorIdQuery.safeParse(req.nextUrl.searchParams.get('vendorId'));
    if (!parsed.success) throw Errors.badRequest('vendorId must be a valid UUID');
    const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 80);
    if (req.nextUrl.searchParams.get('search') === '1') {
      const products = await brandService.searchVendorProductsForLink(parsed.data, q);
      return NextResponse.json({ success: true, data: { products } });
    }
    const desk = await brandService.listProductLinkDesk(userId, parsed.data, brandId);
    return NextResponse.json({ success: true, data: desk });
  } catch (err) {
    return errorResponse(err);
  }
});

export const POST = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { brandId } = await resolveBrandContext(ctx, req);
    requirePermission(ctx, 'products.edit');
    const userId = await resolveUserId(ctx, req);
    const body = linkSchema.parse(await req.json());
    const mapping = await brandService.linkMasterToVendorProduct(
      userId,
      body.vendorId,
      body.masterProductId,
      body.distributorProductId,
      brandId,
    );
    return NextResponse.json({ success: true, data: { mappingId: mapping.id } });
  } catch (err) {
    return errorResponse(err);
  }
});
