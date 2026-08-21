import { prisma } from '../src/lib/prisma';
import { creditWalletService } from '../src/modules/credit/creditWallet.service';
import { randomUUID } from 'crypto';

const taj = '9bfe166c-af85-431d-92db-ab1214c915c1';
const vendorA = '29b369f5-47a4-4f02-ba9d-ff940071203f';
const vendorB = 'cdb8833d-30ba-4155-8222-086818f8fe0a';

async function snap(label: string) {
  const rows = await prisma.creditWallet.findMany({
    where: { userId: taj },
    select: {
      vendorId: true,
      creditLimit: true,
      availableCredit: true,
      reservedAmount: true,
      outstandingAmount: true,
      usedCredit: true,
      status: true,
      creditSource: true,
    },
  });
  console.log(
    label,
    rows.map((r) => ({
      vendor: r.vendorId === vendorA ? 'A' : r.vendorId === vendorB ? 'B' : r.vendorId,
      limit: Number(r.creditLimit),
      avail: Number(r.availableCredit),
      reserved: Number(r.reservedAmount),
      out: Number(r.outstandingAmount),
      used: Number(r.usedCredit),
      status: r.status,
      source: r.creditSource,
    })),
  );
}

async function main() {
  await creditWalletService.assignCredit(
    taj,
    vendorB,
    5000,
    { repaymentMode: 'REPAY_BEFORE_NEXT_USE', creditTenureDays: 5 },
    'SYSTEM',
    'QA supplier B line',
  );
  await snap('after B assign');

  const orderId = randomUUID();
  await creditWalletService.debitWallet(taj, vendorA, 2000, orderId);
  await snap('after A reserve 2000');

  await prisma.$transaction(async (tx) => {
    await creditWalletService.convertReservedToOutstanding(orderId, taj, vendorA, tx);
  });
  await snap('after A convert');

  try {
    await creditWalletService.assignCredit(taj, vendorA, 1000, {}, 'SYSTEM', 'should fail');
    console.log('LIMIT_FAIL_UNEXPECTED_OK');
  } catch (e) {
    console.log('LIMIT_REJECT', e instanceof Error ? e.message : String(e));
  }

  const wa = await prisma.creditWallet.findFirst({ where: { userId: taj, vendorId: vendorA } });
  if (!wa) throw new Error('missing wallet A');

  await creditWalletService.setWalletStatus(wa.id, 'SUSPENDED', 'SYSTEM', 'QA suspend');
  try {
    await creditWalletService.debitWallet(taj, vendorA, 100, randomUUID());
    console.log('SUSPEND_FAIL_UNEXPECTED_OK');
  } catch (e) {
    console.log('SUSPEND_BLOCK', e instanceof Error ? e.message : String(e));
  }
  await creditWalletService.setWalletStatus(wa.id, 'ACTIVE', 'SYSTEM', 'QA reactivate');

  await creditWalletService.applyRepayment(wa.id, 500, 'CASH', undefined, undefined, 'QA partial');
  await snap('after partial repay 500');

  const oid2 = randomUUID();
  await creditWalletService.debitWallet(taj, vendorA, 300, oid2);
  await prisma.$transaction(async (tx) => {
    await creditWalletService.reverseOrderDebit(oid2, taj, vendorA, tx);
  });
  await snap('after reserve+cancel 300');

  const cfg = await creditWalletService.resolveWalletConfig(wa.id);
  console.log('EFFECTIVE', {
    tenure: cfg.creditTenureDays,
    grace: cfg.gracePeriodDays,
    repay: cfg.repaymentMode,
    interest: cfg.interestRatePct,
    provenance: cfg.provenance,
  });

  const green = await prisma.user.findUnique({ where: { email: 'owner@greenleafcafe.com' } });
  if (!green) throw new Error('missing greenleaf');
  await creditWalletService.assignCredit(
    green.id,
    vendorA,
    1000,
    { repaymentMode: 'ALLOW_USAGE_TILL_DUE' },
    'SYSTEM',
    'race wallet',
  );
  const results = await Promise.allSettled([
    creditWalletService.debitWallet(green.id, vendorA, 700, randomUUID()),
    creditWalletService.debitWallet(green.id, vendorA, 700, randomUUID()),
  ]);
  console.log(
    'RACE',
    results.map((r) => (r.status === 'fulfilled' ? 'OK' : r.reason instanceof Error ? r.reason.message : 'ERR')),
  );
  const raceW = await prisma.creditWallet.findFirst({ where: { userId: green.id, vendorId: vendorA } });
  console.log('RACE_BAL', {
    avail: Number(raceW!.availableCredit),
    reserved: Number(raceW!.reservedAmount),
    used: Number(raceW!.usedCredit),
  });

  // RBAC-ish: vendor A cannot set status on B wallet
  const wb = await prisma.creditWallet.findFirst({ where: { userId: taj, vendorId: vendorB } });
  try {
    await creditWalletService.setWalletStatus(wb!.id, 'SUSPENDED', 'SYSTEM', 'cross', vendorA);
    console.log('CROSS_SUPPLIER_UNEXPECTED_OK');
  } catch (e) {
    console.log('CROSS_SUPPLIER_BLOCK', e instanceof Error ? e.message : String(e));
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
