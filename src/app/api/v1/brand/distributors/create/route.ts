// POST /api/v1/brand/distributors/create — Brand creates a new vendor and links as approved distributor
// REQUIRES: role=brand, brands.edit

import { NextRequest, NextResponse } from 'next/server';
import { brandOnly } from '@/middleware/rbac';
import { resolveBrandContext } from '@/lib/resolveBrandId';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse } from '@/middleware/errorHandler';
import { approveDistributorByBrand } from '@/lib/brandAuthorizedDistributor';
import { createDirectVendor, createDirectVendorSchema } from '@/modules/vendor/vendorOnboarding.service';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import type { AuthContext } from '@/middleware/auth';

export const POST = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { brandId } = await resolveBrandContext(ctx, req);
    requirePermission(ctx, 'brands.edit');

    const body = await req.json();
    const input = createDirectVendorSchema.parse(body);

    const vendor = await createDirectVendor(input, ctx.userId);
    const auth = await approveDistributorByBrand(brandId, vendor.id, ctx.userId);

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.brandDistributorApproved,
      entity: 'BrandAuthorizedDistributor',
      entityId: auth.id,
      metadata: { vendorId: vendor.id, brandId, createdByBrand: true },
    });

    return NextResponse.json({
      success: true,
      data: { vendor, distributor: auth },
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
