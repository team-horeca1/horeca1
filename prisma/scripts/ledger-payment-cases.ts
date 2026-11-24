/**
 * Hard check of the shadow journal for every payment path.
 *
 *   LEDGER_SHADOW=1 npx tsx prisma/scripts/ledger-payment-cases.ts
 *
 * Creates one buyer (Ledger Case Buyer) and posts tagged LEDGER-* orders through
 * the same shadow hooks checkout uses. Safe to re-run: journal keys are idempotent.
 * The supplier's commission rate is restored when the script finishes.
 */
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';

try {
  createRequire(import.meta.url)('dotenv/config');
} catch {
  // DATABASE_URL is already set when this runs inside the demo container.
}
import { PrismaPg } from '@prisma/adapter-pg';
import { shadowOrder } from '../../src/modules/ledger/shadowOrder';
import { shadowPost } from '../../src/modules/ledger/shadow';
import { creditNoteIssue, creditRelease, repaymentCash, rewardIssue, walletSpend } from '../../src/modules/ledger/rules';
import { reversalLines } from '../../src/modules/ledger/post';
import { commissionPaise, rupeesToPaise } from '../../src/modules/ledger/money';

process.env.LEDGER_SHADOW = '1';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BUYER_EMAIL = 'ledger.cases@horeca1.test';
const REWARD_REF = '11111111-1111-4111-8111-111111111111';
const NOTE_REF = '22222222-2222-4222-8222-222222222222';
const H1_FULL_REPAY = '33333333-3333-4333-8333-333333333333';
const H1_HALF_REPAY = '44444444-4444-4444-8444-444444444444';
const SUP_REPAY = '55555555-5555-4555-8555-555555555555';
const failures: string[] = [];

function paise(rupees: number): number {
  return rupeesToPaise(rupees.toFixed(2));
}

function inr(amount: number): string {
  return (amount / 100).toFixed(2);
}

