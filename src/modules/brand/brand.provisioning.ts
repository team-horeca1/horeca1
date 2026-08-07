/**
 * Shared brand-owner provisioning used by admin create and
 * "Create Storefront" upgrade for name-only / placeholder brands.
 */

import type { Prisma } from '@prisma/client';
import { Errors } from '@/middleware/errorHandler';
import { uniqueHcid } from '@/lib/hcid';
import { passwordFieldsWithReveal } from '@/lib/adminPasswordCipher';

export const BRAND_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  approvalStatus: true,
  isActive: true,
  createdAt: true,
  user: { select: { id: true, fullName: true, email: true, phone: true } },
} as const;

export type BrandOwnerInput = {
  fullName: string;
  email: string | null;
  password: string;
  businessName?: string | null;
  gstNumber?: string | null;
  phone?: string | null;
};

export type BusinessAccountSeed = {
  legalName: string;
  displayName?: string | null;
  companyName?: string | null;
  gstin?: string | null;
  businessType?: string | null;
  subType?: string | null;
  salutation?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  designation?: string | null;
  billingAddressLine?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPincode?: string | null;
  mobilePhone?: string | null;
  workPhone?: string | null;
  businessSize?: string | null;
  remarks?: string | null;
  leadStatus?: string | null;
};

async function resolveBrandAdminRoleId(tx: Prisma.TransactionClient): Promise<string> {
  const brandAdminTemplate = await tx.accountRole.findFirst({
    where: { businessAccountId: null, isTemplate: true, name: 'Brand Admin', scope: 'brand' },
    select: { id: true },
  });
  if (!brandAdminTemplate) {
    throw Errors.badRequest('Brand Admin role template missing. Run seed migration.');
  }
  return brandAdminTemplate.id;
}

/** Ensure Brand Admin userRole exists for (user, account). Idempotent. */
export async function ensureBrandAdminRole(
  tx: Prisma.TransactionClient,
  userId: string,
  businessAccountId: string,
): Promise<void> {
  const existing = await tx.userRole.findFirst({
    where: { userId, businessAccountId, outletId: null },
    select: { id: true },
  });
  if (existing) return;

  const roleId = await resolveBrandAdminRoleId(tx);
  await tx.userRole.create({
    data: { userId, businessAccountId, outletId: null, roleId },
  });
}

/**
 * Create a brand owner User + BusinessAccount + membership + Brand Admin role.
 * Does NOT create the Brand row — caller links userId / businessAccountId.
 */
export async function provisionBrandOwner(
  tx: Prisma.TransactionClient,
  owner: BrandOwnerInput,
  baData?: BusinessAccountSeed | Record<string, unknown>,
): Promise<{ userId: string; businessAccountId: string }> {
  const pwd = await passwordFieldsWithReveal(owner.password, 12);
  const hcidDisplay = await uniqueHcid();
  const ba = (baData ?? {}) as BusinessAccountSeed;
  const legalName = ba.legalName || owner.businessName || owner.fullName || 'Brand';

  const user = await tx.user.create({
    data: {
      fullName: owner.fullName,
      email: owner.email,
      password: pwd.password,
      adminPasswordCipher: pwd.adminPasswordCipher,
      role: 'brand',
      isActive: true,
      hcidDisplay,
      businessName: owner.businessName ?? legalName,
      gstNumber: owner.gstNumber ?? ba.gstin ?? null,
      phone: owner.phone ?? ba.mobilePhone ?? null,
    },
  });

  const account = await tx.businessAccount.create({
    data: {
      legalName,
      displayName: ba.displayName ?? null,
      companyName: ba.companyName ?? legalName,
      gstin: ba.gstin ?? null,
      businessType: ba.businessType ?? 'brand',
      subType: ba.subType ?? null,
      salutation: ba.salutation ?? null,
      firstName: ba.firstName ?? null,
      lastName: ba.lastName ?? null,
      designation: ba.designation ?? null,
      billingAddressLine: ba.billingAddressLine ?? null,
      billingCity: ba.billingCity ?? null,
      billingState: ba.billingState ?? null,
      billingPincode: ba.billingPincode ?? null,
      mobilePhone: ba.mobilePhone ?? owner.phone ?? null,
      workPhone: ba.workPhone ?? null,
      businessSize: ba.businessSize ?? null,
      remarks: ba.remarks ?? null,
      leadStatus: ba.leadStatus ?? null,
      isCustomer: false,
      isVendor: false,
      isBrand: true,
      status: 'active',
    },
  });

  await tx.businessAccountMember.create({
    data: {
      userId: user.id,
      businessAccountId: account.id,
      isPrimary: true,
      acceptedAt: new Date(),
    },
  });

  await ensureBrandAdminRole(tx, user.id, account.id);

  return { userId: user.id, businessAccountId: account.id };
}

