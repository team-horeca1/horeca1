import type { NextRequest, NextResponse } from 'next/server';

/** httpOnly cookie set by `/invite/<token>` and read at signup. */
export const REFERRAL_COOKIE = 'h1_referral';
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function referralCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: REFERRAL_COOKIE_MAX_AGE,
  };
}

export function readReferralTokenFromRequest(req: NextRequest): string | undefined {
  const raw = req.cookies.get(REFERRAL_COOKIE)?.value?.trim();
  if (!raw || raw.length < 16 || raw.length > 64) return undefined;
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return undefined;
  return raw;
}

export function attachReferralCookie(res: NextResponse, token: string): void {
  res.cookies.set(REFERRAL_COOKIE, token, referralCookieOptions());
}
