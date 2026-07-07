// GET    /api/v1/vendor/team/[id] — fetch a member's details + current outlet access
// PATCH  /api/v1/vendor/team/[id] — update role and/or outlet access
// DELETE /api/v1/vendor/team/[id] — remove a member from the vendor team

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission, sanitizePermissionsForScope } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { markSessionStale } from '@/lib/sessionStale';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { toTeamMemberDTO, teamMemberInclude } from '@/lib/teamMemberShape';
import type { AuthContext } from '@/middleware/auth';
import type { TeamRole } from '@prisma/client';

const updateSchema = z.object({
  roleId: z.string().uuid().optional(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
  outletIds: z.array(z.string().uuid()).optional(),
  storefrontAccess: z.object({
    view: z.boolean().optional(),
    order: z.boolean().optional(),
    pay: z.boolean().optional(),
  }).optional(),
}).refine(d => d.roleId || d.permissions || d.outletIds !== undefined || d.storefrontAccess !== undefined, {
  message: 'Nothing to update',
});

const VENDOR_ROLE_TO_ENUM: Record<string, TeamRole> = {
  'Vendor Admin': 'owner',
  'Vendor Manager': 'manager',
  'Vendor Editor': 'editor',
  'Vendor Viewer': 'viewer',
};

// Rank for team-role comparisons. A member can only mutate members ranked
// below them; the vendor account owner (Vendor.userId) has no team-member
// row and is treated as the maximum rank.
const ENUM_RANK: Record<TeamRole, number> = { owner: 80, manager: 60, editor: 40, viewer: 20 };
const VENDOR_OWNER_RANK = 100;

async function vendorMemberRank(ctx: AuthContext, vendorId: string): Promise<number> {
  // Platform admins impersonating a vendor (via admin_impersonate_vendor_id
  // cookie) aren't in Vendor.userId OR VendorTeamMember — without this
  // bypass they'd be treated as rank 0 and refused every mutation.
  if (ctx.role === 'admin') return Number.MAX_SAFE_INTEGER;

  // A user listed on the Vendor row directly (Vendor.userId) is the account
  // owner — outranks everyone, including 'owner'-enum team members.
  const ownerVendor = await prisma.vendor.findFirst({
    where: { id: vendorId, userId: ctx.userId },
    select: { id: true },
  });
  if (ownerVendor) return VENDOR_OWNER_RANK;
  const m = await prisma.vendorTeamMember.findFirst({
    where: { userId: ctx.userId, vendorId },
    select: { role: true },
  });
  return m ? ENUM_RANK[m.role] : 0;
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).sort().map(([k, val]) => [k, sortKeys(val)]),
    );
  }
  return v;
}

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

