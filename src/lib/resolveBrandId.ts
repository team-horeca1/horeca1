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
    // Admin View cookie wins over the admin's own JWT brand (avoids session bleed).
    // Same order as resolveVendorContext.
    const impersonateId = req.cookies.get('admin_impersonate_brand_id')?.value;
    if (impersonateId) {
      const brand = await prisma.brand.findUnique({ where: { id: impersonateId }, select: { id: true } });
      if (!brand) throw Errors.forbidden('Impersonated brand not found');
      return { brandId: brand.id, teamRole: 'owner' };
    }

    // Navbar account switcher: admin opened a brand they own, no impersonation cookie.
    if (ctx.activeBusinessAccountId) {
      const ownBrand = await prisma.brand.findFirst({
        where: { userId: ctx.userId, businessAccountId: ctx.activeBusinessAccountId },
        select: { id: true },
      });
      if (ownBrand) return { brandId: ownBrand.id, teamRole: 'owner' };
    }
    throw Errors.forbidden('No brand selected for admin view. Go back and click "View Portal" on a brand.');
  }

  if (ctx.activeBrandId) {
    const brand = await prisma.brand.findUnique({
      where: { id: ctx.activeBrandId },
      select: { id: true, userId: true, businessAccountId: true },
    });
    const baOk = !ctx.activeBusinessAccountId
      || brand?.businessAccountId === ctx.activeBusinessAccountId;
    if (brand && baOk) {
      return {
        brandId: brand.id,
        teamRole: await resolveBrandTeamRole(ctx, brand.id, brand.userId),
      };
    }
  }

  // Check direct ownership first — scoped to the active business account
  // because Brand.userId is no longer unique (one User can own multiple
  // brand profiles, one per BusinessAccount).
  const ownBrand = await prisma.brand.findFirst({
    where: {
      userId: ctx.userId,
      ...(ctx.activeBusinessAccountId ? { businessAccountId: ctx.activeBusinessAccountId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (ownBrand) return { brandId: ownBrand.id, teamRole: 'owner' };

  // Check team membership scoped to active account.
  const membership = await prisma.brandTeamMember.findFirst({
    where: {
      userId: ctx.userId,
      ...(ctx.activeBusinessAccountId ? { brand: { businessAccountId: ctx.activeBusinessAccountId } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: { brandId: true, role: true },
  });
  if (!membership) throw Errors.forbidden('No brand profile linked to your account');
  return { brandId: membership.brandId, teamRole: membership.role };
}

async function resolveBrandTeamRole(
  ctx: AuthContext,
  brandId: string,
  brandOwnerUserId: string | null,
): Promise<TeamRole | 'owner'> {
  if (ctx.activeBrandTeamRole) return ctx.activeBrandTeamRole;
  if (brandOwnerUserId === ctx.userId) return 'owner';
  const m = await prisma.brandTeamMember.findFirst({
    where: { brandId, userId: ctx.userId },
    select: { role: true },
  });
  return m?.role ?? 'viewer';
}

// Backward-compatible wrappers
export async function resolveBrandId(ctx: AuthContext, req: NextRequest): Promise<string> {
  return (await resolveBrandContext(ctx, req)).brandId;
}

export async function resolveUserId(ctx: AuthContext, req: NextRequest): Promise<string> {
  if (ctx.role === 'admin') {
    // Impersonation cookie first — same priority as resolveBrandContext.
    const impersonateId = req.cookies.get('admin_impersonate_brand_id')?.value;
    if (impersonateId) {
      const brand = await prisma.brand.findUnique({ where: { id: impersonateId }, select: { userId: true } });
      if (!brand) throw Errors.forbidden('Impersonated brand not found');
      // Lightweight (label-only) brands have no linked account to act as.
      if (!brand.userId) throw Errors.forbidden('This brand has no linked account');
      return brand.userId;
    }
    if (ctx.activeBusinessAccountId) {
      const ownBrand = await prisma.brand.findFirst({
        where: { userId: ctx.userId, businessAccountId: ctx.activeBusinessAccountId },
        select: { id: true },
      });
      if (ownBrand) return ctx.userId;
    }
    throw Errors.forbidden('No brand selected for admin view.');
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
    where: {
      userId: ctx.userId,
      ...(ctx.activeBusinessAccountId ? { brand: { businessAccountId: ctx.activeBusinessAccountId } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: { brand: { select: { userId: true } } },
  });
  if (!membership) throw Errors.forbidden('No brand profile linked to your account');
  if (!membership.brand.userId) throw Errors.forbidden('This brand has no linked account');
  return membership.brand.userId;
}
