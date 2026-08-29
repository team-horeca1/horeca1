import { z } from 'zod';

// ─── Shared field schemas ────────────────────────────────────────────────

const couponCodeSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/, 'Code may only contain letters, numbers, - and _')
  .transform((c) => c.toUpperCase());

const discountTypeSchema = z.enum(['flat', 'percentage']);
const destinationSchema = z.enum(['wallet', 'upi']);

const isoDate = z.string().datetime();

// Percentage values must be ≤ 100; flat values just need to be positive.
const valueTypePair = (d: { discountType: 'flat' | 'percentage'; discountValue: number }) =>
  d.discountType !== 'percentage' || d.discountValue <= 100;

const dateWindow = (d: { startDate?: string | null; endDate?: string | null }) =>
  !d.startDate || !d.endDate || new Date(d.endDate) > new Date(d.startDate);

// ─── Coupons ─────────────────────────────────────────────────────────────

export const createCouponSchema = z
  .object({
    code: couponCodeSchema,
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional().nullable(),
    discountType: discountTypeSchema,
    discountValue: z.number().positive(),
    maxDiscount: z.number().positive().optional().nullable(),
    minOrderValue: z.number().min(0).optional().nullable(),
    startDate: isoDate.optional().nullable(),
    endDate: isoDate.optional().nullable(),
    usageLimit: z.number().int().min(1).optional().nullable(),
    perUserLimit: z.number().int().min(1).optional().nullable(),
    categoryIds: z.array(z.string().uuid()).max(100).optional(),
    productIds: z.array(z.string().uuid()).max(500).optional(),
    brandNames: z.array(z.string().min(1).max(150)).max(100).optional(),
    // Admin-only targeting. Vendor routes strip this before persist.
    audienceUserIds: z.array(z.string().uuid()).max(200).optional(),
    stacksWithVendorPromo: z.boolean().optional(),
    stacksWithCashback: z.boolean().optional(),
    stacksWithWallet: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(valueTypePair, { message: 'Percentage discount cannot exceed 100', path: ['discountValue'] })
  .refine(dateWindow, { message: 'End date must be after start date', path: ['endDate'] });

// Code is immutable after creation — redemption history references it.
export const updateCouponSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional().nullable(),
    discountType: discountTypeSchema.optional(),
    discountValue: z.number().positive().optional(),
    maxDiscount: z.number().positive().optional().nullable(),
    minOrderValue: z.number().min(0).optional().nullable(),
    startDate: isoDate.optional().nullable(),
    endDate: isoDate.optional().nullable(),
    usageLimit: z.number().int().min(1).optional().nullable(),
    perUserLimit: z.number().int().min(1).optional().nullable(),
    categoryIds: z.array(z.string().uuid()).max(100).optional(),
    productIds: z.array(z.string().uuid()).max(500).optional(),
    brandNames: z.array(z.string().min(1).max(150)).max(100).optional(),
    audienceUserIds: z.array(z.string().uuid()).max(200).optional(),
    stacksWithVendorPromo: z.boolean().optional(),
    stacksWithCashback: z.boolean().optional(),
    stacksWithWallet: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(dateWindow, { message: 'End date must be after start date', path: ['endDate'] });

export const validateCouponSchema = z.object({
  code: couponCodeSchema,
});

// ─── Cashback campaigns ──────────────────────────────────────────────────

export const createCashbackCampaignSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional().nullable(),
    cashbackType: discountTypeSchema,
    cashbackValue: z.number().positive(),
    maxCashback: z.number().positive().optional().nullable(),
    minOrderValue: z.number().min(0).optional().nullable(),
    // Campaigns always credit Rewards Wallet. `upi` remains valid on CashbackEntry
    // for payout invites + leftover historical campaigns; new/updated campaigns
    // cannot choose it. Extra `destination` on the body is coerced to wallet.
    destination: destinationSchema.optional().transform(() => 'wallet' as const),
    startDate: isoDate.optional().nullable(),
    endDate: isoDate.optional().nullable(),
    perUserLimit: z.number().int().min(1).optional().nullable(),
    totalBudget: z.number().positive().optional().nullable(),
    stacksWithCoupon: z.boolean().optional(),
    stacksWithWallet: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => d.cashbackType !== 'percentage' || d.cashbackValue <= 100, {
    message: 'Percentage cashback cannot exceed 100',
    path: ['cashbackValue'],
  })
  .refine(dateWindow, { message: 'End date must be after start date', path: ['endDate'] });

export const updateCashbackCampaignSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional().nullable(),
    cashbackType: discountTypeSchema.optional(),
    cashbackValue: z.number().positive().optional(),
    maxCashback: z.number().positive().optional().nullable(),
    minOrderValue: z.number().min(0).optional().nullable(),
    // Campaigns always credit Rewards Wallet. `upi` remains valid on CashbackEntry
    // for payout invites + leftover historical campaigns; new/updated campaigns
    // cannot choose it. Extra `destination` on the body is coerced to wallet.
    destination: destinationSchema.optional().transform(() => 'wallet' as const),
    startDate: isoDate.optional().nullable(),
    endDate: isoDate.optional().nullable(),
    perUserLimit: z.number().int().min(1).optional().nullable(),
    totalBudget: z.number().positive().optional().nullable(),
    stacksWithCoupon: z.boolean().optional(),
    stacksWithWallet: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(dateWindow, { message: 'End date must be after start date', path: ['endDate'] });

// ─── Cashback entries (payout queue / claims / grants) ───────────────────

// Standard UPI VPA shape: handle@psp
export const claimUpiSchema = z.object({
  upiId: z
    .string()
    .min(5)
    .max(100)
    .regex(/^[\w.\-]{2,}@[A-Za-z]{2,}$/, 'Enter a valid UPI ID, e.g. name@upi'),
});

export const markEntryPaidSchema = z.object({
  paidReference: z.string().min(1).max(100),
});

export const directGrantSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000),
  destination: destinationSchema,
  notes: z.string().max(500).optional().nullable(),
});

