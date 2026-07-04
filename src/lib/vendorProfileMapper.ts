/**
 * Maps VendorProfileInput → Prisma / API payloads.
 */

import type { Prisma } from '@prisma/client';
import {
  type VendorProfileInput,
  derivedAuthorizedPersonName,
  derivedFullName,
  derivedLegalName,
  derivedTradeName,
  primaryPhoneDigits,
  resolveVendorTypeSlug,
  getEffectiveVendorTypeSelections,
} from '@/lib/validators/vendor-profile';
import {
  legacyScalarsFromSelections,
  type VendorTypeSelection,
} from '@/lib/constants/vendorProfile';

function str(v: string | undefined | null): string | null {
  const t = (v ?? '').trim();
  return t || null;
}

function intOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function boolOrNull(v: boolean | string | undefined): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 'yes' || v === 'true') return true;
  if (v === 'no' || v === 'false') return false;
  return null;
}

export function mapToUserFields(p: VendorProfileInput): {
  fullName: string;
  phone: string | null;
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
    phone: primaryPhoneDigits(p) || null,
    email: str(p.email),
    businessName: legalName || null,
    gstNumber: str(p.gstin || p.gstNumber)?.toUpperCase() ?? null,
    pincode: str(p.pincode || p.billingPincode),
    ...(p.password?.trim() ? { password: p.password.trim() } : {}),
  };
}

export function mapToBusinessAccount(
  p: VendorProfileInput,
): Prisma.BusinessAccountCreateInput | Prisma.BusinessAccountUpdateInput {
  const legalName = derivedLegalName(p) || 'Vendor Business';
  const displayName = derivedTradeName(p);
  const phone = primaryPhoneDigits(p);
  const selections = getEffectiveVendorTypeSelections(p);
  const legacy = legacyScalarsFromSelections(selections);

  return {
    legalName,
    displayName: displayName || null,
    companyName: legalName,
    gstin: str(p.gstin || p.gstNumber)?.toUpperCase() ?? null,
    pan: str(p.pan || p.panNumber)?.toUpperCase() ?? null,
    fssaiNumber: str(p.fssaiNumber),
    businessType: legacy?.vendorBusinessType || str(p.vendorBusinessType) || 'vendor',
    subType: legacy?.subType || str(p.subType),
    vendorTypeSelections: selections.length > 0
      ? (selections as unknown as Prisma.InputJsonValue)
      : undefined,
    salutation: str(p.salutation),
    firstName: str(p.firstName),
    lastName: str(p.lastName),
    designation: str(p.designation),
    billingAddressLine: str(p.addressLine || p.billingAddressLine),
    billingCity: str(p.city || p.billingCity),
    billingState: str(p.state || p.billingState),
    billingPincode: str(p.pincode || p.billingPincode),
    mobilePhone: phone || str(p.mobilePhone),
    workPhone: str(p.workPhone) || phone || null,
    businessSize: str(p.businessSize),
  } as Prisma.BusinessAccountUpdateInput;
}

/** Tier A profile fields for the Vendor row (excludes bank / pincodes / docs). */
export function mapToVendorProfile(
  p: VendorProfileInput,
): Prisma.VendorUpdateInput {
  const legalName = derivedLegalName(p);
  const tradeName = derivedTradeName(p);
  const vendorTypeSlug = resolveVendorTypeSlug(p);
  const selections = getEffectiveVendorTypeSelections(p);
  const legacy = legacyScalarsFromSelections(selections);

  return {
    businessName: legalName || undefined,
    tradeName: tradeName || null,
    vendorType: legacy?.vendorType || vendorTypeSlug,
    subType: legacy?.subType || str(p.subType),
    vendorTypeSelections: selections.length > 0
      ? (selections as unknown as Prisma.InputJsonValue)
      : undefined,
    categoriesHandled: Array.isArray(p.categoriesHandled) ? p.categoriesHandled : [],
    businessSize: str(p.businessSize),
    coverage: str(p.coverage),
    warehouseCount: intOrNull(p.warehouseCount),
    deliveryFleet: boolOrNull(p.deliveryFleet),
    monthlySupplyBand: str(p.monthlySupplyBand),
    gstNumber: str(p.gstin || p.gstNumber)?.toUpperCase() ?? null,
    panNumber: str(p.pan || p.panNumber)?.toUpperCase() ?? null,
    fssaiNumber: str(p.fssaiNumber),
    authorizedPersonName: derivedAuthorizedPersonName(p),
    authorizedPersonPhone: primaryPhoneDigits(p) || null,
    authorizedPersonEmail: str(p.authorizedPersonEmail || p.email),
  };
}

