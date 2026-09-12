// POST /api/v1/brand/onboarding/submit
// Final submit for /brand/register. Creates User + BusinessAccount + Outlet + Brand
// with approvalStatus=pending — admin approves at /admin/brands.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { provisionBusinessProfile } from '@/modules/account/provisionBusinessProfile';
import { withRateLimit } from '@/middleware/withRateLimit';
import { uniqueHcid } from '@/lib/hcid';
import { emitEvent } from '@/events/emitter';
import { BrandProfileSchema, validateBrandProfile, derivedLegalName } from '@/lib/validators/brand-profile';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';
import { stripNulls } from '@/lib/stripNulls';
import { assertVerificationToken } from '@/lib/otpVerification';
import { normalizePhone, phoneLookupVariants } from '@/lib/phone';
import {
  mapToBusinessAccount,
  mapToBrandFields,
} from '@/lib/brandProfileMapper';

const PHONE_RE = /^\d{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BodyBase = BrandProfileSchema.extend({
  phone: z.string().optional().or(z.literal('')),
  verifiedEmail: z.string().optional().or(z.literal('')),
  password: z.string().min(6).optional().or(z.literal('')),
  verificationToken: z.string().min(1).optional(),
});

function parseBody(raw: unknown) {
  const relaxed = isRegisterEmailOtpEnabled();
  const parsed = BodyBase.parse(stripNulls((raw ?? {}) as Record<string, unknown>));

  const phone = normalizePhone(parsed.phone) ?? '';
  const verifiedEmail = (parsed.verifiedEmail || parsed.email || '').trim().toLowerCase();
  const ownerEmail = (parsed.email || verifiedEmail).trim().toLowerCase();

  if (!relaxed) {
    if (!PHONE_RE.test(phone)) throw Errors.badRequest('Invalid phone number');
  } else {
    const hasPhone = PHONE_RE.test(phone);
    const hasEmail = !!ownerEmail && EMAIL_RE.test(ownerEmail);
    if (!hasPhone && !hasEmail) {
      throw Errors.badRequest('Provide a verified mobile number or email address');
    }
    if (phone && !PHONE_RE.test(phone)) throw Errors.badRequest('Invalid phone number');
    if (ownerEmail && !EMAIL_RE.test(ownerEmail)) throw Errors.badRequest('Invalid email address');
    // Email-only path: login identity must match the OTP-verified address.
    // Prevents verifying A then swapping Primary Contact email to unverified B.
    if (!hasPhone) {
      const otpEmail = (parsed.verifiedEmail || '').trim().toLowerCase();
      if (!otpEmail || !EMAIL_RE.test(otpEmail)) {
        throw Errors.badRequest('Email is not verified. Please verify your email first.');
      }
      if (ownerEmail !== otpEmail) {
        throw Errors.badRequest('Email must match the address you verified with OTP.');
      }
    }
    if (!parsed.password || parsed.password.length < 6) {
      throw Errors.badRequest('Password is required');
    }
  }

  return {
    ...parsed,
    phone: PHONE_RE.test(phone) ? phone : '',
    email: ownerEmail || null,
    verifiedEmail: verifiedEmail || ownerEmail || null,
    verificationToken: parsed.verificationToken,
    relaxed,
  };
}

async function postHandler(req: NextRequest) {
  try {
    const input = parseBody(await req.json());

    const validation = validateBrandProfile(
      { ...input, email: input.email ?? undefined },
      'publicRegister',
    );
    if (!validation.success) {
      throw Errors.badRequest(validation.message ?? 'Invalid brand profile');
    }

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
    const brandFields = mapToBrandFields({ ...input, email: input.email ?? undefined });
    const brandName = brandFields.name as string;
    const baData = mapToBusinessAccount({ ...input, email: input.email ?? undefined });

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          phone: phone || null,
          email,
          password: hashedPassword,
          fullName: input.fullName ?? ([input.firstName, input.lastName].filter(Boolean).join(' ') || phone || email || 'Brand User'),
          businessName: brandName,
          role: 'brand',
          hcidDisplay,
          gstNumber: input.gstin || null,
          pincode: input.pincode || input.billingPincode || null,
        },
        select: { id: true, hcidDisplay: true },
      });

      const addressLine = (baData as { billingAddressLine?: string | null }).billingAddressLine
        || input.addressLine
        || 'Address pending — complete in brand settings';

      const provisioned = await provisionBusinessProfile({
        userId: user.id,
        kind: 'brand',
        isPrimaryMembership: true,
        legalName: derivedLegalName({ ...input, email: input.email ?? undefined }) || brandName,
        displayName: brandName,
        gstin: input.gstin || null,
        pan: null,
        businessType: input.brandType || null,
        subType: input.subType || null,
        billingAddressLine: (baData as { billingAddressLine?: string | null }).billingAddressLine ?? null,
        billingCity: (baData as { billingCity?: string | null }).billingCity ?? null,
        billingState: (baData as { billingState?: string | null }).billingState ?? null,
        billingPincode: (baData as { billingPincode?: string | null }).billingPincode ?? null,
        primaryOutlet: {
          name: `${brandName} HQ`,
          addressLine,
          city: (baData as { billingCity?: string | null }).billingCity ?? undefined,
          state: (baData as { billingState?: string | null }).billingState ?? undefined,
          pincode: (baData as { billingPincode?: string | null }).billingPincode ?? undefined,
        },
        brand: {
          productCategories: input.productCategories,
          businessSize: input.businessSize,
          distributionPresence: input.distributionPresence,
          targetSegments: input.targetSegments,
          horecaFocused: input.horecaFocused === true || input.horecaFocused === 'true',
          retailFocused: input.retailFocused === true || input.retailFocused === 'true',
          website: input.website,
          tagline: input.tagline,
          description: input.description,
        },
      }, tx);

      return { user, brandId: provisioned.brandId, nextPath: provisioned.nextPath };
    });

    emitEvent('UserRegistered', {
      userId: result.user.id,
      email: email ?? '',
      role: 'brand',
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          brandId: result.brandId,
          hcidDisplay: result.user.hcidDisplay,
          nextPath: result.nextPath,
          message: 'Brand application submitted. Our team will review and contact you shortly.',
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}

export const POST = withRateLimit(postHandler, 'auth');
