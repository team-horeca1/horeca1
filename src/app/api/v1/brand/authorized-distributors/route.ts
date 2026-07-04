// GET   /api/v1/brand/authorized-distributors — list linked distributors
// POST  /api/v1/brand/authorized-distributors — add / approve / reject a vendor
// PATCH /api/v1/brand/authorized-distributors — same as POST

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { brandOnly } from '@/middleware/rbac';
import { resolveBrandContext } from '@/lib/resolveBrandId';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { approveDistributorByBrand, rejectDistributorAuth } from '@/lib/brandAuthorizedDistributor';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import type { AuthContext } from '@/middleware/auth';

const actionSchema = z.object({
  vendorId: z.string().uuid(),
  action: z.enum(['add', 'approve', 'reject']),
  note: z.string().max(500).optional(),
});

export const GET = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { brandId } = await resolveBrandContext(ctx, req);
    const status = req.nextUrl.searchParams.get('status') ?? undefined;

    const rows = await prisma.brandAuthorizedDistributor.findMany({
      where: {
        brandId,
        ...(status && { status: status as 'pending' | 'approved' | 'rejected' }),
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            city: true,
            _count: {
              select: {
                products: {
                  where: {
                    isActive: true,
                    brandMappings: { some: { brandId, status: { in: ['verified', 'auto_mapped', 'pending_review'] } } },
                  },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: { distributors: rows } });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { brandId } = await resolveBrandContext(ctx, req);
    requirePermission(ctx, 'brands.edit');
    const body = await req.json();
    const { vendorId, action, note } = actionSchema.parse(body);

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, isActive: true },
      select: { id: true },
    });
    if (!vendor) throw Errors.notFound('Vendor not found');

    if (action === 'reject') {
      const row = await rejectDistributorAuth(brandId, vendorId, ctx.userId, note);
      logAction(ctx, req, {
        action: AUDIT_ACTIONS.brandDistributorRejected,
        entity: 'BrandAuthorizedDistributor',
        entityId: row.id,
        metadata: { vendorId, brandId },
      });
      return NextResponse.json({ success: true, data: row });
    }

    const row = await approveDistributorByBrand(brandId, vendorId, ctx.userId, note);
    logAction(ctx, req, {
      action: AUDIT_ACTIONS.brandDistributorApproved,
      entity: 'BrandAuthorizedDistributor',
      entityId: row.id,
      metadata: { vendorId, brandId, status: row.status },
    });
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = POST;
