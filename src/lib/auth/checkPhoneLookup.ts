import { prisma } from '@/lib/prisma';
import { normalizePhone, phoneLookupVariants } from '@/lib/phone';

export type PhoneCheckIntent = 'vendor' | 'brand' | 'customer';

export type PhoneCheckSuggestedAction = 'proceed' | 'login_to_link' | 'login_only';

export type VendorPhoneStatus = 'none' | 'pending' | 'active';

export interface PhoneCheckResult {
  exists: boolean;
  hcidDisplay?: string;
  fullName?: string;
  userRole?: string;
  accountType?: string;
  vendorStatus?: VendorPhoneStatus;
  businessAccountCount?: number;
  suggestedAction: PhoneCheckSuggestedAction;
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
): PhoneCheckSuggestedAction {
  if (!exists) return 'proceed';
  if (userRole === 'admin') return 'login_only';
  if (intent === 'customer') return 'login_only';
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
  const user = await prisma.user.findFirst({
    where: { phone: { in: variants } },
    select: {
      id: true,
      role: true,
      fullName: true,
      hcidDisplay: true,
      vendors: { select: { isVerified: true } },
      _count: { select: { accountMemberships: true } },
    },
  });

  if (!user) {
    return { exists: false, suggestedAction: 'proceed' };
  }

  const vendorStatus = resolveVendorStatus(user.vendors);
  const userRole = user.role;
  const accountType = resolveAccountType(userRole, vendorStatus);

  return {
    exists: true,
    hcidDisplay: user.hcidDisplay ?? undefined,
    fullName: user.fullName ?? undefined,
    userRole,
    accountType,
    vendorStatus,
    businessAccountCount: user._count.accountMemberships,
    suggestedAction: resolveSuggestedAction(intent, true, userRole),
  };
}
