import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/events/emitter';
import type { Role } from '@prisma/client';
import { Errors } from '@/middleware/errorHandler';
import { provisionDefaultAccount } from '@/lib/provisionAccount';
import { uniqueHcid } from '@/lib/hcid';
import { normalizePhone, phoneLookupVariants } from '@/lib/phone';

interface SignupInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role?: Role;
  pincode?: string;
  businessName?: string;
  gstNumber?: string;
  referralToken?: string;
}

export class AuthService {
  async signup(input: SignupInput) {
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);
  if (input.phone && !phone) throw Errors.badRequest('Invalid phone number');

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        ...(phone ? [{ phone: { in: phoneLookupVariants(phone) } }] : []),
      ],
    },
  });

  if (existing) {
    const field = existing.email === email ? 'email' : 'phone';
    throw Errors.fieldError(
      field,
      `${field === 'email' ? 'Email' : 'Phone'} already exists`,
      409,
    );
  }

  const hashedPassword = await bcrypt.hash(input.password, 12);
  const hcidDisplay = await uniqueHcid();

  // All users start as 'customer' — vendors get promoted after admin approval
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
        fullName: input.fullName,
        phone,
        role: 'customer',
        pincode: input.pincode,
        businessName: input.businessName,
        gstNumber: input.gstNumber,
        hcidDisplay,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phone: true,
        pincode: true,
        businessName: true,
      },
    });

    // V2.2: every new user gets a BusinessAccount + primary Outlet + Owner role.
    // For vendor applicants we also create the legacy Vendor row and link it.
    const kind: 'customer' | 'vendor' | 'brand' = input.role === 'vendor' ? 'vendor' : input.role === 'brand' ? 'brand' : 'customer';
    const provision = await provisionDefaultAccount({
      userId: user.id,
      kind,
      businessName: input.businessName,
      fullName: input.fullName,
      gstNumber: input.gstNumber,
    });

    if (input.role === 'vendor') {
      const businessName = input.businessName || input.fullName;
      const slug = businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        + '-' + user.id.slice(0, 8);

      await prisma.vendor.create({
        data: {
          userId: user.id,
          businessAccountId: provision.businessAccountId,
          businessName,
          slug,
          isVerified: false,
          isActive: false,
        },
      });
    }

    emitEvent('UserRegistered', {
      userId: user.id,
      email: user.email ?? '',
      role: input.role || 'customer',
      referralToken: input.referralToken,
    });

    // Promo program side-effects must not rely solely on the in-process event bus:
    // Turbopack/HMR can briefly leave UserRegistered with 0 listeners. Issuance is
    // idempotent (welcome grant unique; referral attribute no-ops if already set).
    try {
      const { promotionService } = await import('@/modules/promotion/promotion.service');
      await promotionService.issueWelcomeForUser(user.id).catch(() => {});
      if (input.referralToken) {
        await promotionService
          .attributeReferralOnSignup({ referredUserId: user.id, token: input.referralToken })
          .catch(() => {});
      }
    } catch {
      /* listener path may still succeed */
    }

    return user;
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        pincode: true,
        businessName: true,
        gstNumber: true,
        image: true,
        hcidDisplay: true,
        createdAt: true,
        accountMemberships: {
          select: {
            isPrimary: true,
            businessAccount: {
              select: { id: true, legalName: true, displayName: true, isCustomer: true, isVendor: true, isBrand: true },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!user) throw Errors.notFound('User');
    return user;
  }

  async updateProfile(
    userId: string,
    data: Partial<{
      fullName: string;
      phone: string;
      pincode: string;
      businessName: string;
      gstNumber: string;
      image: string;
    }>
  ) {
    if (data.phone !== undefined) {
      const phone = normalizePhone(data.phone);
      if (!phone) throw Errors.badRequest('Invalid phone number');

      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true },
      });
      if (!current) throw Errors.notFound('User');

      // Treat legacy "+91…" / "91…" rows as the same number as bare 10-digit.
      const phoneChanged = !phoneLookupVariants(current.phone).includes(phone);

      if (phoneChanged) {
        const taken = await prisma.user.findFirst({
          where: {
            id: { not: userId },
            phone: { in: phoneLookupVariants(phone) },
          },
          select: { id: true },
        });
        if (taken) {
          throw Errors.fieldError('phone', 'Phone already exists', 409);
        }

        // Same trust window as vendor/brand onboarding: a used OTP within 30 min.
        const verifiedOtp = await prisma.otpCode.findFirst({
          where: {
            phone,
            used: true,
            createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (!verifiedOtp) {
          throw Errors.badRequest(
            'Phone number is not verified. Please verify your number first.',
          );
        }
      }

      data = { ...data, phone };
    }
    return prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        pincode: true,
        businessName: true,
        gstNumber: true,
        image: true,
      },
    });
  }
}
