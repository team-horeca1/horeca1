import type { ApprovalStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { aggregateInventories } from '@/lib/inventoryHelpers';
import { getApprovedDistributorKeys, distributorAuthKey } from '@/lib/brandAuthorizedDistributor';
import { emitEvent } from '@/events/emitter';
import { Errors } from '@/middleware/errorHandler';
import { provisionDefaultAccount } from '@/lib/provisionAccount';
import { runMappingForProduct, runMappingForBrand, embedBrandMasterProduct } from './brand-mapper';
import { validateMasterSku } from '@/lib/sku';
import { assertLeafCategory } from '@/modules/catalog/catalog.service';
function slugify(str: string): string {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Types ────────────────────────────────────────────────────

interface CreateBrandInput {
  userId: string;
  name: string;
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  website?: string;
  tagline?: string;
  categories?: string[];
  bgColor?: string;
  showcaseImages?: string[];
}

interface UpdateBrandInput {
  name?: string;
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  website?: string;
  tagline?: string;
  categories?: string[];
  bgColor?: string;
  showcaseImages?: string[];
}

interface CreateBrandProductInput {
  name: string;
  description?: string;
  imageUrl?: string;
  packSize?: string;
  unit?: string;
  sku?: string;
  categoryId?: string;        // primary (back-compat); auto-derived from categoryIds[0] when omitted
  categoryIds?: string[];     // multi-category
  sortOrder?: number;
  masterProductId?: string;
}

// ── Service ──────────────────────────────────────────────────

export class BrandService {

  // ── Resolve brand from userId ──────────────────────────────
  // Brand.userId is no longer unique — pick the most recently created brand
  // for this user. Callers that need a specific brand (multi-brand owners)
  // should resolve via the active business account context instead.
  async getBrandIdForUser(userId: string): Promise<string> {
    const brand = await prisma.brand.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!brand) throw Errors.notFound('Brand profile not found for this user');
    return brand.id;
  }

  // ── Public: list approved brands ──────────────────────────
  async list(input: { limit?: number; cursor?: string }) {
    const { limit = 20, cursor } = input;

    const brands = await prisma.brand.findMany({
      where: {
        isActive: true,
        approvalStatus: 'approved',
        user: {
          email: {
            not: {
              contains: 'brand.internal.horeca1',
            },
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
        _count: { select: { masterProducts: { where: { isActive: true } } } },
      },
    });

    const hasMore = brands.length > limit;
    if (hasMore) brands.pop();

    return {
      brands: brands.map(b => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        logo: b.logoUrl,
        banner: b.bannerUrl,
        tagline: b.tagline,
        categories: b.categories,
        bgColor: b.bgColor,
        showcaseImages: b.showcaseImages,
        productCount: b._count.masterProducts,
      })),
      hasMore,
      nextCursor: hasMore ? brands[brands.length - 1].id : null,
    };
  }

  // ── Public: brand store page data ─────────────────────────
  // Returns canonical products + which distributors have them (verified/auto mappings).
  // When `pincode` is passed, distributors that don't service that pincode are still
  // returned but flagged via `coverage` so the UI can show an empty-state message.
  async getStoreBySlug(slug: string, opts?: { pincode?: string }) {
    const pincode = opts?.pincode;
    const brand = await prisma.brand.findFirst({
      where: {
        slug,
        isActive: true,
        approvalStatus: 'approved',
        user: {
          email: {
            not: {
              contains: 'brand.internal.horeca1',
            },
          },
        },
      },
      include: {
        masterProducts: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            categoryRel: {
              select: {
                id: true,
                name: true,
                slug: true,
                imageUrl: true,
                parentId: true,
                parent: { select: { id: true, name: true, slug: true, imageUrl: true } },
              },
            },
            mappings: {
              where: { status: 'verified' },
              include: {
                distributorProduct: {
                  select: {
                    id: true,
                    name: true,
                    basePrice: true,
                    taxPercent: true,
                    imageUrl: true,
                    packSize: true,
                    unit: true,
                    inventories: { select: { qtyAvailable: true } },
                    priceSlabs: { orderBy: { minQty: 'asc' }, select: { minQty: true, maxQty: true, price: true } },
                    vendor: {
                      select: {
                        id: true,
                        businessName: true,
                        slug: true,
                        logoUrl: true,
                        serviceAreas: {
                          where: { isActive: true },
                          select: { pincode: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!brand) throw Errors.notFound('Brand not found');

    const approvedKeys = await getApprovedDistributorKeys({ brandId: brand.id });

    // Resolve all categoryIds on master products for multi-category navigation.
    const allCategoryIds = new Set<string>();
    for (const mp of brand.masterProducts) {
      if (mp.categoryId) allCategoryIds.add(mp.categoryId);
      for (const cid of mp.categoryIds ?? []) allCategoryIds.add(cid);
    }
    const categoryRows = allCategoryIds.size > 0
      ? await prisma.category.findMany({
        where: { id: { in: [...allCategoryIds] } },
        select: {
          id: true,
          name: true,
          slug: true,
          imageUrl: true,
          parentId: true,
          parent: { select: { id: true, name: true, slug: true, imageUrl: true } },
        },
      })
      : [];
    const categoryById = new Map(categoryRows.map((c) => [c.id, c]));

    const mapCategoryLink = (c: typeof categoryRows[number]) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      imageUrl: c.imageUrl,
      parentId: c.parentId ?? c.parent?.id ?? null,
      parentName: c.parent?.name ?? null,
      parentImageUrl: c.parent?.imageUrl ?? null,
    });

    // Build vendor index (deduplicated) — only approved distributors
    const vendorMap = new Map<string, {
      id: string; name: string; slug: string; logo: string | null;
      pincodes: string[]; productIds: string[];
      prices: Record<string, number>;
      servicesPincode: boolean;
    }>();

    const products = brand.masterProducts.map(mp => {
      const distributors = mp.mappings.map(m => {
        const v = m.distributorProduct.vendor;
        if (!v) return null;
        if (!approvedKeys.has(distributorAuthKey(brand.id, v.id))) return null;

        const priceWithTax = Number(m.distributorProduct.basePrice) *
          (1 + Number(m.distributorProduct.taxPercent) / 100);
        const vendorPincodes = v.serviceAreas.map(sa => sa.pincode);
        const servicesPincode = pincode ? vendorPincodes.includes(pincode) : true;

        if (!vendorMap.has(v.id)) {
          vendorMap.set(v.id, {
            id: v.id,
            name: v.businessName,
            slug: v.slug,
            logo: v.logoUrl,
            pincodes: vendorPincodes,
            productIds: [],
            prices: {},
            servicesPincode,
          });
        }
        const vendor = vendorMap.get(v.id)!;
        if (!vendor.productIds.includes(mp.id)) vendor.productIds.push(mp.id);
        vendor.prices[mp.id] = Math.round(priceWithTax * 100) / 100;

        return {
          vendorId: v.id,
          vendorName: v.businessName,
          price: Math.round(priceWithTax * 100) / 100,
          basePrice: Number(m.distributorProduct.basePrice),
          taxPercent: Number(m.distributorProduct.taxPercent),
          inStock: (() => {
            const inv = aggregateInventories(m.distributorProduct.inventories);
            return (inv?.qtyAvailable ?? 0) > 0;
          })(),
          stock: aggregateInventories(m.distributorProduct.inventories)?.qtyAvailable ?? 0,
          distributorProductId: m.distributorProduct.id,
          distributorProductName: m.distributorProduct.name,
          packSize: m.distributorProduct.packSize ?? '',
          unit: m.distributorProduct.unit ?? '',
          imageUrl: m.distributorProduct.imageUrl,
          priceSlabs: m.distributorProduct.priceSlabs.map(s => ({
            minQty: Number(s.minQty),
            maxQty: s.maxQty != null ? Number(s.maxQty) : null,
            price: Number(s.price),
          })),
          servicesPincode,
        };
      }).filter(Boolean);

      const categoryIdList = mp.categoryIds?.length
        ? mp.categoryIds
        : (mp.categoryId ? [mp.categoryId] : []);
      const categories = categoryIdList
        .map((id) => categoryById.get(id))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map(mapCategoryLink);
      if (categories.length === 0 && mp.categoryRel) {
        categories.push(mapCategoryLink(mp.categoryRel));
      }

      const primaryCategory = mp.categoryRel?.name
        ?? categories[0]?.name
        ?? ((mp as Record<string, unknown>).category as string | undefined)
        ?? 'General';

      return {
        id: mp.id,
        name: mp.name,
        description: mp.description,
        image: mp.imageUrl,
        packSize: mp.packSize,
        unit: mp.unit,
        category: primaryCategory,
        categories,
        distributors,
      };
    });

    const allVendors = [...vendorMap.values()];
    const servicedVendors = pincode ? allVendors.filter(v => v.servicesPincode) : allVendors;

    return {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      logo: brand.logoUrl,
      banner: brand.bannerUrl,
      tagline: brand.tagline,
      description: brand.description,
      products,
      vendors: allVendors,
      coverage: {
        pincode: pincode ?? null,
        servicedVendorCount: servicedVendors.length,
        totalVendorCount: allVendors.length,
      },
    };
  }

  // ── Brand: analytics dashboard ────────────────────────────
  // Aggregates the brand's reach and order activity by joining the brand's
  // BrandProductMappings → distributorProductIds → OrderItem rows.
  async getAnalytics(brandId: string) {
    // 1) Mapped distributor products + serviced pincodes
    const mappings = await prisma.brandProductMapping.findMany({
      where: { brandId, status: 'verified' },
      select: {
        distributorProductId: true,
        brandMasterProduct: { select: { id: true, name: true, imageUrl: true, packSize: true } },
        distributorProduct: {
          select: {
            vendorId: true,
            vendor: {
              select: {
                id: true,
                businessName: true,
                logoUrl: true,
                serviceAreas: { where: { isActive: true }, select: { pincode: true } },
              },
            },
          },
        },
      },
    });

    const distributorProductIds = mappings.map(m => m.distributorProductId);
    const distributorIds = new Set(mappings.map(m => m.distributorProduct.vendorId).filter((v): v is string => v != null));
    const pincodes = new Set<string>();
    for (const m of mappings) {
      for (const sa of m.distributorProduct.vendor?.serviceAreas ?? []) pincodes.add(sa.pincode);
    }

    const masterProductCount = await prisma.brandMasterProduct.count({
      where: { brandId, isActive: true },
    });

    // 2) Orders containing brand-mapped products (last 6 months for trend, last 30d for headline)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const orderItems = distributorProductIds.length > 0
      ? await prisma.orderItem.findMany({
          where: {
            productId: { in: distributorProductIds },
            order: { createdAt: { gte: sixMonthsAgo }, status: { not: 'cancelled' } },
          },
          select: {
            productId: true,
            quantity: true,
            totalPrice: true,
            order: { select: { id: true, createdAt: true, vendorId: true } },
          },
        })
      : [];

    // 3) Headline stats (last 30d)
    let last30dOrders = 0;
    let last30dRevenue = 0;
    const last30dOrderIds = new Set<string>();
    for (const it of orderItems) {
      if (it.order.createdAt >= thirtyDaysAgo) {
        last30dOrderIds.add(it.order.id);
        last30dRevenue += Number(it.totalPrice);
      }
    }
    last30dOrders = last30dOrderIds.size;

    // 4) Top 5 master products by qty + revenue (all-time within 6mo window)
    const productIdToMaster = new Map<string, { id: string; name: string; imageUrl: string | null; packSize: string | null }>();
    for (const m of mappings) {
      productIdToMaster.set(m.distributorProductId, m.brandMasterProduct);
    }
    type AccRow = { id: string; name: string; imageUrl: string | null; packSize: string | null; qty: number; revenue: number };
    const masterAcc = new Map<string, AccRow>();
    for (const it of orderItems) {
      const master = productIdToMaster.get(it.productId);
      if (!master) continue;
      const existing = masterAcc.get(master.id) ?? {
        id: master.id, name: master.name, imageUrl: master.imageUrl, packSize: master.packSize,
        qty: 0, revenue: 0,
      };
      existing.qty += it.quantity;
      existing.revenue += Number(it.totalPrice);
      masterAcc.set(master.id, existing);
    }
    const topProducts = [...masterAcc.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // 5) Top distributors by revenue
    type VendorRow = { id: string; name: string; logoUrl: string | null; orderCount: number; revenue: number };
    const vendorAcc = new Map<string, VendorRow>();
    const vendorOrderIds = new Map<string, Set<string>>();
    const vendorIdToInfo = new Map<string, { name: string; logoUrl: string | null }>();
    for (const m of mappings) {
      if (m.distributorProduct.vendor && m.distributorProduct.vendorId) {
        vendorIdToInfo.set(m.distributorProduct.vendorId, {
          name: m.distributorProduct.vendor.businessName,
          logoUrl: m.distributorProduct.vendor.logoUrl,
        });
      }
    }
    for (const it of orderItems) {
      const vendorId = it.order.vendorId;
      const info = vendorIdToInfo.get(vendorId);
      if (!info) continue;
      const existing = vendorAcc.get(vendorId) ?? {
        id: vendorId, name: info.name, logoUrl: info.logoUrl, orderCount: 0, revenue: 0,
      };
      existing.revenue += Number(it.totalPrice);
      vendorAcc.set(vendorId, existing);
      const orderSet = vendorOrderIds.get(vendorId) ?? new Set<string>();
      orderSet.add(it.order.id);
      vendorOrderIds.set(vendorId, orderSet);
    }
    for (const [id, row] of vendorAcc) {
      row.orderCount = vendorOrderIds.get(id)?.size ?? 0;
    }
    const topDistributors = [...vendorAcc.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // 6) Monthly trend (last 6 months)
    const monthBuckets: Record<string, { month: string; orders: Set<string>; revenue: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthBuckets[key] = { month: key, orders: new Set(), revenue: 0 };
    }
    for (const it of orderItems) {
      const d = it.order.createdAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthBuckets[key]) {
        monthBuckets[key].orders.add(it.order.id);
        monthBuckets[key].revenue += Number(it.totalPrice);
      }
    }
    const monthlyTrend = Object.values(monthBuckets).map(b => ({
      month: b.month,
      orders: b.orders.size,
      revenue: Math.round(b.revenue * 100) / 100,
    }));

    return {
      headline: {
        masterProductCount,
        mappedDistributorProductCount: distributorProductIds.length,
        distributorCount: distributorIds.size,
        servicedPincodeCount: pincodes.size,
        last30dOrders,
        last30dRevenue: Math.round(last30dRevenue * 100) / 100,
      },
      topProducts: topProducts.map(p => ({
        ...p,
        revenue: Math.round(p.revenue * 100) / 100,
      })),
      topDistributors: topDistributors.map(v => ({
        ...v,
        revenue: Math.round(v.revenue * 100) / 100,
      })),
      monthlyTrend,
      pincodes: [...pincodes].sort(),
    };
  }

  // ── Brand: create profile ──────────────────────────────────
  async createBrand(input: CreateBrandInput) {
    const existing = await prisma.brand.findFirst({
      where: { OR: [{ userId: input.userId }, { name: input.name }] },
    });
    if (existing?.userId === input.userId) throw Errors.conflict('Brand profile already exists');
    if (existing?.name === input.name) throw Errors.conflict('Brand name already taken');

    const slug = slugify(input.name);

    // V2.2: provision a BusinessAccount (isBrand=true) so the Brand can be linked.
    // Idempotent — if the user already has one it's reused.
    const provision = await provisionDefaultAccount({
      userId: input.userId,
      kind: 'brand',
      businessName: input.name,
    });

    const brand = await prisma.brand.create({
      data: {
        userId: input.userId,
        businessAccountId: provision.businessAccountId,
        name: input.name,
        slug,
        description: input.description,
        logoUrl: input.logoUrl,
        bannerUrl: input.bannerUrl,
        website: input.website,
        tagline: input.tagline,
        categories: input.categories ?? [],
        bgColor: input.bgColor,
        showcaseImages: input.showcaseImages ?? [],
      },
    });

    emitEvent('BrandCreated', { brandId: brand.id, userId: input.userId, brandName: brand.name });
    return brand;
  }

  // ── Brand: get own profile ─────────────────────────────────
  // V2.2: a user may own multiple brand profiles. Return the most recently
  // created — callers that need a specific brand should resolve via active
  // business account context first and pass brandId in directly.
  async getMyProfile(userId: string) {
    const brand = await prisma.brand.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            masterProducts: { where: { isActive: true } },
            productMappings: { where: { status: { in: ['auto_mapped', 'verified'] } } },
          },
        },
      },
    });
    if (!brand) throw Errors.notFound('Brand profile not found');
    return brand;
  }

  // ── Brand: update profile ──────────────────────────────────
  async updateProfile(userId: string, input: UpdateBrandInput) {
    const brand = await prisma.brand.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!brand) throw Errors.notFound('Brand profile not found');

    return prisma.brand.update({
      where: { id: brand.id },
      data: {
        ...input,
        ...(input.name ? { slug: slugify(input.name) } : {}),
      },
    });
  }

  // ── Brand: list own master products ───────────────────────
  async listMyProducts(userId: string) {
    const brandId = await this.getBrandIdForUser(userId);
    return prisma.brandMasterProduct.findMany({
      where: { brandId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        categoryRel: { select: { id: true, name: true } },
        _count: {
          select: {
            mappings: { where: { status: 'verified' } },
          },
        },
      },
    });
  }

  // ── Brand: find master product by SKU (brand-scoped) ───────
  async findBrandProductBySku(userId: string, sku: string) {
    const brandId = await this.getBrandIdForUser(userId);
    return prisma.brandMasterProduct.findFirst({
      where: {
        brandId,
        isActive: true,
        sku: { equals: sku.trim(), mode: 'insensitive' },
      },
      select: { id: true },
    });
  }

  // ── Brand: create master product ──────────────────────────
  async createMasterProduct(userId: string, input: CreateBrandProductInput) {
    const brandId = await this.getBrandIdForUser(userId);

    // Resolve primary categoryId: prefer explicit input.categoryId, otherwise
    // fall back to the first entry in categoryIds[]. Keeps single-category
    // consumers (brand store page, etc.) working unchanged.
    const categoryIds = input.categoryIds ?? (input.categoryId ? [input.categoryId] : []);
    const primaryCategoryId = input.categoryId ?? categoryIds[0] ?? null;

    // Slug is unique per (brandId, slug) — suffix -2, -3… on name collisions so
    // same-named SKUs (batches, pack variants) don't hit the DB constraint.
    const slugBase = slugify(input.name) || 'product';
    let slug = slugBase;
    for (let n = 2; await prisma.brandMasterProduct.findUnique({
      where: { brandId_slug: { brandId, slug } },
      select: { id: true },
    }); n++) {
      slug = `${slugBase}-${n}`;
    }

    const product = await prisma.brandMasterProduct.create({
      data: {
        brandId,
        masterProductId: input.masterProductId ?? null,
        slug,
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl,
        packSize: input.packSize,
        unit: input.unit,
        sku: input.sku,
        sortOrder: input.sortOrder,
        categoryId: primaryCategoryId,
        categoryIds,
      },
    });

    emitEvent('BrandProductCreated', {
      brandMasterProductId: product.id,
      brandId,
      productName: product.name,
    });

    // Directly create mappings if a masterProductId is specified
    if (input.masterProductId) {
      try {
        const distProducts = await prisma.product.findMany({
          where: { masterProductId: input.masterProductId, isActive: true },
          select: { id: true },
        });

        if (distProducts.length > 0) {
          await prisma.brandProductMapping.createMany({
            data: distProducts.map(dp => ({
              brandId,
              brandMasterProductId: product.id,
              distributorProductId: dp.id,
              status: 'verified',
              matchedBy: 'manually_verified',
              confidenceScore: 1.0,
            })),
            skipDuplicates: true,
          });
        }
      } catch (err) {
        console.error('Failed to auto-create mappings for masterProductId:', err);
      }
    }

    // Embed first so the AI signal is available, then auto-map. Non-blocking.
    embedBrandMasterProduct(product.id)
      .catch(console.error)
      .finally(() => runMappingForProduct(product.id).catch(console.error));

    return product;
  }

  // ── Brand: submit new master catalog entry for admin approval ──
  async submitPendingMasterProduct(
    userId: string,
    input: { name: string; sku: string; categoryId: string; imageUrl?: string; packSize?: string; uom?: string },
  ) {
    const brandId = await this.getBrandIdForUser(userId);
    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { name: true } });
    if (!brand) throw Errors.notFound('Brand profile not found');

    const skuCheck = validateMasterSku(input.sku);
    if (!skuCheck.ok) throw Errors.badRequest(skuCheck.message);

    const existingSku = await prisma.masterProduct.findFirst({
      where: { sku: { equals: skuCheck.normalized, mode: 'insensitive' } },
      select: { id: true, approvalStatus: true },
    });
    if (existingSku) {
      if (existingSku.approvalStatus === 'approved') {
        throw Errors.conflict(`SKU "${skuCheck.normalized}" already exists in the master catalog`);
      }
      throw Errors.conflict(`SKU "${skuCheck.normalized}" is already pending approval`);
    }

    await assertLeafCategory([input.categoryId]);

    const master = await prisma.masterProduct.create({
      data: {
        sku: skuCheck.normalized,
        name: input.name.trim(),
        brand: brand.name,
        categoryId: input.categoryId,
        imageUrl: input.imageUrl ?? null,
        packSize: input.packSize?.trim() || null,
        uom: input.uom?.trim() || null,
        approvalStatus: 'pending',
        suggestedBy: userId,
      },
    });

    emitEvent('ProductSubmitted', {
      productId: master.id,
      vendorId: '',
      productName: master.name,
    });

    return master;
  }

  // ── Brand: update master product ──────────────────────────
  async updateMasterProduct(userId: string, productId: string, input: Partial<CreateBrandProductInput>) {
    const brandId = await this.getBrandIdForUser(userId);
    const product = await prisma.brandMasterProduct.findFirst({
      where: { id: productId, brandId },
    });
    if (!product) throw Errors.notFound('Product not found');

    // Keep categoryId in sync when categoryIds changes (primary = first entry).
    const data: Record<string, unknown> = { ...input };
    if (input.categoryIds !== undefined) {
      data.categoryIds = input.categoryIds;
      // If caller didn't explicitly set categoryId, derive it from the array.
      if (input.categoryId === undefined) {
        data.categoryId = input.categoryIds[0] ?? null;
      }
    }

    const updated = await prisma.brandMasterProduct.update({
      where: { id: productId },
      data,
    });

    // Re-embed + re-map when name (or other text-affecting fields) changed.
    if (input.name || input.packSize !== undefined || input.unit !== undefined
        || input.categoryId !== undefined || input.categoryIds !== undefined) {
      embedBrandMasterProduct(productId)
        .catch(console.error)
        .finally(() => runMappingForProduct(productId).catch(console.error));
    }

    return updated;
  }

  // ── Brand: delete master product (hard, with mapping cleanup) ─────────
  // BrandProductMapping cascades on brandMasterProductId, so this fully removes
  // the row and any mappings. Vendor-side Product rows are not touched.
  async deleteMasterProduct(userId: string, productId: string) {
    const brandId = await this.getBrandIdForUser(userId);
    const product = await prisma.brandMasterProduct.findFirst({
      where: { id: productId, brandId },
      select: { id: true },
    });
    if (!product) throw Errors.notFound('Product not found');
    await prisma.brandMasterProduct.delete({ where: { id: productId } });
    return { id: productId, deleted: true };
  }

  // ── Brand: get product-level coverage (for portal mappings page) ──────
  async getDistributorCoverage(userId: string) {
    const brandId = await this.getBrandIdForUser(userId);

    const approvedKeys = await getApprovedDistributorKeys({ brandId });
    const authRows = await prisma.brandAuthorizedDistributor.findMany({
      where: { brandId },
      select: { vendorId: true, status: true, brandApprovedAt: true, adminApprovedAt: true },
    });
    const authByVendor = new Map(authRows.map((a) => [a.vendorId, a]));

    const masterProducts = await prisma.brandMasterProduct.findMany({
      where: { brandId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        mappings: {
          where: { status: { not: 'rejected' } },
          include: {
            distributorProduct: {
              select: {
                id: true,
                name: true,
                packSize: true,
                basePrice: true,
                vendorId: true,
                vendor: { select: { id: true, businessName: true, logoUrl: true } },
              },
            },
          },
        },
      },
    });

    type CoverageRow = {
      mappingId: string;
      masterProductId: string;
      masterProductName: string;
      masterPackSize: string | null;
      masterUnit: string | null;
      masterSku: string | null;
      distributorProductId: string;
      distributorProductName: string;
      distributorPackSize: string | null;
      status: string;
      confidenceScore: number;
      vendorId: string;
      vendorName: string;
      vendorLogo: string | null;
      distributorAuthStatus: string | null;
      isAuthApproved: boolean;
    };

    const rows: CoverageRow[] = [];
    const coveredProductIds = new Set<string>();

    for (const mp of masterProducts) {
      for (const m of mp.mappings) {
        const vendorId = m.distributorProduct.vendorId;
        if (!vendorId) continue;
        const auth = authByVendor.get(vendorId);
        const isAuthApproved = approvedKeys.has(distributorAuthKey(brandId, vendorId));
        coveredProductIds.add(mp.id);
        rows.push({
          mappingId: m.id,
          masterProductId: mp.id,
          masterProductName: mp.name,
          masterPackSize: mp.packSize,
          masterUnit: mp.unit,
          masterSku: mp.sku,
          distributorProductId: m.distributorProduct.id,
          distributorProductName: m.distributorProduct.name,
          distributorPackSize: m.distributorProduct.packSize,
          status: m.status,
          confidenceScore: Number(m.confidenceScore),
          vendorId,
          vendorName: m.distributorProduct.vendor?.businessName ?? '—',
          vendorLogo: m.distributorProduct.vendor?.logoUrl ?? null,
          distributorAuthStatus: auth?.status ?? null,
          isAuthApproved,
        });
      }
    }

    const activeMappings = rows.filter(
      (r) => (r.status === 'auto_mapped' || r.status === 'verified') && r.isAuthApproved,
    ).length;
    const pendingReview = rows.filter((r) => r.status === 'pending_review').length;
    const pendingApproval = rows.filter(
      (r) => (r.status === 'auto_mapped' || r.status === 'verified') && !r.isAuthApproved,
    ).length;

    return {
      rows,
      stats: {
        productsCovered: coveredProductIds.size,
        activeMappings,
        pendingReview,
        pendingApproval,
        totalProducts: masterProducts.length,
      },
    };
  }

  // ── Brand: reject / flag an incorrect mapping ─────────────────────────
  async brandRejectMapping(userId: string, mappingId: string, reviewNote?: string) {
    const brandId = await this.getBrandIdForUser(userId);
    const mapping = await prisma.brandProductMapping.findFirst({
      where: { id: mappingId, brandId },
    });
    if (!mapping) throw Errors.notFound('Mapping not found');

    return prisma.brandProductMapping.update({
      where: { id: mappingId },
      data: {
        status: 'rejected',
        reviewNote: reviewNote?.trim() || 'Rejected by brand owner',
        reviewedBy: userId,
        updatedAt: new Date(),
      },
    });
  }

  // ── Brand: trigger manual re-mapping ──────────────────────
  // Awaits the mapper so the API response reflects final state — the frontend
  // re-fetches coverage immediately after, and "Run Auto-Mapping" needs to
  // feel synchronous to the brand. Returns before/after counts so we can also
  // surface what changed in the UI later if needed.
  async triggerMapping(userId: string) {
    const brandId = await this.getBrandIdForUser(userId);
    const before = await prisma.brandProductMapping.count({ where: { brandId } });
    try {
      await runMappingForBrand(brandId);
    } catch (err) {
      console.error('runMappingForBrand failed', err);
      throw err;
    }
    const after = await prisma.brandProductMapping.count({ where: { brandId } });
    return {
      message: after > before ? `Mapped ${after - before} new distributor product(s)` : 'No new matches found',
      before,
      after,
      newMappings: after - before,
    };
  }

  // ── Admin: list all brands ─────────────────────────────────
  async adminListBrands(status?: string) {
    return prisma.brand.findMany({
      where: status ? { approvalStatus: status as 'pending' | 'approved' | 'rejected' } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        _count: { select: { masterProducts: true, productMappings: true } },
      },
    });
  }

  // ── Admin: approve or reject brand ────────────────────────
  async adminApproveBrand(brandId: string, action: 'approved' | 'rejected', adminId: string, _reviewNote?: string) {
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw Errors.notFound('Brand not found');

    const updated = await prisma.brand.update({
      where: { id: brandId },
      data: action === 'approved'
        ? { approvalStatus: action, isActive: true }
        : { approvalStatus: action },
    });

    if (action === 'approved') {
      emitEvent('BrandApproved', { brandId, brandName: brand.name, approvedBy: adminId });
    } else {
      // Rejection: notify the brand owner so they see why and can resubmit.
      emitEvent('BrandRejected', { brandId, brandName: brand.name, rejectedBy: adminId, reason: _reviewNote });
    }
    // Note: rejection reviewNote is accepted but not yet persisted to Brand row —
    // schema has no rejection_note column. Stored in audit log via the API caller
    // for now; add a column if rejection reasons need to be displayed back.

    return updated;
  }

  // ── Admin: list pending mappings for review ────────────────
  async adminListPendingMappings(limit = 50) {
    return prisma.brandProductMapping.findMany({
      where: { status: 'pending_review' },
      take: limit,
      orderBy: { confidenceScore: 'desc' },
      include: {
        brandMasterProduct: {
          select: {
            id: true,
            name: true,
            packSize: true,
            brand: { select: { id: true, name: true, slug: true } },
          },
        },
        distributorProduct: {
          select: {
            id: true,
            name: true,
            basePrice: true,
            vendor: { select: { id: true, businessName: true, logoUrl: true } },
          },
        },
      },
    });
  }

  // ── Admin: verify or reject a mapping ─────────────────────
  async adminReviewMapping(
    mappingId: string,
    action: 'verified' | 'rejected',
    reviewedBy: string,
    reviewNote?: string,
    /**
     * Optional re-target. If admin picks a DIFFERENT BrandMasterProduct than the
     * auto-mapper guessed, we move the mapping over by deleting the original row
     * and upserting onto the new (brandMasterProductId, distributorProductId)
     * unique pair as verified+manually_verified+1.0 confidence.
     */
    brandMasterProductId?: string,
  ) {
    const mapping = await prisma.brandProductMapping.findUnique({ where: { id: mappingId } });
    if (!mapping) throw Errors.notFound('Mapping not found');

    // Simple path: no re-target — just update in place.
    if (!brandMasterProductId || brandMasterProductId === mapping.brandMasterProductId) {
      return prisma.brandProductMapping.update({
        where: { id: mappingId },
        data: {
          status: action,
          matchedBy: 'manually_verified',
          confidenceScore: action === 'verified' ? 1.0 : mapping.confidenceScore,
          reviewedBy,
          reviewNote,
        },
      });
    }

    // Re-target only makes sense when verifying. Reject + re-target is nonsense.
    if (action !== 'verified') {
      throw Errors.badRequest('Re-target only allowed when verifying');
    }

    // Confirm the new master product exists, get its brandId for the FK.
    const newMaster = await prisma.brandMasterProduct.findUnique({
      where: { id: brandMasterProductId },
      select: { id: true, brandId: true, isActive: true },
    });
    if (!newMaster || !newMaster.isActive) throw Errors.notFound('Target brand master product not found');

    // Move the mapping atomically — delete the original, upsert the new
    // (brandMasterProductId, distributorProductId) pair.
    return prisma.$transaction(async (tx) => {
      await tx.brandProductMapping.delete({ where: { id: mappingId } });
      return tx.brandProductMapping.upsert({
        where: {
          brandMasterProductId_distributorProductId: {
            brandMasterProductId,
            distributorProductId: mapping.distributorProductId,
          },
        },
        create: {
          brandId: newMaster.brandId,
          brandMasterProductId,
          distributorProductId: mapping.distributorProductId,
          status: 'verified',
          matchedBy: 'manually_verified',
          confidenceScore: 1.0,
          reviewedBy,
          reviewNote,
        },
        update: {
          status: 'verified',
          matchedBy: 'manually_verified',
          confidenceScore: 1.0,
          reviewedBy,
          reviewNote,
          updatedAt: new Date(),
        },
      });
    });
  }
}

export async function syncProductToBrand(
  brandName: string | null | undefined,
  name: string,
  categoryId: string | null | undefined,
  imageUrl: string | null | undefined,
  packSize: string | null | undefined,
  unit: string | null | undefined,
  sku: string | null | undefined,
  masterProductId?: string,
) {
  if (!brandName) return;

  try {
    // Find approved brand with matching name (case-insensitive)
    const brand = await prisma.brand.findFirst({
      where: { name: { equals: brandName.trim(), mode: 'insensitive' }, approvalStatus: 'approved' },
      select: { id: true }
    });
    if (!brand) return;

    const slug = slugify(name);
    const existing = await prisma.brandMasterProduct.findFirst({
      where: { brandId: brand.id, OR: [{ slug }, { name: { equals: name.trim(), mode: 'insensitive' } }] }
    });

    let brandMasterProduct = existing;
    if (!existing) {
      brandMasterProduct = await prisma.brandMasterProduct.create({
        data: {
          brandId: brand.id,
          name: name.trim(),
          slug,
          imageUrl: imageUrl || null,
          packSize: packSize?.trim() || null,
          unit: unit?.trim() || null,
          sku: sku || null,
          categoryId: categoryId || null,
          categoryIds: categoryId ? [categoryId] : [],
        }
      });

      // Embed and map in the background
      embedBrandMasterProduct(brandMasterProduct.id)
        .catch(console.error)
        .finally(() => runMappingForProduct(brandMasterProduct!.id).catch(console.error));
    } else {
      // Update existing brand master product fields if they are different or missing
      brandMasterProduct = await prisma.brandMasterProduct.update({
        where: { id: existing.id },
        data: {
          masterProductId: masterProductId || existing.masterProductId || null,
          imageUrl: imageUrl || existing.imageUrl || null,
          packSize: packSize?.trim() || existing.packSize || null,
          unit: unit?.trim() || existing.unit || null,
          sku: sku || existing.sku || null,
          categoryId: categoryId || existing.categoryId || null,
          categoryIds: categoryId
            ? Array.from(new Set([...(existing.categoryIds || []), categoryId]))
            : existing.categoryIds,
        }
      });
    }

    if (masterProductId && brandMasterProduct) {
      const distProducts = await prisma.product.findMany({
        where: { masterProductId, isActive: true },
        select: { id: true }
      });
      if (distProducts.length > 0) {
        await prisma.brandProductMapping.createMany({
          data: distProducts.map(dp => ({
            brandId: brand.id,
            brandMasterProductId: brandMasterProduct!.id,
            distributorProductId: dp.id,
            status: 'verified',
            matchedBy: 'manually_verified',
            confidenceScore: 1.0,
          })),
          skipDuplicates: true,
        });
      }
    }
  } catch (err) {
    console.error('syncProductToBrand failed:', err);
  }
}

export interface ResolvedBrand {
  id: string;
  name: string;
  approvalStatus: ApprovalStatus;
  created: boolean;
}

/**
 * Resolve a brand name to a Brand record, creating a lightweight (account-less)
 * brand when none exists. This is the single entry point used by product import
 * (admin + vendor) and vendor single-add so a typed-but-unknown brand always
 * reaches a tracked record instead of living only as denormalized text.
 *   • autoApprove=true  (admin)  → created approved + active, goes live immediately.
 *   • autoApprove=false (vendor) → created pending + inactive, BrandSuggested
 *     emitted for the approvals queue.
 * Matching is case-insensitive by name, then by slug. Returns null for empty
 * names (caller treats brand as absent, exactly as before).
 */
export async function findOrCreateBrandByName(input: {
  name: string | null | undefined;
  autoApprove: boolean;
  suggestedBy?: string;
}): Promise<ResolvedBrand | null> {
  const name = input.name?.trim();
  if (!name) return null;

  const slug = slugify(name);
  const existing = await prisma.brand.findFirst({
    where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, { slug }] },
    select: { id: true, name: true, approvalStatus: true },
  });
  if (existing) {
    return { id: existing.id, name: existing.name, approvalStatus: existing.approvalStatus, created: false };
  }

  const brand = await prisma.brand.create({
    data: {
      name,
      slug,
      userId: null,
      businessAccountId: null,
      approvalStatus: input.autoApprove ? 'approved' : 'pending',
      isActive: input.autoApprove,
    },
    select: { id: true, name: true, approvalStatus: true },
  });

  if (!input.autoApprove) {
    emitEvent('BrandSuggested', {
      brandId: brand.id,
      brandName: brand.name,
      suggestedBy: input.suggestedBy,
    });
  }

  return { id: brand.id, name: brand.name, approvalStatus: brand.approvalStatus, created: true };
}