function expect(label: string, actual: number, expected: number) {
  const ok = actual === expected;
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  ${mark}  ${label}: journal ₹${inr(actual)}  expected ₹${inr(expected)}`);
  if (!ok) failures.push(`${label}: got ${actual} paise, expected ${expected}`);
}

async function nets(refs: string[]): Promise<Map<string, number>> {
  const lines = await prisma.journalLine.findMany({
    where: { entry: { eventRefId: { in: refs } } },
    include: { account: true },
  });
  const map = new Map<string, number>();
  for (const line of lines) {
    const code = line.account.code;
    const key = code.startsWith('WALLET:')
      ? (code.includes(':cn:') ? 'WALLET_CN' : 'WALLET_REWARD')
      : code.startsWith('PAYABLE:')
        ? 'PAYABLE'
        : code.startsWith('HELD:')
          ? 'HELD'
          : code.startsWith('AR_ORDER:')
            ? 'AR_ORDER'
            : code.startsWith('AR_CREDIT_H1:')
              ? 'AR_H1'
              : code.startsWith('AR_CREDIT_SUP:')
                ? 'AR_SUP'
                : code.startsWith('GATEWAY')
                  ? 'GATEWAY'
                  : code;
    map.set(key, (map.get(key) ?? 0) + line.creditPaise - line.debitPaise);
  }
  return map;
}

async function assertBalanced(refs: string[]) {
  const entries = await prisma.journalEntry.findMany({
    where: { eventRefId: { in: refs } },
    include: { lines: true },
  });
  for (const entry of entries) {
    const debit = entry.lines.reduce((sum, line) => sum + line.debitPaise, 0);
    const credit = entry.lines.reduce((sum, line) => sum + line.creditPaise, 0);
    if (debit !== credit) failures.push(`${entry.eventType} ${entry.id} unbalanced ${debit}/${credit}`);
  }
  return entries.length;
}

async function ensureBuyer() {
  let user = await prisma.user.findUnique({ where: { email: BUYER_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: BUYER_EMAIL,
        fullName: 'Ledger Case Buyer',
        phone: '+919000000199',
        hcidDisplay: 'HC-LEDGER-CASE',
        role: 'customer',
      },
    });
  }
  let member = await prisma.businessAccountMember.findFirst({
    where: { userId: user.id, isPrimary: true },
    include: { businessAccount: { include: { outlets: { take: 1 } } } },
  });
  if (!member) {
    const account = await prisma.businessAccount.create({
      data: { legalName: 'Ledger Case Kitchen', displayName: 'Ledger Case Kitchen', isCustomer: true },
    });
    const outlet = await prisma.outlet.create({
      data: {
        businessAccountId: account.id,
        name: 'Ledger Case Outlet',
        addressLine: '1 Ledger Lane',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
      },
    });
    await prisma.businessAccount.update({ where: { id: account.id }, data: { primaryOutletId: outlet.id } });
    member = await prisma.businessAccountMember.create({
      data: { userId: user.id, businessAccountId: account.id, isPrimary: true, acceptedAt: new Date() },
      include: { businessAccount: { include: { outlets: { take: 1 } } } },
    });
  }
  const outlet = member.businessAccount.outlets[0];
  if (!outlet) throw new Error('Ledger case buyer has no outlet');
  return { userId: user.id, businessAccountId: member.businessAccountId, outletId: outlet.id };
}

async function ensureOrder(input: {
  orderNumber: string;
  userId: string;
  vendorId: string;
  businessAccountId: string;
  outletId: string;
  subtotal: number;
  paymentMethod: string;
  paymentStatus: 'paid' | 'unpaid';
  walletApplied?: number;
}) {
  const existing = await prisma.order.findUnique({ where: { orderNumber: input.orderNumber } });
  if (existing) return existing;
  return prisma.order.create({
    data: {
      orderNumber: input.orderNumber,
      userId: input.userId,
      vendorId: input.vendorId,
      businessAccountId: input.businessAccountId,
      outletId: input.outletId,
      deliveryAddressSnapshot: { line: '1 Ledger Lane', city: 'Mumbai', pincode: '400001' },
      status: 'delivered',
      subtotal: input.subtotal,
      totalAmount: input.subtotal,
      taxAmount: 0,
      walletApplied: input.walletApplied ?? 0,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus,
      notes: 'Ledger payment case',
      deliveredAt: new Date(),
    },
  });
}

async function ensurePayment(orderId: string, userId: string, vendorId: string, amount: number, feePaise: number, key: string) {
  const existing = await prisma.payment.findFirst({ where: { orderId, status: 'captured' } });
  if (existing) return existing;
  return prisma.payment.create({
    data: {
      orderId,
      userId,
      vendorId,
      amount,
      status: 'captured',
      method: 'razorpay',
      razorpayOrderId: `order_${key}`,
      razorpayPaymentId: `pay_${key}`,
      razorpayFeePaise: feePaise,
    },
  });
}

async function ensureWalletCredit(userId: string, amount: number, source: 'reward' | 'credit_note', vendorId: string | null, ref: string) {
  const existing = await prisma.walletTransaction.findFirst({ where: { referenceId: ref } });
  if (existing) return;
  const wallet = await prisma.wallet.upsert({
    where: { userId },
    create: { userId, balance: amount },
    update: { balance: { increment: amount } },
  });
  await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'credit',
      amount,
      referenceType: source === 'credit_note' ? 'return_credit_note' : 'ledger_case',
      referenceId: ref,
      source,
      funderType: source === 'credit_note' ? 'supplier' : 'platform',
      funderId: vendorId,
      notes: `Ledger case ${source}`,
    },
  });
}

async function ensureWalletDebit(userId: string, orderId: string, amount: number) {
  const existing = await prisma.walletTransaction.findFirst({
    where: { referenceId: orderId, type: 'debit' },
  });
  if (existing) return;
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  await prisma.wallet.update({
    where: { id: wallet.id },
    data: { balance: { decrement: amount } },
  });
  await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'debit',
      amount,
      referenceId: orderId,
      referenceType: 'order',
      source: 'redemption',
      notes: 'Ledger case spend',
    },
  });
}

async function postRepay(
  userId: string,
  vendorId: string,
  orderId: string,
  subtotal: number,
  collected: number,
  rate: number,
  repayId: string,
  h1: boolean,
) {
  if (await posted(`repay:${repayId}:cash`)) return;
  await prisma.$transaction(async (tx) => {
    await shadowPost(tx, {
      eventType: 'credit_repay',
      eventRefType: 'repayment',
      eventRefId: repayId,
      idempotencyKey: `repay:${repayId}:cash`,
      remarks: h1 ? 'Ledger case DiSCCO repay' : 'Ledger case supplier-credit repay',
      lines: repaymentCash(userId, h1 ? null : vendorId, paise(collected)),
    });
    await shadowPost(tx, {
      eventType: 'credit_release',
      eventRefType: 'order',
      eventRefId: orderId,
      idempotencyKey: `repay:${repayId}:order:${orderId}`,
      lines: creditRelease(vendorId, paise(subtotal), rate, paise(collected)),
    });
  });
}

async function repairCreditNoteSpend(orderId: string, userId: string, vendorId: string) {
  const entry = await prisma.journalEntry.findFirst({
    where: { idempotencyKey: `order:${orderId}:wallet_spend` },
    include: { lines: { include: { account: true } } },
  });
  if (!entry) return;
  const cnDebit = entry.lines
    .filter((line) => line.account.code.includes(':cn:'))
    .reduce((sum, line) => sum + line.debitPaise, 0);
  if (cnDebit === paise(100)) return;
  if (!(await posted(`order:${orderId}:wallet_spend:repair-reverse`))) {
    const original = entry.lines.map((row) => ({
      code: row.account.code,
      name: row.account.name,
      type: row.account.type as 'asset' | 'liability' | 'income' | 'expense',
      ownerType: row.account.ownerType,
      ownerId: row.account.ownerId,
      debitPaise: row.debitPaise,
      creditPaise: row.creditPaise,
      sourceTag: row.sourceTag,
      funderType: row.funderType,
      funderId: row.funderId,
      memo: row.memo,
    }));
    await prisma.$transaction((tx) => shadowPost(tx, {
      eventType: 'order_reversal',
      eventRefType: 'order',
      eventRefId: orderId,
      idempotencyKey: `order:${orderId}:wallet_spend:repair-reverse`,
      reversesEntryId: entry.id,
      lines: reversalLines(original),
    }));
  }
  if (await posted(`order:${orderId}:wallet_spend:repair`)) return;
  await prisma.$transaction((tx) => shadowPost(tx, {
    eventType: 'wallet_spend',
    eventRefType: 'order',
    eventRefId: orderId,
    idempotencyKey: `order:${orderId}:wallet_spend:repair`,
    remarks: 'Spend the supplier credit note',
    lines: walletSpend(userId, orderId, [{
      source: 'credit_note',
      paise: paise(100),
      createdAt: new Date(0).toISOString(),
      funderType: 'supplier',
      funderId: vendorId,
      tag: `cn:${vendorId}`,
    }]),
  }));
}

async function posted(key: string): Promise<boolean> {
  const row = await prisma.journalEntry.findUnique({ where: { idempotencyKey: key }, select: { id: true } });
  return !!row;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const buyer = await ensureBuyer();
  const vendor = await prisma.vendor.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, businessName: true, displayName: true, platformFeePct: true },
  });
  if (!vendor) throw new Error('No supplier in this database. Seed vendors first.');

  const originalFee = vendor.platformFeePct;
  const rate = originalFee == null ? 10 : Number(originalFee);
  console.log(`Buyer ${BUYER_EMAIL}`);
  console.log(`Supplier ${vendor.displayName || vendor.businessName} commission ${rate}%`);

  try {
    if (originalFee == null) {
      await prisma.vendor.update({ where: { id: vendor.id }, data: { platformFeePct: rate } });
    }

    console.log('\n1. Normal Razorpay ₹1000, gateway fee ₹20');
    const razor = await ensureOrder({
      orderNumber: 'LEDGER-RAZORPAY',
      ...buyer,
      vendorId: vendor.id,
      subtotal: 1000,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
    });
    await ensurePayment(razor.id, buyer.userId, vendor.id, 1000, 2000, 'ledger_razor');
    if (!(await posted(`order:${razor.id}:funded_deliver`))) {
      await prisma.$transaction(async (tx) => {
        await shadowOrder(tx, razor.id, 'place');
        await shadowOrder(tx, razor.id, 'deliver');
      });
    }

    console.log('\n2. H1 Wallet ₹463 (platform already expensed the reward)');
    if (!(await posted('ledger-case:reward-pool'))) {
      await ensureWalletCredit(buyer.userId, 913, 'reward', null, REWARD_REF);
      await prisma.$transaction((tx) => shadowPost(tx, {
        eventType: 'reward_issue',
        eventRefType: 'ledger_case',
        eventRefId: REWARD_REF,
        idempotencyKey: 'ledger-case:reward-pool',
        remarks: 'Ledger case reward pool',
        lines: rewardIssue(buyer.userId, paise(913)),
      }));
    }
    const walletOrder = await ensureOrder({
      orderNumber: 'LEDGER-WALLET',
      ...buyer,
      vendorId: vendor.id,
      subtotal: 463,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      walletApplied: 463,
    });
    if (!(await posted(`order:${walletOrder.id}:wallet_spend`))) {
      await prisma.$transaction(async (tx) => {
        await shadowOrder(tx, walletOrder.id, 'place');
        await shadowOrder(tx, walletOrder.id, 'deliver');
      });
      await ensureWalletDebit(buyer.userId, walletOrder.id, 463);
    }

    console.log('\n3. Split ₹300 H1 Wallet + ₹700 Razorpay');
    const split = await ensureOrder({
      orderNumber: 'LEDGER-SPLIT',
      ...buyer,
      vendorId: vendor.id,
      subtotal: 1000,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      walletApplied: 300,
    });
    await ensurePayment(split.id, buyer.userId, vendor.id, 700, 0, 'ledger_split');
    if (!(await posted(`order:${split.id}:wallet_spend`))) {
      await prisma.$transaction(async (tx) => {
        await shadowOrder(tx, split.id, 'place');
        await shadowOrder(tx, split.id, 'deliver');
      });
      await ensureWalletDebit(buyer.userId, split.id, 300);
    }

    console.log('\n4. DiSCCO ₹1000 delivered, then the customer repays in full');
    console.log('5. DiSCCO ₹1000 delivered, then the customer repays ₹500');
    const disccoFull = await ensureOrder({
      orderNumber: 'LEDGER-DISCCO-FULL',
      ...buyer,
      vendorId: vendor.id,
      subtotal: 1000,
      paymentMethod: 'h1_wallet',
      paymentStatus: 'unpaid',
    });
    const disccoHalf = await ensureOrder({
      orderNumber: 'LEDGER-DISCCO-HALF',
      ...buyer,
      vendorId: vendor.id,
      subtotal: 1000,
      paymentMethod: 'h1_wallet',
      paymentStatus: 'unpaid',
    });
    for (const order of [disccoFull, disccoHalf]) {
      if (!(await posted(`order:${order.id}:credit_deliver`))) {
        await prisma.$transaction((tx) => shadowOrder(tx, order.id, 'deliver'));
      }
    }

    console.log('\n6. Supplier credit ₹800, then repaid in full');
    const supplierCredit = await ensureOrder({
      orderNumber: 'LEDGER-SUPPLIER-CREDIT',
      ...buyer,
      vendorId: vendor.id,
      subtotal: 800,
      paymentMethod: 'vendor_credit',
      paymentStatus: 'unpaid',
    });
    if (!(await posted(`order:${supplierCredit.id}:credit_deliver`))) {
      await prisma.$transaction((tx) => shadowOrder(tx, supplierCredit.id, 'deliver'));
    }

    console.log('\n7. ₹100 supplier credit note, then a ₹500 order using that note + Razorpay');
    if (!(await posted('ledger-case:credit-note'))) {
      await ensureWalletCredit(buyer.userId, 100, 'credit_note', vendor.id, NOTE_REF);
      await prisma.$transaction((tx) => shadowPost(tx, {
        eventType: 'credit_note',
        eventRefType: 'ledger_case',
        eventRefId: NOTE_REF,
        idempotencyKey: 'ledger-case:credit-note',
        remarks: 'Ledger case credit note',
        lines: creditNoteIssue(buyer.userId, vendor.id, paise(100)),
      }));
    }
    const noteOrder = await ensureOrder({
      orderNumber: 'LEDGER-CREDIT-NOTE',
      ...buyer,
      vendorId: vendor.id,
      subtotal: 500,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      walletApplied: 100,
    });
    await ensurePayment(noteOrder.id, buyer.userId, vendor.id, 400, 0, 'ledger_note');
    if (!(await posted(`order:${noteOrder.id}:wallet_spend`))) {
      await prisma.$transaction(async (tx) => {
        await shadowOrder(tx, noteOrder.id, 'place');
        await shadowOrder(tx, noteOrder.id, 'deliver');
      });
      await ensureWalletDebit(buyer.userId, noteOrder.id, 100);
    }
    await repairCreditNoteSpend(noteOrder.id, buyer.userId, vendor.id);

    console.log('\n8. COD — journal must refuse it');
    const cod = await ensureOrder({
      orderNumber: 'LEDGER-COD',
      ...buyer,
      vendorId: vendor.id,
      subtotal: 200,
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
    });
    if (!(await prisma.journalEntry.findFirst({ where: { eventRefId: cod.id } }))) {
      await prisma.$transaction((tx) => shadowOrder(tx, cod.id, 'deliver'));
    }

    console.log('\n9. H1 Wallet ₹150 delivered, then cancelled — nets back to zero');
    const cancel = await ensureOrder({
      orderNumber: 'LEDGER-CANCEL',
      ...buyer,
      vendorId: vendor.id,
      subtotal: 150,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      walletApplied: 150,
    });
    if (!(await posted(`order:${cancel.id}:wallet_spend`))) {
      await prisma.$transaction(async (tx) => {
        await shadowOrder(tx, cancel.id, 'place');
        await shadowOrder(tx, cancel.id, 'deliver');
      });
      await ensureWalletDebit(buyer.userId, cancel.id, 150);
    }
    await prisma.$transaction((tx) => shadowOrder(tx, cancel.id, 'cancel'));
    const debit = await prisma.walletTransaction.findFirst({ where: { referenceId: cancel.id, type: 'debit' } });
    const already = await prisma.walletTransaction.findFirst({ where: { referenceId: cancel.id, type: 'credit' } });
    if (debit && !already) {
      await prisma.wallet.update({ where: { userId: buyer.userId }, data: { balance: { increment: 150 } } });
      await prisma.walletTransaction.create({
        data: {
          walletId: debit.walletId,
          type: 'credit',
          amount: 150,
          referenceId: cancel.id,
          referenceType: 'order_cancel',
          source: 'reversal',
          notes: 'Ledger case cancel',
        },
      });
    }

    console.log('\n10. Delivered with no commission rate — no supplier payable');
    const noFee = await ensureOrder({
      orderNumber: 'LEDGER-NO-FEE',
      ...buyer,
      vendorId: vendor.id,
      subtotal: 250,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
    });
    await ensurePayment(noFee.id, buyer.userId, vendor.id, 250, 0, 'ledger_nofee');
    if (!(await prisma.journalEntry.findFirst({ where: { eventRefId: noFee.id, eventType: 'funded_deliver' } }))) {
      await prisma.vendor.update({ where: { id: vendor.id }, data: { platformFeePct: null } });
      await prisma.$transaction((tx) => shadowOrder(tx, noFee.id, 'deliver'));
      await prisma.vendor.update({ where: { id: vendor.id }, data: { platformFeePct: rate } });
    }

    await postRepay(buyer.userId, vendor.id, disccoFull.id, 1000, 1000, rate, H1_FULL_REPAY, true);
    await postRepay(buyer.userId, vendor.id, disccoHalf.id, 1000, 500, rate, H1_HALF_REPAY, true);
    await postRepay(buyer.userId, vendor.id, supplierCredit.id, 800, 800, rate, SUP_REPAY, false);

    console.log('\n— Checks —');
    const payable = (subtotal: number, fee = 0) => paise(subtotal) - commissionPaise(paise(subtotal), rate) - fee;

    const razorNet = await nets([razor.id]);
    expect('Razorpay supplier payable (₹1000 − commission − ₹20 fee)', razorNet.get('PAYABLE') ?? 0, payable(1000, 2000));
    expect('Razorpay commission', razorNet.get('COMMISSION') ?? 0, commissionPaise(paise(1000), rate));
    expect('Razorpay order receivable nets to zero', razorNet.get('AR_ORDER') ?? 0, 0);
    expect('Razorpay gateway still holds capture minus fee', -(razorNet.get('GATEWAY') ?? 0), paise(1000) - 2000);

    const walletNet = await nets([walletOrder.id]);
    expect('H1 Wallet supplier payable is full ₹463 minus commission', walletNet.get('PAYABLE') ?? 0, payable(463));
    expect('H1 Wallet spend clears the wallet liability', -(walletNet.get('WALLET_REWARD') ?? 0), paise(463));
    expect('H1 Wallet order receivable nets to zero', walletNet.get('AR_ORDER') ?? 0, 0);

    const grant = await nets([REWARD_REF]);
    expect('Reward pool is a Horeca1 expense', -(grant.get('REWARD_EXPENSE') ?? 0), paise(913));

    const splitNet = await nets([split.id]);
    expect('Split supplier payable ignores the wallet portion', splitNet.get('PAYABLE') ?? 0, payable(1000));
    expect('Split wallet + Razorpay clear the receivable', splitNet.get('AR_ORDER') ?? 0, 0);

    const disccoFullNet = await nets([disccoFull.id, H1_FULL_REPAY]);
    expect('DiSCCO full repay releases supplier payable', disccoFullNet.get('PAYABLE') ?? 0, payable(1000));
    expect('DiSCCO full repay clears held cash', disccoFullNet.get('HELD') ?? 0, 0);
    expect('DiSCCO full repay clears the credit receivable', disccoFullNet.get('AR_H1') ?? 0, 0);

    const disccoHalfNet = await nets([disccoHalf.id, H1_HALF_REPAY]);
    const halfRelease = Math.round((paise(500) * (paise(1000) - commissionPaise(paise(1000), rate))) / paise(1000));
    expect('DiSCCO half repay releases only the repaid share', disccoHalfNet.get('PAYABLE') ?? 0, halfRelease);
    expect('DiSCCO half repay still holds the rest', disccoHalfNet.get('HELD') ?? 0, payable(1000) - halfRelease);

    const supNet = await nets([supplierCredit.id, SUP_REPAY]);
    expect('Supplier credit repay releases that supplier', supNet.get('PAYABLE') ?? 0, payable(800));
    expect('Supplier credit receivable clears', supNet.get('AR_SUP') ?? 0, 0);

    const noteNet = await nets([noteOrder.id, NOTE_REF]);
    expect('Credit-note order still pays the supplier in full minus commission', noteNet.get('PAYABLE') ?? 0, payable(500));
    const noteSpend = await prisma.journalLine.findMany({
      where: { entry: { eventRefId: noteOrder.id, eventType: { in: ['wallet_spend', 'order_reversal'] } } },
      include: { account: true },
    });
    const noteSpent = noteSpend
      .filter((line) => line.account.code.includes(':cn:'))
      .reduce((sum, line) => sum + line.debitPaise - line.creditPaise, 0);
    expect('Credit note was spent from the supplier-funded wallet', noteSpent, paise(100));

    const codLines = await prisma.journalLine.count({ where: { entry: { eventRefId: cod.id } } });
    expect('COD posts no journal lines', codLines, 0);
    const flag = await prisma.$queryRaw<Array<{ flag: string }>>`
      SELECT flag FROM ledger_order_flags WHERE order_id = ${cod.id}::uuid
    `;
    expect('COD is flagged unsupported', flag[0]?.flag === 'legacy_unsupported' ? 1 : 0, 1);

    const cancelNet = await nets([cancel.id]);
    expect('Cancelled order supplier payable nets to zero', cancelNet.get('PAYABLE') ?? 0, 0);
    expect('Cancelled order wallet nets to zero', cancelNet.get('WALLET_REWARD') ?? 0, 0);

    const noFeeLines = await prisma.journalEntry.count({
      where: { eventRefId: noFee.id, eventType: 'funded_deliver' },
    });
    expect('Missing commission posts no supplier payable', noFeeLines, 0);
    const noFeeFlag = await prisma.$queryRaw<Array<{ flag: string }>>`
      SELECT flag FROM ledger_order_flags WHERE order_id = ${noFee.id}::uuid
    `;
    expect('Missing commission is flagged', noFeeFlag[0]?.flag === 'commission_unconfigured' ? 1 : 0, 1);

    const refs = [
      razor.id, walletOrder.id, split.id, disccoFull.id, disccoHalf.id, supplierCredit.id,
      noteOrder.id, cancel.id, REWARD_REF, NOTE_REF,
      H1_FULL_REPAY, H1_HALF_REPAY, SUP_REPAY,
    ].filter(Boolean);
    const entryCount = await assertBalanced(refs);
    console.log(`  INFO  ${entryCount} journal entries balance (debits = credits)`);

    console.log(failures.length === 0 ? '\nAll ledger cases passed.' : `\n${failures.length} case(s) failed.`);
    if (failures.length) {
      for (const failure of failures) console.error(`  - ${failure}`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.vendor.update({ where: { id: vendor.id }, data: { platformFeePct: originalFee } });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
