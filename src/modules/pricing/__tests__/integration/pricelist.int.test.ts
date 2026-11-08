/**
 * Pricelist integration tests — need a real Postgres.
 * Skipped unless H1_INT_TESTS=1 and DATABASE_URL points at a THROWAWAY database
 * (never demo or live). Run:
 *   H1_INT_TESTS=1 DATABASE_URL=postgresql://... npx vitest run src/modules/pricing/__tests__/integration
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resolveUnitPrice, type CustomerContext } from '@/modules/pricing/pricing.service';
import { listEffectiveAssignments } from '@/modules/pricing/pricelist-assignment.service';
import { publishWorkspace, rollbackPublish } from '@/modules/pricing/pricelist-workspace.service';

const run = process.env.H1_INT_TESTS === '1';
const rid = () => randomUUID().slice(0, 8);

type Seed = { vendorId: string; actorId: string; customerId: string; productId: string; customerAccountId: string | null };

async function seedBase(basePrice = 100, withAccount = false): Promise<Seed> {
  const tag = rid();
  const vendorUser = await prisma.user.create({ data: { hcidDisplay: `V-${tag}` } });
  const customer = await prisma.user.create({ data: { hcidDisplay: `C-${tag}` } });
  const ba = await prisma.businessAccount.create({ data: { legalName: `Test Biz ${tag}` } });
  const vendor = await prisma.vendor.create({
    data: { userId: vendorUser.id, businessAccountId: ba.id, businessName: `Test Vendor ${tag}`, slug: `test-vendor-${tag}` },
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id, name: `Milk ${tag}`, slug: `milk-${tag}`, basePrice,
      approvalStatus: 'approved',
    },
  });
  await prisma.vendorCustomer.create({ data: { vendorId: vendor.id, userId: customer.id } });
  let customerAccountId: string | null = null;
  if (withAccount) {
    const cba = await prisma.businessAccount.create({ data: { legalName: `Buyer Biz ${tag}`, isCustomer: true } });
    await prisma.businessAccountMember.create({ data: { userId: customer.id, businessAccountId: cba.id } });
    customerAccountId = cba.id;
  }
  return { vendorId: vendor.id, actorId: vendorUser.id, customerId: customer.id, productId: product.id, customerAccountId };
}

const ctxFor = (userId: string, businessAccountId: string | null = null): CustomerContext => ({
  userId, businessAccountId, outletId: null,
  outletPincode: null, outletCity: null, outletState: null, tags: [],
});

const price = async (s: Seed, quantity = 1) =>
  Number((await resolveUnitPrice({ productId: s.productId, vendorId: s.vendorId, quantity, customer: ctxFor(s.customerId, s.customerAccountId) })).unitPrice);

describe.skipIf(!run)('pricelist integration', () => {
  afterAll(async () => { await prisma.$disconnect(); });
  beforeAll(async () => { await prisma.$queryRaw`select 1`; });

  it('baseline: no list means base price', async () => {
    const s = await seedBase(100);
    expect(await price(s)).toBe(100);
  });

  async function twoGroupLists(s: Seed) {
    const group = await prisma.customerGroup.create({ data: { vendorId: s.vendorId, name: `G-${rid()}` } });
    await prisma.customerGroupMember.create({ data: { groupId: group.id, userId: s.customerId } });
    // Older list has priority 5, newer list has priority 0 (lower number = wins on the screens).
    const older = await prisma.priceList.create({
      data: { vendorId: s.vendorId, name: `Older-${rid()}`, priority: 5, createdAt: new Date('2026-01-01') },
    });
    const newer = await prisma.priceList.create({
      data: { vendorId: s.vendorId, name: `Newer-${rid()}`, priority: 0, createdAt: new Date('2026-06-01') },
    });
    for (const [list, p] of [[older, 90], [newer, 80]] as const) {
      await prisma.priceListItem.create({ data: { priceListId: list.id, productId: s.productId, customPrice: p } });
      await prisma.priceListAssignment.create({ data: { priceListId: list.id, type: 'group', groupId: group.id } });
    }
    return { older, newer };
  }

  const screenAndCheckout = async (s: Seed, older: { id: string; name: string }, newer: { id: string; name: string }) => {
    const effective = (await listEffectiveAssignments(s.vendorId)).find((c) => c.userId === s.customerId);
    const charged = await resolveUnitPrice({
      productId: s.productId, vendorId: s.vendorId, quantity: 1, customer: ctxFor(s.customerId, s.customerAccountId),
    });
    const chargedList = charged.priceListId === older.id ? older.name : charged.priceListId === newer.id ? newer.name : 'other';
    return { screenList: effective?.effective.priceListName, chargedList };
  };

  it('screen and checkout agree on which list wins at the same level', async () => {
    const s = await seedBase(100, true);
    const { older, newer } = await twoGroupLists(s);
    const { screenList, chargedList } = await screenAndCheckout(s, older, newer);
    expect(chargedList).toBe(screenList);
  });

  it('publishing a note on a discount item keeps the discount', async () => {
    const s = await seedBase(100);
    const list = await prisma.priceList.create({ data: { vendorId: s.vendorId, name: `Disc-${rid()}` } });
    await prisma.priceListItem.create({
      data: { priceListId: list.id, productId: s.productId, pricingType: 'discount', discountPercent: 10 },
    });
    await prisma.priceListAssignment.create({ data: { priceListId: list.id, type: 'customer', userId: s.customerId } });
    expect(await price(s)).toBe(90);
    await publishWorkspace({
      vendorId: s.vendorId, actorId: s.actorId, baseVersion: null, acknowledgeWarnings: true,
      cells: [{ priceListId: list.id, productId: s.productId, note: 'negotiated with buyer' }],
    });
    expect(await price(s)).toBe(90);
  });

  it('rollback refuses to overwrite a cell that changed after the publish', async () => {
    const s = await seedBase(100);
    const list = await prisma.priceList.create({ data: { vendorId: s.vendorId, name: `Roll-${rid()}` } });
    await prisma.priceListAssignment.create({ data: { priceListId: list.id, type: 'customer', userId: s.customerId } });
    const p1 = await publishWorkspace({
      vendorId: s.vendorId, actorId: s.actorId, baseVersion: null, acknowledgeWarnings: true,
      cells: [{ priceListId: list.id, productId: s.productId, customPrice: 90 }],
    });
    await publishWorkspace({
      vendorId: s.vendorId, actorId: s.actorId, baseVersion: p1.publishId, acknowledgeWarnings: true,
      cells: [{ priceListId: list.id, productId: s.productId, customPrice: 80 }],
    });
    await expect(rollbackPublish({ vendorId: s.vendorId, actorId: s.actorId, publishId: p1.publishId })).rejects.toThrow();
    expect(await price(s)).toBe(80);
  });

  it('typing a price on a discount item turns it into a fixed price', async () => {
    const s = await seedBase(100, true);
    const list = await prisma.priceList.create({ data: { vendorId: s.vendorId, name: `Disc2-${rid()}` } });
    await prisma.priceListItem.create({
      data: { priceListId: list.id, productId: s.productId, pricingType: 'discount', discountPercent: 10 },
    });
    await prisma.priceListAssignment.create({ data: { priceListId: list.id, type: 'customer', userId: s.customerId } });
    await publishWorkspace({
      vendorId: s.vendorId, actorId: s.actorId, baseVersion: null, acknowledgeWarnings: true,
      cells: [{ priceListId: list.id, productId: s.productId, customPrice: 85 }],
    });
    expect(await price(s)).toBe(85);
    const row = await prisma.priceListItem.findFirstOrThrow({ where: { priceListId: list.id, productId: s.productId } });
    expect(row.pricingType).toBe('fixed');
    expect(row.discountPercent).toBeNull();
  });

  it('a scheme item keeps its scheme when a note is published', async () => {
    const s = await seedBase(100, true);
    const list = await prisma.priceList.create({ data: { vendorId: s.vendorId, name: `Scheme-${rid()}` } });
    await prisma.priceListItem.create({
      data: { priceListId: list.id, productId: s.productId, pricingType: 'scheme', customPrice: 90, schemeMinQty: 10, schemeFreeQty: 1 },
    });
    await prisma.priceListAssignment.create({ data: { priceListId: list.id, type: 'customer', userId: s.customerId } });
    await publishWorkspace({
      vendorId: s.vendorId, actorId: s.actorId, baseVersion: null, acknowledgeWarnings: true,
      cells: [{ priceListId: list.id, productId: s.productId, note: 'x' }],
    });
    const row = await prisma.priceListItem.findFirstOrThrow({ where: { priceListId: list.id, productId: s.productId } });
    expect(row.pricingType).toBe('scheme');
    expect(row.schemeMinQty).toBe(10);
    expect(await price(s, 10)).toBe(90);
    expect(await price(s, 1)).toBe(100);
  });

  it('rollback works when nothing changed since, and only once', async () => {
    const s = await seedBase(100, true);
    const list = await prisma.priceList.create({ data: { vendorId: s.vendorId, name: `Once-${rid()}` } });
    await prisma.priceListAssignment.create({ data: { priceListId: list.id, type: 'customer', userId: s.customerId } });
    const p1 = await publishWorkspace({
      vendorId: s.vendorId, actorId: s.actorId, baseVersion: null, acknowledgeWarnings: true,
      cells: [{ priceListId: list.id, productId: s.productId, customPrice: 90 }],
    });
    expect(await price(s)).toBe(90);
    await rollbackPublish({ vendorId: s.vendorId, actorId: s.actorId, publishId: p1.publishId });
    expect(await price(s)).toBe(100);
    await expect(rollbackPublish({ vendorId: s.vendorId, actorId: s.actorId, publishId: p1.publishId })).rejects.toThrow(/already been undone/);
  });

  it('rollback restores a deleted discount item as a discount item', async () => {
    const s = await seedBase(100, true);
    const list = await prisma.priceList.create({ data: { vendorId: s.vendorId, name: `Restore-${rid()}` } });
    await prisma.priceListItem.create({
      data: { priceListId: list.id, productId: s.productId, pricingType: 'discount', discountPercent: 10 },
    });
    await prisma.priceListAssignment.create({ data: { priceListId: list.id, type: 'customer', userId: s.customerId } });
    // Explicit "use Base" removes the item, which is a legitimate supplier action.
    const p1 = await publishWorkspace({
      vendorId: s.vendorId, actorId: s.actorId, baseVersion: null, acknowledgeWarnings: true,
      cells: [{ priceListId: list.id, productId: s.productId, customPrice: null }],
    });
    expect(await price(s)).toBe(100);
    await rollbackPublish({ vendorId: s.vendorId, actorId: s.actorId, publishId: p1.publishId });
    expect(await price(s)).toBe(90);
  });

  it('rollback works after a publish that set validity and schedule dates', async () => {
    const s = await seedBase(100, true);
    const list = await prisma.priceList.create({ data: { vendorId: s.vendorId, name: `Dates-${rid()}` } });
    await prisma.priceListAssignment.create({ data: { priceListId: list.id, type: 'customer', userId: s.customerId } });
    const p1 = await publishWorkspace({
      vendorId: s.vendorId, actorId: s.actorId, baseVersion: null, acknowledgeWarnings: true,
      cells: [{
        priceListId: list.id, productId: s.productId, customPrice: 90,
        validFrom: '2026-01-01', validTo: '2026-12-31',
        scheduledPrice: 95, scheduledFrom: '2026-12-01', scheduledTo: '2027-03-31',
      }],
    });
    await rollbackPublish({ vendorId: s.vendorId, actorId: s.actorId, publishId: p1.publishId });
    expect(await price(s)).toBe(100);
  });
});
