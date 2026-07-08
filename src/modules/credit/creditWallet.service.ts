import { Prisma, CreditRepaymentMode, BillingModelType, CreditWalletStatus, CreditWorkflowStatus } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { SMS_TEMPLATES } from '@/lib/providers/smsTemplates';
import type { NotificationService } from '@/modules/notification/notification.service';

let notificationsPromise: Promise<NotificationService> | null = null;
async function getNotifications(): Promise<NotificationService> {
  if (!notificationsPromise) {
    notificationsPromise = import('@/modules/notification/notification.service').then(
      ({ NotificationService }) => new NotificationService(),
    );
  }
  return notificationsPromise;
}

type Tx = Prisma.TransactionClient;

/** Resolved (global ⊕ override) config for a wallet. */
export interface CreditConfig {
  repaymentMode: CreditRepaymentMode;
  billingModel: BillingModelType;
  creditLimit: number;
  creditTenureDays: number;
  gracePeriodDays: number;
  blacklistDays: number;
  interestRatePct: number;
  interestFrequencyDays: number;
  penaltyAmount: number;
  penaltyFrequencyDays: number;
  eligiblePurchaseCount: number;
  unlockCreditAmount: number;
}

const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (d: Prisma.Decimal | number) => Number(d);

/** Vendor CRM fields editable on the credit grid (workflow status is vendor-owned). */
export interface VendorCreditRowFields {
  workflowStatus?: CreditWorkflowStatus;
  assignedOwnerId?: string | null;
  vendorNotes?: string | null;
}

/** Resolved display status for UI: system runtime status overrides workflow. */
export type CreditDisplayStatus =
  | 'BLACKLISTED'
  | 'BLOCKED'
  | 'SANCTIONED'
  | 'IN_PROGRESS'
  | 'COMPLETED';

export function resolveCreditDisplayStatus(
  runtimeStatus: CreditWalletStatus,
  workflowStatus: CreditWorkflowStatus,
): CreditDisplayStatus {
  if (runtimeStatus === 'BLACKLISTED') return 'BLACKLISTED';
  if (runtimeStatus === 'BLOCKED') return 'BLOCKED';
  return workflowStatus;
}

/** Override fields an admin/vendor may set per wallet (subset of CreditConfig). */
export interface CreditOverrides {
  repaymentMode?: CreditRepaymentMode;
  billingModel?: BillingModelType;
  creditTenureDays?: number;
  gracePeriodDays?: number;
  blacklistDays?: number;
  interestRatePct?: number;
  interestFrequencyDays?: number;
  penaltyAmount?: number;
  penaltyFrequencyDays?: number;
}

export class CreditWalletService {
  // ── Config ────────────────────────────────────────────────────────────────

  /** The singleton global config, created with sane defaults on first read. */
  async getGlobalConfig(db: Tx | typeof prisma = prisma): Promise<CreditConfig> {
    let config = await db.globalCreditConfig.findFirst();
    if (!config) {
      config = await db.globalCreditConfig.create({ data: {} });
    }
    return {
      repaymentMode: config.repaymentMode,
      billingModel: config.billingModel,
      creditLimit: num(config.creditLimit),
      creditTenureDays: config.creditTenureDays,
      gracePeriodDays: config.gracePeriodDays,
      blacklistDays: config.blacklistDays,
      interestRatePct: num(config.interestRatePct),
      interestFrequencyDays: config.interestFrequencyDays,
      penaltyAmount: num(config.penaltyAmount),
      penaltyFrequencyDays: config.penaltyFrequencyDays,
      eligiblePurchaseCount: config.eligiblePurchaseCount,
      unlockCreditAmount: num(config.unlockCreditAmount),
    };
  }

