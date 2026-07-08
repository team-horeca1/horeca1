// GET  /api/v1/brand/team — list brand team members (with assigned Role)
// POST /api/v1/brand/team — invite a user to the brand team

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { brandOnly } from '@/middleware/rbac';
import { resolveBrandContext } from '@/lib/resolveBrandId';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { uniqueHcid } from '@/lib/hcid';
import { phoneLookupVariants } from '@/lib/phone';
import { toTeamMemberDTO, teamMemberInclude, type TeamMemberDTO } from '@/lib/teamMemberShape';
import { sendEmailInBackground } from '@/lib/providers/email';
import { buildInviteEmail } from '@/lib/email-templates/invite';
import { deliverInviteCredentials } from '@/lib/inviteDelivery';
import { markSessionStale } from '@/lib/sessionStale';
import { resolveTeamMemberRoleFromPermissions } from '@/lib/teamRoleWrites';
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
}).refine(d => d.roleId || d.permissions, { message: 'Either roleId or permissions is required' });

const BRAND_ROLE_TO_ENUM: Record<string, TeamRole> = {
  'Brand Admin': 'owner',
  'Brand Manager': 'manager',
  'Brand Editor': 'editor',
  'Brand Viewer': 'viewer',
};

export const GET = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { brandId } = await resolveBrandContext(ctx, req);
    // B-7: gate team enumeration (emails/phones/HCIDs) behind users.view,
    // mirroring the vendor team GET. Prevents a viewer-scope member leaking PII.
    requirePermission(ctx, 'users.view');

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { userId: true, user: { select: { id: true, fullName: true, email: true, phone: true, hcidDisplay: true, isActive: true, createdAt: true } } },
    });
    if (!brand) throw Errors.notFound('Brand not found');
    // Label-only brands (created via import) have no owner account; team
    // management isn't reachable for them, but guard so types stay sound.
    if (!brand.user) throw Errors.badRequest('This brand has no linked account yet.');

    const members = await prisma.brandTeamMember.findMany({
      where: { brandId },
      orderBy: { createdAt: 'asc' },
      include: teamMemberInclude,
    });

    const owner: TeamMemberDTO = toTeamMemberDTO({
      id: `owner-${brand.user.id}`,
      createdAt: brand.user.createdAt,
      legacyRole: 'owner',
      isOwner: true,
      user: brand.user,
      roleRef: null,
    });
    const adminTemplate = await prisma.accountRole.findFirst({
      where: { businessAccountId: null, isTemplate: true, scope: 'brand', name: 'Brand Admin' },
      select: { id: true, name: true, scope: true, description: true },
    });
    if (adminTemplate) {
      owner.role = { id: adminTemplate.id, name: adminTemplate.name, scope: 'brand', description: adminTemplate.description };
    }

    const others: TeamMemberDTO[] = members.map((m) => toTeamMemberDTO({
      id: m.id,
      createdAt: m.createdAt,
      legacyRole: m.role,
      isOwner: false,
      user: m.user,
      roleRef: m.roleRef,
    }));

    return NextResponse.json({ success: true, data: [owner, ...others] });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = brandOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { brandId } = await resolveBrandContext(ctx, req);
    requirePermission(ctx, 'users.create');

    const body = await req.json();
    const input = inviteSchema.parse(body);

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { businessAccountId: true, name: true },
    });
    if (!brand) throw Errors.notFound('Brand not found');
    if (!brand.businessAccountId) throw Errors.badRequest('This brand has no linked account yet.');

    let role: { id: string; name: string; scope: string; description: string | null };
    if (input.permissions && Object.keys(input.permissions).length > 0) {
      role = await resolveTeamMemberRoleFromPermissions({
        scope: 'brand',
        permissions: input.permissions,
        businessAccountId: brand.businessAccountId,
        createdBy: ctx.userId,
      });
    } else {
      const found = await prisma.accountRole.findUnique({
        where: { id: input.roleId! },
        select: { id: true, name: true, scope: true, description: true },
      });
      if (!found || found.scope !== 'brand') throw Errors.badRequest('roleId must reference a brand-scope role');
      role = found;
    }

    const identifierTrim = input.identifier.trim();
    const looksEmail = identifierTrim.includes('@');
    let user = looksEmail
      ? await prisma.user.findUnique({ where: { email: identifierTrim.toLowerCase() } })
      : await prisma.user.findFirst({ where: { phone: { in: phoneLookupVariants(identifierTrim) } } });

    // Capture plain-text password BEFORE bcrypt.hash so we can email it. Only
    // set on the new-user creation path; existing users keep their password.
    let tempPassword = '';

    if (!user) {
      if (!looksEmail) throw Errors.badRequest('New brand invites require an email identifier');
      if (!input.fullName || !input.password) {
        throw Errors.badRequest('fullName and password are required when the invitee is a new user');
      }
      tempPassword = input.password;
      const hashedPassword = await bcrypt.hash(input.password, 12);
      const hcidDisplay = await uniqueHcid();
      user = await prisma.user.create({
        data: {
          fullName: input.fullName,
          email: identifierTrim.toLowerCase(),
          password: hashedPassword,
          role: 'brand',
          isActive: true,
          hcidDisplay,
        },
      });
    }

    const existingMember = await prisma.brandTeamMember.findUnique({
      where: { brandId_userId: { brandId, userId: user.id } },
      select: { id: true },
    });
    if (existingMember) {
      throw Errors.fieldError('identifier', 'User is already on this brand team — update their role instead', 409);
    }

    const legacyEnum: TeamRole = BRAND_ROLE_TO_ENUM[role.name] ?? 'viewer';
    const userId = user.id;
    const businessAccountId = brand.businessAccountId;

    const member = await prisma.$transaction(async (tx) => {
      const m = await tx.brandTeamMember.create({
        data: {
          brandId,
          userId,
          role: legacyEnum,
          roleId: role.id,
          invitedBy: ctx.userId,
        },
        include: teamMemberInclude,
      });

      await tx.businessAccountMember.upsert({
        where: { userId_businessAccountId: { userId, businessAccountId } },
        update: {},
        create: {
          userId,
          businessAccountId,
          isPrimary: false,
          invitedBy: ctx.userId,
          acceptedAt: new Date(),
        },
      });

      const existingRole = await tx.userRole.findFirst({
        where: { userId, businessAccountId, outletId: null, roleId: role.id },
        select: { id: true },
      });
      if (!existingRole) {
        await tx.userRole.deleteMany({
          where: {
            userId,
            businessAccountId,
            outletId: null,
            role: { scope: 'brand' },
          },
        });
        await tx.userRole.create({
          data: { userId, businessAccountId, outletId: null, roleId: role.id },
        });
      }

      return m;
    });

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

    if (tempPassword && user.email) {
      const inviter = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { fullName: true },
      });
      const emailContent = buildInviteEmail({
        recipientName: user.fullName ?? '',
        recipientEmail: user.email,
        tempPassword,
        scope: 'brand',
        businessName: brand.name,
        loginUrl,
        inviterName: inviter?.fullName ?? undefined,
      });
      credentialsDelivered = await deliverInviteCredentials({
        email: user.email,
        emailContent,
      });
    } else if (!tempPassword) {
      const inviterId = ctx.userId;
      const brandName = brand.name;
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
          const subject = `Access granted to brand team ${brandName} on HoReCa Hub`;
          const text = `Hello ${recipientName},\n\n${inviterName} has added you to the brand team "${brandName}" on HoReCa Hub.\n\nYou can now log in and access the brand portal.\n\nLogin URL: ${loginUrl}\n\n— The HoReCa Hub team`;
          const html = `<p>Hello <strong>${esc(recipientName)}</strong>,</p><p>${esc(inviterName)} has added you to the brand team <strong>${esc(brandName)}</strong> on HoReCa Hub.</p><p>You can now log in and access the brand portal.</p><p><a href="${esc(loginUrl)}">Sign in to HoReCa Hub</a></p><p>— The HoReCa Hub team</p>`;
          sendEmailInBackground({ to: recipientEmail, subject, text, html }, 'invite-notification');
        }

        if (recipientPhone) {
          const smsBody = `Hello ${recipientName}, you have been added to the brand team "${brandName}" on HoReCa Hub by ${inviterName}. Log in to access: ${loginUrl}`;
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
