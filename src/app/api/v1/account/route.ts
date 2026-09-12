/**
 * GET  /api/v1/account              — list every BusinessAccount the caller belongs to
 * POST /api/v1/account              — create a new BusinessAccount + primary Outlet + owner role
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { errorResponse } from '@/middleware/errorHandler';
import {
  vendorDetailsSchema,
  PrimaryOutletSchema,
  GST_RE,
  PAN_RE,
} from '@/lib/validators/vendor-kyc';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';
import { hasUsableDeliveryLocation } from '@/lib/addressUsability';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';
import { businessFacingName, storeDisplayName } from '@/modules/supplier/foundation.service';
import { kindFromFlags, type BusinessKind } from '@/lib/businessCapability';
import { provisionBusinessProfile } from '@/modules/account/provisionBusinessProfile';

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const targetUserId = effectiveCustomerUserId(ctx);
    const impersonatedBaId = ctx.impersonatedBuyer?.businessAccountId;

    const membershipWhere = {
      userId: targetUserId,
      ...(impersonatedBaId ? { businessAccountId: impersonatedBaId } : {}),
    };

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
              orderBy: [{ isPrimaryStore: 'desc' }, { createdAt: 'asc' }],
              select: {
                id: true,
                businessName: true,
                displayName: true,
                slug: true,
                isActive: true,
                isVerified: true,
                isPrimaryStore: true,
                logoUrl: true,
              },
            },
            brand: {
              select: {
                id: true,
                name: true,
                slug: true,
                approvalStatus: true,
                isActive: true,
                logoUrl: true,
                _count: { select: { masterProducts: true } },
              },
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
        const { vendors, brand, ...ba } = m.businessAccount;
        const storeNames = vendors.map((v) => storeDisplayName(v));
        const facingName = businessFacingName(ba, storeNames);
        const capability = kindFromFlags(ba);
        return {
          ...ba,
          displayName: facingName,
          capability,
          stores: vendors.map((v) => ({
            id: v.id,
            name: storeDisplayName(v),
            slug: v.slug,
            isActive: v.isActive,
            isVerified: v.isVerified,
            isPrimaryStore: v.isPrimaryStore,
            logoUrl: v.logoUrl,
          })),
          brand: brand
            ? {
                id: brand.id,
                name: brand.name,
                slug: brand.slug,
                approvalStatus: brand.approvalStatus,
                isActive: brand.isActive,
                logoUrl: brand.logoUrl,
              }
            : null,
          catalogueCount: brand?._count.masterProducts ?? 0,
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
    mobilePhone: z.string().max(20).optional(),
    isCustomer: z.boolean().optional(),
    isVendor: z.boolean().optional().default(false),
    isBrand: z.boolean().optional().default(false),
    primaryOutlet: PrimaryOutletSchema,
    vendorDetails: vendorDetailsSchema(relaxedContact).optional(),
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

function kindFromBody(body: { isVendor?: boolean; isBrand?: boolean }): BusinessKind {
  if (body.isVendor) return 'vendor';
  if (body.isBrand) return 'brand';
  return 'customer';
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const relaxedContact = isRegisterEmailOtpEnabled();
    const body = createAccountBodySchema(relaxedContact).parse(await req.json());
    const kind = kindFromBody(body);

    const result = await prisma.$transaction(async (tx) => {
      return provisionBusinessProfile({
        userId: ctx.userId,
        kind,
        legalName: body.legalName,
        displayName: body.displayName,
        gstin: body.gstin || null,
        pan: body.pan || null,
        fssaiNumber: body.fssaiNumber || null,
        gstTreatment: body.gstTreatment || null,
        placeOfSupply: body.placeOfSupply || null,
        billingAddressLine: body.billingAddressLine || null,
        billingCity: body.billingCity || null,
        billingState: body.billingState || null,
        billingPincode: body.billingPincode || null,
        businessType: body.businessType || null,
        subType: body.subType || null,
        cuisine: body.cuisine || null,
        businessSize: body.businessSize || null,
        salutation: body.salutation || null,
        firstName: body.firstName || null,
        lastName: body.lastName || null,
        designation: body.designation || null,
        workPhone: body.workPhone || null,
        mobilePhone: body.mobilePhone || null,
        primaryOutlet: body.primaryOutlet,
        vendorDetails: body.vendorDetails ?? null,
        brand: kind === 'brand' ? {
          productCategories: body.productCategories,
          businessSize: body.businessSize,
          distributionPresence: body.distributionPresence,
          targetSegments: body.targetSegments,
          horecaFocused: body.horecaFocused,
          retailFocused: body.retailFocused,
          website: body.website,
          tagline: body.tagline,
          description: body.description,
        } : undefined,
      }, tx);
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
});
