/**
 * Idempotent finance demo data for admin/vendor finance UIs and E2E QA.
 * Uses real OrderService + settlement hooks so ledger, wallet, and reports populate.
 *
 *   npx prisma db seed
 *   npx tsx prisma/scripts/seed-finance-demo.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { OrderService } from '../../src/modules/order/order.service';
import { createSettlementBatch, markSettlementTransferred } from '../../src/modules/vendor/vendorSettlement.service';
import { vendorReviewReturn, adminProcessReturnRefund } from '../../src/modules/return/return.service';
import { creditWalletService } from '../../src/modules/credit/creditWallet.service';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const orderService = new OrderService();

const num = (d: { toString(): string } | number | null | undefined) => (d == null ? 0 : Number(d));

type CustomerCtx = { userId: string; businessAccountId: string; outletId: string };

async function getCustomerContext(email: string): Promise<CustomerCtx> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`Customer not found: ${email} — run npx prisma db seed first`);
  const member = await prisma.businessAccountMember.findFirst({
    where: { userId: user.id, isPrimary: true, businessAccount: { isCustomer: true } },
    include: { businessAccount: { include: { outlets: { where: { isActive: true }, take: 1 } } } },
  });
  const outlet = member?.businessAccount.outlets[0];
  if (!member || !outlet) throw new Error(`No outlet for customer ${email}`);
  return { userId: user.id, businessAccountId: member.businessAccountId, outletId: outlet.id };
}

async function getVendorByEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`Vendor user not found: ${email}`);
  const vendor = await prisma.vendor.findFirst({ where: { userId: user.id } });
  if (!vendor) throw new Error(`Vendor not found: ${email}`);
  return vendor;
}

async function getVendorOutletId(vendorId: string): Promise<string> {
  const vendor = await prisma.vendor.findUniqueOrThrow({
    where: { id: vendorId },
    select: { businessAccountId: true, businessName: true, pickupCity: true },
  });
  let outlet = await prisma.outlet.findFirst({
    where: { businessAccountId: vendor.businessAccountId, isActive: true },
    select: { id: true },
  });
  if (!outlet) {
    outlet = await prisma.outlet.create({
      data: {
        businessAccountId: vendor.businessAccountId,
        name: `${vendor.businessName} — Warehouse`,
        addressLine: 'Demo warehouse',
        city: vendor.pickupCity ?? 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        isActive: true,
      },
      select: { id: true },
    });
    await prisma.businessAccount.update({
      where: { id: vendor.businessAccountId },
      data: { primaryOutletId: outlet.id },
    });
    console.log(`  + created outlet for ${vendor.businessName}`);
  }
  return outlet.id;
}

async function getOrderProduct(vendorId: string) {
  let product = await prisma.product.findFirst({
    where: { vendorId, isActive: true, approvalStatus: 'approved' },
    orderBy: { basePrice: 'asc' },
  });
  if (!product) {
    product = await prisma.product.findFirst({
      where: { vendorId, isActive: true },
      orderBy: { basePrice: 'asc' },
    });
    if (product) {
      await prisma.product.update({
        where: { id: product.id },
        data: { approvalStatus: 'approved' },
      });
    }
  }
  if (!product) {
    const vendor = await prisma.vendor.findUniqueOrThrow({ where: { id: vendorId } });
    const outletId = await getVendorOutletId(vendorId);
    const slug = `seed-fin-${vendor.slug}`.slice(0, 255);
    product = await prisma.product.create({
      data: {
        vendorId,
        name: `Finance Demo — ${vendor.businessName}`,
        slug,
        basePrice: 100,
        taxPercent: 0,
        isActive: true,
        approvalStatus: 'approved',
        creditEligible: true,
      },
    });
    await prisma.inventory.create({
      data: {
        productId: product.id,
        vendorId,
        outletId,
        qtyAvailable: 5000,
      },
    });
    console.log(`  + created demo product for ${vendor.businessName}`);
  }
  return product;
}

async function deliverOrder(orderId: string, vendorId: string) {
  for (const status of ['confirmed', 'processing', 'shipped', 'delivered'] as const) {
    await orderService.updateStatus(orderId, vendorId, status);
  }
}

interface DeliveredOrderOpts {
  orderNumber: string;
  customerEmail: string;
  vendorEmail: string;
  paymentMethod: string;
  quantity?: number;
  backdateDays?: number;
  razorpayCaptured?: boolean;
}

async function ensureDeliveredOrder(opts: DeliveredOrderOpts) {
  const existing = await prisma.order.findUnique({ where: { orderNumber: opts.orderNumber } });
  if (existing) {
    console.log(`  ↷ ${opts.orderNumber} already exists (${existing.status})`);
    return existing;
  }

  const ctx = await getCustomerContext(opts.customerEmail);
  const vendor = await getVendorByEmail(opts.vendorEmail);
  const product = await getOrderProduct(vendor.id);
  const mov = num(vendor.minOrderValue);
  const price = num(product.basePrice);
  const qty = opts.quantity ?? Math.max(Math.ceil(mov / price) + 2, 6);

  const res = await orderService.create(ctx, {
    vendorOrders: [{ vendorId: vendor.id, items: [{ productId: product.id, quantity: qty }] }],
    paymentMethod: opts.paymentMethod,
  });
  const orderId = res.orders[0].id;

  await prisma.order.update({ where: { id: orderId }, data: { orderNumber: opts.orderNumber } });

  if (opts.paymentMethod === 'razorpay' && opts.razorpayCaptured) {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await prisma.payment.create({
      data: {
        orderId,
        userId: ctx.userId,
        vendorId: vendor.id,
        amount: order.totalAmount,
        status: 'captured',
        method: 'razorpay',
        razorpayOrderId: `order_seed_${orderId.slice(0, 8)}`,
        razorpayPaymentId: `pay_seed_${orderId.slice(0, 8)}`,
      },
    });
    await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'paid' } });
  }

  await deliverOrder(orderId, vendor.id);

  if (opts.backdateDays) {
    const d = new Date();
    d.setDate(d.getDate() - opts.backdateDays);
    await prisma.order.update({
      where: { id: orderId },
      data: { deliveredAt: d, createdAt: d, updatedAt: d },
    });
    await prisma.vendorWalletTxn.updateMany({
      where: { referenceId: orderId, referenceType: 'order' },
      data: { createdAt: d },
    });
  }

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  console.log(`  ✓ ${opts.orderNumber} delivered — ₹${num(order.totalAmount)} (${opts.paymentMethod})`);
  return order;
}

async function seedPlatformSettings() {
  const row = await prisma.platformSetting.findFirst();
  if (row) {
    await prisma.platformSetting.update({ where: { id: row.id }, data: { defaultCommissionPct: 10 } });
  } else {
    await prisma.platformSetting.create({ data: { defaultCommissionPct: 10 } });
  }
  const spice = await getVendorByEmail('owner@spicetrail.in');
  await prisma.vendor.update({ where: { id: spice.id }, data: { platformFeePct: 8 } });
  console.log('  ✓ Platform fee: default 10%, Spice Trail override 8%');
}

async function seedCreditWallets(adminId: string) {
  const taj = await prisma.user.findUniqueOrThrow({ where: { email: 'chef@tajpalace.com' } });
  const dailyFresh = await getVendorByEmail('fresh@dailyfreshfoods.com');
  const hyatt = await prisma.user.findUniqueOrThrow({ where: { email: 'kitchen@grandhyatt.com' } });
  const meatHouse = await getVendorByEmail('info@meathouseindia.com');

  await creditWalletService.assignCredit(taj.id, dailyFresh.id, 75000, {}, adminId, 'Finance demo — Taj Palace vendor credit');
  await creditWalletService.assignCredit(taj.id, null, 15000, {}, adminId, 'Finance demo — H1 platform wallet');
  await creditWalletService.assignCredit(hyatt.id, meatHouse.id, 100000, {}, adminId, 'Finance demo — Grand Hyatt MeatHouse credit');
  console.log('  ✓ Credit wallets assigned');
}

async function seedSalesTeamCommission() {
  const dailyFresh = await getVendorByEmail('fresh@dailyfreshfoods.com');
  const greenLeaf = await getCustomerContext('owner@greenleafcafe.com');

  const salesperson = await prisma.salesperson.upsert({
    where: { vendorId_code: { vendorId: dailyFresh.id, code: 'SEED-SP01' } },
    update: { isActive: true },
    create: {
      vendorId: dailyFresh.id,
      name: 'Demo Sales Rep',
      code: 'SEED-SP01',
      phone: '+919999999001',
      email: 'sales.demo@horeca1.test',
      isActive: true,
    },
  });

  await prisma.vendorCustomer.upsert({
    where: { vendorId_userId: { vendorId: dailyFresh.id, userId: greenLeaf.userId } },
    update: { salespersonId: salesperson.id, status: 'active' },
    create: {
      vendorId: dailyFresh.id,
      userId: greenLeaf.userId,
      status: 'active',
      salespersonId: salesperson.id,
    },
  });

  const existingRule = await prisma.commissionRule.findFirst({
    where: { vendorId: dailyFresh.id, salespersonId: salesperson.id, scope: 'default', isActive: true },
  });
  if (!existingRule) {
    await prisma.commissionRule.create({
      data: {
        vendorId: dailyFresh.id,
        salespersonId: salesperson.id,
        scope: 'default',
        ratePercent: 5,
        isActive: true,
      },
    });
  }
  console.log('  ✓ Salesperson + commission rule for Daily Fresh');
}

async function seedSettlements() {
  const dailyFresh = await getVendorByEmail('fresh@dailyfreshfoods.com');
  const spice = await getVendorByEmail('owner@spicetrail.in');
  const periodStart = new Date(Date.now() - 30 * 86400000);
  const periodEnd = new Date();

  const pendingExists = await prisma.vendorSettlement.findFirst({
    where: { vendorId: dailyFresh.id, status: 'pending' },
  });
  if (!pendingExists) {
    const batch = await createSettlementBatch(dailyFresh.id, periodStart, periodEnd);
    if (batch) console.log(`  ✓ Pending settlement batch for Daily Fresh (₹${batch.netAmount})`);
  } else {
    console.log('  ↷ Pending settlement for Daily Fresh exists');
  }

  const settledExists = await prisma.vendorSettlement.findFirst({
    where: { vendorId: spice.id, status: 'settled', bankReference: 'UTR-SEED-DEMO' },
  });
  if (!settledExists) {
    const batch = await createSettlementBatch(spice.id, periodStart, periodEnd);
    if (batch) {
      await markSettlementTransferred(batch.settlementId, 'UTR-SEED-DEMO');
      console.log(`  ✓ Settled batch for Spice Trail (UTR-SEED-DEMO)`);
    }
  } else {
    console.log('  ↷ Settled batch for Spice Trail exists');
  }
}

async function seedReturns(adminId: string) {
  const taj = await getCustomerContext('chef@tajpalace.com');
  const dailyFresh = await getVendorByEmail('fresh@dailyfreshfoods.com');

  const r1Order = await ensureDeliveredOrder({
    orderNumber: 'SEED-FIN-R1',
    customerEmail: 'chef@tajpalace.com',
    vendorEmail: 'fresh@dailyfreshfoods.com',
    paymentMethod: 'cod',
  });
  if (!(await prisma.returnRequest.findFirst({ where: { orderId: r1Order.id } }))) {
    await prisma.returnRequest.create({
      data: {
        orderId: r1Order.id,
        customerId: taj.userId,
        reason: 'Damaged packaging — demo pending return',
        status: 'new',
        invoiceNumber: r1Order.orderNumber,
        type: 'return',
      },
    });
    console.log('  ✓ Return pending (SEED-FIN-R1)');
  }

  const r2Order = await ensureDeliveredOrder({
    orderNumber: 'SEED-FIN-R2',
    customerEmail: 'owner@greenleafcafe.com',
    vendorEmail: 'fresh@dailyfreshfoods.com',
    paymentMethod: 'cod',
  });
  let r2 = await prisma.returnRequest.findFirst({ where: { orderId: r2Order.id } });
  if (!r2) {
    r2 = await prisma.returnRequest.create({
      data: {
        orderId: r2Order.id,
        customerId: r2Order.userId,
        reason: 'Wrong quantity — vendor-approved, awaiting admin refund',
        status: 'new',
        invoiceNumber: r2Order.orderNumber,
        type: 'return',
      },
    });
  }
  if (r2.status === 'new' || r2.status === 'pending') {
    await vendorReviewReturn(r2.id, dailyFresh.id, {
      status: 'approved',
      vendorNote: 'Approved — partial refund',
      resolutionType: 'refund',
      refundAmount: Math.min(200, num(r2Order.totalAmount)),
    });
    console.log('  ✓ Return vendor-approved (SEED-FIN-R2)');
  }

  const r3Order = await ensureDeliveredOrder({
    orderNumber: 'SEED-FIN-R3',
    customerEmail: 'chef@tajpalace.com',
    vendorEmail: 'fresh@dailyfreshfoods.com',
    paymentMethod: 'cod',
  });
  let r3 = await prisma.returnRequest.findFirst({ where: { orderId: r3Order.id } });
  if (!r3) {
    r3 = await prisma.returnRequest.create({
      data: {
        orderId: r3Order.id,
        customerId: taj.userId,
        reason: 'Quality issue — full refund demo',
        status: 'new',
        invoiceNumber: r3Order.orderNumber,
        type: 'return',
      },
    });
  }
  if (r3.status !== 'refunded' && r3.status !== 'closed') {
    if (r3.status === 'new' || r3.status === 'pending') {
      await vendorReviewReturn(r3.id, dailyFresh.id, {
        status: 'approved',
        resolutionType: 'refund',
        refundAmount: num(r3Order.totalAmount),
      });
    }
    const approved = await prisma.returnRequest.findUniqueOrThrow({ where: { id: r3.id } });
    if (approved.status === 'approved') {
      await adminProcessReturnRefund(r3.id, {
        adminUserId: adminId,
        refundAmount: num(r3Order.totalAmount),
        adminNote: 'Demo seed — COD refund processed',
      });
      console.log('  ✓ Return fully refunded (SEED-FIN-R3)');
    }
  }
}

async function seedClaims() {
  const beverage = await getVendorByEmail('sales@beverageco.in');
  const taj = await getCustomerContext('chef@tajpalace.com');

  const c1Order = await ensureDeliveredOrder({
    orderNumber: 'SEED-FIN-C1',
    customerEmail: 'chef@tajpalace.com',
    vendorEmail: 'sales@beverageco.in',
    paymentMethod: 'cod',
  });
  if (!(await prisma.vendorClaim.findFirst({ where: { orderId: c1Order.id, status: 'pending' } }))) {
    await prisma.vendorClaim.create({
      data: {
        vendorId: beverage.id,
        orderId: c1Order.id,
        type: 'damage',
        status: 'pending',
        amount: 350,
        notes: 'Demo pending delivery dispute',
        createdBy: taj.userId,
      },
    });
    console.log('  ✓ Vendor claim pending (SEED-FIN-C1)');
  }

  const c2Order = await ensureDeliveredOrder({
    orderNumber: 'SEED-FIN-C2',
    customerEmail: 'owner@greenleafcafe.com',
    vendorEmail: 'sales@beverageco.in',
    paymentMethod: 'cod',
  });
  if (!(await prisma.vendorClaim.findFirst({ where: { orderId: c2Order.id, status: 'approved' } }))) {
    await prisma.vendorClaim.create({
      data: {
        vendorId: beverage.id,
        orderId: c2Order.id,
        type: 'shortage',
        status: 'approved',
        amount: 480,
        notes: 'Demo approved claim',
        createdBy: c2Order.userId,
      },
    });
    console.log('  ✓ Vendor claim approved (SEED-FIN-C2)');
  }
}

async function seedPendingPayment() {
  const existing = await prisma.order.findUnique({ where: { orderNumber: 'SEED-FIN-PAY-PEND' } });
  if (existing) {
    console.log('  ↷ Pending payment order exists');
    return;
  }

  const ctx = await getCustomerContext('owner@greenleafcafe.com');
  const spice = await getVendorByEmail('owner@spicetrail.in');
  const product = await getOrderProduct(spice.id);
  const qty = Math.max(Math.ceil(num(spice.minOrderValue) / num(product.basePrice)) + 2, 6);

  const res = await orderService.create(ctx, {
    vendorOrders: [{ vendorId: spice.id, items: [{ productId: product.id, quantity: qty }] }],
    paymentMethod: 'razorpay',
  });
  const orderId = res.orders[0].id;
  await prisma.order.update({
    where: { id: orderId },
    data: { orderNumber: 'SEED-FIN-PAY-PEND', paymentStatus: 'unpaid' },
  });
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  await prisma.payment.create({
    data: {
      orderId,
      userId: ctx.userId,
      vendorId: spice.id,
      amount: order.totalAmount,
      status: 'created',
      method: 'razorpay',
      razorpayOrderId: `order_pend_${orderId.slice(0, 8)}`,
    },
  });
  console.log('  ✓ Pending Razorpay payment (SEED-FIN-PAY-PEND)');
}

async function main() {
  console.log('\n💰 Seeding finance demo data (idempotent SEED-FIN-* orders)...\n');

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@horeca1.com' } });

  await seedPlatformSettings();
  await seedCreditWallets(admin.id);
  await seedSalesTeamCommission();

  console.log('\nDelivered orders:');
  await ensureDeliveredOrder({
    orderNumber: 'SEED-FIN-O1',
    customerEmail: 'chef@tajpalace.com',
    vendorEmail: 'fresh@dailyfreshfoods.com',
    paymentMethod: 'cod',
  });
  await ensureDeliveredOrder({
    orderNumber: 'SEED-FIN-O2',
    customerEmail: 'owner@greenleafcafe.com',
    vendorEmail: 'owner@spicetrail.in',
    paymentMethod: 'razorpay',
    razorpayCaptured: true,
  });
  await ensureDeliveredOrder({
    orderNumber: 'SEED-FIN-O3',
    customerEmail: 'kitchen@grandhyatt.com',
    vendorEmail: 'info@meathouseindia.com',
    paymentMethod: 'credit',
  });
  await ensureDeliveredOrder({
    orderNumber: 'SEED-FIN-O4',
    customerEmail: 'chef@tajpalace.com',
    vendorEmail: 'sales@beverageco.in',
    paymentMethod: 'cod',
    backdateDays: 30,
  });
  await ensureDeliveredOrder({
    orderNumber: 'SEED-FIN-O5',
    customerEmail: 'owner@greenleafcafe.com',
    vendorEmail: 'fresh@dailyfreshfoods.com',
    paymentMethod: 'cod',
  });

  console.log('\nReturns & claims:');
  await seedReturns(admin.id);
  await seedClaims();

  console.log('\nPayments & settlements:');
  await seedPendingPayment();
  await seedSettlements();

  console.log('\n✅ Finance demo seed complete.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
