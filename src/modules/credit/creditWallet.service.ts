import { Prisma, CreditRepaymentMode, BillingModelType, CreditWalletStatus, CreditWorkflowStatus, CreditSource } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { SMS_TEMPLATES } from '@/lib/providers/smsTemplates';
import type { NotificationService } from '@/modules/notification/notification.service';
import {
  compoundInterestTarget,
  computeAvailable,
  interestPeriods,
  isCreditUsageBlocked,
  round2,
  validateLimitChange,
} from '@/modules/credit/creditMath';

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

/** Resolved (global ⊕ vendor ⊕ override) config for a wallet. */
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

/** Which layer supplied each term — for admin/vendor UI provenance. */
export type ConfigLayer = 'global' | 'supplier' | 'customer';

export interface CreditConfigProvenance {
  repaymentMode: ConfigLayer;
  billingModel: ConfigLayer;
  creditTenureDays: ConfigLayer;
  gracePeriodDays: ConfigLayer;
  blacklistDays: ConfigLayer;
  interestRatePct: ConfigLayer;
  interestFrequencyDays: ConfigLayer;
  penaltyAmount: ConfigLayer;
  penaltyFrequencyDays: ConfigLayer;
}

const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
const num = (d: Prisma.Decimal | number) => Number(d);

/** Row-lock a wallet inside an open transaction (Postgres FOR UPDATE). */
async function lockWallet(tx: Tx, walletId: string) {
  await tx.$queryRaw`SELECT id FROM credit_wallets WHERE id = ${walletId}::uuid FOR UPDATE`;
  return tx.creditWallet.findUnique({ where: { id: walletId } });
}

async function lockWalletByUserVendor(tx: Tx, userId: string, vendorId: string | null) {
  if (vendorId) {
    await tx.$queryRaw`
      SELECT id FROM credit_wallets
      WHERE user_id = ${userId}::uuid AND vendor_id = ${vendorId}::uuid
      FOR UPDATE`;
  } else {
    await tx.$queryRaw`
      SELECT id FROM credit_wallets
      WHERE user_id = ${userId}::uuid AND vendor_id IS NULL
      FOR UPDATE`;
  }
  return tx.creditWallet.findFirst({ where: { userId, vendorId } });
}

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
  | 'SUSPENDED'
  | 'FROZEN'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'SANCTIONED'
  | 'IN_PROGRESS'
  | 'COMPLETED';

