// Promo Engine Phase C — Welcome / First Order / Referral / Payout issuance.
// Called from promotion.service (checkout + public APIs) and the UserRegistered
// listener. All money writes go through Serializable transactions; unique
// constraints (WelcomeGrant.userId, FirstOrderGrant.userId, ReferralReward
// attribution+side, PayoutInvite.token) make retries idempotent.

import { randomBytes } from 'crypto';
import { Prisma, type CashbackEntrySource, type ProgramRewardType, type ReferralRewardSide } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { uniquePayoutTrackingKey } from '@/lib/payoutTrackingKey';

interface DraftForMov {
  subtotal: number;
  promoDiscount: number;
}

type Db = Prisma.TransactionClient;

const r2 = (n: number) => Math.round(n * 100) / 100;
export const PROGRAM_SINGLETON = 'default';

const COD_SUCCESS_STATUSES: Array<
  'confirmed' | 'processing' | 'ready_for_dispatch' | 'shipped' | 'partially_delivered' | 'delivered'
> = ['confirmed', 'processing', 'ready_for_dispatch', 'shipped', 'partially_delivered', 'delivered'];

export function isPrismaUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

function appBaseUrl(originOverride?: string | null): string {
  const override = (originOverride || '').replace(/\/$/, '');
  if (override) return override;
  return (process.env.AUTH_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '');
}

function isCodMethod(method: string | null | undefined): boolean {
  return (method ?? '').toLowerCase() === 'cod';
}

export function isSuccessfulOrderRow(order: {
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
}): boolean {
  if (order.status === 'draft' || order.status === 'cancelled') return false;
  if (order.paymentStatus === 'paid') return true;
  return isCodMethod(order.paymentMethod) && COD_SUCCESS_STATUSES.includes(order.status as (typeof COD_SUCCESS_STATUSES)[number]);
}

export async function hasSuccessfulOrder(
  db: Db | typeof prisma,
  userId: string,
  opts?: { excludeOrderIds?: string[] },
): Promise<boolean> {
  const exclude = opts?.excludeOrderIds ?? [];
  const row = await db.order.findFirst({
    where: {
      userId,
      status: { notIn: ['draft', 'cancelled'] },
      ...(exclude.length > 0 ? { id: { notIn: exclude } } : {}),
      OR: [
        { paymentStatus: 'paid' },
        { paymentMethod: 'cod', status: { in: COD_SUCCESS_STATUSES } },
      ],
    },
    select: { id: true },
  });
  return !!row;
}

function goodsBase(order: { subtotal: unknown; promoDiscount: unknown; couponDiscount: unknown }): number {
  return r2(Math.max(0, Number(order.subtotal) - Number(order.promoDiscount) - Number(order.couponDiscount)));
}

async function notifyInApp(
  db: Db,
  userId: string,
  title: string,
  body: string,
  referenceId?: string,
  referenceType?: string,
): Promise<void> {
  await db.notification.create({
    data: { userId, type: 'promo', channel: 'in_app', status: 'sent', title, body, referenceId, referenceType },
  });
}

async function creditRewardsWallet(
  db: Db,
  userId: string,
  amount: number,
  referenceId: string,
  referenceType: string,
  notes: string,
): Promise<string> {
  const wallet = await db.wallet.upsert({
    where: { userId },
    create: { userId, balance: amount },
    update: { balance: { increment: amount } },
  });
  const txn = await db.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'credit',
      amount,
      referenceId,
      referenceType,
      notes,
    },
  });
  return txn.id;
}

