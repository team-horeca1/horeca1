// GET  /api/v1/auth/me — Get current logged-in user's profile
// PATCH /api/v1/auth/me — Update current user's profile
// WHY: Frontend needs to fetch and update user details (name, phone, pincode, business info)
// PROTECTED: Must be logged in — uses withAuth() wrapper

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/modules/auth/auth.service';
import { updateProfileSchema } from '@/modules/auth/auth.validator';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const authService = new AuthService();

// GET — fetch profile
export const GET = withAuth(async (_req, ctx) => {
  const userId = effectiveCustomerUserId(ctx);
  const profile = await authService.getProfile(userId);
  const impersonating = ctx.impersonatedBuyer
    ? {
        type: ctx.impersonatedBuyer.mode,
        userId: ctx.impersonatedBuyer.userId,
        businessAccountId: ctx.impersonatedBuyer.businessAccountId,
        name: ctx.impersonatedBuyer.name,
      }
    : null;
  return NextResponse.json({
    success: true,
    data: profile,
    ...(impersonating ? { impersonating } : {}),
  });
});

// PATCH — update profile fields (impersonation writes the customer's profile)
export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = await req.json();
    const data = updateProfileSchema.parse(body);
    const userId = effectiveCustomerUserId(ctx);
    const profile = await authService.updateProfile(userId, data);
    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    return errorResponse(error);
  }
});
