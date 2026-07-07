import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { uniqueHcid } from '@/lib/hcid';
import {
  GST_RE,
  PHONE_RE,
  VendorDetailsSchema,
  PrimaryOutletSchema,
} from '@/lib/validators/vendor-kyc';
import {
  normalizeVendorTypeSelections,
  legacyScalarsFromSelections,
} from '@/lib/constants/vendorProfile';
import type { Prisma } from '@prisma/client';

function slugify(name: string, userId: string): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  return `${base || 'vendor'}-${userId.slice(0, 8)}`;
}

export const createDirectVendorSchema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(72),
  phone: z.string().regex(PHONE_RE, 'Phone must be 10 digits'),
  businessName: z.string().min(2).max(255),
  tradeName: z.string().max(255).optional(),
  gstin: z.string().regex(GST_RE, 'Invalid GSTIN format').optional().or(z.literal('')),
  description: z.string().max(1000).optional(),
  logoUrl: z.string().url().optional(),
  minOrderValue: z.number().min(0).optional(),
  primaryOutlet: PrimaryOutletSchema,
  vendorDetails: VendorDetailsSchema,
  subType: z.string().max(80).optional(),
  categoriesHandled: z.array(z.string()).optional(),
  businessSize: z.string().max(50).optional(),
  coverage: z.string().max(120).optional(),
  warehouseCount: z.union([z.number(), z.string()]).optional(),
  deliveryFleet: z.union([z.boolean(), z.string()]).optional(),
  monthlySupplyBand: z.string().max(50).optional(),
  salutation: z.string().max(20).optional(),
  firstName: z.string().max(120).optional(),
  lastName: z.string().max(120).optional(),
  designation: z.string().max(120).optional(),
});

export type CreateDirectVendorInput = z.infer<typeof createDirectVendorSchema>;

