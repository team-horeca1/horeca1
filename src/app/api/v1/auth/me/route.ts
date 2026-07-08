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
  return NextResponse.json({ success: true, data: profile });
});

// PATCH — update profile fields (never while impersonating)
export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    if (ctx.impersonatedCustomer) {
      return NextResponse.json(
        { success: false, error: { message: 'Cannot edit profile while in admin view mode' } },
        { status: 403 },
      );
    }
    const body = await req.json();
    const data = updateProfileSchema.parse(body);
    const profile = await authService.updateProfile(ctx.userId, data);
    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    return errorResponse(error);
  }
});
