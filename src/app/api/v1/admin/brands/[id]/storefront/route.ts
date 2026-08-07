// POST /api/v1/admin/brands/[id]/storefront
// Upgrade a name-only / placeholder brand into a full storefront with a real owner login.

import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { prisma } from '@/lib/prisma';
import {
  validateBrandProfile,
  BrandProfileSchema,
  derivedFullName,
  primaryPhoneDigits,
} from '@/lib/validators/brand-profile';
import { stripNulls } from '@/lib/stripNulls';
import {
  mapToBusinessAccount,
  mapToBrandFields,
} from '@/lib/brandProfileMapper';
import type { AuthContext } from '@/middleware/auth';
import {
  BRAND_LIST_SELECT,
  isPlaceholderBrandEmail,
  provisionBrandOwner,
  slugifyBrandName,
  upgradePlaceholderBrandOwner,
} from '@/modules/brand/brand.provisioning';

export const POST = adminOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'brands.edit');

    const parts = req.nextUrl.pathname.split('/');
    // .../admin/brands/[id]/storefront
    const storefrontIdx = parts.lastIndexOf('storefront');
    const id = storefrontIdx > 0 ? parts[storefrontIdx - 1] : parts.at(-1)!;

    const brand = await prisma.brand.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        userId: true,
        businessAccountId: true,
        user: { select: { id: true, email: true } },
      },
    });
    if (!brand) throw Errors.notFound('Brand not found');

    const hasRealOwner =
      !!brand.user && !isPlaceholderBrandEmail(brand.user.email);
    if (hasRealOwner) {
      throw Errors.badRequest('This brand already has a storefront with a linked owner account.');
    }

    const body = await req.json();
    const input = BrandProfileSchema.passthrough().parse(stripNulls(body as Record<string, unknown>));

    const validation = validateBrandProfile(
      { ...input, password: body.password },
      'adminCreate',
    );
    if (!validation.success) {
      throw Errors.badRequest(validation.message ?? 'Invalid brand profile');
    }

    const emailRaw = String(body.email ?? input.email ?? '').trim().toLowerCase();
    const email = emailRaw || null;
    const phoneDigits = primaryPhoneDigits(input);
    const phone = phoneDigits.length === 10 ? phoneDigits : null;
    const password = String(body.password ?? '').trim();
    const fullName = String(body.fullName ?? derivedFullName(input)).trim();

    if (password.length < 6) throw Errors.badRequest('Password must be at least 6 characters');

    const brandFields = mapToBrandFields(input);
    const displayName = (brandFields.name as string | undefined) ?? brand.name;
    const slug = slugifyBrandName(displayName);

    if (email) {
      const emailOwner = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (emailOwner && emailOwner.id !== brand.userId) {
        throw Errors.fieldError('email', 'Email already in use', 409);
      }
    }
    if (phone) {
      const phoneOwner = await prisma.user.findFirst({ where: { phone }, select: { id: true } });
      if (phoneOwner && phoneOwner.id !== brand.userId) {
        throw Errors.fieldError('phone', 'Phone number already in use', 409);
      }
    }

    const slugOwner = await prisma.brand.findUnique({ where: { slug }, select: { id: true } });
    if (slugOwner && slugOwner.id !== brand.id) {
      throw Errors.fieldError('legalName', 'A brand with this name already exists', 409);
    }

    const baData = mapToBusinessAccount(input) as Record<string, unknown>;
    const ownerPhone = phone ?? (baData.mobilePhone as string | null) ?? null;

    const result = await prisma.$transaction(async (tx) => {
      let userId: string;
      let businessAccountId: string;

      if (!brand.userId) {
        // Label-only brand — provision a brand-new owner account.
        const provisioned = await provisionBrandOwner(
          tx,
          {
            fullName,
            email,
            password,
            businessName: displayName,
            gstNumber: (baData.gstin as string | null) ?? null,
            phone: ownerPhone,
          },
          baData,
        );
        userId = provisioned.userId;
        businessAccountId = provisioned.businessAccountId;
      } else {
        // Placeholder internal account — upgrade in place.
        const upgraded = await upgradePlaceholderBrandOwner(tx, {
          userId: brand.userId,
          businessAccountId: brand.businessAccountId,
          owner: {
            fullName,
            email,
            password,
            businessName: displayName,
            gstNumber: (baData.gstin as string | null) ?? null,
            phone: ownerPhone,
          },
          baData,
        });
        userId = upgraded.userId;
        businessAccountId = upgraded.businessAccountId;
      }

      return tx.brand.update({
        where: { id: brand.id },
        data: {
          userId,
          businessAccountId,
          slug,
          ...brandFields,
          approvalStatus: 'approved',
          isActive: true,
        },
        select: BRAND_LIST_SELECT,
      });
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});