  /** Overlay a wallet's per-customer overrides on top of the global config. */
  async resolveWalletConfig(walletId: string, db: Tx | typeof prisma = prisma): Promise<CreditConfig> {
    const wallet = await db.creditWallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw Errors.notFound('Credit wallet');
    const g = await this.getGlobalConfig(db);
    const pick = <T>(override: T | null | undefined, fallback: T): T => (override ?? fallback);
    return {
      repaymentMode: pick(wallet.overrideRepaymentMode, g.repaymentMode),
      billingModel: pick(wallet.overrideBillingModel, g.billingModel),
      // The wallet's own creditLimit is authoritative (set at assignment); the
      // global creditLimit is only a default for new wallets.
      creditLimit: num(wallet.creditLimit),
      creditTenureDays: pick(wallet.overrideCreditTenure, g.creditTenureDays),
      gracePeriodDays: pick(wallet.overrideGracePeriod, g.gracePeriodDays),
      blacklistDays: pick(wallet.overrideBlacklistDays, g.blacklistDays),
      interestRatePct: wallet.overrideInterestRate != null ? num(wallet.overrideInterestRate) : g.interestRatePct,
      interestFrequencyDays: pick(wallet.overrideInterestFreqDays, g.interestFrequencyDays),
      penaltyAmount: wallet.overridePenaltyAmount != null ? num(wallet.overridePenaltyAmount) : g.penaltyAmount,
      penaltyFrequencyDays: pick(wallet.overridePenaltyFreqDays, g.penaltyFrequencyDays),
      eligiblePurchaseCount: g.eligiblePurchaseCount,
      unlockCreditAmount: g.unlockCreditAmount,
    };
  }

  // ── Eligibility / auto-unlock ───────────────────────────────────────────────

  /** Eligible once the customer has ≥ threshold SUCCESSFUL (delivered) orders. */
  async checkEligibility(userId: string, db: Tx | typeof prisma = prisma): Promise<{ eligible: boolean; orderCount: number; threshold: number }> {
    const g = await this.getGlobalConfig(db);
    const orderCount = await db.order.count({ where: { userId, status: 'delivered' } });
    return { eligible: orderCount >= g.eligiblePurchaseCount, orderCount, threshold: g.eligiblePurchaseCount };
  }

  /**
   * Auto-unlock the H1 platform wallet once the customer crosses the purchase
   * threshold (idempotent — only creates the H1 wallet if absent). Call after an
   * order reaches 'delivered'.
   */
  async maybeAutoUnlockH1Wallet(userId: string): Promise<void> {
    const { eligible, unlockAmount } = await prisma.$transaction(async (tx) => {
      const elig = await this.checkEligibility(userId, tx);
      const g = await this.getGlobalConfig(tx);
      return { eligible: elig.eligible, unlockAmount: g.unlockCreditAmount };
    });
    if (!eligible) return;
    const existing = await prisma.creditWallet.findFirst({ where: { userId, vendorId: null } });
    if (existing) return;
    await this.assignCredit(userId, null, unlockAmount, {}, 'SYSTEM', `Auto-unlocked after ${(await this.checkEligibility(userId)).threshold} successful orders`);
  }

  // ── Assignment ──────────────────────────────────────────────────────────────

  async assignCredit(
    userId: string,
    vendorId: string | null,
    creditLimit: number,
    overrides: CreditOverrides = {},
    adminUserId = 'SYSTEM',
    remark = 'Credit assigned',
    vendorFields: VendorCreditRowFields = {},
  ) {
    // Validate + smart-resolve referenced records up front, so a wrong ID returns
    // a clean 404 (or auto-corrects) instead of a raw FK-violation 500 from the DB.
    const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!userExists) throw Errors.notFound('User');

