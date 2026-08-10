// GET /api/v1/vendor/products/suggestions?q=tomato
// WHY: When a vendor types a product name, show existing approved products
//      so they can pick one instead of creating a duplicate that needs approval.
//      Also flags if the vendor already has a product with a similar name (duplicate prevention).
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { getCategoryPickerMeta } from '@/modules/catalog/catalog.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.view');
    const q = req.nextUrl.searchParams.get('q')?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, data: { suggestions: [], ownMatches: [] } });
    }

    // Resolve vendor (scoped to active business account — Vendor.userId no
    // longer unique).
    const vendor = await prisma.vendor.findFirst({
      where: {
        userId: ctx.userId,
        ...(ctx.activeBusinessAccountId ? { businessAccountId: ctx.activeBusinessAccountId } : {}),
      },
      select: { id: true },
    });

    const [catalogProducts, ownProducts] = await Promise.all([
      // Find approved products from the catalog (any vendor)
      prisma.product.findMany({
        where: {
          approvalStatus: 'approved',
          isActive: true,
          slug: { not: { startsWith: '_deleted_' } },
          AND: [
            {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { brand: { contains: q, mode: 'insensitive' } },
                { sku: { contains: q, mode: 'insensitive' } },
              ],
            },
            ...(vendor
              ? [{ OR: [{ vendorId: null }, { vendorId: { not: vendor.id } }] }]
              : []),
          ],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          basePrice: true,
          originalPrice: true,
          packSize: true,
          unit: true,
          sku: true,
          hsn: true,
          brand: true,
          barcode: true,
          description: true,
          imageUrl: true,
          images: true,
          tags: true,
          taxPercent: true,
          minOrderQty: true,
          creditEligible: true,
          categoryId: true,
          category: { select: { id: true, name: true, slug: true } },
          categoryLinks: {
            select: { categoryId: true, isPrimary: true },
            orderBy: [{ isPrimary: 'desc' }, { categoryId: 'asc' }],
          },
          vendor: { select: { businessName: true } },
        },
        take: 8,
        orderBy: { name: 'asc' },
      }),

      // Find this vendor's own products matching the name (duplicate detection)
      vendor
        ? prisma.product.findMany({
            where: {
              vendorId: vendor.id,
              slug: { not: { startsWith: '_deleted_' } },
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { brand: { contains: q, mode: 'insensitive' } },
                { sku: { contains: q, mode: 'insensitive' } },
              ],
            },
            select: {
              id: true,
              name: true,
              approvalStatus: true,
              isActive: true,
            },
            take: 5,
          })
        : [],
    ]);

    const suggestions = await Promise.all(
      catalogProducts.map(async (p) => {
        const rawIds =
          p.categoryLinks.length > 0
            ? p.categoryLinks.map((l) => l.categoryId)
            : p.categoryId
              ? [p.categoryId]
              : [];
        const { categoryIds, categoryLeafMissing } = await getCategoryPickerMeta(rawIds);
        const { categoryLinks: _links, categoryId: _cid, ...rest } = p;
        return { ...rest, categoryIds, categoryLeafMissing };
      }),
    );

    return NextResponse.json({
      success: true,
      data: {
        suggestions,
        ownMatches: ownProducts,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
