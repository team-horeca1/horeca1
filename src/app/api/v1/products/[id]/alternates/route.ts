// GET /api/v1/products/:id/alternates
// WHY: When a product is out of stock on the PDP, surface alternate vendors
//      that carry the SAME product (or a closely-matching one) so the buyer
//      doesn't bounce. Match hierarchy:
//        1. Same BrandMasterProduct via verified BrandProductMapping (best — exact SKU)
//        2. Same barcode (exact SKU, no brand mapping needed)
//        3. Same brand + same category + same pack size (e.g. "Veeba 250ml")
//        4. Same category + name has 2+ overlapping tokens (≥4 chars)
// PUBLIC: No auth required — anyone browsing a PDP can read these suggestions.

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { productBrandMappingsInclude } from '@/lib/brandAuthorizedDistributor';
import { prisma } from '@/lib/prisma';
import { errorResponse } from '@/middleware/errorHandler';
import { attachCustomerPricing } from '@/modules/pricing/catalog-pricing';
import { withLegacyInventory } from '@/lib/inventoryHelpers';

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'pcs', 'kgs', 'ltr', 'pack']);

// All tiers exit through here so logged-in buyers see THEIR price on
// alternate-vendor suggestions too.
function hasSellableStock(p: {
  inventories?: Array<{ qtyAvailable: number; qtyReserved?: number }> | null;
}): boolean {
  const rows = p.inventories ?? [];
  return rows.some((r) => r.qtyAvailable - (r.qtyReserved ?? 0) > 0);
}

async function respond<T extends { id: string; basePrice: unknown }>(
  alternates: T[],
  matchType: string,
) {
  const inStock = alternates.filter((a) =>
    hasSellableStock(a as T & { inventories?: Array<{ qtyAvailable: number; qtyReserved?: number }> }),
  );
  const enriched = inStock.map((a) =>
    withLegacyInventory(a as T & { inventories?: Array<{ qtyAvailable: number; qtyReserved?: number }> }),
  );
  return NextResponse.json({
    success: true,
    data: { alternates: await attachCustomerPricing(enriched), matchType },
  });
}

const productInclude = {
  vendor: { select: { id: true, businessName: true, logoUrl: true, minOrderValue: true } },
  inventories: { select: { qtyAvailable: true, qtyReserved: true } },
  category: { select: { id: true, name: true } },
  brandMappings: productBrandMappingsInclude,
} as const;

const baseFilter: Prisma.ProductWhereInput = {
  isActive: true,
  approvalStatus: 'approved',
  inventories: { some: { qtyAvailable: { gt: 0 } } },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params;

    const source = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        categoryId: true,
        brand: true,
        barcode: true,
        packSize: true,
      },
    });

    if (!source) {
      return NextResponse.json({ success: true, data: { alternates: [] } });
    }

    // ── Tier 1: Brand-mapping match (same BrandMasterProduct → same SKU) ──
    const sourceMappings = await prisma.brandProductMapping.findMany({
      where: {
        distributorProductId: productId,
        status: { in: ['verified', 'auto_mapped'] },
      },
      select: { brandMasterProductId: true },
    });

    if (sourceMappings.length > 0) {
      const masterIds = sourceMappings.map(m => m.brandMasterProductId);
      const linked = await prisma.brandProductMapping.findMany({
        where: {
          brandMasterProductId: { in: masterIds },
          distributorProductId: { not: productId },
          status: { in: ['verified', 'auto_mapped'] },
          distributorProduct: baseFilter,
        },
        include: { distributorProduct: { include: productInclude } },
        take: 3,
      });
      if (linked.length > 0) {
        return respond(linked.map(l => l.distributorProduct), 'brand_mapping');
      }
    }

    // ── Tier 2: Barcode match ──
    if (source.barcode && source.barcode.trim().length >= 6) {
      const byBarcode = await prisma.product.findMany({
        where: {
          ...baseFilter,
          id: { not: productId },
          barcode: source.barcode,
        },
        include: productInclude,
        take: 3,
      });
      if (byBarcode.length > 0) {
        return respond(byBarcode, 'barcode');
      }
    }

    // ── Tier 3: Same brand + same category (+ same pack size if present) ──
    if (source.brand && source.brand.trim().length >= 2 && source.categoryId) {
      const byBrand = await prisma.product.findMany({
        where: {
          ...baseFilter,
          id: { not: productId },
          brand: { equals: source.brand, mode: 'insensitive' },
          categoryId: source.categoryId,
          ...(source.packSize ? { packSize: source.packSize } : {}),
        },
        include: productInclude,
        take: 3,
      });
      if (byBrand.length > 0) {
        return respond(byBrand, 'brand_category');
      }
    }

    // ── Tier 4: Same category + 2+ token overlap (tokens ≥ 4 chars, no stopwords) ──
    if (!source.categoryId) {
      return NextResponse.json({ success: true, data: { alternates: [], matchType: 'none' } });
    }

    const tokens = (source.name || '')
      .toLowerCase()
      .split(/\s+/)
      .map(t => t.replace(/[^a-z0-9]/g, ''))
      .filter(t => t.length >= 4 && !STOPWORDS.has(t) && !/^\d+$/.test(t));

    if (tokens.length === 0) {
      // No usable tokens — fall back to plain category match (loose but at least same shelf).
      const sameCategory = await prisma.product.findMany({
        where: { ...baseFilter, id: { not: productId }, categoryId: source.categoryId },
        include: productInclude,
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
      return respond(sameCategory, 'category');
    }

    const candidates = await prisma.product.findMany({
      where: {
        ...baseFilter,
        id: { not: productId },
        categoryId: source.categoryId,
        OR: tokens.map(t => ({ name: { contains: t, mode: 'insensitive' as const } })),
      },
      include: productInclude,
      take: 20,
    });

    const ranked = candidates
      .map(p => {
        const candTokens = (p.name || '')
          .toLowerCase()
          .split(/\s+/)
          .map(t => t.replace(/[^a-z0-9]/g, ''))
          .filter(t => t.length >= 4);
        const overlap = tokens.filter(t => candTokens.includes(t)).length;
        return { product: p, overlap };
      })
      .filter(r => r.overlap >= 2)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 3)
      .map(r => r.product);

    return respond(ranked, ranked.length > 0 ? 'token_overlap' : 'none');
  } catch (error) {
    return errorResponse(error);
  }
}