async function createPersonalCoupon(
  db: Db,
  args: {
    userId: string;
    prefix: string;
    name: string;
    discountType: 'flat' | 'percentage';
    discountValue: number;
    maxDiscount: number | null;
    minOrderValue: number | null;
    validDays: number | null;
  },
): Promise<{ id: string; code: string }> {
  const endDate = args.validDays ? new Date(Date.now() + args.validDays * 86_400_000) : null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = `${args.prefix}${randomBytes(4).toString('hex').toUpperCase()}`;
    try {
      const coupon = await db.coupon.create({
        data: {
          code,
          name: args.name,
          vendorId: null,
          discountType: args.discountType,
          discountValue: args.discountValue,
          maxDiscount: args.maxDiscount,
          minOrderValue: args.minOrderValue,
          endDate,
          perUserLimit: 1,
          usageLimit: 1,
          audienceUserIds: [args.userId],
          isActive: true,
        },
        select: { id: true, code: true },
      });
      return coupon;
    } catch (error) {
      if (isPrismaUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw Errors.badRequest('Could not allocate a coupon code. Please retry.');
}

interface IssuedReward {
  couponId: string | null;
  cashbackEntryId: string | null;
  walletTxnId: string | null;
}

async function issueProgramReward(
  db: Db,
  args: {
    userId: string;
    rewardType: ProgramRewardType;
    rewardValue: number;
    maxDiscount: number | null;
    minOrderValue: number | null;
    validDays: number | null;
    source: Exclude<CashbackEntrySource, 'order' | 'direct_grant'>;
    couponPrefix: string;
    couponName: string;
    notes: string;
    notifyTitle: string;
    notifyBody: string;
  },
): Promise<IssuedReward> {
  const value = r2(args.rewardValue);
  if (args.rewardType === 'free_delivery') {
    return { couponId: null, cashbackEntryId: null, walletTxnId: null };
  }

  if (args.rewardType === 'coupon_flat' || args.rewardType === 'coupon_percentage') {
    const coupon = await createPersonalCoupon(db, {
      userId: args.userId,
      prefix: args.couponPrefix,
      name: args.couponName,
      discountType: args.rewardType === 'coupon_flat' ? 'flat' : 'percentage',
      discountValue: value,
      maxDiscount: args.maxDiscount,
      minOrderValue: args.minOrderValue,
      validDays: args.validDays,
    });
    await notifyInApp(
      db,
      args.userId,
      args.notifyTitle,
      `${args.notifyBody} Use code ${coupon.code} at checkout.`,
      coupon.id,
      'coupon',
    );
    return { couponId: coupon.id, cashbackEntryId: null, walletTxnId: null };
  }

  const entry = await db.cashbackEntry.create({
    data: {
      userId: args.userId,
      source: args.source,
      amount: value,
      destination: 'wallet',
      status: 'credited',
      notes: args.notes,
      trackingKey: await uniquePayoutTrackingKey(db),
      creditedAt: new Date(),
    },
  });
  const walletTxnId = await creditRewardsWallet(
    db,
    args.userId,
    value,
    entry.id,
    args.source,
    args.notes,
  );
  await db.cashbackEntry.update({
    where: { id: entry.id },
    data: { walletTxnId },
  });
  await notifyInApp(db, args.userId, args.notifyTitle, args.notifyBody, entry.id, 'cashback');
  return { couponId: null, cashbackEntryId: entry.id, walletTxnId };
}

// ── Welcome ──────────────────────────────────────────────────────────────

export async function getWelcomeOffer() {
  return prisma.welcomeOffer.findUnique({ where: { singletonKey: PROGRAM_SINGLETON } });
}

export async function upsertWelcomeOffer(data: {
  isActive: boolean;
  rewardType: ProgramRewardType;
  rewardValue: number;
  minOrderValue?: number | null;
  validDays?: number | null;
  maxDiscount?: number | null;
}) {
  return prisma.welcomeOffer.upsert({
    where: { singletonKey: PROGRAM_SINGLETON },
    create: {
      singletonKey: PROGRAM_SINGLETON,
      isActive: data.isActive,
      rewardType: data.rewardType,
      rewardValue: data.rewardValue,
      minOrderValue: data.minOrderValue ?? null,
      validDays: data.validDays ?? null,
      maxDiscount: data.maxDiscount ?? null,
    },
    update: {
      isActive: data.isActive,
      rewardType: data.rewardType,
      rewardValue: data.rewardValue,
      minOrderValue: data.minOrderValue ?? null,
      validDays: data.validDays ?? null,
      maxDiscount: data.maxDiscount ?? null,
    },
  });
}

export async function issueWelcomeForUser(userId: string): Promise<void> {
  const offer = await prisma.welcomeOffer.findUnique({ where: { singletonKey: PROGRAM_SINGLETON } });
  if (!offer?.isActive) return;
  const existing = await prisma.welcomeGrant.findUnique({ where: { userId }, select: { id: true } });
  if (existing) return;

  try {
    await prisma.$transaction(async (tx) => {
      const again = await tx.welcomeGrant.findUnique({ where: { userId }, select: { id: true } });
      if (again) return;

      const grant = await tx.welcomeGrant.create({
        data: {
          userId,
          offerId: offer.id,
          rewardType: offer.rewardType,
          rewardValue: offer.rewardValue,
        },
      });

      const issued = await issueProgramReward(tx, {
        userId,
        rewardType: offer.rewardType,
        rewardValue: Number(offer.rewardValue),
        maxDiscount: offer.maxDiscount != null ? Number(offer.maxDiscount) : null,
        minOrderValue: offer.minOrderValue != null ? Number(offer.minOrderValue) : null,
        validDays: offer.validDays,
        source: 'welcome',
        couponPrefix: 'WEL',
        couponName: 'Welcome offer',
        notes: 'Welcome offer',
        notifyTitle: 'Welcome to HoReCa Hub 🎁',
        notifyBody:
          offer.rewardType === 'wallet_credit' || offer.rewardType === 'cashback'
            ? `₹${Number(offer.rewardValue).toLocaleString('en-IN')} has been credited to your H1 Wallet.`
            : offer.rewardType === 'free_delivery'
              ? 'Your welcome free-delivery entitlement is ready for your first paid shipment.'
              : 'Your welcome coupon is ready.',
      });

      await tx.welcomeGrant.update({
        where: { id: grant.id },
        data: {
          couponId: issued.couponId,
          cashbackEntryId: issued.cashbackEntryId,
          walletTxnId: issued.walletTxnId,
        },
      });
    }, { isolationLevel: 'Serializable' });

    logAction(null, null, {
      action: AUDIT_ACTIONS.welcomeIssue,
      entity: 'welcome_grant',
      entityId: userId,
      after: { userId, rewardType: offer.rewardType, rewardValue: Number(offer.rewardValue) },
    });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) return;
    throw error;
  }
}

// ── First order ──────────────────────────────────────────────────────────

export async function getFirstOrderOffer() {
  return prisma.firstOrderOffer.findUnique({ where: { singletonKey: PROGRAM_SINGLETON } });
}

export async function upsertFirstOrderOffer(data: {
  isActive: boolean;
  rewardType: Exclude<ProgramRewardType, 'free_delivery'>;
  rewardValue: number;
  minOrderValue?: number | null;
  validDays?: number | null;
  maxDiscount?: number | null;
}) {
  return prisma.firstOrderOffer.upsert({
    where: { singletonKey: PROGRAM_SINGLETON },
    create: {
      singletonKey: PROGRAM_SINGLETON,
      isActive: data.isActive,
      rewardType: data.rewardType,
      rewardValue: data.rewardValue,
      minOrderValue: data.minOrderValue ?? null,
      validDays: data.validDays ?? null,
      maxDiscount: data.maxDiscount ?? null,
    },
    update: {
      isActive: data.isActive,
      rewardType: data.rewardType,
      rewardValue: data.rewardValue,
      minOrderValue: data.minOrderValue ?? null,
      validDays: data.validDays ?? null,
      maxDiscount: data.maxDiscount ?? null,
    },
  });
}

/**
 * If the user is first-order eligible and did not supply a coupon, create (or
 * reuse) their personal first-order coupon and return its code. Preview-safe
 * when `createIfMissing` is false.
 */
export async function autoFirstOrderCoupon(
  db: Db,
  args: { userId: string; drafts: DraftForMov[]; createIfMissing: boolean },
): Promise<{ couponId: string; code: string } | null> {
  const offer = await db.firstOrderOffer.findUnique({ where: { singletonKey: PROGRAM_SINGLETON } });
  if (!offer?.isActive) return null;
  if (offer.rewardType !== 'coupon_flat' && offer.rewardType !== 'coupon_percentage') return null;

  const alreadyGranted = await db.firstOrderGrant.findUnique({ where: { userId: args.userId }, select: { id: true } });
  if (alreadyGranted) return null;
  if (await hasSuccessfulOrder(db, args.userId)) return null;

  const goods = r2(args.drafts.reduce((a, d) => a + Math.max(0, d.subtotal - d.promoDiscount), 0));
  if (offer.minOrderValue != null && goods < Number(offer.minOrderValue)) return null;

  const existing = await db.coupon.findFirst({
    where: {
      isActive: true,
      audienceUserIds: { has: args.userId },
      name: 'First order offer',
      usedCount: 0,
    },
    select: { id: true, code: true, endDate: true },
  });
  if (existing && (!existing.endDate || existing.endDate > new Date())) {
    return { couponId: existing.id, code: existing.code };
  }
  if (!args.createIfMissing) return null;

  const coupon = await createPersonalCoupon(db, {
    userId: args.userId,
    prefix: 'FO1',
    name: 'First order offer',
    discountType: offer.rewardType === 'coupon_flat' ? 'flat' : 'percentage',
    discountValue: Number(offer.rewardValue),
    maxDiscount: offer.maxDiscount != null ? Number(offer.maxDiscount) : null,
    minOrderValue: offer.minOrderValue != null ? Number(offer.minOrderValue) : null,
    validDays: offer.validDays,
  });
  return { couponId: coupon.id, code: coupon.code };
}

export async function captureFirstOrderCouponGrant(
  db: Db,
  args: { userId: string; couponId: string; orderId: string; checkoutGroupId: string },
): Promise<void> {
  const offer = await db.firstOrderOffer.findUnique({ where: { singletonKey: PROGRAM_SINGLETON } });
  if (!offer?.isActive) return;
  if (offer.rewardType !== 'coupon_flat' && offer.rewardType !== 'coupon_percentage') return;

  const coupon = await db.coupon.findUnique({
    where: { id: args.couponId },
    select: { id: true, name: true, audienceUserIds: true },
  });
  if (!coupon || coupon.name !== 'First order offer') return;
  if (!coupon.audienceUserIds.includes(args.userId)) return;

  try {
    await db.firstOrderGrant.create({
      data: {
        userId: args.userId,
        offerId: offer.id,
        orderId: args.orderId,
        checkoutGroupId: args.checkoutGroupId,
        rewardType: offer.rewardType,
        rewardValue: offer.rewardValue,
        couponId: args.couponId,
      },
    });
    logAction(null, null, {
      action: AUDIT_ACTIONS.firstOrderIssue,
      entity: 'first_order_grant',
      entityId: args.userId,
      after: { userId: args.userId, rewardType: offer.rewardType, couponId: args.couponId, checkoutGroupId: args.checkoutGroupId },
    });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) return;
    throw error;
  }
}

