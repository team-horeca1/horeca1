import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getApprovedDistributorKeys, filterAuthorizedMappings } from '@/lib/brandAuthorizedDistributor';
import {
  loadFulfillmentStockContext,
  sellableForContext,
  type InvRow,
} from '@/modules/fulfillment/fulfillmentStock';

// Shape returned by Prisma.$queryRaw for trgm fuzzy match
interface TrgmRow {
  id: string;
}

const PRODUCT_INCLUDE = {
  vendor: {
    select: { id: true, businessName: true, slug: true, logoUrl: true, rating: true, minOrderValue: true },
  },
  priceSlabs: { orderBy: { sortOrder: 'asc' as const } },
  inventories: { select: { outletId: true, qtyAvailable: true, qtyReserved: true } },
  category: { select: { id: true, name: true, slug: true, imageUrl: true } },
  brandMappings: {
    where: { status: { in: ['verified' as const, 'auto_mapped' as const] } },
    select: {
      brandId: true,
      brandMasterProduct: {
        select: {
          name: true,
          brand: { select: { name: true, slug: true } },
        },
      },
    },
    orderBy: { confidenceScore: 'desc' as const },
    take: 1,
  },
} satisfies Prisma.ProductInclude;

type ProductWithIncludes = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

export class SearchService {
  async search(query: string, pincode?: string, cursor?: string, limit = 20) {
    const vendorFilter: Prisma.ProductWhereInput = pincode
      ? { vendor: { isActive: true, serviceAreas: { some: { pincode, isActive: true } } } }
      : {};

    // ── Phase 1: exact ILIKE match ──────────────────────────────────────────
    // Fast path — hits existing btree/GIN indexes, very high confidence results.
    const exactWhere: Prisma.ProductWhereInput = {
      isActive: true,
      approvalStatus: 'approved',
      ...vendorFilter,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
        { vendorSku: { contains: query, mode: 'insensitive' } },
        { brand: { contains: query, mode: 'insensitive' } },
        { category: { name: { contains: query, mode: 'insensitive' } } },
        { vendor: { businessName: { contains: query, mode: 'insensitive' } } },
        { tags: { has: query.toLowerCase() } },
        { aliasNames: { has: query.toLowerCase() } },
      ],
    };

    const exactProducts = await prisma.product.findMany({
      where: exactWhere,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: PRODUCT_INCLUDE,
    });

    // ── Phase 2: fuzzy trgm match (only when phase 1 returns fewer than 5) ──
    // Catches typos like "panner" → "paneer". Uses pg_trgm similarity operator %.
    // $queryRaw with Prisma.sql keeps parameters fully escaped — no string interp.
    let products: ProductWithIncludes[];

    if (exactProducts.length < 5) {
      const fuzzyRows = await prisma.$queryRaw<TrgmRow[]>(
        Prisma.sql`
          SELECT id
          FROM   products
          WHERE  name % ${query}
             AND is_active = true
             AND approval_status = 'approved'
          ORDER  BY similarity(name, ${query}) DESC
          LIMIT  20
        `
      );

      const exactIds = new Set(exactProducts.map((p) => p.id));
      const newFuzzyIds = fuzzyRows.map((r) => r.id).filter((id) => !exactIds.has(id));

      if (newFuzzyIds.length > 0) {
        const fuzzyWhere: Prisma.ProductWhereInput = {
          id: { in: newFuzzyIds },
          isActive: true,
          approvalStatus: 'approved',
          ...vendorFilter,
        };

        const fuzzyProducts = await prisma.product.findMany({
          where: fuzzyWhere,
          include: PRODUCT_INCLUDE,
        });

        // Phase 1 results first (highest confidence), then deduped phase 2 results
        products = [...exactProducts, ...fuzzyProducts];
      } else {
        products = exactProducts;
      }
    } else {
      products = exactProducts;
    }

    const vendorIds = [...new Set(products.map((p) => p.vendorId).filter((id): id is string => id != null))];
    const brandIds = new Set<string>();
    for (const p of products) {
      for (const m of p.brandMappings ?? []) {
        if (m.brandId) brandIds.add(m.brandId);
      }
    }
    const approvedKeys = brandIds.size > 0 && vendorIds.length > 0
      ? await getApprovedDistributorKeys()
      : new Set<string>();
    products = products.map((p) => {
      const vendorId = p.vendorId ?? p.vendor?.id;
      if (!vendorId || !p.brandMappings?.length) return p;
      const filtered = filterAuthorizedMappings(p.brandMappings, vendorId, approvedKeys);
      return filtered.length === p.brandMappings.length ? p : { ...p, brandMappings: filtered };
    });

    // Align search stock with checkout fulfillment rules (per vendor).
    const stockCtxByVendor = new Map<string, Awaited<ReturnType<typeof loadFulfillmentStockContext>>>();
    await Promise.all(
      vendorIds.map(async (vid) => {
        stockCtxByVendor.set(vid, await loadFulfillmentStockContext(vid));
      }),
    );
    products = products.map((p) => {
      const vendorId = p.vendorId ?? p.vendor?.id;
      if (!vendorId) return p;
      const ctx = stockCtxByVendor.get(vendorId);
      const rows = (p.inventories ?? []) as InvRow[];
      const qty = ctx
        ? sellableForContext(ctx, rows, pincode)
        : rows.reduce((s, r) => s + Math.max(0, r.qtyAvailable - (r.qtyReserved ?? 0)), 0);
      return {
        ...p,
        inventories: [{ outletId: '', qtyAvailable: qty, qtyReserved: 0 }],
      };
    });

    // Keep zero-stock SKUs visible; catalog UI shows Out / grayed cards.
    // Honour limit after stock rewrite
    const hasMore = products.length > limit;
    if (hasMore) products = products.slice(0, limit);

    // Extract unique vendors and categories for the 3-block response
    const vendorMap = new Map<string, ProductWithIncludes['vendor']>();
    const categoryMap = new Map<string, NonNullable<ProductWithIncludes['category']>>();

    for (const p of products) {
      if (p.vendor) vendorMap.set(p.vendor.id, p.vendor);
      if (p.category) categoryMap.set(p.category.id, p.category);
    }

    // 4th block: Brands matching the query (name, slug, or category tag)
    const brands = await prisma.brand.findMany({
      where: {
        isActive: true,
        approvalStatus: 'approved',
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { slug: { contains: query, mode: 'insensitive' } },
          { categories: { has: query } },
        ],
      },
      take: 5,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        bannerUrl: true,
        tagline: true,
        categories: true,
        bgColor: true,
        showcaseImages: true,
      },
    });

    return {
      products,
      vendors: Array.from(vendorMap.values()),
      categories: Array.from(categoryMap.values()),
      brands,
      pagination: {
        next_cursor: hasMore ? products[products.length - 1]?.id : null,
        has_more: hasMore,
      },
    };
  }
}
