// GET  /api/v1/admin/categories — List all categories (including pending/inactive)
// POST /api/v1/admin/categories — Create a new category (auto-approved)
// WHY: Admin manages the category taxonomy — views all categories regardless of
//      approval status and creates new ones that are immediately active.
// PROTECTED: Admin only
// SUPPORTS (GET): ?approvalStatus=&search=

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { syncCategoryParentLinks, getCategoryParentIds } from '@/modules/catalog/catalog.service';

// Auto-generate slug from name: lowercase, replace spaces with hyphens, strip non-alphanumeric
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-');
}

const createCategorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  parentId: z.string().uuid().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// GET — list all categories with children count and product count
export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.view');
    const params = req.nextUrl.searchParams;
    const approvalStatus = params.get('approvalStatus') || undefined;
    const search = params.get('search') || undefined;

    const where: Record<string, unknown> = {};

    if (approvalStatus) where.approvalStatus = approvalStatus;
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const categories = await prisma.category.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: {
            children: true,
            products: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: categories });
  } catch (error) {
    return errorResponse(error);
  }
});

// POST — create a new category (auto-approved by admin).
//
// V2.2 Phase 3 enforcement: the platform's category model is a strict
// two-level tree (Level 1 = root Category, Level 2 = Sub-Category). No
// grand-children. If the request specifies parentId, the parent MUST
// itself be a root (parentId=null). Without this check the UI could
// silently create level-3 categories that downstream filtering doesn't
// understand.
export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.create');
    const body = await req.json();
    const data = createCategorySchema.parse(body);

    if (data.parentId) {
      const parent = await prisma.category.findUnique({
        where: { id: data.parentId },
        select: { id: true, parentId: true },
      });
      if (!parent) {
        return errorResponse(Errors.badRequest('Parent category does not exist'));
      }
      if (parent.parentId) {
        return errorResponse(Errors.badRequest(
          'Categories are a strict 2-level tree. The parent you picked is itself a sub-category — pick a root category instead.',
        ));
      }
    }

    const category = await prisma.category.create({
      data: {
        name: data.name,
        slug: data.slug || slugify(data.name),
        parentId: data.parentId ?? null,
        imageUrl: data.imageUrl ?? null,
        sortOrder: data.sortOrder ?? 0,
        approvalStatus: 'approved',
        approvedBy: ctx.userId,
        approvedAt: new Date(),
      },
    });

    if (data.parentId) {
      await syncCategoryParentLinks(category.id, [data.parentId]);
    }

    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
