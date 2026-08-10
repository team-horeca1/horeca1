// GET    /api/v1/admin/products/:id — Full product detail
// PATCH  /api/v1/admin/products/:id — Update any product field
// DELETE /api/v1/admin/products/:id — Soft-delete (set isActive: false)
// WHY: Admin needs to view, edit, and deactivate any product in the marketplace
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { productBrandMappingsInclude } from '@/lib/brandAuthorizedDistributor';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { CatalogService, assertLeafCategory, findOrCreateMaster } from '@/modules/catalog/catalog.service';
import { syncProductToBrand } from '@/modules/brand/brand.service';

// Helper: extract the [id] segment from the URL
function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  // URL: /api/v1/admin/products/{id}
  return segments[segments.length - 1];
}

// Validation schema for product updates (all fields optional)
const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  masterProductId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  primaryCategoryId: z.string().uuid().optional(),
  basePrice: z.number().positive().optional(),
  originalPrice: z.number().positive().nullable().optional(),
  packSize: z.string().optional(),
  unit: z.string().optional(),
  sku: z.string().optional(),
  hsn: z.string().optional(),
  brand: z.string().optional(),
  barcode: z.string().optional(),
  tags: z.array(z.string()).optional(),
  images: z.array(z.string().url()).optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  minOrderQty: z.number().int().min(1).optional(),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  creditEligible: z.boolean().optional(),
  isActive: z.boolean().optional(),
  fssaiRef: z.string().max(50).optional(),
  aliasNames: z.array(z.string()).optional(),
  vegNonVeg: z.enum(['veg', 'nonveg', 'egg']).optional(),
  storageType: z.string().max(50).optional(),
  shelfLifeDays: z.number().int().min(0).optional(),
  countryOfOrigin: z.string().max(100).optional(),
  substituteIds: z.array(z.string().uuid()).optional(),
  isFeatured: z.boolean().optional(),
  listingStatus: z.enum(['draft', 'submitted']).optional(),
  promoPrice: z.number().positive().nullable().optional(),
  promoStartTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  promoEndTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  priceSlabs: z.array(z.object({
    minQty: z.number().int().min(1),
    maxQty: z.number().int().min(1).optional(),
    price: z.number().positive(),
    promoPrice: z.number().positive().optional(),
  })).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// GET — full product detail with all relations
export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.view');
    const id = extractId(req);

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        vendor: true,
        category: true,
        priceSlabs: { orderBy: { sortOrder: 'asc' } },
        inventories: true,
        categoryLinks: {
          include: { category: { select: { id: true, name: true, slug: true } } },
        },
        masterProduct: { select: { id: true, sku: true, name: true, brand: true } },
        brandMappings: productBrandMappingsInclude,
      },
    });

    if (!product) throw Errors.notFound('Product');

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    return errorResponse(error);
  }
});

