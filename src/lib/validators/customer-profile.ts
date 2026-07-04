/**
 * Customer profile validation — shared across register, admin create, add-business.
 */

import { z } from 'zod';
import { GST_RE, PAN_RE, PINCODE_RE } from '@/lib/validators/vendor-kyc';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ContactPersonSchema = z.object({
  salutation: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  workPhone: z.string().optional(),
  mobile: z.string().optional(),
  designation: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

export const CustomerProfileSchema = z.object({
  // Primary contact
  salutation: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  fullName: z.string().optional(),
  designation: z.string().optional(),

  // Business identity
  legalName: z.string().optional(),
  companyName: z.string().optional(),
  displayName: z.string().optional(),
  businessType: z.string().optional(),
  subType: z.string().optional(),
  cuisine: z.string().optional(),

  // Auth / contact
  phone: z.string().optional(),
  mobilePhone: z.string().optional(),
  workPhone: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),

  // Zoho / admin
  customerType: z.enum(['business', 'individual']).optional(),
  customerLanguage: z.string().optional(),
  gstTreatment: z.string().optional(),
  placeOfSupply: z.string().optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  fssaiNumber: z.string().optional(),
  taxPreference: z.enum(['taxable', 'exempt']).optional(),
  currency: z.string().optional(),
  creditLimit: z.union([z.string(), z.number(), z.null()]).optional(),
  paymentTerms: z.string().optional(),
  enablePortal: z.boolean().optional(),

  // Mastersheet ops (admin)
  businessSize: z.string().optional(),
  businessStructure: z.string().optional(),
  serviceModel: z.string().optional(),
  monthlyPurchaseBand: z.string().optional(),
  procurementFrequency: z.string().optional(),
  leadStatus: z.string().optional(),
  creditType: z.string().optional(),
  manualTags: z.array(z.string()).optional(),
  remarks: z.string().optional(),

  // Address / outlet
  billingAddressLine: z.string().optional(),
  addressLine: z.string().optional(),
  flatInfo: z.string().optional(),
  landmark: z.string().optional(),
  billingCity: z.string().optional(),
  city: z.string().optional(),
  billingState: z.string().optional(),
  state: z.string().optional(),
  billingPincode: z.string().optional(),
  pincode: z.string().optional(),
  outletName: z.string().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  placeId: z.string().nullable().optional(),

  contactPersons: z.array(ContactPersonSchema).optional(),
});

export type CustomerProfileInput = z.infer<typeof CustomerProfileSchema>;

export type ValidationContext = 'selfRegister' | 'adminCreate' | 'addBusiness';

export interface ValidationResult {
  success: boolean;
  errors: Record<string, string>;
  message?: string;
}

function trim(s: string | undefined | null): string {
  return (s ?? '').trim();
}

export function derivedFullName(p: CustomerProfileInput): string {
  const fromParts = [trim(p.firstName), trim(p.lastName)].filter(Boolean).join(' ');
  return trim(p.fullName) || fromParts || trim(p.displayName) || trim(p.legalName) || trim(p.companyName);
}

export function derivedLegalName(p: CustomerProfileInput): string {
  return trim(p.legalName) || trim(p.companyName);
}

export function derivedDisplayName(p: CustomerProfileInput): string {
  return trim(p.displayName) || derivedLegalName(p);
}

export function primaryPhoneDigits(p: CustomerProfileInput): string {
  const mobile = trim(p.mobilePhone || p.phone).replace(/\D/g, '').slice(-10);
  if (mobile.length === 10) return mobile;
  return trim(p.workPhone).replace(/\D/g, '').slice(-10);
}

export function resolvedAddressLine(p: CustomerProfileInput): string {
  const line = trim(p.addressLine) || trim(p.billingAddressLine);
  const flat = trim(p.flatInfo);
  if (line && flat) return `${flat}, ${line}`;
  return line || flat;
}

export function validateCustomerProfile(
  data: CustomerProfileInput,
  context: ValidationContext,
): ValidationResult {
  const errors: Record<string, string> = {};
  const legalName = derivedLegalName(data);
  const fullName = derivedFullName(data);
  const phone = primaryPhoneDigits(data);
  const gstin = trim(data.gstin).toUpperCase();
  const pan = trim(data.pan).toUpperCase();
  const pincode = trim(data.pincode || data.billingPincode);
  const addressLine = resolvedAddressLine(data);
  const outletName = trim(data.outletName);
  const email = trim(data.email);
  const password = trim(data.password);

  if (context === 'selfRegister' || context === 'adminCreate') {
    if (!fullName || fullName.length < 2) errors.firstName = 'Contact name is required';
    if (!legalName || legalName.length < 2) errors.legalName = 'Legal business name is required';
    if (!trim(data.businessType)) errors.businessType = 'Business type is required';

    const relaxed = isRegisterEmailOtpEnabled() && context === 'selfRegister';
    if (relaxed) {
      const hasPhone = phone.length === 10;
      const hasEmail = !!email && EMAIL_RE.test(email);
      if (!hasPhone && !hasEmail) {
        errors.phone = 'Enter a mobile number or email address';
        errors.email = 'Enter a mobile number or email address';
      } else {
        if (phone && phone.length !== 10) errors.phone = 'Enter a valid 10-digit mobile number';
        if (email && !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
        if (!hasPhone && hasEmail && (!password || password.length < 6)) {
          errors.password = 'Password is required when registering with email only';
        }
      }
    } else {
      if (!phone || phone.length !== 10) errors.phone = 'Enter a valid 10-digit mobile number';
      if (email && !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
    }

    if (!relaxed && password && password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    } else if (relaxed && password && password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
  }

  if (context === 'addBusiness') {
    if (!legalName || legalName.length < 2) errors.legalName = 'Legal business name is required';
    if (!trim(data.businessType)) errors.businessType = 'Business type is required';
    if (!outletName || outletName.length < 2) errors.outletName = 'Outlet name is required';
    if (!addressLine || addressLine.length < 5) errors.addressLine = 'Enter the full address';
    if (!pincode || !PINCODE_RE.test(pincode)) errors.pincode = 'Pincode must be 6 digits';
  }

  if (gstin && !GST_RE.test(gstin)) errors.gstin = 'Format: 22ABCDE1234F1Z5';
  if (pan && !PAN_RE.test(pan)) errors.pan = 'Format: ABCDE1234F';
  if (pincode && !PINCODE_RE.test(pincode)) errors.pincode = 'Pincode must be 6 digits';

  const keys = Object.keys(errors);
  return {
    success: keys.length === 0,
    errors,
    message: keys.length > 0 ? 'Please fix the highlighted fields before continuing.' : undefined,
  };
}

/** Field-level blur validators for inline UI feedback. */
export function validateFieldBlur(field: string, value: string): string {
  const v = value.trim();
  switch (field) {
    case 'gstin':
      return v && !GST_RE.test(v.toUpperCase()) ? 'Format: 22ABCDE1234F1Z5' : '';
    case 'pan':
      return v && !PAN_RE.test(v.toUpperCase()) ? 'Format: ABCDE1234F' : '';
    case 'pincode':
      return v && !PINCODE_RE.test(v) ? 'Pincode must be 6 digits' : '';
    default:
      return '';
  }
}
