/**
 * Vendor profile validation — shared across register, admin create, add-business.
 * Extends vendor-kyc with Profile Mastersheet Tier A fields (CSV rows 72–83).
 */

import { z } from 'zod';
import {
  GST_RE,
  PAN_RE,
  PINCODE_RE,
  VENDOR_TYPES,
} from '@/lib/validators/vendor-kyc';
import {
  VENDOR_BUSINESS_TYPES,
  slugForVendorType,
  subTypesForVendorType,
  normalizeVendorTypeSelections,
  legacyToVendorTypeSelections,
  type VendorBusinessType,
  type VendorTypeSelection,
} from '@/lib/constants/vendorProfile';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Legacy + CSV-aligned slugs stored on Vendor.vendorType. */
export const VENDOR_TYPE_SLUGS = VENDOR_TYPES;

export const VendorAddressSchema = z.object({
  addressLine: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
});

export const VendorProfileSchema = z.object({
  // Identity — CSV-aligned type cascade
  vendorBusinessType: z.string().optional(),
  /** Legacy slug or new CSV slug — used when vendorBusinessType absent. */
  vendorType: z.string().optional(),
  subType: z.string().optional(),
  vendorTypeSelections: z.array(z.object({
    type: z.string(),
    slug: z.string(),
    subTypes: z.array(z.string()),
  })).optional(),
  categoriesHandled: z.array(z.string()).optional(),

  legalName: z.string().optional(),
  businessName: z.string().optional(),
  tradeName: z.string().optional(),
  displayName: z.string().optional(),

  // Contact
  salutation: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  fullName: z.string().optional(),
  designation: z.string().optional(),
  authorizedPersonName: z.string().optional(),
  authorizedPersonPhone: z.string().optional(),
  authorizedPersonEmail: z.string().optional(),
  phone: z.string().optional(),
  mobilePhone: z.string().optional(),
  workPhone: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),

  // Tax
  gstin: z.string().optional(),
  gstNumber: z.string().optional(),
  pan: z.string().optional(),
  panNumber: z.string().optional(),
  fssaiNumber: z.string().optional(),

  // Location (optional at profile step — wizard collects full addresses later)
  billingAddress: VendorAddressSchema.optional(),
  pickupAddress: VendorAddressSchema.optional(),
  billingAddressLine: z.string().optional(),
  pickupAddressLine: z.string().optional(),
  pickupCity: z.string().optional(),
  pickupState: z.string().optional(),
  pickupPincode: z.string().optional(),
  addressLine: z.string().optional(),
  billingCity: z.string().optional(),
  city: z.string().optional(),
  billingState: z.string().optional(),
  state: z.string().optional(),
  billingPincode: z.string().optional(),
  pincode: z.string().optional(),

  // Ops — Tier A
  businessSize: z.string().optional(),
  coverage: z.string().optional(),
  warehouseCount: z.union([z.string(), z.number(), z.null()]).optional(),
  deliveryFleet: z.union([z.boolean(), z.string()]).optional(),
  monthlySupplyBand: z.string().optional(),

  // Tier B — admin-only, optional on create
  leadStatus: z.string().optional(),
  manualTags: z.array(z.string()).optional(),
  remarks: z.string().optional(),
});

export type VendorProfileInput = z.infer<typeof VendorProfileSchema>;

export type VendorValidationContext = 'selfRegister' | 'adminCreate' | 'addBusiness';

export interface ValidationResult {
  success: boolean;
  errors: Record<string, string>;
  message?: string;
}

function trim(s: string | undefined | null): string {
  return (s ?? '').trim();
}

export function derivedLegalName(p: VendorProfileInput): string {
  return trim(p.legalName) || trim(p.businessName);
}

export function derivedTradeName(p: VendorProfileInput): string {
  return trim(p.tradeName) || trim(p.displayName) || derivedLegalName(p);
}

