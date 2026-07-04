/**
 * TEMP: phone OR email allowed for self-register across customer, brand, vendor.
 * Set REGISTER_EMAIL_OTP=false to restore mobile-only production behavior.
 */
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
