// PATCH  /api/v1/vendor/products/:id — Update product details
// DELETE /api/v1/vendor/products/:id — Soft-delete (deactivate) a product
// WHY: Vendors need to update product info (price, description, images, etc.)
//      and deactivate products they no longer want to sell
// PROTECTED: Vendor only (vendors + admins)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { CatalogService, getCategoryPickerMeta } from '@/modules/catalog/catalog.service';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { syncProductToBrand } from '@/modules/brand/brand.service';
import { logProductFieldChanges, summarizePriceSlabs } from '@/lib/product-audit';

/** Absolute http(s) URL or app-relative path (seeded products use /images/...). */
const imageRef = z.string().refine(
  (v) => v.startsWith('/') || /^https?:\/\//i.test(v),
  { message: 'Invalid image URL' },
);

// Validation schema for product updates (all fields optional)
const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  basePrice: z.number().positive().optional(),
  originalPrice: z.number().positive().nullable().optional(),
  imageUrl: imageRef.optional(),
  images: z.array(imageRef).optional(),
  packSize: z.string().optional(),
  unit: z.string().optional(),
  sku: z.string().optional(),
  vendorSku: z.string().min(1).max(100).optional(),
  hsn: z.string().optional(),
  fssaiRef: z.string().max(50).optional(),
  brand: z.string().optional(),
  barcode: z.string().optional(),
  tags: z.array(z.string()).optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  promoPrice: z.number().positive().nullable().optional(),
  promoStartTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  promoEndTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  minOrderQty: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
  creditEligible: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  vegNonVeg: z.enum(['veg', 'nonveg', 'egg']).optional(),
  storageType: z.string().max(50).optional(),
  shelfLifeDays: z.number().int().min(0).optional(),
  countryOfOrigin: z.string().max(100).optional(),
  aliasNames: z.array(z.string()).optional(),
  substituteIds: z.array(z.string().uuid()).optional(),
  // Allow re-linking to a different Horeca1 master SKU on edit (not forced).
  masterProductId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  // Multi-category — when provided, replaces the existing category set. First
  // entry becomes the new primary (mirrored into Product.categoryId).
  categoryIds: z.array(z.string().uuid()).max(5).optional(),
  priceSlabs: z.array(z.object({
    minQty: z.number().int().min(1),
    maxQty: z.number().int().min(1).optional(),
    price: z.number().positive(),
    promoPrice: z.number().positive().optional(),
  })).max(3).optional(),
  listingStatus: z.enum(['draft', 'submitted']).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Helper: extract the [id] segment from /api/v1/vendor/products/{id}
function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

// PATCH — update product fields
export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'products.edit');

    const productId = extractId(req);
    const body = await req.json();
    const data = updateProductSchema.parse(body);

    const { priceSlabs, ...productData } = data;

    const catalogService = new CatalogService();
    const updated = await catalogService.updateProduct(productId, vendorId, productData, ctx.userId);

    // Replace price slabs if provided
    if (priceSlabs !== undefined) {
      const oldSlabs = await prisma.priceSlab.findMany({
        where: { productId, vendorId },
        orderBy: { sortOrder: 'asc' },
        select: { minQty: true, maxQty: true, price: true, promoPrice: true },
      });
      await prisma.priceSlab.deleteMany({ where: { productId, vendorId } });
      if (priceSlabs.length > 0) {
        await prisma.priceSlab.createMany({
          data: priceSlabs.map((slab, idx) => ({
            productId,
            vendorId,
            minQty: slab.minQty,
            maxQty: slab.maxQty ?? null,
            price: slab.price,
            promoPrice: slab.promoPrice ?? null,
            sortOrder: idx,
          })),
        });
      }
      void logProductFieldChanges(productId, ctx.userId, 'vendor_edit', [
        {
          field: 'priceSlabs',
          oldValue: summarizePriceSlabs(oldSlabs),
          newValue: summarizePriceSlabs(priceSlabs),
        },
      ]).catch(console.error);
    }

    if (updated.approvalStatus === 'approved' && updated.brand) {
      syncProductToBrand(
        updated.brand,
        updated.name,
        updated.categoryId,
        updated.imageUrl,
        updated.packSize ?? undefined,
        updated.unit ?? undefined,
        updated.sku ?? undefined,
        updated.masterProductId || undefined
      ).catch(console.error);
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

// GET — fetch a single product with price slabs (for edit form)
export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);

    const productId = extractId(req);
    const product = await prisma.product.findFirst({
      where: { id: productId, vendorId },
      include: {
        priceSlabs: { orderBy: { sortOrder: 'asc' } },
        inventories: { select: { qtyAvailable: true, qtyReserved: true } },
        category: { select: { id: true, name: true, slug: true } },
        // Multi-category set, primary first — used by the edit form to pre-fill
        // the multi-select picker. Always returned (empty for legacy rows).
        categoryLinks: {
          orderBy: { isPrimary: 'desc' },
          include: { category: { select: { id: true, name: true, slug: true } } },
        },
        masterProduct: { select: { id: true, sku: true, name: true, brand: true } },
      },
    });
    if (!product) throw Errors.notFound('Product');

    const rawCategoryIds =
      product.categoryLinks.length > 0
        ? product.categoryLinks.map((l) => l.categoryId)
        : product.categoryId
          ? [product.categoryId]
          : [];
    const { categoryIds, categoryLeafMissing } = await getCategoryPickerMeta(rawCategoryIds);

    return NextResponse.json({
      success: true,
      data: { ...product, categoryIds, categoryLeafMissing },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// DELETE — hard-delete the product (blocked when order history exists; tombstone if cart/list refs block it).
// Either way, the [vendorId, slug] unique constraint frees up so the same name
// can be re-added immediately.
export const DELETE = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'products.delete');

    const productId = extractId(req);

    const catalogService = new CatalogService();
    const result = await catalogService.deleteProduct(productId, vendorId);

    return NextResponse.json({ success: true, data: { id: productId, ...result } });
  } catch (error) {
    return errorResponse(error);
  }
});
