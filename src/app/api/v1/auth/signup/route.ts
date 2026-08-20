// POST /api/v1/auth/signup — Register a new user account
// WHY: Auth.js handles login but NOT registration. We need a custom route for signup.
// FLOW: Validate input (Zod) → check duplicate → hash password → create user → return profile

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/modules/auth/auth.service';
import { signupSchema } from '@/modules/auth/auth.validator';
import { errorResponse } from '@/middleware/errorHandler';
import { checkRateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils';

const authService = new AuthService();

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 signup attempts per IP per minute (skip for local Playwright).
    const skipRl =
      process.env.NODE_ENV === 'development'
      || process.env.DISABLE_AUTH_RATE_LIMIT === '1'
      || process.env.PLAYWRIGHT_TEST === '1';
    if (!skipRl) {
      const { allowed } = await checkRateLimit(`signup:${getClientIp(req)}`, 5, 60000);
      if (!allowed) {
        return NextResponse.json(
          { success: false, error: { code: 'RATE_LIMITED', message: 'Too many signup attempts. Try again later.' } },
          { status: 429, headers: { 'Retry-After': '60' } }
        );
      }
    }

    // 1. Parse and validate the request body using Zod schema
    //    This checks: valid email format, password >= 8 chars, valid phone format, etc.
    const body = await req.json();
    const input = signupSchema.parse(body);

    // 2. Create the user (service handles duplicate check + password hashing)
    const { readReferralTokenFromRequest } = await import('@/lib/referralCookie');
    const user = await authService.signup({
      ...input,
      referralToken: readReferralTokenFromRequest(req),
    });

    // 3. Return the new user profile (no password included)
    return NextResponse.json({ success: true, data: user }, { status: 201 });
  } catch (error) {
    // Handles: ZodError (bad input), ApiError (duplicate email), or unknown errors
    return errorResponse(error);
  }
}
