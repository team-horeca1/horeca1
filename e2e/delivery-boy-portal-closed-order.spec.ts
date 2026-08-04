/**
 * Regression: Order already `delivered` while Fulfilment stays `out_for_delivery`
 * must NOT appear on the boy portal open list, and detail must not offer Complete.
 *
 * Run (dev server already up):
 *   $env:PLAYWRIGHT_SKIP_WEBSERVER=1; npx playwright test e2e/delivery-boy-portal-closed-order.spec.ts --workers=1
 */
import { randomUUID } from 'crypto';
import { test, expect } from '@playwright/test';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const TS = Date.now().toString(36);
const TAG = `e2e-boy-closed-${TS}`;

type SeedIds = {
  customerId: string;
  vendorOwnerId: string;
  vendorBaId: string;
  customerBaId: string;
  vendorOutletId: string;
  customerOutletId: string;
  vendorId: string;
  categoryId: string;
  productId: string;
  orderId: string;
  fulfilmentId: string;
  resourceId: string;
  boyToken: string;
  orderNumber: string;
};

function hcid(suffix: string): string {
  const pad = `${suffix}${TS}${randomUUID()}`
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '0')
    .padEnd(8, '0')
    .slice(0, 8);
  return `HC-${pad.slice(0, 4)}-${pad.slice(4, 8)}`;
}

function createPrisma() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for this e2e');
  const pool = new Pool({ connectionString: url });
  return {
    prisma: new PrismaClient({ adapter: new PrismaPg(pool as never) }),
    pool,
  };
}

