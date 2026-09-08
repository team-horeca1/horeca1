// PATCH /api/v1/vendor/team/[id]/password — reset a vendor team member's login password

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { assertCanManageMemberPassword } from '@/lib/teamMembership';
import type { AuthContext } from '@/middleware/auth';
import type { TeamRole } from '@prisma/client';

const schema = z.object({
  password: z.string().min(6).max(72),
});

const ENUM_RANK: Record<TeamRole, number> = { owner: 80, manager: 60, editor: 40, viewer: 20 };
const VENDOR_OWNER_RANK = 100;

function extractMemberId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 2]; // …/team/[memberId]/password
}

async function vendorMemberRank(ctx: AuthContext, vendorId: string): Promise<number> {
  // Admin impersonating a vendor outranks all team members.
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

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'users.edit');
    const memberId = extractMemberId(req);

    const member = await prisma.vendorTeamMember.findFirst({
      where: { id: memberId, vendorId },
      select: { userId: true, role: true },
    });
    if (!member) throw Errors.notFound('Team member not found');

    // Rank check — a Manager shouldn't be able to reset an Admin's password.
    const callerRank = await vendorMemberRank(ctx, vendorId);
    if (callerRank <= ENUM_RANK[member.role]) {
      throw Errors.forbidden('You cannot reset the password of a peer or higher-ranked team member');
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { businessAccountId: true },
    });
    if (vendor?.businessAccountId) {
      await assertCanManageMemberPassword(member.userId, vendor.businessAccountId);
    }

    const { password } = schema.parse(await req.json());
    const hashed = await bcrypt.hash(password, 12);

    await prisma.user.update({ where: { id: member.userId }, data: { password: hashed } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
