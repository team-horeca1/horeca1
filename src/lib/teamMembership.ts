/**
 * Team members share the owner's BusinessAccount outlets/address.
 * When someone is invited onto a BA, that membership becomes their primary
 * working context so login does not land them on an empty personal placeholder.
 */
import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export async function upsertTeamAccountMembership(
  tx: Tx,
  args: {
    userId: string;
    businessAccountId: string;
    invitedBy: string;
  },
): Promise<void> {
  const { userId, businessAccountId, invitedBy } = args;

  await tx.businessAccountMember.updateMany({
    where: { userId, isPrimary: true, businessAccountId: { not: businessAccountId } },
    data: { isPrimary: false },
  });

  await tx.businessAccountMember.upsert({
    where: { userId_businessAccountId: { userId, businessAccountId } },
    update: { isPrimary: true },
    create: {
      userId,
      businessAccountId,
      isPrimary: true,
      invitedBy,
      acceptedAt: new Date(),
    },
  });
}
