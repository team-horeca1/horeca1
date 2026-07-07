/**
 * GET  /api/v1/account/[id]/users — list members + their role assignments
 * POST /api/v1/account/[id]/users — invite a user to the account by email/phone with a role
 *                                   (requires users.create)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { withAuth } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { assertAccountMember, assertAccountPermission } from '@/lib/accountAccess';
import { uniqueHcid } from '@/lib/hcid';
import { phoneLookupVariants, normalizePhone } from '@/lib/phone';
import { sendEmailInBackground } from '@/lib/providers/email';
import { buildInviteEmail, buildInviteSms } from '@/lib/email-templates/invite';
import { deliverInviteCredentials } from '@/lib/inviteDelivery';
import { markSessionStale } from '@/lib/sessionStale';
import { sendSms } from '@/lib/providers/sms';
import { runInBackground } from '@/lib/asyncBackground';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const id = extractAccountId(req);
    await assertAccountMember(ctx.userId, id);
    await assertAccountPermission(ctx.userId, id, 'users.view', ctx.activeOutletId);
    // (V2.2 HCID model). In that case a single User on the account may hold both
    // 'account' (customer-side) UserRoles AND 'vendor' UserRoles. The customer
    // team page must surface ONLY the account-scope roles — otherwise vendor-
    // team and customer-team data leak into each other. The vendor team page
    // uses VendorTeamMember which is a different table and already isolated.
    const members = await prisma.businessAccountMember.findMany({
      where: { businessAccountId: id },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true, isPrimary: true, acceptedAt: true, createdAt: true,
        user: {
          select: {
            id: true, fullName: true, email: true, phone: true, image: true, hcidDisplay: true, isActive: true,
            userRoles: {
              where: { businessAccountId: id, role: { scope: 'account' } },
              select: { id: true, outletId: true, role: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    return NextResponse.json({ success: true, data: members });
  } catch (err) { return errorResponse(err); }
});

const InviteBody = z.object({
  identifier: z.string().min(3), // email or phone
  // Either pick an existing role (roleId) OR send a custom permissions
  // matrix and we create an inline scope='account' AccountRole for it.
  roleId: z.string().uuid().optional(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
  // Outlet scope:
  //   • missing OR empty array → account-wide (one UserRole with outletId=null)
  //   • non-empty array → one UserRole per outletId (caller can access ONLY
  //     those outlets). All ids must belong to the same business account.
  outletIds: z.array(z.string().uuid()).optional(),
  fullName: z.string().min(2).max(100).optional(),
  password: z.string().min(6).max(72).optional(),
}).refine((d) => d.roleId || d.permissions, { message: 'Either roleId or permissions is required' });

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const id = extractAccountId(req);
    await assertAccountPermission(ctx.userId, id, 'users.create', ctx.activeOutletId);
    const body = InviteBody.parse(await req.json());

    // Resolve the role for this membership.
    //   • permissions object supplied → create a new scope='account' custom role
    //     scoped to THIS business account. Filtered to account-scope modules
    //     by the client; we still re-sanitize on the server.
    //   • else → require an existing roleId that belongs to the account or is
    //     a template.
    let roleIdToUse: string;
    if (body.permissions && Object.keys(body.permissions).length > 0) {
      const ALLOWED_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve'];
      const sanitized: Record<string, Record<string, boolean>> = {};
      for (const [mod, actions] of Object.entries(body.permissions)) {
        sanitized[mod] = {};
        for (const [a, v] of Object.entries(actions)) {
          if (ALLOWED_ACTIONS.includes(a) && typeof v === 'boolean' && v) sanitized[mod][a] = true;
        }
      }
      const customRole = await prisma.accountRole.create({
        data: {
          businessAccountId: id,
          name: `Custom-${Date.now().toString(36)}`,
          scope: 'account',
          permissions: sanitized,
          isTemplate: false,
          createdBy: ctx.userId,
        },
        select: { id: true },
      });
      roleIdToUse = customRole.id;
    } else {
      const role = await prisma.accountRole.findFirst({
        where: { id: body.roleId!, scope: 'account', OR: [{ businessAccountId: id }, { isTemplate: true }] },
        select: { id: true },
      });
      if (!role) throw Errors.badRequest('Role not available for this account');
      roleIdToUse = role.id;
    }

    // Validate every outlet belongs to the account. De-dupe defensively so the
    // tx below can't double-create assignment rows when the client sends the
    // same outletId twice.
    const outletIds = Array.from(new Set(body.outletIds ?? []));
    if (outletIds.length > 0) {
      const found = await prisma.outlet.findMany({
        where: { id: { in: outletIds }, businessAccountId: id },
        select: { id: true },
      });
      if (found.length !== outletIds.length) {
        throw Errors.badRequest('One or more outlets do not belong to this account');
      }
    }

    // Look up (or create) the invitee user.
    // - email identifier + user missing  → fullName + password required → create User
    // - phone identifier + user missing  → fullName + password required → create User with phone
    const looksEmail = body.identifier.includes('@');
    const normalizedPhone = looksEmail ? null : normalizePhone(body.identifier);
    const normalizedEmail = looksEmail ? body.identifier.trim().toLowerCase() : null;

    let invitee: { id: string; email: string | null; fullName: string; phone: string | null } | null = null;
    let tempPassword: string | null = null;
    let isNewUser = false;

    if (looksEmail && normalizedEmail) {
      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true, fullName: true, phone: true },
      });
      if (existing) {
        invitee = existing;
        if (body.password) {
          const hashed = await bcrypt.hash(body.password, 12);
          await prisma.user.update({ where: { id: existing.id }, data: { password: hashed } });
          tempPassword = body.password;
        }
      } else {
        if (!body.fullName || !body.password) {
          throw Errors.badRequest('fullName and password are required when inviting a new user by email');
        }
        const hashed = await bcrypt.hash(body.password, 12);
        const hcidDisplay = await uniqueHcid();
        const created = await prisma.user.create({
          data: {
            fullName: body.fullName,
            email: normalizedEmail,
            password: hashed,
            role: 'customer',
            isActive: true,
            hcidDisplay,
          },
          select: { id: true, email: true, fullName: true, phone: true },
        });
        invitee = created;
        tempPassword = body.password;
        isNewUser = true;
      }
    } else if (normalizedPhone) {
      const existing = await prisma.user.findFirst({
        where: { phone: { in: phoneLookupVariants(normalizedPhone) } },
        select: { id: true, email: true, fullName: true, phone: true },
      });
      if (existing) {
        invitee = existing;
        if (body.password) {
          const hashed = await bcrypt.hash(body.password, 12);
          await prisma.user.update({ where: { id: existing.id }, data: { password: hashed } });
          tempPassword = body.password;
        }
      } else {
        if (!body.fullName || !body.password) {
          throw Errors.badRequest('fullName and password are required when inviting a new user by phone');
        }
        const hashed = await bcrypt.hash(body.password, 12);
        const hcidDisplay = await uniqueHcid();
        const created = await prisma.user.create({
          data: {
            fullName: body.fullName,
            phone: normalizedPhone,
            password: hashed,
            role: 'customer',
            isActive: true,
            hcidDisplay,
          },
          select: { id: true, email: true, fullName: true, phone: true },
        });
        invitee = created;
        tempPassword = body.password;
        isNewUser = true;
      }
    } else {
      throw Errors.badRequest('Enter a valid email address or 10-digit phone number');
    }

    if (!invitee) throw Errors.notFound('Could not resolve invitee');
    const inviteeUser = invitee; // tight non-null reference for the tx closure

    const result = await prisma.$transaction(async (tx) => {
      const membership = await tx.businessAccountMember.upsert({
        where: { userId_businessAccountId: { userId: inviteeUser.id, businessAccountId: id } },
        update: {},
        create: {
          userId: inviteeUser.id,
          businessAccountId: id,
          isPrimary: false,
          invitedBy: ctx.userId,
          acceptedAt: new Date(),
        },
      });
      // outletIds empty → one assignment with outletId=null (account-wide).
      // outletIds non-empty → one assignment per outlet so the caller can
      // narrow which outlets the invitee can actually act under.
      const targets: Array<string | null> = outletIds.length > 0 ? outletIds : [null];
      const assignments = [] as Array<{ id: string; outletId: string | null }>;
      for (const outletId of targets) {
        const existing = await tx.userRole.findFirst({
          where: { userId: inviteeUser.id, businessAccountId: id, outletId, roleId: roleIdToUse },
          select: { id: true, outletId: true },
        });
        const row = existing ?? await tx.userRole.create({
          data: { userId: inviteeUser.id, businessAccountId: id, outletId, roleId: roleIdToUse },
          select: { id: true, outletId: true },
        });
        assignments.push(row);
      }
      return { membership, assignments };
    });

    const loginUrl = (process.env.AUTH_URL ?? 'http://localhost:3000') + '/login';
    const loginIdentifier = inviteeUser.email ?? inviteeUser.phone ?? body.identifier.trim();

    let credentialsDelivered = { email: false, sms: false };

    if (tempPassword) {
      const [account, inviter] = await Promise.all([
        prisma.businessAccount.findUnique({ where: { id }, select: { legalName: true, displayName: true } }),
        prisma.user.findUnique({ where: { id: ctx.userId }, select: { fullName: true } }),
      ]);
      const businessName = account?.displayName || account?.legalName || 'your business';
      const inviterName = inviter?.fullName?.trim() || undefined;
      const recipientEmail = inviteeUser.email;
      const recipientPhone = inviteeUser.phone;
      const recipientName = inviteeUser.fullName;

      let emailContent: { subject: string; text: string; html: string; name?: string } | undefined;
      if (recipientEmail) {
        const built = buildInviteEmail({
          recipientName,
          recipientEmail,
          tempPassword,
          scope: 'customer',
          businessName,
          loginUrl,
          inviterName,
        });
        emailContent = { ...built, name: recipientName };
      }

      let smsBody: string | undefined;
      if (recipientPhone && (isNewUser || !recipientEmail)) {
        smsBody = buildInviteSms({
          recipientName,
          loginIdentifier: recipientPhone,
          tempPassword,
          businessName,
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
      const accountId = id;
      const recipientEmail = inviteeUser.email;
      const recipientPhone = inviteeUser.phone;
      const recipientName = inviteeUser.fullName;
      runInBackground('invite-notification', async () => {
        const [account, inviter] = await Promise.all([
          prisma.businessAccount.findUnique({ where: { id: accountId }, select: { legalName: true, displayName: true } }),
          prisma.user.findUnique({ where: { id: inviterId }, select: { fullName: true } }),
        ]);
        const businessName = account?.displayName || account?.legalName || 'your business';
        const inviterName = inviter?.fullName?.trim() || 'Admin';
        const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

        if (recipientEmail) {
          const subject = `Access granted to ${businessName} on HoReCa Hub`;
          const text = `Hello ${recipientName},\n\n${inviterName} has added you to the business account "${businessName}" on HoReCa Hub.\n\nYou can now log in and access this account.\n\nLogin URL: ${loginUrl}\n\n— The HoReCa Hub team`;
          const html = `<p>Hello <strong>${esc(recipientName)}</strong>,</p><p>${esc(inviterName)} has added you to the business account <strong>${esc(businessName)}</strong> on HoReCa Hub.</p><p>You can now log in and access this account.</p><p><a href="${esc(loginUrl)}">Sign in to HoReCa Hub</a></p><p>— The HoReCa Hub team</p>`;
          sendEmailInBackground({
            to: recipientEmail,
            subject,
            text,
            html,
            name: recipientName,
          }, 'invite-notification');
        }

        if (recipientPhone) {
          const smsBody = `Hello ${recipientName}, you have been added to the business account "${businessName}" on HoReCa Hub by ${inviterName}. Log in to access: ${loginUrl}`;
          void sendSms({ to: recipientPhone, body: smsBody, channel: 'sms' }).catch((err) => {
            console.error('[invite-notification]', err);
          });
        }
      });
    }

    await markSessionStale(inviteeUser.id);

    return NextResponse.json({
      success: true,
      data: {
        ...result,
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
  } catch (err) { return errorResponse(err); }
});

function extractAccountId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return segments[segments.length - 2];
}
