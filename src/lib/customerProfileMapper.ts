/**
 * Maps CustomerProfileInput → Prisma / API payloads.
 * Used by register, admin create, and add-business flows.
 */

import type { Prisma } from '@prisma/client';
import {
  type CustomerProfileInput,
  derivedDisplayName,
  derivedFullName,
  derivedLegalName,
  primaryPhoneDigits,
  resolvedAddressLine,
} from '@/lib/validators/customer-profile';
import { defaultOutletName, PLACEHOLDER_OUTLET_ADDRESS } from '@/lib/constants/customerProfile';

function str(v: string | undefined | null): string | null {
  const t = (v ?? '').trim();
  return t || null;
}

function splitFullName(fullName: string): { firstName: string | null; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] || null, lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Resolve first/last from profile (supports legacy fullName-only register). */
export function resolveContactNames(p: CustomerProfileInput): {
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  designation: string | null;
} {
  let firstName = str(p.firstName);
  let lastName = str(p.lastName);
  if (!firstName && !lastName && p.fullName) {
    const split = splitFullName(p.fullName);
    firstName = split.firstName;
    lastName = split.lastName;
  }
  return {
    salutation: str(p.salutation),
    firstName,
    lastName,
    designation: str(p.designation),
  };
}

export function mapToUserFields(p: CustomerProfileInput): {
  fullName: string;
  phone: string;
  email: string | null;
  businessName: string | null;
  gstNumber: string | null;
  pincode: string | null;
  password?: string;
} {
  const legalName = derivedLegalName(p);
  const fullName = derivedFullName(p);
  return {
    fullName: fullName || legalName,
    phone: primaryPhoneDigits(p),
    email: str(p.email),
    businessName: legalName || null,
    gstNumber: str(p.gstin)?.toUpperCase() ?? null,
    pincode: str(p.pincode || p.billingPincode),
    ...(p.password?.trim() ? { password: p.password.trim() } : {}),
  };
}

export function mapToBusinessAccount(
  p: CustomerProfileInput,
  opts?: { kindDefaultBusinessType?: string },
): Prisma.BusinessAccountCreateInput | Prisma.BusinessAccountUpdateInput {
  const legalName = derivedLegalName(p) || 'My Business';
  const displayName = derivedDisplayName(p);
  const contact = resolveContactNames(p);
  const addressLine = resolvedAddressLine(p);
  const city = str(p.city || p.billingCity);
  const state = str(p.state || p.billingState);
  const pincode = str(p.pincode || p.billingPincode);
  const phone = primaryPhoneDigits(p);

  const data: Record<string, unknown> = {
    legalName,
    displayName: displayName || null,
    companyName: legalName,
    gstin: str(p.gstin)?.toUpperCase() ?? null,
    pan: str(p.pan)?.toUpperCase() ?? null,
    fssaiNumber: str(p.fssaiNumber),
    businessType: str(p.businessType) || opts?.kindDefaultBusinessType || null,
    subType: str(p.subType),
    cuisine: str(p.cuisine),
    salutation: contact.salutation,
    firstName: contact.firstName,
    lastName: contact.lastName,
    designation: contact.designation,
    billingAddressLine: addressLine,
    billingCity: city,
    billingState: state,
    billingPincode: pincode,
    mobilePhone: phone || str(p.mobilePhone),
    workPhone: str(p.workPhone) || phone || null,
    customerType: p.customerType ?? 'business',
    customerLanguage: p.customerLanguage ?? 'en',
    taxPreference: p.taxPreference ?? 'taxable',
    gstTreatment: str(p.gstTreatment),
    placeOfSupply: str(p.placeOfSupply),
    currency: str(p.currency) ?? 'INR',
    paymentTerms: str(p.paymentTerms),
    businessSize: str(p.businessSize),
    businessStructure: str(p.businessStructure),
    serviceModel: str(p.serviceModel),
    monthlyPurchaseBand: str(p.monthlyPurchaseBand),
    procurementFrequency: str(p.procurementFrequency),
    leadStatus: str(p.leadStatus),
    creditType: str(p.creditType),
    remarks: str(p.remarks),
  };

  if (typeof p.enablePortal === 'boolean') data.enablePortal = p.enablePortal;
  if (p.creditLimit !== undefined && p.creditLimit !== '' && p.creditLimit !== null) {
    data.creditLimit = Number(p.creditLimit);
  }
  if (Array.isArray(p.manualTags)) data.manualTags = p.manualTags;

  return data as Prisma.BusinessAccountUpdateInput;
}

