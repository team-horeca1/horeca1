/**
 * Irreversibly delete a user and owned rows. Mirrors the admin Users page
 * "delete permanently" path — used when removing invite-only team members.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { markSessionStale } from '@/lib/sessionStale';

/** Hard deletes touch many tables; default Prisma interactive tx timeout (5s) is too low over SSH tunnel. */
const HARD_DELETE_TX_OPTS = { maxWait: 15_000, timeout: 120_000 } as const;

async function deleteSoloBusinessAccounts(
  tx: Prisma.TransactionClient,
  soloAccountIds: string[],
): Promise<void> {
  for (const businessAccountId of soloAccountIds) {
    await deleteVendorBusinessAccountInTransaction(tx, businessAccountId);
  }
}

/** Delete all marketplace data scoped to a single vendor (not the owner user). */
async function hardDeleteVendorScopedDataInTransaction(
  tx: Prisma.TransactionClient,
  vendorId: string,
): Promise<void> {
  const orderRows = await tx.order.findMany({
    where: { vendorId },
    select: { id: true },
  });
  const orderIds = orderRows.map((o) => o.id);

  await tx.commissionAccrual.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { vendorId }] },
  });
  await tx.payment.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { vendorId }] },
  });
  await tx.returnRequest.deleteMany({ where: { orderId: { in: orderIds } } });
  await tx.creditTransaction.deleteMany({
    where: {
      OR: [
        { orderId: { in: orderIds } },
        { vendorId },
        { creditAccount: { vendorId } },
      ],
    },
  });
  await tx.order.deleteMany({ where: { vendorId } });

  await tx.cartItem.deleteMany({ where: { vendorId } });
  await tx.quickOrderListItem.deleteMany({ where: { vendorId } });
  await tx.quickOrderList.deleteMany({ where: { vendorId } });

  await tx.product.deleteMany({ where: { vendorId } });

  await tx.creditWallet.deleteMany({ where: { vendorId } });
  await tx.creditAccount.deleteMany({ where: { vendorId } });
  await tx.customerVendor.deleteMany({ where: { vendorId } }).catch(() => {});
  await tx.vendorCustomer.deleteMany({ where: { vendorId } }).catch(() => {});

  await tx.vendorDocument.deleteMany({ where: { vendorId } }).catch(() => {});
  await tx.vendorSettlement.deleteMany({ where: { vendorId } }).catch(() => {});
  await tx.vendorWalletTxn.deleteMany({ where: { wallet: { vendorId } } }).catch(() => {});
  await tx.vendorWallet.deleteMany({ where: { vendorId } }).catch(() => {});
  await tx.inventoryLog.deleteMany({ where: { vendorId } }).catch(() => {});
  await tx.serviceArea.deleteMany({ where: { vendorId } }).catch(() => {});
  await tx.deliverySlot.deleteMany({ where: { vendorId } }).catch(() => {});
}

async function deleteVendorBusinessAccountInTransaction(
  tx: Prisma.TransactionClient,
  businessAccountId: string,
): Promise<void> {
  await tx.cart.deleteMany({ where: { businessAccountId } });
  await tx.quickOrderList.deleteMany({ where: { businessAccountId } });
  await tx.customerVendor.deleteMany({ where: { businessAccountId } });
  await tx.userRole.deleteMany({ where: { businessAccountId } });
  await tx.businessAccountMember.deleteMany({ where: { businessAccountId } });

  const outlets = await tx.outlet.findMany({
    where: { businessAccountId },
    select: { id: true },
  });
  const outletIds = outlets.map((o) => o.id);
  if (outletIds.length > 0) {
    await tx.stockTransfer.deleteMany({
      where: {
        OR: [
          { fromOutletId: { in: outletIds } },
          { toOutletId: { in: outletIds } },
        ],
      },
    });
    await tx.savedAddress.deleteMany({ where: { outletId: { in: outletIds } } }).catch(() => {});
    await tx.outlet.deleteMany({ where: { id: { in: outletIds } } });
  }

  await tx.businessAccount.update({
    where: { id: businessAccountId },
    data: { primaryOutletId: null },
  });
  await tx.businessAccount.delete({ where: { id: businessAccountId } });
}

