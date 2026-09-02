import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/events/emitter';
import { Errors } from '@/middleware/errorHandler';

interface ListVendorsInput {
  pincode?: string;
  categoryId?: string;
  sort?: 'rating' | 'name' | 'min_order_value' | 'frequent';
  order?: 'asc' | 'desc';
  cursor?: string;
  limit?: number;
}

export class VendorService {
  async list(input: ListVendorsInput) {
    const { pincode, categoryId, sort = 'rating', order = 'desc', cursor, limit = 20 } = input;

    const where: Record<string, unknown> = { isActive: true, isVerified: true };

    if (pincode) {
      where.serviceAreas = { some: { pincode, isActive: true } };
    }

    if (categoryId) {
      where.products = { some: { categoryId, isActive: true } };
    }

    const vendors = await prisma.vendor.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      // 'frequent' = most-ordered vendors (by order count); others map to a column.
      orderBy:
        sort === 'frequent'
          ? { orders: { _count: order } }
          : { [sort === 'min_order_value' ? 'minOrderValue' : sort]: order },
      select: {
        id: true,
        businessName: true,
        slug: true,
        logoUrl: true,
        bannerUrl: true,
        rating: true,
        minOrderValue: true,
        creditEnabled: true,
        description: true,
        isVerified: true,
        createdAt: true,
        _count: { select: { products: { where: { isActive: true } } } },
        products: {
          where: { isActive: true },
          select: { category: { select: { name: true } } },
          distinct: ['categoryId'],
        },
      },
    });

    const hasMore = vendors.length > limit;
    if (hasMore) vendors.pop();

    // Flatten products→category into a simple categories string array
    const vendorsWithCategories = vendors.map(({ products, _count, ...rest }) => ({
      ...rest,
      productCount: _count.products,
      categories: [...new Set(products.map(p => p.category?.name).filter(Boolean))],
    }));

    return {
      vendors: vendorsWithCategories,
      pagination: {
        next_cursor: hasMore ? vendorsWithCategories[vendorsWithCategories.length - 1]?.id : null,
        has_more: hasMore,
      },
    };
  }

  async getById(id: string) {
    // Accept either UUID or slug so frontend links work regardless of format.
    // We cannot use `OR: [{ id }, { slug: id }]` because Postgres validates the
    // UUID column type strictly — passing a slug like "daily-fresh-foods" against
    // `id = $1` throws P2007 before Prisma can short-circuit to the slug branch.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const where = UUID_RE.test(id) ? { id } : { slug: id };
    const vendor = await prisma.vendor.findFirst({
      where,
      include: {
        serviceAreas: { where: { isActive: true }, select: { pincode: true } },
        deliverySlots: { where: { isActive: true } },
        products: {
          where: { isActive: true },
          select: { category: { select: { name: true } } },
          distinct: ['categoryId'],
        },
      },
    });

    if (!vendor) throw Errors.notFound('Vendor');

    // Flatten products→category into a simple categories string array
    const { products, ...rest } = vendor;
    return {
      ...rest,
      categories: [...new Set(products.map(p => p.category?.name).filter(Boolean))],
    };
  }

  async getBySlug(slug: string) {
    const vendor = await prisma.vendor.findUnique({
      where: { slug },
      include: {
        serviceAreas: { where: { isActive: true }, select: { pincode: true } },
        deliverySlots: { where: { isActive: true } },
        products: {
          where: { isActive: true },
          select: { category: { select: { name: true } } },
          distinct: ['categoryId'],
        },
      },
    });

    if (!vendor) throw Errors.notFound('Vendor');

    const { products, ...rest } = vendor;
    return {
      ...rest,
      categories: [...new Set(products.map(p => p.category?.name).filter(Boolean))],
    };
  }

  async getMyVendors(userId: string) {
    return prisma.customerVendor.findMany({
      where: { userId },
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            rating: true,
            minOrderValue: true,
          },
        },
      },
      orderBy: { lastOrderedAt: 'desc' },
    });
  }

  async follow(userId: string, businessAccountId: string, vendorId: string) {
    return prisma.customerVendor.upsert({
      where: { businessAccountId_vendorId: { businessAccountId, vendorId } },
      update: { isFavorite: true },
      create: { userId, businessAccountId, vendorId, isFavorite: true },
    });
  }

  async unfollow(businessAccountId: string, vendorId: string) {
    return prisma.customerVendor.delete({
      where: { businessAccountId_vendorId: { businessAccountId, vendorId } },
    });
  }

  async checkServiceability(pincode: string) {
    const areas = await prisma.serviceArea.findMany({
      where: { pincode, isActive: true },
      select: { vendorId: true },
    });

    const vendorIds = Array.from(new Set(areas.map((a) => a.vendorId)));

    return { serviceable: vendorIds.length > 0, vendor_count: vendorIds.length, vendorIds };
  }
}