export function derivedFullName(p: VendorProfileInput): string {
  const fromParts = [trim(p.firstName), trim(p.lastName)].filter(Boolean).join(' ');
  return trim(p.fullName) || fromParts || trim(p.authorizedPersonName) || derivedTradeName(p);
}

export function derivedAuthorizedPersonName(p: VendorProfileInput): string {
  const fromParts = [trim(p.firstName), trim(p.lastName)].filter(Boolean).join(' ');
  return trim(p.authorizedPersonName) || fromParts || derivedFullName(p);
}

export function primaryPhoneDigits(p: VendorProfileInput): string {
  const mobile = trim(p.mobilePhone || p.phone || p.authorizedPersonPhone).replace(/\D/g, '').slice(-10);
  if (mobile.length === 10) return mobile;
  return trim(p.workPhone).replace(/\D/g, '').slice(-10);
}

/** Resolve CSV display type or legacy slug → slug stored on Vendor.vendorType. */
export function resolveVendorTypeSlug(p: VendorProfileInput): string | null {
  return normalizedVendorTypeSlug(p.vendorBusinessType || p.vendorType);
}

/** CSV display label, legacy slug, or CSV slug → slug stored on Vendor.vendorType. */
export function normalizedVendorTypeSlug(vendorType: string | undefined | null): string | null {
  const v = trim(vendorType);
  if (!v) return null;

  const byDisplay = (VENDOR_BUSINESS_TYPES as readonly string[]).find(
    (t) => t === v || t.toLowerCase() === v.toLowerCase(),
  );
  if (byDisplay) return slugForVendorType(byDisplay as VendorBusinessType) ?? null;

  if ((VENDOR_TYPE_SLUGS as readonly string[]).includes(v)) return v;

  const csvSlugMatch = (VENDOR_BUSINESS_TYPES as readonly string[]).find(
    (t) => slugForVendorType(t as VendorBusinessType) === v,
  );
  if (csvSlugMatch) return v;

  return null;
}

/** Slug or CSV label → CSV display label for dropdowns. */
export function displayVendorType(vendorType: string | undefined | null): string | null {
  const slug = normalizedVendorTypeSlug(vendorType);
  if (!slug) return trim(vendorType) || null;
  const entry = (VENDOR_BUSINESS_TYPES as readonly string[]).find(
    (t) => slugForVendorType(t as VendorBusinessType) === slug,
  );
  return entry ?? slug;
}

export function getEffectiveVendorTypeSelections(data: VendorProfileInput): VendorTypeSelection[] {
  const fromJson = normalizeVendorTypeSelections(data.vendorTypeSelections);
  if (fromJson.length > 0) return fromJson;
  return legacyToVendorTypeSelections(
    data.vendorBusinessType,
    data.vendorType,
    data.subType,
  );
}