async function cleanup(prisma: PrismaClient, ids: Partial<SeedIds>) {
  if (ids.orderId) {
    await prisma.deliveryAccessToken.deleteMany({ where: { orderId: ids.orderId } });
    await prisma.deliveryEvent.deleteMany({
      where: { fulfilment: { orderId: ids.orderId } },
    });
    await prisma.fulfilmentEvent.deleteMany({
      where: { fulfilment: { orderId: ids.orderId } },
    });
    await prisma.dispatch.deleteMany({ where: { orderId: ids.orderId } });
    await prisma.fulfilmentItem.deleteMany({
      where: { fulfilment: { orderId: ids.orderId } },
    });
    await prisma.fulfilment.deleteMany({ where: { orderId: ids.orderId } });
    await prisma.orderEvent.deleteMany({ where: { orderId: ids.orderId } });
    await prisma.orderItem.deleteMany({ where: { orderId: ids.orderId } });
    await prisma.order.deleteMany({ where: { id: ids.orderId } });
  }
  if (ids.resourceId) {
    await prisma.deliveryBoyAccessToken.deleteMany({
      where: { deliveryResourceId: ids.resourceId },
    });
  }
  if (ids.vendorId) {
    await prisma.deliveryResource.deleteMany({ where: { vendorId: ids.vendorId } });
    await prisma.inventory.deleteMany({ where: { vendorId: ids.vendorId } });
    await prisma.product.deleteMany({ where: { vendorId: ids.vendorId } });
    await prisma.vendor.deleteMany({ where: { id: ids.vendorId } });
  }
  if (ids.categoryId) {
    await prisma.category.deleteMany({ where: { id: ids.categoryId } }).catch(() => undefined);
  }
  for (const baId of [ids.vendorBaId, ids.customerBaId].filter(Boolean) as string[]) {
    await prisma.businessAccount.updateMany({
      where: { id: baId },
      data: { primaryOutletId: null },
    });
    await prisma.outlet.deleteMany({ where: { businessAccountId: baId } });
    await prisma.businessAccountMember.deleteMany({ where: { businessAccountId: baId } });
    await prisma.businessAccount.deleteMany({ where: { id: baId } });
  }
  for (const userId of [ids.customerId, ids.vendorOwnerId].filter(Boolean) as string[]) {
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
}

async function seedDesyncedDelivery(prisma: PrismaClient): Promise<SeedIds> {
  const ids: SeedIds = {
    customerId: randomUUID(),
    vendorOwnerId: randomUUID(),
    vendorBaId: randomUUID(),
    customerBaId: randomUUID(),
    vendorOutletId: randomUUID(),
    customerOutletId: randomUUID(),
    vendorId: randomUUID(),
    categoryId: randomUUID(),
    productId: randomUUID(),
    orderId: randomUUID(),
    fulfilmentId: randomUUID(),
    resourceId: randomUUID(),
    boyToken: `e2e${randomUUID().replace(/-/g, '')}`.slice(0, 43),
    orderNumber: `E2E-CLOSED-${TS}`,
  };

  const addr: Prisma.InputJsonValue = {
    name: 'E2E Outlet',
    addressLine: '1 Test Street',
    city: 'Mumbai',
    state: 'MH',
    pincode: '400001',
  };

  const phone = `99${Date.now().toString().slice(-8)}`;

  await prisma.user.create({
    data: {
      id: ids.customerId,
      email: `${TAG}-cust@example.com`,
      phone,
      fullName: 'E2E Closed Customer',
      businessName: 'E2E Kitchen',
      role: 'customer',
      hcidDisplay: hcid('C'),
      profileCompletedAt: new Date(),
    },
  });
  await prisma.user.create({
    data: {
      id: ids.vendorOwnerId,
      email: `${TAG}-vend@example.com`,
      phone: `98${Date.now().toString().slice(-8)}`,
      fullName: 'E2E Closed Vendor',
      role: 'vendor',
      hcidDisplay: hcid('V'),
      profileCompletedAt: new Date(),
    },
  });

  await prisma.businessAccount.create({
    data: {
      id: ids.vendorBaId,
      legalName: `${TAG} Vendor BA`,
      displayName: `${TAG} Vendor`,
      isCustomer: false,
      isVendor: true,
    },
  });
  await prisma.businessAccount.create({
    data: {
      id: ids.customerBaId,
      legalName: `${TAG} Customer BA`,
      displayName: `${TAG} Customer`,
      isCustomer: true,
      isVendor: false,
    },
  });
  await prisma.businessAccountMember.createMany({
    data: [
      {
        id: randomUUID(),
        userId: ids.vendorOwnerId,
        businessAccountId: ids.vendorBaId,
        isPrimary: true,
      },
      {
        id: randomUUID(),
        userId: ids.customerId,
        businessAccountId: ids.customerBaId,
        isPrimary: true,
      },
    ],
  });

  await prisma.outlet.create({
    data: {
      id: ids.vendorOutletId,
      businessAccountId: ids.vendorBaId,
      name: 'E2E Warehouse',
      addressLine: '1 Warehouse',
      city: 'Mumbai',
      state: 'MH',
      pincode: '400001',
      isActive: true,
    },
  });
  await prisma.outlet.create({
    data: {
      id: ids.customerOutletId,
      businessAccountId: ids.customerBaId,
      name: 'E2E Kitchen',
      addressLine: '1 Test Street',
      city: 'Mumbai',
      state: 'MH',
      pincode: '400001',
      isActive: true,
    },
  });
  await prisma.businessAccount.update({
    where: { id: ids.vendorBaId },
    data: { primaryOutletId: ids.vendorOutletId },
  });
  await prisma.businessAccount.update({
    where: { id: ids.customerBaId },
    data: { primaryOutletId: ids.customerOutletId },
  });

  await prisma.vendor.create({
    data: {
      id: ids.vendorId,
      userId: ids.vendorOwnerId,
      businessAccountId: ids.vendorBaId,
      businessName: `${TAG} Foods`,
      displayName: `${TAG} Foods`,
      slug: TAG,
      isActive: true,
      isVerified: true,
      isPrimaryStore: true,
      defaultOutletId: ids.vendorOutletId,
      minOrderValue: 0,
    },
  });

  await prisma.category.create({
    data: {
      id: ids.categoryId,
      name: `${TAG} Cat`,
      slug: TAG,
      isActive: true,
      approvalStatus: 'approved',
    },
  });

  await prisma.product.create({
    data: {
      id: ids.productId,
      vendorId: ids.vendorId,
      categoryId: ids.categoryId,
      name: `${TAG} Milk`,
      slug: `${TAG}-milk`,
      basePrice: 50,
      unit: 'L',
      isActive: true,
      approvalStatus: 'approved',
      listingStatus: 'submitted',
    },
  });

  await prisma.inventory.create({
    data: {
      id: randomUUID(),
      productId: ids.productId,
      vendorId: ids.vendorId,
      outletId: ids.vendorOutletId,
      qtyAvailable: 100,
      qtyReserved: 0,
    },
  });

  const orderItemId = randomUUID();
  await prisma.order.create({
    data: {
      id: ids.orderId,
      orderNumber: ids.orderNumber,
      userId: ids.customerId,
      vendorId: ids.vendorId,
      businessAccountId: ids.customerBaId,
      outletId: ids.customerOutletId,
      fulfillmentOutletId: ids.vendorOutletId,
      deliveryAddressSnapshot: addr,
      // Commercial side already closed — Fulfilment left open (the bug).
      status: 'delivered',
      deliveredAt: new Date(),
      subtotal: 50,
      totalAmount: 50,
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
      acceptedAt: new Date(),
      items: {
        create: {
          id: orderItemId,
          productId: ids.productId,
          productName: `${TAG} Milk`,
          quantity: 1,
          fulfilledQty: 1,
          unitPrice: 50,
          totalPrice: 50,
        },
      },
    },
  });

  await prisma.deliveryResource.create({
    data: {
      id: ids.resourceId,
      vendorId: ids.vendorId,
      type: 'executive',
      name: 'E2E Boy',
      phone: '9111111111',
      isActive: true,
    },
  });

  await prisma.fulfilment.create({
    data: {
      id: ids.fulfilmentId,
      fulfilmentNumber: `FF-${TS}`,
      orderId: ids.orderId,
      vendorId: ids.vendorId,
      outletId: ids.vendorOutletId,
      status: 'out_for_delivery',
      deliveryResourceId: ids.resourceId,
      items: {
        create: {
          id: randomUUID(),
          orderItemId,
          acceptedQty: 1,
          pickedQty: 1,
          packedQty: 1,
        },
      },
    },
  });

  await prisma.dispatch.create({
    data: {
      id: randomUUID(),
      vendorId: ids.vendorId,
      outletId: ids.vendorOutletId,
      orderId: ids.orderId,
      fulfilmentId: ids.fulfilmentId,
      deliveryResourceId: ids.resourceId,
      status: 'out_for_delivery',
      driverName: 'E2E Boy',
      dispatchedAt: new Date(),
    },
  });

  await prisma.deliveryBoyAccessToken.create({
    data: {
      id: randomUUID(),
      token: ids.boyToken,
      vendorId: ids.vendorId,
      deliveryResourceId: ids.resourceId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return ids;
}

test.describe('delivery boy portal — closed order desync', () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let ids: SeedIds;

  test.beforeAll(async () => {
    ({ prisma, pool } = createPrisma());
    ids = await seedDesyncedDelivery(prisma);
  });

  test.afterAll(async () => {
    try {
      await cleanup(prisma, ids ?? {});
    } finally {
      await prisma.$disconnect().catch(() => undefined);
      await pool.end().catch(() => undefined);
    }
  });

  test('API list excludes delivered order and heals fulfilment', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/v1/delivery-boy-link/${encodeURIComponent(ids.boyToken)}`,
    );
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as {
      success?: boolean;
      data?: {
        orders: Array<{ orderNumber: string; fulfilmentId: string }>;
      };
    };
    expect(json.success).toBe(true);
    const numbers = (json.data?.orders ?? []).map((o) => o.orderNumber);
    expect(numbers).not.toContain(ids.orderNumber);

    const fulfilment = await prisma.fulfilment.findUnique({
      where: { id: ids.fulfilmentId },
      select: { status: true },
    });
    expect(fulfilment?.status).toBe('delivered');
  });

  test('portal page does not list the closed order', async ({ page }) => {
    await page.goto(`${BASE}/d/b/${ids.boyToken}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('delivery-boy-portal-list')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(ids.orderNumber)).toHaveCount(0);
  });

  test('deep link shows delivered, not Complete delivery', async ({ page, request }) => {
    // Re-open desync for this case (list heal already closed it).
    await prisma.fulfilment.update({
      where: { id: ids.fulfilmentId },
      data: { status: 'out_for_delivery', failedReason: null },
    });
    await prisma.order.update({
      where: { id: ids.orderId },
      data: { status: 'delivered', deliveredAt: new Date() },
    });

    const viewRes = await request.get(
      `${BASE}/api/v1/delivery-boy-link/${encodeURIComponent(ids.boyToken)}/${ids.fulfilmentId}`,
    );
    expect(viewRes.ok()).toBeTruthy();
    const viewJson = (await viewRes.json()) as {
      success?: boolean;
      data?: {
        canComplete?: boolean;
        canRequestOtp?: boolean;
        status?: string;
        order?: { status?: string };
      };
    };
    expect(viewJson.success).toBe(true);
    expect(viewJson.data?.canComplete).toBe(false);
    expect(viewJson.data?.canRequestOtp).toBe(false);
    expect(viewJson.data?.order?.status).toBe('delivered');
    expect(viewJson.data?.status).toBe('delivered');

    const otpRes = await request.post(
      `${BASE}/api/v1/delivery-boy-link/${encodeURIComponent(ids.boyToken)}/${ids.fulfilmentId}/request-otp`,
    );
    expect(otpRes.ok()).toBeFalsy();
    const otpJson = (await otpRes.json()) as { error?: { message?: string } | string };
    const msg =
      typeof otpJson.error === 'string'
        ? otpJson.error
        : otpJson.error?.message ?? '';
    expect(msg.toLowerCase()).toMatch(/already delivered|closed/);

    await page.goto(`${BASE}/d/b/${ids.boyToken}/${ids.fulfilmentId}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByTestId('delivery-link-delivered')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('delivery-link-complete')).toHaveCount(0);
  });
});
