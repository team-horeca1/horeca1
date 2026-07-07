// GET  /api/v1/admin/master-products — list the Horeca1 master catalog (admin CRUD).
// POST /api/v1/admin/master-products — create a master SKU (admin-entered, required).
// PROTECTED: admin.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { assertLeafCategory, syncMasterProductCategories } from '@/modules/catalog/catalog.service';
import { validateMasterSku } from '@/lib/sku';
import { syncProductToBrand } from '@/modules/brand/brand.service';

const createSchema = z.object({
  sku: z.string().min(2).max(40),
  name: z.string().min(1),
  categoryId: z.string().uuid(),
  categoryIds: z.array(z.string().uuid()).min(1).optional(),
  brand: z.string().min(1).max(150),
  uom: z.string().max(50).optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  imageUrl: z.string().url().optional(),
  images: z.array(z.string().url()).optional(),
  aliasNames: z.array(z.string()).optional(),
  searchKeywords: z.array(z.string()).optional(),
});

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.view');
    const params = req.nextUrl.searchParams;
    const search = params.get('search')?.trim() || undefined;
    const approvalStatus = params.get('approvalStatus')?.trim() || undefined;
    const categoryId = params.get('categoryId')?.trim() || undefined;
    const limit = Math.min(Number(params.get('limit')) || 20, 100);
    const pageParam = params.get('page');
    const cursor = params.get('cursor') || undefined;

    const where: Prisma.MasterProductWhereInput = {};
    if (approvalStatus) where.approvalStatus = approvalStatus as 'pending' | 'approved' | 'rejected';
    if (categoryId) where.categoryId = categoryId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { aliasNames: { has: search.toLowerCase() } },
      ];
    }

    const [total, approved, pending, rejected] = await Promise.all([
      prisma.masterProduct.count({ where }),
      prisma.masterProduct.count({ where: { ...where, approvalStatus: 'approved' } }),
      prisma.masterProduct.count({ where: { ...where, approvalStatus: 'pending' } }),
      prisma.masterProduct.count({ where: { ...where, approvalStatus: 'rejected' } }),
    ]);

    let rows;
    let pagination: { page: number; totalPages: number; total: number } | null = null;

    if (pageParam) {
      const page = Math.max(1, Number(pageParam) || 1);
      const skip = (page - 1) * limit;
      rows = await prisma.masterProduct.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, name: true } },
          _count: { select: { vendorProducts: true } },
          vendorProducts: {
            select: {
              imageUrl: true,
              sku: true,
              vendorSku: true,
              hsn: true,
              metadata: true,
              vendor: { select: { id: true, businessName: true, vendorCode: true } }
            },
            take: 5,
            orderBy: { updatedAt: 'desc' },
          },
        },
      });
      pagination = { page, totalPages: Math.max(1, Math.ceil(total / limit)), total };
    } else {
      rows = await prisma.masterProduct.findMany({
        where,
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, name: true } },
          _count: { select: { vendorProducts: true } },
          vendorProducts: {
            select: {
              imageUrl: true,
              sku: true,
              vendorSku: true,
              hsn: true,
              metadata: true,
              vendor: { select: { id: true, businessName: true, vendorCode: true } }
            },
            take: 5,
            orderBy: { updatedAt: 'desc' },
          },
        },
      });
    }

    const hasMore = !pageParam && rows.length > limit;
    if (hasMore) rows.pop();

    return NextResponse.json({
      success: true,
      data: {
        masterProducts: rows.map((m) => {
          const { vendorProducts, _count, ...rest } = m;
          const imageUrl = m.imageUrl || vendorProducts.find((vp) => vp.imageUrl)?.imageUrl || null;
          
          const metadata = (m.metadata || {}) as Record<string, any>;
          const finalMetadata = {
            ...metadata,
            itemId: metadata.itemId || (vendorProducts.find(vp => (vp.metadata as any)?.itemId)?.metadata as any)?.itemId || null,
            vendorId: metadata.vendorId || (vendorProducts.find(vp => (vp.metadata as any)?.vendorId)?.metadata as any)?.vendorId || vendorProducts.find(vp => vp.vendor?.vendorCode)?.vendor?.vendorCode || null,
          };

          return {
            ...rest,
            imageUrl,
            vendorCount: _count.vendorProducts,
            hsn: vendorProducts[0]?.hsn || null,
            vendor: vendorProducts[0]?.vendor || null,
            metadata: finalMetadata,
          };
        }),
        nextCursor: hasMore && !pageParam ? rows[rows.length - 1]?.id : null,
        hasMore,
        pagination,
        stats: { total, approved, pending, rejected },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.create');
    const data = createSchema.parse(await req.json());

    const skuCheck = validateMasterSku(data.sku);
    if (!skuCheck.ok) throw Errors.badRequest(skuCheck.message);

    const existingSku = await prisma.masterProduct.findFirst({
      where: { sku: { equals: skuCheck.normalized, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existingSku) throw Errors.conflict(`SKU "${skuCheck.normalized}" is already in use`);

    const resolvedCategoryIds = data.categoryIds?.length ? data.categoryIds : [data.categoryId];
    await assertLeafCategory(resolvedCategoryIds);

    const master = await prisma.masterProduct.create({
      data: {
        sku: skuCheck.normalized,
        name: data.name.trim(),
        categoryId: resolvedCategoryIds[0],
        brand: data.brand.trim(),
        uom: data.uom ?? null,
        taxPercent: data.taxPercent ?? 0,
        imageUrl: data.imageUrl ?? null,
        images: data.images ?? [],
        aliasNames: data.aliasNames ?? [],
        searchKeywords: data.searchKeywords ?? [],
        approvalStatus: 'approved',
        approvedBy: ctx.userId,
        approvedAt: new Date(),
      },
    });

    await syncMasterProductCategories(master.id, resolvedCategoryIds);

    syncProductToBrand(
      master.brand,
      master.name,
      master.categoryId,
      master.imageUrl,
      master.packSize,
      master.uom,
      master.sku,
      master.id,
    ).catch(console.error);

    return NextResponse.json({ success: true, data: master }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
