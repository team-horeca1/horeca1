/**
 * provisionDefaultAccount — give a freshly-registered User a BusinessAccount,
 * an empty primary Outlet (requiresAddressUpdate=true until they fill it in),
 * a BusinessAccountMember, and a UserRole (Owner / Vendor Admin / Brand Admin).
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { mapToBusinessAccount, mapToPrimaryOutlet } from '@/lib/customerProfileMapper';
import { PLACEHOLDER_OUTLET_ADDRESS } from '@/lib/constants/customerProfile';
import type { CustomerProfileInput } from '@/lib/validators/customer-profile';

export type AccountKind = 'customer' | 'vendor' | 'brand';

interface ProvisionInput extends Omit<CustomerProfileInput, 'fullName' | 'businessName' | 'gstNumber'> {
  userId: string;
  kind: AccountKind;
  /** Legacy alias for legalName */
  businessName?: string | null;
  fullName?: string | null;
  gstNumber?: string | null;
}

interface ProvisionResult {
  businessAccountId: string;
  outletId: string;
  created: boolean;
  ownerRoleId: string;
}

const KIND_TO_FLAGS: Record<AccountKind, { isCustomer: boolean; isVendor: boolean; isBrand: boolean; templateName: string; templateScope: 'account' | 'vendor' | 'brand'; businessType: string }> = {
  customer: { isCustomer: true,  isVendor: false, isBrand: false, templateName: 'Owner',        templateScope: 'account', businessType: 'customer' },
  vendor:   { isCustomer: false, isVendor: true,  isBrand: false, templateName: 'Vendor Admin', templateScope: 'vendor',  businessType: 'vendor' },
  brand:    { isCustomer: false, isVendor: false, isBrand: true,  templateName: 'Brand Admin',  templateScope: 'brand',   businessType: 'brand' },
};

function toProfileInput(input: ProvisionInput): CustomerProfileInput {
  return {
    ...input,
    legalName: input.legalName ?? input.businessName ?? undefined,
    companyName: input.companyName ?? input.businessName ?? undefined,
    fullName: input.fullName ?? undefined,
    gstin: input.gstin ?? input.gstNumber ?? undefined,
    displayName: input.displayName ?? undefined,
    pan: input.pan ?? undefined,
    fssaiNumber: input.fssaiNumber ?? undefined,
    outletName: input.outletName ?? undefined,
    addressLine: input.addressLine ?? undefined,
    flatInfo: input.flatInfo ?? undefined,
    landmark: input.landmark ?? undefined,
    city: input.city ?? undefined,
    state: input.state ?? undefined,
    pincode: input.pincode ?? undefined,
    latitude: input.latitude ?? undefined,
    longitude: input.longitude ?? undefined,
    placeId: input.placeId ?? undefined,
    billingAddressLine: input.billingAddressLine ?? input.addressLine ?? undefined,
    billingCity: input.billingCity ?? input.city ?? undefined,
    billingState: input.billingState ?? input.state ?? undefined,
    billingPincode: input.billingPincode ?? input.pincode ?? undefined,
  };
}

