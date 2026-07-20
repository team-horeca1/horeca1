// resolveVendorId — shared helper for all vendor API routes
// Supports: admin impersonation, direct vendor owners, and team members.

import { NextRequest } from 'next/server';
import type { TeamRole } from '@prisma/client';
import type { AuthContext } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';

export interface VendorContext {
  vendorId: string;
  teamRole: TeamRole | 'owner';
}

export async function resolveVendorContext(ctx: AuthContext, req: NextRequest): Promise<VendorContext> {
  if (ctx.role === 'admin') {
    // Prefer JWT active Online Store when it belongs to the admin's active BA.
    if (ctx.activeVendorId && ctx.activeBusinessAccountId) {
      const active = await prisma.vendor.findFirst({
        where: { id: ctx.activeVendorId, businessAccountId: ctx.activeBusinessAccountId },
        select: { id: true },
      });
      if (active) return { vendorId: active.id, teamRole: 'owner' };
    }
    if (ctx.activeBusinessAccountId) {
      const ownVendor = await prisma.vendor.findFirst({
        where: { userId: ctx.userId, businessAccountId: ctx.activeBusinessAccountId },
        orderBy: [{ isPrimaryStore: 'desc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      if (ownVendor) return { vendorId: ownVendor.id, teamRole: 'owner' };
    }

    const impersonateId = req.cookies.get('admin_impersonate_vendor_id')?.value;
    if (!impersonateId) throw Errors.forbidden('No Online Store selected for admin view. Go back and click "View Dashboard" on a supplier store.');
    const vendor = await prisma.vendor.findUnique({ where: { id: impersonateId }, select: { id: true } });
    if (!vendor) throw Errors.forbidden('Impersonated Online Store not found');
    return { vendorId: vendor.id, teamRole: 'owner' };
  }

  if (ctx.activeVendorId) {
    // Validate store still belongs to active Business when BA is set.
    if (ctx.activeBusinessAccountId) {
      const ok = await prisma.vendor.findFirst({
        where: { id: ctx.activeVendorId, businessAccountId: ctx.activeBusinessAccountId },
        select: { id: true },
      });
      if (ok) {
        return {
          vendorId: ctx.activeVendorId,
          teamRole: ctx.activeVendorTeamRole ?? 'owner',
        };
      }
    } else {
      return {
        vendorId: ctx.activeVendorId,
        teamRole: ctx.activeVendorTeamRole ?? 'owner',
      };
    }
  }

  // Prefer primary Online Store under the active Business.
  const ownVendor = await prisma.vendor.findFirst({
    where: {
      userId: ctx.userId,
      ...(ctx.activeBusinessAccountId ? { businessAccountId: ctx.activeBusinessAccountId } : {}),
    },
    orderBy: [{ isPrimaryStore: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, businessAccountId: true },
  });
  if (ownVendor) return { vendorId: ownVendor.id, teamRole: 'owner' };

  const membership = await prisma.vendorTeamMember.findFirst({
    where: {
      userId: ctx.userId,
      ...(ctx.activeBusinessAccountId
        ? { vendor: { businessAccountId: ctx.activeBusinessAccountId } }
        : {}),
    },
    select: { vendorId: true, role: true },
  });
  if (!membership) throw Errors.forbidden('No Online Store linked to your account');
  return { vendorId: membership.vendorId, teamRole: membership.role };
}

/**
 * User id whose in-app notifications to show in the vendor portal.
 * Under Admin View, JWT userId is the admin — use the impersonated vendor owner.
 */
export async function resolveVendorNotificationUserId(
  ctx: AuthContext,
  req: NextRequest,
): Promise<string> {
  return resolveSupplierActorUserId(ctx, req);
}

/**
 * Supplier (User) id for Foundation APIs under Admin View.
 * JWT stays admin — resolve the impersonated Online Store's owner instead.
 */
export async function resolveSupplierActorUserId(
  ctx: AuthContext,
  req: NextRequest,
): Promise<string> {
  const impersonateId = req.cookies.get('admin_impersonate_vendor_id')?.value;
  if (ctx.role === 'admin' && impersonateId) {
    const vendor = await prisma.vendor.findUnique({
      where: { id: impersonateId },
      select: { userId: true },
    });
    if (vendor?.userId) return vendor.userId;
  }
  return ctx.userId;
}

// Backward-compatible wrapper — all existing routes that only need the ID still work
export async function resolveVendorId(ctx: AuthContext, req: NextRequest): Promise<string> {
  return (await resolveVendorContext(ctx, req)).vendorId;
}
