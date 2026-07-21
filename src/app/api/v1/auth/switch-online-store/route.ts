/**
 * POST /api/v1/auth/switch-online-store
 *
 * Switch the active Online Store (Vendor). The store's BusinessAccount is the
 * source of truth — do not prefer a stale JWT activeBusinessAccountId.
 * Client follows with session.update({ activeVendorId, activeBusinessAccountId }).
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

    const store = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, defaultOutletId: true, userId: true, businessAccountId: true },
    });
    if (!store) throw Errors.notFound('Online Store');

    // Optional body BA must match the store; otherwise always use the store's BA.
    if (businessAccountId && businessAccountId !== store.businessAccountId) {
      throw Errors.badRequest('Online Store does not belong to this Business');
    }
    const baId = store.businessAccountId;

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