export async function createDirectVendor(
  input: CreateDirectVendorInput,
  invitedByUserId: string,
) {
  const normalizedEmail = input.email.toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existing) throw Errors.fieldError('email', 'Email already in use', 409);

  const phoneDigits = input.phone.replace(/\D/g, '');
  const phoneCollide = await prisma.user.findFirst({
    where: { phone: phoneDigits },
    select: { id: true },
  });
  if (phoneCollide) throw Errors.fieldError('phone', 'Phone number already in use', 409);

  const [ownerTemplate, vendorAdminTemplate] = await Promise.all([
    prisma.accountRole.findFirst({
      where: { businessAccountId: null, isTemplate: true, name: 'Owner', scope: 'account' },
      select: { id: true },
    }),
    prisma.accountRole.findFirst({
      where: { businessAccountId: null, isTemplate: true, name: 'Vendor Admin', scope: 'vendor' },
      select: { id: true },
    }),
  ]);
  if (!ownerTemplate) throw Errors.badRequest('Owner role template missing. Run data backfill first.');
  if (!vendorAdminTemplate) throw Errors.badRequest('Vendor Admin role template missing. Run data backfill first.');

  const hashedPassword = await bcrypt.hash(input.password, 12);
  const hcidDisplay = await uniqueHcid();
  const vd = input.vendorDetails;
  const typeSelections = normalizeVendorTypeSelections(vd.vendorTypeSelections);
  const typeLegacy = legacyScalarsFromSelections(typeSelections);
  const selectionsJson = typeSelections.length > 0
    ? (typeSelections as unknown as Prisma.InputJsonValue)
    : undefined;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        fullName: input.fullName,
        email: normalizedEmail,
        password: hashedPassword,
        role: 'vendor',
        phone: phoneDigits,
        isActive: true,
        hcidDisplay,
        businessName: input.businessName,
        gstNumber: input.gstin || null,
        pincode: vd.billingAddress.pincode,
      },
    });

    const slug = slugify(input.businessName, user.id);
    const slugExists = await tx.vendor.findUnique({ where: { slug }, select: { id: true } });
    if (slugExists) {
      throw Errors.fieldError('businessName', 'A vendor with this business name already exists', 409);
    }

    const account = await tx.businessAccount.create({
      data: {
        legalName: input.businessName,
        displayName: input.tradeName ?? null,
        gstin: input.gstin || null,
        pan: vd.panNumber,
        fssaiNumber: vd.fssaiNumber || null,
        billingAddressLine: vd.billingAddress.addressLine,
        billingCity: vd.billingAddress.city,
        billingState: vd.billingAddress.state,
        billingPincode: vd.billingAddress.pincode,
        businessType: typeLegacy?.vendorBusinessType ?? vd.vendorType,
        subType: typeLegacy?.subType ?? vd.subType ?? input.subType ?? null,
        vendorTypeSelections: selectionsJson,
        businessSize: vd.businessSize || input.businessSize || null,
        salutation: input.salutation || null,
        firstName: input.firstName || null,
        lastName: input.lastName || null,
        designation: input.designation || null,
        isCustomer: true,
        isVendor: true,
        isBrand: false,
        status: 'active',
      },
    });

    const outlet = await tx.outlet.create({
      data: {
        businessAccountId: account.id,
        name: input.primaryOutlet.name,
        addressLine: input.primaryOutlet.addressLine,
        city: input.primaryOutlet.city,
        state: input.primaryOutlet.state,
        pincode: input.primaryOutlet.pincode,
        latitude: input.primaryOutlet.latitude,
        longitude: input.primaryOutlet.longitude,
        placeId: input.primaryOutlet.placeId,
        requiresAddressUpdate: false,
      },
    });
    await tx.businessAccount.update({
      where: { id: account.id },
      data: { primaryOutletId: outlet.id },
    });

    await tx.businessAccountMember.create({
      data: { userId: user.id, businessAccountId: account.id, isPrimary: true, acceptedAt: new Date(), invitedBy: invitedByUserId },
    });
    await tx.userRole.create({
      data: { userId: user.id, businessAccountId: account.id, outletId: null, roleId: ownerTemplate.id },
    });
    await tx.userRole.create({
      data: { userId: user.id, businessAccountId: account.id, outletId: null, roleId: vendorAdminTemplate.id },
    });

    const vendor = await tx.vendor.create({
      data: {
        userId: user.id,
        businessAccountId: account.id,
        businessName: input.businessName,
        slug,
        description: input.description ?? null,
        logoUrl: input.logoUrl ?? null,
        minOrderValue: input.minOrderValue ?? 0,
        isActive: true,
        isVerified: true,
        gstNumber: input.gstin || null,
        tradeName: input.tradeName ?? null,
        vendorType: typeLegacy?.vendorType ?? vd.vendorType,
        subType: typeLegacy?.subType ?? vd.subType ?? input.subType ?? null,
        vendorTypeSelections: selectionsJson,
        categoriesHandled: vd.categoriesHandled ?? input.categoriesHandled ?? [],
        businessSize: vd.businessSize || input.businessSize || null,
        coverage: vd.coverage || input.coverage || null,
        warehouseCount: vd.warehouseCount != null && vd.warehouseCount !== ''
          ? Number(vd.warehouseCount)
          : input.warehouseCount != null && input.warehouseCount !== ''
            ? Number(input.warehouseCount)
            : null,
        deliveryFleet: typeof vd.deliveryFleet === 'boolean'
          ? vd.deliveryFleet
          : typeof input.deliveryFleet === 'boolean'
            ? input.deliveryFleet
            : null,
        monthlySupplyBand: vd.monthlySupplyBand || input.monthlySupplyBand || null,
        panNumber: vd.panNumber,
        authorizedPersonName: vd.authorizedPersonName,
        authorizedPersonPhone: vd.authorizedPersonPhone,
        authorizedPersonEmail: vd.authorizedPersonEmail || null,
        addressLine: vd.billingAddress.addressLine,
        city: vd.billingAddress.city,
        state: vd.billingAddress.state,
        addressPincode: vd.billingAddress.pincode,
        pickupAddressLine: input.primaryOutlet.addressLine,
        pickupCity: input.primaryOutlet.city ?? null,
        pickupState: input.primaryOutlet.state ?? null,
        pickupPincode: input.primaryOutlet.pincode ?? null,
        bankAccountName: vd.bankAccountName,
        bankAccountNumber: vd.bankAccountNumber,
        bankIfsc: vd.bankIfsc,
        bankName: vd.bankName,
        bankAccountType: vd.bankAccountType,
        deliveryCapability: vd.deliveryCapability,
        fssaiNumber: vd.fssaiNumber || null,
        udyamNumber: vd.udyamNumber || null,
        cinNumber: vd.cinNumber || null,
      },
      select: {
        id: true,
        businessName: true,
        slug: true,
        logoUrl: true,
        isVerified: true,
        isActive: true,
        createdAt: true,
        user: { select: { id: true, fullName: true, email: true, phone: true, hcidDisplay: true } },
      },
    });

    const uniquePincodes = Array.from(new Set(vd.serviceablePincodes));
    if (uniquePincodes.length > 0) {
      await tx.serviceArea.createMany({
        data: uniquePincodes.map((pincode) => ({ vendorId: vendor.id, pincode })),
        skipDuplicates: true,
      });
    }

    return vendor;
  });
}
