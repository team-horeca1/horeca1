/**
 * TEMP: phone OR email allowed for self-register across customer, brand, vendor.
 * Set REGISTER_EMAIL_OTP=false to restore mobile-only production behavior.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isRegisterEmailOtpEnabled(): boolean {
  if (
    process.env.REGISTER_EMAIL_OTP === 'false' ||
    process.env.NEXT_PUBLIC_REGISTER_EMAIL_OTP === 'false'
  ) {
    return false;
  }
  return true;
}

/** @deprecated Use isRegisterEmailOtpEnabled — kept for existing call sites */
export const isVendorEmailRegisterAllowed = isRegisterEmailOtpEnabled;

export type RegisterVerifyChannel = 'phone' | 'email';

/**
 * Pick OTP channel from filled contact fields.
 * - phone only / email only → that channel
 * - both valid → respect `preferred` toggle
 * - neither → null (caller shows an error)
 * When email OTP is disabled, only a full phone resolves to 'phone'.
 */
export function resolveRegisterVerifyChannel(opts: {
  email?: string | null;
  phone?: string | null;
  preferred?: RegisterVerifyChannel;
}): RegisterVerifyChannel | null {
  const digits = (opts.phone ?? '').replace(/\D/g, '').slice(-10);
  const hasPhone = digits.length === 10;

  if (!isRegisterEmailOtpEnabled()) {
    return hasPhone ? 'phone' : null;
  }

  const email = (opts.email ?? '').trim().toLowerCase();
  const hasEmail = !!email && EMAIL_RE.test(email);

  if (hasPhone && !hasEmail) return 'phone';
  if (hasEmail && !hasPhone) return 'email';
  if (hasPhone && hasEmail) {
    return opts.preferred === 'email' ? 'email' : 'phone';
  }
  return null;
}
