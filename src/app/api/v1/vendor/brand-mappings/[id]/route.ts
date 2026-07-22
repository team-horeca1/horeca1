// PATCH  /api/v1/vendor/brand-mappings/[id] — Vendor accepts or rejects a pending_review mapping
//   BODY: { status: "verified" | "rejected", reviewNote?: string }
// DELETE /api/v1/vendor/brand-mappings/[id] — Vendor unlinks an active (auto_mapped or verified) mapping.
//   Soft-deletes by transitioning status → 'rejected' (the auto-mapper skips rejected pairs, so the
//   engine will not re-suggest the same link on its next run). Preserves audit history.
// REQUIRES: role=vendor (or admin), products:write permission. The mapping must be on this vendor's product.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import type { AuthContext } from '@/middleware/auth';

const reviewSchema = z.object({
  status: z.enum(['verified', 'rejected']),
  reviewNote: z.string().max(500).optional(),
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'brandMappings.edit');

    const id = req.nextUrl.pathname.split('/').at(-1)!;
    const body = await req.json();
    const { status, reviewNote } = reviewSchema.parse(body);

    // Guard: mapping's distributor product must belong to caller's vendor
    const mapping = await prisma.brandProductMapping.findFirst({
      where: {
        id,
        distributorProduct: { vendorId },
      },
      include: {
        brandMasterProduct: { select: { name: true, brand: { select: { name: true } } } },
      },
    });
    if (!mapping) throw Errors.notFound('Mapping not found in your inventory');

    const updated = await prisma.brandProductMapping.update({
      where: { id },
      data: {
        status,
        matchedBy: 'manually_verified',
        confidenceScore: status === 'verified' ? 1.0 : mapping.confidenceScore,
        reviewedBy: ctx.userId,
        reviewNote: reviewNote ?? null,
        updatedAt: new Date(),
      },
    });

    logAction(ctx, req, {
      action: status === 'verified' ? AUDIT_ACTIONS.brandMappingVerified : AUDIT_ACTIONS.brandMappingRejected,
      entity: 'BrandProductMapping',
      entityId: id,
      metadata: {
        brandName: mapping.brandMasterProduct.brand.name,
        masterName: mapping.brandMasterProduct.name,
        reviewNote: reviewNote ?? null,
        actor: 'vendor',
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = vendorOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'brandMappings.delete');

    const id = req.nextUrl.pathname.split('/').at(-1)!;

    // Guard: mapping must belong to caller's vendor
    const mapping = await prisma.brandProductMapping.findFirst({
      where: { id, distributorProduct: { vendorId } },
      include: {
        brandMasterProduct: { select: { name: true, brand: { select: { name: true } } } },
      },
    });
    if (!mapping) throw Errors.notFound('Mapping not found in your inventory');

    // Soft-delete to 'rejected' so the auto-mapper won't re-create the same link.
    // (Hard delete would let runMappingForProduct re-suggest it on the next pass.)
    const updated = await prisma.brandProductMapping.update({
      where: { id },
      data: {
        status: 'rejected',
        matchedBy: 'manually_verified',
        reviewedBy: ctx.userId,
        reviewNote: 'Unlinked by vendor',
        updatedAt: new Date(),
      },
    });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.brandMappingUnlinked,
      entity: 'BrandProductMapping',
      entityId: id,
      metadata: {
        brandName: mapping.brandMasterProduct.brand.name,
        masterName: mapping.brandMasterProduct.name,
        previousStatus: mapping.status,
        actor: 'vendor',
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});
