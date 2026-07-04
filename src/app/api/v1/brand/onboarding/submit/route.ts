// POST /api/v1/brand/onboarding/submit
// Final submit for /brand/register. Creates User + BusinessAccount + Outlet + Brand
// with approvalStatus=pending — admin approves at /admin/brands.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { withRateLimit } from '@/middleware/withRateLimit';
import { uniqueHcid } from '@/lib/hcid';
import { emitEvent } from '@/events/emitter';
import { BrandProfileSchema, validateBrandProfile, derivedLegalName } from '@/lib/validators/brand-profile';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';
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
});

function slugify(name: string, suffix: string): string {
  const base = name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${base || 'brand'}-${suffix.slice(0, 8)}`;
}

function parseBody(raw: unknown) {
  const relaxed = isRegisterEmailOtpEnabled();
  const parsed = BodyBase.parse(raw);

  const phoneRaw = (parsed.phone ?? '').replace(/\D/g, '');
  const phone = phoneRaw.length === 12 ? phoneRaw.replace(/^91/, '') : phoneRaw;
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
    if (!hasPhone && (!parsed.password || parsed.password.length < 6)) {
      throw Errors.badRequest('Password is required when registering with email only');
    }
  }

  return {
    ...parsed,
    phone: PHONE_RE.test(phone) ? phone : '',
    email: ownerEmail || null,
    verifiedEmail: verifiedEmail || ownerEmail || null,
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

    const brandAdminTemplate = await prisma.accountRole.findFirst({
      where: { businessAccountId: null, isTemplate: true, name: 'Brand Admin', scope: 'brand' },
      select: { id: true },
    });
    if (!brandAdminTemplate) {
      throw Errors.badRequest('Brand Admin role template missing. Run seed migration.');
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

      const account = await tx.businessAccount.create({
        data: {
          legalName: derivedLegalName({ ...input, email: input.email ?? undefined }) || brandName,
          ...(baData as object),
          isCustomer: false,
          isVendor: false,
          isBrand: true,
          status: 'active',
        },
      });

      const addressLine = (baData as { billingAddressLine?: string | null }).billingAddressLine;
      const outlet = await tx.outlet.create({
        data: {
          businessAccountId: account.id,
          name: `${brandName} HQ`,
          addressLine: addressLine || 'Address pending — complete in brand settings',
          city: (baData as { billingCity?: string | null }).billingCity ?? null,
          state: (baData as { billingState?: string | null }).billingState ?? null,
          pincode: (baData as { billingPincode?: string | null }).billingPincode ?? null,
          requiresAddressUpdate: !addressLine,
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
        data: { userId: user.id, businessAccountId: account.id, outletId: null, roleId: brandAdminTemplate.id },
      });

      const existingBrand = await tx.brand.findFirst({
        where: { name: { equals: brandName, mode: 'insensitive' } },
        select: { id: true, userId: true, slug: true },
      });
      if (existingBrand?.userId) {
        throw Errors.conflict('A brand with this name already exists.');
      }

      let brand: { id: string; slug: string };
      if (existingBrand) {
        brand = await tx.brand.update({
          where: { id: existingBrand.id },
          data: {
            userId: user.id,
            businessAccountId: account.id,
            approvalStatus: 'pending',
            isActive: false,
            ...brandFields,
          },
          select: { id: true, slug: true },
        });
      } else {
        const slug = slugify(brandName, user.id);
        const slugTaken = await tx.brand.findUnique({ where: { slug }, select: { id: true } });
        if (slugTaken) {
          throw Errors.conflict('A brand with this name already exists.');
        }
        brand = await tx.brand.create({
          data: {
            userId: user.id,
            businessAccountId: account.id,
            slug,
            approvalStatus: 'pending',
            isActive: false,
            ...brandFields,
          },
          select: { id: true, slug: true },
        });
      }

      return { user, brand };
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
          brandId: result.brand.id,
          hcidDisplay: result.user.hcidDisplay,
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