export async function provisionDefaultAccount(
  input: ProvisionInput,
  client?: Pick<PrismaClient, 'user' | 'businessAccountMember' | 'businessAccount' | 'outlet' | 'userRole' | 'accountRole' | 'savedAddress'>,
): Promise<ProvisionResult> {
  const db = client ?? prisma;
  const profile = toProfileInput(input);
  const flags = KIND_TO_FLAGS[input.kind];

  const existing = await db.businessAccountMember.findFirst({
    where: { userId: input.userId, isPrimary: true },
    select: {
      businessAccountId: true,
      businessAccount: { select: { primaryOutletId: true } },
    },
  });
  if (existing && existing.businessAccount.primaryOutletId) {
    const existingBa = await db.businessAccount.findUnique({
      where: { id: existing.businessAccountId },
      select: { isCustomer: true, isVendor: true, isBrand: true },
    });
    const sameKind =
      (input.kind === 'customer' && existingBa?.isCustomer && !existingBa.isVendor && !existingBa.isBrand)
      || (input.kind === 'vendor' && existingBa?.isVendor && !existingBa.isCustomer && !existingBa.isBrand)
      || (input.kind === 'brand' && existingBa?.isBrand && !existingBa.isCustomer && !existingBa.isVendor);

    if (sameKind) {
      const template = await db.accountRole.findFirst({
        where: { businessAccountId: null, isTemplate: true, name: flags.templateName, scope: flags.templateScope },
        select: { id: true },
      });
      if (template) {
        const has = await db.userRole.findFirst({
          where: { userId: input.userId, businessAccountId: existing.businessAccountId, outletId: null, roleId: template.id },
          select: { id: true },
        });
        if (!has) {
          await db.userRole.create({
            data: { userId: input.userId, businessAccountId: existing.businessAccountId, outletId: null, roleId: template.id },
          });
        }
      }
      return {
        businessAccountId: existing.businessAccountId,
        outletId: existing.businessAccount.primaryOutletId,
        created: false,
        ownerRoleId: template?.id ?? '',
      };
    }
    // Different capability already exists — fall through and create a new BusinessAccount.
  }

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { phone: true },
  });

  const template = await db.accountRole.findFirst({
    where: { businessAccountId: null, isTemplate: true, name: flags.templateName, scope: flags.templateScope },
    select: { id: true },
  });
  if (!template) {
    throw new Error(`Missing seeded ${flags.templateScope}/${flags.templateName} role template. Run prisma/migrations/20260520_hcid_architecture_step_a/data_migrate.ts.`);
  }

  const baData = mapToBusinessAccount(profile, { kindDefaultBusinessType: flags.businessType });
  const outletData = mapToPrimaryOutlet(profile);

  const account = await db.businessAccount.create({
    data: {
      ...(baData as Prisma.BusinessAccountCreateInput),
      isCustomer: flags.isCustomer,
      isVendor: flags.isVendor,
      isBrand: flags.isBrand,
      status: 'active',
      mobilePhone: (baData as { mobilePhone?: string | null }).mobilePhone ?? user?.phone ?? null,
      workPhone: (baData as { workPhone?: string | null }).workPhone ?? user?.phone ?? null,
    },
  });

  const outlet = await db.outlet.create({
    data: {
      businessAccountId: account.id,
      name: outletData.name,
      addressLine: outletData.addressLine,
      flatInfo: outletData.flatInfo,
      landmark: outletData.landmark,
      city: outletData.city,
      state: outletData.state,
      pincode: outletData.pincode,
      latitude: outletData.latitude,
      longitude: outletData.longitude,
      placeId: outletData.placeId,
      requiresAddressUpdate: outletData.requiresAddressUpdate,
    },
  });

  await db.businessAccount.update({
    where: { id: account.id },
    data: { primaryOutletId: outlet.id },
  });

  // V2.2: Ensure customer has a default SavedAddress matching this primary outlet
  // so storefront checkout, cart delivery address, and order placement immediately resolve.
  if (flags.isCustomer && outletData.addressLine && outletData.addressLine !== PLACEHOLDER_OUTLET_ADDRESS) {
    const existingSaved = await db.savedAddress.findFirst({
      where: { userId: input.userId },
    });
    if (!existingSaved) {
      await db.savedAddress.create({
        data: {
          userId: input.userId,
          outletId: outlet.id,
          label: outletData.name || 'Primary Delivery Address',
          businessName: (baData as { legalName?: string }).legalName || input.businessName || input.fullName,
          fullAddress: outletData.addressLine,
          shortAddress: outletData.addressLine.split(',').slice(0, 2).join(', '),
          flatInfo: outletData.flatInfo,
          landmark: outletData.landmark,
          city: outletData.city,
          state: outletData.state,
          pincode: outletData.pincode,
          latitude: outletData.latitude ?? 0,
          longitude: outletData.longitude ?? 0,
          placeId: outletData.placeId,
          isDefault: true,
        },
      });
    }

    if (outletData.pincode) {
      await db.user.update({
        where: { id: input.userId },
        data: {
          pincode: outletData.pincode,
          ...((baData as { legalName?: string }).legalName ? { businessName: (baData as { legalName?: string }).legalName } : {}),
        },
      }).catch(() => {});
    }
  }

  await db.businessAccountMember.create({
    data: {
      userId: input.userId,
      businessAccountId: account.id,
      isPrimary: true,
      acceptedAt: new Date(),
    },
  });

  await db.userRole.create({
    data: {
      userId: input.userId,
      businessAccountId: account.id,
      outletId: null,
      roleId: template.id,
    },
  });

  return {
    businessAccountId: account.id,
    outletId: outlet.id,
    created: true,
    ownerRoleId: template.id,
  };
}
