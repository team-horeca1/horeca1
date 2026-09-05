// PATCH  /api/v1/admin/master-products/:id — update a master SKU.
// DELETE /api/v1/admin/master-products/:id — delete (blocked if vendor products are linked).
// PROTECTED: admin.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { assertLeafCategory, syncMasterProductCategories } from '@/modules/catalog/catalog.service';
import {
  countLinkedVendorProducts,
  saveMasterProductRevision,
  syncMasterFieldsToVendorListings,
} from '@/modules/catalog/master-sync.service';
import { syncProductToBrand } from '@/modules/brand/brand.service';
import { validateMasterSku } from '@/lib/sku';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.view');
    const id = extractId(req);
    const master = await prisma.masterProduct.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        categoryLinks: { select: { categoryId: true, isPrimary: true } },
        _count: { select: { vendorProducts: true } },
        vendorProducts: {
          where: { slug: { not: { startsWith: '_deleted_' } } },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            hsn: true,
            basePrice: true,
            originalPrice: true,
            taxPercent: true,
            minOrderQty: true,
            unit: true,
            packSize: true,
            barcode: true,
            description: true,
            countryOfOrigin: true,
            storageType: true,
            shelfLifeDays: true,
            vegNonVeg: true,
            fssaiRef: true,
            creditEligible: true,
            isFeatured: true,
            tags: true,
            aliasNames: true,
            priceSlabs: { orderBy: { sortOrder: 'asc' } },
            vendor: { select: { id: true, businessName: true } },
          },
        },
      },
    });
    if (!master) throw Errors.notFound('Master product not found');
    return NextResponse.json({
      success: true,
      data: { ...master, vendorCount: master._count.vendorProducts },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

const updateSchema = z.object({
  sku: z.string().min(2).max(40).optional(),
  name: z.string().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  categoryIds: z.array(z.string().uuid()).min(1).optional(),
  brand: z.string().min(1).max(150).optional(),
  uom: z.string().max(50).nullable().optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  imageUrl: z.string().url().nullable().optional(),
  images: z.array(z.string().url()).optional(),
  aliasNames: z.array(z.string()).optional(),
  searchKeywords: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  /** Required when linked vendor count > 10 */
  confirmLinkedSync: z.boolean().optional(),
  // Add fields sent by bulk grid to support master-product bulk-edits
  unit: z.string().optional(),
  hsn: z.string().optional(),
  basePrice: z.number().optional(),
  originalPrice: z.number().nullable().optional(),
  minOrderQty: z.number().optional(),
  creditEligible: z.boolean().optional().transform(() => true),
  vegNonVeg: z.string().optional(),
  storageType: z.string().optional(),
  packSize: z.string().max(100).nullable().optional(),
  countryOfOrigin: z.string().max(100).nullable().optional(),
  shelfLifeDays: z.number().int().nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  description: z.string().nullable().optional(),
  fssaiRef: z.string().max(50).nullable().optional(),
  isFeatured: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.edit');
    const id = extractId(req);
    const data = updateSchema.parse(await req.json());

    const current = await prisma.masterProduct.findUnique({
      where: { id },
      select: {
        id: true,
        approvalStatus: true,
        sku: true,
        name: true,
        brand: true,
        categoryId: true,
        taxPercent: true,
        imageUrl: true,
        images: true,
      },
    });
    if (!current) throw Errors.notFound('Master product not found');

    const linkedCount = await countLinkedVendorProducts(id);
    const syncableFields = ['name', 'brand', 'categoryId', 'categoryIds', 'taxPercent', 'imageUrl', 'images'] as const;
    const touchesSyncFields = syncableFields.some((f) => data[f as keyof typeof data] !== undefined);
    if (linkedCount > 10 && touchesSyncFields && !data.confirmLinkedSync) {
      throw Errors.badRequest(
        `This master item is linked to ${linkedCount} vendor listings. Set confirmLinkedSync: true to proceed.`,
      );
    }

    const {
      categoryIds,
      categoryId: _omitCategoryId,
      sku: rawSku,
      confirmLinkedSync: _confirm,
      unit,
      hsn,
      basePrice,
      originalPrice,
      minOrderQty,
      creditEligible,
      vegNonVeg,
      storageType,
      countryOfOrigin,
      shelfLifeDays,
      barcode,
      description,
      fssaiRef,
      isFeatured,
      tags,
      ...rest
    } = data;
    const resolvedCategoryIds = categoryIds?.length
      ? categoryIds
      : data.categoryId
        ? [data.categoryId]
        : undefined;

    if (resolvedCategoryIds) await assertLeafCategory(resolvedCategoryIds);

    const updateData: Prisma.MasterProductUpdateInput = { ...rest };
    if (unit !== undefined && data.uom === undefined) {
      updateData.uom = unit;
    }
    if (data.brand !== undefined) updateData.brand = data.brand.trim();
    if (resolvedCategoryIds) {
      updateData.category = { connect: { id: resolvedCategoryIds[0] } };
    }

    if (rawSku !== undefined) {
      if (current.approvalStatus !== 'pending') {
        throw Errors.badRequest('Catalog SKU is immutable after approval. Create a new master item to change SKU.');
      }
      const skuCheck = validateMasterSku(rawSku);
      if (!skuCheck.ok) throw Errors.badRequest(skuCheck.message);
      const taken = await prisma.masterProduct.findFirst({
        where: {
          sku: { equals: skuCheck.normalized, mode: 'insensitive' },
          id: { not: id },
        },
        select: { id: true },
      });
      if (taken) throw Errors.conflict(`SKU "${skuCheck.normalized}" is already in use`);
      updateData.sku = skuCheck.normalized;
    }

    if (touchesSyncFields && linkedCount > 0) {
      await saveMasterProductRevision(id, ctx.userId);
    }

    const updated = await prisma.masterProduct.update({ where: { id }, data: updateData });

    const hasVendorCommerce =
      hsn !== undefined
      || basePrice !== undefined
      || originalPrice !== undefined
      || minOrderQty !== undefined
      || creditEligible !== undefined
      || vegNonVeg !== undefined
      || storageType !== undefined
      || countryOfOrigin !== undefined
      || shelfLifeDays !== undefined
      || barcode !== undefined
      || description !== undefined
      || fssaiRef !== undefined
      || unit !== undefined
      || isFeatured !== undefined
      || tags !== undefined;
    if (hasVendorCommerce) {
      const vendorUpdate: Prisma.ProductUpdateManyMutationInput = {};
      if (hsn !== undefined) vendorUpdate.hsn = hsn;
      if (basePrice !== undefined) vendorUpdate.basePrice = basePrice;
      if (originalPrice !== undefined) vendorUpdate.originalPrice = originalPrice;
      if (minOrderQty !== undefined) vendorUpdate.minOrderQty = minOrderQty;
      if (creditEligible !== undefined) vendorUpdate.creditEligible = true;
      if (vegNonVeg !== undefined) {
        vendorUpdate.vegNonVeg = ['veg', 'nonveg', 'egg'].includes(vegNonVeg) ? (vegNonVeg as 'veg' | 'nonveg' | 'egg') : null;
      }
      if (storageType !== undefined) vendorUpdate.storageType = storageType;
      if (countryOfOrigin !== undefined) vendorUpdate.countryOfOrigin = countryOfOrigin;
      if (shelfLifeDays !== undefined) vendorUpdate.shelfLifeDays = shelfLifeDays;
      if (barcode !== undefined) vendorUpdate.barcode = barcode;
      if (description !== undefined) vendorUpdate.description = description;
      if (fssaiRef !== undefined) vendorUpdate.fssaiRef = fssaiRef;
      if (unit !== undefined) vendorUpdate.unit = unit;
      if (isFeatured !== undefined) vendorUpdate.isFeatured = isFeatured;
      if (tags !== undefined) vendorUpdate.tags = tags;

      await prisma.product.updateMany({
        where: { masterProductId: id, slug: { not: { startsWith: '_deleted_' } } },
        data: vendorUpdate,
      });
    }

    if (resolvedCategoryIds) {
      await syncMasterProductCategories(id, resolvedCategoryIds);
    }

    if (touchesSyncFields && linkedCount > 0) {
      await syncMasterFieldsToVendorListings(id, ctx.userId, {
        name: updated.name,
        brand: updated.brand,
        taxPercent: updated.taxPercent,
        imageUrl: updated.imageUrl,
        images: updated.images,
      });
    }

    // Sync to brand catalog in background
    syncProductToBrand(
      updated.brand,
      updated.name,
      updated.categoryId,
      updated.imageUrl,
      updated.packSize,
      updated.uom,
      updated.sku,
      updated.id
    ).catch(console.error);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.delete');
    const id = extractId(req);

    const linked = await prisma.product.count({ where: { masterProductId: id } });
    if (linked > 0) {
      throw Errors.conflict(
        `Cannot delete — ${linked} vendor product(s) are mapped to this master SKU. Reassign or remove them first.`,
      );
    }

    const orderHistory = await prisma.orderItem.count({
      where: { product: { masterProductId: id } },
    });
    if (orderHistory > 0) {
      throw Errors.conflict('Cannot delete: this master SKU has order history.');
    }

    await prisma.masterProduct.delete({ where: { id } });
    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error);
  }
});
