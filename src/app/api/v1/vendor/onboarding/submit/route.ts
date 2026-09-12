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
import { provisionBusinessProfile } from '@/modules/account/provisionBusinessProfile';
import { withRateLimit } from '@/middleware/withRateLimit';
import { uniqueHcid } from '@/lib/hcid';
import { emitEvent } from '@/events/emitter';
import { GST_RE, PAN_RE } from '@/lib/validators/vendor-kyc';
import { resolveVendorTypeSlug, getEffectiveVendorTypeSelections } from '@/lib/validators/vendor-profile';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';
import { assertVerificationToken } from '@/lib/otpVerification';
import { normalizePhone, phoneLookupVariants } from '@/lib/phone';
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
  verificationToken: z.string().min(1).optional(),

  // Step 2 — vendor type (CSV-aligned + legacy slugs)
  vendorType: z.string().min(1).max(50).optional(),
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
  tradeName: z.string().min(2).max(255).optional().or(z.literal('')),
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

  const phone = normalizePhone(parsed.phone) ?? '';
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
    if (ownerEmail && !EMAIL_RE.test(ownerEmail)) {
      throw Errors.badRequest('Invalid email address');
    }
  }
  if (!PHONE_RE.test(authPhone)) {
    throw Errors.badRequest('Enter a valid 10-digit store contact mobile number');
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
    // Storefront/trade name is store-level — default silently to legal business name
    tradeName: (parsed.tradeName || '').trim() || parsed.businessName.trim(),
    vendorTypeSelections: selections as VendorTypeSelection[],
    vendorBusinessType: legacy?.vendorBusinessType ?? parsed.vendorBusinessType,
    vendorType: legacy?.vendorType ?? parsed.vendorType,
    subType: legacy?.subType ?? parsed.subType,
    verificationToken: parsed.verificationToken,
    relaxed,
  };
}

async function postHandler(req: NextRequest) {
  try {
    const input = parseBody(await req.json());
    const phone = input.phone || null;
    const email = input.email;
    const verifyEmail = input.verifiedEmail;

    await assertVerificationToken(input.verificationToken, {
      phone,
      email: verifyEmail,
    });

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          ...(phone ? [{ phone: { in: phoneLookupVariants(phone) } }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, phone: true, email: true },
    });
    if (existing) {
      const phoneHit = phone && phoneLookupVariants(existing.phone).includes(phone);
      throw Errors.duplicate(phoneHit ? 'Phone' : 'Email');
    }

    const hashedPassword = input.password ? await bcrypt.hash(input.password, 12) : null;
    const hcidDisplay = await uniqueHcid();

    const typeSlug = resolveVendorTypeSlug({
      vendorBusinessType: input.vendorBusinessType,
      vendorType: input.vendorType,
    }) ?? input.vendorType ?? input.vendorTypeSelections[0]?.slug ?? 'distributor';

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

      const provisioned = await provisionBusinessProfile({
        userId: user.id,
        kind: 'vendor',
        isPrimaryMembership: true,
        legalName: input.businessName,
        displayName: input.tradeName || input.businessName,
        gstin: input.gstNumber || null,
        pan: input.panNumber || null,
        businessType: input.vendorBusinessType || input.vendorType || 'vendor',
        subType: input.subType || null,
        businessSize: input.businessSize || null,
        salutation: input.salutation || null,
        firstName: input.firstName || null,
        lastName: input.lastName || null,
        designation: input.designation || null,
        vendorTypeSelections: input.vendorTypeSelections as unknown as Prisma.InputJsonValue,
        billingAddressLine: input.billingAddress.addressLine,
        billingCity: input.billingAddress.city,
        billingState: input.billingAddress.state,
        billingPincode: input.billingAddress.pincode,
        primaryOutlet: {
          name: input.tradeName,
          addressLine: input.pickupAddress.addressLine,
          city: input.pickupAddress.city,
          state: input.pickupAddress.state,
          pincode: input.pickupAddress.pincode,
        },
        vendorDetails: {
          vendorType: typeSlug,
          panNumber: input.panNumber || '',
          authorizedPersonName: input.authorizedPersonName,
          authorizedPersonPhone: input.authorizedPersonPhone || '',
          authorizedPersonEmail: input.authorizedPersonEmail || email || '',
          billingAddress: input.billingAddress,
          bankAccountName: input.bankAccountName,
          bankAccountNumber: input.bankAccountNumber,
          bankIfsc: input.bankIfsc,
          bankName: input.bankName,
          bankAccountType: input.bankAccountType,
          serviceablePincodes: input.serviceablePincodes,
          deliveryCapability: input.deliveryCapability,
          fssaiNumber: input.fssaiNumber || '',
          udyamNumber: input.udyamNumber || '',
          cinNumber: input.cinNumber || '',
          subType: input.subType,
          vendorTypeSelections: input.vendorTypeSelections,
          categoriesHandled: input.categoriesHandled,
          businessSize: input.businessSize,
          coverage: input.coverage,
          warehouseCount: input.warehouseCount,
          deliveryFleet: input.deliveryFleet,
          monthlySupplyBand: input.monthlySupplyBand,
        },
      }, tx);

      return { user, vendorId: provisioned.vendorId, nextPath: provisioned.nextPath };
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
          vendorId: result.vendorId,
          hcidDisplay: result.user.hcidDisplay,
          nextPath: result.nextPath,
          message: 'Supplier application submitted. Our team will review and contact you shortly.',
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}

export const POST = withRateLimit(postHandler, 'auth');
