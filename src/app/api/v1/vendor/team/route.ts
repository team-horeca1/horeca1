// GET  /api/v1/vendor/team — list vendor team members (with assigned Role)
// POST /api/v1/vendor/team — invite a user to the vendor team
//
// POST body: { identifier, fullName?, password?, roleId? | permissions, outletIds?, storefrontAccess? }
// Either roleId OR permissions must be provided. When permissions are sent the
// handler finds an existing role with matching permissions or creates a new one.

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { resolveVendorContext, resolveSupplierActorUserId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { uniqueHcid } from '@/lib/hcid';
import { phoneLookupVariants, normalizePhone } from '@/lib/phone';
import { toTeamMemberDTO, teamMemberInclude, type TeamMemberDTO } from '@/lib/teamMemberShape';
import { sendEmailInBackground } from '@/lib/providers/email';
import { buildInviteEmail, buildInviteSms } from '@/lib/email-templates/invite';
import { deliverInviteCredentials } from '@/lib/inviteDelivery';
import { markSessionStale } from '@/lib/sessionStale';
import { resolveTeamMemberRoleFromPermissions } from '@/lib/teamRoleWrites';
import { upsertTeamAccountMembership } from '@/lib/teamMembership';
import { sendSms } from '@/lib/providers/sms';
import { runInBackground } from '@/lib/asyncBackground';
import type { AuthContext } from '@/middleware/auth';
import type { TeamRole } from '@prisma/client';

const inviteSchema = z.object({
  identifier: z.string().min(3).max(255),
  fullName: z.string().min(2).max(100).optional(),
  password: z.string().min(6).max(72).optional(),
  roleId: z.string().uuid().optional(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
  outletIds: z.array(z.string().uuid()).optional(),
  /** Legacy single Business target. Prefer businessAccountIds. */
  businessAccountId: z.string().uuid().optional(),
  /** One or more Businesses the actor belongs to. */
  businessAccountIds: z.array(z.string().uuid()).min(1).optional(),
  /** Specific Online Stores under the target Business(es) (implies scope='store'). */
  storeIds: z.array(z.string().uuid()).optional(),
  /** Supplier Foundation: business = all Online Stores; store = selected/current store(s). */
  scope: z.enum(['business', 'store']).optional().default('store'),
  storefrontAccess: z.object({
    view: z.boolean().optional(),
    order: z.boolean().optional(),
    pay: z.boolean().optional(),
  }).optional(),
}).refine(d => d.roleId || d.permissions, { message: 'Either roleId or permissions is required' });

const VENDOR_ROLE_TO_ENUM: Record<string, TeamRole> = {
  'Vendor Admin': 'owner',
  'Vendor Manager': 'manager',
  'Vendor Editor': 'editor',
  'Vendor Viewer': 'viewer',
};

export const GET = vendorOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    // Team list returns every member's name/email/phone/HCID — gate so a
    // Viewer can't enumerate peers' contact details.
    requirePermission(ctx, 'users.view');
    const { vendorId } = await resolveVendorContext(ctx, req);

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        userId: true,
        businessAccountId: true,
        user: { select: { id: true, fullName: true, email: true, phone: true, hcidDisplay: true, isActive: true, createdAt: true } },
      },
    });
    if (!vendor) throw Errors.notFound('Vendor not found');

    const outlets = await prisma.outlet.findMany({
      where: { businessAccountId: vendor.businessAccountId, isActive: true },
      select: { id: true, name: true },
    });
    const outletNames = new Map(outlets.map((o) => [o.id, o.name]));

    const members = await prisma.vendorTeamMember.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'asc' },
      include: teamMemberInclude,
    });

    const userRoles = await prisma.userRole.findMany({
      where: {
        businessAccountId: vendor.businessAccountId,
        userId: { in: members.map((m) => m.userId) },
        role: { scope: 'vendor' },
      },
      select: { userId: true, outletId: true },
    });

    const outletLabel = (userId: string) => {
      const scoped = userRoles.filter((r) => r.userId === userId);
      if (scoped.some((r) => r.outletId === null)) return 'All outlets';
      const names = [...new Set(scoped.map((r) => (r.outletId ? outletNames.get(r.outletId) : null)).filter(Boolean))] as string[];
      return names.length ? names.join(', ') : 'All outlets';
    };

    const owner: TeamMemberDTO = toTeamMemberDTO({
      id: `owner-${vendor.user.id}`,
      createdAt: vendor.user.createdAt,
      legacyRole: 'owner',
      isOwner: true,
      user: vendor.user,
      roleRef: null,
    });
    const adminTemplate = await prisma.accountRole.findFirst({
      where: { businessAccountId: null, isTemplate: true, scope: 'vendor', name: 'Vendor Admin' },
      select: { id: true, name: true, scope: true, description: true },
    });
    if (adminTemplate) {
      owner.role = { id: adminTemplate.id, name: adminTemplate.name, scope: 'vendor', description: adminTemplate.description };
    }
    owner.outletAccess = 'All outlets';

    const others: TeamMemberDTO[] = members.map((m) => {
      const dto = toTeamMemberDTO({
      id: m.id,
      createdAt: m.createdAt,
      legacyRole: m.role,
      isOwner: false,
      user: m.user,
      roleRef: m.roleRef,
    });
      dto.outletAccess = outletLabel(m.userId);
      return dto;
    });

    return NextResponse.json({ success: true, data: [owner, ...others] });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'users.create');

    const body = await req.json();
    const input = inviteSchema.parse(body);

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { businessAccountId: true, businessName: true },
    });
    if (!vendor) throw Errors.notFound('Vendor not found');

    // ── Resolve target Business(es) ────────────────────────────────────────────
    // Wizard may pick one or many Businesses the actor belongs to.
    const requestedBaIds = [
      ...new Set([
        ...(input.businessAccountIds ?? []),
        ...(input.businessAccountId ? [input.businessAccountId] : []),
      ]),
    ];
    const targetBaIds = requestedBaIds.length > 0 ? requestedBaIds : [vendor.businessAccountId];

    const actorId = await resolveSupplierActorUserId(ctx, req);
    for (const baId of targetBaIds) {
      if (baId === vendor.businessAccountId) continue;
      const membership = await prisma.businessAccountMember.findUnique({
        where: { userId_businessAccountId: { userId: actorId, businessAccountId: baId } },
        select: { id: true },
      });
      if (!membership) throw Errors.forbidden('You are not a member of one of the selected businesses');
    }

    const businessAccounts = await prisma.businessAccount.findMany({
      where: { id: { in: targetBaIds } },
      select: { id: true, displayName: true, legalName: true },
    });
    if (businessAccounts.length !== targetBaIds.length) {
      throw Errors.badRequest('One or more selected businesses were not found');
    }
    const baLabelById = new Map(
      businessAccounts.map((ba) => [ba.id, ba.displayName ?? ba.legalName ?? vendor.businessName]),
    );
    const businessLabel = targetBaIds.map((id) => baLabelById.get(id) ?? vendor.businessName).join(', ');

    // Online Stores under each target Business (primary first).
    const allBaStores = await prisma.vendor.findMany({
      where: { businessAccountId: { in: targetBaIds } },
      orderBy: [{ isPrimaryStore: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, businessName: true, businessAccountId: true },
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
    for (const baId of targetBaIds) {
      if ((storesByBa.get(baId) ?? []).length === 0) {
        throw Errors.badRequest('One of the selected businesses has no Online Stores yet — create a store first');
      }
    }

    // ── Resolve target stores per Business ─────────────────────────────────────
    const inviteScope = input.scope ?? 'store';
    const validStoreIds = new Set(allBaStores.map((s) => s.id));
    if (inviteScope === 'store' && input.storeIds && input.storeIds.length > 0) {
      if (input.storeIds.some((id) => !validStoreIds.has(id))) {
        throw Errors.badRequest('One or more selected stores do not belong to the selected business(es)');
      }
    }

    type BaTarget = { businessAccountId: string; storeIds: string[] };
    const baTargets: BaTarget[] = targetBaIds.map((baId) => {
      const baStores = storesByBa.get(baId) ?? [];
      if (inviteScope === 'business') {
        return { businessAccountId: baId, storeIds: baStores.map((s) => s.id) };
      }
      if (input.storeIds && input.storeIds.length > 0) {
        const filtered = input.storeIds.filter((id) => baStores.some((s) => s.id === id));
        return { businessAccountId: baId, storeIds: filtered };
      }
      // Default: current store if it belongs to this BA, else primary/first store.
      const fallback = validStoreIds.has(vendorId) && baStores.some((s) => s.id === vendorId)
        ? [vendorId]
        : [baStores[0].id];
      return { businessAccountId: baId, storeIds: fallback };
    }).filter((t) => t.storeIds.length > 0);

    if (baTargets.length === 0) {
      throw Errors.badRequest('Select at least one store under the selected business(es)');
    }

    const allTargetStoreIds = [...new Set(baTargets.flatMap((t) => t.storeIds))];

    // ── Resolve a base role (cloned per-BA when needed) ────────────────────────
    let baseRoleTemplate: {
      id: string;
      name: string;
      scope: string;
      description: string | null;
      businessAccountId: string | null;
      permissions: Record<string, Record<string, boolean>> | null;
    } | null = null;
    let permissionsInput: Record<string, Record<string, boolean>> | null = null;

    if (input.roleId) {
      const found = await prisma.accountRole.findUnique({
        where: { id: input.roleId },
        select: { id: true, name: true, scope: true, description: true, businessAccountId: true, permissions: true },
      });
      if (!found || found.scope !== 'vendor') throw Errors.badRequest('roleId must reference a vendor-scope role');
      baseRoleTemplate = {
        ...found,
        permissions: (found.permissions ?? null) as Record<string, Record<string, boolean>> | null,
      };
    } else {
      permissionsInput = input.permissions!;
    }

    async function resolveRoleForBa(businessAccountId: string): Promise<{ id: string; name: string; scope: string; description: string | null }> {
      if (permissionsInput) {
        return resolveTeamMemberRoleFromPermissions({
          scope: 'vendor',
          permissions: permissionsInput,
          businessAccountId,
          createdBy: ctx.userId,
        });
      }
      const found = baseRoleTemplate!;
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

    // ── Resolve / create the user ──────────────────────────────────────────────
    const identifierTrim = input.identifier.trim();
    const looksEmail = identifierTrim.includes('@');
    const normalizedPhone = looksEmail ? null : normalizePhone(identifierTrim);
    let user = looksEmail
      ? await prisma.user.findUnique({ where: { email: identifierTrim.toLowerCase() } })
      : normalizedPhone
        ? await prisma.user.findFirst({ where: { phone: { in: phoneLookupVariants(normalizedPhone) } } })
        : null;

    let tempPassword = '';
    let isNewUser = false;

    if (!user) {
      if (!input.fullName || !input.password) {
        throw Errors.badRequest('fullName and password are required when the invitee is a new user');
      }
      tempPassword = input.password;
      const hashedPassword = await bcrypt.hash(input.password, 12);
      const hcidDisplay = await uniqueHcid();
      if (looksEmail) {
        user = await prisma.user.create({
          data: {
            fullName: input.fullName,
            email: identifierTrim.toLowerCase(),
            password: hashedPassword,
            role: 'vendor',
            isActive: true,
            hcidDisplay,
          },
        });
      } else if (normalizedPhone) {
        user = await prisma.user.create({
          data: {
            fullName: input.fullName,
            phone: normalizedPhone,
            password: hashedPassword,
            role: 'vendor',
            isActive: true,
            hcidDisplay,
          },
        });
      } else {
        throw Errors.badRequest('Enter a valid email address or 10-digit phone number');
      }
      isNewUser = true;
    }

    const existingMember = await prisma.vendorTeamMember.findFirst({
      where: { vendorId: { in: allTargetStoreIds }, userId: user.id },
      select: { id: true },
    });
    if (existingMember) {
      throw Errors.fieldError('identifier', 'User is already on this vendor team — update their role instead', 409);
    }

    const userId = user.id;
    const outletTargets: (string | null)[] =
      input.outletIds && input.outletIds.length > 0 ? input.outletIds : [null];

    // ── Transactional write across all selected Businesses ─────────────────────
    const member = await prisma.$transaction(async (tx) => {
      let firstMember: {
        id: string;
        createdAt: Date;
        role: TeamRole;
        user: { id: string; fullName: string; email: string | null; phone: string | null; hcidDisplay: string | null; isActive: boolean };
        roleRef: { id: string; name: string; scope: string; description: string | null } | null;
      } | null = null;

      for (const target of baTargets) {
        const { businessAccountId, storeIds: targetStoreIds } = target;
        const role = roleByBa.get(businessAccountId)!;
        const legacyEnum: TeamRole = VENDOR_ROLE_TO_ENUM[role.name] ?? 'viewer';

        for (const storeId of targetStoreIds) {
          const exists = await tx.vendorTeamMember.findUnique({
            where: { vendorId_userId: { vendorId: storeId, userId } },
            select: { id: true },
          });
          if (exists) continue;
          const created = await tx.vendorTeamMember.create({
            data: { vendorId: storeId, userId, role: legacyEnum, roleId: role.id, invitedBy: ctx.userId },
            include: teamMemberInclude,
          });
          if (!firstMember) firstMember = created;
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
          void outletTargets;
        }

        const sf = input.storefrontAccess;
        if (sf && (sf.view || sf.order || sf.pay)) {
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
              data: {
                businessAccountId, name: sfRoleName, scope: 'vendor',
                permissions: sfPermissions, isTemplate: false, description: 'Storefront buyer access',
              },
              select: { id: true },
            });
          }
          const existingSf = await tx.userRole.findFirst({
            where: { userId, businessAccountId, outletId: null, roleId: sfRole.id },
            select: { id: true },
          });
          if (!existingSf) {
            await tx.userRole.create({
              data: { userId, businessAccountId, outletId: null, roleId: sfRole.id },
            });
          }
        }
      }

      if (!firstMember) {
        throw Errors.fieldError('identifier', 'User is already on this vendor team — update their role instead', 409);
      }
      return firstMember;
    }, { timeout: 30_000 });

    const dto = toTeamMemberDTO({
      id: member.id,
      createdAt: member.createdAt,
      legacyRole: member.role,
      isOwner: false,
      user: member.user,
      roleRef: member.roleRef,
    });

    const loginUrl = (process.env.AUTH_URL ?? 'http://localhost:3000') + '/login';
    const loginIdentifier = user.email ?? user.phone ?? identifierTrim;

    let credentialsDelivered = { email: false, sms: false };

    // Credential delivery — await Resend/MSG91 (fast HTTP). Notification-only path stays background.
    if (tempPassword) {
      const inviter = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { fullName: true },
      });
      const inviterName = inviter?.fullName ?? undefined;
      const recipientEmail = user.email;
      const recipientPhone = user.phone;
      const recipientName = user.fullName ?? '';

      let emailContent: { subject: string; text: string; html: string } | undefined;
      if (recipientEmail) {
        emailContent = buildInviteEmail({
          recipientName,
          recipientEmail,
          tempPassword,
          scope: 'vendor',
          businessName: businessLabel,
          loginUrl,
          inviterName,
        });
      }

      let smsBody: string | undefined;
      if (recipientPhone && (isNewUser || !recipientEmail)) {
        smsBody = buildInviteSms({
          recipientName,
          loginIdentifier: recipientPhone,
          tempPassword,
          businessName: businessLabel,
          loginUrl,
          inviterName,
        });
      }

      credentialsDelivered = await deliverInviteCredentials({
        email: recipientEmail,
        phone: recipientPhone,
        emailContent,
        smsBody,
        smsOnlyIfNoEmail: true,
      });
    } else {
      const inviterId = ctx.userId;
      const businessName = businessLabel;
      const recipientEmail = user.email;
      const recipientPhone = user.phone;
      const recipientName = user.fullName ?? '';
      runInBackground('invite-notification', async () => {
        const inviter = await prisma.user.findUnique({
          where: { id: inviterId },
          select: { fullName: true },
        });
        const inviterName = inviter?.fullName?.trim() || 'Admin';
        const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

        if (recipientEmail) {
          const subject = `Access granted to vendor team ${businessName} on HoReCa Hub`;
          const text = `Hello ${recipientName},\n\n${inviterName} has added you to the vendor team "${businessName}" on HoReCa Hub.\n\nYou can now log in and access the vendor portal.\n\nLogin URL: ${loginUrl}\n\n— The HoReCa Hub team`;
          const html = `<p>Hello <strong>${esc(recipientName)}</strong>,</p><p>${esc(inviterName)} has added you to the vendor team <strong>${esc(businessName)}</strong> on HoReCa Hub.</p><p>You can now log in and access the vendor portal.</p><p><a href="${esc(loginUrl)}">Sign in to HoReCa Hub</a></p><p>— The HoReCa Hub team</p>`;
          sendEmailInBackground({ to: recipientEmail, subject, text, html }, 'invite-notification');
        }

        if (recipientPhone) {
          const smsBody = `Hello ${recipientName}, you have been added to the vendor team "${businessName}" on HoReCa Hub by ${inviterName}. Log in to access: ${loginUrl}`;
          void sendSms({ to: recipientPhone, body: smsBody, channel: 'sms' }).catch((err) => {
            console.error('[invite-notification]', err);
          });
        }
      });
    }

    await markSessionStale(user.id);

    return NextResponse.json({
      success: true,
      data: {
        ...dto,
        ...(tempPassword
          ? {
              inviteMeta: {
                tempPassword,
                loginIdentifier,
                loginUrl,
                credentialsDelivered,
              },
            }
          : {}),
      },
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
