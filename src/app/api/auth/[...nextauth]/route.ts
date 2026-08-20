// Auth.js catch-all route handler with rate limiting
// WHY: Auth.js v5 needs this to handle login, logout, session, and callback URLs
// It auto-handles: POST /api/auth/signin, GET /api/auth/session, POST /api/auth/signout, etc.

import { handlers } from '@/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Logout must never be blocked by rate limits (P2-12 / launch).
 * CSRF is required for the hard logout POST. Session is polled heavily by
 * the client — give it a higher bucket than sign-in / callback.
 */
function authLimitForPath(pathname: string): { max: number; windowMs: number } | null {
  if (pathname.includes('/signout') || pathname.includes('/csrf')) {
    return null; // unlimited
  }
  if (pathname.includes('/session')) {
    return { max: 180, windowMs: 60_000 };
  }
  // signin, callback, providers, etc. — keep tight against brute force
  return { max: 30, windowMs: 60_000 };
}

function withRateLimit(handler: (req: NextRequest) => Promise<Response>) {
  return async (req: NextRequest) => {
    // Skip in development — session polling + HMR easily trip the bucket,
    // and Redis may be shared with prod via tunnel.
    // Local Playwright against `next start` also needs this: production mode
    // otherwise caps sign-in at 30/min and flakes program e2e after a few roles.
    const skip =
      process.env.NODE_ENV === 'development'
      || process.env.DISABLE_AUTH_RATE_LIMIT === '1'
      || process.env.PLAYWRIGHT_TEST === '1';
    if (!skip) {
      const limit = authLimitForPath(req.nextUrl.pathname);
      if (limit) {
        const ip = getClientIp(req);
        const { allowed } = await checkRateLimit(`auth:${ip}`, limit.max, limit.windowMs);
        if (!allowed) {
          return NextResponse.json(
            { error: 'Too many requests. Try again later.' },
            { status: 429, headers: { 'Retry-After': '60' } }
          );
        }
      }
    }
    return handler(req);
  };
}

export const GET = withRateLimit(handlers.GET);
export const POST = withRateLimit(handlers.POST);
