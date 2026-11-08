/**
 * Route-level tests for the bulk pricelist routes. Real Postgres, mocked auth.
 * Opt-in: H1_INT_TESTS=1 and a THROWAWAY DATABASE_URL (never demo or live).
 */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

let currentVendorId = '';
vi.mock('@/middleware/rbac', () => ({
  vendorOnly: (h: (req: NextRequest, ctx: unknown) => Promise<Response>) => (req: NextRequest) => h(req, { userId: 'test-actor', role: 'vendor' }),
}));
vi.mock('@/lib/resolveVendorId', () => ({ resolveVendorId: async () => currentVendorId }));
vi.mock('@/lib/permissions/engine', () => ({ requirePermission: () => undefined }));
vi.mock('@/lib/auditLog', async (orig) => ({ ...(await orig<object>()), logAction: () => undefined }));
vi.mock('@/lib/priceHistory', () => ({ logPriceHistory: async () => undefined }));

import { prisma } from '@/lib/prisma';
import { POST as bulkApply } from '@/app/api/v1/vendor/price-lists/[id]/bulk-apply/route';
import { POST as bulkUpload } from '@/app/api/v1/vendor/price-lists/[id]/bulk-upload/route';

const run = process.env.H1_INT_TESTS === '1';
const rid = () => randomUUID().slice(0, 8);

async function seed() {
  const tag = rid();
  const u = await prisma.user.create({ data: { hcidDisplay: `BV-${tag}` } });
  const ba = await prisma.businessAccount.create({ data: { legalName: `Bulk Biz ${tag}` } });
  const vendor = await prisma.vendor.create({
    data: { userId: u.id, businessAccountId: ba.id, businessName: `Bulk Vendor ${tag}`, slug: `bulk-${tag}` },
  });
  currentVendorId = vendor.id;
  const mk = (n: string) =>
    prisma.product.create({ data: { vendorId: vendor.id, name: `${n} ${tag}`, slug: `${n}-${tag}`, basePrice: 100, approvalStatus: 'approved' } });
  const [locked, open] = await Promise.all([mk('locked'), mk('open')]);
  const list = await prisma.priceList.create({ data: { vendorId: vendor.id, name: `Bulk-${tag}` } });
  await prisma.priceListItem.create({ data: { priceListId: list.id, productId: locked.id, customPrice: 50, isLocked: true } });
  return { list, locked, open };
}

const req = (listId: string, leaf: string, body: unknown) =>
  new NextRequest(`http://test.local/api/v1/vendor/price-lists/${listId}/${leaf}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });

const priceOf = async (listId: string, productId: string) =>
  (await prisma.priceListItem.findUnique({ where: { priceListId_productId: { priceListId: listId, productId } } }))?.customPrice;

describe.skipIf(!run)('bulk routes respect locked prices', () => {
  afterAll(async () => { await prisma.$disconnect(); });

  it('bulk-apply: locked price untouched, open price set, skip is reported', async () => {
    const { list, locked, open } = await seed();
    const res = await bulkApply(req(list.id, 'bulk-apply', {
      productIds: [locked.id, open.id], action: { type: 'set', value: 70 },
    }));
    const json = await res.json();
    expect(json.data.skippedLocked).toBe(1);
    expect(json.data.upserted).toBe(1);
    expect(Number(await priceOf(list.id, locked.id))).toBe(50);
    expect(Number(await priceOf(list.id, open.id))).toBe(70);
  });

  it('bulk-upload: locked price untouched, open price set, skip is reported', async () => {
    const { list, locked, open } = await seed();
    const res = await bulkUpload(req(list.id, 'bulk-upload', {
      rows: [{ productId: locked.id, customPrice: 60 }, { productId: open.id, customPrice: 60 }],
    }));
    const json = await res.json();
    expect(json.data.skippedLocked).toBe(1);
    expect(json.data.upserted).toBe(1);
    expect(Number(await priceOf(list.id, locked.id))).toBe(50);
    expect(Number(await priceOf(list.id, open.id))).toBe(60);
  });
});
