/**
 * POST /api/v1/account/[id]/become-vendor
 *
 * Upgrade an existing customer-only BusinessAccount so it can also operate
 * as a vendor. Per the V2.2 model, vendor + customer are flags on the same
 * BusinessAccount, so this is just:
 *   - flip BusinessAccount.isVendor = true
 *   - create the Vendor extension row (pending admin approval)
 *   - assign the caller the Vendor Admin role on this account
 *   - update User.role to 'vendor' (legacy field still consumed by old code)
 *
 * The created Vendor row starts isVerified=false, isActive=false — admin
 * approves at /admin/vendors/[id]. The existing VendorApplicationBanner
 * picks up the pending status automatically.
 *
 * Requires settings.edit on the target account.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { assertAccountPermission } from '@/lib/accountAccess';

const Body = z.object({
  businessName: z.string().min(2).max(255),
  description: z.string().max(2000).optional(),
  gstNumber: z.string().max(20).optional(),
  minOrderValue: z.number().min(0).optional(),
  logoUrl: z.string().url().optional(),
});

function slugify(name: string, userId: string): string {
  const base = name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${base || 'vendor'}-${userId.slice(0, 8)}`;
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const segments = new URL(req.url).pathname.split('/').filter(Boolean);
    // .../account/<id>/become-vendor
    const accountId = segments[segments.length - 2];

    await assertAccountPermission(ctx.userId, accountId, 'settings.edit', ctx.activeOutletId);

    const body = Body.parse(await req.json());

    // One Business may have multiple Online Stores — but become-vendor only
    // creates the first store when none exist yet.
    const existingForAccount = await prisma.vendor.findFirst({
      where: { businessAccountId: accountId },
      select: { id: true },
    });
    if (existingForAccount) {
      throw Errors.conflict('This Business already has an Online Store. Add another from Businesses → Online Stores.');
    }

    // Confirm slug is free (extremely unlikely collision, but cheap to check).
    const slug = slugify(body.businessName, ctx.userId);
    const slugTaken = await prisma.vendor.findUnique({ where: { slug }, select: { id: true } });
    if (slugTaken) {
      throw Errors.fieldError('businessName', 'A vendor with this business name already exists. Try a different name.', 409);
    }

    // Confirm the account isn't already a vendor account (defensive — shouldn't happen if no Vendor row).
    const account = await prisma.businessAccount.findUnique({
      where: { id: accountId },
      select: { id: true, isVendor: true, legalName: true },
    });
    if (!account) throw Errors.notFound('BusinessAccount');
    if (account.isVendor) throw Errors.conflict('This account is already marked as a vendor');

    // Look up the seeded Vendor Admin template so we can grant it to the caller.
    const vendorAdminTemplate = await prisma.accountRole.findFirst({
      where: { businessAccountId: null, isTemplate: true, name: 'Vendor Admin', scope: 'vendor' },
      select: { id: true },
    });
    if (!vendorAdminTemplate) {
      throw Errors.badRequest('Vendor Admin role template missing. Run prisma/migrations/.../data_migrate.ts first.');
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Flip the flag on the BusinessAccount.
      await tx.businessAccount.update({
        where: { id: accountId },
        data: { isVendor: true },
      });

      // 2. Create the Vendor extension row (pending admin approval).
      const vendor = await tx.vendor.create({
        data: {
          userId: ctx.userId,
          businessAccountId: accountId,
          businessName: body.businessName,
          displayName: body.businessName,
          slug,
          description: body.description ?? null,
          gstNumber: body.gstNumber ?? null,
          logoUrl: body.logoUrl ?? null,
          minOrderValue: body.minOrderValue ?? 0,
          isVerified: false,
          isActive: false,
          isPrimaryStore: true,
          multiWarehouseEnabled: false,
          setupProgress: { business: true, online_store: true },
        },
        select: { id: true, businessName: true, slug: true, isVerified: true, isActive: true },
      });

      const { ensureDefaultOutletForStore } = await import('@/modules/supplier/foundation.service');
      await ensureDefaultOutletForStore(tx, {
        businessAccountId: accountId,
        vendorId: vendor.id,
        name: body.businessName,
      });

      // 3. Grant the caller the Vendor Admin role (additive — they keep their existing Owner role too).
      const existingRole = await tx.userRole.findFirst({
        where: {
          userId: ctx.userId,
          businessAccountId: accountId,
          outletId: null,
          vendorId: null,
          roleId: vendorAdminTemplate.id,
        },
        select: { id: true },
      });
      if (!existingRole) {
        await tx.userRole.create({
          data: {
            userId: ctx.userId,
            businessAccountId: accountId,
            outletId: null,
            vendorId: null,
            roleId: vendorAdminTemplate.id,
          },
        });
      }

      // 4. Update legacy User.role so the existing 49 routes that gate on `role === 'vendor'` start working.
      await tx.user.update({
        where: { id: ctx.userId },
        data: { role: 'vendor' },
      });

      return vendor;
    });

    return NextResponse.json({
      success: true,
      data: {
        vendor: result,
        message: 'Vendor application submitted. Admin will review shortly.',
      },
    }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
});
