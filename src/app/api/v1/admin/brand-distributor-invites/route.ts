// GET  /api/v1/admin/brand-distributor-invites?status=pending
// PATCH /api/v1/admin/brand-distributor-invites?id=... — update status / link vendorId
// REQUIRES: role=admin

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse } from '@/middleware/errorHandler';
import type { AuthContext } from '@/middleware/auth';

const patchSchema = z.object({
  status: z.enum(['pending', 'contacted', 'onboarded', 'declined']),
  reviewNote: z.string().max(1000).optional(),
  vendorId: z.string().uuid().optional(),
});

export const GET = adminOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'brands.view');
    const status = req.nextUrl.searchParams.get('status') || undefined;
    const invites = await prisma.brandDistributorInvite.findMany({
      where: status ? { status: status as 'pending' | 'contacted' | 'onboarded' | 'declined' } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
      },
    });
    return NextResponse.json({ success: true, data: { invites } });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = adminOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'brands.edit');
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: { message: 'id query param required' } }, { status: 400 });
    const body = await req.json();
    const input = patchSchema.parse(body);

    const updated = await prisma.brandDistributorInvite.update({
      where: { id },
      data: {
        status: input.status,
        reviewNote: input.reviewNote ?? null,
        vendorId: input.vendorId ?? null,
        reviewedBy: ctx.userId,
        updatedAt: new Date(),
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});
