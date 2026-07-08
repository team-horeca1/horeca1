/**
 * Irreversibly delete a user and owned rows. Mirrors the admin Users page
 * "delete permanently" path — used when removing invite-only team members.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { markSessionStale } from '@/lib/sessionStale';

async function deleteSoloBusinessAccounts(
  tx: Prisma.TransactionClient,
  soloAccountIds: string[],
): Promise<void> {
  for (const businessAccountId of soloAccountIds) {
    await tx.cart.deleteMany({ where: { businessAccountId } });
    await tx.quickOrderList.deleteMany({ where: { businessAccountId } });
    await tx.customerVendor.deleteMany({ where: { businessAccountId } });
    await tx.businessAccount.update({
      where: { id: businessAccountId },
      data: { primaryOutletId: null },
    });
    await tx.businessAccount.delete({ where: { id: businessAccountId } });
  }
}

export async function hardDeleteUserInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  vendorIds: string[],
): Promise<void> {
  const orderRows = await tx.order.findMany({
    where: { OR: [{ userId }, { vendorId: { in: vendorIds } }] },
    select: { id: true },
  });
  const orderIds = orderRows.map((o) => o.id);

  await tx.commissionAccrual.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { vendorId: { in: vendorIds } }] },
  });
  await tx.payment.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { vendorId: { in: vendorIds } }] },
  });
  await tx.returnRequest.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { customerId: userId }] },
  });
  await tx.creditTransaction.deleteMany({
    where: {
      OR: [
        { orderId: { in: orderIds } },
        { vendorId: { in: vendorIds } },
        { creditAccount: { userId } },
        { creditAccount: { vendorId: { in: vendorIds } } },
      ],
    },
  });

  await tx.order.deleteMany({
    where: { OR: [{ userId }, { vendorId: { in: vendorIds } }] },
  });

  await tx.cartItem.deleteMany({
    where: { OR: [{ vendorId: { in: vendorIds } }, { cart: { userId } }] },
  });
  await tx.quickOrderListItem.deleteMany({
    where: { OR: [{ vendorId: { in: vendorIds } }, { list: { userId } }] },
  });
  await tx.quickOrderList.deleteMany({
    where: { OR: [{ vendorId: { in: vendorIds } }, { userId }] },
  });

  if (vendorIds.length > 0) {
    await tx.product.deleteMany({ where: { vendorId: { in: vendorIds } } });
  }

  await tx.notification.deleteMany({ where: { userId } });
  await tx.cart.deleteMany({ where: { userId } });
  await tx.walletTransaction.deleteMany({ where: { wallet: { userId } } }).catch(() => {});
  await tx.wallet.deleteMany({ where: { userId } }).catch(() => {});
  await tx.cashbackEntry.deleteMany({ where: { userId } });
  await tx.creditWallet.deleteMany({
    where: { OR: [{ userId }, { vendorId: { in: vendorIds } }] },
  });
  await tx.creditAccount.deleteMany({
    where: { OR: [{ userId }, { vendorId: { in: vendorIds } }] },
  });
  await tx.customerVendor.deleteMany({
    where: { OR: [{ userId }, { vendorId: { in: vendorIds } }] },
  }).catch(() => {});
  await tx.vendorCustomer.deleteMany({
    where: { OR: [{ userId }, { vendorId: { in: vendorIds } }] },
  }).catch(() => {});

  await tx.adminTeamMember.deleteMany({ where: { userId } });
  await tx.vendorTeamMember.deleteMany({ where: { userId } }).catch(() => {});
  await tx.brandTeamMember.deleteMany({ where: { userId } }).catch(() => {});

  const memberships = await tx.businessAccountMember.findMany({
    where: { userId },
    select: { businessAccountId: true },
  });
  const soloAccountIds: string[] = [];
  for (const { businessAccountId } of memberships) {
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

  if (vendorIds.length > 0) {
    await tx.vendorDocument.deleteMany({ where: { vendorId: { in: vendorIds } } }).catch(() => {});
    await tx.vendorSettlement.deleteMany({ where: { vendorId: { in: vendorIds } } }).catch(() => {});
    await tx.vendorWalletTxn.deleteMany({ where: { wallet: { vendorId: { in: vendorIds } } } }).catch(() => {});
    await tx.vendorWallet.deleteMany({ where: { vendorId: { in: vendorIds } } }).catch(() => {});
    await tx.inventoryLog.deleteMany({ where: { vendorId: { in: vendorIds } } }).catch(() => {});
    await tx.vendor.deleteMany({ where: { id: { in: vendorIds } } });
  }

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
  });
}
