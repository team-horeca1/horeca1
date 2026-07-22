// GET    /api/v1/vendor/team/[id] — fetch a member's details + business/store access
// PATCH  /api/v1/vendor/team/[id] — update role and/or business/store access
// DELETE /api/v1/vendor/team/[id] — remove a member from the vendor team

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { resolveVendorContext, resolveSupplierActorUserId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { markSessionStale } from '@/lib/sessionStale';
import { resolveTeamMemberRoleFromPermissions } from '@/lib/teamRoleWrites';
import { finalizeTeamMemberRemoval } from '@/lib/userHardDelete';
import { upsertTeamAccountMembership } from '@/lib/teamMembership';
import { listSupplierBusinesses } from '@/modules/supplier/supplier.service';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { toTeamMemberDTO, teamMemberInclude } from '@/lib/teamMemberShape';
import type { AuthContext } from '@/middleware/auth';
import type { TeamRole } from '@prisma/client';

const updateSchema = z.object({
  roleId: z.string().uuid().optional(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
  /** Legacy single-BA outlet scoping (customer warehouses). Prefer storeIds. */
  outletIds: z.array(z.string().uuid()).optional(),
  /** One or more Businesses the actor belongs to. */
  businessAccountIds: z.array(z.string().uuid()).min(1).optional(),
  /** Specific Online Stores under the target Business(es) (implies scope='store'). */
  storeIds: z.array(z.string().uuid()).optional(),
  /** business = all Online Stores under selected BAs; store = selected storeIds. */
  scope: z.enum(['business', 'store']).optional(),
  storefrontAccess: z.object({
    view: z.boolean().optional(),
    order: z.boolean().optional(),
    pay: z.boolean().optional(),
  }).optional(),
}).refine(
  (d) =>
    d.roleId
    || d.permissions
    || d.outletIds !== undefined
    || d.businessAccountIds !== undefined
    || d.storeIds !== undefined
    || d.scope !== undefined
    || d.storefrontAccess !== undefined,
  { message: 'Nothing to update' },
);

const VENDOR_ROLE_TO_ENUM: Record<string, TeamRole> = {
  'Vendor Admin': 'owner',
  'Vendor Manager': 'manager',
  'Sales Rep': 'editor',
  'Finance Executive': 'editor',
  'Order Manager': 'editor',
  'Warehouse Manager': 'editor',
  'Vendor Editor': 'editor',
  'Vendor Viewer': 'viewer',
};

const ENUM_RANK: Record<TeamRole, number> = { owner: 80, manager: 60, editor: 40, viewer: 20 };
const VENDOR_OWNER_RANK = 100;

async function vendorMemberRank(ctx: AuthContext, vendorId: string): Promise<number> {
  if (ctx.role === 'admin') return Number.MAX_SAFE_INTEGER;

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

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

async function actorBusinessIds(ctx: AuthContext, req: NextRequest): Promise<string[]> {
  const actorId = await resolveSupplierActorUserId(ctx, req);
  const businesses = await listSupplierBusinesses(actorId);
  return businesses.map((b) => b.id);
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

    const actorBaIds = await actorBusinessIds(ctx, req);
    const baScope = actorBaIds.length > 0 ? actorBaIds : [vendor.businessAccountId];

    const userRoles = await prisma.userRole.findMany({
      where: {
        userId: member.userId,
        businessAccountId: { in: baScope },
        role: { scope: 'vendor', name: { not: { startsWith: 'Storefront' } } },
      },
      select: { businessAccountId: true, vendorId: true, outletId: true },
    });

    const teamRows = await prisma.vendorTeamMember.findMany({
      where: {
        userId: member.userId,
        vendor: { businessAccountId: { in: baScope } },
      },
      select: { vendor: { select: { id: true, businessAccountId: true } } },
    });

    const businessAccountIds = [...new Set([
      ...userRoles.map((r) => r.businessAccountId),
      ...teamRows.map((t) => t.vendor.businessAccountId),
    ])];

    const hasBusinessWide = userRoles.some((r) => r.vendorId === null);
    const storeIds = hasBusinessWide
      ? []
      : [...new Set([
          ...userRoles.filter((r) => r.vendorId).map((r) => r.vendorId!),
          ...teamRows.map((t) => t.vendor.id),
        ])];

    // Legacy outlet-scoped rows (customer warehouses) — keep for older clients.
    const hasAccountWideOutlet = userRoles.some((r) => r.outletId === null && r.vendorId === null);
    const outletIds = hasAccountWideOutlet || hasBusinessWide
      ? []
      : [...new Set(userRoles.filter((r) => r.outletId !== null).map((r) => r.outletId!))];

    const sfRole = await prisma.userRole.findFirst({
      where: {
        userId: member.userId,
        businessAccountId: { in: baScope },
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
        businessAccountIds: businessAccountIds.length > 0 ? businessAccountIds : [vendor.businessAccountId],
        storeIds,
        scope: hasBusinessWide || storeIds.length === 0 ? 'business' : 'store',
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
    const userId = member.userId;

    const body = await req.json();
    const input = updateSchema.parse(body);

    // ── Multi-business / store access (supplier edit) ─────────────────────────
    if (input.businessAccountIds !== undefined || input.storeIds !== undefined || input.scope !== undefined) {
      const actorId = await resolveSupplierActorUserId(ctx, req);
      const actorBaIds = await actorBusinessIds(ctx, req);
      const requestedBaIds = [...new Set(
        input.businessAccountIds ?? [vendor.businessAccountId],
      )];

      for (const baId of requestedBaIds) {
        if (!actorBaIds.includes(baId) && baId !== vendor.businessAccountId) {
          throw Errors.forbidden('You are not a member of one of the selected businesses');
        }
        if (baId === vendor.businessAccountId) continue;
        const membership = await prisma.businessAccountMember.findUnique({
          where: { userId_businessAccountId: { userId: actorId, businessAccountId: baId } },
          select: { id: true },
        });
        if (!membership && !actorBaIds.includes(baId)) {
          throw Errors.forbidden('You are not a member of one of the selected businesses');
        }
      }

      const allBaStores = await prisma.vendor.findMany({
        where: { businessAccountId: { in: requestedBaIds } },
        orderBy: [{ isPrimaryStore: 'desc' }, { createdAt: 'asc' }],
        select: { id: true, businessAccountId: true },
      });
      if (allBaStores.length === 0) {
        throw Errors.badRequest('The selected business(es) have no Online Stores yet — create a store first');
      }

      const storesByBa = new Map<string, typeof allBaStores>();
      for (const s of allBaStores) {
        const list = storesByBa.get(s.businessAccountId) ?? [];
        list.push(s);
        storesByBa.set(s.businessAccountId, list);
      }
      for (const baId of requestedBaIds) {
        if ((storesByBa.get(baId) ?? []).length === 0) {
          throw Errors.badRequest('One of the selected businesses has no Online Stores yet — create a store first');
        }
      }

      const inviteScope = input.scope ?? (input.storeIds && input.storeIds.length > 0 ? 'store' : 'business');
      const validStoreIds = new Set(allBaStores.map((s) => s.id));
      if (inviteScope === 'store' && input.storeIds && input.storeIds.length > 0) {
        if (input.storeIds.some((sid) => !validStoreIds.has(sid))) {
          throw Errors.badRequest('One or more selected stores do not belong to the selected business(es)');
        }
      }

      type BaTarget = { businessAccountId: string; storeIds: string[] };
      const baTargets: BaTarget[] = requestedBaIds.map((baId) => {
        const baStores = storesByBa.get(baId) ?? [];
        if (inviteScope === 'business') {
          return { businessAccountId: baId, storeIds: baStores.map((s) => s.id) };
        }
        if (input.storeIds && input.storeIds.length > 0) {
          const filtered = input.storeIds.filter((sid) => baStores.some((s) => s.id === sid));
          return { businessAccountId: baId, storeIds: filtered };
        }
        return { businessAccountId: baId, storeIds: [baStores[0].id] };
      }).filter((t) => t.storeIds.length > 0);

      if (baTargets.length === 0) {
        throw Errors.badRequest('Select at least one store under the selected business(es)');
      }

      // Resolve role template / permissions once, then clone per BA as needed.
      let baseRoleTemplate: {
        id: string;
        name: string;
        businessAccountId: string | null;
        permissions: Record<string, Record<string, boolean>> | null;
        scope: string;
        description: string | null;
      } | null = null;
      let permissionsInput: Record<string, Record<string, boolean>> | null = null;

      if (input.roleId) {
        const found = await prisma.accountRole.findUnique({
          where: { id: input.roleId },
          select: {
            id: true, name: true, scope: true, description: true,
            businessAccountId: true, permissions: true,
          },
        });
        if (!found || found.scope !== 'vendor') throw Errors.badRequest('roleId must reference a vendor-scope role');
        baseRoleTemplate = {
          ...found,
          permissions: (found.permissions ?? null) as Record<string, Record<string, boolean>> | null,
        };
      } else if (input.permissions) {
        permissionsInput = input.permissions;
      } else if (member.roleId) {
        const found = await prisma.accountRole.findUnique({
          where: { id: member.roleId },
          select: {
            id: true, name: true, scope: true, description: true,
            businessAccountId: true, permissions: true,
          },
        });
        if (found && found.scope === 'vendor') {
          baseRoleTemplate = {
            ...found,
            permissions: (found.permissions ?? null) as Record<string, Record<string, boolean>> | null,
          };
        }
      }

      async function resolveRoleForBa(businessAccountId: string) {
        if (permissionsInput) {
          return resolveTeamMemberRoleFromPermissions({
            scope: 'vendor',
            permissions: permissionsInput,
            businessAccountId,
            createdBy: ctx.userId,
          });
        }
        const found = baseRoleTemplate;
        if (!found) throw Errors.badRequest('roleId or permissions is required when changing business access');
        if (found.businessAccountId && found.businessAccountId !== businessAccountId) {
          return resolveTeamMemberRoleFromPermissions({
            scope: 'vendor',
            permissions: (found.permissions ?? {}) as Record<string, Record<string, boolean>>,
            businessAccountId,
            createdBy: ctx.userId,
          });
        }
        return found;
      }

      const roleByBa = new Map<string, { id: string; name: string; scope: string; description: string | null }>();
      for (const target of baTargets) {
        roleByBa.set(target.businessAccountId, await resolveRoleForBa(target.businessAccountId));
      }

      // Previous BA footprint within actor scope (for removals).
      const previousRoles = await prisma.userRole.findMany({
        where: {
          userId,
          businessAccountId: { in: actorBaIds.length > 0 ? actorBaIds : requestedBaIds },
          role: { scope: 'vendor' },
        },
        select: { businessAccountId: true },
      });
      const previousTeam = await prisma.vendorTeamMember.findMany({
        where: {
          userId,
          vendor: { businessAccountId: { in: actorBaIds.length > 0 ? actorBaIds : requestedBaIds } },
        },
        select: { vendor: { select: { businessAccountId: true } } },
      });
      const previousBaIds = [...new Set([
        ...previousRoles.map((r) => r.businessAccountId),
        ...previousTeam.map((t) => t.vendor.businessAccountId),
      ])];
      const removedBaIds = previousBaIds.filter((baId) => !requestedBaIds.includes(baId));

      await prisma.$transaction(async (tx) => {
        // Drop access for deselected businesses.
        for (const baId of removedBaIds) {
          const stores = await tx.vendor.findMany({
            where: { businessAccountId: baId },
            select: { id: true, userId: true },
          });
          const storeIds = stores.map((s) => s.id);
          if (storeIds.length > 0) {
            await tx.vendorTeamMember.deleteMany({
              where: { userId, vendorId: { in: storeIds } },
            });
          }
          await tx.userRole.deleteMany({
            where: { userId, businessAccountId: baId, role: { scope: 'vendor' } },
          });
          const ownsBa = stores.some((s) => s.userId === userId);
          if (!ownsBa) {
            await tx.businessAccountMember.deleteMany({
              where: { userId, businessAccountId: baId },
            });
          }
        }

        for (const target of baTargets) {
          const { businessAccountId, storeIds: targetStoreIds } = target;
          const role = roleByBa.get(businessAccountId)!;
          const legacyEnum: TeamRole = VENDOR_ROLE_TO_ENUM[role.name] ?? 'viewer';

          // Sync VendorTeamMember rows to exactly the target stores under this BA.
          const baStoreIds = (storesByBa.get(businessAccountId) ?? []).map((s) => s.id);
          await tx.vendorTeamMember.deleteMany({
            where: {
              userId,
              vendorId: { in: baStoreIds.filter((sid) => !targetStoreIds.includes(sid)) },
            },
          });
          for (const storeId of targetStoreIds) {
            const existing = await tx.vendorTeamMember.findUnique({
              where: { vendorId_userId: { vendorId: storeId, userId } },
              select: { id: true },
            });
            if (existing) {
              await tx.vendorTeamMember.update({
                where: { id: existing.id },
                data: { roleId: role.id, role: legacyEnum },
              });
            } else {
              await tx.vendorTeamMember.create({
                data: {
                  vendorId: storeId,
                  userId,
                  role: legacyEnum,
                  roleId: role.id,
                  invitedBy: ctx.userId,
                },
              });
            }
          }

          // Keep the edited row in sync when it belongs to this BA.
          if (baStoreIds.includes(vendorId) && targetStoreIds.includes(vendorId)) {
            await tx.vendorTeamMember.update({
              where: { id: member.id },
              data: { roleId: role.id, role: legacyEnum },
            }).catch(() => undefined);
          }

          await upsertTeamAccountMembership(tx, {
            userId,
            businessAccountId,
            invitedBy: ctx.userId,
          });

          await tx.userRole.deleteMany({
            where: {
              userId,
              businessAccountId,
              role: { scope: 'vendor', name: { not: { startsWith: 'Storefront' } } },
            },
          });

          if (inviteScope === 'business') {
            await tx.userRole.create({
              data: {
                userId,
                businessAccountId,
                outletId: null,
                vendorId: null,
                roleId: role.id,
              },
            });
          } else {
            for (const storeId of targetStoreIds) {
              await tx.userRole.create({
                data: {
                  userId,
                  businessAccountId,
                  outletId: null,
                  vendorId: storeId,
                  roleId: role.id,
                },
              });
            }
          }

          if (input.storefrontAccess !== undefined) {
            const sf = input.storefrontAccess;
            await tx.userRole.deleteMany({
              where: {
                userId,
                businessAccountId,
                role: { scope: 'vendor', name: { startsWith: 'Storefront' } },
              },
            });
            if (sf.view || sf.order || sf.pay) {
              const sfPermissions = {
                storefront: {
                  ...(sf.view && { view: true }),
                  ...(sf.order && { order: true }),
                  ...(sf.pay && { pay: true }),
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
                  data: {
                    businessAccountId,
                    name: sfRoleName,
                    scope: 'vendor',
                    permissions: sfPermissions,
                    isTemplate: false,
                    description: 'Storefront buyer access',
                  },
                  select: { id: true },
                });
              }
              await tx.userRole.create({
                data: { userId, businessAccountId, outletId: null, roleId: sfRole.id },
              });
            }
          }
        }
      }, { timeout: 30_000 });

      await markSessionStale(userId);
      return NextResponse.json({ success: true });
    }

    // ── Legacy single-BA edit (role / outletIds / storefront only) ────────────
    const { businessAccountId } = vendor;
    let role: { id: string; name: string; scope: string; description: string | null } | null = null;

    if (input.roleId) {
      const found = await prisma.accountRole.findUnique({
        where: { id: input.roleId },
        select: { id: true, name: true, scope: true, description: true },
      });
      if (!found || found.scope !== 'vendor') throw Errors.badRequest('roleId must reference a vendor-scope role');
      role = found;
    } else if (input.permissions) {
      role = await resolveTeamMemberRoleFromPermissions({
        scope: 'vendor',
        permissions: input.permissions,
        businessAccountId,
        createdBy: ctx.userId,
        existingRoleId: member.roleId,
      });
    }

    const outletTargets: (string | null)[] | null =
      input.outletIds !== undefined
        ? (input.outletIds.length > 0 ? input.outletIds : [null])
        : null;

    await prisma.$transaction(async (tx) => {
      if (role) {
        const legacyEnum: TeamRole = VENDOR_ROLE_TO_ENUM[role.name] ?? 'viewer';
        await tx.vendorTeamMember.update({
          where: { id: member.id },
          data: { roleId: role.id, role: legacyEnum },
        });
      }

      if (role || outletTargets !== null) {
        const effectiveRoleId = role?.id ?? member.roleId;
        if (effectiveRoleId) {
          await tx.userRole.deleteMany({
            where: {
              userId,
              businessAccountId,
              role: { scope: 'vendor', name: { not: { startsWith: 'Storefront' } } },
            },
          });
          const targets = outletTargets ?? [null];
          for (const outletId of targets) {
            await tx.userRole.create({
              data: {
                userId,
                businessAccountId,
                outletId: outletId ?? null,
                vendorId: null,
                roleId: effectiveRoleId,
              },
            });
          }
        }
      }

      const sf = input.storefrontAccess;
      if (sf !== undefined) {
        await tx.userRole.deleteMany({
          where: {
            userId,
            businessAccountId,
            role: { scope: 'vendor', name: { startsWith: 'Storefront' } },
          },
        });
        if (sf.view || sf.order || sf.pay) {
          const sfPermissions = {
            storefront: {
              ...(sf.view && { view: true }),
              ...(sf.order && { order: true }),
              ...(sf.pay && { pay: true }),
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
              data: {
                businessAccountId,
                name: sfRoleName,
                scope: 'vendor',
                permissions: sfPermissions,
                isTemplate: false,
                description: 'Storefront buyer access',
              },
              select: { id: true },
            });
          }
          await tx.userRole.create({
            data: { userId, businessAccountId, outletId: null, roleId: sfRole.id },
          });
        }
      }
    });

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

    // Remove across all Online Stores under this Business (and BA membership).
    const baStores = await prisma.vendor.findMany({
      where: { businessAccountId: vendor.businessAccountId },
      select: { id: true },
    });
    const storeIds = baStores.map((s) => s.id);

    await prisma.$transaction(async (tx) => {
      await tx.vendorTeamMember.deleteMany({
        where: { userId: member.userId, vendorId: { in: storeIds } },
      });

      await tx.userRole.deleteMany({
        where: {
          userId: member.userId,
          businessAccountId: vendor.businessAccountId,
          role: { scope: 'vendor' },
        },
      });

      await tx.businessAccountMember.deleteMany({
        where: {
          userId: member.userId,
          businessAccountId: vendor.businessAccountId,
          isPrimary: false,
        },
      });
    });

    const removal = await finalizeTeamMemberRemoval(member.userId);

    return NextResponse.json({ success: true, data: removal });
  } catch (error) {
    return errorResponse(error);
  }
});
