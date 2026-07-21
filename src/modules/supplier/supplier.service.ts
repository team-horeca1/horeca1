/**
 * Supplier Business + Online Store CRUD (Section 1 Foundation).
 */

import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import {
  cascadeBusinessTeamToStore,
  ensureDefaultOutletForStore,
  storeDisplayName,
} from '@/modules/supplier/foundation.service';
import type { OrderStatus, PaymentState, Prisma } from '@prisma/client';

function slugify(name: string, salt: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${base || 'store'}-${salt.slice(0, 8)}`;
}

export async function listSupplierBusinesses(userId: string) {
  const memberships = await prisma.businessAccountMember.findMany({
    where: { userId, businessAccount: { isVendor: true } },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: {
      isPrimary: true,
      businessAccount: {
        select: {
          id: true,
          legalName: true,
          displayName: true,
          gstin: true,
          status: true,
          vendors: {
            orderBy: [{ isPrimaryStore: 'desc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              businessName: true,
              displayName: true,
              slug: true,
              isActive: true,
              isVerified: true,
              isPrimaryStore: true,
              logoUrl: true,
            },
          },
        },
      },
    },
  });

  return memberships.map((m) => ({
    id: m.businessAccount.id,
    legalName: m.businessAccount.legalName,
    displayName: m.businessAccount.displayName,
    gstin: m.businessAccount.gstin,
    status: m.businessAccount.status,
    isPrimary: m.isPrimary,
    stores: m.businessAccount.vendors.map((v) => ({
      id: v.id,
      name: storeDisplayName(v),
      slug: v.slug,
      isActive: v.isActive,
      isVerified: v.isVerified,
      isPrimaryStore: v.isPrimaryStore,
      logoUrl: v.logoUrl,
    })),
    storeCount: m.businessAccount.vendors.length,
  }));
}

export async function createBusinessWithStore(
  userId: string,
  input: {
    legalName: string;
    displayName?: string;
    gstin?: string;
    storeName: string;
    storeDisplayName?: string;
    addressLine?: string;
    city?: string;
    state?: string;
    pincode?: string;
    vendorTypeSelections?: Array<{ type: string; slug?: string; subTypes: string[] }>;
    categoriesHandled?: string[];
    businessSize?: string;
    coverage?: string;
    warehouseCount?: number;
    deliveryFleet?: boolean;
    monthlySupplyBand?: string;
    vendorType?: string;
  },
) {
  const storeName = input.storeName.trim();
  if (!storeName) throw Errors.fieldError('storeName', 'Online Store name is required');

  const slug = slugify(storeName, userId);
  const slugTaken = await prisma.vendor.findUnique({ where: { slug }, select: { id: true } });
  if (slugTaken) {
    throw Errors.fieldError('storeName', 'An Online Store with a similar name already exists. Try a different name.', 409);
  }

  const vendorAdminTemplate = await prisma.accountRole.findFirst({
    where: { businessAccountId: null, isTemplate: true, name: 'Vendor Admin', scope: 'vendor' },
    select: { id: true },
  });

  const typeSelections = input.vendorTypeSelections?.length
    ? (input.vendorTypeSelections as Prisma.InputJsonValue)
    : undefined;

  return prisma.$transaction(async (tx) => {
    const ba = await tx.businessAccount.create({
      data: {
        legalName: input.legalName.trim(),
        displayName: input.displayName?.trim() || input.legalName.trim(),
        gstin: input.gstin?.trim() || null,
        isCustomer: true,
        isVendor: true,
        isBrand: false,
        status: 'active',
        businessType: 'vendor',
        vendorTypeSelections: typeSelections,
        businessSize: input.businessSize?.trim() || null,
      },
    });

    await tx.businessAccountMember.create({
      data: { userId, businessAccountId: ba.id, isPrimary: false, acceptedAt: new Date() },
    });

    if (vendorAdminTemplate) {
      await tx.userRole.create({
        data: {
          userId,
          businessAccountId: ba.id,
          outletId: null,
          vendorId: null,
          roleId: vendorAdminTemplate.id,
        },
      });
    }

    const vendor = await tx.vendor.create({
      data: {
        userId,
        businessAccountId: ba.id,
        businessName: storeName,
        displayName: input.storeDisplayName?.trim() || storeName,
        slug,
        isPrimaryStore: true,
        isActive: false,
        isVerified: false,
        multiWarehouseEnabled: false,
        addressLine: input.addressLine ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        addressPincode: input.pincode ?? null,
        setupProgress: { business: true, online_store: true },
        vendorType: input.vendorType?.trim() || null,
        vendorTypeSelections: typeSelections,
        categoriesHandled: input.categoriesHandled ?? [],
        businessSize: input.businessSize?.trim() || null,
        coverage: input.coverage?.trim() || null,
        warehouseCount: input.warehouseCount ?? null,
        deliveryFleet: input.deliveryFleet ?? null,
        monthlySupplyBand: input.monthlySupplyBand?.trim() || null,
      },
    });

    await ensureDefaultOutletForStore(tx, {
      businessAccountId: ba.id,
      vendorId: vendor.id,
      name: storeName,
      addressLine: input.addressLine,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
    });

    return { businessAccountId: ba.id, vendorId: vendor.id, slug: vendor.slug };
  });
}

export async function createOnlineStore(
  userId: string,
  businessAccountId: string,
  input: {
    storeName: string;
    storeDisplayName?: string;
    addressLine?: string;
    city?: string;
    state?: string;
    pincode?: string;
    // Store KYC (register wizard steps 3–7)
    authorizedPersonName?: string;
    authorizedPersonPhone?: string;
    authorizedPersonEmail?: string;
    gstNumber?: string;
    panNumber?: string;
    fssaiNumber?: string;
    udyamNumber?: string;
    cinNumber?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    bankIfsc?: string;
    bankName?: string;
    bankAccountType?: string;
    pickupAddressLine?: string;
    pickupCity?: string;
    pickupState?: string;
    pickupPincode?: string;
    deliveryCapability?: string;
    serviceablePincodes?: string[];
  },
) {
  const membership = await prisma.businessAccountMember.findUnique({
    where: { userId_businessAccountId: { userId, businessAccountId } },
    select: { id: true },
  });
  if (!membership) throw Errors.forbidden('You are not a member of this Business');

  const ba = await prisma.businessAccount.findUnique({
    where: { id: businessAccountId },
    select: { isVendor: true },
  });
  if (!ba?.isVendor) throw Errors.badRequest('Business is not a supplier Business');

  // Store-only staff cannot create stores
  const businessWide = await prisma.userRole.findFirst({
    where: {
      userId,
      businessAccountId,
      vendorId: null,
      role: { name: { not: { startsWith: 'Storefront' } } },
    },
    select: { id: true },
  });
  const ownsStore = await prisma.vendor.findFirst({
    where: { userId, businessAccountId },
    select: { id: true },
  });
  if (!businessWide && !ownsStore) {
    throw Errors.forbidden('Store-level roles cannot create Online Stores. Ask a Business Admin.');
  }

  const storeName = input.storeName.trim();
  if (!storeName) throw Errors.fieldError('storeName', 'Online Store name is required');

  const slug = slugify(storeName, `${userId}-${Date.now().toString(36)}`);
  const slugTaken = await prisma.vendor.findUnique({ where: { slug }, select: { id: true } });
  if (slugTaken) {
    throw Errors.fieldError('storeName', 'An Online Store with a similar name already exists.', 409);
  }

  const existingCount = await prisma.vendor.count({ where: { businessAccountId } });
  const uniquePincodes = Array.from(
    new Set((input.serviceablePincodes ?? []).map((p) => p.trim()).filter(Boolean)),
  );

  return prisma.$transaction(async (tx) => {
    const vendor = await tx.vendor.create({
      data: {
        userId,
        businessAccountId,
        businessName: storeName,
        displayName: input.storeDisplayName?.trim() || storeName,
        tradeName: input.storeDisplayName?.trim() || storeName,
        slug,
        isPrimaryStore: existingCount === 0,
        isActive: false,
        isVerified: false,
        multiWarehouseEnabled: false,
        addressLine: input.addressLine ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        addressPincode: input.pincode ?? null,
        pickupAddressLine: input.pickupAddressLine ?? null,
        pickupCity: input.pickupCity ?? null,
        pickupState: input.pickupState ?? null,
        pickupPincode: input.pickupPincode ?? null,
        authorizedPersonName: input.authorizedPersonName?.trim() || null,
        authorizedPersonPhone: input.authorizedPersonPhone?.replace(/\D/g, '').slice(-10) || null,
        authorizedPersonEmail: input.authorizedPersonEmail?.trim().toLowerCase() || null,
        gstNumber: input.gstNumber?.trim().toUpperCase() || null,
        panNumber: input.panNumber?.trim().toUpperCase() || null,
        fssaiNumber: input.fssaiNumber?.trim() || null,
        udyamNumber: input.udyamNumber?.trim() || null,
        cinNumber: input.cinNumber?.trim() || null,
        bankAccountName: input.bankAccountName?.trim() || null,
        bankAccountNumber: input.bankAccountNumber?.trim() || null,
        bankIfsc: input.bankIfsc?.trim().toUpperCase() || null,
        bankName: input.bankName?.trim() || null,
        bankAccountType: input.bankAccountType?.trim() || null,
        deliveryCapability: input.deliveryCapability?.trim() || null,
        setupProgress: { business: true, online_store: true },
      },
    });

    const outletId = await ensureDefaultOutletForStore(tx, {
      businessAccountId,
      vendorId: vendor.id,
      name: storeName,
      addressLine: input.pickupAddressLine || input.addressLine,
      city: input.pickupCity || input.city,
      state: input.pickupState || input.state,
      pincode: input.pickupPincode || input.pincode,
    });

    if (uniquePincodes.length > 0) {
      await tx.serviceArea.createMany({
        data: uniquePincodes.map((pincode) => ({
          vendorId: vendor.id,
          outletId,
          pincode,
          isActive: true,
        })),
        skipDuplicates: true,
      });
    }

    await cascadeBusinessTeamToStore(businessAccountId, vendor.id, tx);

    return { vendorId: vendor.id, slug: vendor.slug, businessAccountId };
  });
}

export async function updateOnlineStore(
  userId: string,
  vendorId: string,
  input: {
    storeName?: string;
    storeDisplayName?: string;
    addressLine?: string;
    city?: string;
    state?: string;
    pincode?: string;
    isActive?: boolean;
  },
) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      id: true,
      userId: true,
      businessAccountId: true,
      defaultOutletId: true,
      isPrimaryStore: true,
      isVerified: true,
    },
  });
  if (!vendor) throw Errors.notFound('Online Store');

  const membership = await prisma.businessAccountMember.findUnique({
    where: {
      userId_businessAccountId: { userId, businessAccountId: vendor.businessAccountId },
    },
    select: { id: true },
  });
  if (!membership && vendor.userId !== userId) {
    throw Errors.forbidden('You cannot edit this Online Store');
  }

  if (input.isActive === true && !vendor.isVerified) {
    throw Errors.forbidden(
      'This Online Store must be approved by a super-admin before it can go live.',
    );
  }

  if (input.isActive === false) {
    const otherActive = await prisma.vendor.count({
      where: {
        businessAccountId: vendor.businessAccountId,
        id: { not: vendorId },
        isActive: true,
      },
    });
    // Disabling is allowed even if last store — Business just becomes non-operational
    void otherActive;
  }

  const data: Prisma.VendorUpdateInput = {
    multiWarehouseEnabled: false,
  };
  if (input.storeName !== undefined) data.businessName = input.storeName.trim();
  if (input.storeDisplayName !== undefined) data.displayName = input.storeDisplayName.trim();
  if (input.addressLine !== undefined) data.addressLine = input.addressLine;
  if (input.city !== undefined) data.city = input.city;
  if (input.state !== undefined) data.state = input.state;
  if (input.pincode !== undefined) data.addressPincode = input.pincode;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const updated = await prisma.vendor.update({
    where: { id: vendorId },
    data,
    select: {
      id: true,
      businessName: true,
      displayName: true,
      isActive: true,
      defaultOutletId: true,
    },
  });

  if (vendor.defaultOutletId && (input.addressLine || input.city || input.state || input.pincode || input.storeName)) {
    await prisma.outlet.update({
      where: { id: vendor.defaultOutletId },
      data: {
        ...(input.storeName ? { name: input.storeName.trim().slice(0, 255) } : {}),
        ...(input.addressLine !== undefined ? { addressLine: input.addressLine || 'Address pending' } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.pincode !== undefined ? { pincode: input.pincode } : {}),
      },
    }).catch(() => undefined);
  }

  return updated;
}

export async function updateBusiness(
  userId: string,
  businessAccountId: string,
  input: { legalName?: string; displayName?: string; gstin?: string },
) {
  const membership = await prisma.businessAccountMember.findUnique({
    where: { userId_businessAccountId: { userId, businessAccountId } },
    select: { id: true },
  });
  if (!membership) throw Errors.forbidden('You are not a member of this Business');

  const businessWide = await prisma.userRole.findFirst({
    where: {
      userId,
      businessAccountId,
      vendorId: null,
      role: { name: { not: { startsWith: 'Storefront' } } },
    },
    select: { id: true },
  });
  if (!businessWide) {
    throw Errors.forbidden('Store-level roles cannot edit Business details.');
  }

  return prisma.businessAccount.update({
    where: { id: businessAccountId },
    data: {
      ...(input.legalName !== undefined ? { legalName: input.legalName.trim() } : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      ...(input.gstin !== undefined ? { gstin: input.gstin.trim() || null } : {}),
    },
    select: { id: true, legalName: true, displayName: true, gstin: true },
  });
}

const ACTIVE_ORDER_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered'] as const;

/** All Online Store IDs owned under this supplier's vendor businesses. */
export async function listSupplierStoreIds(userId: string): Promise<string[]> {
  const businesses = await listSupplierBusinesses(userId);
  return businesses.flatMap((b) => b.stores.map((s) => s.id));
}

function istDayAndMonthBounds() {
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const todayStartIST = new Date(nowIST);
  todayStartIST.setUTCHours(0, 0, 0, 0);
  todayStartIST.setTime(todayStartIST.getTime() - 5.5 * 60 * 60 * 1000);

  const monthStartIST = new Date(nowIST);
  monthStartIST.setUTCDate(1);
  monthStartIST.setUTCHours(0, 0, 0, 0);
  monthStartIST.setTime(monthStartIST.getTime() - 5.5 * 60 * 60 * 1000);

  return { todayStartIST, monthStartIST };
}

/** Aggregate KPIs across all supplier Online Stores. */
export async function getSupplierDashboard(userId: string) {
  const businesses = await listSupplierBusinesses(userId);
  const storeIds = businesses.flatMap((b) => b.stores.map((s) => s.id));
  const businessCount = businesses.length;
  const storeCount = storeIds.length;
  const activeStoreCount = businesses.reduce(
    (n, b) => n + b.stores.filter((s) => s.isActive).length,
    0,
  );

  if (storeIds.length === 0) {
    return {
      businessCount,
      storeCount,
      activeStoreCount,
      totalOrders: 0,
      totalRevenue: 0,
      todaySales: 0,
      mtdSales: 0,
      ordersByStatus: {} as Record<string, number>,
    };
  }

  const orderScope = { vendorId: { in: storeIds } };
  const { todayStartIST, monthStartIST } = istDayAndMonthBounds();

  const [totalOrders, revenueResult, todaySalesResult, mtdSalesResult, ordersByStatusRaw] =
    await Promise.all([
      prisma.order.count({
        where: { ...orderScope, status: { not: 'draft' } },
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { ...orderScope, status: { in: [...ACTIVE_ORDER_STATUSES] } },
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
          ...orderScope,
          status: { in: [...ACTIVE_ORDER_STATUSES] },
          createdAt: { gte: todayStartIST },
        },
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
          ...orderScope,
          status: { in: [...ACTIVE_ORDER_STATUSES] },
          createdAt: { gte: monthStartIST },
        },
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: { ...orderScope, status: { not: 'draft' } },
        _count: { _all: true },
      }),
    ]);

  const ordersByStatus: Record<string, number> = {};
  for (const row of ordersByStatusRaw) {
    ordersByStatus[row.status] = row._count._all;
  }

  return {
    businessCount,
    storeCount,
    activeStoreCount,
    totalOrders,
    totalRevenue: Number(revenueResult._sum.totalAmount ?? 0),
    todaySales: Number(todaySalesResult._sum.totalAmount ?? 0),
    mtdSales: Number(mtdSalesResult._sum.totalAmount ?? 0),
    ordersByStatus,
  };
}

export async function listSupplierOrders(
  userId: string,
  options: {
    status?: string;
    search?: string;
    cursor?: string;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
    paymentStatus?: string;
  },
) {
  const storeIds = await listSupplierStoreIds(userId);
  const limit = Math.min(options.limit ?? 20, 50);

  if (storeIds.length === 0) {
    return { orders: [], nextCursor: null as string | null, hasMore: false };
  }

  const where: Prisma.OrderWhereInput = {
    vendorId: { in: storeIds },
    status: options.status && options.status !== 'draft'
      ? (options.status as OrderStatus)
      : { not: 'draft' },
  };

  if (options.search) {
    where.OR = [
      { orderNumber: { contains: options.search, mode: 'insensitive' } },
      { user: { fullName: { contains: options.search, mode: 'insensitive' } } },
      { user: { phone: { contains: options.search, mode: 'insensitive' } } },
    ];
  }
  if (options.dateFrom || options.dateTo) {
    where.createdAt = {
      ...(options.dateFrom ? { gte: new Date(options.dateFrom) } : {}),
      ...(options.dateTo ? { lte: new Date(`${options.dateTo}T23:59:59Z`) } : {}),
    };
  }
  if (options.paymentStatus) {
    where.paymentStatus = options.paymentStatus as PaymentState;
  }

  const orders = await prisma.order.findMany({
    where,
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalAmount: true,
      paymentStatus: true,
      createdAt: true,
      vendorId: true,
      vendor: {
        select: {
          id: true,
          businessName: true,
          displayName: true,
          businessAccount: {
            select: { id: true, legalName: true, displayName: true },
          },
        },
      },
      user: {
        select: { fullName: true, email: true, businessName: true },
      },
      _count: { select: { items: true } },
    },
  });

  const hasMore = orders.length > limit;
  if (hasMore) orders.pop();
  const nextCursor = hasMore ? orders[orders.length - 1].id : null;

  return {
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      totalAmount: o.totalAmount,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt,
      vendorId: o.vendorId,
      storeName: o.vendor.displayName ?? o.vendor.businessName,
      businessName:
        o.vendor.businessAccount.displayName
        ?? o.vendor.businessAccount.legalName,
      customerName:
        o.user.businessName?.trim()
        || o.user.fullName
        || o.user.email
        || 'Customer',
      itemCount: o._count.items,
    })),
    nextCursor,
    hasMore,
  };
}
