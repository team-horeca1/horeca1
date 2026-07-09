// GET    /api/v1/admin/categories/:id — Category detail with children and product count
// PATCH  /api/v1/admin/categories/:id — Update category fields
// DELETE /api/v1/admin/categories/:id — Permanently delete category
// WHY: Admin needs to manage individual categories — view hierarchy, edit, deactivate
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { syncCategoryParentLinks, getCategoryParentIds } from '@/modules/catalog/catalog.service';

// Helper: extract the [id] segment from the URL
function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  parentId: z.string().uuid().nullable().optional(),
  parentCategoryIds: z.array(z.string().uuid()).optional(),
  imageUrl: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// GET — category detail with children and product count
export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.view');
    const id = extractId(req);

    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        children: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            products: true,
            children: true,
          },
        },
      },
    });

    if (!category) throw Errors.notFound('Category');

    const parentCategoryIds = await getCategoryParentIds(id);

    return NextResponse.json({
      success: true,
      data: { ...category, parentCategoryIds },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// PATCH — update category fields.
//
// V2.2 Phase 3 enforcement: the platform's category tree is strictly two
// levels deep. Three guards on the parentId reassignment path:
//   (1) parent can't be the row itself (self-loop)
//   (2) parent must exist and be a root (parent.parentId IS NULL)
//   (3) if THIS row already has children, it can't become a sub-category
//       (that would create grand-children). Children = this is acting as
//       a level-1 root; turning it into a level-2 sub-category would
//       silently make its children level-3.
export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.edit');
    const id = extractId(req);
    const body = await req.json();
    const data = updateCategorySchema.parse(body);

    const existing = await prisma.category.findUnique({
      where: { id },
      select: { id: true, parentId: true, _count: { select: { children: true } } },
    });
    if (!existing) throw Errors.notFound('Category');

    // Only validate when parentId is actually being changed (undefined =
    // not in payload, null = explicit root, uuid = a parent picked).
    if (data.parentId !== undefined) {
      if (data.parentId === id) {
        throw Errors.badRequest('A category cannot be its own parent');
      }
      if (data.parentId) {
        const parent = await prisma.category.findUnique({
          where: { id: data.parentId },
          select: { id: true, parentId: true },
        });
        if (!parent) throw Errors.badRequest('Parent category does not exist');
        if (parent.parentId) {
          throw Errors.badRequest(
            'Categories are a strict 2-level tree. The parent you picked is itself a sub-category — pick a root category instead.',
          );
        }
        if (existing._count.children > 0) {
          throw Errors.badRequest(
            'Cannot move this category under a parent — it already has child categories. Reparent or delete the children first.',
          );
        }
      }
    }

    const { parentCategoryIds, ...patchData } = data;

    const category = await prisma.category.update({
      where: { id },
      data: patchData,
      include: {
        _count: {
          select: {
            products: true,
            children: true,
          },
        },
      },
    });

    if (parentCategoryIds !== undefined) {
      await syncCategoryParentLinks(id, parentCategoryIds);
    } else if (data.parentId !== undefined && data.parentId) {
      await syncCategoryParentLinks(id, [data.parentId]);
    } else if (data.parentId === null) {
      await syncCategoryParentLinks(id, []);
    }

    const refreshedParentIds = await getCategoryParentIds(id);

    return NextResponse.json({
      success: true,
      data: { ...category, parentCategoryIds: refreshedParentIds },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// DELETE — permanently remove category
export const DELETE = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.delete');
    const id = extractId(req);

    const existing = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            children: true,
            products: true,
            masterProducts: true,
            brandMasterProducts: true,
          },
        },
      },
    });
    if (!existing) throw Errors.notFound('Category');

    if (existing._count.children > 0) {
      throw Errors.badRequest('Cannot delete category because it has subcategories. Please delete or reassign them first.');
    }
    if (existing._count.products > 0) {
      throw Errors.badRequest('Cannot delete category because it has products associated with it. Please reassign or delete the products first.');
    }
    if (existing._count.masterProducts > 0) {
      throw Errors.badRequest('Cannot delete category because it has master products associated with it. Please reassign or delete them first.');
    }
    if (existing._count.brandMasterProducts > 0) {
      throw Errors.badRequest('Cannot delete category because it has brand master products associated with it. Please reassign or delete them first.');
    }

    await prisma.category.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, data: { id, deleted: true } });
  } catch (error) {
    return errorResponse(error);
  }
});