export async function releaseFirstOrderCouponGrant(db: Db, checkoutGroupId: string): Promise<void> {
  await db.firstOrderGrant.deleteMany({
    where: {
      checkoutGroupId,
      walletTxnId: null,
      cashbackEntryId: null,
    },
  });
}

async function issueFirstOrderPostSuccess(
  db: Db,
  args: { userId: string; orderId: string; checkoutGroupId: string | null; groupOrderIds: string[] },
): Promise<void> {
  const offer = await db.firstOrderOffer.findUnique({ where: { singletonKey: PROGRAM_SINGLETON } });
  if (!offer?.isActive) return;
  if (offer.rewardType === 'coupon_flat' || offer.rewardType === 'coupon_percentage') return;

  const existing = await db.firstOrderGrant.findUnique({ where: { userId: args.userId }, select: { id: true } });
  if (existing) return;
  if (await hasSuccessfulOrder(db, args.userId, { excludeOrderIds: args.groupOrderIds })) return;

  const goodsOrders = await db.order.findMany({
    where: args.checkoutGroupId
      ? { checkoutGroupId: args.checkoutGroupId, status: { not: 'cancelled' } }
      : { id: args.orderId },
    select: { subtotal: true, promoDiscount: true, couponDiscount: true },
  });
  const goods = r2(goodsOrders.reduce((a, o) => a + goodsBase(o), 0));
  if (offer.minOrderValue != null && goods < Number(offer.minOrderValue)) return;

  let grantId: string;
  try {
    const grant = await db.firstOrderGrant.create({
      data: {
        userId: args.userId,
        offerId: offer.id,
        orderId: args.orderId,
        checkoutGroupId: args.checkoutGroupId,
        rewardType: offer.rewardType,
        rewardValue: offer.rewardValue,
      },
    });
    grantId = grant.id;
  } catch (error) {
    if (isPrismaUniqueViolation(error)) return;
    throw error;
  }

  const issued = await issueProgramReward(db, {
    userId: args.userId,
    rewardType: offer.rewardType,
    rewardValue: Number(offer.rewardValue),
    maxDiscount: offer.maxDiscount != null ? Number(offer.maxDiscount) : null,
    minOrderValue: offer.minOrderValue != null ? Number(offer.minOrderValue) : null,
    validDays: offer.validDays,
    source: 'first_order',
    couponPrefix: 'FO1',
    couponName: 'First order offer',
    notes: 'First order offer',
    notifyTitle: 'First order reward 🎁',
    notifyBody: `₹${Number(offer.rewardValue).toLocaleString('en-IN')} has been credited to your H1 Wallet.`,
  });

  await db.firstOrderGrant.update({
    where: { id: grantId },
    data: {
      couponId: issued.couponId,
      cashbackEntryId: issued.cashbackEntryId,
      walletTxnId: issued.walletTxnId,
    },
  });
  logAction(null, null, {
    action: AUDIT_ACTIONS.firstOrderIssue,
    entity: 'first_order_grant',
    entityId: args.userId,
    after: { userId: args.userId, rewardType: offer.rewardType, orderId: args.orderId },
  });
}

