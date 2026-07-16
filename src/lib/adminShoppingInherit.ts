/**
 * Admin team members inherit the inviter's (or platform owner's) shopping
 * BusinessAccount so storefront "Deliver to" uses the owner's outlet — not an
 * empty personal placeholder created at login.
 */
import { prisma } from '@/lib/prisma';
import { hasUsableDeliveryLocation } from '@/lib/addressUsability';
import { upsertTeamAccountMembership } from '@/lib/teamMembership';
import { PLACEHOLDER_OUTLET_ADDRESS } from '@/lib/constants/customerProfile';

async function findUsableShoppingAccountId(userId: string): Promise<string | null> {
  const memberships = await prisma.businessAccountMember.findMany({
    where: { userId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: {
      businessAccountId: true,
      businessAccount: {
        select: {
          isCustomer: true,
          outlets: {
            where: { isActive: true },
            select: { pincode: true, latitude: true, longitude: true },
          },
        },
      },
    },
  });

  for (const m of memberships) {
    if (!m.businessAccount.isCustomer) continue;
    if (m.businessAccount.outlets.some((o) => hasUsableDeliveryLocation(o))) {
      return m.businessAccountId;
    }
  }
  return null;
}

async function findPlatformOwnerShoppingAccountId(): Promise<string | null> {
  // Seeded platform owner: role=admin with no AdminTeamMember row.
  const owners = await prisma.user.findMany({
    where: { role: 'admin', isActive: true, adminMembership: { is: null } },
    select: { id: true },
    take: 5,
  });
  for (const o of owners) {
    const baId = await findUsableShoppingAccountId(o.id);
    if (baId) return baId;
  }
  return null;
}

async function userHasUsableShoppingOutlet(userId: string): Promise<boolean> {
  return (await findUsableShoppingAccountId(userId)) !== null;
}

/**
 * Ensure an admin team member is on a shopping BA with a real delivery outlet.
 * Returns true when membership was created/updated (caller should refresh session).
 */
export async function ensureAdminInheritsShoppingAccount(args: {
  memberUserId: string;
  invitedByUserId?: string | null;
}): Promise<boolean> {
  const { memberUserId, invitedByUserId } = args;

  if (await userHasUsableShoppingOutlet(memberUserId)) {
    return false;
  }

  let targetBaId: string | null = null;
  if (invitedByUserId) {
    targetBaId = await findUsableShoppingAccountId(invitedByUserId);
  }
  if (!targetBaId) {
    const member = await prisma.adminTeamMember.findUnique({
      where: { userId: memberUserId },
      select: { invitedBy: true },
    });
    if (member?.invitedBy) {
      targetBaId = await findUsableShoppingAccountId(member.invitedBy);
    }
  }
  if (!targetBaId) {
    targetBaId = await findPlatformOwnerShoppingAccountId();
  }
  if (!targetBaId) return false;

  const ownerRole = await prisma.accountRole.findFirst({
    where: {
      name: 'Owner',
      scope: 'account',
      isTemplate: true,
      businessAccountId: null,
    },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await upsertTeamAccountMembership(tx, {
      userId: memberUserId,
      businessAccountId: targetBaId!,
      invitedBy: invitedByUserId ?? memberUserId,
    });

    if (ownerRole) {
      const existing = await tx.userRole.findFirst({
        where: {
          userId: memberUserId,
          businessAccountId: targetBaId!,
          outletId: null,
          roleId: ownerRole.id,
        },
        select: { id: true },
      });
      if (!existing) {
        await tx.userRole.create({
          data: {
            userId: memberUserId,
            businessAccountId: targetBaId!,
            outletId: null,
            roleId: ownerRole.id,
          },
        });
      }
    }

    // Demote empty personal placeholders so login won't prefer them.
    const emptyMemberships = await tx.businessAccountMember.findMany({
      where: {
        userId: memberUserId,
        businessAccountId: { not: targetBaId! },
      },
      select: {
        id: true,
        businessAccountId: true,
        businessAccount: {
          select: {
            outlets: {
              where: { isActive: true },
              select: {
                addressLine: true,
                pincode: true,
                latitude: true,
                longitude: true,
                requiresAddressUpdate: true,
              },
            },
          },
        },
      },
    });
    for (const m of emptyMemberships) {
      const usable = m.businessAccount.outlets.some((o) => hasUsableDeliveryLocation(o));
      const onlyPlaceholder =
        !usable
        && m.businessAccount.outlets.every(
          (o) =>
            o.requiresAddressUpdate
            || o.addressLine === PLACEHOLDER_OUTLET_ADDRESS
            || !o.addressLine,
        );
      if (onlyPlaceholder) {
        await tx.businessAccountMember.update({
          where: { id: m.id },
          data: { isPrimary: false },
        });
      }
    }
  });

  return true;
}
