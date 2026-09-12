/**
 * Canonical create-business path: one User → one new BusinessAccount of a
 * single capability (buyer / supplier / brand) + primary Outlet + owner roles
 * + Vendor or Brand extension when needed.
 *
 * Never upgrades an existing BusinessAccount in place (that would mix buy + sell).
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import {
  flagsForKind,
  nextPathForKind,
  type BusinessKind,
} from '@/lib/businessCapability';
import {
  normalizeVendorTypeSelections,
  legacyScalarsFromSelections,
} from '@/lib/constants/vendorProfile';
import type { PrimaryOutletInput, VendorDetailsInput } from '@/lib/validators/vendor-kyc';

export type DbClient = Pick<
  PrismaClient,
  | 'user'
  | 'businessAccount'
  | 'businessAccountMember'
  | 'outlet'
  | 'userRole'
  | 'accountRole'
  | 'vendor'
  | 'brand'
  | 'serviceArea'
>;

export interface ProvisionBusinessProfileInput {
  userId: string;
  kind: BusinessKind;
  /** First business for this user → primary membership. */
  isPrimaryMembership?: boolean;
  legalName: string;
  displayName?: string | null;
  gstin?: string | null;
  pan?: string | null;
  fssaiNumber?: string | null;
  gstTreatment?: string | null;
  placeOfSupply?: string | null;
  billingAddressLine?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPincode?: string | null;
  businessType?: string | null;
  subType?: string | null;
  cuisine?: string | null;
  businessSize?: string | null;
  salutation?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  designation?: string | null;
  workPhone?: string | null;
  mobilePhone?: string | null;
  vendorTypeSelections?: Prisma.InputJsonValue;
  primaryOutlet: PrimaryOutletInput;
  vendorDetails?: VendorDetailsInput | null;
  brand?: {
    productCategories?: string[];
    businessSize?: string | null;
    distributionPresence?: string | null;
    targetSegments?: string[];
    horecaFocused?: boolean | null;
    retailFocused?: boolean | null;
    website?: string | null;
    tagline?: string | null;
    description?: string | null;
  };
}

export interface ProvisionBusinessProfileResult {
  account: { id: string; legalName: string; displayName: string | null };
  outlet: { id: string };
  vendorId: string | null;
  brandId: string | null;
  nextPath: string;
}