// ── Referral ─────────────────────────────────────────────────────────────

export async function getReferralProgram() {
  return prisma.referralProgram.findUnique({ where: { singletonKey: PROGRAM_SINGLETON } });
}

export async function upsertReferralProgram(data: {
  isActive: boolean;
  trigger: 'signup' | 'first_order' | 'first_order_mov';
  minOrderValue?: number | null;
  referrerRewardType: Exclude<ProgramRewardType, 'free_delivery'>;
  referrerRewardValue: number;
  referrerMaxDiscount?: number | null;
  referrerValidDays?: number | null;
  referredRewardType: Exclude<ProgramRewardType, 'free_delivery'>;
  referredRewardValue: number;
  referredMaxDiscount?: number | null;
  referredValidDays?: number | null;
}) {
  return prisma.referralProgram.upsert({
    where: { singletonKey: PROGRAM_SINGLETON },
    create: { singletonKey: PROGRAM_SINGLETON, ...data },
    update: data,
  });
}

export async function ensureReferralToken(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralToken: true },
  });
  if (!existing) throw Errors.notFound('User');
  if (existing.referralToken) return existing.referralToken;

  for (let attempt = 0; attempt < 8; attempt++) {
    const token = newToken();
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralToken: token },
        select: { referralToken: true },
      });
      if (updated.referralToken) return updated.referralToken;
    } catch (error) {
      if (isPrismaUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw Errors.badRequest('Could not allocate a referral link. Please retry.');
}

export async function recordReferralClick(token: string): Promise<{
  token: string;
  referrerName: string;
  clickId: string;
}> {
  const referrer = await prisma.user.findUnique({
    where: { referralToken: token },
    select: { id: true, fullName: true, businessName: true },
  });
  if (!referrer) throw Errors.notFound('Invite');

  const click = await prisma.referralClick.create({
    data: { token, referrerId: referrer.id },
    select: { id: true },
  });
  const referrerName = (referrer.businessName || referrer.fullName || 'A HoReCa Hub customer').trim();
  return { token, referrerName, clickId: click.id };
}

async function issueReferralSide(
  db: Db,
  args: {
    attributionId: string;
    userId: string;
    side: ReferralRewardSide;
    rewardType: ProgramRewardType;
    rewardValue: number;
    maxDiscount: number | null;
    validDays: number | null;
  },
): Promise<void> {
  const already = await db.referralReward.findUnique({
    where: { attributionId_side: { attributionId: args.attributionId, side: args.side } },
    select: { id: true },
  });
  if (already) return;

  let rewardId: string;
  try {
    const row = await db.referralReward.create({
      data: {
        attributionId: args.attributionId,
        side: args.side,
        rewardType: args.rewardType,
        rewardValue: args.rewardValue,
      },
    });
    rewardId = row.id;
  } catch (error) {
    if (isPrismaUniqueViolation(error)) return;
    throw error;
  }

  const issued = await issueProgramReward(db, {
    userId: args.userId,
    rewardType: args.rewardType,
    rewardValue: args.rewardValue,
    maxDiscount: args.maxDiscount,
    minOrderValue: null,
    validDays: args.validDays,
    source: 'referral',
    couponPrefix: args.side === 'referrer' ? 'RFR' : 'RFD',
    couponName: args.side === 'referrer' ? 'Referral reward' : 'Referred-friend reward',
    notes: args.side === 'referrer' ? 'Referral reward (referrer)' : 'Referral reward (referred)',
    notifyTitle: 'Referral reward 🎁',
    notifyBody:
      args.rewardType === 'wallet_credit' || args.rewardType === 'cashback'
        ? `₹${args.rewardValue.toLocaleString('en-IN')} has been credited to your H1 Wallet.`
        : 'Your referral coupon is ready.',
  });

  await db.referralReward.update({
    where: { id: rewardId },
    data: {
      couponId: issued.couponId,
      cashbackEntryId: issued.cashbackEntryId,
      walletTxnId: issued.walletTxnId,
    },
  });
}

async function issueReferralRewardsIfDue(
  db: Db,
  attributionId: string,
  opts?: { checkoutGoodsTotal?: number },
): Promise<void> {
  const program = await db.referralProgram.findUnique({ where: { singletonKey: PROGRAM_SINGLETON } });
  if (!program?.isActive) return;

  const attribution = await db.referralAttribution.findUnique({
    where: { id: attributionId },
    select: { id: true, referrerId: true, referredUserId: true },
  });
  if (!attribution) return;

  if (program.trigger === 'first_order_mov') {
    const mov = program.minOrderValue != null ? Number(program.minOrderValue) : 0;
    if (!opts?.checkoutGoodsTotal || opts.checkoutGoodsTotal < mov) return;
  }

  await issueReferralSide(db, {
    attributionId,
    userId: attribution.referrerId,
    side: 'referrer',
    rewardType: program.referrerRewardType,
    rewardValue: Number(program.referrerRewardValue),
    maxDiscount: program.referrerMaxDiscount != null ? Number(program.referrerMaxDiscount) : null,
    validDays: program.referrerValidDays,
  });
  await issueReferralSide(db, {
    attributionId,
    userId: attribution.referredUserId,
    side: 'referred',
    rewardType: program.referredRewardType,
    rewardValue: Number(program.referredRewardValue),
    maxDiscount: program.referredMaxDiscount != null ? Number(program.referredMaxDiscount) : null,
    validDays: program.referredValidDays,
  });
  logAction(null, null, {
    action: AUDIT_ACTIONS.referralIssue,
    entity: 'referral_attribution',
    entityId: attributionId,
    after: { trigger: program.trigger, referrerId: attribution.referrerId, referredUserId: attribution.referredUserId },
  });
}

export async function attributeReferralOnSignup(args: {
  referredUserId: string;
  token: string;
}): Promise<void> {
  const referrer = await prisma.user.findUnique({
    where: { referralToken: args.token },
    select: { id: true },
  });
  if (!referrer) return;
  if (referrer.id === args.referredUserId) return;

  const already = await prisma.referralAttribution.findUnique({
    where: { referredUserId: args.referredUserId },
    select: { id: true },
  });
  if (already) return;

  const click = await prisma.referralClick.findFirst({
    where: { token: args.token, referrerId: referrer.id, attribution: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  try {
    const attribution = await prisma.$transaction(async (tx) => {
      const created = await tx.referralAttribution.create({
        data: {
          referredUserId: args.referredUserId,
          referrerId: referrer.id,
          clickId: click?.id ?? null,
        },
        select: { id: true },
      });
      const program = await tx.referralProgram.findUnique({ where: { singletonKey: PROGRAM_SINGLETON } });
      if (program?.isActive && program.trigger === 'signup') {
        await issueReferralRewardsIfDue(tx, created.id);
      }
      return created;
    }, { isolationLevel: 'Serializable' });
    void attribution;
  } catch (error) {
    if (isPrismaUniqueViolation(error)) return;
    throw error;
  }
}

async function issueReferralOnSuccessfulCheckout(
  db: Db,
  args: { userId: string; checkoutGroupId: string | null; groupOrderIds: string[]; goodsTotal: number },
): Promise<void> {
  const program = await db.referralProgram.findUnique({ where: { singletonKey: PROGRAM_SINGLETON } });
  if (!program?.isActive) return;
  if (program.trigger !== 'first_order' && program.trigger !== 'first_order_mov') return;

  const attribution = await db.referralAttribution.findUnique({
    where: { referredUserId: args.userId },
    select: { id: true },
  });
  if (!attribution) return;
  if (await hasSuccessfulOrder(db, args.userId, { excludeOrderIds: args.groupOrderIds })) return;

  await issueReferralRewardsIfDue(db, attribution.id, {
    checkoutGoodsTotal: args.goodsTotal,
  });
}

export async function getMyReferral(userId: string, opts?: { originOverride?: string | null }) {
  const token = await ensureReferralToken(userId);
  const base = appBaseUrl(opts?.originOverride);
  const [attributionCount, rewards, referredBy] = await Promise.all([
    prisma.referralAttribution.count({ where: { referrerId: userId } }),
    prisma.referralReward.findMany({
      where: { attribution: { referrerId: userId }, side: 'referrer' },
      select: { id: true, rewardType: true, rewardValue: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.referralAttribution.findUnique({
      where: { referredUserId: userId },
      select: {
        createdAt: true,
        referrer: { select: { fullName: true, businessName: true } },
        rewards: { select: { side: true, rewardType: true, rewardValue: true } },
      },
    }),
  ]);
  return {
    token,
    invitePath: `/invite/${token}`,
    inviteUrl: base ? `${base}/invite/${token}` : `/invite/${token}`,
    referredCount: attributionCount,
    rewards,
    referredBy: referredBy
      ? {
          name: (referredBy.referrer.businessName || referredBy.referrer.fullName || 'A friend').trim(),
          createdAt: referredBy.createdAt,
          rewards: referredBy.rewards,
        }
      : null,
  };
}

// ── Successful-order hook (first-order wallet/cashback + referral) ───────

export async function onOrdersBecameSuccessful(orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) return;
  const uniqueIds = [...new Set(orderIds)];

  try {
    await prisma.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: { id: { in: uniqueIds } },
        select: {
          id: true,
          userId: true,
          checkoutGroupId: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          subtotal: true,
          promoDiscount: true,
          couponDiscount: true,
        },
      });
      const successful = orders.filter(isSuccessfulOrderRow);
      if (successful.length === 0) return;

      const byUser = new Map<string, typeof successful>();
      for (const order of successful) {
        const list = byUser.get(order.userId) ?? [];
        list.push(order);
        byUser.set(order.userId, list);
      }

      for (const [userId, userOrders] of byUser) {
        const groupId = userOrders[0]?.checkoutGroupId ?? null;
        const siblings = groupId
          ? await tx.order.findMany({
              where: { checkoutGroupId: groupId },
              select: {
                id: true,
                status: true,
                paymentStatus: true,
                paymentMethod: true,
                subtotal: true,
                promoDiscount: true,
                couponDiscount: true,
              },
            })
          : userOrders;
        const groupOrderIds = siblings.map((o) => o.id);
        const goodsTotal = r2(
          siblings.filter((o) => o.status !== 'cancelled').reduce((a, o) => a + goodsBase(o), 0),
        );
        const triggerOrderId = userOrders[0]!.id;

        try {
          await issueFirstOrderPostSuccess(tx, {
            userId,
            orderId: triggerOrderId,
            checkoutGroupId: groupId,
            groupOrderIds,
          });
        } catch (error) {
          if (!isPrismaUniqueViolation(error)) throw error;
        }
        try {
          await issueReferralOnSuccessfulCheckout(tx, {
            userId,
            checkoutGroupId: groupId,
            groupOrderIds,
            goodsTotal,
          });
        } catch (error) {
          if (!isPrismaUniqueViolation(error)) throw error;
        }
      }
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) return;
    throw error;
  }
}

// ── Payout magic links ───────────────────────────────────────────────────

export async function createPayoutInvite(args: {
  createdById: string;
  amount: number;
  notes?: string | null;
  userId?: string | null;
  expiresInDays?: number;
}) {
  const amount = r2(args.amount);
  if (args.userId) {
    const user = await prisma.user.findUnique({ where: { id: args.userId }, select: { id: true } });
    if (!user) throw Errors.notFound('User');
  }
  const days = args.expiresInDays ?? 7;
  const expiresAt = new Date(Date.now() + days * 86_400_000);

  for (let attempt = 0; attempt < 8; attempt++) {
    const token = newToken();
    try {
      const invite = await prisma.payoutInvite.create({
        data: {
          token,
          amount,
          notes: args.notes ?? null,
          trackingKey: await uniquePayoutTrackingKey(prisma),
          expiresAt,
          userId: args.userId ?? null,
          createdById: args.createdById,
        },
      });
      const base = appBaseUrl();
      return {
        ...invite,
        claimUrl: base ? `${base}/payout/${invite.token}` : `/payout/${invite.token}`,
      };
    } catch (error) {
      if (isPrismaUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw Errors.badRequest('Could not allocate a payout link. Please retry.');
}

export async function getPayoutInvitePublic(token: string) {
  const invite = await prisma.payoutInvite.findUnique({
    where: { token },
    select: {
      amount: true,
      status: true,
      expiresAt: true,
      claimedAt: true,
      trackingKey: true,
    },
  });
  if (!invite) throw Errors.notFound('Payout invite');
  return {
    amount: Number(invite.amount),
    status: invite.status,
    expiresAt: invite.expiresAt,
    trackingKey: invite.trackingKey,
    claimed: invite.status === 'claimed' || invite.claimedAt != null,
    expired: invite.status === 'pending' && invite.expiresAt.getTime() < Date.now(),
  };
}

export async function claimPayoutInvite(args: {
  token: string;
  name: string;
  upiId: string;
  sessionUserId?: string | null;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
    const invite = await tx.payoutInvite.findUnique({ where: { token: args.token } });
    if (!invite) throw Errors.notFound('Payout invite');
    if (invite.status === 'cancelled') throw Errors.badRequest('This payout link has been cancelled');
    if (invite.status === 'claimed' || invite.claimedAt) {
      throw Errors.badRequest('This payout has already been claimed');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw Errors.badRequest('This payout link has expired');
    }

    const userId = invite.userId ?? args.sessionUserId ?? invite.createdById;
    const amount = r2(Number(invite.amount));
    const trackingKey = invite.trackingKey ?? (await uniquePayoutTrackingKey(tx));

    const entry = await tx.cashbackEntry.create({
      data: {
        userId,
        source: 'payout_invite',
        amount,
        destination: 'upi',
        status: 'approved',
        upiId: args.upiId,
        notes: invite.notes ?? null,
        trackingKey,
        createdById: invite.createdById,
      },
    });

    const claimed = await tx.payoutInvite.update({
      where: { id: invite.id },
      data: {
        status: 'claimed',
        claimedAt: new Date(),
        claimedName: args.name.trim(),
        claimedUpiId: args.upiId,
        cashbackEntryId: entry.id,
        trackingKey,
      },
    });

    if (invite.userId || (args.sessionUserId && args.sessionUserId !== invite.createdById)) {
      await notifyInApp(
        tx,
        userId,
        'Payout pending 🎁',
        `₹${amount.toLocaleString('en-IN')} will be sent to ${args.upiId} after admin confirmation.`,
        entry.id,
        'cashback',
      );
    }

    logAction(null, null, {
      action: AUDIT_ACTIONS.payoutInviteClaim,
      entity: 'payout_invite',
      entityId: invite.id,
      after: { amount, upiId: args.upiId, cashbackEntryId: entry.id },
    });

    return { invite: claimed, entry };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      throw Errors.badRequest('This payout has already been claimed');
    }
    throw error;
  }
}
