/**
 * Self-contained verification of the Promo Engine Phase 1 (coupons + cashback).
 * Creates a throwaway customer + vendor + product, exercises the full money
 * lifecycle through the REAL OrderService/promotionService code paths, asserts
 * each invariant (prints ✓/✗), then deletes every row it created.
 *
 * Requires the DB (run via tunnel) AND the 20260612_promo_engine_phase1
 * migration applied:
 *
 *   npm run tunnel          # separate terminal
 *   npx prisma migrate deploy
 *   npx tsx prisma/scripts/verify-promo-engine.ts
 *
 * Exit code 0 = all checks passed, 1 = at least one failed.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { OrderService } from '../../src/modules/order/order.service';
import { promotionService } from '../../src/modules/promotion/promotion.service';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const orderService = new OrderService();

const num = (d: { toString(): string } | number | null | undefined) => (d == null ? 0 : Number(d));

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

async function main() {
  const ts = Date.now();
  const tag = ts.toString(36).toUpperCase();

  // ── Throwaway fixtures ────────────────────────────────────────────────────
  const customer = await prisma.user.create({
    data: {
      email: `verify-promo+${ts}@horeca1.test`, fullName: 'Promo Verify Customer',
      role: 'customer', hcidDisplay: `HC-PRM-${tag}`.slice(0, 20),
    },
  });
  const customerBA = await prisma.businessAccount.create({
    data: { legalName: `Promo Verify Foods ${tag}` },
  });
  const outlet = await prisma.outlet.create({
    data: {
      businessAccountId: customerBA.id, name: 'Promo Verify Outlet',
      addressLine: '1 Test Street', city: 'Mumbai', state: 'MH', pincode: '400001',
    },
  });

  const vendorUser = await prisma.user.create({
    data: {
      email: `verify-promo-vendor+${ts}@horeca1.test`, fullName: 'Promo Verify Vendor',
      role: 'vendor', hcidDisplay: `HC-PRV-${tag}`.slice(0, 20),
    },
  });
  const vendorBA = await prisma.businessAccount.create({
    data: { legalName: `Promo Verify Supplies ${tag}`, isVendor: true, isCustomer: false },
  });
  const vendorOutlet = await prisma.outlet.create({
    data: {
      businessAccountId: vendorBA.id,
      name: 'Promo Verify Warehouse',
      addressLine: '2 Test Street',
      city: 'Mumbai',
      state: 'MH',
      pincode: '400001',
    },
  });
  await prisma.businessAccount.update({
    where: { id: vendorBA.id },
    data: { primaryOutletId: vendorOutlet.id },
  });
  const vendor = await prisma.vendor.create({
    data: {
      userId: vendorUser.id, businessAccountId: vendorBA.id,
      businessName: `Promo Verify Supplies ${tag}`, slug: `promo-verify-${ts}`,
      minOrderValue: 0, isActive: true, isVerified: true,
    },
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id, name: `Promo Verify Rice ${tag}`, slug: `promo-verify-rice-${ts}`,
      basePrice: 100, taxPercent: 0, isActive: true, approvalStatus: 'approved',
    },
  });
  await prisma.inventory.create({
    data: { productId: product.id, vendorId: vendor.id, outletId: vendorOutlet.id, qtyAvailable: 100 },
  });

  const coupon = await prisma.coupon.create({
    data: {
      code: `PROMOTEST${tag}`, name: 'Verify flat 100', discountType: 'flat',
      discountValue: 100, isActive: true,
    },
  });
  const campaign = await prisma.cashbackCampaign.create({
    data: {
      name: `Verify cashback ${tag}`, cashbackType: 'flat', cashbackValue: 50,
      destination: 'wallet', isActive: true,
    },
  });

  const ctx = { userId: customer.id, businessAccountId: customerBA.id, outletId: outlet.id };
  const vendorOrders = [{ vendorId: vendor.id, items: [{ productId: product.id, quantity: 10 }] }];
  console.log(`\nFixtures ready (coupon ${coupon.code})\n`);

  // ── 1. Checkout with coupon ───────────────────────────────────────────────
  const res1 = await orderService.create(ctx, {
    vendorOrders, paymentMethod: 'cod', couponCode: coupon.code,
  });
  const order1 = await prisma.order.findUniqueOrThrow({ where: { id: res1.orders[0].id } });
  check('order subtotal ₹1000', num(order1.subtotal) === 1000, `got ${num(order1.subtotal)}`);
  check('coupon discount ₹100 on order', num(order1.couponDiscount) === 100, `got ${num(order1.couponDiscount)}`);
  check('coupon code snapshotted', order1.couponCode === coupon.code, String(order1.couponCode));
  check('total payable ₹900', num(order1.totalAmount) === 900, `got ${num(order1.totalAmount)}`);

  const redemption1 = await prisma.couponRedemption.findUnique({ where: { orderId: order1.id } });
  check('redemption row active', redemption1?.status === 'active' && num(redemption1.amount) === 100);
  const couponAfter1 = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
  check('coupon usedCount = 1', couponAfter1.usedCount === 1, `got ${couponAfter1.usedCount}`);

  const entry1 = await prisma.cashbackEntry.findUnique({ where: { orderId: order1.id } });
  check('cashback entry pending ₹50 (computed on ₹900 base)', entry1?.status === 'pending' && num(entry1.amount) === 50);

  // ── 2. Deliver → cashback settles into the Rewards Wallet ────────────────
  for (const s of ['confirmed', 'processing', 'shipped', 'delivered']) {
    await orderService.updateStatus(order1.id, vendor.id, s);
  }
  const entry1After = await prisma.cashbackEntry.findUniqueOrThrow({ where: { orderId: order1.id } });
  check('entry credited on delivery', entry1After.status === 'credited' && !!entry1After.walletTxnId);
  const wallet1 = await prisma.wallet.findUnique({ where: { userId: customer.id } });
  check('wallet balance ₹50', num(wallet1?.balance) === 50, `got ${num(wallet1?.balance)}`);
  const notif = await prisma.notification.findFirst({ where: { userId: customer.id, type: 'promo' } });
  check('in-app cashback notification created', !!notif);

  // ── 3. Checkout with coupon + wallet redemption ──────────────────────────
  const res2 = await orderService.create(ctx, {
    vendorOrders, paymentMethod: 'cod', couponCode: coupon.code, useWallet: true,
  });
  const order2 = await prisma.order.findUniqueOrThrow({ where: { id: res2.orders[0].id } });
  check('order2 wallet applied ₹50', num(order2.walletApplied) === 50, `got ${num(order2.walletApplied)}`);
  check('order2 payable ₹850 (1000 − 100 coupon − 50 wallet)', num(order2.totalAmount) === 850, `got ${num(order2.totalAmount)}`);
  const wallet2 = await prisma.wallet.findUniqueOrThrow({ where: { userId: customer.id } });
  check('wallet drained to ₹0', num(wallet2.balance) === 0, `got ${num(wallet2.balance)}`);
  const couponAfter2 = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
  check('coupon usedCount = 2', couponAfter2.usedCount === 2, `got ${couponAfter2.usedCount}`);

  // ── 4. Cancel order2 → every promo side-effect reverses ──────────────────
  await orderService.updateStatus(order2.id, vendor.id, 'cancelled', 'verify script');
  const wallet3 = await prisma.wallet.findUniqueOrThrow({ where: { userId: customer.id } });
  check('wallet refunded to ₹50', num(wallet3.balance) === 50, `got ${num(wallet3.balance)}`);
  const redemption2 = await prisma.couponRedemption.findUnique({ where: { orderId: order2.id } });
  check('order2 redemption reversed', redemption2?.status === 'reversed');
  const couponAfter3 = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
  check('coupon usedCount back to 1', couponAfter3.usedCount === 1, `got ${couponAfter3.usedCount}`);
  const entry2 = await prisma.cashbackEntry.findUnique({ where: { orderId: order2.id } });
  check('order2 cashback cancelled', entry2?.status === 'cancelled');
  const campaignAfter = await prisma.cashbackCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
  check('campaign budget tracks net ₹50 / 1 earn', num(campaignAfter.usedAmount) === 50 && campaignAfter.usedCount === 1,
    `amount ${num(campaignAfter.usedAmount)}, count ${campaignAfter.usedCount}`);

  // ── 5. Direct grants (wallet instant + UPI claim → mark paid) ────────────
  const grantWallet = await promotionService.grantDirectIncentive({
    adminId: vendorUser.id, userId: customer.id, amount: 25, destination: 'wallet', notes: 'verify',
  });
  const wallet4 = await prisma.wallet.findUniqueOrThrow({ where: { userId: customer.id } });
  check('wallet grant credited instantly (₹75 total)', num(wallet4.balance) === 75 && grantWallet.status === 'credited',
    `got ${num(wallet4.balance)}`);

  const grantUpi = await promotionService.grantDirectIncentive({
    adminId: vendorUser.id, userId: customer.id, amount: 30, destination: 'upi', notes: 'verify',
  });
  check('UPI grant starts approved (awaiting claim)', grantUpi.status === 'approved');
  await promotionService.claimUpi(grantUpi.id, customer.id, 'verify@upi');
  const paid = await promotionService.markEntryPaid(grantUpi.id, vendorUser.id, `UTR${tag}`);
  check('UPI grant claim + mark-paid', paid.status === 'paid' && paid.upiId === 'verify@upi' && paid.paidReference === `UTR${tag}`);

  // ── Cleanup (dependency order) ────────────────────────────────────────────
  console.log('\nCleaning up…');
  const userIds = [customer.id, vendorUser.id];
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.cashbackEntry.deleteMany({ where: { userId: customer.id } });
  await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: customer.id } } });
  await prisma.wallet.deleteMany({ where: { userId: customer.id } });
  await prisma.couponRedemption.deleteMany({ where: { couponId: coupon.id } });
  await prisma.orderItem.deleteMany({ where: { order: { userId: customer.id } } });
  await prisma.order.deleteMany({ where: { userId: customer.id } });
  await prisma.cashbackCampaign.delete({ where: { id: campaign.id } });
  await prisma.coupon.delete({ where: { id: coupon.id } });
  await prisma.inventory.deleteMany({ where: { vendorId: vendor.id } });
  await prisma.product.deleteMany({ where: { vendorId: vendor.id } });
  await prisma.vendor.delete({ where: { id: vendor.id } });
  await prisma.outlet.delete({ where: { id: outlet.id } });
  await prisma.businessAccount.deleteMany({ where: { id: { in: [customerBA.id, vendorBA.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  console.log('Cleanup done.');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
