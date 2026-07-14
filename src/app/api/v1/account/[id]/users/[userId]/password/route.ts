// PATCH /api/v1/account/[id]/users/[userId]/password — reset a customer team member's password
//
// Requires users.edit on the account, or admin impersonating that BA (assertCanMutateAccount).
// The target user must be a member of the account.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { withAuth } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { assertCanMutateAccount } from '@/lib/accountAccess';

const schema = z.object({
  password: z.string().min(6).max(72),
});

function extractIds(req: NextRequest) {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../account/<id>/users/<userId>/password
  return { id: segments[segments.length - 4], userId: segments[segments.length - 2] };
}

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { id, userId } = extractIds(req);
    await assertCanMutateAccount(ctx, id, 'users.edit', ctx.activeOutletId);

    // Caller must outrank — actually here we use a simpler check: the target must
    // be a member of this account (otherwise any account admin could reset any
    // user's password globally).
    const membership = await prisma.businessAccountMember.findUnique({
      where: { userId_businessAccountId: { userId, businessAccountId: id } },
      select: { id: true },
    });
    if (!membership) throw Errors.notFound('Member not found in this account');

    const { password } = schema.parse(await req.json());
    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: userId }, data: { password: hashed } });

    return NextResponse.json({ success: true });
  } catch (err) { return errorResponse(err); }
});