export function mapToPrimaryOutlet(p: CustomerProfileInput): {
  name: string;
  addressLine: string;
  flatInfo: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  requiresAddressUpdate: boolean;
} {
  const legalName = derivedLegalName(p);
  const displayName = derivedDisplayName(p);
  const addressLine = resolvedAddressLine(p);
  const hasCoords = p.latitude != null && p.longitude != null;

  return {
    name: str(p.outletName) || defaultOutletName(displayName, legalName),
    addressLine: addressLine || PLACEHOLDER_OUTLET_ADDRESS,
    flatInfo: str(p.flatInfo),
    landmark: str(p.landmark),
    city: str(p.city || p.billingCity),
    state: str(p.state || p.billingState),
    pincode: str(p.pincode || p.billingPincode),
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    placeId: str(p.placeId),
    requiresAddressUpdate: !addressLine || !hasCoords,
  };
}

/** Apply companyProfile payload (admin API) to BusinessAccount update input. */
export function companyProfileToBusinessAccountUpdate(
  cp: Record<string, unknown>,
): Prisma.BusinessAccountUpdateInput {
  const p = cp as CustomerProfileInput;
  const data = mapToBusinessAccount(p) as Record<string, unknown>;
  // Remove create-only fields if any
  return data as Prisma.BusinessAccountUpdateInput;
}

export function contactPersonsFromCompanyProfile(
  cp: Record<string, unknown>,
  businessAccountId: string,
): Prisma.ContactPersonCreateManyInput[] {
  if (!Array.isArray(cp.contactPersons)) return [];
  return (cp.contactPersons as Record<string, unknown>[])
    .filter((c) => c && (c.firstName || c.lastName || c.email || c.workPhone || c.mobile))
    .map((c) => ({
      businessAccountId,
      salutation: (c.salutation as string) || null,
      firstName: (c.firstName as string) || null,
      lastName: (c.lastName as string) || null,
      email: (c.email as string) || null,
      workPhone: (c.workPhone as string) || null,
      mobile: (c.mobile as string) || null,
      designation: (c.designation as string) || null,
      isPrimary: !!c.isPrimary,
    }));
}

/** Build companyProfile JSON for admin API from form state. */
export function buildCompanyProfile(p: CustomerProfileInput): Record<string, unknown> {
  const legalName = derivedLegalName(p);
  const displayName = derivedDisplayName(p);
  const contact = resolveContactNames(p);
  const addressLine = resolvedAddressLine(p);

  return {
    customerType: p.customerType ?? 'business',
    salutation: contact.salutation,
    firstName: contact.firstName,
    lastName: contact.lastName,
    designation: contact.designation,
    companyName: legalName,
    legalName,
    displayName,
    email: str(p.email),
    workPhone: str(p.workPhone),
    mobilePhone: str(p.mobilePhone || p.phone),
    customerLanguage: p.customerLanguage ?? 'en',
    gstTreatment: str(p.gstTreatment),
    placeOfSupply: str(p.placeOfSupply),
    gstin: str(p.gstin)?.toUpperCase(),
    pan: str(p.pan)?.toUpperCase(),
    fssaiNumber: str(p.fssaiNumber),
    taxPreference: p.taxPreference ?? 'taxable',
    currency: p.currency ?? 'INR',
    creditLimit: p.creditLimit === '' || p.creditLimit == null ? null : p.creditLimit,
    paymentTerms: p.paymentTerms ?? 'due_on_receipt',
    enablePortal: !!p.enablePortal,
    outletName: str(p.outletName),
    addressLine,
    flatInfo: str(p.flatInfo),
    landmark: str(p.landmark),
    city: str(p.city),
    state: str(p.state),
    pincode: str(p.pincode),
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    placeId: str(p.placeId),
    billingAddressLine: str(p.billingAddressLine) || addressLine,
    billingCity: str(p.billingCity || p.city),
    billingState: str(p.billingState || p.state),
    billingPincode: str(p.billingPincode || p.pincode),
    businessType: str(p.businessType),
    subType: str(p.subType),
    cuisine: str(p.cuisine),
    businessSize: str(p.businessSize),
    businessStructure: str(p.businessStructure),
    serviceModel: str(p.serviceModel),
    monthlyPurchaseBand: str(p.monthlyPurchaseBand),
    procurementFrequency: str(p.procurementFrequency),
    leadStatus: str(p.leadStatus),
    creditType: str(p.creditType),
    manualTags: p.manualTags,
    remarks: str(p.remarks),
    contactPersons: p.contactPersons,
  };
}
