// GET  /api/v1/vendor/products — List vendor's products (includes inactive)
// POST /api/v1/vendor/products — Create a new product + initialize inventory
// WHY: Vendors need to manage their product catalog — view all products
//      (including deactivated ones) and add new products to their storefront
// PROTECTED: Vendor only (vendors + admins)
// SUPPORTS (GET): ?categoryId=&search=&cursor=&limit=20

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { ensureInventoryForAllOutlets } from '@/lib/inventoryOutlet';
import { CatalogService } from '@/modules/catalog/catalog.service';
import { emitEvent } from '@/events/emitter';
import { resolveVendorId, resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { syncProductToBrand } from '@/modules/brand/brand.service';

// Validation schema for product creation
const createProductSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  // Maps to a Horeca1 master SKU (P0-1). Optional here — the service auto-links
  // or creates one by (name, brand) when omitted, so the central catalog stays
  // populated. Supply it to map onto an existing master explicitly.
  masterProductId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  // Multi-category — vendor picks 1..N categories. First entry becomes the
  // primary (mirrored into Product.categoryId). Empty array is allowed for
  // products that don't fit a category cleanly.
  categoryIds: z.array(z.string().uuid()).max(5).optional(),
  basePrice: z.number().min(0).optional(),
  originalPrice: z.number().positive().optional(),
  packSize: z.string().optional(),
  unit: z.string().optional(),
  sku: z.string().optional(),
  vendorSku: z.string().min(1).max(100).optional(),
  hsn: z.string().optional(),
  fssaiRef: z.string().max(50).optional(),
  brand: z.string().optional(),
  barcode: z.string().optional(),
  tags: z.array(z.string()).optional(),
  aliasNames: z.array(z.string()).optional(),
  shelfLifeDays: z.number().int().min(0).optional(),
  countryOfOrigin: z.string().max(100).optional(),
  substituteIds: z.array(z.string().uuid()).optional(),
  vegNonVeg: z.enum(['veg', 'nonveg', 'egg']).optional(),
  storageType: z.string().max(50).optional(),
  images: z.array(z.string().url()).optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  promoPrice: z.number().positive().optional(),
  promoStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), // HH:mm
  promoEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),   // HH:mm
  minOrderQty: z.number().int().min(1).optional(),
  description: z.string().optional(),
    imageUrl: z
    .string()
    .refine((v) => v.startsWith('/') || /^https?:\/\//i.test(v), { message: 'Invalid image URL' })
    .optional(),
  creditEligible: z.boolean().optional(),
  basedOnProductId: z.string().uuid().optional(),
  basedOnBrandMasterProductId: z.string().uuid().optional(),
  priceSlabs: z.array(z.object({
    minQty: z.number().int().min(1),
    maxQty: z.number().int().min(1).optional(),
    price: z.number().positive(),
    promoPrice: z.number().positive().optional(),
  })).max(3).optional(),
  listingStatus: z.enum(['draft', 'submitted']).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
}).superRefine((data, ctx) => {
  const isDraft = data.listingStatus === 'draft';
  if (!isDraft && (!data.basePrice || data.basePrice <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A valid base price is required',
      path: ['basePrice'],
    });
  }
});

// GET — list all vendor products (includes inactive for management)
export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  requirePermission(ctx, 'products.view');
  try {
    const vendorId = await resolveVendorId(ctx, req);

    // Parse query params
    const params = req.nextUrl.searchParams;
    const categoryId = params.get('categoryId') || undefined;
    const search = params.get('search') || undefined;
    const cursor = params.get('cursor') || undefined;
    const limit = Math.min(Number(params.get('limit')) || 20, 500);

    const catalogService = new CatalogService();
    const result = await catalogService.getVendorProducts(vendorId, {
      categoryId,
      search,
      cursor,
      limit,
      includeInactive: true,
      aggregateStock: true,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});

// POST — create a new product and initialize its inventory record
export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'products.create');

    const body = await req.json();
    const data = createProductSchema.parse(body);
    const isDraft = data.listingStatus === 'draft';

    // Prevent duplicate: check if this vendor already has a product with the same name.
    // Tombstoned rows (slug prefixed with _deleted_) are ignored so re-adding works after delete.
    // Draft autosaves skip this — the same draft row is PATCHed on subsequent saves.
    if (!isDraft) {
      const existing = await prisma.product.findFirst({
        where: {
          vendorId,
          name: { equals: data.name, mode: 'insensitive' },
          slug: { not: { startsWith: '_deleted_' } },
        },
        select: { id: true, name: true, approvalStatus: true },
      });
      if (existing) {
        throw Errors.conflict(
          `You already have a product named "${existing.name}" (${existing.approvalStatus}). Edit the existing product instead.`
        );
      }
    }

    const { priceSlabs, basedOnProductId, basedOnBrandMasterProductId, ...productData } = data;
    const catalogService = new CatalogService();
    const product = await catalogService.createProduct(vendorId, {
      ...productData,
      basePrice: productData.basePrice ?? (isDraft ? 0.01 : productData.basePrice!),
      basedOnProductId,
      basedOnBrandMasterProductId,
    });

    // After product creation, add price slabs if provided
    if (priceSlabs && priceSlabs.length > 0) {
      await prisma.priceSlab.createMany({
        data: priceSlabs.map((slab, idx) => ({
          productId: product.id,
          vendorId,
          minQty: slab.minQty,
          maxQty: slab.maxQty ?? null,
          price: slab.price,
          promoPrice: slab.promoPrice ?? null,
          sortOrder: idx,
        })),
      });
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { businessAccountId: true, multiWarehouseEnabled: true },
    });
    if (!vendor) throw Errors.notFound('Vendor');

    // Platform policy: always initialize inventory on all active outlets
    await ensureInventoryForAllOutlets(product.id, vendorId, vendor.businessAccountId);

    // Only notify admins if product needs approval (not auto-approved or draft)
    if (!isDraft && product.approvalStatus === 'pending') {
      emitEvent('ProductSubmitted', {
        productId: product.id,
        vendorId,
        productName: data.name,
      });
    }

    if (product.approvalStatus === 'approved' && product.brand) {
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

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
