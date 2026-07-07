// GET  /api/v1/admin/team — list admin team members (with assigned Role)
// POST /api/v1/admin/team — invite a user to the admin team
//
// V2.2 RBAC:
//   - permission check uses the new requirePermission engine
//   - POST body: { identifier (email|phone), fullName?, password?, roleId } —
//     mirrors the invite UX in /account/[id]/users. If the identifier matches
//     an existing User we attach them; otherwise we create one (admins are
//     internal staff so inline credential issuance is acceptable here, unlike
//     the customer profile flow where invitee must pre-exist).
//   - The new roleId FK is set; the legacy `role` enum is also written for
//     one release to keep any unmigrated read path working.

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { uniqueHcid } from '@/lib/hcid';
import { phoneLookupVariants } from '@/lib/phone';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { toTeamMemberDTO, teamMemberInclude, type TeamMemberDTO } from '@/lib/teamMemberShape';
import { sendEmailInBackground } from '@/lib/providers/email';
import { buildInviteEmail } from '@/lib/email-templates/invite';
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

// Map seeded admin role name → legacy enum so we can keep writing the enum
// column during the transition window (auth.ts still reads it as a fallback).
const ADMIN_ROLE_TO_ENUM: Record<string, TeamRole> = {
  'Super Admin': 'owner',
  'Ops Admin': 'manager',
  'Finance Admin': 'manager',
  'Support Agent': 'viewer',
  Editor: 'editor',
  Viewer: 'viewer',
};

export const GET = adminOnly(async (_req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'users.view');
    const admins = await prisma.user.findMany({
      where: { role: 'admin' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        hcidDisplay: true,
        isActive: true,
        createdAt: true,
      },
    });

    const members = await prisma.adminTeamMember.findMany({
      where: { userId: { in: admins.map((a) => a.id) } },
      include: teamMemberInclude,
    });
    const memberByUserId = new Map(members.map((m) => [m.userId, m]));

    const data: TeamMemberDTO[] = admins.map((a) => {
      const m = memberByUserId.get(a.id);
      return toTeamMemberDTO({
        id: m?.id ?? `owner-${a.id}`,
        createdAt: m?.createdAt ?? a.createdAt,
        legacyRole: m?.role ?? 'owner',
        // Seeded admin owner has no AdminTeamMember row.
        isOwner: !m,
        user: a,
        roleRef: m?.roleRef ?? null,
      });
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = adminOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'users.create');

    const body = await req.json();
    const input = inviteSchema.parse(body);

    // Resolve or create the role for this member.
    let role: { id: string; name: string; scope: string; description: string | null };
    if (input.permissions && Object.keys(input.permissions).length > 0) {
      const ALLOWED = ['view', 'create', 'edit', 'delete', 'approve'];
      const sanitized: Record<string, Record<string, boolean>> = {};
      for (const [mod, actions] of Object.entries(input.permissions)) {
        sanitized[mod] = {};
        for (const [a, v] of Object.entries(actions)) {
          if (ALLOWED.includes(a) && typeof v === 'boolean') sanitized[mod][a] = v;
        }
      }
      role = await prisma.accountRole.create({
        data: { businessAccountId: null, name: `Custom-${Date.now().toString(36)}`, scope: 'admin', permissions: sanitized, isTemplate: false, createdBy: ctx.userId },
        select: { id: true, name: true, scope: true, description: true },
      });
    } else {
      const found = await prisma.accountRole.findUnique({
        where: { id: input.roleId! },
        select: { id: true, name: true, scope: true, description: true },
      });
      if (!found || found.scope !== 'admin') throw Errors.badRequest('roleId must reference an admin-scope role');
      role = found;
    }

    // Find existing user by email or phone, otherwise create one inline.
    const identifierTrim = input.identifier.trim();
    const looksEmail = identifierTrim.includes('@');
    let user = looksEmail
      ? await prisma.user.findUnique({ where: { email: identifierTrim.toLowerCase() } })
      : await prisma.user.findFirst({ where: { phone: { in: phoneLookupVariants(identifierTrim) } } });

    // Capture plain-text password BEFORE bcrypt.hash so we can email it. Only
    // set for the new-user creation path; existing users keep their password.
    let tempPassword = '';

    if (!user) {
      if (!looksEmail) {
        throw Errors.badRequest('New admin invites require an email identifier');
      }
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
          role: 'admin',
          isActive: true,
          hcidDisplay,
        },
      });
    } else {
      // Existing user — promote to admin if needed, and update password if supplied.
      const updateData: Record<string, unknown> = {};
      if (user.role !== 'admin') updateData.role = 'admin';
      if (input.password) {
        tempPassword = input.password;
        updateData.password = await bcrypt.hash(input.password, 12);
      }
      if (Object.keys(updateData).length > 0) {
        user = await prisma.user.update({ where: { id: user.id }, data: updateData });
      }
    }

    const existingMember = await prisma.adminTeamMember.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (existingMember) {
      throw Errors.conflict('User is already on the admin team — update their role instead');
    }

    const legacyEnum: TeamRole = ADMIN_ROLE_TO_ENUM[role.name] ?? 'viewer';
    const member = await prisma.adminTeamMember.create({
      data: {
        userId: user.id,
        role: legacyEnum,
        roleId: role.id,
        invitedBy: ctx.userId,
      },
      include: teamMemberInclude,
    });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.adminTeamInvite,
      entity: 'AdminTeamMember',
      entityId: user.id,
      after: { email: user.email, roleId: role.id, roleName: role.name },
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

    // Send credential email in background — SMTP timeouts must not block the API
    // response (nginx returns 504 HTML otherwise, breaking the Add Member wizard).
    if (user.email && tempPassword) {
      const inviterId = ctx.userId;
      const recipientEmail = user.email;
      const recipientName = user.fullName ?? '';
      runInBackground('invite-email', async () => {
        const inviter = await prisma.user.findUnique({
          where: { id: inviterId },
          select: { fullName: true },
        });
        const { subject, text, html } = buildInviteEmail({
          recipientName,
          recipientEmail,
          tempPassword,
          scope: 'admin',
          businessName: 'HoReCa Hub Admin',
          loginUrl,
          inviterName: inviter?.fullName ?? undefined,
        });
        sendEmailInBackground({ to: recipientEmail, subject, text, html }, 'invite-email');
      });
    }

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
                credentialsDelivered: { email: false, sms: false },
              },
            }
          : {}),
      },
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
