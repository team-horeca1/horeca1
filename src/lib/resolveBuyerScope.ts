/**
 * Server-only: pick a customer-capable BusinessAccount for storefront Admin View.
 * Kept out of resolveCustomerImpersonation.ts so Prisma never enters the browser graph.
 */
import 'server-only';
import { prisma } from '@/lib/prisma';

export async function resolveBuyerScope(opts: {
  userId: string;
  preferredBusinessAccountId?: string | null;
}): Promise<{ userId: string; businessAccountId: string } | null> {
  if (opts.preferredBusinessAccountId) {
    const ba = await prisma.businessAccount.findUnique({
      where: { id: opts.preferredBusinessAccountId },
      select: { id: true, isCustomer: true },
    });
    if (ba?.isCustomer) {
      return { userId: opts.userId, businessAccountId: ba.id };
    }
  }

  const membership = await prisma.businessAccountMember.findFirst({
    where: { userId: opts.userId, businessAccount: { isCustomer: true } },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: { businessAccountId: true },
  });
  if (!membership) return null;
  return { userId: opts.userId, businessAccountId: membership.businessAccountId };
}
