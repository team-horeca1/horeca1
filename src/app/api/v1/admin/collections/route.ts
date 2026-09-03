// GET  /api/v1/admin/collections — List all collections (including inactive)
// POST /api/v1/admin/collections — Create a curated collection
// WHY: Admin curates storefront collections and attaches Horeca1 MasterProduct SKUs.
// PROTECTED: Admin only
// SUPPORTS (GET): ?search=&status=active|inactive

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

const createCollectionSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().max(255).optional(),
  description: z.string().max(4000).optional().nullable(),
  imageUrl: z.string().max(512).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  masterProductIds: z.array(z.string().uuid()).optional(),
});

async function assertMasterProductsExist(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await prisma.masterProduct.count({ where: { id: { in: ids } } });
  if (found !== ids.length) {
    throw Errors.badRequest('One or more master products were not found');
  }
}

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.view');
    const params = req.nextUrl.searchParams;
    const search = params.get('search')?.trim() || undefined;
    const status = params.get('status')?.trim() || undefined;

    const where: Prisma.CollectionWhereInput = {};
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [collections, total, active, skuCount] = await Promise.all([
      prisma.collection.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          _count: { select: { masterProducts: true } },
        },
      }),
      prisma.collection.count(),
      prisma.collection.count({ where: { isActive: true } }),
      prisma.collectionMasterProduct.count(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        collections,
        stats: {
          total,
          active,
          inactive: total - active,
          skuCount,
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.create');
    const data = createCollectionSchema.parse(await req.json());

    const slug = slugify(data.slug || data.name);
    if (!slug) throw Errors.badRequest('Could not generate a slug from this name');

    const existing = await prisma.collection.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing) throw Errors.conflict(`Slug "${slug}" is already in use`);

    const masterProductIds = uniqueIds(data.masterProductIds ?? []);
    await assertMasterProductsExist(masterProductIds);

    const collection = await prisma.$transaction(async (tx) => {
      const created = await tx.collection.create({
        data: {
          name: data.name.trim(),
          slug,
          description: emptyToNull(data.description),
          imageUrl: emptyToNull(data.imageUrl),
          sortOrder: data.sortOrder ?? 0,
          isActive: data.isActive ?? true,
        },
      });

      if (masterProductIds.length > 0) {
        await tx.collectionMasterProduct.createMany({
          data: masterProductIds.map((masterProductId, sortOrder) => ({
            collectionId: created.id,
            masterProductId,
            sortOrder,
          })),
        });
      }

      return tx.collection.findUniqueOrThrow({
        where: { id: created.id },
        include: { _count: { select: { masterProducts: true } } },
      });
    });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.collectionCreate,
      entity: 'Collection',
      entityId: collection.id,
      after: {
        name: collection.name,
        slug: collection.slug,
        isActive: collection.isActive,
        skuCount: collection._count.masterProducts,
      },
    });

    return NextResponse.json({ success: true, data: collection }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