/**
 * Upgrade a placeholder (@brand.internal.horeca1) owner to a real login,
 * updating or creating the BusinessAccount as needed.
 */
export async function upgradePlaceholderBrandOwner(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    businessAccountId: string | null;
    owner: BrandOwnerInput;
    baData: BusinessAccountSeed | Record<string, unknown>;
  },
): Promise<{ userId: string; businessAccountId: string }> {
  const { userId, owner } = params;
  const ba = params.baData as BusinessAccountSeed;
  const pwd = await passwordFieldsWithReveal(owner.password, 12);
  const legalName = ba.legalName || owner.businessName || owner.fullName || 'Brand';

  await tx.user.update({
    where: { id: userId },
    data: {
      fullName: owner.fullName,
      email: owner.email,
      password: pwd.password,
      adminPasswordCipher: pwd.adminPasswordCipher,
      businessName: owner.businessName ?? legalName,
      gstNumber: owner.gstNumber ?? ba.gstin ?? null,
      phone: owner.phone ?? ba.mobilePhone ?? null,
      role: 'brand',
      isActive: true,
    },
  });

  let businessAccountId = params.businessAccountId;

  if (businessAccountId) {
    await tx.businessAccount.update({
      where: { id: businessAccountId },
      data: {
        legalName,
        displayName: ba.displayName ?? null,
        companyName: ba.companyName ?? legalName,
        gstin: ba.gstin ?? null,
        businessType: ba.businessType ?? 'brand',
        subType: ba.subType ?? null,
        salutation: ba.salutation ?? null,
        firstName: ba.firstName ?? null,
        lastName: ba.lastName ?? null,
        designation: ba.designation ?? null,
        billingAddressLine: ba.billingAddressLine ?? null,
        billingCity: ba.billingCity ?? null,
        billingState: ba.billingState ?? null,
        billingPincode: ba.billingPincode ?? null,
        mobilePhone: ba.mobilePhone ?? owner.phone ?? null,
        workPhone: ba.workPhone ?? null,
        businessSize: ba.businessSize ?? null,
        remarks: ba.remarks ?? null,
        leadStatus: ba.leadStatus ?? null,
        isBrand: true,
        status: 'active',
      },
    });

    const member = await tx.businessAccountMember.findFirst({
      where: { userId, businessAccountId },
      select: { id: true },
    });
    if (!member) {
      await tx.businessAccountMember.create({
        data: {
          userId,
          businessAccountId,
          isPrimary: true,
          acceptedAt: new Date(),
        },
      });
    }
  } else {
    const account = await tx.businessAccount.create({
      data: {
        legalName,
        displayName: ba.displayName ?? null,
        companyName: ba.companyName ?? legalName,
        gstin: ba.gstin ?? null,
        businessType: ba.businessType ?? 'brand',
        subType: ba.subType ?? null,
        salutation: ba.salutation ?? null,
        firstName: ba.firstName ?? null,
        lastName: ba.lastName ?? null,
        designation: ba.designation ?? null,
        billingAddressLine: ba.billingAddressLine ?? null,
        billingCity: ba.billingCity ?? null,
        billingState: ba.billingState ?? null,
        billingPincode: ba.billingPincode ?? null,
        mobilePhone: ba.mobilePhone ?? owner.phone ?? null,
        workPhone: ba.workPhone ?? null,
        businessSize: ba.businessSize ?? null,
        remarks: ba.remarks ?? null,
        leadStatus: ba.leadStatus ?? null,
        isCustomer: false,
        isVendor: false,
        isBrand: true,
        status: 'active',
      },
    });
    businessAccountId = account.id;

    await tx.businessAccountMember.create({
      data: {
        userId,
        businessAccountId,
        isPrimary: true,
        acceptedAt: new Date(),
      },
    });
  }

  await ensureBrandAdminRole(tx, userId, businessAccountId);

  return { userId, businessAccountId };
}

export function isPlaceholderBrandEmail(email: string | null | undefined): boolean {
  return !!email && email.includes('brand.internal.horeca1');
}

export function slugifyBrandName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
