// DELETE /api/v1/me — Self-service permanent account deletion (full login wipe).
// When an admin is viewing a customer (impersonation cookies), deletes that
// customer with users.delete permission — no customer password required.

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { hardDeleteUserById } from '@/lib/userHardDelete';
import { DELETE_MY_ACCOUNT_PHRASE } from '@/lib/accountDeletion';

const deleteMeConfirmSchema = z.object({
  confirm: z.literal(DELETE_MY_ACCOUNT_PHRASE, {
    message: `Type ${DELETE_MY_ACCOUNT_PHRASE} to confirm`,
  }),
});

const deleteMeSelfSchema = deleteMeConfirmSchema.extend({
  password: z.string().min(1, 'Password is required'),
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = await req.json();

    if (ctx.impersonatedCustomer) {
      requirePermission(ctx, 'users.delete');
      const targetUserId = ctx.impersonatedCustomer.userId;
      if (targetUserId === ctx.userId) {
        throw Errors.badRequest('You cannot delete your own account');
      }
      deleteMeConfirmSchema.parse(body);
      await hardDeleteUserById(targetUserId);
      return NextResponse.json({
        success: true,
        data: { deletedUserId: targetUserId, adminDeleted: true },
      });
    }

    const { password } = deleteMeSelfSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, password: true },
    });
    if (!user) throw Errors.notFound('User');
    if (!user.password) {
      throw Errors.badRequest('This account has no password set. Contact support to delete it.');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw Errors.badRequest('Incorrect password');

    await hardDeleteUserById(ctx.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
