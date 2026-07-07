// resolveBrandId — shared helper for all brand API routes
// Supports: admin impersonation, direct brand owners, and team members.

import { NextRequest } from 'next/server';
import type { TeamRole } from '@prisma/client';
import type { AuthContext } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';

export interface BrandContext {
  brandId: string;
  teamRole: TeamRole | 'owner';
}

export async function resolveBrandContext(ctx: AuthContext, req: NextRequest): Promise<BrandContext> {
  if (ctx.role === 'admin') {
    // V2.2: admin who created a brand BA themselves and switched into it via
    // the navbar account switcher → use that brand without requiring the
    // impersonation cookie. See resolveVendorContext for the same pattern.
    if (ctx.activeBusinessAccountId) {
      const ownBrand = await prisma.brand.findFirst({
        where: { userId: ctx.userId, businessAccountId: ctx.activeBusinessAccountId },
        select: { id: true },
      });
      if (ownBrand) return { brandId: ownBrand.id, teamRole: 'owner' };
    }
    const impersonateId = req.cookies.get('admin_impersonate_brand_id')?.value;
    if (!impersonateId) throw Errors.forbidden('No brand selected for admin view. Go back and click "View Portal" on a brand.');
    const brand = await prisma.brand.findUnique({ where: { id: impersonateId }, select: { id: true } });
    if (!brand) throw Errors.forbidden('Impersonated brand not found');
    return { brandId: brand.id, teamRole: 'owner' };
  }

  if (ctx.activeBrandId) {
    return {
      brandId: ctx.activeBrandId,
      teamRole: ctx.activeBrandTeamRole ?? 'owner',
    };
  }

  // Check direct ownership first — scoped to the active business account
  // because Brand.userId is no longer unique (one User can own multiple
  // brand profiles, one per BusinessAccount).
  const ownBrand = await prisma.brand.findFirst({
    where: {
      userId: ctx.userId,
      ...(ctx.activeBusinessAccountId ? { businessAccountId: ctx.activeBusinessAccountId } : {}),
    },
    select: { id: true },
  });
  if (ownBrand) return { brandId: ownBrand.id, teamRole: 'owner' };

  // Check team membership scoped to active account.
  const membership = await prisma.brandTeamMember.findFirst({
    where: {
      userId: ctx.userId,
      ...(ctx.activeBusinessAccountId ? { brand: { businessAccountId: ctx.activeBusinessAccountId } } : {}),
    },
    select: { brandId: true, role: true },
  });
  if (!membership) throw Errors.forbidden('No brand profile linked to your account');
  return { brandId: membership.brandId, teamRole: membership.role };
}

// Backward-compatible wrappers
export async function resolveBrandId(ctx: AuthContext, req: NextRequest): Promise<string> {
  return (await resolveBrandContext(ctx, req)).brandId;
}

export async function resolveUserId(ctx: AuthContext, req: NextRequest): Promise<string> {
  if (ctx.role === 'admin') {
    // Owned-on-active-BA first, impersonation second (same priority as
    // resolveBrandContext above).
    if (ctx.activeBusinessAccountId) {
      const ownBrand = await prisma.brand.findFirst({
        where: { userId: ctx.userId, businessAccountId: ctx.activeBusinessAccountId },
        select: { id: true },
      });
      // Matched on userId: ctx.userId, so the owner is the caller.
      if (ownBrand) return ctx.userId;
    }
    const impersonateId = req.cookies.get('admin_impersonate_brand_id')?.value;
    if (!impersonateId) throw Errors.forbidden('No brand selected for admin view.');
    const brand = await prisma.brand.findUnique({ where: { id: impersonateId }, select: { userId: true } });
    if (!brand) throw Errors.forbidden('Impersonated brand not found');
    // Lightweight (label-only) brands have no linked account to act as.
    if (!brand.userId) throw Errors.forbidden('This brand has no linked account');
    return brand.userId;
  }
  // Owner path — Brand.userId no longer unique, prefer active account.
  const ownBrand = await prisma.brand.findFirst({
    where: {
      userId: ctx.userId,
      ...(ctx.activeBusinessAccountId ? { businessAccountId: ctx.activeBusinessAccountId } : {}),
    },
    select: { id: true },
  });
  // Matched on userId: ctx.userId, so the owner is the caller.
  if (ownBrand) return ctx.userId;

  // Team member — return the brand owner's userId
  const membership = await prisma.brandTeamMember.findFirst({
    where: { userId: ctx.userId },
    select: { brand: { select: { userId: true } } },
  });
  if (!membership) throw Errors.forbidden('No brand profile linked to your account');
  if (!membership.brand.userId) throw Errors.forbidden('This brand has no linked account');
  return membership.brand.userId;
}
