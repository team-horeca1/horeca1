// PATCH  /api/v1/addresses/:id — update a saved address (or linked outlet)
// DELETE /api/v1/addresses/:id — delete a saved address (or deactivate linked outlet)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withRole } from '@/middleware/rbac';
import { prisma } from '@/lib/prisma';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { assertAccountMember, isAdminActingAsBusinessAccount } from '@/lib/accountAccess';
import { hasUsableDeliveryLocation } from '@/lib/addressUsability';
import {
  effectiveCustomerBusinessAccountId,
  effectiveCustomerUserId,
} from '@/lib/resolveCustomerImpersonation';
import type { AuthContext } from '@/middleware/auth';

/**
 * Storefront /addresses may receive an Outlet id (GET maps outlets when the
 * user has no SavedAddress row). Delivery-location edits only need BA membership
 * — not the account-admin `outlets.edit` / `outlets.delete` keys.
 */
async function assertCanEditDeliveryLocation(
  ctx: AuthContext,
  userId: string,
  businessAccountId: string,
): Promise<void> {
  if (await isAdminActingAsBusinessAccount(ctx, businessAccountId)) return;
  await assertAccountMember(userId, businessAccountId);
}

const updateSchema = z.object({
  label: z.string().min(1).max(50).optional(),
  businessName: z.string().max(255).nullable().optional(),
  fullAddress: z.string().min(1).optional(),
  shortAddress: z.string().max(255).nullable().optional(),
  flatInfo: z.string().max(255).nullable().optional(),
  landmark: z.string().max(255).nullable().optional(),
  pincode: z.string().max(10).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  placeId: z.string().max(500).nullable().optional(),
  isDefault: z.boolean().optional(),
});

const ALL_ROLES = ['customer', 'vendor', 'brand', 'admin'] as const;

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

type AddressTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * After removing a primary outlet / default SavedAddress, promote the oldest
 * remaining active outlet (and its linked SavedAddress) so primaryOutletId and
 * isDefault never point at a deleted row.
 */