async function deleteOwnedVendorsInTransaction(
  tx: Prisma.TransactionClient,
  vendorIds: string[],
): Promise<Set<string>> {
  const deletedBusinessAccountIds = new Set<string>();
  if (vendorIds.length === 0) return deletedBusinessAccountIds;

  const vendors = await tx.vendor.findMany({
    where: { id: { in: vendorIds } },
    select: { id: true, businessAccountId: true },
  });

  for (const vendor of vendors) {
    await tx.vendorTeamMember.deleteMany({ where: { vendorId: vendor.id } });
    await hardDeleteVendorScopedDataInTransaction(tx, vendor.id);
    await tx.vendor.delete({ where: { id: vendor.id } });
    await deleteVendorBusinessAccountInTransaction(tx, vendor.businessAccountId);
    deletedBusinessAccountIds.add(vendor.businessAccountId);
  }

  return deletedBusinessAccountIds;
}

export async function hardDeleteUserInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  vendorIds: string[],
): Promise<void> {
  const deletedVendorBaIds = await deleteOwnedVendorsInTransaction(tx, vendorIds);

  const orderRows = await tx.order.findMany({
    where: { userId },
    select: { id: true },
  });
  const orderIds = orderRows.map((o) => o.id);

  await tx.commissionAccrual.deleteMany({ where: { orderId: { in: orderIds } } });
  await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await tx.returnRequest.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { customerId: userId }] },
  });
  await tx.creditTransaction.deleteMany({
    where: {
      OR: [
        { orderId: { in: orderIds } },
        { creditAccount: { userId } },
      ],
    },
  });
  await tx.order.deleteMany({ where: { userId } });

  await tx.cartItem.deleteMany({ where: { cart: { userId } } });
  await tx.quickOrderListItem.deleteMany({ where: { list: { userId } } });
  await tx.quickOrderList.deleteMany({ where: { userId } });

  await tx.notification.deleteMany({ where: { userId } });
  await tx.cart.deleteMany({ where: { userId } });
  await tx.walletTransaction.deleteMany({ where: { wallet: { userId } } }).catch(() => {});
  await tx.wallet.deleteMany({ where: { userId } }).catch(() => {});
  await tx.cashbackEntry.deleteMany({ where: { userId } });
  await tx.creditWallet.deleteMany({ where: { userId } });
  await tx.creditAccount.deleteMany({ where: { userId } });
  await tx.customerVendor.deleteMany({ where: { userId } }).catch(() => {});
  await tx.vendorCustomer.deleteMany({ where: { userId } }).catch(() => {});

  await tx.adminTeamMember.deleteMany({ where: { userId } });
  await tx.vendorTeamMember.deleteMany({ where: { userId } }).catch(() => {});
  await tx.brandTeamMember.deleteMany({ where: { userId } }).catch(() => {});

  const memberships = await tx.businessAccountMember.findMany({
    where: { userId },
    select: { businessAccountId: true },
  });
  const soloAccountIds: string[] = [];
  for (const { businessAccountId } of memberships) {
    if (deletedVendorBaIds.has(businessAccountId)) continue;
    const memberCount = await tx.businessAccountMember.count({
      where: { businessAccountId },
    });
    if (memberCount === 1) soloAccountIds.push(businessAccountId);
  }

  await tx.userRole.deleteMany({ where: { userId } });
  await tx.businessAccountMember.deleteMany({ where: { userId } });
  await deleteSoloBusinessAccounts(tx, soloAccountIds);

  await tx.vendorTeamMember.updateMany({ where: { invitedBy: userId }, data: { invitedBy: null } }).catch(() => {});
  await tx.brandTeamMember.updateMany({ where: { invitedBy: userId }, data: { invitedBy: null } }).catch(() => {});
  await tx.adminTeamMember.updateMany({ where: { invitedBy: userId }, data: { invitedBy: null } }).catch(() => {});
  await tx.businessAccountMember.updateMany({ where: { invitedBy: userId }, data: { invitedBy: null } }).catch(() => {});

  await tx.linkedAccount.deleteMany({ where: { OR: [{ userId }, { linkedUserId: userId }] } });
  await tx.savedAddress.deleteMany({ where: { userId } });
  await tx.pushSubscription.deleteMany({ where: { userId } });
  await tx.session.deleteMany({ where: { userId } });
  await tx.account.deleteMany({ where: { userId } });

  await tx.productAuditLog.deleteMany({ where: { changedBy: userId } }).catch(() => {});
  await tx.masterProductRevision.deleteMany({ where: { createdBy: userId } }).catch(() => {});

  await tx.brand.deleteMany({ where: { userId } }).catch(() => {});

  await tx.user.delete({ where: { id: userId } });
}

