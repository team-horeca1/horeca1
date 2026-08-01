/**
 * Smoke: Delivery workspace accept → pack → assign → OTP | fail → reschedule → override.
 *
 * Uses FulfilmentService + DeliveryLinkService against the local DB with disposable
 * fixtures (cleaned up at the end). Does not hit HTTP.
 *
 * Run: npx tsx scripts/smoke-delivery-flow.ts
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { toDeliveryUiStatus } from '../src/modules/fulfillment/delivery.scope';
import { fulfilmentService } from '../src/modules/fulfillment/fulfillment.service';
import { deliveryLinkService } from '../src/modules/fulfillment/delivery-link.service';
import { prisma as appPrisma } from '../src/lib/prisma';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool as never) });

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function expectThrows(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, 'expected throw');
  } catch (err) {
    check(label, true, err instanceof Error ? err.message.slice(0, 120) : 'threw');
  }
}

type FixtureIds = {
  customerId: string;
  vendorOwnerId: string;
  vendorBaId: string;
  customerBaId: string;
  vendorOutletId: string;
  customerOutletId: string;
  vendorId: string;
  categoryId: string;
  productId: string;
  orderAId: string;
  orderBId: string;
};

const TS = Date.now().toString(36);
const TAG = `smoke-deliv-${TS}`;

function smokeHcid(suffix: string): string {
  // Keep suffix first so C/V remain after truncation.
  const pad = `${suffix}${TS}${randomUUID()}`
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '0')
    .padEnd(8, '0')
    .slice(0, 8);
  return `HC-${pad.slice(0, 4)}-${pad.slice(4, 8)}`;
}

async function cleanup(ids: Partial<FixtureIds>) {
  const orderIds = [ids.orderAId, ids.orderBId].filter(Boolean) as string[];
  if (orderIds.length) {
    await prisma.deliveryAccessToken.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.deliveryEvent.deleteMany({
      where: { fulfilment: { orderId: { in: orderIds } } },
    });
    await prisma.fulfilmentEvent.deleteMany({
      where: { fulfilment: { orderId: { in: orderIds } } },
    });
    await prisma.dispatch.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.fulfilmentItem.deleteMany({
      where: { fulfilment: { orderId: { in: orderIds } } },
    });
    await prisma.fulfilment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  if (ids.vendorId) {
    await prisma.deliveryResource.deleteMany({ where: { vendorId: ids.vendorId } });
    await prisma.inventory.deleteMany({ where: { vendorId: ids.vendorId } });
    await prisma.product.deleteMany({ where: { vendorId: ids.vendorId } });
    // Side-effects from order delivery (wallet / settlements / commissions).
    await prisma.commissionAccrual.deleteMany({ where: { vendorId: ids.vendorId } }).catch(() => undefined);
    await prisma.vendorSettlement.deleteMany({ where: { vendorId: ids.vendorId } }).catch(() => undefined);
    await prisma.vendorWalletTxn.deleteMany({
      where: { wallet: { vendorId: ids.vendorId } },
    }).catch(() => undefined);
    await prisma.vendorWallet.deleteMany({ where: { vendorId: ids.vendorId } }).catch(() => undefined);
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

async function seedFixtures(): Promise<FixtureIds> {
  const customerId = randomUUID();
  const vendorOwnerId = randomUUID();
  const vendorBaId = randomUUID();
  const customerBaId = randomUUID();
  const vendorOutletId = randomUUID();
  const customerOutletId = randomUUID();
  const vendorId = randomUUID();
  const categoryId = randomUUID();
  const productId = randomUUID();
  const orderAId = randomUUID();
  const orderBId = randomUUID();

  const addr: Prisma.InputJsonValue = {
    name: 'Smoke Outlet',
    addressLine: '12 Smoke Street',
    city: 'Bengaluru',
    state: 'KA',
    pincode: '560001',
  };

  const phoneA = `98${Date.now().toString().slice(-8)}`;
  const phoneB = `97${Date.now().toString().slice(-8)}`;

  await prisma.user.create({
    data: {
      id: customerId,
      email: `${TAG}-cust@example.com`,
      phone: phoneA,
      fullName: 'Smoke Customer',
      businessName: 'Smoke Kitchen',
      role: 'customer',
      hcidDisplay: smokeHcid('C'),
      profileCompletedAt: new Date(),
    },
  });
  await prisma.user.create({
    data: {
      id: vendorOwnerId,
      email: `${TAG}-vend@example.com`,
      phone: phoneB,
      fullName: 'Smoke Vendor Owner',
      businessName: 'Smoke Foods',
      role: 'vendor',
      hcidDisplay: smokeHcid('V'),
      profileCompletedAt: new Date(),
    },
  });

  await prisma.businessAccount.create({
    data: {
      id: vendorBaId,
      legalName: `${TAG} Vendor BA`,
      displayName: `${TAG} Vendor`,
      isCustomer: false,
      isVendor: true,
    },
  });
  await prisma.businessAccount.create({
    data: {
      id: customerBaId,
      legalName: `${TAG} Customer BA`,
      displayName: `${TAG} Customer`,
      isCustomer: true,
      isVendor: false,
    },
  });

  await prisma.businessAccountMember.createMany({
    data: [
      { id: randomUUID(), userId: vendorOwnerId, businessAccountId: vendorBaId, isPrimary: true },
      { id: randomUUID(), userId: customerId, businessAccountId: customerBaId, isPrimary: true },
    ],
  });

  await prisma.outlet.create({
    data: {
      id: vendorOutletId,
      businessAccountId: vendorBaId,
      name: 'Smoke Warehouse',
      addressLine: '1 Warehouse Rd',
      city: 'Bengaluru',
      state: 'KA',
      pincode: '560001',
      isActive: true,
    },
  });
  await prisma.outlet.create({
    data: {
      id: customerOutletId,
      businessAccountId: customerBaId,
      name: 'Smoke Kitchen Outlet',
      addressLine: '12 Smoke Street',
      city: 'Bengaluru',
      state: 'KA',
      pincode: '560001',
      isActive: true,
    },
  });
  await prisma.businessAccount.update({
    where: { id: vendorBaId },
    data: { primaryOutletId: vendorOutletId },
  });
  await prisma.businessAccount.update({
    where: { id: customerBaId },
    data: { primaryOutletId: customerOutletId },
  });

  await prisma.vendor.create({
    data: {
      id: vendorId,
      userId: vendorOwnerId,
      businessAccountId: vendorBaId,
      businessName: `${TAG} Foods`,
      displayName: `${TAG} Foods`,
      slug: TAG,
      isActive: true,
      isVerified: true,
      isPrimaryStore: true,
      defaultOutletId: vendorOutletId,
      minOrderValue: 0,
    },
  });

  await prisma.category.create({
    data: {
      id: categoryId,
      name: `${TAG} Cat`,
      slug: TAG,
      isActive: true,
      approvalStatus: 'approved',
    },
  });

  await prisma.product.create({
    data: {
      id: productId,
      vendorId,
      categoryId,
      name: `${TAG} Rice`,
      slug: `${TAG}-rice`,
      basePrice: 100,
      unit: 'kg',
      isActive: true,
      approvalStatus: 'approved',
      listingStatus: 'submitted',
    },
  });

  // Reserved covers both smoke orders (2+2) so delivered finalizeStock is valid.
  await prisma.inventory.create({
    data: {
      id: randomUUID(),
      productId,
      vendorId,
      outletId: vendorOutletId,
      qtyAvailable: 1000,
      qtyReserved: 4,
    },
  });

  const makeOrder = async (orderId: string, suffix: string) => {
    await prisma.order.create({
      data: {
        id: orderId,
        orderNumber: `SMK-${TS}-${suffix}`,
        userId: customerId,
        vendorId,
        businessAccountId: customerBaId,
        outletId: customerOutletId,
        fulfillmentOutletId: vendorOutletId,
        deliveryAddressSnapshot: addr,
        status: 'confirmed',
        subtotal: 100,
        totalAmount: 100,
        paymentMethod: 'cod',
        paymentStatus: 'unpaid',
        acceptedAt: new Date(),
        items: {
          create: {
            id: randomUUID(),
            productId,
            productName: `${TAG} Rice`,
            quantity: 2,
            fulfilledQty: 0,
            unitPrice: 50,
            totalPrice: 100,
          },
        },
      },
    });
  };

  await makeOrder(orderAId, 'A');
  await makeOrder(orderBId, 'B');

  return {
    customerId,
    vendorOwnerId,
    vendorBaId,
    customerBaId,
    vendorOutletId,
    customerOutletId,
    vendorId,
    categoryId,
    productId,
    orderAId,
    orderBId,
  };
}

async function main() {
  console.log('\n=== Delivery Flow Smoke (accept→pack→assign→OTP/fail/override) ===\n');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  void appPrisma;

  const ids = await seedFixtures();
  try {
    // ── Path A: OTP complete ───────────────────────────────────────────────
    const fA = await fulfilmentService.ensureForOrder(ids.orderAId, {
      actorId: ids.vendorOwnerId,
    });
    check(
      'A1 ensure fulfilment → Accepted (awaiting_picking)',
      fA.status === 'awaiting_picking' && toDeliveryUiStatus(fA.status) === 'accepted',
      fA.status,
    );

    await expectThrows('A2 assign before packed rejected', () =>
      fulfilmentService.dispatchAction(
        ids.vendorId,
        fA.id,
        {
          action: 'assign_and_dispatch',
          deliveryBoyName: 'Ravi',
          deliveryBoyPhone: '9876543210',
        },
        ids.vendorOwnerId,
      ),
    );

    const packedA = await fulfilmentService.dispatchAction(
      ids.vendorId,
      fA.id,
      { action: 'mark_packed' },
      ids.vendorOwnerId,
    );
    check(
      'A3 mark_packed → Packed',
      packedA.status === 'packed' && toDeliveryUiStatus(packedA.status) === 'packed',
      packedA.status,
    );
    const orderAPacked = await prisma.order.findUnique({
      where: { id: ids.orderAId },
      select: { status: true },
    });
    check(
      'A3b order → ready_for_dispatch',
      orderAPacked?.status === 'ready_for_dispatch',
      orderAPacked?.status,
    );

    const dispatchedA = await fulfilmentService.dispatchAction(
      ids.vendorId,
      fA.id,
      {
        action: 'assign_and_dispatch',
        deliveryBoyName: 'Ravi Kumar',
        deliveryBoyPhone: '9876543210',
      },
      ids.vendorOwnerId,
    );
    check(
      'A4 assign_and_dispatch → Dispatched',
      dispatchedA.status === 'out_for_delivery' &&
        toDeliveryUiStatus(dispatchedA.status) === 'dispatched',
      dispatchedA.status,
    );
    check('A4b magic link present', !!dispatchedA.magicLink?.token, dispatchedA.magicLink?.path);
    const orderAShip = await prisma.order.findUnique({
      where: { id: ids.orderAId },
      select: { status: true },
    });
    check('A4c order → shipped', orderAShip?.status === 'shipped', orderAShip?.status);

    const tokenA = dispatchedA.magicLink!.token;
    const viewA = await deliveryLinkService.getPublicView(tokenA);
    check(
      'A5 public view actionable',
      viewA.canComplete && viewA.canFail && viewA.canRequestOtp,
      `status=${viewA.status}`,
    );

    await deliveryLinkService.requestOtp(tokenA);
    const otpRow = await prisma.order.findUnique({
      where: { id: ids.orderAId },
      select: { deliveryOtp: true },
    });
    check('A6 request-otp stored on order', !!otpRow?.deliveryOtp, otpRow?.deliveryOtp ?? '');

    const completed = await deliveryLinkService.complete(tokenA, otpRow!.deliveryOtp!);
    check(
      'A7 complete+OTP → Delivered',
      completed.status === 'delivered' && !completed.canComplete,
      completed.status,
    );
    const orderADone = await prisma.order.findUnique({
      where: { id: ids.orderAId },
      select: { status: true, deliveryOtpVerifiedAt: true },
    });
    check(
      'A7b order delivered + OTP verified',
      orderADone?.status === 'delivered' && !!orderADone.deliveryOtpVerifiedAt,
      orderADone?.status,
    );

    // ── Path B: fail → reschedule → override ───────────────────────────────
    const fB = await fulfilmentService.ensureForOrder(ids.orderBId, {
      actorId: ids.vendorOwnerId,
    });

    await fulfilmentService.dispatchAction(
      ids.vendorId,
      fB.id,
      { action: 'mark_packed' },
      ids.vendorOwnerId,
    );
    const dispatchedB = await fulfilmentService.dispatchAction(
      ids.vendorId,
      fB.id,
      {
        action: 'assign_and_dispatch',
        deliveryBoyName: 'Asha',
        deliveryBoyPhone: '9123456780',
      },
      ids.vendorOwnerId,
    );
    const tokenB1 = dispatchedB.magicLink!.token;
    check('B1 dispatched + link', !!tokenB1, dispatchedB.magicLink?.path);

    const failedView = await deliveryLinkService.fail(tokenB1, 'customer_not_available');
    check(
      'B2 fail → delivery_attempt_failed',
      failedView.status === 'delivery_attempt_failed' && !failedView.canComplete,
      failedView.status,
    );
    const orderBAfterFail = await prisma.order.findUnique({
      where: { id: ids.orderBId },
      select: { status: true },
    });
    check(
      'B2b order stays shipped on fail',
      orderBAfterFail?.status === 'shipped',
      orderBAfterFail?.status,
    );

    await expectThrows('B3 complete disabled after fail', () =>
      deliveryLinkService.complete(tokenB1, '0000'),
    );

    const rescheduled = await fulfilmentService.dispatchAction(
      ids.vendorId,
      fB.id,
      { action: 'reschedule_dispatch', notes: 'Retry afternoon' },
      ids.vendorOwnerId,
    );
    check(
      'B4 reschedule → Packed',
      rescheduled.status === 'packed' && toDeliveryUiStatus(rescheduled.status) === 'packed',
      rescheduled.status,
    );
    const revoked = await prisma.deliveryAccessToken.findUnique({
      where: { token: tokenB1 },
      select: { revokedAt: true },
    });
    check('B4b old token revoked', !!revoked?.revokedAt);

    const redispatched = await fulfilmentService.dispatchAction(
      ids.vendorId,
      fB.id,
      {
        action: 'assign_and_dispatch',
        deliveryBoyName: 'Asha',
        deliveryBoyPhone: '9123456780',
      },
      ids.vendorOwnerId,
    );
    const tokenB2 = redispatched.magicLink!.token;
    check('B5 redispatch new link', !!tokenB2 && tokenB2 !== tokenB1);

    await deliveryLinkService.fail(tokenB2, 'other', 'Gate locked');
    const overridden = await fulfilmentService.dispatchAction(
      ids.vendorId,
      fB.id,
      {
        action: 'override_mark_delivered',
        note: 'Customer confirmed receipt on phone',
      },
      ids.vendorOwnerId,
    );
    check(
      'B6 override → Delivered',
      overridden.status === 'delivered' && toDeliveryUiStatus(overridden.status) === 'delivered',
      overridden.status,
    );
    const orderBDone = await prisma.order.findUnique({
      where: { id: ids.orderBId },
      select: { status: true, deliveryNotes: true },
    });
    check(
      'B6b order delivered via override',
      orderBDone?.status === 'delivered' &&
        !!orderBDone.deliveryNotes?.includes('Vendor override'),
      orderBDone?.status,
    );
  } finally {
    await cleanup(ids);
    console.log('\n(cleanup done)\n');
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('\nSMOKE FATAL:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    try {
      await appPrisma.$disconnect();
    } catch {
      /* ignore */
    }
  });