    let resolvedVendorId = vendorId;
    if (vendorId) {
      const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true } });
      if (vendor) {
        resolvedVendorId = vendor.id;
      } else {
        // Common admin slip: pasting the vendor's USER id instead of the vendor
        // record id. Recover by resolving the real vendor id from that profile.
        const byUser = await prisma.vendor.findFirst({ where: { userId: vendorId }, select: { id: true } });
        if (!byUser) throw Errors.notFound('Vendor');
        resolvedVendorId = byUser.id;
      }
    }

    return prisma.$transaction(async (tx) => {
      const existing = await tx.creditWallet.findFirst({ where: { userId, vendorId: resolvedVendorId } });
      const limit = D(creditLimit);
      const ov = {
        overrideRepaymentMode: overrides.repaymentMode ?? null,
        overrideBillingModel: overrides.billingModel ?? null,
        overrideCreditTenure: overrides.creditTenureDays ?? null,
        overrideGracePeriod: overrides.gracePeriodDays ?? null,
        overrideBlacklistDays: overrides.blacklistDays ?? null,
        overrideInterestRate: overrides.interestRatePct != null ? D(overrides.interestRatePct) : null,
        overrideInterestFreqDays: overrides.interestFrequencyDays ?? null,
        overridePenaltyAmount: overrides.penaltyAmount != null ? D(overrides.penaltyAmount) : null,
        overridePenaltyFreqDays: overrides.penaltyFrequencyDays ?? null,
      };

      const crmFields = {
        ...(vendorFields.workflowStatus != null ? { workflowStatus: vendorFields.workflowStatus } : {}),
        ...(vendorFields.assignedOwnerId !== undefined ? { assignedOwnerId: vendorFields.assignedOwnerId } : {}),
        ...(vendorFields.vendorNotes !== undefined ? { vendorNotes: vendorFields.vendorNotes } : {}),
      };

      let wallet;
      if (!existing) {
        wallet = await tx.creditWallet.create({
          data: {
            userId, vendorId: resolvedVendorId, status: 'ACTIVE',
            creditLimit: limit,
            // available = limit − used (used is 0 for a fresh wallet)
            availableCredit: limit,
            usedCredit: D(0), outstandingAmount: D(0),
            workflowStatus: creditLimit > 0 ? 'SANCTIONED' : 'IN_PROGRESS',
            ...ov,
            ...crmFields,
          },
        });
        await this.audit(tx, wallet.id, 'CREDIT_ASSIGN', adminUserId, null, { creditLimit, overrides }, remark);
        await tx.creditWalletTxn.create({
          data: { walletId: wallet.id, type: 'CREDIT_ASSIGN', amount: limit, balanceAfterTxn: wallet.availableCredit, note: `Credit line of ₹${creditLimit} assigned` },
        });
      } else {
        // Changing the limit must NOT alter the outstanding balance. Recompute
        // available = newLimit − currentUsed (can go negative if limit dropped
        // below used → no further credit until repaid).
        const newAvailable = limit.minus(existing.usedCredit);
        const workflowUpdate =
          creditLimit > 0 && existing.workflowStatus === 'IN_PROGRESS'
            ? { workflowStatus: 'SANCTIONED' as const }
            : {};
        wallet = await tx.creditWallet.update({
          where: { id: existing.id },
          data: { creditLimit: limit, availableCredit: newAvailable, ...ov, ...crmFields, ...workflowUpdate },
        });
        await this.audit(tx, wallet.id, 'LIMIT_UPDATE', adminUserId,
          { creditLimit: num(existing.creditLimit) },
          { creditLimit, overrides }, remark);
      }
      return wallet;
    });
  }

  /**
   * Vendor grid row update — limit + CRM fields. Rejects workflow edits when the
   * wallet is system-BLOCKED or BLACKLISTED.
   */
  async updateVendorCreditRow(
    walletId: string,
    vendorId: string,
    actorUserId: string,
    patch: {
      creditLimit?: number;
      workflowStatus?: CreditWorkflowStatus;
      assignedOwnerId?: string | null;
      vendorNotes?: string | null;
    },
  ) {
    const wallet = await prisma.creditWallet.findUnique({ where: { id: walletId } });
    if (!wallet || wallet.vendorId !== vendorId) throw Errors.notFound('Credit wallet');

    if (patch.assignedOwnerId) {
      const owner = await prisma.vendorTeamMember.findFirst({
        where: { id: patch.assignedOwnerId, vendorId },
      });
      if (!owner) throw Errors.badRequest('Owner must be a member of your team');
    }

    if (patch.workflowStatus != null && (wallet.status === 'BLOCKED' || wallet.status === 'BLACKLISTED')) {
      throw Errors.badRequest('Cannot change workflow status while wallet is system-blocked or blacklisted');
    }

    if (patch.creditLimit != null) {
      return this.assignCredit(
        wallet.userId,
        vendorId,
        patch.creditLimit,
        {},
        actorUserId,
        'Credit limit updated from vendor grid',
        {
          workflowStatus: patch.workflowStatus,
          assignedOwnerId: patch.assignedOwnerId,
          vendorNotes: patch.vendorNotes,
        },
      );
    }

    return prisma.$transaction(async (tx) => {
      const prev = await tx.creditWallet.findUnique({ where: { id: walletId } });
      if (!prev) throw Errors.notFound('Credit wallet');

      const data: Prisma.CreditWalletUpdateInput = {};
      if (patch.workflowStatus != null) data.workflowStatus = patch.workflowStatus;
      if (patch.assignedOwnerId !== undefined) {
        data.assignedOwner = patch.assignedOwnerId
          ? { connect: { id: patch.assignedOwnerId } }
          : { disconnect: true };
      }
      if (patch.vendorNotes !== undefined) data.vendorNotes = patch.vendorNotes;

      const updated = await tx.creditWallet.update({ where: { id: walletId }, data });

      if (patch.workflowStatus != null && patch.workflowStatus !== prev.workflowStatus) {
        await this.audit(tx, walletId, 'WORKFLOW_UPDATE', actorUserId, prev.workflowStatus, patch.workflowStatus, 'Workflow status updated');
      }
      if (patch.assignedOwnerId !== undefined && patch.assignedOwnerId !== prev.assignedOwnerId) {
        await this.audit(tx, walletId, 'OWNER_ASSIGN', actorUserId, prev.assignedOwnerId, patch.assignedOwnerId, 'Credit owner assigned');
      }
      if (patch.vendorNotes !== undefined && patch.vendorNotes !== prev.vendorNotes) {
        await this.audit(tx, walletId, 'NOTES_UPDATE', actorUserId, prev.vendorNotes, patch.vendorNotes, 'Vendor notes updated');
      }

      return updated;
    });
  }

  // ── Billing cycle dates ─────────────────────────────────────────────────────

  /** Cycle period-end + due date for a base date and billing model. */
  calculateDueDate(baseDate: Date, model: BillingModelType, tenureDays: number): Date {
    const due = new Date(baseDate);
    if (model === 'BILL_TO_BILL') {
      due.setDate(due.getDate() + tenureDays);
      return due;
    }
    if (model === 'WEEKLY') {
      const day = due.getDay();
      const toSunday = day === 0 ? 0 : 7 - day;
      due.setDate(due.getDate() + toSunday + 3); // Wed after the week's Sunday
    } else if (model === 'FORTNIGHTLY') {
      if (due.getDate() <= 15) due.setDate(15);
      else due.setMonth(due.getMonth() + 1, 0);
      due.setDate(due.getDate() + 5);
    } else if (model === 'MONTHLY') {
      // 15th of the following month (consolidated dues of the current month)
      due.setMonth(due.getMonth() + 1, 15);
    }
    due.setHours(18, 0, 0, 0);
    return due;
  }

  // ── Utilization (order debit) ───────────────────────────────────────────────

  /** Debit credit at checkout. Enforces status, repayment mode, and limit. */
  async debitWallet(userId: string, vendorId: string | null, amount: number, orderId: string, db?: Tx) {
    const run = async (tx: Tx) => {
      const wallet = await tx.creditWallet.findFirst({ where: { userId, vendorId } });
      if (!wallet) throw Errors.badRequest('No credit wallet for this customer/vendor');
      if (wallet.status === 'BLOCKED') throw Errors.badRequest('Credit wallet is blocked');
      if (wallet.status === 'BLACKLISTED') throw Errors.badRequest('Credit wallet is blacklisted — clear dues and ask admin to reactivate');

      const config = await this.resolveWalletConfig(wallet.id, tx);

      if (config.repaymentMode === 'REPAY_BEFORE_NEXT_USE') {
        if (wallet.outstandingAmount.greaterThan(0)) {
          throw Errors.badRequest('Outstanding dues must be cleared before using credit again');
        }
      } else if (config.repaymentMode === 'ALLOW_USAGE_TILL_DUE') {
        if (wallet.currentDueDate && new Date() > wallet.currentDueDate) {
          throw Errors.badRequest('Credit usage blocked — payment due date has passed');
        }
      }

      const debit = D(amount);
      if (wallet.availableCredit.lessThan(debit)) {
        throw Errors.badRequest(`Insufficient credit (need ₹${amount}, available ₹${num(wallet.availableCredit)})`);
      }

      const newUsed = wallet.usedCredit.plus(debit);
      const newOutstanding = wallet.outstandingAmount.plus(debit);
      const newAvailable = wallet.creditLimit.minus(newUsed);
      const dueDate = wallet.currentDueDate ?? this.calculateDueDate(new Date(), config.billingModel, config.creditTenureDays);

      const updated = await tx.creditWallet.update({
        where: { id: wallet.id },
        data: { usedCredit: newUsed, outstandingAmount: newOutstanding, availableCredit: newAvailable, lastUtilizationDate: new Date(), currentDueDate: dueDate },
      });
      await tx.creditWalletTxn.create({
        data: { walletId: wallet.id, type: 'ORDER_DEBIT', amount: debit, balanceAfterTxn: newAvailable, referenceId: orderId, note: `Order ${orderId} paid via credit: ₹${amount}` },
      });
      return updated;
    };
    return db ? run(db) : prisma.$transaction(run);
  }

  /** Release an order's credit debit when the order is cancelled. Idempotent
   *  (no-ops if there was no debit or it's already been reversed). Runs in the
   *  caller's transaction. */
  async reverseOrderDebit(orderId: string, userId: string, vendorId: string | null, db: Tx): Promise<void> {
    const wallet = await db.creditWallet.findFirst({ where: { userId, vendorId } });
    if (!wallet) return;
    const debit = await db.creditWalletTxn.findFirst({ where: { walletId: wallet.id, type: 'ORDER_DEBIT', referenceId: orderId } });
    if (!debit) return;
    const already = await db.creditWalletTxn.findFirst({ where: { walletId: wallet.id, type: 'REVERSAL', referenceId: orderId } });
    if (already) return;

    const amount = debit.amount;
    const newUsed = Prisma.Decimal.max(D(0), wallet.usedCredit.minus(amount));
    const newOutstanding = Prisma.Decimal.max(D(0), wallet.outstandingAmount.minus(amount));
    const newAvailable = wallet.creditLimit.minus(newUsed);
    const cleared = newOutstanding.equals(0);
    await db.creditWallet.update({
      where: { id: wallet.id },
      data: {
        usedCredit: newUsed, outstandingAmount: newOutstanding, availableCredit: newAvailable,
        ...(cleared ? { currentDueDate: null, overdueDays: 0, overdueBaseAmount: null } : {}),
      },
    });
    await db.creditWalletTxn.create({
      data: { walletId: wallet.id, type: 'REVERSAL', amount, balanceAfterTxn: newAvailable, referenceId: orderId, note: `Order ${orderId} cancelled — credit released` },
    });
  }

  // ── Repayment ───────────────────────────────────────────────────────────────

  /** Apply a (full/partial) repayment. Idempotent on razorpayPaymentId. */
  async applyRepayment(walletId: string, amount: number, method: string, razorpayOrderId?: string, razorpayPaymentId?: string, note?: string) {
    return prisma.$transaction(async (tx) => {
      // DB-level + app-level idempotency: a captured payment applies at most once.
      if (razorpayPaymentId) {
        const dup = await tx.creditWalletRepayment.findUnique({ where: { razorpayPaymentId } });
        if (dup) return tx.creditWallet.findUnique({ where: { id: walletId } });
      }
      const wallet = await tx.creditWallet.findUnique({ where: { id: walletId } });
      if (!wallet) throw Errors.notFound('Credit wallet');

      const pay = D(amount);
      if (pay.lessThanOrEqualTo(0)) throw Errors.badRequest('Repayment amount must be positive');
      if (pay.greaterThan(wallet.outstandingAmount)) {
        throw Errors.badRequest(`Repayment ₹${amount} exceeds outstanding ₹${num(wallet.outstandingAmount)}`);
      }

      const newOutstanding = wallet.outstandingAmount.minus(pay);
      const newUsed = Prisma.Decimal.max(D(0), wallet.usedCredit.minus(pay));
      const newAvailable = wallet.creditLimit.minus(newUsed);
      const cleared = newOutstanding.equals(0);
      const statusAfterRepay =
        cleared && wallet.status === 'BLOCKED' ? 'ACTIVE' : wallet.status;

      // Finalize the existing PENDING record (Razorpay flow) instead of leaving an
      // orphan; else create one (cash/manual flow).
      let repayment = null;
      if (razorpayOrderId) {
        const pending = await tx.creditWalletRepayment.findFirst({ where: { razorpayOrderId, status: 'PENDING' } });
        if (pending) {
          repayment = await tx.creditWalletRepayment.update({
            where: { id: pending.id },
            data: { status: 'SUCCESS', razorpayPaymentId, amount: pay },
          });
        }
      }
      if (!repayment) {
        repayment = await tx.creditWalletRepayment.create({
          data: { walletId, amount: pay, repaymentMethod: method, razorpayOrderId, razorpayPaymentId, status: 'SUCCESS' },
        });
      }
      const updated = await tx.creditWallet.update({
        where: { id: walletId },
        data: {
          outstandingAmount: newOutstanding,
          usedCredit: newUsed,
          availableCredit: newAvailable,
          status: statusAfterRepay,
          // Full repayment clears the overdue cycle. A BLACKLISTED wallet stays
          // blacklisted until an admin manually reactivates (per brief).
          currentDueDate: cleared ? null : wallet.currentDueDate,
          overdueDays: cleared ? 0 : wallet.overdueDays,
          overdueBaseAmount: cleared ? null : wallet.overdueBaseAmount,
        },
      });
      await tx.creditWalletTxn.create({
        data: {
          walletId,
          type: 'REPAYMENT',
          amount: pay,
          balanceAfterTxn: newAvailable,
          referenceId: repayment.id,
          note: note?.trim()
            ? `Repayment via ${method}: ₹${amount} — ${note.trim()}`
            : `Repayment via ${method}: ₹${amount}`,
        },
      });
      return updated;
    });
  }

  /**
   * Synchronous, client-driven repayment verification — the PRIMARY path,
   * mirroring `payments/verify`. The Razorpay checkout `handler` posts the
   * order/payment/signature triplet the moment payment succeeds; we verify the
   * HMAC (order_id|payment_id with RAZORPAY_KEY_SECRET — the checkout signature,
   * NOT the webhook secret), confirm the pending repayment belongs to this user,
   * then apply it. The webhook is only a server-to-server backup; relying on it
   * alone meant a captured payment never reached the wallet in test mode / on
   * localhost, where Razorpay can't call back. Idempotent: `applyRepayment`
   * dedupes on razorpayPaymentId (unique index), so verify + webhook can't
   * double-apply.
   */
  async verifyRepayment(userId: string, razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string) {
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    const sigBuf = Buffer.from(razorpaySignature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw Errors.unauthorized('Invalid payment signature');
    }

    const repayment = await prisma.creditWalletRepayment.findFirst({
      where: { razorpayOrderId },
      include: { wallet: { select: { userId: true } } },
    });
    if (!repayment) throw Errors.notFound('Repayment');
    if (repayment.wallet.userId !== userId) throw Errors.forbidden('Not your repayment');

    const updated = await this.applyRepayment(
      repayment.walletId,
      Number(repayment.amount),
      'RAZORPAY',
      razorpayOrderId,
      razorpayPaymentId,
    );
    return {
      success: true,
      walletId: repayment.walletId,
      outstanding: updated ? num(updated.outstandingAmount) : null,
      availableCredit: updated ? num(updated.availableCredit) : null,
    };
  }

  // ── Daily accruals (interest + penalty + blacklist) ─────────────────────────

  /**
   * Daily scheduler. Compound interest is computed on the principal captured at
   * overdue onset (`overdueBaseAmount`), NOT the live outstanding (which already
   * includes prior interest + late fees). Every accrual row is idempotent per day
   * via the (walletId, type, appliedDate) unique index, so re-runs can't double-charge.
   */
  async processOverdueAccounts(): Promise<{ processed: number }> {
    const wallets = await prisma.creditWallet.findMany({
      where: { outstandingAmount: { gt: 0 }, currentDueDate: { lt: new Date() } },
      select: { id: true },
    });
    let processed = 0;
    for (const { id } of wallets) {
      await prisma.$transaction((tx) => this.accrueForWallet(tx, id)).then(() => { processed++; }).catch((e) => {
        console.error(`[credit] accrual failed for wallet ${id}:`, e);
      });
    }
    return { processed };
  }

  private async accrueForWallet(tx: Tx, walletId: string): Promise<void> {
    const wallet = await tx.creditWallet.findUnique({ where: { id: walletId } });
    if (!wallet || !wallet.currentDueDate || wallet.outstandingAmount.lessThanOrEqualTo(0)) return;
    const config = await this.resolveWalletConfig(walletId, tx);

    const dayMs = 86_400_000;
    const overdueDays = Math.floor((Date.now() - wallet.currentDueDate.getTime()) / dayMs);
    if (overdueDays <= 0) return;

    // Capture the principal the first time this wallet goes overdue.
    const base = wallet.overdueBaseAmount ?? wallet.outstandingAmount;
    const statusUpdate =
      wallet.status === 'ACTIVE' && overdueDays > 0 ? { status: 'BLOCKED' as const } : {};
    await tx.creditWallet.update({
      where: { id: walletId },
      data: { overdueDays, overdueBaseAmount: wallet.overdueBaseAmount ?? base, ...statusUpdate },
    });

    if (statusUpdate.status === 'BLOCKED') {
      await this.audit(tx, walletId, 'BLOCK', 'SYSTEM', wallet.status, 'BLOCKED', `Auto-blocked: ${overdueDays} overdue day(s)`);
    }

    // Blacklist (unless manually reactivated → exempt).
    if (overdueDays > config.blacklistDays && wallet.status !== 'BLACKLISTED' && !wallet.blacklistExempt) {
      await tx.creditWallet.update({ where: { id: walletId }, data: { status: 'BLACKLISTED', blacklistedAt: new Date() } });
      await this.audit(tx, walletId, 'BLACKLIST', 'SYSTEM', wallet.status, 'BLACKLISTED', `Auto-blacklist: ${overdueDays} overdue days > ${config.blacklistDays}`);
    }

    const taxableDays = overdueDays - config.gracePeriodDays;
    if (taxableDays <= 0) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Compound interest: target = base · ((1+r)^periods − 1); apply the increment
    // over what's already been accrued. Idempotent via unique(wallet,INTEREST,date).
    const periods = Math.floor(taxableDays / config.interestFrequencyDays);
    if (periods >= 1 && config.interestRatePct > 0) {
      const r = config.interestRatePct / 100;
      const target = round2(num(base) * (Math.pow(1 + r, periods) - 1));
      const prior = await tx.creditWalletPenalty.aggregate({ where: { walletId, type: 'INTEREST' }, _sum: { amount: true } });
      const increment = round2(target - num(prior._sum.amount ?? 0));
      if (increment > 0) {
        await this.applyAccrual(tx, walletId, 'INTEREST', increment, today, `Compound interest (${periods} period(s) @ ${config.interestRatePct}%/${config.interestFrequencyDays}d)`);
      }
    }

    // Flat late fee every penaltyFrequencyDays.
    if (config.penaltyAmount > 0 && taxableDays % config.penaltyFrequencyDays === 0) {
      await this.applyAccrual(tx, walletId, 'LATE_FEE', config.penaltyAmount, today, `Late fee ₹${config.penaltyAmount}`);
    }
  }

  /** Insert a penalty/interest accrual + ledger txn + grow the balance. Per-day idempotent. */
  private async applyAccrual(tx: Tx, walletId: string, type: 'INTEREST' | 'LATE_FEE', amount: number, appliedDate: Date, note: string): Promise<void> {
    try {
      const penalty = await tx.creditWalletPenalty.create({
        data: { walletId, type, amount: D(amount), appliedDate, status: 'APPLIED' },
      });
      const w = await tx.creditWallet.findUnique({ where: { id: walletId } });
      if (!w) return;
      const add = D(amount);
      const newOutstanding = w.outstandingAmount.plus(add);
      const newUsed = w.usedCredit.plus(add);
      const newAvailable = w.creditLimit.minus(newUsed);
      await tx.creditWallet.update({ where: { id: walletId }, data: { outstandingAmount: newOutstanding, usedCredit: newUsed, availableCredit: newAvailable } });
      await tx.creditWalletTxn.create({
        data: { walletId, type: 'PENALTY', amount: add, balanceAfterTxn: newAvailable, referenceId: penalty.id, note },
      });
    } catch (e) {
      // Unique violation = already accrued for this wallet/type/day → no-op.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return;
      throw e;
    }
  }

  // ── Reminders + daily runner ────────────────────────────────────────────────

  /** Send repayment reminders (2d/1d/0d before due, day 3 + day 10 overdue) over
   *  in-app + SMS + WhatsApp. Meant to run once daily. */
  async sendDueReminders(): Promise<{ sent: number }> {
    const wallets = await prisma.creditWallet.findMany({
      where: { outstandingAmount: { gt: 0 }, currentDueDate: { not: null }, status: { not: 'BLACKLISTED' } },
      select: { id: true, userId: true, outstandingAmount: true, currentDueDate: true },
    });
    const dayMs = 86_400_000;
    let sent = 0;
    for (const w of wallets) {
      if (!w.currentDueDate) continue;
      const diff = Math.round((w.currentDueDate.getTime() - Date.now()) / dayMs);
      let phrase: string | null = null;
      if (diff === 2) phrase = 'is due in 2 days';
      else if (diff === 1) phrase = 'is due tomorrow';
      else if (diff === 0) phrase = 'is due today';
      else if (diff < 0 && (-diff === 3 || -diff === 10)) phrase = `is ${-diff} days overdue`;
      if (!phrase) continue;

      const amount = num(w.outstandingAmount);
      const body = `Your Horeca1 credit payment of ₹${amount} ${phrase}. Pay now from your wallet: /wallet`;
      const notifications = await getNotifications();
      for (const channel of ['in_app', 'sms', 'whatsapp'] as const) {
        await notifications.send({
          userId: w.userId,
          type: 'credit',
          channel,
          title: 'Credit repayment reminder',
          body,
          ...(channel === 'sms'
            ? {
                smsTemplateId: SMS_TEMPLATES.generalPurpose,
                smsVariables: { content: body },
              }
            : {}),
          referenceId: w.id,
          referenceType: 'credit_wallet',
        }).catch(() => {});
      }
      sent++;
    }
    return { sent };
  }

  /** Daily scheduler entrypoint: accrue interest/penalties + blacklist, then remind. */
  async runDailyCreditTasks(): Promise<{ accruals: number; reminders: number }> {
    const accr = await this.processOverdueAccounts();
    const rem = await this.sendDueReminders();
    return { accruals: accr.processed, reminders: rem.sent };
  }

  // ── Manual reactivation ─────────────────────────────────────────────────────

  /** Admin reactivation — allowed even with dues. Sets blacklistExempt so the
   *  scheduler won't immediately re-blacklist; logs a mandatory audit entry. */
  async reactivateWallet(walletId: string, adminUserId: string, reason: string) {
    return prisma.$transaction(async (tx) => {
      const wallet = await tx.creditWallet.findUnique({ where: { id: walletId } });
      if (!wallet) throw Errors.notFound('Credit wallet');
      const updated = await tx.creditWallet.update({
        where: { id: walletId },
        data: { status: 'ACTIVE', overdueDays: 0, blacklistExempt: true, reactivatedAt: new Date(), blacklistedAt: null },
      });
      await this.audit(tx, walletId, 'REACTIVATION', adminUserId, wallet.status, 'ACTIVE',
        `${reason} | outstanding at reactivation: ₹${num(wallet.outstandingAmount)}`);
      return updated;
    });
  }

  // ── Audit helper ────────────────────────────────────────────────────────────

  private async audit(tx: Tx, walletId: string, action: string, performedBy: string, previous: unknown, next: unknown, remarks: string) {
    await tx.creditWalletAuditLog.create({
      data: {
        walletId, action, performedBy,
        previousValue: previous != null ? (typeof previous === 'string' ? previous : JSON.stringify(previous)) : null,
        newValue: next != null ? (typeof next === 'string' ? next : JSON.stringify(next)) : null,
        remarks,
      },
    });
  }
}

export const creditWalletService = new CreditWalletService();
