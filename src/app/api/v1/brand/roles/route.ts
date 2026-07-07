// GET  /api/v1/brand/roles  — list brand-scope role templates + custom roles for this brand
// POST /api/v1/brand/roles  — create a custom brand-scope role under this brand's BusinessAccount

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { brandOnly } from '@/middleware/rbac';
import { resolveBrandContext } from '@/lib/resolveBrandId';
import { requirePermission, sanitizePermissionsForScope } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import type { AuthContext } from '@/middleware/auth';

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())),
});

export const GET = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'users.view');
    const { brandId } = await resolveBrandContext(ctx, req);
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { businessAccountId: true },
    });
    if (!brand) throw Errors.notFound('Brand not found');

    const roles = await prisma.accountRole.findMany({
      where: {
        scope: 'brand',
        OR: [{ isTemplate: true, businessAccountId: null }, { businessAccountId: brand.businessAccountId }],
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

export const POST = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { brandId } = await resolveBrandContext(ctx, req);
    requirePermission(ctx, 'users.create');

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { businessAccountId: true },
    });
    if (!brand) throw Errors.notFound('Brand not found');

    const body = CreateBody.parse(await req.json());
    const dup = await prisma.accountRole.findFirst({
      where: { businessAccountId: brand.businessAccountId, name: body.name },
      select: { id: true },
    });
    if (dup) throw Errors.conflict(`A role named "${body.name}" already exists on this brand`);

    const created = await prisma.accountRole.create({
      data: {
        businessAccountId: brand.businessAccountId,
        name: body.name,
        description: body.description ?? null,
        scope: 'brand',
        permissions: sanitizePermissionsForScope(body.permissions, 'brand'),
        isTemplate: false,
        createdBy: ctx.userId,
      },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
