// PATCH /api/v1/brand/team/[id]/password — reset a brand team member's login password

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { brandOnly } from '@/middleware/rbac';
import { resolveBrandContext } from '@/lib/resolveBrandId';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { assertCanManageMemberPassword } from '@/lib/teamMembership';

const schema = z.object({
  password: z.string().min(6).max(72),
});

function extractMemberId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 2]; // …/team/[memberId]/password
}

export const PATCH = brandOnly(async (req: NextRequest, ctx) => {
  try {
    const { brandId } = await resolveBrandContext(ctx, req);
    requirePermission(ctx, 'users.edit');
    const memberId = extractMemberId(req);

    const member = await prisma.brandTeamMember.findFirst({
      where: { id: memberId, brandId },
      select: { userId: true },
    });
    if (!member) throw Errors.notFound('Team member not found');

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { businessAccountId: true },
    });
    if (brand?.businessAccountId) {
      await assertCanManageMemberPassword(member.userId, brand.businessAccountId);
    }

    const { password } = schema.parse(await req.json());
    const hashed = await bcrypt.hash(password, 12);

    await prisma.user.update({ where: { id: member.userId }, data: { password: hashed } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
