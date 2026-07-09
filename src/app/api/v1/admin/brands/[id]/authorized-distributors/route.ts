// GET   /api/v1/admin/brands/[id]/authorized-distributors
// PATCH /api/v1/admin/brands/[id]/authorized-distributors — admin approve / reject / veto
// REQUIRES: role=admin

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import {
  approveDistributorByAdmin,
  rejectDistributorAuth,
} from '@/lib/brandAuthorizedDistributor';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import type { AuthContext } from '@/middleware/auth';

const patchSchema = z.object({
  vendorId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  note: z.string().max(500).optional(),
});

export const GET = adminOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'brands.view');
    const brandId = req.nextUrl.pathname.split('/').slice(-2)[0]!;
    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } });
    if (!brand) throw Errors.notFound('Brand not found');

    const rows = await prisma.brandAuthorizedDistributor.findMany({
      where: { brandId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        vendor: {
          select: { id: true, businessName: true, slug: true, logoUrl: true, city: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: { distributors: rows } });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = adminOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'brands.approve');
    const brandId = req.nextUrl.pathname.split('/').slice(-2)[0]!;
    const body = await req.json();
    const { vendorId, action, note } = patchSchema.parse(body);

    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } });
    if (!brand) throw Errors.notFound('Brand not found');

    if (action === 'reject') {
      const row = await rejectDistributorAuth(brandId, vendorId, ctx.userId, note);
      logAction(ctx, req, {
        action: AUDIT_ACTIONS.brandDistributorRejected,
        entity: 'BrandAuthorizedDistributor',
        entityId: row.id,
        metadata: { vendorId, brandId, actor: 'admin' },
      });
      return NextResponse.json({ success: true, data: row });
    }

    const row = await approveDistributorByAdmin(brandId, vendorId, ctx.userId, note);
    logAction(ctx, req, {
      action: AUDIT_ACTIONS.brandDistributorApproved,
      entity: 'BrandAuthorizedDistributor',
      entityId: row.id,
      metadata: { vendorId, brandId, status: row.status, actor: 'admin' },
    });
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    return errorResponse(error);
  }
});
