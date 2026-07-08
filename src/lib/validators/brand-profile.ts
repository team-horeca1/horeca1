/**
 * Brand profile validation — shared across public register, admin create, add-business.
 */

import { z } from 'zod';
import { GST_RE, PINCODE_RE } from '@/lib/validators/vendor-kyc';
import { BRAND_TYPES, subTypesForBrandType } from '@/lib/constants/brandProfile';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const BrandProfileSchema = z.object({
  // Identity
  legalName: z.string().optional(),
  companyName: z.string().optional(),
  displayName: z.string().optional(),
  name: z.string().optional(),
  brandType: z.string().optional(),
  subType: z.string().optional(),
  productCategories: z.array(z.string()).optional(),

  // Market
  businessSize: z.string().optional(),
  distributionPresence: z.string().optional(),
  targetSegments: z.array(z.string()).optional(),
  horecaFocused: z.union([z.boolean(), z.string()]).optional(),
  retailFocused: z.union([z.boolean(), z.string()]).optional(),

  // Contact
  salutation: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  fullName: z.string().optional(),
  designation: z.string().optional(),
  phone: z.string().optional(),
  mobilePhone: z.string().optional(),
  workPhone: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),

  // Tax / location
  gstin: z.string().optional(),
  billingAddressLine: z.string().optional(),
  addressLine: z.string().optional(),
  city: z.string().optional(),
  billingCity: z.string().optional(),
  state: z.string().optional(),
  billingState: z.string().optional(),
  pincode: z.string().optional(),
  billingPincode: z.string().optional(),
  outletName: z.string().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  placeId: z.string().nullable().optional(),

  // Marketing
  website: z.string().optional(),
  tagline: z.string().optional(),
  description: z.string().optional(),
  logoUrl: z.string().optional(),

  // Tier B — admin-only, optional on create
  brandTier: z.string().optional(),
  marketplaceVisibility: z.string().optional(),
  creditSupport: z.union([z.boolean(), z.string()]).optional(),
  leadStatus: z.string().optional(),
  manualTags: z.array(z.string()).optional(),
  remarks: z.string().optional(),
});

export type BrandProfileInput = z.infer<typeof BrandProfileSchema>;

export type BrandValidationContext = 'publicRegister' | 'adminCreate' | 'addBusiness';

export interface ValidationResult {
  success: boolean;
  errors: Record<string, string>;
  message?: string;
}

function trim(s: string | undefined | null): string {
  return (s ?? '').trim();
}

export function derivedLegalName(p: BrandProfileInput): string {
  return trim(p.legalName) || trim(p.companyName) || trim(p.name);
}

/** Trimmed display name only — no fallback (use for validation). */
export function rawDisplayName(p: BrandProfileInput): string {
  return trim(p.displayName) || trim(p.name);
}

export function derivedDisplayName(p: BrandProfileInput): string {
  return rawDisplayName(p) || derivedLegalName(p);
}

export function derivedBrandName(p: BrandProfileInput): string {
  return derivedDisplayName(p) || derivedLegalName(p);
}

export function derivedFullName(p: BrandProfileInput): string {
  const fromParts = [trim(p.firstName), trim(p.lastName)].filter(Boolean).join(' ');
  return trim(p.fullName) || fromParts || derivedDisplayName(p);
}

/** Alias used by BrandFormModal and legacy callers. */
export function derivedContactName(p: BrandProfileInput): string {
  return derivedFullName(p);
}

export function primaryPhoneDigits(p: BrandProfileInput): string {
  const mobile = trim(p.mobilePhone || p.phone).replace(/\D/g, '').slice(-10);
  if (mobile.length === 10) return mobile;
  return trim(p.workPhone).replace(/\D/g, '').slice(-10);
}

function parseBool(v: boolean | string | undefined): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 'yes' || v === 'true') return true;
  if (v === 'no' || v === 'false') return false;
  return null;
}

