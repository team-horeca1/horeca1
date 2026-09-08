/**
 * Team members share the owner's BusinessAccount outlets/address.
 * New invitees (no primary yet) get this BA as primary so login does not land
 * them on an empty personal placeholder. Existing users keep their current primary.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';

type Tx = Prisma.TransactionClient;

const PASSWORD_RESET_BLOCKED =
  'This user manages other businesses; ask them to reset via OTP login';

export async function upsertTeamAccountMembership(
  tx: Tx,
  args: {
    userId: string;
    businessAccountId: string;
    invitedBy: string;
  },
): Promise<void> {
  const { userId, businessAccountId, invitedBy } = args;

  const existingPrimary = await tx.businessAccountMember.findFirst({
    where: { userId, isPrimary: true },
    select: { businessAccountId: true },
  });
  const makePrimary = !existingPrimary;

  await tx.businessAccountMember.upsert({
    where: { userId_businessAccountId: { userId, businessAccountId } },
    update: makePrimary ? { isPrimary: true } : {},
    create: {
      userId,
      businessAccountId,
      isPrimary: makePrimary,
      invitedBy,
      acceptedAt: new Date(),
    },
  });
}

/**
 * Team password reset is global (one User / one login). Allow it only when the
 * target is a member of THIS business and does not own/manage another one.
 */
export async function assertCanManageMemberPassword(
  targetUserId: string,
  currentBusinessAccountId: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true },
  });
  if (!user) throw Errors.notFound('User');
  if (user.role === 'admin') {
    throw Errors.forbidden(PASSWORD_RESET_BLOCKED);
  }

  const otherPrimary = await prisma.businessAccountMember.findFirst({
    where: {
      userId: targetUserId,
      isPrimary: true,
      businessAccountId: { not: currentBusinessAccountId },
    },
    select: { id: true },
  });
  if (otherPrimary) {
    throw Errors.forbidden(PASSWORD_RESET_BLOCKED);
  }

  const ownerOnOther = await prisma.userRole.findFirst({
    where: {
      userId: targetUserId,
      businessAccountId: { not: currentBusinessAccountId },
      role: { name: 'Owner' },
    },
    select: { id: true },
  });
  if (ownerOnOther) {
    throw Errors.forbidden(PASSWORD_RESET_BLOCKED);
  }
}
