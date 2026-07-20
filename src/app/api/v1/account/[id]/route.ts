/**
 * GET    /api/v1/account/[id] — read account details (any member)
 * PATCH  /api/v1/account/[id] — update account metadata (requires settings.edit)
 * DELETE /api/v1/account/[id] — HARD-delete the BusinessAccount and everything
 *                               attached to it (outlets, members, roles, vendor
 *                               profile, brand profile, products, inventory,
 *                               team members, etc.). Owner-only OR User.role=
 *                               'admin'. Refuses if the BA has any Order rows
 *                               so we never destroy financial history. Caller
 *                               MUST send { confirm: '<legal-name>' } in body
 *                               so an accidental DELETE call without the typed
 *                               confirmation rolls back.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { assertAccountMember, assertCanMutateAccount, isAdminActingAsBusinessAccount } from '@/lib/accountAccess';
import { markSessionStale } from '@/lib/sessionStale';

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const id = extractId(_req);
    if (!(await isAdminActingAsBusinessAccount(ctx, id))) {
      await assertAccountMember(ctx.userId, id);
    }
    const account = await prisma.businessAccount.findUnique({
      where: { id },
      select: {
        id: true, legalName: true, displayName: true, gstin: true, pan: true,
        businessType: true, isCustomer: true, isVendor: true, isBrand: true, status: true,
        primaryOutletId: true, createdAt: true, updatedAt: true,
        outlets: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, code: true, addressLine: true, city: true, state: true, pincode: true, isActive: true, requiresAddressUpdate: true },
        },
        _count: { select: { members: true, roles: true } },
      },
    });
    if (!account) throw Errors.notFound('Business account');
    return NextResponse.json({ success: true, data: account });
  } catch (err) { return errorResponse(err); }
});

const PatchBody = z.object({
  legalName: z.string().min(2).max(255).optional(),
  displayName: z.string().max(255).nullable().optional(),
  gstin: z.string().max(20).nullable().optional(),
  pan: z.string().max(20).nullable().optional(),
  businessType: z.string().max(50).nullable().optional(),
  primaryOutletId: z.string().uuid().nullable().optional(),
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    const id = extractId(req);
    await assertCanMutateAccount(ctx, id, 'settings.edit', ctx.activeOutletId);
    const body = PatchBody.parse(await req.json());

    // If changing primaryOutletId, verify it belongs to this account.
    if (body.primaryOutletId) {
      const ok = await prisma.outlet.findFirst({
        where: { id: body.primaryOutletId, businessAccountId: id },
        select: { id: true },
      });
      if (!ok) throw Errors.badRequest('primaryOutletId must reference an outlet of this account');
    }
    const updated = await prisma.businessAccount.update({ where: { id }, data: body });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) { return errorResponse(err); }
});

const DeleteBody = z.object({
  // Caller must type the BA's legalName exactly. The form on the client
  // submits whatever the user typed; we compare server-side. Without this
  // a misfired DELETE could wipe the wrong BA.
  confirm: z.string().min(1),
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  try {
    if (ctx.impersonatedCustomer) {
      return NextResponse.json(
        { success: false, error: { message: 'Cannot delete account while in admin view mode' } },
        { status: 403 },
      );
    }
    const id = extractId(req);
    const { confirm } = DeleteBody.parse(await req.json().catch(() => ({})));

    // Load BA + the caller's membership + counts in one go so we can authorise
    // and check safety in a single round-trip before the destructive tx.
    const ba = await prisma.businessAccount.findUnique({
      where: { id },
      select: {
        id: true, legalName: true,
        isVendor: true, isBrand: true,
        members: {
          where: { userId: ctx.userId },
          select: { isPrimary: true },
          take: 1,
        },
        _count: { select: { orders: true } },
      },
    });
    if (!ba) throw Errors.notFound('Business account');

    // Typed-name guard. Compare case-sensitive; legalName is the canonical
    // string the user can see in Profile → Account Overview.
    if (confirm !== ba.legalName) {
      throw Errors.badRequest(`Type the business name exactly to confirm: "${ba.legalName}"`);
    }

    // Authz: must be the BA primary owner OR a platform admin. We deliberately
    // do NOT use assertAccountPermission('settings.edit') here — a manager-
    // level teammate has settings.edit but should NOT be able to nuke the
    // whole account.
    const callerMembership = ba.members[0];
    const isOwner = !!callerMembership?.isPrimary;
    const isAdmin = ctx.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw Errors.forbidden('Only the account owner (or a platform admin) can delete this business account');
    }

    // Safety net: never wipe a BA that has Orders. The user's "hard cascade"
    // intent is for test data; orders mean real business happened. If the
    // caller still wants to retire the BA, use PATCH status='deactivated'
    // (no current frontend path but the column exists).
    if (ba._count.orders > 0) {
      throw Errors.badRequest('This account has order history and cannot be hard-deleted. Archive it instead.');
    }

    // Refuse to delete the caller's currently-active BA — they'd be stranded
    // with a stale session pointing at a deleted row. They must switch to a
    // different BA first.
    if (ctx.activeBusinessAccountId === id) {
      throw Errors.badRequest('Switch to a different business account before deleting this one.');
    }

    // Find the vendor / brand attached so we can cascade their dependent
    // rows before deleting the parent. Schema cascades members, outlets,
    // accountRoles, userRoles automatically, but Vendor / Brand and their
    // children do NOT cascade through BA — we wipe them by hand.
    const [vendors, brand, members] = await Promise.all([
      ba.isVendor ? prisma.vendor.findMany({ where: { businessAccountId: id }, select: { id: true } }) : [],
      ba.isBrand ? prisma.brand.findFirst({ where: { businessAccountId: id }, select: { id: true } }) : null,
      prisma.businessAccountMember.findMany({
        where: { businessAccountId: id },
        select: { userId: true },
      }),
    ]);
    const memberUserIds = [...new Set(members.map((m) => m.userId))];

    await prisma.$transaction(async (tx) => {
      for (const vendor of vendors) {
        const vendorId = vendor.id;
        // Clear default outlet FK before outlet cascade on BA delete
        await tx.vendor.update({ where: { id: vendorId }, data: { defaultOutletId: null } });
        // Children of the Online Store first.
        await tx.priceSlab.deleteMany({ where: { vendorId } });
        await tx.inventory.deleteMany({ where: { vendorId } });
        await tx.collectionProduct.deleteMany({ where: { product: { vendorId } } });
        await tx.product.deleteMany({ where: { vendorId } });
        await tx.serviceArea.deleteMany({ where: { vendorId } });
        await tx.deliverySlot.deleteMany({ where: { vendorId } });
        await tx.vendorTeamMember.deleteMany({ where: { vendorId } });
        await tx.vendorDocument.deleteMany({ where: { vendorId } });
        await tx.customerVendor.deleteMany({ where: { vendorId } });
        await tx.vendorCustomer.deleteMany({ where: { vendorId } });
        await tx.creditAccount.deleteMany({ where: { vendorId } });
        await tx.priceList.deleteMany({ where: { vendorId } });
        await tx.vendor.delete({ where: { id: vendorId } });
      }
      if (brand) {
        const brandId = brand.id;
        await tx.brandProductMapping.deleteMany({ where: { brandId } });
        await tx.brandMasterProduct.deleteMany({ where: { brandId } });
        await tx.brandTeamMember.deleteMany({ where: { brandId } });
        await tx.brand.delete({ where: { id: brandId } });
      }
      // Misc per-BA artefacts not covered by schema cascade.
      await tx.cart.deleteMany({ where: { businessAccountId: id } });
      await tx.quickOrderList.deleteMany({ where: { businessAccountId: id } });
      await tx.customerVendor.deleteMany({ where: { businessAccountId: id } });
      // Detach primaryOutletId so the FK doesn't block the outlets cascade.
      await tx.businessAccount.update({ where: { id }, data: { primaryOutletId: null } });
      // BA delete cascades: members, outlets, accountRoles, userRoles.
      await tx.businessAccount.delete({ where: { id } });
    });

    // Force permission reload for every former member (JWT may still point at this BA).
    await Promise.all(memberUserIds.map((userId) => markSessionStale(userId)));

    return NextResponse.json({ success: true });
  } catch (err) { return errorResponse(err); }
});

function extractId(req: NextRequest): string {
  // /api/v1/account/<id>
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return segments[segments.length - 1];
}
