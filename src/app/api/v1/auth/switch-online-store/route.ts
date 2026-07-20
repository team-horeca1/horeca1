/**
 * POST /api/v1/auth/switch-online-store
 *
 * Switch the active Online Store (Vendor) within the current Business.
 * Client follows with session.update({ activeVendorId }).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { Errors, errorResponse } from '@/middleware/errorHandler';

const Body = z.object({
  vendorId: z.string().uuid(),
  businessAccountId: z.string().uuid().optional(),
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const json = await req.json().catch(() => ({}));
    const { vendorId, businessAccountId } = Body.parse(json);

    // Resolve store first so admin impersonation (JWT BA ≠ vendor BA) still works.
    const store = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, defaultOutletId: true, userId: true, businessAccountId: true },
    });
    if (!store) throw Errors.notFound('Online Store');

    const impersonatedVendorId = req.cookies.get('admin_impersonate_vendor_id')?.value;
    const baId =
      businessAccountId
      ?? (ctx.role === 'admin' && impersonatedVendorId === vendorId
        ? store.businessAccountId
        : null)
      ?? ctx.activeBusinessAccountId
      ?? store.businessAccountId;

    if (store.businessAccountId !== baId) {
      throw Errors.badRequest('Online Store does not belong to this Business');
    }

    const membership = await prisma.businessAccountMember.findUnique({
      where: { userId_businessAccountId: { userId: ctx.userId, businessAccountId: baId } },
      select: { id: true },
    });
    if (!membership && ctx.role !== 'admin') {
      throw Errors.forbidden('You are not a member of this Business');
    }

    // Store-scoped users may only switch among assigned stores
    if (ctx.role !== 'admin' && store.userId !== ctx.userId) {
      const businessWide = await prisma.userRole.findFirst({
        where: {
          userId: ctx.userId,
          businessAccountId: baId,
          vendorId: null,
          role: { name: { not: { startsWith: 'Storefront' } } },
        },
        select: { id: true },
      });
      if (!businessWide) {
        const storeRole = await prisma.userRole.findFirst({
          where: { userId: ctx.userId, businessAccountId: baId, vendorId },
          select: { id: true },
        });
        const team = await prisma.vendorTeamMember.findFirst({
          where: { userId: ctx.userId, vendorId },
          select: { id: true },
        });
        if (!storeRole && !team) {
          throw Errors.forbidden('You do not have access to this Online Store');
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        businessAccountId: baId,
        vendorId: store.id,
        outletId: store.defaultOutletId,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