// PATCH — update any product field
export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.edit');
    const id = extractId(req);
    const body = await req.json();
    const data = updateProductSchema.parse(body);

    // Check product exists
    const existing = await prisma.product.findUnique({
      where: { id },
      select: { id: true, vendorId: true, listingStatus: true, name: true, brand: true, masterProductId: true, categoryId: true },
    });
    if (!existing) throw Errors.notFound('Product');

    const { priceSlabs, categoryIds, primaryCategoryId, listingStatus: reqListingStatus, ...productData } = data;

    const isDraftSave = reqListingStatus === 'draft';
    const isPublishing =
      reqListingStatus === 'submitted' && existing.listingStatus === 'draft';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload: any = { ...productData };

    if (isDraftSave) {
      updatePayload.isActive = false;
      updatePayload.listingStatus = 'draft';
    } else if (reqListingStatus === 'submitted') {
      updatePayload.listingStatus = 'submitted';
      if (updatePayload.isActive === undefined) {
        updatePayload.isActive = true;
      }
    }

    const categoriesChanged = categoryIds !== undefined || primaryCategoryId !== undefined;
    const multiIds = categoryIds && categoryIds.length > 0 ? Array.from(new Set(categoryIds)) : [];
    const primaryId = primaryCategoryId
      ?? updatePayload.categoryId
      ?? multiIds[0];
    if (multiIds.length > 0 && primaryId && !multiIds.includes(primaryId)) multiIds.push(primaryId);
    if (categoriesChanged && primaryId) updatePayload.categoryId = primaryId;

    if (categoriesChanged) {
      const joinIds = multiIds.length > 0 ? multiIds : (primaryId ? [primaryId] : []);
      if (isPublishing || (!isDraftSave && existing.listingStatus !== 'draft')) {
        if (joinIds.length === 0) throw Errors.badRequest('Product must remain mapped to at least one sub-category.');
        await assertLeafCategory(joinIds);
      } else if (joinIds.length > 0) {
        await assertLeafCategory(joinIds);
      }
    } else if (isPublishing) {
      const existingCats = await prisma.productCategory.findMany({
        where: { productId: id },
        select: { categoryId: true },
      });
      const cats =
        existingCats.length > 0
          ? existingCats.map((c) => c.categoryId)
          : existing.categoryId
            ? [existing.categoryId]
            : [];
      if (cats.length === 0) throw Errors.badRequest('Product must be mapped to at least one sub-category.');
      await assertLeafCategory(cats);
    }

    // Ensure masterProductId exists on publish / active listings
    const isCurrentlySubmitted = !isDraftSave && (existing.listingStatus === 'submitted' || reqListingStatus === 'submitted');
    if (isCurrentlySubmitted && !existing.masterProductId && !updatePayload.masterProductId) {
      const activeCategoryId = primaryId 
        ?? existing.categoryId 
        ?? (await prisma.productCategory.findFirst({ where: { productId: id, isPrimary: true } }))?.categoryId;
      
      if (activeCategoryId) {
        const publishName = (typeof updatePayload.name === 'string' ? updatePayload.name : existing.name).trim();
        const publishBrand = (typeof updatePayload.brand === 'string' ? updatePayload.brand : existing.brand) ?? null;
        updatePayload.masterProductId = await findOrCreateMaster({
          name: publishName,
          brand: publishBrand,
          categoryId: activeCategoryId,
        });
      }
    }

    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: updatePayload,
        include: {
          vendor: { select: { id: true, businessName: true } },
          category: { select: { id: true, name: true } },
          inventories: { select: { qtyAvailable: true } },
          priceSlabs: { orderBy: { sortOrder: 'asc' } },
        },
      });

      if (categoriesChanged) {
        await tx.productCategory.deleteMany({ where: { productId: id } });
        const joinIds = multiIds.length > 0 ? multiIds : (primaryId ? [primaryId] : []);
        if (joinIds.length > 0) {
          await tx.productCategory.createMany({
            data: joinIds.map(cid => ({
              productId: id,
              categoryId: cid,
              isPrimary: cid === primaryId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (priceSlabs && existing.vendorId) {
        await tx.priceSlab.deleteMany({ where: { productId: id } });
        if (priceSlabs.length > 0) {
          await tx.priceSlab.createMany({
            data: priceSlabs.map((slab, idx) => ({
              productId: id,
              vendorId: existing.vendorId!,
              minQty: slab.minQty,
              maxQty: slab.maxQty ?? null,
              price: slab.price,
              promoPrice: slab.promoPrice ?? null,
              sortOrder: idx,
            })),
          });
        }
      }

      return updated;
    });

    // Sync to brand catalog in background
    if (product.brand && product.listingStatus !== 'draft') {
      syncProductToBrand(
        product.brand,
        product.name,
        product.categoryId,
        product.imageUrl,
        product.packSize ?? undefined,
        product.unit ?? undefined,
        product.sku ?? undefined,
        product.masterProductId || undefined,
        product.id,
      ).catch(console.error);
    }

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    return errorResponse(error);
  }
});

// DELETE — hard-delete (blocked when order history exists; tombstone if cart/list refs block it).
// Tombstone renames the slug so the [vendorId, slug] unique constraint frees up.
export const DELETE = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.delete');
    const id = extractId(req);

    const catalogService = new CatalogService();
    const result = await catalogService.deleteProduct(id);

    return NextResponse.json({ success: true, data: { id, ...result } });
  } catch (error) {
    return errorResponse(error);
  }
});
