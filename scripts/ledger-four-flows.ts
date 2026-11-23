/**
 * Local-only money check. Places four orders through OrderService, marks them
 * delivered, and prints the rupees the payout, credit, and wallet books actually
 * wrote. Does not settle a payout and does not touch a remote database.
 *
 *   npx tsx scripts/ledger-four-flows.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { orderService } from '../src/modules/order/order.service';
import { creditWalletService } from '../src/modules/credit/creditWallet.service';
import { promotionService } from '../src/modules/promotion/promotion.service';

const USER = 'f1907285-4ace-4c31-8a31-c7ddb1b8e199';
const ACCOUNT = 'bde0a842-9d7e-4e88-a39f-279c45fb7a1b';
const OUTLET = '820ae553-d64c-480c-b50a-69588c76f890';
const VENDOR = '68ed055d-46ac-436c-9927-c95e69bf8cea';
const PRODUCT = '4a0e8bc1-5daf-4a3a-acb5-47d905ef6869';
const ADMIN = 'b4d67165-07f4-4473-b8ea-102e3887f520';
const FEE_PAISE = 236;

const n = (v: unknown) => Number(v ?? 0);
const inr = (v: unknown) => `₹${n(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function walletBalance() {
  const row = await prisma.wallet.findUnique({ where: { userId: USER } });
  return n(row?.balance);
}

async function creditState(vendorId: string | null) {
  const row = await prisma.creditWallet.findFirst({ where: { userId: USER, vendorId } });
  if (!row) return null;
  return {
    limit: n(row.creditLimit),
    available: n(row.availableCredit),
    reserved: n(row.reservedAmount),
    outstanding: n(row.outstandingAmount),
  };
}

async function snapshot(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      orderNumber: true,
      paymentMethod: true,
      status: true,
      paymentStatus: true,
      subtotal: true,
      walletApplied: true,
      totalAmount: true,
    },
  });
  const line = await prisma.supplierPayableLine.findUnique({ where: { orderId } });
  const vendorTxns = await prisma.vendorWalletTxn.findMany({
    where: { referenceId: orderId },
    select: { type: true, amount: true, referenceType: true },
  });
  const h1Txns = await prisma.walletTransaction.findMany({
    where: { referenceId: orderId },
    select: { type: true, amount: true, referenceType: true },
  });
  return { order, line, vendorTxns, h1Txns };
}

function expect(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.02;
  console.log(`${ok ? 'OK' : 'FAIL'}  ${label}: ${inr(actual)}  expected ${inr(expected)}`);
  return ok;
}

async function place(paymentMethod: string, useWallet = false) {
  const created = await orderService.create(
    { userId: USER, businessAccountId: ACCOUNT, outletId: OUTLET },
    {
      paymentMethod,
      useWallet,
      vendorOrders: [{
        vendorId: VENDOR,
        items: [{ productId: PRODUCT, quantity: 1 }],
        deliveryMode: 'supplier_delivery',
        deliveryDate: '2026-11-30',
        notes: `LEDGER-CHECK ${paymentMethod}${useWallet ? ' +wallet' : ''}`,
      }],
    },
  );
  const order = created.orders[0];
  if (!order) throw new Error('no order created');
  return order.id;
}

async function captureOnline(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { totalAmount: true, vendorId: true, userId: true },
  });
  const amount = n(order.totalAmount);
  if (amount <= 0) return amount;
  await prisma.payment.create({
    data: {
      orderId,
      vendorId: order.vendorId,
      userId: order.userId,
      amount,
      status: 'captured',
      method: 'online',
      razorpayPaymentId: `pay_ledger_${orderId.slice(0, 8)}`,
      razorpayFeePaise: FEE_PAISE,
    },
  });
  await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'paid' } });
  return amount;
}

async function deliver(orderId: string) {
  await orderService.updateStatus(orderId, VENDOR, 'delivered', 'ledger check', undefined, true, ADMIN);
}

async function main() {
  const previousFee = await prisma.vendor.findUnique({
    where: { id: VENDOR },
    select: { platformFeePct: true },
  });
  await prisma.vendor.update({
    where: { id: VENDOR },
    data: { platformFeePct: '10.00' },
  });

  const results: boolean[] = [];
  try {
    console.log('\nSupplier for this check: Bar & Brew Supply Co. Commission set to 10% for these orders only.\n');

    await creditWalletService.assignCredit(USER, VENDOR, 10000, {}, ADMIN, 'Ledger flow check');
    const beforeGrant = await walletBalance();
    await promotionService.grantDirectIncentive({
      adminId: ADMIN,
      userId: USER,
      amount: 150,
      destination: 'wallet',
      notes: 'LEDGER-CHECK wallet seed',
    });
    const seeded = await walletBalance();
    results.push(expect('Wallet grant adds ₹150', seeded - beforeGrant, 150));

    const beforeSupplier = await creditState(VENDOR);
    const beforeDiscco = await creditState(null);
    console.log('Supplier credit before', beforeSupplier);
    console.log('DiSCCO before', beforeDiscco);

    const onlineId = await place('online');
    const onlineCash = await captureOnline(onlineId);
    await deliver(onlineId);
    const online = await snapshot(onlineId);
    console.log('\n1. ONLINE', online.order.orderNumber, 'subtotal', inr(online.order.subtotal), 'cash', inr(onlineCash));
    const onlineBase = n(online.line?.recognisedBase);
    const onlineCommission = Math.round(onlineBase * 0.1 * 100) / 100;
    const onlineFee = FEE_PAISE / 100;
    results.push(expect('Online cash collected', n(online.line?.collectedAmount), onlineCash));
    results.push(expect('Online commission 10%', n(online.line?.commissionAmount), onlineCommission));
    results.push(expect('Online Razorpay fee', n(online.line?.razorpayFee), onlineFee));
    results.push(expect('Online payout', n(online.line?.netPayable), Math.round((onlineBase - onlineCommission - onlineFee) * 100) / 100));
    console.log('   vendor wallet rows', online.vendorTxns.map((t) => `${t.type} ${inr(t.amount)}`).join(', ') || 'none');

    const supplierId = await place('credit');
    await deliver(supplierId);
    const supplier = await snapshot(supplierId);
    const supplierCredit = await creditState(VENDOR);
    console.log('\n2. SUPPLIER CREDIT', supplier.order.orderNumber, 'total', inr(supplier.order.totalAmount));
    results.push(expect('Supplier-credit payout (no cash)', n(supplier.line?.netPayable), 0));
    results.push(expect(
      'Supplier credit outstanding rose by the order',
      n(supplierCredit?.outstanding) - n(beforeSupplier?.outstanding),
      n(supplier.order.totalAmount),
    ));
    console.log('   credit now', supplierCredit);

    const disccoId = await place('wallet');
    await deliver(disccoId);
    const discco = await snapshot(disccoId);
    const disccoCredit = await creditState(null);
    console.log('\n3. DiSCCO', discco.order.orderNumber, 'total', inr(discco.order.totalAmount));
    results.push(expect('DiSCCO payout (no cash)', n(discco.line?.netPayable), 0));
    results.push(expect(
      'DiSCCO outstanding rose by the order',
      n(disccoCredit?.outstanding) - n(beforeDiscco?.outstanding),
      n(discco.order.totalAmount),
    ));
    console.log('   credit now', disccoCredit);
    console.log('   vendor wallet rows', discco.vendorTxns.map((t) => `${t.type} ${inr(t.amount)}`).join(', ') || 'none');

    const beforeSpend = await walletBalance();
    const mixedId = await place('online', true);
    const mixed = await prisma.order.findUniqueOrThrow({
      where: { id: mixedId },
      select: { subtotal: true, walletApplied: true, totalAmount: true, orderNumber: true },
    });
    const spent = n(mixed.walletApplied);
    const cash = await captureOnline(mixedId);
    await deliver(mixedId);
    const mixedSnap = await snapshot(mixedId);
    const afterSpend = await walletBalance();
    console.log('\n4. WALLET + ONLINE', mixed.orderNumber, 'subtotal', inr(mixed.subtotal), 'wallet', inr(spent), 'cash', inr(cash));
    results.push(expect('Wallet spent', beforeSpend - afterSpend, spent));
    results.push(expect('Payout uses cash, not the wallet spend', n(mixedSnap.line?.collectedAmount), cash));
    const mixedBase = n(mixedSnap.line?.recognisedBase);
    const mixedCommission = Math.round(mixedBase * 0.1 * 100) / 100;
    results.push(expect(
      'Mixed payout',
      n(mixedSnap.line?.netPayable),
      Math.round((mixedBase - mixedCommission - onlineFee) * 100) / 100,
    ));
    console.log('   H1 rows', mixedSnap.h1Txns.map((t) => `${t.referenceType} ${t.type} ${inr(t.amount)}`).join(', ') || 'none');

    const failed = results.filter((ok) => !ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    if (failed) process.exitCode = 1;
  } finally {
    await prisma.vendor.update({
      where: { id: VENDOR },
      data: { platformFeePct: previousFee?.platformFeePct ?? null },
    });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