export const listEntriesQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'credited', 'paid', 'cancelled']).optional(),
  destination: destinationSchema.optional(),
  userId: z.string().uuid().optional(),
  search: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});

// ─── Phase C programs ────────────────────────────────────────────────────

export const programRewardTypeSchema = z.enum([
  'wallet_credit',
  'coupon_flat',
  'coupon_percentage',
  'cashback',
  'free_delivery',
]);

const firstOrderRewardTypeSchema = z.enum([
  'wallet_credit',
  'coupon_flat',
  'coupon_percentage',
  'cashback',
]);

const referralSideRewardTypeSchema = z.enum([
  'wallet_credit',
  'coupon_flat',
  'coupon_percentage',
  'cashback',
]);

const programValuePair = (d: { rewardType: string; rewardValue: number }) =>
  d.rewardType !== 'coupon_percentage' || d.rewardValue <= 100;

export const upsertWelcomeOfferSchema = z
  .object({
    isActive: z.boolean(),
    rewardType: programRewardTypeSchema,
    rewardValue: z.number().positive(),
    minOrderValue: z.number().min(0).optional().nullable(),
    validDays: z.number().int().min(1).max(3650).optional().nullable(),
    maxDiscount: z.number().positive().optional().nullable(),
  })
  .refine(programValuePair, { message: 'Percentage value cannot exceed 100', path: ['rewardValue'] });

export const upsertFirstOrderOfferSchema = z
  .object({
    isActive: z.boolean(),
    rewardType: firstOrderRewardTypeSchema,
    rewardValue: z.number().positive(),
    minOrderValue: z.number().min(0).optional().nullable(),
    validDays: z.number().int().min(1).max(3650).optional().nullable(),
    maxDiscount: z.number().positive().optional().nullable(),
  })
  .refine(programValuePair, { message: 'Percentage value cannot exceed 100', path: ['rewardValue'] });

export const upsertReferralProgramSchema = z
  .object({
    isActive: z.boolean(),
    trigger: z.enum(['signup', 'first_order', 'first_order_mov']),
    minOrderValue: z.number().min(0).optional().nullable(),
    referrerRewardType: referralSideRewardTypeSchema,
    referrerRewardValue: z.number().positive(),
    referrerMaxDiscount: z.number().positive().optional().nullable(),
    referrerValidDays: z.number().int().min(1).max(3650).optional().nullable(),
    referredRewardType: referralSideRewardTypeSchema,
    referredRewardValue: z.number().positive(),
    referredMaxDiscount: z.number().positive().optional().nullable(),
    referredValidDays: z.number().int().min(1).max(3650).optional().nullable(),
  })
  .refine(
    (d) => d.referrerRewardType !== 'coupon_percentage' || d.referrerRewardValue <= 100,
    { message: 'Percentage value cannot exceed 100', path: ['referrerRewardValue'] },
  )
  .refine(
    (d) => d.referredRewardType !== 'coupon_percentage' || d.referredRewardValue <= 100,
    { message: 'Percentage value cannot exceed 100', path: ['referredRewardValue'] },
  )
  .refine((d) => d.trigger !== 'first_order_mov' || (d.minOrderValue != null && d.minOrderValue > 0), {
    message: 'MOV is required when the trigger is first order above MOV',
    path: ['minOrderValue'],
  });

export const createPayoutInviteSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  notes: z.string().max(500).optional().nullable(),
  referenceNumber: z.string().trim().max(80).optional().nullable(),
});

export const listPayoutInvitesQuerySchema = z.object({
  status: z.enum(['awaiting_claim', 'approved', 'paid', 'cancelled']).optional(),
  search: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const claimPayoutInviteSchema = z.object({
  name: z.string().trim().min(1).max(255),
  businessName: z.string().trim().min(1).max(255),
  upiId: z
    .string()
    .min(5)
    .max(100)
    .regex(/^[\w.\-]{2,}@[A-Za-z]{2,}$/, 'Enter a valid UPI ID, e.g. name@upi'),
});

export const programTokenSchema = z
  .string()
  .min(16)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid token');

