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

type VendorTypeSelectionInput = Array<{ type: string; slug?: string; subTypes: string[] }>;

export async function listSupplierBusinesses(userId: string) {
  const memberships = await prisma.businessAccountMember.findMany({
    where: { userId, businessAccount: { isVendor: true, status: { not: 'deactivated' } } },
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
          vendorTypeSelections: true,
          businessSize: true,
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
              addressLine: true,
              city: true,
              state: true,
              addressPincode: true,
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
    vendorTypeSelections: m.businessAccount.vendorTypeSelections,
    businessSize: m.businessAccount.businessSize,
    stores: m.businessAccount.vendors.map((v) => ({
      id: v.id,
      name: storeDisplayName(v),
      slug: v.slug,
      isActive: v.isActive,
      isVerified: v.isVerified,
      isPrimaryStore: v.isPrimaryStore,
      logoUrl: v.logoUrl,
      addressLine: v.addressLine,
      city: v.city,
      state: v.state,
      pincode: v.addressPincode,
    })),
    storeCount: m.businessAccount.vendors.length,
  }));
}

/** Create BusinessAccount only — Online Stores are added separately via createOnlineStore. */
export async function createBusiness(
  userId: string,
  input: {
    legalName: string;
    displayName?: string;
    gstin?: string;
    vendorTypeSelections?: VendorTypeSelectionInput;
    businessSize?: string;
  },
) {
  const legalName = input.legalName.trim();
  if (legalName.length < 2) {
    throw Errors.fieldError('legalName', 'Legal business name is required');
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
        legalName,
        displayName: input.displayName?.trim() || legalName,
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

    return { businessAccountId: ba.id };
  });
}

/** @deprecated Prefer createBusiness + createOnlineStore. Kept for any legacy callers. */
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
    vendorTypeSelections?: VendorTypeSelectionInput;
    categoriesHandled?: string[];
    businessSize?: string;
    coverage?: string;
    warehouseCount?: number;
    deliveryFleet?: boolean;
    monthlySupplyBand?: string;
    vendorType?: string;
  },
) {
  const created = await createBusiness(userId, {
    legalName: input.legalName,
    displayName: input.displayName,
    gstin: input.gstin,
    vendorTypeSelections: input.vendorTypeSelections,
    businessSize: input.businessSize,
  });

  const store = await createOnlineStore(userId, created.businessAccountId, {
    storeName: input.storeName,
    storeDisplayName: input.storeDisplayName,
    addressLine: input.addressLine,
    city: input.city,
    state: input.state,
    pincode: input.pincode,
  });

  return {
    businessAccountId: created.businessAccountId,
    vendorId: store.vendorId,
    slug: store.slug,
  };
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

async function assertCanManageBusiness(userId: string, businessAccountId: string) {
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
    throw Errors.forbidden('Store-level roles cannot manage Business / Online Stores.');
  }
}

/**
 * Hard-delete an Online Store and related rows that lack FK Cascade.
 * Caller must already enforce order / last-store rules.
 */
async function purgeOnlineStoreInTx(
  tx: Prisma.TransactionClient,
  vendor: { id: string; businessAccountId: string; defaultOutletId: string | null; isPrimaryStore: boolean },
) {
  const vendorId = vendor.id;

  await tx.vendor.update({
    where: { id: vendorId },
    data: { defaultOutletId: null },
  });

  // Non-cascade children (order already verified empty)
  await tx.inventory.deleteMany({ where: { vendorId } });
  await tx.cartItem.deleteMany({ where: { vendorId } });
  await tx.priceSlab.deleteMany({ where: { vendorId } });
  await tx.collectionProduct.deleteMany({ where: { vendorId } });
  await tx.review.deleteMany({ where: { vendorId } });
  await tx.payment.deleteMany({ where: { vendorId } });
  await tx.quickOrderListItem.deleteMany({ where: { vendorId } });
  await tx.quickOrderList.deleteMany({ where: { vendorId } });
  await tx.creditTransaction.deleteMany({ where: { vendorId } });
  await tx.creditAccount.deleteMany({ where: { vendorId } });
  await tx.creditWallet.deleteMany({ where: { vendorId } });
  await tx.vendorTeamMember.deleteMany({ where: { vendorId } });
  await tx.vendorDocument.deleteMany({ where: { vendorId } });
  await tx.vendorCustomer.deleteMany({ where: { vendorId } });
  await tx.vendorCustomerPrice.deleteMany({ where: { vendorId } });
  await tx.vendorCustomerTask.deleteMany({ where: { vendorId } });
  await tx.customerVendor.deleteMany({ where: { vendorId } });
  await tx.vendorSettlement.deleteMany({ where: { vendorId } });
  await tx.promotion.deleteMany({ where: { vendorId } });
  await tx.coupon.deleteMany({ where: { vendorId } });
  await tx.cashbackCampaign.deleteMany({ where: { vendorId } });
  await tx.customerGroup.deleteMany({ where: { vendorId } });
  await tx.productCombo.deleteMany({ where: { vendorId } });
  await tx.salesperson.deleteMany({ where: { vendorId } });
  await tx.commissionRule.deleteMany({ where: { vendorId } });
  await tx.commissionAccrual.deleteMany({ where: { vendorId } });
  await tx.priceList.deleteMany({ where: { vendorId } });
  await tx.vendorClaim.deleteMany({ where: { vendorId } });
  await tx.picklist.deleteMany({ where: { vendorId } });
  await tx.dispatch.deleteMany({ where: { vendorId } });
  await tx.goodsReceipt.deleteMany({ where: { vendorId } });
  await tx.stockTransfer.deleteMany({ where: { vendorId } });
  await tx.brandAuthorizedDistributor.deleteMany({ where: { vendorId } });
  await tx.vendorWallet.deleteMany({ where: { vendorId } });

  // Products cascade many children; delete explicitly for clarity
  await tx.product.deleteMany({ where: { vendorId } });

  await tx.vendor.delete({ where: { id: vendorId } });

  if (vendor.defaultOutletId) {
    const outletId = vendor.defaultOutletId;
    const ba = await tx.businessAccount.findUnique({
      where: { id: vendor.businessAccountId },
      select: { primaryOutletId: true },
    });
    if (ba?.primaryOutletId === outletId) {
      await tx.businessAccount.update({
        where: { id: vendor.businessAccountId },
        data: { primaryOutletId: null },
      });
    }
    // Inventory already cleared; outlets may still be referenced — delete if unused
    await tx.outlet.delete({ where: { id: outletId } }).catch(() => undefined);
  }
}

