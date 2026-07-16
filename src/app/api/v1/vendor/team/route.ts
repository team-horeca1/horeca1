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
import { resolveVendorContext } from '@/lib/resolveVendorId';
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
    const businessAccountId = vendor.businessAccountId;

    // ── Resolve the role ───────────────────────────────────────────────────────
    // If roleId provided, use it directly. Otherwise derive from permissions JSON:
    // find a vendor-scope role with matching permissions or create a new one.
    let role: { id: string; name: string; scope: string; description: string | null };

    if (input.roleId) {
      const found = await prisma.accountRole.findUnique({
        where: { id: input.roleId },
        select: { id: true, name: true, scope: true, description: true },
      });
      if (!found || found.scope !== 'vendor') throw Errors.badRequest('roleId must reference a vendor-scope role');
      role = found;
    } else {
      role = await resolveTeamMemberRoleFromPermissions({
        scope: 'vendor',
        permissions: input.permissions!,
        businessAccountId,
        createdBy: ctx.userId,
      });
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

    const existingMember = await prisma.vendorTeamMember.findUnique({
      where: { vendorId_userId: { vendorId, userId: user.id } },
      select: { id: true },
    });
    if (existingMember) {
      throw Errors.fieldError('identifier', 'User is already on this vendor team — update their role instead', 409);
    }

    const legacyEnum: TeamRole = VENDOR_ROLE_TO_ENUM[role.name] ?? 'viewer';
    const userId = user.id;
    const outletTargets: (string | null)[] =
      input.outletIds && input.outletIds.length > 0 ? input.outletIds : [null];

    // ── Transactional write ────────────────────────────────────────────────────
    const member = await prisma.$transaction(async (tx) => {
      const m = await tx.vendorTeamMember.create({
        data: { vendorId, userId, role: legacyEnum, roleId: role.id, invitedBy: ctx.userId },
        include: teamMemberInclude,
      });

      await upsertTeamAccountMembership(tx, {
        userId,
        businessAccountId,
        invitedBy: ctx.userId,
      });

      // Replace any prior vendor-scope roles for this user+account.
      await tx.userRole.deleteMany({
        where: { userId, businessAccountId, outletId: null, role: { scope: 'vendor' } },
      });

      // Create UserRole per outlet target (null = account-wide).
      for (const outletId of outletTargets) {
        await tx.userRole.create({
          data: { userId, businessAccountId, outletId: outletId ?? null, roleId: role.id },
        });
      }

      // Storefront access — find or create a per-account role with just storefront perms.
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

      return m;
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
          businessName: vendor.businessName,
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
          businessName: vendor.businessName,
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
      const businessName = vendor.businessName;
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
