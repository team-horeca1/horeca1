// GET    /api/v1/vendor/customer-groups/:id — group with members
// PATCH  /api/v1/vendor/customer-groups/:id — rename and/or replace members
// DELETE /api/v1/vendor/customer-groups/:id — delete (cascades members + assignments)
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorId } from '@/lib/resolveVendorId';

function extractId(req: NextRequest) {
  return new URL(req.url).pathname.split('/').at(-1) ?? '';
}

const memberSchema = z.object({
  userId: z.string().uuid().optional(),
  businessAccountId: z.string().uuid().optional(),
}).refine((m) => !!(m.userId || m.businessAccountId), { message: 'Member needs userId or businessAccountId' });

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  members: z.array(memberSchema).max(5000).optional(),
});

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'customers.view');
    const vendorId = await resolveVendorId(ctx, req);
    const id = extractId(req);
    const group = await prisma.customerGroup.findFirst({
      where: { id, vendorId },
      include: { members: true, _count: { select: { members: true, assignments: true } } },
    });
    if (!group) throw Errors.notFound('Customer group');
    return NextResponse.json({ success: true, data: group });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const vendorId = await resolveVendorId(ctx, req);
    const id = extractId(req);
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.customerGroup.findFirst({ where: { id, vendorId }, select: { id: true } });
    if (!existing) throw Errors.notFound('Customer group');

    const updated = await prisma.$transaction(async (tx) => {
      const g = await tx.customerGroup.update({
        where: { id },
        data: { ...(body.name !== undefined && { name: body.name }) },
      });
      if (body.members !== undefined) {
        await tx.customerGroupMember.deleteMany({ where: { groupId: id } });
        if (body.members.length > 0) {
          await tx.customerGroupMember.createMany({
            data: body.members.map((m) => ({ groupId: id, userId: m.userId ?? null, businessAccountId: m.businessAccountId ?? null })),
            skipDuplicates: true,
          });
        }
      }
      return g;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const vendorId = await resolveVendorId(ctx, req);
    const id = extractId(req);
    const existing = await prisma.customerGroup.findFirst({ where: { id, vendorId }, select: { id: true } });
    if (!existing) throw Errors.notFound('Customer group');
    // Members + price-list assignments cascade via FK onDelete.
    await prisma.customerGroup.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