export async function deleteOnlineStore(
  userId: string,
  vendorId: string,
  opts?: { allowLastStore?: boolean },
) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      id: true,
      userId: true,
      businessAccountId: true,
      defaultOutletId: true,
      isPrimaryStore: true,
    },
  });
  if (!vendor) throw Errors.notFound('Online Store');

  await assertCanManageBusiness(userId, vendor.businessAccountId);

  const orderCount = await prisma.order.count({ where: { vendorId } });
  if (orderCount > 0) {
    throw Errors.badRequest(
      'Cannot delete this Online Store because it has orders. Contact support if you need it removed.',
    );
  }

  const storeCount = await prisma.vendor.count({
    where: { businessAccountId: vendor.businessAccountId },
  });
  // Business may have zero stores — last-store delete is allowed when there are no orders
  void storeCount;
  void opts;

  return prisma.$transaction(async (tx) => {
    await purgeOnlineStoreInTx(tx, vendor);

    if (vendor.isPrimaryStore) {
      const next = await tx.vendor.findFirst({
        where: { businessAccountId: vendor.businessAccountId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (next) {
        await tx.vendor.update({
          where: { id: next.id },
          data: { isPrimaryStore: true },
        });
      }
    }

    return { deleted: true as const, vendorId };
  });
}

export async function deleteBusiness(userId: string, businessAccountId: string) {
  await assertCanManageBusiness(userId, businessAccountId);

  const stores = await prisma.vendor.findMany({
    where: { businessAccountId },
    select: {
      id: true,
      defaultOutletId: true,
      isPrimaryStore: true,
      businessAccountId: true,
    },
  });

  if (stores.length > 0) {
    const orderCount = await prisma.order.count({
      where: { vendorId: { in: stores.map((s) => s.id) } },
    });
    if (orderCount > 0) {
      throw Errors.badRequest(
        'Cannot delete this Business because one or more Online Stores have orders.',
      );
    }
  }

  // Also block if BA itself has customer orders (multi-actor BA)
  const baOrderCount = await prisma.order.count({ where: { businessAccountId } });
  if (baOrderCount > 0) {
    throw Errors.badRequest(
      'Cannot delete this Business because it has order history.',
    );
  }

  return prisma.$transaction(async (tx) => {
    for (const store of stores) {
      await purgeOnlineStoreInTx(tx, store);
    }

    await tx.userRole.deleteMany({ where: { businessAccountId } });
    await tx.businessAccountMember.deleteMany({ where: { businessAccountId } });

    const ba = await tx.businessAccount.findUnique({
      where: { id: businessAccountId },
      select: { primaryOutletId: true },
    });
    if (ba?.primaryOutletId) {
      await tx.businessAccount.update({
        where: { id: businessAccountId },
        data: { primaryOutletId: null },
      });
    }

    await tx.outlet.deleteMany({ where: { businessAccountId } });

    try {
      await tx.businessAccount.delete({ where: { id: businessAccountId } });
    } catch {
      // FK constraints from other domains — soft-deactivate instead
      await tx.businessAccount.update({
        where: { id: businessAccountId },
        data: { status: 'deactivated', isVendor: false },
      });
      return { deleted: true as const, businessAccountId, soft: true as const };
    }

    return { deleted: true as const, businessAccountId, soft: false as const };
  });
}

export async function updateBusiness(
  userId: string,
  businessAccountId: string,
  input: {
    legalName?: string;
    displayName?: string;
    gstin?: string;
    vendorTypeSelections?: VendorTypeSelectionInput;
    businessSize?: string | null;
  },
) {
  await assertCanManageBusiness(userId, businessAccountId);

  const typeSelections = input.vendorTypeSelections?.length
    ? (input.vendorTypeSelections as Prisma.InputJsonValue)
    : input.vendorTypeSelections !== undefined
      ? []
      : undefined;

  return prisma.businessAccount.update({
    where: { id: businessAccountId },
    data: {
      ...(input.legalName !== undefined ? { legalName: input.legalName.trim() } : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      ...(input.gstin !== undefined ? { gstin: input.gstin.trim() || null } : {}),
      ...(typeSelections !== undefined ? { vendorTypeSelections: typeSelections } : {}),
      ...(input.businessSize !== undefined
        ? { businessSize: input.businessSize?.trim() || null }
        : {}),
    },
    select: {
      id: true,
      legalName: true,
      displayName: true,
      gstin: true,
      vendorTypeSelections: true,
      businessSize: true,
    },
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
