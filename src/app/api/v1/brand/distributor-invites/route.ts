// GET  /api/v1/brand/distributor-invites — list this brand's submitted distributor invites
// POST /api/v1/brand/distributor-invites — submit a new distributor candidate
// REQUIRES: role=brand or admin (admin uses impersonation cookie)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { brandOnly } from '@/middleware/rbac';
import { resolveBrandContext } from '@/lib/resolveBrandId';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse } from '@/middleware/errorHandler';
import { emitEvent } from '@/events/emitter';
import type { AuthContext } from '@/middleware/auth';

const createSchema = z.object({
  contactName: z.string().min(2).max(255),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  businessName: z.string().min(2).max(255),
  city: z.string().max(100).optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  notes: z.string().max(1000).optional(),
});

export const GET = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'brands.view');
    const { brandId } = await resolveBrandContext(ctx, req);
    const invites = await prisma.brandDistributorInvite.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, data: { invites } });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { brandId } = await resolveBrandContext(ctx, req);
    requirePermission(ctx, 'brands.edit');
    const body = await req.json();
    const input = createSchema.parse(body);

    const invite = await prisma.brandDistributorInvite.create({
      data: {
        brandId,
        contactName: input.contactName,
        email: input.email.toLowerCase(),
        phone: input.phone ?? null,
        businessName: input.businessName,
        city: input.city ?? null,
        pincode: input.pincode ?? null,
        notes: input.notes ?? null,
      },
    });

    emitEvent('BrandDistributorInviteCreated', {
      inviteId: invite.id,
      brandId,
      businessName: invite.businessName,
      email: invite.email,
    });

    return NextResponse.json({ success: true, data: invite }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
