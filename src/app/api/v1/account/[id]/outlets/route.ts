/**
 * GET  /api/v1/account/[id]/outlets — list outlets in the account
 * POST /api/v1/account/[id]/outlets — create a new outlet (requires outlets.create)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { errorResponse } from '@/middleware/errorHandler';
import { assertAccountMember, assertCanMutateAccount } from '@/lib/accountAccess';
import { adoptOrCreateOutlet, softDeactivateDuplicateActiveOutlets } from '@/lib/outletWrites';
import { ensureInventoryRowsForOutlet } from '@/lib/inventoryOutlet';
import {
  effectiveCustomerUserId,
  isImpersonatingBusinessAccount,
} from '@/lib/resolveCustomerImpersonation';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const id = extractAccountId(req);
    // GET: membership (or impersonation) is enough — seeded customers often have
    // BA membership without Owner UserRole, so outlets.view would 403 (AUD-003).
    // Mutations below still require outlets.create|edit|delete.
    if (!isImpersonatingBusinessAccount(ctx, id)) {
      await assertAccountMember(ctx.userId, id);
    }
    // Clean multi-click clones before listing (idempotent soft-deactivate).
    await softDeactivateDuplicateActiveOutlets(id).catch(() => 0);
    const outlets = await prisma.outlet.findMany({
      where: { businessAccountId: id, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ success: true, data: outlets });
  } catch (err) { return errorResponse(err); }
});

const CreateBody = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(50).nullable().optional(),
  addressLine: z.string().min(1),
  flatInfo: z.string().max(255).nullable().optional(),
  landmark: z.string().max(255).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  pincode: z.string().max(10).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  placeId: z.string().max(500).nullable().optional(),
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const id = extractAccountId(req);
    await assertCanMutateAccount(ctx, id, 'outlets.create', ctx.activeOutletId);
    const body = CreateBody.parse(await req.json());
    const ownerUserId = effectiveCustomerUserId(ctx);

    const result = await prisma.$transaction(async (tx) => {
      // First real address adopts the empty placeholder primary outlet instead of
      // spawning a duplicate that leaves the primary stuck "Address needed".
      const { outlet, adopted } = await adoptOrCreateOutlet(tx, id, {
        name: body.name,
        code: body.code,
        addressLine: body.addressLine,
        flatInfo: body.flatInfo,
        landmark: body.landmark,
        city: body.city,
        state: body.state,
        pincode: body.pincode,
        latitude: body.latitude,
        longitude: body.longitude,
        placeId: body.placeId,
      });

      // Keep the linked SavedAddress in sync. Use the outlet's own name (preserved
      // on an adopted primary) so the two never drift apart.
      const savedData = {
        label: outlet.name || 'Branch Outlet',
        businessName: outlet.name,
        fullAddress: body.addressLine,
        shortAddress: body.addressLine.split(',').slice(0, 2).join(', '),
        flatInfo: body.flatInfo,
        landmark: body.landmark,
        pincode: body.pincode,
        city: body.city,
        state: body.state,
        latitude: body.latitude ?? 0,
        longitude: body.longitude ?? 0,
        placeId: body.placeId,
      };
      const existingSaved = adopted
        ? await tx.savedAddress.findFirst({ where: { outletId: outlet.id }, select: { id: true } })
        : null;
      if (existingSaved) {
        await tx.savedAddress.update({ where: { id: existingSaved.id }, data: savedData });
      } else {
        await tx.savedAddress.create({
          data: { userId: ownerUserId, outletId: outlet.id, isDefault: false, ...savedData },
        });
      }

      return { outlet, adopted };
    });

    if (!result.adopted) {
      const vendor = await prisma.vendor.findUnique({
        where: { businessAccountId: id },
        select: { id: true },
      });
      if (vendor) {
        await ensureInventoryRowsForOutlet(vendor.id, result.outlet.id);
      }
    }

    return NextResponse.json({ success: true, data: result.outlet }, { status: 201 });
  } catch (err) { return errorResponse(err); }
});

function extractAccountId(req: NextRequest): string {
  // /api/v1/account/<id>/outlets
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return segments[segments.length - 2];
}