async function promoteNextPrimary(
  tx: AddressTx,
  opts: {
    userId: string;
    businessAccountId: string | null;
    deletedOutletId: string | null;
    deletedWasDefault: boolean;
  },
): Promise<void> {
  const { userId, businessAccountId, deletedOutletId, deletedWasDefault } = opts;

  if (businessAccountId && deletedOutletId) {
    const ba = await tx.businessAccount.findUnique({
      where: { id: businessAccountId },
      select: { primaryOutletId: true },
    });
    const wasPrimary = ba?.primaryOutletId === deletedOutletId;
    if (!wasPrimary && !deletedWasDefault) return;

    // Deleted outlet is already isActive: false, so this picks the next survivor.
    const nextOutlet = await tx.outlet.findFirst({
      where: { businessAccountId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!nextOutlet) return;

    await tx.businessAccount.update({
      where: { id: businessAccountId },
      data: { primaryOutletId: nextOutlet.id },
    });
    await tx.savedAddress.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
    await tx.savedAddress.updateMany({
      where: { userId, outletId: nextOutlet.id },
      data: { isDefault: true },
    });
    return;
  }

  if (!deletedWasDefault) return;

  // Legacy SavedAddress with no outlet — promote oldest remaining row.
  const next = await tx.savedAddress.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!next) return;

  await tx.savedAddress.updateMany({
    where: { userId, isDefault: true, id: { not: next.id } },
    data: { isDefault: false },
  });
  await tx.savedAddress.update({
    where: { id: next.id },
    data: { isDefault: true },
  });
}

export const PATCH = withRole([...ALL_ROLES], async (req: NextRequest, ctx) => {
  try {
    const id = extractId(req);
    const body = await req.json();
    const input = updateSchema.parse(body);
    const userId = effectiveCustomerUserId(ctx);
    const businessAccountId = effectiveCustomerBusinessAccountId(ctx);

    const existing = await prisma.savedAddress.findFirst({
      where: { id, userId },
    });
    if (existing) {
      const updated = await prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.savedAddress.updateMany({
            where: { userId, isDefault: true, id: { not: id } },
            data: { isDefault: false },
          });
          if (businessAccountId && existing.outletId) {
            await tx.businessAccount.update({
              where: { id: businessAccountId },
              data: { primaryOutletId: existing.outletId },
            });
          }
        }

        if (existing.outletId) {
          const outletPatch: Record<string, unknown> = {};
          const outletName = input.businessName ?? input.label;
          if (outletName !== undefined) outletPatch.name = outletName;
          if (input.fullAddress !== undefined) outletPatch.addressLine = input.fullAddress;
          if (input.flatInfo !== undefined) outletPatch.flatInfo = input.flatInfo;
          if (input.landmark !== undefined) outletPatch.landmark = input.landmark;
          if (input.pincode !== undefined) outletPatch.pincode = input.pincode;
          if (input.city !== undefined) outletPatch.city = input.city;
          if (input.state !== undefined) outletPatch.state = input.state;
          if (input.latitude !== undefined) outletPatch.latitude = input.latitude;
          if (input.longitude !== undefined) outletPatch.longitude = input.longitude;
          if (input.placeId !== undefined) outletPatch.placeId = input.placeId;
          if (input.pincode !== undefined && input.pincode && /^\d{6}$/.test(input.pincode)) {
            outletPatch.requiresAddressUpdate = false;
          } else if (
            hasUsableDeliveryLocation({
              pincode: input.pincode ?? existing.pincode ?? undefined,
              latitude: input.latitude ?? existing.latitude,
              longitude: input.longitude ?? existing.longitude,
            })
          ) {
            outletPatch.requiresAddressUpdate = false;
          }
          if (Object.keys(outletPatch).length > 0) {
            await tx.outlet.update({ where: { id: existing.outletId }, data: outletPatch });
          }
        }

        return tx.savedAddress.update({
          where: { id },
          data: {
            ...(input.label !== undefined && { label: input.label }),
            ...(input.businessName !== undefined && { businessName: input.businessName }),
            ...(input.fullAddress !== undefined && { fullAddress: input.fullAddress }),
            ...(input.shortAddress !== undefined && { shortAddress: input.shortAddress }),
            ...(input.flatInfo !== undefined && { flatInfo: input.flatInfo }),
            ...(input.landmark !== undefined && { landmark: input.landmark }),
            ...(input.pincode !== undefined && { pincode: input.pincode }),
            ...(input.city !== undefined && { city: input.city }),
            ...(input.state !== undefined && { state: input.state }),
            ...(input.latitude !== undefined && { latitude: input.latitude }),
            ...(input.longitude !== undefined && { longitude: input.longitude }),
            ...(input.placeId !== undefined && { placeId: input.placeId }),
            ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
          },
        });
      });
      return NextResponse.json({ success: true, data: updated });
    }

    // Client may hold an Outlet id (GET maps outlets when no SavedAddress exists).
    if (!businessAccountId) throw Errors.notFound('Address');
    await assertCanEditDeliveryLocation(ctx, userId, businessAccountId);

    const outlet = await prisma.outlet.findFirst({
      where: { id, businessAccountId, isActive: true },
    });
    if (!outlet) throw Errors.notFound('Address');

    const outletName = input.businessName ?? input.label ?? outlet.name;
    const outletPatch: Record<string, unknown> = {
      ...(input.businessName !== undefined || input.label !== undefined ? { name: outletName } : {}),
      ...(input.fullAddress !== undefined && { addressLine: input.fullAddress }),
      ...(input.flatInfo !== undefined && { flatInfo: input.flatInfo }),
      ...(input.landmark !== undefined && { landmark: input.landmark }),
      ...(input.pincode !== undefined && { pincode: input.pincode }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.state !== undefined && { state: input.state }),
      ...(input.latitude !== undefined && { latitude: input.latitude }),
      ...(input.longitude !== undefined && { longitude: input.longitude }),
      ...(input.placeId !== undefined && { placeId: input.placeId }),
    };
    if (
      (input.pincode && /^\d{6}$/.test(input.pincode))
      || hasUsableDeliveryLocation({
        pincode: input.pincode ?? outlet.pincode ?? undefined,
        latitude: input.latitude ?? outlet.latitude,
        longitude: input.longitude ?? outlet.longitude,
      })
    ) {
      outletPatch.requiresAddressUpdate = false;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.businessAccount.update({
          where: { id: businessAccountId },
          data: { primaryOutletId: outlet.id },
        });
        await tx.savedAddress.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const u = await tx.outlet.update({ where: { id: outlet.id }, data: outletPatch });

      const linked = await tx.savedAddress.findFirst({ where: { outletId: outlet.id, userId } });
      if (linked) {
        await tx.savedAddress.update({
          where: { id: linked.id },
          data: {
            ...(input.label !== undefined && { label: input.label }),
            ...(input.businessName !== undefined && { businessName: input.businessName }),
            ...(input.fullAddress !== undefined && {
              fullAddress: input.fullAddress,
              shortAddress: input.shortAddress ?? input.fullAddress.split(',').slice(0, 2).join(', '),
            }),
            ...(input.flatInfo !== undefined && { flatInfo: input.flatInfo }),
            ...(input.landmark !== undefined && { landmark: input.landmark }),
            ...(input.pincode !== undefined && { pincode: input.pincode }),
            ...(input.city !== undefined && { city: input.city }),
            ...(input.state !== undefined && { state: input.state }),
            ...(input.latitude !== undefined && { latitude: input.latitude }),
            ...(input.longitude !== undefined && { longitude: input.longitude }),
            ...(input.placeId !== undefined && { placeId: input.placeId }),
            ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
          },
        });
      } else if (input.fullAddress) {
        await tx.savedAddress.create({
          data: {
            userId,
            outletId: outlet.id,
            label: input.label ?? 'Business',
            businessName: outletName,
            fullAddress: input.fullAddress,
            shortAddress: input.shortAddress ?? input.fullAddress.split(',').slice(0, 2).join(', '),
            flatInfo: input.flatInfo,
            landmark: input.landmark,
            pincode: input.pincode,
            city: input.city,
            state: input.state,
            latitude: input.latitude ?? outlet.latitude ?? 0,
            longitude: input.longitude ?? outlet.longitude ?? 0,
            placeId: input.placeId ?? outlet.placeId,
            isDefault: input.isDefault ?? false,
          },
        });
      }

      return u;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = withRole([...ALL_ROLES], async (req: NextRequest, ctx) => {
  try {
    const id = extractId(req);
    const userId = effectiveCustomerUserId(ctx);
    const businessAccountId = effectiveCustomerBusinessAccountId(ctx);

    const existing = await prisma.savedAddress.findFirst({
      where: { id, userId },
      select: { id: true, outletId: true, isDefault: true },
    });

    if (existing) {
      await prisma.$transaction(async (tx) => {
        if (existing.outletId) {
          const activeCount = await tx.outlet.count({
            where: {
              businessAccountId: businessAccountId ?? undefined,
              isActive: true,
            },
          });
          if (activeCount <= 1) {
            throw Errors.badRequest('Cannot remove your only delivery outlet — edit it instead');
          }
          await tx.outlet.update({
            where: { id: existing.outletId },
            data: { isActive: false },
          });
        }
        await tx.savedAddress.delete({ where: { id } });
        await promoteNextPrimary(tx, {
          userId,
          businessAccountId,
          deletedOutletId: existing.outletId,
          deletedWasDefault: existing.isDefault,
        });
      });
      return NextResponse.json({ success: true });
    }

    if (!businessAccountId) throw Errors.notFound('Address');
    await assertCanEditDeliveryLocation(ctx, userId, businessAccountId);

    const outlet = await prisma.outlet.findFirst({
      where: { id, businessAccountId, isActive: true },
      select: { id: true },
    });
    if (!outlet) throw Errors.notFound('Address');

    const activeCount = await prisma.outlet.count({
      where: { businessAccountId, isActive: true },
    });
    if (activeCount <= 1) {
      throw Errors.badRequest('Cannot remove your only delivery outlet — edit it instead');
    }

    await prisma.$transaction(async (tx) => {
      const ba = await tx.businessAccount.findUnique({
        where: { id: businessAccountId },
        select: { primaryOutletId: true },
      });
      const linkedDefault = await tx.savedAddress.findFirst({
        where: { outletId: outlet.id, userId, isDefault: true },
        select: { id: true },
      });

      await tx.outlet.update({ where: { id: outlet.id }, data: { isActive: false } });
      await tx.savedAddress.deleteMany({ where: { outletId: outlet.id, userId } });
      await promoteNextPrimary(tx, {
        userId,
        businessAccountId,
        deletedOutletId: outlet.id,
        // wasPrimary is re-checked inside promoteNextPrimary via primaryOutletId
        deletedWasDefault: Boolean(linkedDefault) || ba?.primaryOutletId === outlet.id,
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