/** Contact channel validation — phone and/or email depending on context. */
export function contactChannelErrors(
  data: VendorProfileInput,
  context: VendorValidationContext,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const authPhone = trim(data.authorizedPersonPhone || data.mobilePhone || data.phone)
    .replace(/\D/g, '').slice(-10);
  const email = trim(data.email || data.authorizedPersonEmail);
  const relaxed = isRegisterEmailOtpEnabled() && context === 'selfRegister';

  if (relaxed) {
    const hasPhone = authPhone.length === 10;
    const hasEmail = !!email && EMAIL_RE.test(email);
    if (!hasPhone && !hasEmail) {
      errors.authorizedPersonPhone = 'Enter a mobile number or email address';
      errors.email = 'Enter a mobile number or email address';
    } else {
      if (authPhone && authPhone.length !== 10) {
        errors.authorizedPersonPhone = 'Enter a valid 10-digit mobile number';
      }
      if (email && !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
    }
  } else {
    if (!authPhone || authPhone.length !== 10) {
      errors.authorizedPersonPhone = 'Enter a valid 10-digit mobile number';
    }
    if (email && !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
    if (context === 'adminCreate') {
      if (!trim(data.email) || !EMAIL_RE.test(trim(data.email))) {
        errors.email = 'Enter a valid owner email';
      }
    }
  }
  return errors;
}

function validateVendorTypeSelections(data: VendorProfileInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const selections = getEffectiveVendorTypeSelections(data);
  if (selections.length === 0) {
    errors.vendorTypeSelections = 'Select at least one vendor type and sub-type';
    return errors;
  }
  for (const row of selections) {
    if (!(VENDOR_BUSINESS_TYPES as readonly string[]).includes(row.type)) {
      errors.vendorTypeSelections = 'Select a valid vendor type';
      break;
    }
    const allowed = subTypesForVendorType(row.type);
    for (const st of row.subTypes) {
      if (allowed.length > 0 && !allowed.includes(st)) {
        errors.vendorTypeSelections = `Invalid sub-type "${st}" for ${row.type}`;
        break;
      }
    }
  }
  return errors;
}

export function validateVendorProfile(
  data: VendorProfileInput,
  context: VendorValidationContext,
  step?: 'identity' | 'contact' | 'full',
): ValidationResult {
  const errors: Record<string, string> = {};
  const legalName = derivedLegalName(data);
  const tradeName = derivedTradeName(data);
  const authName = derivedAuthorizedPersonName(data);
  const gstin = trim(data.gstin || data.gstNumber).toUpperCase();
  const pan = trim(data.pan || data.panNumber).toUpperCase();
  const password = trim(data.password);
  const selections = getEffectiveVendorTypeSelections(data);
  const vendorSlug = selections[0]?.slug ?? resolveVendorTypeSlug(data);

  const checkIdentity = step === 'identity' || step === 'full' || !step;
  const checkContact = step === 'contact' || step === 'full' || !step;

  if (checkIdentity) {
    Object.assign(errors, validateVendorTypeSelections(data));
    if (context !== 'addBusiness') {
      if (!legalName || legalName.length < 2) errors.legalName = 'Legal business name is required';
      if (!tradeName || tradeName.length < 2) errors.tradeName = 'Trade / display name is required';
    }
  }

  if (checkContact) {
    if (context === 'selfRegister' || context === 'adminCreate') {
      const ownerName = derivedFullName(data);
      if (!ownerName || ownerName.length < 2) errors.firstName = 'Contact name is required';
      if (!authName || authName.length < 2) errors.authorizedPersonName = 'Authorized person name is required';
      Object.assign(errors, contactChannelErrors(data, context));
      if (context === 'selfRegister' && (step === 'contact' || step === 'full' || !step)) {
        if (!password) errors.password = 'Password is required';
        else if (password.length < 6) errors.password = 'Password must be at least 6 characters';
      } else if (password && password.length < 6) {
        errors.password = 'Password must be at least 6 characters';
      }
    }
  }

  if (context === 'addBusiness' && !step) {
    if (!legalName || legalName.length < 2) errors.legalName = 'Legal business name is required';
    if (!vendorSlug && selections.length === 0) errors.vendorBusinessType = 'Vendor type is required';
  }

  if (gstin && !GST_RE.test(gstin)) errors.gstin = 'Format: 22ABCDE1234F1Z5';
  if (pan && !PAN_RE.test(pan)) errors.pan = 'Format: ABCDE1234F';
  const pincode = trim(data.pincode || data.billingPincode);
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
    case 'gstin':
    case 'gstNumber':
      return v && !GST_RE.test(v.toUpperCase()) ? 'Format: 22ABCDE1234F1Z5' : '';
    case 'pan':
    case 'panNumber':
      return v && !PAN_RE.test(v.toUpperCase()) ? 'Format: ABCDE1234F' : '';
    case 'pincode':
      return v && !PINCODE_RE.test(v) ? 'Pincode must be 6 digits' : '';
    default:
      return '';
  }
}
