// GET  /api/v1/vendor/customer-groups — list this vendor's customer groups
// POST /api/v1/vendor/customer-groups — create a group (optionally with members)
// PROTECTED: Vendor only
//
// Customer Groups are named sets of customers a vendor can target with a
// price list (PriceListAssignment.type='group'). Membership is by user or
// business account; the pricing resolver matches either.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorId } from '@/lib/resolveVendorId';

const memberSchema = z.object({
  userId: z.string().uuid().optional(),
  businessAccountId: z.string().uuid().optional(),
}).refine((m) => !!(m.userId || m.businessAccountId), { message: 'Member needs userId or businessAccountId' });

const createSchema = z.object({
  name: z.string().min(1).max(120),
  members: z.array(memberSchema).max(5000).optional(),
});

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'customers.view');
    const vendorId = await resolveVendorId(ctx, req);
    const groups = await prisma.customerGroup.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { members: true, assignments: true } } },
    });
    return NextResponse.json({ success: true, data: groups });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'customers.create');
    const vendorId = await resolveVendorId(ctx, req);
    const body = createSchema.parse(await req.json());

    const group = await prisma.customerGroup.create({
      data: {
        vendorId,
        name: body.name,
        members: body.members && body.members.length > 0
          ? { create: body.members.map((m) => ({ userId: m.userId ?? null, businessAccountId: m.businessAccountId ?? null })) }
          : undefined,
      },
      include: { _count: { select: { members: true, assignments: true } } },
    });

    return NextResponse.json({ success: true, data: group }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
