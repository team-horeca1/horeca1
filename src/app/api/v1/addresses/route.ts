// GET  /api/v1/addresses — list saved addresses for session user
// POST /api/v1/addresses — save a new address

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withRole } from '@/middleware/rbac';
import { prisma } from '@/lib/prisma';
import { errorResponse } from '@/middleware/errorHandler';
import { adoptOrCreateOutlet } from '@/lib/outletWrites';
import { mapOutletToUnifiedAddress } from '@/lib/addressOutletBridge';
import {
  effectiveCustomerBusinessAccountId,
  effectiveCustomerUserId,
} from '@/lib/resolveCustomerImpersonation';

const createSchema = z.object({
  label: z.string().min(1).max(50).default('Other'),
  businessName: z.string().max(255).optional(),
  fullAddress: z.string().min(1),
  shortAddress: z.string().max(255).optional(),
  flatInfo: z.string().max(255).optional(),
  landmark: z.string().max(255).optional(),
  pincode: z.string().max(10).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  latitude: z.number(),
  longitude: z.number(),
  placeId: z.string().max(500).optional(),
  isDefault: z.boolean().default(false),
});

// Allow all authenticated roles — customers, vendors, brands (not admin-only)
const ALL_ROLES = ['customer', 'vendor', 'brand', 'admin'] as const;

export const GET = withRole([...ALL_ROLES], async (req: NextRequest, ctx) => {
  try {
    const userId = effectiveCustomerUserId(ctx);
    const businessAccountId = effectiveCustomerBusinessAccountId(ctx);

    if (businessAccountId) {
      const activeAccount = await prisma.businessAccount.findUnique({
        where: { id: businessAccountId },
        select: { primaryOutletId: true },
      });
      const outlets = await prisma.outlet.findMany({
        where: { businessAccountId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      const savedRows = await prisma.savedAddress.findMany({
        where: {
          userId,
          outletId: { in: outlets.map((o) => o.id) },
        },
      });
      const savedByOutlet = new Map(
        savedRows.filter((s) => s.outletId).map((s) => [s.outletId!, s]),
      );
      const addresses = outlets.map((o) =>
        mapOutletToUnifiedAddress(o, savedByOutlet.get(o.id), activeAccount?.primaryOutletId ?? null),
      );
      return NextResponse.json({ success: true, data: addresses });
    }

    const addresses = await prisma.savedAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json({ success: true, data: addresses });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withRole([...ALL_ROLES], async (req: NextRequest, ctx) => {
  try {
    const body = await req.json();
    const input = createSchema.parse(body);

    const address = await prisma.$transaction(async (tx) => {
      let outletId: string | undefined;

      if (ctx.activeBusinessAccountId) {
        // First real address adopts the empty placeholder primary outlet instead
        // of spawning a duplicate that leaves the primary stuck "Address needed".
        const { outlet } = await adoptOrCreateOutlet(tx, ctx.activeBusinessAccountId, {
          name: input.businessName || input.label || 'Branch Outlet',
          addressLine: input.fullAddress,
          flatInfo: input.flatInfo,
          landmark: input.landmark,
          city: input.city,
          state: input.state,
          pincode: input.pincode,
          latitude: input.latitude,
          longitude: input.longitude,
          placeId: input.placeId,
        });
        outletId = outlet.id;

        if (input.isDefault) {
          await tx.businessAccount.update({
            where: { id: ctx.activeBusinessAccountId },
            data: { primaryOutletId: outlet.id },
          });
        }
      }

      // Unset any existing default if this one is flagged as default
      if (input.isDefault) {
        await tx.savedAddress.updateMany({
          where: { userId: ctx.userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      // Sync pincode + businessName onto the User row if not yet set —
      // the profile-completion check reads from User, not SavedAddress
      const userPatch: Record<string, string> = {};
      if (input.pincode || input.businessName) {
        const current = await tx.user.findUnique({
          where: { id: ctx.userId },
          select: { pincode: true, businessName: true },
        });
        if (input.pincode && !current?.pincode) userPatch.pincode = input.pincode;
        if (input.businessName && !current?.businessName) userPatch.businessName = input.businessName;
        if (Object.keys(userPatch).length > 0) {
          await tx.user.update({ where: { id: ctx.userId }, data: userPatch });
        }
      }

      return tx.savedAddress.create({
        data: {
          userId: ctx.userId,
          outletId: outletId,
          label: input.label,
          businessName: input.businessName,
          fullAddress: input.fullAddress,
          shortAddress: input.shortAddress,
          flatInfo: input.flatInfo,
          landmark: input.landmark,
          pincode: input.pincode,
          city: input.city,
          state: input.state,
          latitude: input.latitude,
          longitude: input.longitude,
          placeId: input.placeId,
          isDefault: input.isDefault,
        },
      });
    });

    return NextResponse.json({ success: true, data: address }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
