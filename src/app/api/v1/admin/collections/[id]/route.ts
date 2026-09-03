// GET    /api/v1/admin/collections/:id — Collection detail with attached MasterProducts
// PATCH  /api/v1/admin/collections/:id — Update fields and/or replace SKU set
// DELETE /api/v1/admin/collections/:id — Permanently delete collection
// WHY: Admin edits curated collections and the Horeca1 SKUs they feature.
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

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

const updateCollectionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().max(255).optional(),
  description: z.string().max(4000).optional().nullable(),
  imageUrl: z.string().max(512).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  masterProductIds: z.array(z.string().uuid()).optional(),
});

const masterSelect = {
  id: true,
  sku: true,
  name: true,
  brand: true,
  packSize: true,
  uom: true,
  imageUrl: true,
  images: true,
  category: { select: { id: true, name: true } },
  _count: { select: { vendorProducts: true } },
} as const;

async function loadCollection(id: string) {
  const collection = await prisma.collection.findUnique({
    where: { id },
    include: {
      masterProducts: {
        orderBy: { sortOrder: 'asc' },
        include: { masterProduct: { select: masterSelect } },
      },
      _count: { select: { masterProducts: true } },
    },
  });
  if (!collection) throw Errors.notFound('Collection');

  return {
    id: collection.id,
    name: collection.name,
    slug: collection.slug,
    description: collection.description,
    imageUrl: collection.imageUrl,
    sortOrder: collection.sortOrder,
    isActive: collection.isActive,
    createdAt: collection.createdAt,
    _count: collection._count,
    masterProducts: collection.masterProducts.map((link) => {
      const m = link.masterProduct;
      return {
        id: m.id,
        sku: m.sku,
        name: m.name,
        brand: m.brand,
        packSize: m.packSize,
        uom: m.uom,
        imageUrl: m.imageUrl ?? m.images[0] ?? null,
        images: m.images,
        category: m.category,
        vendorCount: m._count.vendorProducts,
        sortOrder: link.sortOrder,
      };
    }),
  };
}

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.view');
    const id = extractId(req);
    const collection = await loadCollection(id);
    return NextResponse.json({ success: true, data: collection });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.edit');
    const id = extractId(req);
    const data = updateCollectionSchema.parse(await req.json());

    const existing = await prisma.collection.findUnique({
      where: { id },
      include: { _count: { select: { masterProducts: true } } },
    });
    if (!existing) throw Errors.notFound('Collection');

    const patchData: {
      name?: string;
      slug?: string;
      description?: string | null;
      imageUrl?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    } = {};

    if (data.name !== undefined) patchData.name = data.name.trim();
    if (data.description !== undefined) patchData.description = emptyToNull(data.description);
    if (data.imageUrl !== undefined) patchData.imageUrl = emptyToNull(data.imageUrl);
    if (data.sortOrder !== undefined) patchData.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) patchData.isActive = data.isActive;

    if (data.slug !== undefined) {
      const slug = slugify(data.slug);
      if (!slug) throw Errors.badRequest('Could not generate a slug from this value');
      patchData.slug = slug;
    }

    if (patchData.slug && patchData.slug !== existing.slug) {
      const clash = await prisma.collection.findUnique({
        where: { slug: patchData.slug },
        select: { id: true },
      });
      if (clash && clash.id !== id) {
        throw Errors.conflict(`Slug "${patchData.slug}" is already in use`);
      }
    }

    const masterProductIds =
      data.masterProductIds !== undefined ? uniqueIds(data.masterProductIds) : undefined;

    if (masterProductIds) {
      if (masterProductIds.length > 0) {
        const found = await prisma.masterProduct.count({
          where: { id: { in: masterProductIds } },
        });
        if (found !== masterProductIds.length) {
          throw Errors.badRequest('One or more master products were not found');
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(patchData).length > 0) {
        await tx.collection.update({ where: { id }, data: patchData });
      }

      if (masterProductIds) {
        await tx.collectionMasterProduct.deleteMany({ where: { collectionId: id } });
        if (masterProductIds.length > 0) {
          await tx.collectionMasterProduct.createMany({
            data: masterProductIds.map((masterProductId, sortOrder) => ({
              collectionId: id,
              masterProductId,
              sortOrder,
            })),
          });
        }
      }
    });

    const collection = await loadCollection(id);

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.collectionUpdate,
      entity: 'Collection',
      entityId: id,
      before: {
        name: existing.name,
        slug: existing.slug,
        isActive: existing.isActive,
        skuCount: existing._count.masterProducts,
      },
      after: {
        name: collection.name,
        slug: collection.slug,
        isActive: collection.isActive,
        skuCount: collection._count.masterProducts,
      },
    });

    return NextResponse.json({ success: true, data: collection });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.delete');
    const id = extractId(req);

    const existing = await prisma.collection.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true },
    });
    if (!existing) throw Errors.notFound('Collection');

    await prisma.collection.delete({ where: { id } });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.collectionDelete,
      entity: 'Collection',
      entityId: id,
      before: { name: existing.name, slug: existing.slug },
    });

    return NextResponse.json({ success: true, data: { id, deleted: true } });
  } catch (error) {
    return errorResponse(error);
  }
});
