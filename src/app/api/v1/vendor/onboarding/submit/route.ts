// POST /api/v1/vendor/onboarding/submit
// Final-step submit for the /vendor/register wizard. Creates a brand-new
// vendor account (User + BusinessAccount + Outlet + Vendor + ServiceAreas)
// in one transaction. Vendor row starts isActive=false, isVerified=false —
// admin must approve at /admin/vendors/[id] before the storefront goes live.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { withRateLimit } from '@/middleware/withRateLimit';
import { uniqueHcid } from '@/lib/hcid';
import { emitEvent } from '@/events/emitter';
import { GST_RE, PAN_RE, VENDOR_TYPES } from '@/lib/validators/vendor-kyc';
import { resolveVendorTypeSlug, getEffectiveVendorTypeSelections } from '@/lib/validators/vendor-profile';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';
import {
  normalizeVendorTypeSelections,
  legacyScalarsFromSelections,
  type VendorTypeSelection,
} from '@/lib/constants/vendorProfile';

const PHONE_RE = /^\d{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PINCODE_RE = /^\d{6}$/;

const Address = z.object({
  addressLine: z.string().min(5).max(500),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  pincode: z.string().regex(PINCODE_RE, 'Invalid pincode'),
});

const VendorTypeSelectionSchema = z.object({
  type: z.string().min(1),
  slug: z.string().min(1),
  subTypes: z.array(z.string().min(1)).min(1),
});

const BodyBase = z.object({
  // Step 1 — phone or email verified via /auth/otp/verify
  phone: z.string().optional().or(z.literal('')),
  verifiedEmail: z.string().optional().or(z.literal('')),

  // Step 2 — vendor type (CSV-aligned + legacy slugs)
  vendorType: z.enum(VENDOR_TYPES).optional(),
  vendorBusinessType: z.string().max(80).optional(),
  vendorTypeSelections: z.array(VendorTypeSelectionSchema).optional(),

  // Tier A profile (mastersheet)
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

  // Step 3 — basic details
  fullName: z.string().min(2).max(255),
  businessName: z.string().min(2).max(255),
  tradeName: z.string().min(2).max(255),
  email: z.string().email().optional().or(z.literal('')),
  password: z.string().min(6).optional().or(z.literal('')),
  authorizedPersonName: z.string().min(2).max(255),
  authorizedPersonPhone: z.string().optional().or(z.literal('')),
  authorizedPersonEmail: z.string().email().optional().or(z.literal('')),

  // Step 4 — GST & PAN — optional, validates format if provided.
  gstNumber: z.string().regex(GST_RE, 'Invalid GSTIN format').optional().or(z.literal('')),
  panNumber: z.string().regex(PAN_RE, 'Invalid PAN format').optional().or(z.literal('')),

  // Step 5 — bank details
  bankAccountName: z.string().min(2).max(100),
  bankAccountNumber: z.string().min(8).max(30),
  bankIfsc: z.string().regex(IFSC_RE, 'Invalid IFSC format'),
  bankName: z.string().min(2).max(100),
  bankAccountType: z.enum(['savings', 'current']),

  // Step 6 — addresses
  billingAddress: Address,
  pickupAddress: Address,

  // Step 7 — service & KYC
  serviceablePincodes: z.array(z.string().regex(PINCODE_RE)).min(1, 'Add at least one pincode').max(200),
  deliveryCapability: z.enum(['own_fleet', 'third_party', 'both']),
  fssaiNumber: z.string().max(50).optional().or(z.literal('')),
  udyamNumber: z.string().max(50).optional().or(z.literal('')),
  cinNumber: z.string().max(50).optional().or(z.literal('')),
});

function parseBody(raw: unknown) {
  const relaxed = isRegisterEmailOtpEnabled();
  const parsed = BodyBase.parse(raw);

  const phoneRaw = (parsed.phone ?? '').replace(/\D/g, '');
  const phone = phoneRaw.length === 12 ? phoneRaw.replace(/^91/, '') : phoneRaw;
  const verifiedEmail = (parsed.verifiedEmail || parsed.email || '').trim().toLowerCase();
  const ownerEmail = (parsed.email || parsed.authorizedPersonEmail || verifiedEmail).trim().toLowerCase();
  const authPhone = (parsed.authorizedPersonPhone ?? phone).replace(/\D/g, '').slice(-10);

  if (!relaxed) {
    if (!PHONE_RE.test(phone)) throw Errors.badRequest('Invalid phone number');
    if (!PHONE_RE.test(authPhone)) throw Errors.badRequest('Invalid authorized person phone');
  } else {
    const hasPhone = PHONE_RE.test(phone) || PHONE_RE.test(authPhone);
    const hasEmail = !!ownerEmail && EMAIL_RE.test(ownerEmail);
    if (!hasPhone && !hasEmail) {
      throw Errors.badRequest('Provide a verified mobile number or email address');
    }
    if (authPhone && authPhone.length > 0 && !PHONE_RE.test(authPhone)) {
      throw Errors.badRequest('Invalid authorized person phone');
    }
    if (ownerEmail && !EMAIL_RE.test(ownerEmail)) {
      throw Errors.badRequest('Invalid email address');
    }
    if (!hasPhone && !ownerEmail) {
      throw Errors.badRequest('Email is required when no phone is provided');
    }
  }

  const selections = normalizeVendorTypeSelections(parsed.vendorTypeSelections)
    .length > 0
    ? normalizeVendorTypeSelections(parsed.vendorTypeSelections)
    : getEffectiveVendorTypeSelections({
        vendorBusinessType: parsed.vendorBusinessType,
        vendorType: parsed.vendorType,
        subType: parsed.subType,
      });

  if (selections.length === 0) {
    throw Errors.badRequest('Select at least one vendor type and sub-type');
  }

  const legacy = legacyScalarsFromSelections(selections);

  return {
    ...parsed,
    phone: PHONE_RE.test(phone) ? phone : (PHONE_RE.test(authPhone) ? authPhone : ''),
    email: ownerEmail || null,
    verifiedEmail: verifiedEmail || ownerEmail || null,
    authorizedPersonPhone: PHONE_RE.test(authPhone) ? authPhone : '',
    vendorTypeSelections: selections as VendorTypeSelection[],
    vendorBusinessType: legacy?.vendorBusinessType ?? parsed.vendorBusinessType,
    vendorType: legacy?.vendorType ?? parsed.vendorType,
    subType: legacy?.subType ?? parsed.subType,
    relaxed,
  };
}

function slugify(name: string, suffix: string): string {
  const base = name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${base || 'vendor'}-${suffix.slice(0, 8)}`;
}

async function postHandler(req: NextRequest) {
  try {
    const input = parseBody(await req.json());
    const phone = input.phone || null;
    const email = input.email;
    const verifyEmail = input.verifiedEmail;

    const otpWhere = input.relaxed
      ? {
          OR: [
            ...(phone ? [{ phone, used: true as const }] : []),
            ...(verifyEmail ? [{ email: verifyEmail, used: true as const }] : []),
          ],
          createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
        }
      : {
          phone: phone!,
          used: true as const,
          createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
        };

    const verifiedOtp = await prisma.otpCode.findFirst({
      where: otpWhere,
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!verifiedOtp) {
      throw Errors.badRequest(
        input.relaxed
          ? 'Contact is not verified. Please verify your mobile or email first.'
          : 'Phone number is not verified. Please verify your number first.',
      );
    }

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      select: { id: true, phone: true, email: true },
    });
    if (existing) {
      const dupField = phone && existing.phone === phone ? 'Phone' : 'Email';
      throw Errors.duplicate(dupField);
    }

    const vendorAdminTemplate = await prisma.accountRole.findFirst({
      where: { businessAccountId: null, isTemplate: true, name: 'Vendor Admin', scope: 'vendor' },
      select: { id: true },
    });
    if (!vendorAdminTemplate) {
      throw Errors.badRequest('Vendor Admin role template missing. Run seed migration.');
    }

    const hashedPassword = input.password ? await bcrypt.hash(input.password, 12) : null;
    const hcidDisplay = await uniqueHcid();

    const typeSlug = resolveVendorTypeSlug({
      vendorBusinessType: input.vendorBusinessType,
      vendorType: input.vendorType,
    }) ?? input.vendorType ?? input.vendorTypeSelections[0]?.slug ?? 'distributor';

    const typeSelectionsJson = input.vendorTypeSelections as unknown as Prisma.InputJsonValue;

    const warehouseCount = input.warehouseCount != null && input.warehouseCount !== ''
      ? Number(input.warehouseCount)
      : null;
    const deliveryFleet = typeof input.deliveryFleet === 'boolean'
      ? input.deliveryFleet
      : input.deliveryFleet === 'yes' || input.deliveryFleet === 'true'
        ? true
        : input.deliveryFleet === 'no' || input.deliveryFleet === 'false'
          ? false
          : null;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          phone: phone || null,
          email,
          password: hashedPassword,
          fullName: input.fullName,
          businessName: input.businessName,
          gstNumber: input.gstNumber || null,
          pincode: input.billingAddress.pincode,
          role: 'vendor',
          hcidDisplay,
        },
        select: { id: true, hcidDisplay: true },
      });

      const account = await tx.businessAccount.create({
        data: {
          legalName: input.businessName,
          displayName: input.tradeName,
          gstin: input.gstNumber || null,
          pan: input.panNumber || null,
          businessType: input.vendorBusinessType || input.vendorType || 'vendor',
          subType: input.subType || null,
          vendorTypeSelections: typeSelectionsJson,
          businessSize: input.businessSize || null,
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
          name: input.tradeName,
          addressLine: input.pickupAddress.addressLine,
          city: input.pickupAddress.city,
          state: input.pickupAddress.state,
          pincode: input.pickupAddress.pincode,
          requiresAddressUpdate: false,
        },
      });

      await tx.businessAccount.update({
        where: { id: account.id },
        data: { primaryOutletId: outlet.id },
      });

      await tx.businessAccountMember.create({
        data: { userId: user.id, businessAccountId: account.id, isPrimary: true, acceptedAt: new Date() },
      });

      await tx.userRole.create({
        data: { userId: user.id, businessAccountId: account.id, outletId: null, roleId: vendorAdminTemplate.id },
      });

      const slug = slugify(input.tradeName, user.id);
      const slugTaken = await tx.vendor.findUnique({ where: { slug }, select: { id: true } });
      if (slugTaken) {
        throw Errors.conflict('A vendor with this trade name already exists.');
      }

      const vendor = await tx.vendor.create({
        data: {
          userId: user.id,
          businessAccountId: account.id,
          businessName: input.businessName,
          slug,
          isActive: false,
          isVerified: false,

          gstNumber: input.gstNumber || null,
          addressLine: input.billingAddress.addressLine,
          city: input.billingAddress.city,
          state: input.billingAddress.state,
          addressPincode: input.billingAddress.pincode,

          bankAccountName: input.bankAccountName,
          bankAccountNumber: input.bankAccountNumber,
          bankIfsc: input.bankIfsc,
          bankName: input.bankName,
          bankAccountType: input.bankAccountType,

          tradeName: input.tradeName,
          vendorType: typeSlug,
          subType: input.subType || null,
          vendorTypeSelections: typeSelectionsJson,
          categoriesHandled: input.categoriesHandled ?? [],
          businessSize: input.businessSize || null,
          coverage: input.coverage || null,
          warehouseCount: Number.isFinite(warehouseCount) ? Math.round(warehouseCount!) : null,
          deliveryFleet,
          monthlySupplyBand: input.monthlySupplyBand || null,
          panNumber: input.panNumber || null,
          authorizedPersonName: input.authorizedPersonName,
          authorizedPersonPhone: input.authorizedPersonPhone || null,
          authorizedPersonEmail: input.authorizedPersonEmail || email,
          pickupAddressLine: input.pickupAddress.addressLine,
          pickupCity: input.pickupAddress.city,
          pickupState: input.pickupAddress.state,
          pickupPincode: input.pickupAddress.pincode,
          deliveryCapability: input.deliveryCapability,
          fssaiNumber: input.fssaiNumber || null,
          udyamNumber: input.udyamNumber || null,
          cinNumber: input.cinNumber || null,
        },
        select: { id: true, slug: true },
      });

      const uniquePincodes = Array.from(new Set(input.serviceablePincodes));
      if (uniquePincodes.length > 0) {
        await tx.serviceArea.createMany({
          data: uniquePincodes.map((pincode) => ({ vendorId: vendor.id, pincode })),
          skipDuplicates: true,
        });
      }

      return { user, vendor };
    });

    emitEvent('UserRegistered', {
      userId: result.user.id,
      email: email ?? '',
      role: 'vendor',
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          vendorId: result.vendor.id,
          hcidDisplay: result.user.hcidDisplay,
          message: 'Vendor application submitted. Our team will review and contact you shortly.',
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}

export const POST = withRateLimit(postHandler, 'auth');
