/**
 * Self-contained verification of the unified CreditWallet engine.
 * Creates a throwaway test user, exercises the full money lifecycle, asserts
 * each invariant (prints ✓/✗), then deletes every row it created in dependency
 * order. No DB tunnel here — run it against the prod DB via the tunnel:
 *
 *   npx tsx prisma/scripts/verify-credit-wallet.ts
 *
 * Exit code 0 = all checks passed, 1 = at least one failed.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { creditWalletService } from '../../src/modules/credit/creditWallet.service';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const num = (d: { toString(): string } | number | null | undefined) => (d == null ? 0 : Number(d));
const DAY_MS = 86_400_000;

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const ts = Date.now();
  const email = `verify-credit+${ts}@horeca1.test`;

  // ── Create throwaway test user ──────────────────────────────────────────────
  const user = await prisma.user.create({
    data: {
      email,
      fullName: 'Credit Wallet Verify',
      role: 'customer',
      hcidDisplay: `HC-VERIFY-${ts.toString(36).toUpperCase()}`.slice(0, 20),
    },
  });
  console.log(`\nTest user: ${user.id} <${email}>\n`);

  const userId = user.id;
  const LIMIT = 1000;
  const cfg = await creditWalletService.getGlobalConfig();
  console.log(
    `Global config: repaymentMode=${cfg.repaymentMode} grace=${cfg.gracePeriodDays}d ` +
      `interest=${cfg.interestRatePct}%/${cfg.interestFrequencyDays}d penalty=₹${cfg.penaltyAmount}/${cfg.penaltyFrequencyDays}d ` +
      `blacklistAfter=${cfg.blacklistDays}d\n`,
  );

  try {
    // (a) assignCredit → wallet with availableCredit == limit ─────────────────
    const w0 = await creditWalletService.assignCredit(userId, null, LIMIT, {}, 'VERIFY', 'verify assign');
    const walletId = w0.id;
    check(
      '(a) assignCredit creates wallet with availableCredit == limit',
      num(w0.availableCredit) === LIMIT && num(w0.creditLimit) === LIMIT && num(w0.usedCredit) === 0,
      `available=${num(w0.availableCredit)} limit=${num(w0.creditLimit)} used=${num(w0.usedCredit)}`,
    );

    // (b) debitWallet reserves credit (available ↓, reserved ↑; outstanding stays 0 until delivery)
    const orderId1 = `verify-order-1-${ts}`;
    const DEBIT1 = 400;
    await creditWalletService.debitWallet(userId, null, DEBIT1, orderId1);
    let w = await prisma.creditWallet.findUniqueOrThrow({ where: { id: walletId } });
    check(
      '(b) debitWallet reserves credit (available ↓, reserved ↑, outstanding 0)',
      num(w.availableCredit) === LIMIT - DEBIT1
        && num(w.reservedAmount) === DEBIT1
        && num(w.outstandingAmount) === 0
        && num(w.usedCredit) === DEBIT1,
      `available=${num(w.availableCredit)} reserved=${num(w.reservedAmount)} outstanding=${num(w.outstandingAmount)}`,
    );

    const mode = (await creditWalletService.resolveWalletConfig(walletId)).repaymentMode;

    // (c) REPAY_BEFORE_NEXT_USE: 2nd debit allowed while only reserved (not yet outstanding)
    if (mode === 'REPAY_BEFORE_NEXT_USE') {
      let secondReserveOk = false;
      try {
        await creditWalletService.debitWallet(userId, null, 100, `verify-order-2-${ts}`);
        secondReserveOk = true;
      } catch {
        secondReserveOk = false;
      }
      check(
        '(c1) 2nd debit allowed while first order is only reserved (not outstanding yet)',
        secondReserveOk,
        secondReserveOk ? 'reserved second order OK' : 'unexpected block on reserve-only',
      );
      // Release the second reservation so later steps stay isolated.
      await prisma.$transaction(async (tx) => {
        await creditWalletService.reverseOrderDebit(`verify-order-2-${ts}`, userId, null, tx);
      });
    } else {
      check('(c1) skipped — repayment mode is ' + mode, true);
    }

    // Convert first order → outstanding (simulates delivery)
    await prisma.$transaction(async (tx) => {
      await creditWalletService.convertReservedToOutstanding(orderId1, userId, null, tx);
    });
    w = await prisma.creditWallet.findUniqueOrThrow({ where: { id: walletId } });
    check(
      '(c2) delivery converts reserved → outstanding',
      num(w.outstandingAmount) === DEBIT1 && num(w.reservedAmount) === 0,
      `outstanding=${num(w.outstandingAmount)} reserved=${num(w.reservedAmount)}`,
    );

    if (mode === 'REPAY_BEFORE_NEXT_USE') {
      let threw = false;
      try {
        await creditWalletService.debitWallet(userId, null, 100, `verify-order-3-${ts}`);
      } catch {
        threw = true;
      }
      check('(c3) 2nd debit blocked while outstanding>0 (REPAY_BEFORE_NEXT_USE)', threw);
    } else {
      check('(c3) skipped — repayment mode is ' + mode, true);
    }

    // (d) partial applyRepayment lowers outstanding but stays blocked ──────────
    const PARTIAL = 150;
    await creditWalletService.applyRepayment(walletId, PARTIAL, 'cash');
    w = await prisma.creditWallet.findUniqueOrThrow({ where: { id: walletId } });
    const stillOutstanding = num(w.outstandingAmount) === DEBIT1 - PARTIAL;
    let stillBlocked = stillOutstanding; // outstanding>0 → still blocked under REPAY_BEFORE_NEXT_USE
    if (mode === 'REPAY_BEFORE_NEXT_USE' && num(w.outstandingAmount) > 0) {
      try {
        await creditWalletService.debitWallet(userId, null, 50, `verify-order-3-${ts}`);
        stillBlocked = false;
      } catch {
        stillBlocked = true;
      }
    }
    check(
      '(d) partial repayment lowers outstanding but stays blocked',
      stillOutstanding && stillBlocked,
      `outstanding=${num(w.outstandingAmount)} (expected ${DEBIT1 - PARTIAL})`,
    );

    // (e) full applyRepayment → outstanding 0, available restored ──────────────
    w = await prisma.creditWallet.findUniqueOrThrow({ where: { id: walletId } });
    await creditWalletService.applyRepayment(walletId, num(w.outstandingAmount), 'cash');
    w = await prisma.creditWallet.findUniqueOrThrow({ where: { id: walletId } });
    check(
      '(e) full repayment → outstanding 0, available restored to limit',
      num(w.outstandingAmount) === 0 && num(w.availableCredit) === LIMIT && num(w.usedCredit) === 0,
      `outstanding=${num(w.outstandingAmount)} available=${num(w.availableCredit)}`,
    );

    // (f) duplicate razorpayPaymentId is idempotent (no double credit) ─────────
    const orderIdF = `verify-order-f-${ts}`;
    await creditWalletService.debitWallet(userId, null, 200, orderIdF);
    await prisma.$transaction(async (tx) => {
      await creditWalletService.convertReservedToOutstanding(orderIdF, userId, null, tx);
    });
    const dupPaymentId = `pay_verify_${ts}`;
    await creditWalletService.applyRepayment(walletId, 50, 'razorpay', `order_verify_${ts}`, dupPaymentId);
    const afterFirst = await prisma.creditWallet.findUniqueOrThrow({ where: { id: walletId } });
    // Second call with the SAME razorpayPaymentId must be a no-op.
    await creditWalletService.applyRepayment(walletId, 50, 'razorpay', `order_verify_${ts}`, dupPaymentId);
    const afterDup = await prisma.creditWallet.findUniqueOrThrow({ where: { id: walletId } });
    const repaymentRows = await prisma.creditWalletRepayment.count({ where: { walletId, razorpayPaymentId: dupPaymentId } });
    check(
      '(f) duplicate razorpayPaymentId repayment is idempotent (no double credit)',
      num(afterFirst.outstandingAmount) === num(afterDup.outstandingAmount) && repaymentRows === 1,
      `outstanding ${num(afterFirst.outstandingAmount)}→${num(afterDup.outstandingAmount)}, repaymentRows=${repaymentRows}`,
    );

    // (g) overdue accrual: INTEREST + LATE_FEE rows, idempotent per day ────────
    // Pick an overdue window that is (i) past the grace period so charges apply,
    // and (ii) not past blacklistDays so this test stays focused on penalties.
    const overdueDays = Math.min(cfg.gracePeriodDays + cfg.interestFrequencyDays + cfg.penaltyFrequencyDays, cfg.blacklistDays);
    const pastDue = new Date(Date.now() - overdueDays * DAY_MS - 60_000);
    await prisma.creditWallet.update({ where: { id: walletId }, data: { currentDueDate: pastDue, overdueBaseAmount: null, overdueDays: 0 } });

    await creditWalletService.processOverdueAccounts();
    const interest1 = await prisma.creditWalletPenalty.count({ where: { walletId, type: 'INTEREST' } });
    const lateFee1 = await prisma.creditWalletPenalty.count({ where: { walletId, type: 'LATE_FEE' } });
    const expectInterest = cfg.interestRatePct > 0;
    const expectLateFee = cfg.penaltyAmount > 0;
    check(
      '(g1) processOverdueAccounts creates INTEREST + LATE_FEE penalty rows',
      (!expectInterest || interest1 >= 1) && (!expectLateFee || lateFee1 >= 1),
      `INTEREST=${interest1} LATE_FEE=${lateFee1} (overdueDays≈${overdueDays})`,
    );

    // Re-run: per-day (walletId,type,appliedDate) uniqueness must prevent dupes.
    await creditWalletService.processOverdueAccounts();
    const interest2 = await prisma.creditWalletPenalty.count({ where: { walletId, type: 'INTEREST' } });
    const lateFee2 = await prisma.creditWalletPenalty.count({ where: { walletId, type: 'LATE_FEE' } });
    check(
      '(g2) re-running processOverdueAccounts does NOT duplicate penalties (per-day idempotency)',
      interest2 === interest1 && lateFee2 === lateFee1,
      `INTEREST ${interest1}→${interest2}, LATE_FEE ${lateFee1}→${lateFee2}`,
    );

    // (h) reactivateWallet → ACTIVE + blacklistExempt + audit row ──────────────
    const auditBefore = await prisma.creditWalletAuditLog.count({ where: { walletId, action: 'REACTIVATION' } });
    await creditWalletService.reactivateWallet(walletId, 'VERIFY', 'verify reactivation');
    const wReact = await prisma.creditWallet.findUniqueOrThrow({ where: { id: walletId } });
    const auditAfter = await prisma.creditWalletAuditLog.count({ where: { walletId, action: 'REACTIVATION' } });
    check(
      '(h) reactivateWallet sets ACTIVE + blacklistExempt + writes audit row',
      wReact.status === 'ACTIVE' && wReact.blacklistExempt === true && auditAfter === auditBefore + 1,
      `status=${wReact.status} blacklistExempt=${wReact.blacklistExempt} auditRows ${auditBefore}→${auditAfter}`,
    );
  } finally {
    // ── Cleanup in dependency order (children → wallet → user) ────────────────
    // Child rows of CreditWallet cascade on wallet delete, but we delete them
    // explicitly so this is robust even if cascade is ever removed.
    const wallets = await prisma.creditWallet.findMany({ where: { userId }, select: { id: true } });
    const walletIds = wallets.map((x) => x.id);
    if (walletIds.length) {
      await prisma.creditWalletPenalty.deleteMany({ where: { walletId: { in: walletIds } } });
      await prisma.creditWalletTxn.deleteMany({ where: { walletId: { in: walletIds } } });
      await prisma.creditWalletRepayment.deleteMany({ where: { walletId: { in: walletIds } } });
      await prisma.creditWalletAuditLog.deleteMany({ where: { walletId: { in: walletIds } } });
      await prisma.creditWallet.deleteMany({ where: { id: { in: walletIds } } });
    }
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    console.log('\nCleanup complete (test user + wallet rows removed).');
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
}

main()
  .catch(async (e) => {
    console.error('\nFatal error during verification:', e);
    failed++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  });