/**
 * Preserve the user when they have real marketplace history (orders placed or
 * they own a vendor/brand). Invite-only team accounts with no orders are wiped.
 */
export async function userHasMarketplaceFootprint(userId: string): Promise<boolean> {
  const u = await prisma.user.findFirst({
    where: { id: userId },
    select: {
      _count: { select: { orders: true, vendors: true, brands: true } },
    },
  });
  if (!u) return false;
  return u._count.orders > 0 || u._count.vendors > 0 || u._count.brands > 0;
}

/** Any remaining portal / business-account membership after a team row is removed. */
export async function userHasAnyTeamOrAccountAccess(userId: string): Promise<boolean> {
  const [admin, vendorCount, brandCount, accountCount] = await Promise.all([
    prisma.adminTeamMember.findUnique({ where: { userId }, select: { id: true } }),
    prisma.vendorTeamMember.count({ where: { userId } }),
    prisma.brandTeamMember.count({ where: { userId } }),
    prisma.businessAccountMember.count({ where: { userId } }),
  ]);
  return !!admin || vendorCount > 0 || brandCount > 0 || accountCount > 0;
}

/** Hard-delete invite-only users; keep users with orders or remaining memberships. */
export async function shouldHardDeleteUserAfterTeamRemoval(userId: string): Promise<boolean> {
  if (await userHasMarketplaceFootprint(userId)) return false;
  if (await userHasAnyTeamOrAccountAccess(userId)) return false;
  return true;
}

export interface TeamRemovalResult {
  hardDeleted: boolean;
  preserved: boolean;
}

/**
 * Call after the team-membership row (and scoped UserRoles) are already removed.
 * Wipes invite-only users; otherwise invalidates their session and optionally
 * demotes ex-admin staff back to customer.
 */
export async function finalizeTeamMemberRemoval(
  userId: string,
  opts?: { demoteFromAdmin?: boolean },
): Promise<TeamRemovalResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user) return { hardDeleted: true, preserved: false };

  if (await shouldHardDeleteUserAfterTeamRemoval(userId)) {
    await hardDeleteUserById(userId);
    return { hardDeleted: true, preserved: false };
  }

  if (opts?.demoteFromAdmin && user.role === 'admin') {
    await prisma.user.update({ where: { id: userId }, data: { role: 'customer' } });
  }
  await markSessionStale(userId);
  return { hardDeleted: false, preserved: true };
}

export async function hardDeleteUserById(userId: string): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { vendors: { select: { id: true } } },
  });
  if (!existing) return;
  const vendorIds = existing.vendors.map((v) => v.id);
  await prisma.$transaction(async (tx) => {
    await hardDeleteUserInTransaction(tx, userId, vendorIds);
  }, HARD_DELETE_TX_OPTS);
}

export interface HardDeleteVendorResult {
  ownerUserId: string;
  ownerHardDeleted: boolean;
  businessName: string;
}

/**
 * Permanently remove a vendor and its scoped data. The owner user is hard-deleted
 * when they have no marketplace footprint; otherwise they are kept and demoted.
 */
export async function hardDeleteVendorById(vendorId: string): Promise<HardDeleteVendorResult> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, userId: true, businessAccountId: true, businessName: true },
  });
  if (!vendor) {
    throw new Error('Vendor not found');
  }

  const ownerUserId = vendor.userId;

  await prisma.$transaction(async (tx) => {
    await tx.vendorTeamMember.deleteMany({ where: { vendorId } });
    await hardDeleteVendorScopedDataInTransaction(tx, vendorId);
    await tx.vendor.delete({ where: { id: vendorId } });
    await deleteVendorBusinessAccountInTransaction(tx, vendor.businessAccountId);
  }, HARD_DELETE_TX_OPTS);

  const removal = await finalizeTeamMemberRemoval(ownerUserId);

  if (removal.preserved) {
    const [vendorCount, brandCount] = await Promise.all([
      prisma.vendor.count({ where: { userId: ownerUserId } }),
      prisma.brand.count({ where: { userId: ownerUserId } }),
    ]);
    if (vendorCount === 0 && brandCount === 0) {
      const user = await prisma.user.findUnique({
        where: { id: ownerUserId },
        select: { role: true },
      });
      if (user?.role === 'vendor') {
        await prisma.user.update({ where: { id: ownerUserId }, data: { role: 'customer' } });
      }
    }
    await markSessionStale(ownerUserId);
  }

  return {
    ownerUserId,
    ownerHardDeleted: removal.hardDeleted,
    businessName: vendor.businessName,
  };
}
