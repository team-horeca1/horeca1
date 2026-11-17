import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

function localDatabase(): boolean {
  if (!fs.existsSync('.env')) return false;
  const match = fs.readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.*)$/m);
  if (!match) return false;
  const url = new URL(match[1].trim().replace(/^['"]|['"]$/g, ''));
  process.env.DATABASE_URL = url.toString();
  const name = url.pathname.replace(/^\//, '');
  return (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    && url.port !== '5433'
    && (name === 'horeca1' || name === 'horeca1_demo');
}

const enabled = localDatabase();

describe.skipIf(!enabled)('supplier settlement claims on local postgres', () => {
  const tag = randomUUID().slice(0, 8);
  let vendorId = '';
  let orderId = '';
  let userId = '';
  let businessId = '';

  afterAll(async () => {
    if (!enabled || !orderId) return;
    const { prisma } = await import('@/lib/prisma');
    await prisma.vendorSettlementOrder.deleteMany({ where: { orderId } }).catch(() => undefined);
    await prisma.vendorSettlement.deleteMany({ where: { vendorId } }).catch(() => undefined);
    await prisma.supplierSettlementClaim.deleteMany({ where: { orderId } }).catch(() => undefined);
    await prisma.supplierPayableEvent.deleteMany({ where: { orderId } }).catch(() => undefined);
    await prisma.supplierPayableLine.deleteMany({ where: { orderId } }).catch(() => undefined);
    await prisma.financeSettlementBatch.deleteMany({ where: { vendorId } }).catch(() => undefined);
    await prisma.vendorWalletTxn.deleteMany({ where: { wallet: { vendorId } } }).catch(() => undefined);
    await prisma.vendorWallet.deleteMany({ where: { vendorId } }).catch(() => undefined);
    await prisma.payment.deleteMany({ where: { orderId } }).catch(() => undefined);
    await prisma.order.deleteMany({ where: { id: orderId } }).catch(() => undefined);
    await prisma.outlet.deleteMany({ where: { businessAccountId: businessId } }).catch(() => undefined);
    await prisma.vendor.deleteMany({ where: { id: vendorId } }).catch(() => undefined);
    await prisma.businessAccount.deleteMany({ where: { id: businessId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('gives one order to only one concurrent settlement path and rolls a failed claim back', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { claimOrders } = await import('@/modules/finance/claims');
    const { createFinanceDraft } = await import('@/modules/finance/supplierSettlement.service');
    const { createSettlementBatch } = await import('@/modules/vendor/vendorSettlement.service');

    const user = await prisma.user.create({ data: { hcidDisplay: `pay-${tag}` } });
    const business = await prisma.businessAccount.create({ data: { legalName: `Payables ${tag}` } });
    const vendor = await prisma.vendor.create({
      data: {
        userId: user.id,
        businessAccountId: business.id,
        businessName: `Synthetic Supplier ${tag}`,
        slug: `synthetic-supplier-${tag}`,
        platformFeePct: '10.00',
      },
    });
    const outlet = await prisma.outlet.create({
      data: { businessAccountId: business.id, name: 'Outlet', addressLine: '1 Synthetic Street' },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `PO-PAY-${tag}`,
        userId: user.id,
        vendorId: vendor.id,
        businessAccountId: business.id,
        outletId: outlet.id,
        deliveryAddressSnapshot: { line: '1 Synthetic Street' },
        status: 'delivered',
        subtotal: '1000.00',
        totalAmount: '1000.00',
        paymentMethod: 'online',
        paymentStatus: 'paid',
        deliveredAt: new Date(),
      },
    });
    userId = user.id;
    businessId = business.id;
    vendorId = vendor.id;
    orderId = order.id;

    await expect(prisma.$transaction(async (tx) => {
      await claimOrders(tx, [order.id], 'finance');
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(await prisma.supplierSettlementClaim.count({ where: { orderId: order.id, releasedAt: null } })).toBe(0);

    const raced = await Promise.all([
      prisma.$transaction((tx) => claimOrders(tx, [order.id], 'finance')),
      prisma.$transaction((tx) => claimOrders(tx, [order.id], 'legacy_wallet')),
    ]);
    const claimed = raced.flatMap((result) => result.claimed);
    expect(claimed).toEqual([order.id]);
    expect(raced.flatMap((result) => result.blocked)).toEqual([order.id]);

    await prisma.supplierSettlementClaim.updateMany({
      where: { orderId: order.id },
      data: { releasedAt: new Date() },
    });

    await prisma.supplierCommissionAgreement.create({
      data: {
        vendorId: vendor.id,
        ratePct: '10.00',
        effectiveFrom: new Date(Date.now() - 86_400_000),
        reason: 'Synthetic rate for the payables race',
      },
    });
    await prisma.payment.create({
      data: {
        orderId: order.id,
        vendorId: vendor.id,
        userId: user.id,
        amount: '1000.00',
        status: 'captured',
        method: 'online',
      },
    });
    const wallet = await prisma.vendorWallet.create({
      data: { vendorId: vendor.id, balance: '900.00', pendingAmount: '900.00' },
    });
    await prisma.vendorWalletTxn.create({
      data: {
        walletId: wallet.id,
        type: 'order_credit',
        amount: '900.00',
        balanceAfter: '900.00',
        referenceId: order.id,
        referenceType: 'order',
        grossAmount: '1000.00',
        platformFee: '100.00',
        netAmount: '900.00',
      },
    });

    const periodStart = new Date(Date.now() - 86_400_000);
    const periodEnd = new Date(Date.now() + 86_400_000);
    const [draft, legacy] = await Promise.allSettled([
      createFinanceDraft({ vendorId: vendor.id, actorId: user.id, orderIds: [order.id], idempotencyKey: `race-${tag}` }),
      createSettlementBatch(vendor.id, periodStart, periodEnd),
    ]);
    const active = await prisma.supplierSettlementClaim.findMany({
      where: { orderId: order.id, releasedAt: null },
    });
    expect(active).toHaveLength(1);
    const financeWon = active[0]?.owner === 'finance';
    const legacyWon = active[0]?.owner === 'legacy_wallet';
    expect(financeWon || legacyWon).toBe(true);
    if (financeWon) {
      expect(draft.status).toBe('fulfilled');
      expect(legacy.status === 'fulfilled' ? legacy.value : null).toBeNull();
    } else {
      expect(legacy.status).toBe('fulfilled');
      expect(draft.status).toBe('rejected');
    }

    const balanceBefore = Number((await prisma.vendorWallet.findUniqueOrThrow({ where: { vendorId: vendor.id } })).balance);
    if (financeWon && draft.status === 'fulfilled') {
      const batchId = draft.value.batch.id;
      await prisma.supplierPayableLine.update({
        where: { orderId: order.id },
        data: { breakdown: { lockedRefundIds: [] } },
      });
      const { finaliseFinanceBatch, markFinanceBatchSettled } = await import('@/modules/finance/supplierSettlement.service');
      await finaliseFinanceBatch(batchId, randomUUID());
      await markFinanceBatchSettled(batchId, user.id, 'UTR654321');
      await markFinanceBatchSettled(batchId, user.id, 'UTR654321');
      const releases = await prisma.vendorWalletTxn.count({
        where: { referenceId: order.id, referenceType: 'finance_settlement_release' },
      });
      expect(releases).toBe(1);
      const release = await prisma.vendorWalletTxn.findFirstOrThrow({
        where: { referenceId: order.id, referenceType: 'finance_settlement_release' },
      });
      expect(release.notes).toContain('not a bank transfer');
      expect(Number(release.amount)).toBe(900);
      const balanceAfter = Number((await prisma.vendorWallet.findUniqueOrThrow({ where: { vendorId: vendor.id } })).balance);
      expect(balanceAfter).toBeCloseTo(balanceBefore - 900, 2);
    }
  }, 30_000);
});
