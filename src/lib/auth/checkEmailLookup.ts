import { prisma } from '@/lib/prisma';
import {
  type PhoneCheckIntent,
  type PhoneCheckResult,
  type PhoneCheckSuggestedAction,
  resolveSuggestedAction,
  resolveAccountType,
  resolveVendorStatus,
} from '@/lib/auth/checkPhoneLookup';

export type EmailCheckIntent = PhoneCheckIntent;
export type EmailCheckResult = PhoneCheckResult;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function lookupEmailForRegistration(
  rawEmail: string,
  intent: EmailCheckIntent,
): Promise<EmailCheckResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new Error('Invalid email address');
  }

  const user = await prisma.user.findUnique({
    where: { email },
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
