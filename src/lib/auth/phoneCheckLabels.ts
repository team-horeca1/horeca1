import type {
  PhoneCheckIntent,
  PhoneCheckResult,
  PhoneCheckSuggestedAction,
} from '@/lib/auth/checkPhoneLookup';

/** Where login should go after the existing-phone modal. */
export function existingPhoneRedirect(
  intent: PhoneCheckIntent,
  action: PhoneCheckSuggestedAction,
): string {
  if (action === 'login_only') {
    if (intent === 'vendor') return '/businesses?type=supplier';
    if (intent === 'brand') return '/brand/portal';
    return '/businesses';
  }
  if (intent === 'vendor') return '/vendor/register';
  if (intent === 'brand') return '/brand/register';
  return '/businesses?add=buyer';
}

export function accountLabelFromCheck(
  data: Pick<PhoneCheckResult, 'accountType' | 'userRole' | 'vendorStatus' | 'hasVendor' | 'hasBrand' | 'hasCustomer'>,
): string {
  const parts: string[] = [];
  if (data.hasVendor || data.accountType === 'vendor' || data.accountType === 'vendor_pending') {
    parts.push(data.accountType === 'vendor_pending' ? 'Supplier (pending review)' : 'Supplier');
  }
  if (data.hasBrand || data.userRole === 'brand') parts.push('Brand');
  if (data.hasCustomer) parts.push('Restaurant / Retail');
  if (parts.length > 0) return [...new Set(parts)].join(' + ');
  if (data.userRole === 'admin') return 'Admin';
  return 'Restaurant / Retail';
}