export function validateBrandProfile(
  data: BrandProfileInput,
  context: BrandValidationContext,
): ValidationResult {
  const errors: Record<string, string> = {};
  const phone = primaryPhoneDigits(data);
  const gstin = trim(data.gstin).toUpperCase();
  const email = trim(data.email);
  const password = trim(data.password);
  const pincode = trim(data.pincode || data.billingPincode);
  const addressLine = trim(data.addressLine || data.billingAddressLine);
  const outletName = trim(data.outletName);

  if (context === 'publicRegister' || context === 'adminCreate') {
    const rawLegal = trim(data.legalName);
    const rawDisplay = rawDisplayName(data);
    const rawFirst = trim(data.firstName);
    if (!rawLegal || rawLegal.length < 2) errors.legalName = 'Legal brand name is required';
    if (!rawDisplay || rawDisplay.length < 2) errors.displayName = 'Display name is required';
    if (!rawFirst || rawFirst.length < 2) errors.firstName = 'First name is required';
    if (!trim(data.brandType)) errors.brandType = 'Brand type is required';
    else if (!(BRAND_TYPES as readonly string[]).includes(trim(data.brandType))) {
      errors.brandType = 'Select a valid brand type';
    }
    const brandType = trim(data.brandType);
    const subType = trim(data.subType);
    if (brandType && subType) {
      const allowed = subTypesForBrandType(brandType);
      if (allowed.length > 0 && !allowed.includes(subType)) {
        errors.subType = 'Select a valid sub-type for this brand type';
      }
    } else if (brandType && subTypesForBrandType(brandType).length > 0) {
      errors.subType = 'Sub-type is required';
    }
    const relaxedContact = isRegisterEmailOtpEnabled() && context === 'publicRegister';
    if (relaxedContact) {
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
    if (context === 'adminCreate') {
      if (!email || !EMAIL_RE.test(email)) errors.email = 'Owner email is required';
      if (!password || password.length < 6) errors.password = 'Password must be at least 6 characters';
    } else if (password && password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
  }

  if (context === 'addBusiness') {
    const rawLegal = trim(data.legalName);
    if (!rawLegal || rawLegal.length < 2) errors.legalName = 'Legal brand name is required';
    if (!trim(data.brandType)) errors.brandType = 'Brand type is required';
    if (!outletName || outletName.length < 2) errors.outletName = 'Outlet name is required';
    if (!addressLine || addressLine.length < 5) errors.addressLine = 'Enter the full address';
    if (!pincode || !PINCODE_RE.test(pincode)) errors.pincode = 'Pincode must be 6 digits';
  }

  if (gstin && !GST_RE.test(gstin)) errors.gstin = 'Format: 22ABCDE1234F1Z5';
  if (pincode && !PINCODE_RE.test(pincode)) errors.pincode = 'Pincode must be 6 digits';

  const keys = Object.keys(errors);
  return {
    success: keys.length === 0,
    errors,
    message: keys.length > 0 ? 'Please fix the highlighted fields before continuing.' : undefined,
  };
}

export function validateFieldBlur(field: string, value: string): string {
  const v = value.trim();
  switch (field) {
    case 'legalName':
      return v.length > 0 && v.length < 2 ? 'Legal brand name is required' : v.length === 0 ? 'Legal brand name is required' : '';
    case 'displayName':
    case 'name':
      return v.length > 0 && v.length < 2 ? 'Display name is required' : v.length === 0 ? 'Display name is required' : '';
    case 'firstName':
      return v.length > 0 && v.length < 2 ? 'First name is required' : v.length === 0 ? 'First name is required' : '';
    case 'brandType':
      return v.length === 0 ? 'Brand type is required' : '';
    case 'subType':
      return v.length === 0 ? 'Sub-type is required' : '';
    case 'phone':
      return v.length > 0 && v.replace(/\D/g, '').slice(-10).length !== 10
        ? 'Enter a valid 10-digit mobile number'
        : v.length === 0 ? 'Enter a valid 10-digit mobile number' : '';
    case 'email':
      return v.length > 0 && !EMAIL_RE.test(v) ? 'Enter a valid email address' : '';
    case 'password':
      return v.length > 0 && v.length < 6 ? 'Password must be at least 6 characters' : '';
    case 'gstin':
      return v && !GST_RE.test(v.toUpperCase()) ? 'Format: 22ABCDE1234F1Z5' : '';
    case 'pincode':
      return v && !PINCODE_RE.test(v) ? 'Pincode must be 6 digits' : '';
    default:
      return '';
  }
}

export { parseBool };
