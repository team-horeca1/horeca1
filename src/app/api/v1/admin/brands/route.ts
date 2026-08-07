// GET  /api/v1/admin/brands — List all brands (admin)
// POST /api/v1/admin/brands — Admin creates a brand directly (auto-approved)

import { NextRequest, NextResponse } from 'next/server';
import { BrandService } from '@/modules/brand/brand.service';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { prisma } from '@/lib/prisma';
import { validateBrandProfile, BrandProfileSchema, derivedFullName, primaryPhoneDigits } from '@/lib/validators/brand-profile';
import { stripNulls } from '@/lib/stripNulls';
import {
  mapToBusinessAccount,
  mapToBrandFields,
} from '@/lib/brandProfileMapper';
import type { AuthContext } from '@/middleware/auth';
import {
  BRAND_LIST_SELECT,
  provisionBrandOwner,
  slugifyBrandName,
} from '@/modules/brand/brand.provisioning';

const brandService = new BrandService();

export const GET = adminOnly(async (req: NextRequest, ctx: AuthContext) => {
  requirePermission(ctx, 'brands.view');
  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  const brands = await brandService.adminListBrands(status);
  return NextResponse.json({ success: true, data: brands });
});

export const POST = adminOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'brands.create');

    const body = await req.json();

    // Quick create — brand name only (for catalog listing before storefront setup).
    if (body.quickCreate === true) {
      const name = String(body.name ?? '').trim();
      if (!name) throw Errors.badRequest('Brand name is required');

      const slug = slugifyBrandName(name);
      const slugExists = await prisma.brand.findUnique({ where: { slug }, select: { id: true } });
      if (slugExists) {
        throw Errors.fieldError('name', 'A brand with this name already exists', 409);
      }

      const emailBase = slug.replace(/-/g, '') || 'brand';
      const email = `${emailBase}.${Date.now()}@brand.internal.horeca1`;
      const password = String(body.password ?? `Hc1-${Math.random().toString(36).slice(2, 10)}!`);
      if (password.length < 6) throw Errors.badRequest('Password must be at least 6 characters');

      const result = await prisma.$transaction(async (tx) => {
        const { userId, businessAccountId } = await provisionBrandOwner(
          tx,
          { fullName: name, email, password, businessName: name },
          { legalName: name },
        );

        return tx.brand.create({
          data: {
            userId,
            businessAccountId,
            slug,
            name,
            approvalStatus: 'approved',
            isActive: true,
          },
          select: BRAND_LIST_SELECT,
        });
      });

      return NextResponse.json({ success: true, data: result }, { status: 201 });
    }

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
    const displayName = brandFields.name ?? 'Brand';

    if (email) {
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) throw Errors.fieldError('email', 'Email already in use', 409);
    }
    if (phone) {
      const phoneOwner = await prisma.user.findFirst({ where: { phone }, select: { id: true } });
      if (phoneOwner) throw Errors.fieldError('phone', 'Phone number already in use', 409);
    }

    const slug = slugifyBrandName(displayName);
    const slugExists = await prisma.brand.findUnique({ where: { slug }, select: { id: true } });
    if (slugExists) {
      throw Errors.fieldError('legalName', 'A brand with this name already exists', 409);
    }

    const baData = mapToBusinessAccount(input) as Record<string, unknown>;

    const result = await prisma.$transaction(async (tx) => {
      const { userId, businessAccountId } = await provisionBrandOwner(
        tx,
        {
          fullName,
          email,
          password,
          businessName: brandFields.name as string | undefined,
          gstNumber: (baData.gstin as string | null) ?? null,
          phone: phone ?? (baData.mobilePhone as string | null) ?? null,
        },
        baData,
      );

      return tx.brand.create({
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

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
