// GET  /api/v1/admin/brands — List all brands (admin)
// POST /api/v1/admin/brands — Admin creates a brand directly (auto-approved)

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { BrandService } from '@/modules/brand/brand.service';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { prisma } from '@/lib/prisma';
import { uniqueHcid } from '@/lib/hcid';
import { validateBrandProfile, BrandProfileSchema, derivedFullName } from '@/lib/validators/brand-profile';
import {
  mapToBusinessAccount,
  mapToBrandFields,
} from '@/lib/brandProfileMapper';
import type { AuthContext } from '@/middleware/auth';

const brandService = new BrandService();

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

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

      const slug = slugify(name);
      const slugExists = await prisma.brand.findUnique({ where: { slug }, select: { id: true } });
      if (slugExists) {
        throw Errors.fieldError('name', 'A brand with this name already exists', 409);
      }

      const emailBase = slug.replace(/-/g, '') || 'brand';
      const email = `${emailBase}.${Date.now()}@brand.internal.horeca1`;
      const password = String(body.password ?? `Hc1-${Math.random().toString(36).slice(2, 10)}!`);
      if (password.length < 6) throw Errors.badRequest('Password must be at least 6 characters');

      const hashedPassword = await bcrypt.hash(password, 12);
      const hcidDisplay = await uniqueHcid();

      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            fullName: name,
            email,
            password: hashedPassword,
            role: 'brand',
            isActive: true,
            hcidDisplay,
            businessName: name,
          },
        });

        const account = await tx.businessAccount.create({
          data: {
            legalName: name,
            isCustomer: false,
            isVendor: false,
            isBrand: true,
            status: 'active',
          },
        });

        await tx.businessAccountMember.create({
          data: { userId: user.id, businessAccountId: account.id, isPrimary: true, acceptedAt: new Date() },
        });

        const brandAdminTemplate = await tx.accountRole.findFirst({
          where: { businessAccountId: null, isTemplate: true, name: 'Brand Admin', scope: 'brand' },
          select: { id: true },
        });
        if (!brandAdminTemplate) throw Errors.badRequest('Brand Admin role template missing. Run seed migration.');

        await tx.userRole.create({
          data: { userId: user.id, businessAccountId: account.id, outletId: null, roleId: brandAdminTemplate.id },
        });

        return tx.brand.create({
          data: {
            userId: user.id,
            businessAccountId: account.id,
            slug,
            name,
            approvalStatus: 'approved',
            isActive: true,
          },
          select: { id: true, name: true, slug: true, logoUrl: true, approvalStatus: true, isActive: true, createdAt: true, user: { select: { id: true, fullName: true, email: true } } },
        });
      });

      return NextResponse.json({ success: true, data: result }, { status: 201 });
    }

    const input = BrandProfileSchema.passthrough().parse(body);

    const validation = validateBrandProfile(
      { ...input, password: body.password },
      'adminCreate',
    );
    if (!validation.success) {
      throw Errors.badRequest(validation.message ?? 'Invalid brand profile');
    }

    const email = String(body.email ?? input.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '').trim();
    const fullName = String(body.fullName ?? derivedFullName(input)).trim();

    if (!email) throw Errors.badRequest('Email is required');
    if (password.length < 6) throw Errors.badRequest('Password must be at least 6 characters');

    const brandFields = mapToBrandFields(input);
    const displayName = brandFields.name ?? 'Brand';

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw Errors.fieldError('email', 'Email already in use', 409);

    const slug = slugify(displayName);
    const slugExists = await prisma.brand.findUnique({ where: { slug }, select: { id: true } });
    if (slugExists) {
      throw Errors.fieldError('legalName', 'A brand with this name already exists', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const hcidDisplay = await uniqueHcid();
    const baData = mapToBusinessAccount(input) as Record<string, unknown>;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName,
          email,
          password: hashedPassword,
          role: 'brand',
          isActive: true,
          hcidDisplay,
          businessName: brandFields.name,
          gstNumber: (baData.gstin as string | null) ?? null,
          phone: (baData.mobilePhone as string | null) ?? null,
        },
      });

      const account = await tx.businessAccount.create({
        data: {
          ...(baData as object),
          legalName: (baData.legalName as string) || displayName,
          isCustomer: false,
          isVendor: false,
          isBrand: true,
          status: 'active',
        },
      });

      await tx.businessAccountMember.create({
        data: { userId: user.id, businessAccountId: account.id, isPrimary: true, acceptedAt: new Date() },
      });

      const brandAdminTemplate = await tx.accountRole.findFirst({
        where: { businessAccountId: null, isTemplate: true, name: 'Brand Admin', scope: 'brand' },
        select: { id: true },
      });
      if (!brandAdminTemplate) throw Errors.badRequest('Brand Admin role template missing. Run seed migration.');

      await tx.userRole.create({
        data: { userId: user.id, businessAccountId: account.id, outletId: null, roleId: brandAdminTemplate.id },
      });

      const brand = await tx.brand.create({
        data: {
          userId: user.id,
          businessAccountId: account.id,
          slug,
          ...brandFields,
          approvalStatus: 'approved',
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          approvalStatus: true,
          isActive: true,
          createdAt: true,
          user: { select: { id: true, fullName: true, email: true } },
        },
      });
      return brand;
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
