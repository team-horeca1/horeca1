// GET /api/v1/categories/:id/products — Fair homepage aisle rails
// Groups vendor listings by MasterProduct (fallback: name|pack|unit) so one
// card represents all competing suppliers. PUBLIC. ?pincode=&limit=

import { NextRequest, NextResponse } from 'next/server';
import { productBrandMappingsInclude } from '@/lib/brandAuthorizedDistributor';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { attachCustomerPricing } from '@/modules/pricing/catalog-pricing';
import { attachActivePromotions } from '@/modules/promotion/promotion-catalog';
import { totalStockQty } from '@/lib/inventoryHelpers';

export const dynamic = 'force-dynamic';

const OFFERS_CAP = 12;
const CANDIDATE_TAKE = 120;

type Listing = {
  id: string;
  masterProductId: string | null;
  name: string;
  packSize: string | null;
  unit: string | null;
  basePrice: unknown;
  promoPrice: unknown;
  imageUrl: string | null;
  images: string[];
  vendorId: string | null;
  vendor: {
    id: string;
    businessName: string;
    logoUrl: string | null;
    minOrderValue: unknown;
    rating: unknown;
  } | null;
  inventories: Array<{ qtyAvailable: number; qtyReserved?: number }>;
  customerPricing?: { unitPrice: number } | null;
  masterProduct?: {
    id: string;
    name: string;
    sku: string;
    imageUrl: string | null;
    images: string[];
    packSize: string | null;
    uom: string | null;
  } | null;
  [key: string]: unknown;
};

function groupKey(p: Listing): string {
  if (p.masterProductId) return `m:${p.masterProductId}`;
  const name = (p.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const pack = (p.packSize || '').trim().toLowerCase();
  const unit = (p.unit || '').trim().toLowerCase();
  return `f:${name}|${pack}|${unit}`;
}

function unitPrice(p: Listing): number {
  if (p.customerPricing != null && Number.isFinite(Number(p.customerPricing.unitPrice))) {
    return Number(p.customerPricing.unitPrice);
  }
  const base = Number(p.basePrice) || 0;
  const promo = p.promoPrice != null ? Number(p.promoPrice) : null;
  if (promo != null && promo < base) return promo;
  return base;
}

function sortOffers(a: Listing, b: Listing): number {
  const stockA = totalStockQty(a.inventories) > 0 ? 1 : 0;
  const stockB = totalStockQty(b.inventories) > 0 ? 1 : 0;
  if (stockB !== stockA) return stockB - stockA;
  return unitPrice(a) - unitPrice(b);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: categoryId } = await params;
    const { searchParams } = new URL(req.url);
    const pincode = searchParams.get('pincode')?.trim();
    const limitParam = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 24) : 8;

    const category = await prisma.category.findFirst({
      where: { id: categoryId, isActive: true, approvalStatus: 'approved' },
      select: { id: true },
    });
    if (!category) throw Errors.notFound('Category');

    let vendorIdFilter: string[] | null = null;
    if (pincode && /^\d{6}$/.test(pincode)) {
      const areas = await prisma.serviceArea.findMany({
        where: { pincode },
        select: { vendorId: true },
      });
      vendorIdFilter = Array.from(new Set(areas.map((a) => a.vendorId)));
      if (vendorIdFilter.length === 0) {
        return NextResponse.json({ success: true, data: { items: [] } });
      }
    }

    const candidates = await prisma.product.findMany({
      where: {
        isActive: true,
        approvalStatus: 'approved',
        inventories: { some: { qtyAvailable: { gt: 0 } } },
        ...(vendorIdFilter ? { vendorId: { in: vendorIdFilter } } : {}),
        OR: [{ categoryId }, { categoryLinks: { some: { categoryId } } }],
      },
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            logoUrl: true,
            minOrderValue: true,
            rating: true,
          },
        },
        inventories: { select: { qtyAvailable: true, qtyReserved: true } },
        category: { select: { id: true, name: true, slug: true } },
        priceSlabs: { orderBy: { minQty: 'asc' }, take: 3 },
        brandMappings: productBrandMappingsInclude,
        masterProduct: {
          select: {
            id: true,
            name: true,
            sku: true,
            imageUrl: true,
            images: true,
            packSize: true,
            uom: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: CANDIDATE_TAKE,
    });

    let priced = (await attachCustomerPricing(candidates)) as Listing[];
    priced = (await attachActivePromotions(priced)) as Listing[];

    const groups = new Map<string, Listing[]>();
    for (const p of priced) {
      const key = groupKey(p);
      const list = groups.get(key) ?? [];
      list.push(p);
      groups.set(key, list);
    }

    const items = Array.from(groups.values())
      .map((offers) => {
        const sorted = offers.slice().sort(sortOffers);
        const capped = sorted.slice(0, OFFERS_CAP);
        const defaultOffer = capped[0];
        const master = defaultOffer.masterProduct ?? null;

        return {
          master: master
            ? {
                id: master.id,
                name: master.name,
                sku: master.sku,
                imageUrl: master.imageUrl,
                images: master.images,
                packSize: master.packSize,
                unit: master.uom,
              }
            : null,
          vendorCount: capped.length,
          defaultOffer,
          offers: capped,
        };
      })
      // Fair rail rank: more competing vendors first, then cheapest default offer
      .sort((a, b) => {
        if (b.vendorCount !== a.vendorCount) return b.vendorCount - a.vendorCount;
        return unitPrice(a.defaultOffer) - unitPrice(b.defaultOffer);
      })
      .slice(0, limit);

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    return errorResponse(error);
  }
}
