// Maps validated coupon/campaign payloads to Prisma data objects — shared by
// the admin routes (platform promos) and vendor routes (store promos) so the
// two surfaces can't drift.

import type { z } from 'zod';
import type {
  createCouponSchema,
  updateCouponSchema,
  createCashbackCampaignSchema,
  updateCashbackCampaignSchema,
} from './promotion.validator';

type CreateCoupon = z.infer<typeof createCouponSchema>;
type UpdateCoupon = z.infer<typeof updateCouponSchema>;
type CreateCampaign = z.infer<typeof createCashbackCampaignSchema>;
type UpdateCampaign = z.infer<typeof updateCashbackCampaignSchema>;

export function couponCreateData(body: CreateCoupon, ownerVendorId: string | null, createdById: string) {
  return {
    code: body.code,
    name: body.name,
    description: body.description ?? null,
    vendorId: ownerVendorId,
    discountType: body.discountType,
    discountValue: body.discountValue,
    maxDiscount: body.maxDiscount ?? null,
    minOrderValue: body.minOrderValue ?? null,
    startDate: body.startDate ? new Date(body.startDate) : null,
    endDate: body.endDate ? new Date(body.endDate) : null,
    usageLimit: body.usageLimit ?? null,
    perUserLimit: body.perUserLimit ?? null,
    categoryIds: body.categoryIds ?? [],
    productIds: body.productIds ?? [],
    brandNames: body.brandNames ?? [],
    audienceUserIds: body.audienceUserIds ?? [],
    stacksWithVendorPromo: body.stacksWithVendorPromo ?? true,
    stacksWithCashback: body.stacksWithCashback ?? true,
    stacksWithWallet: body.stacksWithWallet ?? true,
    isActive: body.isActive ?? true,
    createdById,
  };
}

export function couponUpdateData(body: UpdateCoupon) {
  return {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.description !== undefined && { description: body.description }),
    ...(body.discountType !== undefined && { discountType: body.discountType }),
    ...(body.discountValue !== undefined && { discountValue: body.discountValue }),
    ...(body.maxDiscount !== undefined && { maxDiscount: body.maxDiscount }),
    ...(body.minOrderValue !== undefined && { minOrderValue: body.minOrderValue }),
    ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate) : null }),
    ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate) : null }),
    ...(body.usageLimit !== undefined && { usageLimit: body.usageLimit }),
    ...(body.perUserLimit !== undefined && { perUserLimit: body.perUserLimit }),
    ...(body.categoryIds !== undefined && { categoryIds: body.categoryIds }),
    ...(body.productIds !== undefined && { productIds: body.productIds }),
    ...(body.brandNames !== undefined && { brandNames: body.brandNames }),
    ...(body.audienceUserIds !== undefined && { audienceUserIds: body.audienceUserIds }),
    ...(body.stacksWithVendorPromo !== undefined && { stacksWithVendorPromo: body.stacksWithVendorPromo }),
    ...(body.stacksWithCashback !== undefined && { stacksWithCashback: body.stacksWithCashback }),
    ...(body.stacksWithWallet !== undefined && { stacksWithWallet: body.stacksWithWallet }),
    ...(body.isActive !== undefined && { isActive: body.isActive }),
  };
}

/** Vendor coupon routes must not persist audience targeting. */
export function omitCouponAudience<T extends { audienceUserIds?: unknown }>(body: T): Omit<T, 'audienceUserIds'> {
  const rest = { ...body };
  delete rest.audienceUserIds;
  return rest;
}

export function campaignCreateData(body: CreateCampaign, ownerVendorId: string | null, createdById: string) {
  return {
    name: body.name,
    description: body.description ?? null,
    vendorId: ownerVendorId,
    cashbackType: body.cashbackType,
    cashbackValue: body.cashbackValue,
    maxCashback: body.maxCashback ?? null,
    minOrderValue: body.minOrderValue ?? null,
    destination: 'wallet' as const,
    startDate: body.startDate ? new Date(body.startDate) : null,
    endDate: body.endDate ? new Date(body.endDate) : null,
    perUserLimit: body.perUserLimit ?? null,
    totalBudget: body.totalBudget ?? null,
    stacksWithCoupon: body.stacksWithCoupon ?? true,
    stacksWithWallet: body.stacksWithWallet ?? true,
    isActive: body.isActive ?? true,
    createdById,
  };
}

export function campaignUpdateData(body: UpdateCampaign) {
  return {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.description !== undefined && { description: body.description }),
    ...(body.cashbackType !== undefined && { cashbackType: body.cashbackType }),
    ...(body.cashbackValue !== undefined && { cashbackValue: body.cashbackValue }),
    ...(body.maxCashback !== undefined && { maxCashback: body.maxCashback }),
    ...(body.minOrderValue !== undefined && { minOrderValue: body.minOrderValue }),
    destination: 'wallet' as const,
    ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate) : null }),
    ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate) : null }),
    ...(body.perUserLimit !== undefined && { perUserLimit: body.perUserLimit }),
    ...(body.totalBudget !== undefined && { totalBudget: body.totalBudget }),
    ...(body.stacksWithCoupon !== undefined && { stacksWithCoupon: body.stacksWithCoupon }),
    ...(body.stacksWithWallet !== undefined && { stacksWithWallet: body.stacksWithWallet }),
    ...(body.isActive !== undefined && { isActive: body.isActive }),
  };
}
