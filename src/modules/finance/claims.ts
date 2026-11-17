import { prisma } from '@/lib/prisma';
import type { Prisma, SettlementClaimOwner } from '@prisma/client';

type Db = Prisma.TransactionClient | typeof prisma;

export async function sweepOrphanFinanceClaims(db: Db = prisma): Promise<number> {
  const orphans = await db.supplierSettlementClaim.findMany({
    where: {
      owner: 'finance',
      releasedAt: null,
      OR: [{ financeBatchId: null }, { financeBatch: { status: 'cancelled' } }],
    },
    select: { id: true },
  });
  if (orphans.length === 0) return 0;
  await db.supplierSettlementClaim.updateMany({
    where: { id: { in: orphans.map((row) => row.id) } },
    data: { releasedAt: new Date() },
  });
  return orphans.length;
}

/**
 * One active claim per order. The order row is locked first, then the insert
 * happens in the caller's transaction. A loser sees the winner's claim and
 * skips the order. A thrown error rolls the claim back with the batch.
 */
export async function claimOrders(
  tx: Prisma.TransactionClient,
  orderIds: string[],
  owner: SettlementClaimOwner,
  link: { financeBatchId?: string | null; legacySettlementId?: string | null } = {},
): Promise<{ claimed: string[]; blocked: string[] }> {
  const claimed: string[] = [];
  const blocked: string[] = [];
  for (const orderId of orderIds) {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    if (owner === 'finance') {
      const legacy = await tx.vendorSettlementOrder.findFirst({
        where: { orderId },
        select: { id: true },
      });
      if (legacy) {
        blocked.push(orderId);
        continue;
      }
    }
    const active = await tx.supplierSettlementClaim.findFirst({
      where: { orderId, releasedAt: null },
      select: { id: true },
    });
    if (active) {
      blocked.push(orderId);
      continue;
    }
    await tx.supplierSettlementClaim.create({
      data: {
        orderId,
        owner,
        financeBatchId: link.financeBatchId ?? null,
        legacySettlementId: link.legacySettlementId ?? null,
      },
    });
    claimed.push(orderId);
  }
  return { claimed, blocked };
}

export async function releaseFinanceClaims(tx: Prisma.TransactionClient, batchId: string): Promise<void> {
  await tx.supplierSettlementClaim.updateMany({
    where: { financeBatchId: batchId, releasedAt: null },
    data: { releasedAt: new Date() },
  });
}