/** Merge profile + KYC blocks for onboarding submit / admin create. */
export function mergeVendorCreateData(
  profile: VendorProfileInput,
  kyc: Record<string, unknown>,
): Record<string, unknown> {
  const vendorProfile = mapToVendorProfile(profile);
  return {
    ...kyc,
    vendorType: vendorProfile.vendorType ?? kyc.vendorType,
    tradeName: vendorProfile.tradeName ?? kyc.tradeName,
    subType: vendorProfile.subType,
    categoriesHandled: vendorProfile.categoriesHandled,
    businessSize: vendorProfile.businessSize,
    coverage: vendorProfile.coverage,
    warehouseCount: vendorProfile.warehouseCount,
    deliveryFleet: vendorProfile.deliveryFleet,
    monthlySupplyBand: vendorProfile.monthlySupplyBand,
    authorizedPersonName: vendorProfile.authorizedPersonName ?? kyc.authorizedPersonName,
    authorizedPersonPhone: vendorProfile.authorizedPersonPhone ?? kyc.authorizedPersonPhone,
    authorizedPersonEmail: vendorProfile.authorizedPersonEmail ?? kyc.authorizedPersonEmail,
    panNumber: vendorProfile.panNumber ?? kyc.panNumber,
    fssaiNumber: vendorProfile.fssaiNumber ?? kyc.fssaiNumber,
  };
}

/** Alias for plan naming — same as mapToVendorProfile. */
export const mapToVendor = mapToVendorProfile;

export function mapToServiceAreas(
  serviceablePincodes: string[] | undefined,
  vendorId: string,
): Prisma.ServiceAreaCreateManyInput[] {
  if (!serviceablePincodes?.length) return [];
  const unique = Array.from(new Set(serviceablePincodes.map((p) => p.trim()).filter(Boolean)));
  return unique.map((pincode) => ({ vendorId, pincode }));
}

/** Build vendorProfile JSON for admin API from form state. */
export function buildVendorProfile(p: VendorProfileInput): Record<string, unknown> {
  const legalName = derivedLegalName(p);
  const tradeName = derivedTradeName(p);
  return {
    legalName,
    businessName: legalName,
    tradeName,
    displayName: tradeName,
    vendorBusinessType: str(p.vendorBusinessType),
    vendorType: resolveVendorTypeSlug(p),
    subType: str(p.subType),
    vendorTypeSelections: getEffectiveVendorTypeSelections(p) as VendorTypeSelection[],
    categoriesHandled: p.categoriesHandled ?? [],
    salutation: str(p.salutation),
    firstName: str(p.firstName),
    lastName: str(p.lastName),
    designation: str(p.designation),
    authorizedPersonName: derivedAuthorizedPersonName(p),
    authorizedPersonPhone: primaryPhoneDigits(p),
    authorizedPersonEmail: str(p.authorizedPersonEmail || p.email),
    email: str(p.email),
    mobilePhone: primaryPhoneDigits(p) || str(p.mobilePhone),
    gstin: str(p.gstin || p.gstNumber)?.toUpperCase(),
    pan: str(p.pan || p.panNumber)?.toUpperCase(),
    fssaiNumber: str(p.fssaiNumber),
    billingAddressLine: str(p.addressLine || p.billingAddressLine),
    billingCity: str(p.city || p.billingCity),
    billingState: str(p.state || p.billingState),
    billingPincode: str(p.pincode || p.billingPincode),
    pickupAddressLine: str(p.pickupAddressLine || p.pickupAddress?.addressLine),
    pickupCity: str(p.pickupCity || p.pickupAddress?.city),
    pickupState: str(p.pickupState || p.pickupAddress?.state),
    pickupPincode: str(p.pickupPincode || p.pickupAddress?.pincode),
    businessSize: str(p.businessSize),
    coverage: str(p.coverage),
    warehouseCount: intOrNull(p.warehouseCount),
    deliveryFleet: boolOrNull(p.deliveryFleet),
    monthlySupplyBand: str(p.monthlySupplyBand),
    leadStatus: str(p.leadStatus),
    manualTags: p.manualTags,
    remarks: str(p.remarks),
  };
}

export function vendorProfileToBusinessAccountUpdate(
  profile: Record<string, unknown>,
): Prisma.BusinessAccountUpdateInput {
  return mapToBusinessAccount(profile as VendorProfileInput);
}
