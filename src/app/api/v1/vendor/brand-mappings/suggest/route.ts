// POST /api/v1/vendor/brand-mappings/suggest — optional auto-map suggestions for vendor to confirm
// BODY: { brandId?: string, productId?: string }
// REQUIRES: role=vendor, products.edit

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { approvedDistributorWhere } from '@/lib/brandAuthorizedDistributor';
import { runMappingForBrand, runMappingForVendorProduct } from '@/modules/brand/brand-mapper';
import type { AuthContext } from '@/middleware/auth';

const suggestSchema = z.object({
  brandId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
});

export const POST = vendorOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'brandMappings.edit');

    const body = await req.json();
    const { brandId, productId } = suggestSchema.parse(body);

    const approved = await prisma.brandAuthorizedDistributor.findMany({
      where: approvedDistributorWhere({ vendorId }),
      select: { brandId: true },
    });
    const approvedIds = new Set(approved.map((a) => a.brandId));
    if (approvedIds.size === 0) {
      throw Errors.forbidden('No authorized brand relationships');
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Automated suggestions are disabled. Products must be mapped manually.' },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