export function resolveCreditDisplayStatus(
  runtimeStatus: CreditWalletStatus,
  workflowStatus: CreditWorkflowStatus,
): CreditDisplayStatus {
  if (runtimeStatus === 'BLACKLISTED') return 'BLACKLISTED';
  if (runtimeStatus === 'CANCELLED') return 'CANCELLED';
  if (runtimeStatus === 'EXPIRED') return 'EXPIRED';
  if (runtimeStatus === 'SUSPENDED') return 'SUSPENDED';
  if (runtimeStatus === 'FROZEN') return 'FROZEN';
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

export interface AssignCreditOptions {
  overrides?: CreditOverrides;
  adminUserId?: string;
  remark?: string;
  vendorFields?: VendorCreditRowFields;
  creditSource?: CreditSource;
  validFrom?: Date | null;
  validUntil?: Date | null;
  allowReduceBelowCommitted?: boolean;
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

  async getVendorConfig(vendorId: string, db: Tx | typeof prisma = prisma) {
    return db.vendorCreditConfig.findUnique({ where: { vendorId } });
  }

  async upsertVendorConfig(
    vendorId: string,
    patch: {
      repaymentMode?: CreditRepaymentMode | null;
      billingModel?: BillingModelType | null;
      defaultCreditLimit?: number | null;
      creditTenureDays?: number | null;
      gracePeriodDays?: number | null;
      blacklistDays?: number | null;
      interestRatePct?: number | null;
      interestFrequencyDays?: number | null;
      penaltyAmount?: number | null;
      penaltyFrequencyDays?: number | null;
      creditEnabled?: boolean;
    },
    actorUserId: string,
  ) {
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true } });
    if (!vendor) throw Errors.notFound('Vendor');

    const data = {
      repaymentMode: patch.repaymentMode === undefined ? undefined : patch.repaymentMode,
      billingModel: patch.billingModel === undefined ? undefined : patch.billingModel,
      defaultCreditLimit:
        patch.defaultCreditLimit === undefined
          ? undefined
          : patch.defaultCreditLimit == null
            ? null
            : D(patch.defaultCreditLimit),
      creditTenureDays: patch.creditTenureDays === undefined ? undefined : patch.creditTenureDays,
      gracePeriodDays: patch.gracePeriodDays === undefined ? undefined : patch.gracePeriodDays,
      blacklistDays: patch.blacklistDays === undefined ? undefined : patch.blacklistDays,
      interestRatePct:
        patch.interestRatePct === undefined
          ? undefined
          : patch.interestRatePct == null
            ? null
            : D(patch.interestRatePct),
      interestFrequencyDays:
        patch.interestFrequencyDays === undefined ? undefined : patch.interestFrequencyDays,
      penaltyAmount:
        patch.penaltyAmount === undefined
          ? undefined
          : patch.penaltyAmount == null
            ? null
            : D(patch.penaltyAmount),
      penaltyFrequencyDays:
        patch.penaltyFrequencyDays === undefined ? undefined : patch.penaltyFrequencyDays,
      creditEnabled: patch.creditEnabled,
    };

    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const row = await prisma.vendorCreditConfig.upsert({
      where: { vendorId },
      create: { vendorId, ...clean },
      update: clean,
    });

    // Best-effort: attach config change to an existing customer line's audit trail.
    const sample = await prisma.creditWallet.findFirst({ where: { vendorId }, select: { id: true } });
    if (sample) {
      await prisma.creditWalletAuditLog.create({
        data: {
          walletId: sample.id,
          action: 'VENDOR_CONFIG_UPDATE',
          performedBy: actorUserId,
          previousValue: null,
          newValue: JSON.stringify(patch),
          remarks: 'Supplier credit defaults updated',
        },
      });
    }

    return row;
  }

  /**
   * Overlay hierarchy: Global → Supplier default → Customer override.
   * Wallet.creditLimit is authoritative once assigned.
   */
  async resolveWalletConfig(
    walletId: string,
    db: Tx | typeof prisma = prisma,
  ): Promise<CreditConfig & { provenance: CreditConfigProvenance }> {
    const wallet = await db.creditWallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw Errors.notFound('Credit wallet');
    const g = await this.getGlobalConfig(db);
    const vendorCfg = wallet.vendorId
      ? await db.vendorCreditConfig.findUnique({ where: { vendorId: wallet.vendorId } })
      : null;

    const layer = <T>(
      customer: T | null | undefined,
      supplier: T | null | undefined,
      global: T,
    ): { value: T; layer: ConfigLayer } => {
      if (customer != null) return { value: customer, layer: 'customer' };
      if (supplier != null) return { value: supplier, layer: 'supplier' };
      return { value: global, layer: 'global' };
    };

    const repaymentMode = layer(wallet.overrideRepaymentMode, vendorCfg?.repaymentMode, g.repaymentMode);
    const billingModel = layer(wallet.overrideBillingModel, vendorCfg?.billingModel, g.billingModel);
    const creditTenureDays = layer(wallet.overrideCreditTenure, vendorCfg?.creditTenureDays, g.creditTenureDays);
    const gracePeriodDays = layer(wallet.overrideGracePeriod, vendorCfg?.gracePeriodDays, g.gracePeriodDays);
    const blacklistDays = layer(wallet.overrideBlacklistDays, vendorCfg?.blacklistDays, g.blacklistDays);
    const interestRatePct = layer(
      wallet.overrideInterestRate != null ? num(wallet.overrideInterestRate) : null,
      vendorCfg?.interestRatePct != null ? num(vendorCfg.interestRatePct) : null,
      g.interestRatePct,
    );
    const interestFrequencyDays = layer(
      wallet.overrideInterestFreqDays,
      vendorCfg?.interestFrequencyDays,
      g.interestFrequencyDays,
    );
    const penaltyAmount = layer(
      wallet.overridePenaltyAmount != null ? num(wallet.overridePenaltyAmount) : null,
      vendorCfg?.penaltyAmount != null ? num(vendorCfg.penaltyAmount) : null,
      g.penaltyAmount,
    );
    const penaltyFrequencyDays = layer(
      wallet.overridePenaltyFreqDays,
      vendorCfg?.penaltyFrequencyDays,
      g.penaltyFrequencyDays,
    );

    return {
      repaymentMode: repaymentMode.value,
      billingModel: billingModel.value,
      creditLimit: num(wallet.creditLimit),
      creditTenureDays: creditTenureDays.value,
      gracePeriodDays: gracePeriodDays.value,
      blacklistDays: blacklistDays.value,
      interestRatePct: interestRatePct.value,
      interestFrequencyDays: interestFrequencyDays.value,
      penaltyAmount: penaltyAmount.value,
      penaltyFrequencyDays: penaltyFrequencyDays.value,
      eligiblePurchaseCount: g.eligiblePurchaseCount,
      unlockCreditAmount: g.unlockCreditAmount,
      provenance: {
        repaymentMode: repaymentMode.layer,
        billingModel: billingModel.layer,
        creditTenureDays: creditTenureDays.layer,
        gracePeriodDays: gracePeriodDays.layer,
        blacklistDays: blacklistDays.layer,
        interestRatePct: interestRatePct.layer,
        interestFrequencyDays: interestFrequencyDays.layer,
        penaltyAmount: penaltyAmount.layer,
        penaltyFrequencyDays: penaltyFrequencyDays.layer,
      },
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
    options: Omit<AssignCreditOptions, 'overrides' | 'adminUserId' | 'remark' | 'vendorFields'> = {},
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

    const creditSource: CreditSource =
      options.creditSource
      ?? (resolvedVendorId ? 'SUPPLIER_CREDIT' : 'HORECA1_CREDIT');

    return prisma.$transaction(async (tx) => {
      const existing = await tx.creditWallet.findFirst({ where: { userId, vendorId: resolvedVendorId } });
      if (existing) await lockWallet(tx, existing.id);

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

      const validity = {
        ...(options.validFrom !== undefined ? { validFrom: options.validFrom } : {}),
        ...(options.validUntil !== undefined ? { validUntil: options.validUntil } : {}),
      };

      let wallet;
      if (!existing) {
        wallet = await tx.creditWallet.create({
          data: {
            userId,
            vendorId: resolvedVendorId,
            status: 'ACTIVE',
            creditSource,
            creditLimit: limit,
            availableCredit: limit,
            usedCredit: D(0),
            reservedAmount: D(0),
            outstandingAmount: D(0),
            workflowStatus: creditLimit > 0 ? 'SANCTIONED' : 'IN_PROGRESS',
            ...ov,
            ...crmFields,
            ...validity,
          },
        });
        await this.audit(tx, wallet.id, 'CREDIT_ASSIGN', adminUserId, null, { creditLimit, overrides, creditSource }, remark);
        await tx.creditWalletTxn.create({
          data: {
            walletId: wallet.id,
            type: 'CREDIT_ASSIGN',
            amount: limit,
            balanceAfterTxn: wallet.availableCredit,
            note: `Credit line of ₹${creditLimit} assigned (${creditSource})`,
          },
        });
      } else {
        const check = validateLimitChange(
          creditLimit,
          num(existing.outstandingAmount),
          num(existing.reservedAmount),
        );
        if (!check.ok && !options.allowReduceBelowCommitted) {
          throw Errors.badRequest(check.reason);
        }
        const used = num(existing.usedCredit);
        const newAvailable = D(computeAvailable(creditLimit, used));
        const workflowUpdate =
          creditLimit > 0 && existing.workflowStatus === 'IN_PROGRESS'
            ? { workflowStatus: 'SANCTIONED' as const }
            : {};
        const statusRestore =
          existing.status === 'CANCELLED' || existing.status === 'EXPIRED'
            ? { status: 'ACTIVE' as const }
            : {};
        wallet = await tx.creditWallet.update({
          where: { id: existing.id },
          data: {
            creditLimit: limit,
            availableCredit: newAvailable,
            creditSource,
            ...ov,
            ...crmFields,
            ...workflowUpdate,
            ...statusRestore,
            ...validity,
          },
        });
        const action = creditLimit > num(existing.creditLimit) ? 'LIMIT_INCREASE' : 'LIMIT_UPDATE';
        await this.audit(
          tx,
          wallet.id,
          action,
          adminUserId,
          { creditLimit: num(existing.creditLimit) },
          { creditLimit, overrides, creditSource },
          remark,
        );
      }
      return wallet;
    });
  }

  /**
   * Bulk assign/update — per-row isolation so one bad row cannot corrupt the rest.
   * Returns per-row success/failure; does not wrap the whole batch in one TX.
   */
  async bulkAssignCredit(
    rows: Array<{
      userId: string;
      creditLimit: number;
      overrides?: CreditOverrides;
      validFrom?: Date | null;
      validUntil?: Date | null;
    }>,
    vendorId: string | null,
    actorUserId: string,
  ): Promise<{ succeeded: number; failed: Array<{ userId: string; error: string }> }> {
    const seen = new Set<string>();
    const failed: Array<{ userId: string; error: string }> = [];
    let succeeded = 0;

    for (const row of rows) {
      if (seen.has(row.userId)) {
        failed.push({ userId: row.userId, error: 'Duplicate customer in bulk payload' });
        continue;
      }
      seen.add(row.userId);
      try {
        await this.assignCredit(
          row.userId,
          vendorId,
          row.creditLimit,
          row.overrides ?? {},
          actorUserId,
          'Bulk credit assignment',
          {},
          { validFrom: row.validFrom, validUntil: row.validUntil },
        );
        succeeded++;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        failed.push({ userId: row.userId, error: message });
      }
    }
    return { succeeded, failed };
  }

  async setWalletStatus(
    walletId: string,
    status: CreditWalletStatus,
    actorUserId: string,
    reason: string,
    scopeVendorId?: string | null,
  ) {
    return prisma.$transaction(async (tx) => {
      const wallet = await lockWallet(tx, walletId);
      if (!wallet) throw Errors.notFound('Credit wallet');
      if (scopeVendorId !== undefined && wallet.vendorId !== scopeVendorId) {
        throw Errors.forbidden('Credit wallet belongs to another supplier');
      }
      if (wallet.status === status) return wallet;

      const updated = await tx.creditWallet.update({
        where: { id: walletId },
        data: {
          status,
          ...(status === 'ACTIVE'
            ? { blacklistExempt: true, reactivatedAt: new Date(), blacklistedAt: null, overdueDays: 0 }
            : {}),
          ...(status === 'BLACKLISTED' ? { blacklistedAt: new Date() } : {}),
        },
      });
      await this.audit(tx, walletId, `STATUS_${status}`, actorUserId, wallet.status, status, reason);
      return updated;
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

    if (patch.workflowStatus != null && isCreditUsageBlocked(wallet.status)) {
      throw Errors.badRequest('Cannot change workflow status while wallet is system-blocked');
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

  // ── Utilization (order reserve → delivery convert → cancel release) ─────────

  /**
   * Reserve credit at checkout. Increases reserved + used; does NOT increase
   * outstanding until delivery (`convertReservedToOutstanding`). Enforces status,
   * repayment mode, validity window, and available limit under row lock.
   */
  async debitWallet(userId: string, vendorId: string | null, amount: number, orderId: string, db?: Tx) {
    const run = async (tx: Tx) => {
      const wallet = await lockWalletByUserVendor(tx, userId, vendorId);
      if (!wallet) throw Errors.badRequest('No credit wallet for this customer/vendor');
      if (isCreditUsageBlocked(wallet.status)) {
        throw Errors.badRequest(`Credit wallet is ${wallet.status.toLowerCase()} — cannot use credit`);
      }
      if (wallet.validFrom && wallet.validFrom > new Date()) {
        throw Errors.badRequest('Credit line is not yet valid');
      }
      if (wallet.validUntil && wallet.validUntil < new Date()) {
        await tx.creditWallet.update({ where: { id: wallet.id }, data: { status: 'EXPIRED' } });
        throw Errors.badRequest('Credit line has expired');
      }

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

      // Idempotent: same order must not double-reserve.
      const prior = await tx.creditWalletTxn.findFirst({
        where: { walletId: wallet.id, type: 'ORDER_DEBIT', referenceId: orderId },
      });
      if (prior) return wallet;

      const newUsed = wallet.usedCredit.plus(debit);
      const newReserved = wallet.reservedAmount.plus(debit);
      const newAvailable = D(computeAvailable(num(wallet.creditLimit), num(newUsed)));

      const updated = await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          usedCredit: newUsed,
          reservedAmount: newReserved,
          availableCredit: newAvailable,
          lastUtilizationDate: new Date(),
          // Due date starts on delivery conversion, not at reserve.
        },
      });
      await tx.creditWalletTxn.create({
        data: {
          walletId: wallet.id,
          type: 'ORDER_DEBIT',
          amount: debit,
          balanceAfterTxn: newAvailable,
          referenceId: orderId,
          note: `Order ${orderId} credit reserved: ₹${amount}`,
        },
      });
      return updated;
    };
    return db ? run(db) : prisma.$transaction(run);
  }

  /**
   * On delivery: move reserved → outstanding and set/extend due date.
   * Idempotent via DELIVERY_CONVERT txn per order.
   */
  async convertReservedToOutstanding(
    orderId: string,
    userId: string,
    vendorId: string | null,
    db: Tx,
  ): Promise<void> {
    const wallet = await lockWalletByUserVendor(db, userId, vendorId);
    if (!wallet) return;

    const debit = await db.creditWalletTxn.findFirst({
      where: { walletId: wallet.id, type: 'ORDER_DEBIT', referenceId: orderId },
    });
    if (!debit) return;

    const already = await db.creditWalletTxn.findFirst({
      where: { walletId: wallet.id, type: 'DELIVERY_CONVERT', referenceId: orderId },
    });
    if (already) return;

    const reversed = await db.creditWalletTxn.findFirst({
      where: { walletId: wallet.id, type: 'REVERSAL', referenceId: orderId },
    });
    if (reversed) return;

    const amount = debit.amount;
    const newReserved = Prisma.Decimal.max(D(0), wallet.reservedAmount.minus(amount));
    const newOutstanding = wallet.outstandingAmount.plus(amount);
    const config = await this.resolveWalletConfig(wallet.id, db);
    const dueDate =
      wallet.currentDueDate
      ?? this.calculateDueDate(new Date(), config.billingModel, config.creditTenureDays);

    const updated = await db.creditWallet.update({
      where: { id: wallet.id },
      data: {
        reservedAmount: newReserved,
        outstandingAmount: newOutstanding,
        currentDueDate: dueDate,
      },
    });
    await db.creditWalletTxn.create({
      data: {
        walletId: wallet.id,
        type: 'DELIVERY_CONVERT',
        amount,
        balanceAfterTxn: updated.availableCredit,
        referenceId: orderId,
        note: `Order ${orderId} delivered — reserved credit → outstanding ₹${num(amount)}`,
      },
    });
  }

  /**
   * Fix reserved that never converted because delivery went through shipLines
   * (or a same-status delivered PATCH) instead of updateStatus.
   */
  async healReservedCreditForUser(userId: string): Promise<void> {
    const wallets = await prisma.creditWallet.findMany({
      where: { userId, reservedAmount: { gt: 0 } },
      select: { id: true, vendorId: true },
    });
    if (wallets.length === 0) return;

    const walletIds = wallets.map((w) => w.id);
    const vendorByWallet = new Map(wallets.map((w) => [w.id, w.vendorId]));
    const debits = await prisma.creditWalletTxn.findMany({
      where: { walletId: { in: walletIds }, type: 'ORDER_DEBIT' },
      select: { walletId: true, referenceId: true },
    });
    const refs = [...new Set(debits.map((d) => d.referenceId).filter((id): id is string => Boolean(id)))];
    if (refs.length === 0) return;

    const [converts, reversals, orders] = await Promise.all([
      prisma.creditWalletTxn.findMany({
        where: { walletId: { in: walletIds }, type: 'DELIVERY_CONVERT', referenceId: { in: refs } },
        select: { walletId: true, referenceId: true },
      }),
      prisma.creditWalletTxn.findMany({
        where: { walletId: { in: walletIds }, type: 'REVERSAL', referenceId: { in: refs } },
        select: { walletId: true, referenceId: true },
      }),
      prisma.order.findMany({
        where: { id: { in: refs } },
        select: { id: true, status: true },
      }),
    ]);

    const settled = new Set(
      [...converts, ...reversals].map((t) => `${t.walletId}:${t.referenceId}`),
    );
    const orderStatus = new Map(orders.map((o) => [o.id, o.status]));

    for (const debit of debits) {
      if (!debit.referenceId || settled.has(`${debit.walletId}:${debit.referenceId}`)) continue;
      const status = orderStatus.get(debit.referenceId);
      if (status !== 'delivered' && status !== 'cancelled' && status !== 'returned') continue;
      const vendorId = vendorByWallet.get(debit.walletId) ?? null;
      const orderId = debit.referenceId;
      await prisma.$transaction(async (tx) => {
        if (status === 'delivered') {
          await this.convertReservedToOutstanding(orderId, userId, vendorId, tx);
        } else {
          await this.reverseOrderDebit(orderId, userId, vendorId, tx);
        }
      });
    }
  }

  /** Heal every wallet still holding reserved credit (admin/vendor list views). */
  async healAllStuckReservedCredit(): Promise<void> {
    const stuck = await prisma.creditWallet.findMany({
      where: { reservedAmount: { gt: 0 } },
      select: { userId: true },
      distinct: ['userId'],
    });
    for (const row of stuck) {
      await this.healReservedCreditForUser(row.userId);
    }
  }

  /** Release an order's credit when cancelled. Releases reserved if not yet
   *  converted; otherwise reduces outstanding. Idempotent. */
  async reverseOrderDebit(orderId: string, userId: string, vendorId: string | null, db: Tx): Promise<void> {
    const wallet = await lockWalletByUserVendor(db, userId, vendorId);
    if (!wallet) return;
    const debit = await db.creditWalletTxn.findFirst({
      where: { walletId: wallet.id, type: 'ORDER_DEBIT', referenceId: orderId },
    });
    if (!debit) return;
    const already = await db.creditWalletTxn.findFirst({
      where: { walletId: wallet.id, type: 'REVERSAL', referenceId: orderId },
    });
    if (already) return;

    const amount = debit.amount;
    const converted = await db.creditWalletTxn.findFirst({
      where: { walletId: wallet.id, type: 'DELIVERY_CONVERT', referenceId: orderId },
    });

    let newReserved = wallet.reservedAmount;
    let newOutstanding = wallet.outstandingAmount;
    if (converted) {
      newOutstanding = Prisma.Decimal.max(D(0), wallet.outstandingAmount.minus(amount));
    } else if (wallet.reservedAmount.greaterThanOrEqualTo(amount)) {
      // Modern path: still reserved (not delivered).
      newReserved = wallet.reservedAmount.minus(amount);
    } else {
      // Legacy path (pre-reservation): ORDER_DEBIT booked outstanding at checkout.
      const fromReserved = wallet.reservedAmount;
      newReserved = D(0);
      const remainder = amount.minus(fromReserved);
      newOutstanding = Prisma.Decimal.max(D(0), wallet.outstandingAmount.minus(remainder));
    }
    const newUsed = Prisma.Decimal.max(D(0), wallet.usedCredit.minus(amount));
    const newAvailable = D(computeAvailable(num(wallet.creditLimit), num(newUsed)));
    const cleared = newOutstanding.equals(0);

    await db.creditWallet.update({
      where: { id: wallet.id },
      data: {
        usedCredit: newUsed,
        reservedAmount: newReserved,
        outstandingAmount: newOutstanding,
        availableCredit: newAvailable,
        ...(cleared ? { currentDueDate: null, overdueDays: 0, overdueBaseAmount: null } : {}),
      },
    });
    await db.creditWalletTxn.create({
      data: {
        walletId: wallet.id,
        type: 'REVERSAL',
        amount,
        balanceAfterTxn: newAvailable,
        referenceId: orderId,
        note: converted
          ? `Order ${orderId} cancelled — outstanding credit released`
          : `Order ${orderId} cancelled — reserved credit released`,
      },
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
      const wallet = await lockWallet(tx, walletId);
      if (!wallet) throw Errors.notFound('Credit wallet');

      const pay = D(amount);
      if (pay.lessThanOrEqualTo(0)) throw Errors.badRequest('Repayment amount must be positive');
      if (pay.greaterThan(wallet.outstandingAmount)) {
        throw Errors.badRequest(`Repayment ₹${amount} exceeds outstanding ₹${num(wallet.outstandingAmount)}`);
      }

      const newOutstanding = wallet.outstandingAmount.minus(pay);
      const newUsed = Prisma.Decimal.max(D(0), wallet.usedCredit.minus(pay));
      const newAvailable = D(computeAvailable(num(wallet.creditLimit), num(newUsed)));
      const cleared = newOutstanding.equals(0);
      const statusAfterRepay =
        cleared && (wallet.status === 'BLOCKED' || wallet.status === 'FROZEN' || wallet.status === 'SUSPENDED')
          ? 'ACTIVE'
          : wallet.status;

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
      wallet.status === 'ACTIVE' && overdueDays > 0 ? { status: 'FROZEN' as const } : {};
    await tx.creditWallet.update({
      where: { id: walletId },
      data: { overdueDays, overdueBaseAmount: wallet.overdueBaseAmount ?? base, ...statusUpdate },
    });

    if (statusUpdate.status === 'FROZEN') {
      await this.audit(tx, walletId, 'FREEZE', 'SYSTEM', wallet.status, 'FROZEN', `Auto-frozen: ${overdueDays} overdue day(s)`);
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
    const periods = interestPeriods(taxableDays, config.interestFrequencyDays);
    if (periods >= 1 && config.interestRatePct > 0) {
      const target = compoundInterestTarget(num(base), config.interestRatePct, periods);
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
   *  in-app + SMS. Meant to run once daily. */
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
      for (const channel of ['in_app', 'sms'] as const) {
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

  /** Expire wallets past validUntil; run with daily accruals. */
  async processExpiredWallets(): Promise<{ expired: number }> {
    const due = await prisma.creditWallet.findMany({
      where: {
        validUntil: { lt: new Date() },
        status: { in: ['ACTIVE', 'SUSPENDED', 'BLOCKED', 'FROZEN'] },
      },
      select: { id: true },
    });
    let expired = 0;
    for (const { id } of due) {
      await this.setWalletStatus(id, 'EXPIRED', 'SYSTEM', 'Credit validity window ended').then(() => {
        expired++;
      }).catch((e) => console.error(`[credit] expire failed for ${id}:`, e));
    }
    return { expired };
  }

  /** Daily scheduler entrypoint: expire → accrue interest/penalties + blacklist → remind. */
  async runDailyCreditTasks(): Promise<{ accruals: number; reminders: number; expired: number }> {
    const exp = await this.processExpiredWallets();
    const accr = await this.processOverdueAccounts();
    const rem = await this.sendDueReminders();
    return { accruals: accr.processed, reminders: rem.sent, expired: exp.expired };
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
