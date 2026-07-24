/**
 * GET  /api/v1/account              — list every BusinessAccount the caller belongs to
 * POST /api/v1/account              — create a new BusinessAccount + primary Outlet + owner role
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import {
  vendorDetailsSchema,
  PrimaryOutletSchema,
  GST_RE,
  PAN_RE,
} from '@/lib/validators/vendor-kyc';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';
import {
  normalizeVendorTypeSelections,
  legacyScalarsFromSelections,
} from '@/lib/constants/vendorProfile';
import type { Prisma } from '@prisma/client';
import { hasUsableDeliveryLocation } from '@/lib/addressUsability';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';
import { softDeactivateDuplicateActiveOutlets } from '@/lib/outletWrites';
import { businessFacingName, storeDisplayName } from '@/modules/supplier/foundation.service';

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const targetUserId = effectiveCustomerUserId(ctx);
    const impersonatedBaId = ctx.impersonatedCustomer?.businessAccountId;

    const membershipWhere = {
      userId: targetUserId,
      ...(impersonatedBaId ? { businessAccountId: impersonatedBaId } : {}),
    };

    // Collapse multi-click same-location clones before listing so the navbar
    // "Select Outlet" dropdown never floods with soft-deleted / duplicate rows.
    const baIds = await prisma.businessAccountMember.findMany({
      where: membershipWhere,
      select: { businessAccountId: true },
      distinct: ['businessAccountId'],
    });
    await Promise.all(
      baIds.map((m) => softDeactivateDuplicateActiveOutlets(m.businessAccountId).catch(() => 0)),
    );

    const memberships = await prisma.businessAccountMember.findMany({
      where: membershipWhere,
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: {
        isPrimary: true,
        createdAt: true,
        businessAccount: {
          select: {
            id: true, legalName: true, displayName: true, gstin: true, pan: true,
            fssaiNumber: true, billingAddressLine: true, billingCity: true,
            billingState: true, billingPincode: true, businessType: true,
            isCustomer: true, isVendor: true, isBrand: true, status: true,
            primaryOutletId: true,
            vendors: {
              select: { businessName: true, displayName: true },
            },
            outlets: {
              where: { isActive: true },
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                name: true,
                pincode: true,
                latitude: true,
                longitude: true,
                requiresAddressUpdate: true,
              },
            },
          },
        },
      },
    });
    return NextResponse.json({
      success: true,
      data: memberships.map((m) => {
        const { vendors, ...ba } = m.businessAccount;
        const storeNames = vendors.map((v) => storeDisplayName(v));
        const facingName = businessFacingName(ba, storeNames);
        return {
          ...ba,
          displayName: facingName,
          outlets: ba.outlets.map((o) => ({
            id: o.id,
            name: o.name,
            pincode: o.pincode,
            requiresAddressUpdate: !hasUsableDeliveryLocation(o),
          })),
          isPrimary: m.isPrimary,
          joinedAt: m.createdAt,
        };
      }),
    });
  } catch (err) {
    return errorResponse(err);
  }
});

// All KYC validators live in src/lib/validators/vendor-kyc.ts so the
// admin-side create-vendor endpoint can re-use the exact same schemas.
function createAccountBodySchema(relaxedContact: boolean) {
  return z.object({
    legalName: z.string().min(2).max(255),
    displayName: z.string().max(255).optional(),
    gstin: z.string().regex(GST_RE, 'Invalid GSTIN format').optional().or(z.literal('')),
    pan: z.string().regex(PAN_RE, 'Invalid PAN format').optional().or(z.literal('')),
    fssaiNumber: z.string().max(50).optional().or(z.literal('')),
    gstTreatment: z.string().max(40).optional(),
    placeOfSupply: z.string().max(100).optional(),
    billingAddressLine: z.string().optional(),
    billingCity: z.string().optional(),
    billingState: z.string().optional(),
    billingPincode: z.string().optional(),
    businessType: z.string().max(50).optional(),
    subType: z.string().max(80).optional(),
    cuisine: z.string().max(120).optional(),
    salutation: z.string().max(20).optional(),
    firstName: z.string().max(120).optional(),
    lastName: z.string().max(120).optional(),
    designation: z.string().max(120).optional(),
    workPhone: z.string().max(20).optional(),
    isCustomer: z.boolean().optional().default(true),
    isVendor: z.boolean().optional().default(false),
    isBrand: z.boolean().optional().default(false),
    primaryOutlet: PrimaryOutletSchema,
    vendorDetails: vendorDetailsSchema(relaxedContact).optional(),
    // Brand profile (when isBrand)
    productCategories: z.array(z.string()).optional(),
    businessSize: z.string().max(50).optional(),
    distributionPresence: z.string().max(120).optional(),
    targetSegments: z.array(z.string()).optional(),
    horecaFocused: z.boolean().optional(),
    retailFocused: z.boolean().optional(),
    website: z.string().max(512).optional(),
    tagline: z.string().max(512).optional(),
    description: z.string().optional(),
  });
}

function slugify(name: string, userId: string): string {
  const base = name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${base || 'business'}-${userId.slice(0, 8)}`;
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const relaxedContact = isRegisterEmailOtpEnabled();
    const body = createAccountBodySchema(relaxedContact).parse(await req.json());

    // One Vendor / Brand row per BusinessAccount is still enforced
    // (Vendor.businessAccountId @unique), but a single User can now own many
    // Vendor / Brand rows — each in its own BusinessAccount — under the V2.2
    // HCID multi-account architecture. No duplicate check on userId.

    // Lookup the seeded templates we need up-front so the transaction can
    // fail fast if backfill hasn't run.
    const ownerTemplate = await prisma.accountRole.findFirst({
      where: { businessAccountId: null, isTemplate: true, name: 'Owner', scope: 'account' },
      select: { id: true },
    });
    if (!ownerTemplate) throw Errors.badRequest('Owner role template missing. Run data backfill first.');

    let vendorAdminTemplate: { id: string } | null = null;
    if (body.isVendor) {
      vendorAdminTemplate = await prisma.accountRole.findFirst({
        where: { businessAccountId: null, isTemplate: true, name: 'Vendor Admin', scope: 'vendor' },
        select: { id: true },
      });
      if (!vendorAdminTemplate) throw Errors.badRequest('Vendor Admin role template missing. Run data backfill first.');
    }

    let brandAdminTemplate: { id: string } | null = null;
    if (body.isBrand) {
      brandAdminTemplate = await prisma.accountRole.findFirst({
        where: { businessAccountId: null, isTemplate: true, name: 'Brand Admin', scope: 'brand' },
        select: { id: true },
      });
      if (!brandAdminTemplate) throw Errors.badRequest('Brand Admin role template missing. Run data backfill first.');
    }

    const result = await prisma.$transaction(async (tx) => {
      const billingLine = body.billingAddressLine || body.primaryOutlet.addressLine;
      const billingCity = body.billingCity || body.primaryOutlet.city;
      const billingState = body.billingState || body.primaryOutlet.state;
      const billingPincode = body.billingPincode || body.primaryOutlet.pincode;

      const account = await tx.businessAccount.create({
        data: {
          legalName: body.legalName,
          // Vendor register sends trade/store as displayName — keep that on the
          // Vendor row only. BusinessAccount display stays legal unless this is
          // a non-vendor BA create with an explicit business display name.
          displayName: body.isVendor
            ? body.legalName
            : (body.displayName?.trim() || body.legalName),
          companyName: body.legalName,
          gstin: body.gstin || null,
          pan: body.pan || null,
          fssaiNumber: body.fssaiNumber || null,
          gstTreatment: body.gstTreatment || null,
          placeOfSupply: body.placeOfSupply || null,
          billingAddressLine: billingLine || null,
          billingCity: billingCity || null,
          billingState: billingState || null,
          billingPincode: billingPincode || null,
          businessType: body.businessType || null,
          subType: body.subType || null,
          cuisine: body.cuisine || null,
          businessSize: body.businessSize || null,
          salutation: body.salutation || null,
          firstName: body.firstName || null,
          lastName: body.lastName || null,
          designation: body.designation || null,
          workPhone: body.workPhone || null,
          isCustomer: body.isCustomer,
          isVendor: body.isVendor,
          isBrand: body.isBrand,
        },
      });
      const outlet = await tx.outlet.create({
        data: {
          businessAccountId: account.id,
          name: body.primaryOutlet.name,
          addressLine: body.primaryOutlet.addressLine,
          flatInfo: body.primaryOutlet.flatInfo ?? null,
          landmark: body.primaryOutlet.landmark ?? null,
          city: body.primaryOutlet.city,
          state: body.primaryOutlet.state,
          pincode: body.primaryOutlet.pincode,
          latitude: body.primaryOutlet.latitude,
          longitude: body.primaryOutlet.longitude,
          placeId: body.primaryOutlet.placeId,
          requiresAddressUpdate: !(body.primaryOutlet.latitude && body.primaryOutlet.longitude),
        },
      });
      await tx.businessAccount.update({ where: { id: account.id }, data: { primaryOutletId: outlet.id } });
      await tx.businessAccountMember.create({
        data: { userId: ctx.userId, businessAccountId: account.id, isPrimary: false, acceptedAt: new Date() },
      });
      await tx.userRole.create({
        data: { userId: ctx.userId, businessAccountId: account.id, outletId: null, roleId: ownerTemplate.id },
      });

      // Vendor extension row — without this the storefront/dashboard 403s
      // because resolveVendorContext can't find a Vendor record. When
      // vendorDetails is supplied we populate the FULL KYC payload + seed
      // ServiceArea rows, so the new vendor is operational immediately;
      // otherwise we still create the row but leave KYC fields null (legacy
      // path — caller is expected to PATCH /vendor/settings to complete it).
      if (body.isVendor && vendorAdminTemplate) {
        const vd = body.vendorDetails;
        const typeSelections = vd
          ? normalizeVendorTypeSelections(vd.vendorTypeSelections)
          : [];
        const typeLegacy = legacyScalarsFromSelections(typeSelections);
        const selectionsJson = typeSelections.length > 0
          ? (typeSelections as unknown as Prisma.InputJsonValue)
          : undefined;
        const vendor = await tx.vendor.create({
          data: {
            userId: ctx.userId,
            businessAccountId: account.id,
            businessName: body.legalName,
            displayName: body.displayName || body.legalName,
            slug: slugify(body.displayName || body.legalName, ctx.userId),
            isActive: false,
            isVerified: false,
            isPrimaryStore: true,
            multiWarehouseEnabled: false,
            defaultOutletId: outlet.id,
            setupProgress: { business: true, online_store: true },

            // Tax / billing on the Vendor row (separate from outlet)
            gstNumber: body.gstin ?? null,
            tradeName: body.displayName ?? null,

            ...(vd ? {
              vendorType: typeLegacy?.vendorType ?? vd.vendorType,
              panNumber: vd.panNumber || null,
              authorizedPersonName: vd.authorizedPersonName,
              authorizedPersonPhone: vd.authorizedPersonPhone,
              authorizedPersonEmail: vd.authorizedPersonEmail || null,

              // Billing / registered office (Bill From on tax invoices)
              addressLine: vd.billingAddress.addressLine,
              city: vd.billingAddress.city,
              state: vd.billingAddress.state,
              addressPincode: vd.billingAddress.pincode,

              // Pickup / warehouse mirrors the primary outlet — that's
              // where the delivery partner physically collects orders.
              pickupAddressLine: body.primaryOutlet.addressLine,
              pickupCity: body.primaryOutlet.city ?? null,
              pickupState: body.primaryOutlet.state ?? null,
              pickupPincode: body.primaryOutlet.pincode ?? null,

              bankAccountName: vd.bankAccountName,
              bankAccountNumber: vd.bankAccountNumber,
              bankIfsc: vd.bankIfsc,
              bankName: vd.bankName,
              bankAccountType: vd.bankAccountType,

              deliveryCapability: vd.deliveryCapability,
              fssaiNumber: vd.fssaiNumber || null,
              udyamNumber: vd.udyamNumber || null,
              cinNumber: vd.cinNumber || null,
              subType: typeLegacy?.subType ?? vd.subType ?? null,
              vendorTypeSelections: selectionsJson,
              categoriesHandled: vd.categoriesHandled ?? [],
              businessSize: vd.businessSize || null,
              coverage: vd.coverage || null,
              warehouseCount: vd.warehouseCount != null && vd.warehouseCount !== ''
                ? Number(vd.warehouseCount)
                : null,
              deliveryFleet: typeof vd.deliveryFleet === 'boolean'
                ? vd.deliveryFleet
                : vd.deliveryFleet === 'yes' || vd.deliveryFleet === 'true'
                  ? true
                  : vd.deliveryFleet === 'no' || vd.deliveryFleet === 'false'
                    ? false
                    : null,
              monthlySupplyBand: vd.monthlySupplyBand || null,
            } : {}),
          },
          select: { id: true },
        });
        await tx.userRole.create({
          data: {
            userId: ctx.userId,
            businessAccountId: account.id,
            outletId: null,
            vendorId: null,
            roleId: vendorAdminTemplate.id,
          },
        });
        // Legacy User.role field — only used by older routes that haven't been
        // migrated to BusinessAccountMember + UserRole yet. We ONLY promote
        // 'customer' → 'vendor' here; an admin who happens to create a vendor
        // business (e.g. for testing or because the same human runs both)
        // MUST stay role='admin' or they lose admin access on next session
        // refresh. Brand path correctly skips this update — vendor path was
        // the only one writing the legacy field, which created the asymmetry.
        await tx.user.updateMany({
          where: { id: ctx.userId, role: 'customer' },
          data: { role: 'vendor' },
        });

        // Serviceable pincodes — vendor-wide (outletId null) until multi-warehouse
        // coverage is configured. Dedupe; skipDuplicates covers race retries.
        if (vd && vd.serviceablePincodes.length > 0) {
          const unique = Array.from(new Set(vd.serviceablePincodes.map((p) => p.trim()).filter(Boolean)));
          await tx.serviceArea.createMany({
            data: unique.map((pincode) => ({
              vendorId: vendor.id,
              outletId: outlet.id,
              pincode,
              isActive: true,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (body.isBrand && brandAdminTemplate) {
        await tx.brand.create({
          data: {
            userId: ctx.userId,
            businessAccountId: account.id,
            name: body.displayName || body.legalName,
            slug: slugify(body.displayName || body.legalName, ctx.userId),
            approvalStatus: 'pending',
            isActive: false,
            description: body.description ?? null,
            website: body.website ?? null,
            tagline: body.tagline ?? null,
            categories: body.productCategories ?? [],
            brandType: body.businessType ?? null,
            subType: body.subType ?? null,
            businessSize: body.businessSize ?? null,
            distributionPresence: body.distributionPresence ?? null,
            targetSegments: body.targetSegments ?? [],
            horecaFocused: body.horecaFocused ?? null,
            retailFocused: body.retailFocused ?? null,
          },
        });
        await tx.userRole.create({
          data: { userId: ctx.userId, businessAccountId: account.id, outletId: null, roleId: brandAdminTemplate.id },
        });
      }

      return { account, outlet };
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
});
