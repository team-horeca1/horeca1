// GET   /api/v1/vendor/settings — Get vendor profile with service areas and delivery slots
// PATCH /api/v1/vendor/settings — Update vendor profile fields
// WHY: Vendors need to view and manage their business profile, including
//      service areas, delivery slots, minimum order values, and credit settings
// PROTECTED: Vendor only (vendors + admins)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId, resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { GST_RE } from '@/lib/validators/vendor-kyc';
import { isMultiWarehouseEnabled } from '@/lib/config/multiWarehouse';

const optionalUrlSchema = z.string()
  .optional()
  .nullable()
  .or(z.literal(''))
  .refine(
    (val) => !val || val.startsWith('/') || /^(https?:\/\/)/.test(val),
    { message: 'Invalid URL format' }
  );

// Validation schema for profile updates — whitelist of allowed fields
const updateSettingsSchema = z.object({
  businessName: z.string().min(1).optional(),
  description: z.string().optional(),
  logoUrl: optionalUrlSchema,
  bannerUrl: optionalUrlSchema,
  minOrderValue: z.number().min(0).optional(),
  creditEnabled: z.boolean().optional(),
  // Registered business address — used on tax invoices as Bill From / Shipped From.
  addressLine: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  addressPincode: z.string().regex(/^\d{6}$/, 'Invalid pincode').optional().or(z.literal('')),
  gstNumber: z.string().regex(GST_RE, 'Invalid GSTIN format').optional().or(z.literal('')),
  defaultMOQ: z.number().int().min(1).optional(),
  defaultTaxPercent: z.number().min(0).max(100).optional(),
  deliveryFee: z.number().min(0).optional(),
  freeDeliveryAbove: z.number().min(0).optional(),
  returnPolicy: z.string().max(2000).optional(),
  cancellationPolicy: z.string().max(2000).optional(),
  // Bank account details — used for settlement payouts
  bankAccountName: z.string().max(100).optional().nullable(),
  bankAccountNumber: z.string().max(30).optional().nullable(),
  bankIfsc: z.string().max(15).optional().nullable(),
  bankName: z.string().max(100).optional().nullable(),
  bankAccountType: z.enum(['current', 'savings']).optional().nullable(),
  // Payment modes accepted by vendor
  paymentModes: z.array(z.enum(['cod', 'prepaid', 'credit', 'cheque', 'discco'])).optional(),
  vendorType: z.enum(['distributor', 'wholesaler', 'dark_store']).optional(),
  multiWarehouseEnabled: z.boolean().optional(),
  notificationPrefs: z.record(z.string(), z.array(z.string())).optional(),
});

// GET — full vendor profile with service areas, delivery slots, and account info
export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    // Settings include bank account number, IFSC, GST and registered address.
    // Restrict to settings.view so a Viewer / storefront-only buyer can't pull
    // bank credentials by hitting this endpoint directly.
    requirePermission(ctx, 'settings.view');

    const vendorId = await resolveVendorId(ctx, req);

    const profile = await prisma.vendor.findUnique({
      where: { id: vendorId },
      include: {
        serviceAreas: {
          select: { id: true, pincode: true, isActive: true, outletId: true },
        },
        deliverySlots: {
          select: {
            id: true,
            dayOfWeek: true,
            slotStart: true,
            slotEnd: true,
            cutoffTime: true,
            isActive: true,
            outletId: true,
          },
          orderBy: { dayOfWeek: 'asc' },
        },
        user: {
          select: { email: true, phone: true, fullName: true },
        },
      },
    });

    if (!profile) throw Errors.notFound('Vendor');

    // Multi-warehouse retired — stock unit is Online Store (default outlet).
    if (profile.multiWarehouseEnabled) {
      await prisma.vendor.update({
        where: { id: vendorId },
        data: { multiWarehouseEnabled: false },
      });
      profile.multiWarehouseEnabled = false;
    }

    return NextResponse.json({
      success: true,
      data: { ...profile, multiWarehouseEnabled: isMultiWarehouseEnabled(false) },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// PATCH — update whitelisted vendor profile fields
export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'settings.edit');

    const body = await req.json();
    const allowedFields = updateSettingsSchema.parse(body);

    const { paymentModes, notificationPrefs, multiWarehouseEnabled: _mwIgnored, ...scalarFields } = allowedFields;

    const updated = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        ...scalarFields,
        ...(paymentModes !== undefined && { paymentModes }),
        ...(notificationPrefs !== undefined && { notificationPrefs: notificationPrefs as Record<string, string[]> }),
        // Multi-warehouse retired — ignore client attempts to enable.
        multiWarehouseEnabled: false,
      },
    });

    return NextResponse.json({
      success: true,
      data: { ...updated, multiWarehouseEnabled: isMultiWarehouseEnabled(false) },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
