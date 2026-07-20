// GET    /api/v1/admin/vendors/:id — Get full vendor detail
// PATCH  /api/v1/admin/vendors/:id — Approve/reject vendor (update isVerified, isActive)
// DELETE /api/v1/admin/vendors/:id?force=true — Permanently delete vendor
// WHY: Admin reviews vendor applications, approves them for the marketplace,
//      or deactivates misbehaving vendors. Emits VendorOnboarded on first verification.
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { emitEvent } from '@/events/emitter';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { validateVendorCode } from '@/lib/sku';
import { hardDeleteVendorById } from '@/lib/userHardDelete';
import { Prisma } from '@prisma/client';
import { getAdminRevealedPasswordForRole } from '@/lib/adminPasswordReveal';

const VENDOR_ID_COOKIE = 'admin_impersonate_vendor_id';
const VENDOR_NAME_COOKIE = 'admin_impersonate_vendor_name';

// Helper: extract the [id] segment from /api/v1/admin/vendors/{id}
function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

// GET — full vendor details with products, service areas, delivery slots
export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'vendors.view');
    const id = extractId(req);

    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: {
        businessAccount: {
          select: {
            leadStatus: true,
            manualTags: true,
            paymentTerms: true,
            customFields: true,
          },
        },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            gstNumber: true,
            isActive: true,
            createdAt: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
            basePrice: true,
            isActive: true,
            imageUrl: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        serviceAreas: {
          select: {
            id: true,
            pincode: true,
            isActive: true,
          },
        },
        deliverySlots: {
          select: {
            id: true,
            dayOfWeek: true,
            slotStart: true,
            slotEnd: true,
            cutoffTime: true,
            isActive: true,
          },
          orderBy: { dayOfWeek: 'asc' },
        },
        _count: {
          select: {
            orders: true,
            products: true,
            creditAccounts: true,
          },
        },
      },
    });

    if (!vendor) {
      throw Errors.notFound('Online Store');
    }

    const siblingStores = await prisma.vendor.findMany({
      where: {
        businessAccountId: vendor.businessAccountId,
        id: { not: vendor.id },
      },
      orderBy: [{ isPrimaryStore: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        businessName: true,
        displayName: true,
        slug: true,
        isActive: true,
        isVerified: true,
        isPrimaryStore: true,
      },
    });

    const adminPassword = await getAdminRevealedPasswordForRole(ctx, vendor.user.id, 'vendor');
    const data = {
      ...vendor,
      user: { ...vendor.user, adminPassword },
      siblingStores: siblingStores.map((s) => ({
        id: s.id,
        name: (s.displayName ?? s.businessName).trim() || s.businessName,
        slug: s.slug,
        isActive: s.isActive,
        isVerified: s.isVerified,
        isPrimaryStore: s.isPrimaryStore,
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

// PATCH — approve/reject vendor (update isVerified, isActive)
export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'vendors.edit');
    const id = extractId(req);
    const body = await req.json();

    // Only allow updating admin-controlled vendor fields
    const allowedFields: Record<string, unknown> = {};
    if (typeof body.isVerified === 'boolean') {
      allowedFields.isVerified = body.isVerified;
    }
    if (typeof body.isActive === 'boolean') {
      allowedFields.isActive = body.isActive;
    }

    // NOTE: field names must match the Prisma Vendor model exactly — the
    // registered-office columns are `addressLine` / `addressPincode`, NOT
    // `address` / `pincode` (those don't exist on Vendor). Passing an unknown
    // key to prisma.vendor.update throws and the whole save fails.
    const vendorFields = [
      'businessName', 'description', 'addressLine', 'city', 'state', 'addressPincode',
      'tradeName', 'vendorType', 'subType', 'vendorTypeSelections', 'gstNumber', 'panNumber', 'fssaiNumber',
      'udyamNumber', 'cinNumber', 'deliveryCapability', 'authorizedPersonName',
      'authorizedPersonPhone', 'authorizedPersonEmail', 'pickupAddressLine',
      'pickupCity', 'pickupState', 'pickupPincode', 'bankAccountName',
      'bankAccountNumber', 'bankIfsc', 'bankName', 'bankAccountType',
      'businessSize', 'coverage', 'monthlySupplyBand',
    ];

    for (const field of vendorFields) {
      if (body[field] !== undefined) {
        allowedFields[field] = body[field];
      }
    }

    if (body.minOrderValue !== undefined) {
      allowedFields.minOrderValue = Number(body.minOrderValue);
    }
    if (body.deliveryFee !== undefined) {
      allowedFields.deliveryFee = Number(body.deliveryFee);
    }
    if (body.freeDeliveryAbove !== undefined) {
      allowedFields.freeDeliveryAbove = body.freeDeliveryAbove !== null ? Number(body.freeDeliveryAbove) : null;
    }
    if (body.platformFeePct !== undefined) {
      if (body.platformFeePct === null || body.platformFeePct === '') {
        allowedFields.platformFeePct = null;
      } else {
        const pct = Number(body.platformFeePct);
        if (!Number.isFinite(pct) || pct < 5 || pct > 25) {
          throw Errors.badRequest('Platform fee must be between 5% and 25%');
        }
        allowedFields.platformFeePct = pct;
      }
    }

    const userUpdate: Record<string, string> = {};
    if (body.fullName !== undefined) userUpdate.fullName = body.fullName;
    if (body.email !== undefined) userUpdate.email = body.email;
    if (body.phone !== undefined) userUpdate.phone = body.phone;
    if (body.userGstNumber !== undefined) userUpdate.gstNumber = body.userGstNumber;

    if (typeof body.creditEnabled === 'boolean') {
      allowedFields.creditEnabled = body.creditEnabled;
    }
    if (body.categoriesHandled !== undefined) {
      allowedFields.categoriesHandled = body.categoriesHandled;
    }
    if (body.warehouseCount !== undefined) {
      allowedFields.warehouseCount = body.warehouseCount === null || body.warehouseCount === ''
        ? null
        : Number(body.warehouseCount);
    }
    if (typeof body.deliveryFleet === 'boolean') {
      allowedFields.deliveryFleet = body.deliveryFleet;
    }

    if (body.vendorCode !== undefined) {
      const raw = typeof body.vendorCode === 'string' ? body.vendorCode.trim() : '';
      const vendorWithCode = await prisma.vendor.findUnique({
        where: { id },
        select: { vendorCode: true },
      });
      const productCount = await prisma.product.count({
        where: {
          vendorId: id,
          slug: { not: { startsWith: '_deleted_' } },
        },
      });

      if (productCount > 0 && vendorWithCode?.vendorCode) {
        if (raw === '') {
          throw Errors.conflict(
            'Vendor code cannot be cleared after products exist.',
          );
        }
        const validated = validateVendorCode(raw);
        if (!validated.ok) {
          throw Errors.badRequest(validated.message);
        }
        if (validated.normalized !== vendorWithCode.vendorCode) {
          throw Errors.conflict(
            'Vendor code cannot be changed after products exist. SKUs are permanently prefixed with the assigned code.',
          );
        }
      } else if (raw === '') {
        allowedFields.vendorCode = null;
      } else {
        const validated = validateVendorCode(raw);
        if (!validated.ok) {
          throw Errors.badRequest(validated.message);
        }
        allowedFields.vendorCode = validated.normalized;
      }
    }

    const businessAccountUpdate: Record<string, unknown> = {};
    if (body.leadStatus !== undefined) businessAccountUpdate.leadStatus = body.leadStatus;
    if (body.manualTags !== undefined) businessAccountUpdate.manualTags = body.manualTags;
    if (body.paymentTerms !== undefined) businessAccountUpdate.paymentTerms = body.paymentTerms;
    if (body.platformCommissionPct !== undefined || body.dispatchSlaHours !== undefined) {
      businessAccountUpdate.customFields = {
        ...(body.platformCommissionPct !== undefined ? { platformCommissionPct: Number(body.platformCommissionPct) } : {}),
        ...(body.dispatchSlaHours !== undefined ? { dispatchSlaHours: Number(body.dispatchSlaHours) } : {}),
      };
    }

    const hasBusinessAccountUpdate = Object.keys(businessAccountUpdate).length > 0;
    const hasServiceAreas = body.serviceAreas !== undefined;
    const hasDeliverySlots = body.deliverySlots !== undefined;

    if (Object.keys(allowedFields).length === 0 && Object.keys(userUpdate).length === 0 && !hasServiceAreas && !hasDeliverySlots && !hasBusinessAccountUpdate) {
      throw Errors.notFound('No valid fields to update');
    }

    // Fetch current vendor state (needed for onboarding event check)
    const existing = await prisma.vendor.findUnique({
      where: { id },
      select: { isVerified: true, userId: true, businessName: true, businessAccountId: true },
    });

    if (!existing) {
      throw Errors.notFound('Vendor');
    }

    // When approving: also activate the vendor and mark setup wizard complete (AUD-005)
    if (allowedFields.isVerified === true) {
      allowedFields.isActive = true;
      const prior = await prisma.vendor.findUnique({
        where: { id },
        select: { setupProgress: true },
      });
      const progress = {
        ...((prior?.setupProgress ?? {}) as Record<string, boolean>),
        profile: true,
        delivery: true,
        products: true,
        go_live: true,
      };
      (allowedFields as Record<string, unknown>).setupProgress = progress;
    }

    const updated = await prisma.$transaction(async (tx) => {
      let vendorUpdateResult;
      if (Object.keys(allowedFields).length > 0 || Object.keys(userUpdate).length > 0) {
        vendorUpdateResult = await tx.vendor.update({
          where: { id },
          data: {
            ...allowedFields,
            ...(Object.keys(userUpdate).length > 0 && {
              user: {
                update: userUpdate
              }
            })
          },
          select: {
            id: true,
            businessName: true,
            slug: true,
            vendorCode: true,
            isVerified: true,
            isActive: true,
            updatedAt: true,
            user: {
              select: { id: true, fullName: true, email: true },
            },
          },
        });
      } else {
        const vResult = await tx.vendor.findUnique({
          where: { id },
          select: {
            id: true,
            businessName: true,
            slug: true,
            vendorCode: true,
            isVerified: true,
            isActive: true,
            updatedAt: true,
            user: {
              select: { id: true, fullName: true, email: true },
            },
          },
        });
        if (!vResult) {
          throw Errors.notFound('Vendor');
        }
        vendorUpdateResult = vResult;
      }

      if (hasBusinessAccountUpdate && existing.businessAccountId) {
        const baPatch = { ...businessAccountUpdate };
        if (baPatch.customFields) {
          const current = await tx.businessAccount.findUnique({
            where: { id: existing.businessAccountId },
            select: { customFields: true },
          });
          const prev = (current?.customFields && typeof current.customFields === 'object')
            ? current.customFields as Record<string, unknown>
            : {};
          baPatch.customFields = { ...prev, ...(baPatch.customFields as Record<string, unknown>) };
        }
        await tx.businessAccount.update({
          where: { id: existing.businessAccountId },
          data: baPatch,
        });
      }

      // Sync Service Areas
      if (hasServiceAreas && Array.isArray(body.serviceAreas)) {
        const incomingAreas: { pincode: string; isActive?: boolean }[] = body.serviceAreas;
        const uniquePincodes = Array.from(new Set(incomingAreas.map(sa => sa.pincode.trim()).filter(Boolean)));

        // Delete existing service areas for this vendor
        await tx.serviceArea.deleteMany({
          where: { vendorId: id }
        });

        // Insert updated list
        if (uniquePincodes.length > 0) {
          await tx.serviceArea.createMany({
            data: uniquePincodes.map(pincode => {
              const incoming = incomingAreas.find(sa => sa.pincode.trim() === pincode);
              return {
                vendorId: id,
                pincode,
                isActive: incoming?.isActive !== false
              };
            })
          });
        }
      }

      // Sync Delivery Slots
      if (hasDeliverySlots && Array.isArray(body.deliverySlots)) {
        const incomingSlots: any[] = body.deliverySlots;

        // Fetch current slots for this vendor
        const currentSlots = await tx.deliverySlot.findMany({
          where: { vendorId: id }
        });

        const incomingIds = new Set(incomingSlots.map(s => s.id).filter(Boolean));

        // Handle deletions / deactivations
        for (const current of currentSlots) {
          if (!incomingIds.has(current.id)) {
            // Check if slot is referenced by any orders
            const orderCount = await tx.order.count({
              where: { deliverySlotId: current.id }
            });
            if (orderCount > 0) {
              // Soft delete
              await tx.deliverySlot.update({
                where: { id: current.id },
                data: { isActive: false }
              });
            } else {
              // Hard delete
              await tx.deliverySlot.delete({
                where: { id: current.id }
              });
            }
          }
        }

        // Handle creations & updates
        for (const slot of incomingSlots) {
          const slotData = {
            dayOfWeek: Number(slot.dayOfWeek),
            slotStart: slot.slotStart,
            slotEnd: slot.slotEnd,
            cutoffTime: slot.cutoffTime,
            isActive: slot.isActive !== false,
          };

          if (slot.id && !slot.id.startsWith('temp-')) {
            // Update existing slot
            await tx.deliverySlot.update({
              where: { id: slot.id },
              data: slotData
            });
          } else {
            // Create new slot
            // Check if slot with same vendorId, dayOfWeek, and slotStart already exists to avoid unique constraint error
            const existingSame = await tx.deliverySlot.findFirst({
              where: {
                vendorId: id,
                outletId: null,
                dayOfWeek: slotData.dayOfWeek,
                slotStart: slotData.slotStart,
              },
            });

            if (existingSame) {
              await tx.deliverySlot.update({
                where: { id: existingSame.id },
                data: slotData
              });
            } else {
              await tx.deliverySlot.create({
                data: {
                  vendorId: id,
                  ...slotData
                }
              });
            }
          }
        }
      }

      return vendorUpdateResult;
    });

    // Promote user role to 'vendor' on approval, revert to 'customer' on revoke
    if (typeof allowedFields.isVerified === 'boolean') {
      await prisma.user.update({
        where: { id: existing.userId },
        data: { role: allowedFields.isVerified ? 'vendor' : 'customer' },
      });
    }

    // Emit VendorOnboarded when vendor is verified for the first time
    if (
      allowedFields.isVerified === true &&
      !existing.isVerified
    ) {
      emitEvent('VendorOnboarded', {
        vendorId: id,
        userId: existing.userId,
        businessName: existing.businessName,
      });
    }

    logAction(ctx, req, {
      action: allowedFields.isVerified === true ? AUDIT_ACTIONS.vendorApprove : AUDIT_ACTIONS.vendorUpdate,
      entity: 'Vendor',
      entityId: id,
      before: { isVerified: existing.isVerified },
      after: allowedFields,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      (error.meta.target as string[]).includes('vendor_code')
    ) {
      return errorResponse(Errors.conflict('This vendor code is already assigned to another vendor.'));
    }
    return errorResponse(error);
  }
});

// DELETE /api/v1/admin/vendors/[id]?force=true — irreversible vendor removal
export const DELETE = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'vendors.delete');
    const id = extractId(req);
    const force = req.nextUrl.searchParams.get('force') === 'true';
    if (!force) {
      throw Errors.badRequest('Permanent delete requires ?force=true');
    }

    const existing = await prisma.vendor.findUnique({
      where: { id },
      select: { id: true, userId: true, businessName: true, isActive: true, isVerified: true },
    });
    if (!existing) throw Errors.notFound('Vendor');

    if (existing.userId === ctx.userId) {
      throw Errors.badRequest('You cannot delete your own vendor account');
    }

    const before = {
      id: existing.id,
      businessName: existing.businessName,
      userId: existing.userId,
      isActive: existing.isActive,
      isVerified: existing.isVerified,
    };

    const result = await hardDeleteVendorById(id);

    await logAction(ctx, req, {
      action: AUDIT_ACTIONS.vendorDelete,
      entity: 'vendor',
      entityId: id,
      before,
      after: null,
      metadata: {
        ownerUserId: result.ownerUserId,
        ownerHardDeleted: result.ownerHardDeleted,
      },
    });

    const res = NextResponse.json({
      success: true,
      data: { id, hardDeleted: true, ownerHardDeleted: result.ownerHardDeleted },
    });

    const cookieStore = await cookies();
    if (cookieStore.get(VENDOR_ID_COOKIE)?.value === id) {
      res.cookies.set(VENDOR_ID_COOKIE, '', { maxAge: 0, path: '/' });
      res.cookies.set(VENDOR_NAME_COOKIE, '', { maxAge: 0, path: '/' });
    }

    return res;
  } catch (error) {
    return errorResponse(error);
  }
});