export const GET = vendorOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    const id = extractId(req);

    const member = await prisma.vendorTeamMember.findFirst({
      where: { id, vendorId },
      include: teamMemberInclude,
    });
    if (!member) throw Errors.notFound('Team member not found');

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { businessAccountId: true },
    });
    if (!vendor) throw Errors.notFound('Vendor not found');

    // Fetch outlet-scoped UserRoles for this member (excluding storefront roles).
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId: member.userId,
        businessAccountId: vendor.businessAccountId,
        role: { scope: 'vendor', name: { not: { startsWith: 'Storefront' } } },
      },
      select: { outletId: true },
    });
    const hasAccountWide = userRoles.some(r => r.outletId === null);
    const outletIds = hasAccountWide
      ? []
      : [...new Set(userRoles.filter(r => r.outletId !== null).map(r => r.outletId!))];

    // Storefront access
    const sfRole = await prisma.userRole.findFirst({
      where: {
        userId: member.userId,
        businessAccountId: vendor.businessAccountId,
        role: { scope: 'vendor', name: { startsWith: 'Storefront' } },
      },
      select: { role: { select: { permissions: true } } },
    });
    const sfPerms = (sfRole?.role?.permissions as Record<string, Record<string, boolean>> | null)?.storefront ?? {};

    const dto = toTeamMemberDTO({
      id: member.id,
      createdAt: member.createdAt,
      legacyRole: member.role,
      isOwner: false,
      user: member.user,
      roleRef: member.roleRef,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...dto,
        outletIds,
        storefrontAccess: { view: !!sfPerms.view, order: !!sfPerms.order, pay: !!sfPerms.pay },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'users.edit');
    const id = extractId(req);

    const member = await prisma.vendorTeamMember.findFirst({
      where: { id, vendorId },
      select: { id: true, role: true, roleId: true, userId: true },
    });
    if (!member) throw Errors.notFound('Team member not found');

    // Rank check — same logic as DELETE. Without this, a Manager could PATCH
    // an Admin down to Viewer and then act as them.
    if (member.userId !== ctx.userId) {
      const callerRank = await vendorMemberRank(ctx, vendorId);
      const targetRank = ENUM_RANK[member.role];
      if (callerRank <= targetRank) {
        throw Errors.forbidden('You cannot change the role of a peer or higher-ranked team member');
      }
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { businessAccountId: true },
    });
    if (!vendor) throw Errors.notFound('Vendor not found');
    const { businessAccountId } = vendor;
    const userId = member.userId;

    const body = await req.json();
    const input = updateSchema.parse(body);

    // Resolve new role (if roleId or permissions provided).
    let role: { id: string; name: string; scope: string; description: string | null } | null = null;

    if (input.roleId) {
      const found = await prisma.accountRole.findUnique({
        where: { id: input.roleId },
        select: { id: true, name: true, scope: true, description: true },
      });
      if (!found || found.scope !== 'vendor') throw Errors.badRequest('roleId must reference a vendor-scope role');
      role = found;
    } else if (input.permissions) {
      const sanitized = sanitizePermissionsForScope(input.permissions, 'vendor');
      const sanitizedStr = JSON.stringify(sortKeys(sanitized));
      const candidates = await prisma.accountRole.findMany({
        where: { scope: 'vendor', OR: [{ isTemplate: true, businessAccountId: null }, { businessAccountId }] },
        select: { id: true, name: true, scope: true, description: true, permissions: true },
      });
      const match = candidates.find(r => JSON.stringify(sortKeys(r.permissions as Record<string, unknown>)) === sanitizedStr);
      if (match) {
        role = { id: match.id, name: match.name, scope: match.scope, description: match.description };
      } else {
        const customName = `Custom (${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })})`;
        role = await prisma.accountRole.upsert({
          where: { businessAccountId_name: { businessAccountId, name: customName } },
          create: {
            businessAccountId,
            name: customName,
            scope: 'vendor',
            permissions: sanitized,
            isTemplate: false,
            createdBy: ctx.userId,
          },
          update: { permissions: sanitized },
          select: { id: true, name: true, scope: true, description: true },
        });
      }
    }

    const outletTargets: (string | null)[] | null =
      input.outletIds !== undefined
        ? (input.outletIds.length > 0 ? input.outletIds : [null])
        : null;

    await prisma.$transaction(async (tx) => {
      // Update role if changed.
      if (role) {
        const legacyEnum: TeamRole = VENDOR_ROLE_TO_ENUM[role.name] ?? 'viewer';
        await tx.vendorTeamMember.update({
          where: { id: member.id },
          data: { roleId: role.id, role: legacyEnum },
        });
      }

      // Replace vendor-scope non-storefront UserRoles when role or outlets change.
      if (role || outletTargets !== null) {
        const effectiveRoleId = role?.id ?? member.roleId;
        if (effectiveRoleId) {
          await tx.userRole.deleteMany({
            where: { userId, businessAccountId, role: { scope: 'vendor', name: { not: { startsWith: 'Storefront' } } } },
          });
          const targets = outletTargets ?? [null];
          for (const outletId of targets) {
            await tx.userRole.create({
              data: { userId, businessAccountId, outletId: outletId ?? null, roleId: effectiveRoleId },
            });
          }
        }
      }

      // Update storefront access if provided.
      const sf = input.storefrontAccess;
      if (sf !== undefined) {
        // Remove existing storefront role(s) for this user+account.
        await tx.userRole.deleteMany({
          where: { userId, businessAccountId, role: { scope: 'vendor', name: { startsWith: 'Storefront' } } },
        });
        if (sf.view || sf.order || sf.pay) {
          const sfPermissions = {
            storefront: {
              ...(sf.view  && { view:  true }),
              ...(sf.order && { order: true }),
              ...(sf.pay   && { pay:   true }),
            },
          };
          const parts = Object.keys(sfPermissions.storefront);
          const sfRoleName = `Storefront (${parts.join('+')})`;
          let sfRole = await tx.accountRole.findFirst({
            where: { businessAccountId, scope: 'vendor', name: sfRoleName },
            select: { id: true },
          });
          if (!sfRole) {
            sfRole = await tx.accountRole.create({
              data: { businessAccountId, name: sfRoleName, scope: 'vendor', permissions: sfPermissions, isTemplate: false, description: 'Storefront buyer access' },
              select: { id: true },
            });
          }
          await tx.userRole.create({
            data: { userId, businessAccountId, outletId: null, roleId: sfRole.id },
          });
        }
      }
    });

    // Mark the affected user's session stale so the next auth() call reloads permissions.
    await markSessionStale(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = vendorOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'users.delete');
    const id = extractId(req);

    const member = await prisma.vendorTeamMember.findFirst({
      where: { id, vendorId },
      select: { id: true, userId: true, role: true },
    });
    if (!member) throw Errors.notFound('Team member not found');

    if (member.userId === ctx.userId) {
      throw Errors.badRequest('You cannot remove yourself from the team');
    }

    // Rank check — caller must outrank target. Without this, a Vendor Manager
    // with users.delete could remove the Vendor Admin and seize the account.
    const callerRank = await vendorMemberRank(ctx, vendorId);
    const targetRank = ENUM_RANK[member.role];
    if (callerRank <= targetRank) {
      throw Errors.forbidden('You cannot remove a peer or higher-ranked team member');
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { businessAccountId: true },
    });
    if (!vendor) throw Errors.notFound('Vendor not found');

    await prisma.$transaction(async (tx) => {
      await tx.vendorTeamMember.delete({ where: { id: member.id } });

      await tx.userRole.deleteMany({
        where: {
          userId: member.userId,
          businessAccountId: vendor.businessAccountId,
          role: { scope: 'vendor' },
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
