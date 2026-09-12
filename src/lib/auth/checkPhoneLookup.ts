import { prisma } from '@/lib/prisma';
import { normalizePhone, phoneLookupVariants } from '@/lib/phone';
import type { Prisma } from '@prisma/client';

export type PhoneCheckIntent = 'vendor' | 'brand' | 'customer';

export type PhoneCheckSuggestedAction = 'proceed' | 'login_to_link' | 'login_only';

export type VendorPhoneStatus = 'none' | 'pending' | 'active';

export type ExistingBusinessKinds = {
  hasVendor: boolean;
  hasBrand: boolean;
  hasCustomer: boolean;
};

export interface PhoneCheckResult {
  exists: boolean;
  hcidDisplay?: string;
  fullName?: string;
  userRole?: string;
  accountType?: string;
  vendorStatus?: VendorPhoneStatus;
  businessAccountCount?: number;
  hasVendor?: boolean;
  hasBrand?: boolean;
  hasCustomer?: boolean;
  suggestedAction: PhoneCheckSuggestedAction;
}

export const USER_REG_SELECT = {
  id: true,
  role: true,
  fullName: true,
  hcidDisplay: true,
  vendors: { select: { isVerified: true } },
  accountMemberships: {
    select: {
      businessAccount: {
        select: { isCustomer: true, isVendor: true, isBrand: true },
      },
    },
  },
  _count: { select: { accountMemberships: true } },
} as const;

export function existingKindsFromUser(user: {
  role: string;
  vendors: Array<{ isVerified: boolean }>;
  accountMemberships?: Array<{
    businessAccount: { isCustomer: boolean; isVendor: boolean; isBrand: boolean };
  }>;
}): ExistingBusinessKinds {
  const memberships = user.accountMemberships ?? [];
  return {
    hasVendor: memberships.some((m) => m.businessAccount.isVendor) || user.vendors.length > 0,
    hasBrand: memberships.some((m) => m.businessAccount.isBrand) || user.role === 'brand',
    hasCustomer: memberships.some(
      (m) => m.businessAccount.isCustomer && !m.businessAccount.isVendor && !m.businessAccount.isBrand,
    ),
  };
}

export function resolveVendorStatus(
  vendors: Array<{ isVerified: boolean }>,
): VendorPhoneStatus {
  if (vendors.some(v => v.isVerified)) return 'active';
  if (vendors.length > 0) return 'pending';
  return 'none';
}

export function resolveAccountType(
  userRole: string,
  vendorStatus: VendorPhoneStatus,
): string {
  if (vendorStatus === 'active') return 'vendor';
  if (vendorStatus === 'pending') return 'vendor_pending';
  return userRole;
}

export function resolveSuggestedAction(
  intent: PhoneCheckIntent,
  exists: boolean,
  userRole: string,
  kinds?: ExistingBusinessKinds,
): PhoneCheckSuggestedAction {
  if (!exists) return 'proceed';
  if (userRole === 'admin') return 'login_only';
  if (intent === 'vendor' && kinds?.hasVendor) return 'login_only';
  if (intent === 'brand' && kinds?.hasBrand) return 'login_only';
  if (intent === 'customer' && kinds?.hasCustomer) return 'login_only';
  return 'login_to_link';
}

export async function lookupPhoneForRegistration(
  rawPhone: string,
  intent: PhoneCheckIntent,
): Promise<PhoneCheckResult> {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    throw new Error('Invalid phone number');
  }

  const variants = phoneLookupVariants(phone);
  const user = await prisma.user.findUnique({
    where: { phone },
    select: USER_REG_SELECT,
  }) ?? await prisma.user.findFirst({
    where: { phone: { in: variants } },
    orderBy: { createdAt: 'asc' },
    select: USER_REG_SELECT,
  });

  if (!user) {
    return { exists: false, suggestedAction: 'proceed' };
  }

  const vendorStatus = resolveVendorStatus(user.vendors);
  const userRole = user.role;
  const accountType = resolveAccountType(userRole, vendorStatus);
  const kinds = existingKindsFromUser(user);

  return {
    exists: true,
    hcidDisplay: user.hcidDisplay ?? undefined,
    fullName: user.fullName ?? undefined,
    userRole,
    accountType,
    vendorStatus,
    businessAccountCount: user._count.accountMemberships,
    ...kinds,
    suggestedAction: resolveSuggestedAction(intent, true, userRole, kinds),
  };
}

/** Prefer canonical 10-digit `User.phone`, then oldest legacy +91 / 91 row. */
export async function findUserByPhoneLookup<S extends Prisma.UserSelect>(
  raw: string | null | undefined,
  select: S,
): Promise<Prisma.UserGetPayload<{ select: S }> | null> {
  const phone = normalizePhone(raw);
  if (!phone) return null;
  const exact = await prisma.user.findUnique({ where: { phone }, select });
  if (exact) return exact;
  return prisma.user.findFirst({
    where: { phone: { in: phoneLookupVariants(phone) } },
    orderBy: { createdAt: 'asc' },
    select,
  });
}