export function slugifyEntity(name: string, suffix: string, fallback: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${base || fallback}-${suffix.slice(0, 8)}`;
}

async function requireTemplate(
  db: DbClient,
  name: string,
  scope: 'account' | 'vendor' | 'brand',
): Promise<{ id: string }> {
  const template = await db.accountRole.findFirst({
    where: { businessAccountId: null, isTemplate: true, name, scope },
    select: { id: true },
  });
  if (!template) {
    throw Errors.badRequest(`${name} role template missing. Run data backfill first.`);
  }
  return template;
}

export async function provisionBusinessProfile(
  input: ProvisionBusinessProfileInput,
  client?: DbClient,
): Promise<ProvisionBusinessProfileResult> {
  const db = client ?? prisma;
  const flags = flagsForKind(input.kind);
  const legalName = input.legalName.trim();
  if (legalName.length < 2) {
    throw Errors.fieldError('legalName', 'Legal business name is required');
  }

  const existingMembership = await db.businessAccountMember.findFirst({
    where: { userId: input.userId },
    select: { id: true },
  });
  const isPrimary = input.isPrimaryMembership ?? !existingMembership;

  const ownerTemplate = await requireTemplate(db, 'Owner', 'account');
  const vendorAdminTemplate = input.kind === 'vendor'
    ? await requireTemplate(db, 'Vendor Admin', 'vendor')
    : null;
  const brandAdminTemplate = input.kind === 'brand'
    ? await requireTemplate(db, 'Brand Admin', 'brand')
    : null;

  const billingLine = input.billingAddressLine || input.primaryOutlet.addressLine;
  const billingCity = input.billingCity || input.primaryOutlet.city || null;
  const billingState = input.billingState || input.primaryOutlet.state || null;
  const billingPincode = input.billingPincode || input.primaryOutlet.pincode || null;

  const account = await db.businessAccount.create({
    data: {
      legalName,
      displayName: input.kind === 'vendor'
        ? legalName
        : (input.displayName?.trim() || legalName),
      companyName: legalName,
      gstin: input.gstin || null,
      pan: input.pan || null,
      fssaiNumber: input.fssaiNumber || null,
      gstTreatment: input.gstTreatment || null,
      placeOfSupply: input.placeOfSupply || null,
      billingAddressLine: billingLine || null,
      billingCity,
      billingState,
      billingPincode,
      businessType: input.businessType
        || (input.kind === 'vendor' ? 'vendor' : input.kind === 'brand' ? 'brand' : 'customer'),
      subType: input.subType || null,
      cuisine: input.cuisine || null,
      businessSize: input.businessSize || null,
      salutation: input.salutation || null,
      firstName: input.firstName || null,
      lastName: input.lastName || null,
      designation: input.designation || null,
      workPhone: input.workPhone || null,
      mobilePhone: input.mobilePhone || null,
      vendorTypeSelections: input.vendorTypeSelections,
      isCustomer: flags.isCustomer,
      isVendor: flags.isVendor,
      isBrand: flags.isBrand,
      status: 'active',
    },
    select: { id: true, legalName: true, displayName: true },
  });

  const outlet = await db.outlet.create({
    data: {
      businessAccountId: account.id,
      name: input.primaryOutlet.name,
      addressLine: input.primaryOutlet.addressLine,
      flatInfo: input.primaryOutlet.flatInfo ?? null,
      landmark: input.primaryOutlet.landmark ?? null,
      city: input.primaryOutlet.city ?? null,
      state: input.primaryOutlet.state ?? null,
      pincode: input.primaryOutlet.pincode ?? null,
      latitude: input.primaryOutlet.latitude ?? null,
      longitude: input.primaryOutlet.longitude ?? null,
      placeId: input.primaryOutlet.placeId ?? null,
      requiresAddressUpdate: !(input.primaryOutlet.latitude && input.primaryOutlet.longitude),
    },
    select: { id: true },
  });

  await db.businessAccount.update({
    where: { id: account.id },
    data: { primaryOutletId: outlet.id },
  });

  await db.businessAccountMember.create({
    data: {
      userId: input.userId,
      businessAccountId: account.id,
      isPrimary,
      acceptedAt: new Date(),
    },
  });

  await db.userRole.create({
    data: {
      userId: input.userId,
      businessAccountId: account.id,
      outletId: null,
      roleId: ownerTemplate.id,
    },
  });

  let vendorId: string | null = null;
  let brandId: string | null = null;

  if (input.kind === 'vendor' && vendorAdminTemplate) {
    vendorId = await createVendorStore(db, {
      userId: input.userId,
      accountId: account.id,
      outletId: outlet.id,
      legalName,
      displayName: input.displayName,
      gstin: input.gstin,
      vendorDetails: input.vendorDetails ?? null,
      primaryOutlet: input.primaryOutlet,
      vendorAdminRoleId: vendorAdminTemplate.id,
    });
  }

  if (input.kind === 'brand' && brandAdminTemplate) {
    brandId = await createBrandStore(db, {
      userId: input.userId,
      accountId: account.id,
      legalName,
      displayName: input.displayName,
      brand: input.brand,
      businessType: input.businessType,
      subType: input.subType,
      brandAdminRoleId: brandAdminTemplate.id,
    });
  }

  return {
    account,
    outlet,
    vendorId,
    brandId,
    nextPath: nextPathForKind(input.kind, account.id),
  };
}

async function createVendorStore(
  db: DbClient,
  args: {
    userId: string;
    accountId: string;
    outletId: string;
    legalName: string;
    displayName?: string | null;
    gstin?: string | null;
    vendorDetails: VendorDetailsInput | null;
    primaryOutlet: PrimaryOutletInput;
    vendorAdminRoleId: string;
  },
): Promise<string> {
  const vd = args.vendorDetails;
  const typeSelections = vd ? normalizeVendorTypeSelections(vd.vendorTypeSelections) : [];
  const typeLegacy = legacyScalarsFromSelections(typeSelections);
  const selectionsJson = typeSelections.length > 0
    ? (typeSelections as unknown as Prisma.InputJsonValue)
    : undefined;
  const storeName = (args.displayName || args.legalName).trim();
  const slug = slugifyEntity(storeName, args.userId, 'store');
  const slugTaken = await db.vendor.findUnique({ where: { slug }, select: { id: true } });
  if (slugTaken) {
    throw Errors.fieldError('displayName', 'An Online Store with this name already exists. Try a different store name.', 409);
  }

  const warehouseCount = vd && vd.warehouseCount != null && vd.warehouseCount !== ''
    ? Number(vd.warehouseCount)
    : null;
  const deliveryFleet = typeof vd?.deliveryFleet === 'boolean'
    ? vd.deliveryFleet
    : vd?.deliveryFleet === 'yes' || vd?.deliveryFleet === 'true'
      ? true
      : vd?.deliveryFleet === 'no' || vd?.deliveryFleet === 'false'
        ? false
        : null;

  const vendor = await db.vendor.create({
    data: {
      userId: args.userId,
      businessAccountId: args.accountId,
      businessName: args.legalName,
      displayName: storeName,
      slug,
      isActive: false,
      isVerified: false,
      isPrimaryStore: true,
      multiWarehouseEnabled: false,
      defaultOutletId: args.outletId,
      setupProgress: {
        business: true,
        online_store: true,
        delivery: (vd?.serviceablePincodes?.length ?? 0) > 0,
      },
      gstNumber: args.gstin ?? null,
      tradeName: args.displayName ?? null,
      ...(vd ? {
        vendorType: typeLegacy?.vendorType ?? vd.vendorType,
        panNumber: vd.panNumber || null,
        authorizedPersonName: vd.authorizedPersonName,
        authorizedPersonPhone: vd.authorizedPersonPhone,
        authorizedPersonEmail: vd.authorizedPersonEmail || null,
        addressLine: vd.billingAddress.addressLine,
        city: vd.billingAddress.city,
        state: vd.billingAddress.state,
        addressPincode: vd.billingAddress.pincode,
        pickupAddressLine: args.primaryOutlet.addressLine,
        pickupCity: args.primaryOutlet.city ?? null,
        pickupState: args.primaryOutlet.state ?? null,
        pickupPincode: args.primaryOutlet.pincode ?? null,
        bankAccountName: vd.bankAccountName,
        bankAccountNumber: vd.bankAccountNumber,
        bankIfsc: vd.bankIfsc,
        bankName: vd.bankName,
        bankAccountType: vd.bankAccountType,
        deliveryCapability: vd.deliveryCapability,
        fssaiNumber: vd.fssaiNumber || null,
        udyamNumber: vd.udyamNumber || null,
        cinNumber: vd.cinNumber || null,
        subType: typeLegacy?.subType ?? vd.subType ?? null,
        vendorTypeSelections: selectionsJson,
        categoriesHandled: vd.categoriesHandled ?? [],
        businessSize: vd.businessSize || null,
        coverage: vd.coverage || null,
        warehouseCount: Number.isFinite(warehouseCount) ? warehouseCount : null,
        deliveryFleet,
        monthlySupplyBand: vd.monthlySupplyBand || null,
      } : {}),
    },
    select: { id: true },
  });

  await db.userRole.create({
    data: {
      userId: args.userId,
      businessAccountId: args.accountId,
      outletId: null,
      vendorId: null,
      roleId: args.vendorAdminRoleId,
    },
  });

  if (vd && vd.serviceablePincodes.length > 0) {
    const unique = Array.from(new Set(vd.serviceablePincodes.map((p) => p.trim()).filter(Boolean)));
    await db.serviceArea.createMany({
      data: unique.map((pincode) => ({
        vendorId: vendor.id,
        outletId: args.outletId,
        pincode,
        isActive: true,
      })),
      skipDuplicates: true,
    });
  }

  return vendor.id;
}

async function createBrandStore(
  db: DbClient,
  args: {
    userId: string;
    accountId: string;
    legalName: string;
    displayName?: string | null;
    businessType?: string | null;
    subType?: string | null;
    brand?: ProvisionBusinessProfileInput['brand'];
    brandAdminRoleId: string;
  },
): Promise<string> {
  const brandName = (args.displayName || args.legalName).trim();
  const existingBrand = await db.brand.findFirst({
    where: { name: { equals: brandName, mode: 'insensitive' } },
    select: { id: true, userId: true, slug: true },
  });
  if (existingBrand?.userId) {
    throw Errors.conflict('A brand with this name already exists.');
  }

  const brandFields = {
    name: brandName,
    description: args.brand?.description ?? null,
    website: args.brand?.website ?? null,
    tagline: args.brand?.tagline ?? null,
    categories: args.brand?.productCategories ?? [],
    brandType: args.businessType ?? null,
    subType: args.subType ?? null,
    businessSize: args.brand?.businessSize ?? null,
    distributionPresence: args.brand?.distributionPresence ?? null,
    targetSegments: args.brand?.targetSegments ?? [],
    horecaFocused: args.brand?.horecaFocused ?? null,
    retailFocused: args.brand?.retailFocused ?? null,
  };

  let brand: { id: string };
  if (existingBrand) {
    brand = await db.brand.update({
      where: { id: existingBrand.id },
      data: {
        userId: args.userId,
        businessAccountId: args.accountId,
        approvalStatus: 'pending',
        isActive: false,
        ...brandFields,
      },
      select: { id: true },
    });
  } else {
    const slug = slugifyEntity(brandName, args.userId, 'brand');
    const slugTaken = await db.brand.findUnique({ where: { slug }, select: { id: true } });
    if (slugTaken) {
      throw Errors.conflict('A brand with this name already exists.');
    }
    brand = await db.brand.create({
      data: {
        userId: args.userId,
        businessAccountId: args.accountId,
        slug,
        approvalStatus: 'pending',
        isActive: false,
        ...brandFields,
      },
      select: { id: true },
    });
  }

  await db.userRole.create({
    data: {
      userId: args.userId,
      businessAccountId: args.accountId,
      outletId: null,
      roleId: args.brandAdminRoleId,
    },
  });

  return brand.id;
}
