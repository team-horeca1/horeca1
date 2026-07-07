// GET  /api/v1/vendor/roles  — list vendor-scope role templates + custom roles for this vendor
// POST /api/v1/vendor/roles  — create a custom vendor-scope role under this vendor's BusinessAccount
//
// Custom roles are AccountRole rows with scope='vendor', isTemplate=false,
// businessAccountId=vendor.businessAccountId. Templates have businessAccountId=null.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission, sanitizePermissionsForScope } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import type { AuthContext } from '@/middleware/auth';

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())),
});

export const GET = vendorOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { businessAccountId: true },
    });
    if (!vendor) throw Errors.notFound('Vendor not found');

    const roles = await prisma.accountRole.findMany({
      where: {
        scope: 'vendor',
        OR: [{ isTemplate: true, businessAccountId: null }, { businessAccountId: vendor.businessAccountId }],
      },
      orderBy: [{ isTemplate: 'desc' }, { name: 'asc' }],
      select: {
        id: true, name: true, scope: true, description: true,
        isTemplate: true, permissions: true,
      },
    });
    return NextResponse.json({ success: true, data: roles });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'users.create');

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { businessAccountId: true },
    });
    if (!vendor) throw Errors.notFound('Vendor not found');

    const body = CreateBody.parse(await req.json());
    const dup = await prisma.accountRole.findFirst({
      where: { businessAccountId: vendor.businessAccountId, name: body.name },
      select: { id: true },
    });
    if (dup) throw Errors.conflict(`A role named "${body.name}" already exists on this vendor`);

    const created = await prisma.accountRole.create({
      data: {
        businessAccountId: vendor.businessAccountId,
        name: body.name,
        description: body.description ?? null,
        scope: 'vendor',
        permissions: sanitizePermissionsForScope(body.permissions, 'vendor'),
        isTemplate: false,
        createdBy: ctx.userId,
      },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
