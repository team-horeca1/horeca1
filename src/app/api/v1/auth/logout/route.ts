// POST /api/v1/auth/logout — clear Auth.js session cookies (P2-12)
// WHY: Client form/fetch signout is unreliable in some browsers (302 Set-Cookie
// dropped). Explicit Max-Age=0 on every authjs/next-auth cookie forces /auth/me → 401.

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

function isAuthCookie(name: string): boolean {
  return /^(?:__Secure-|__Host-)?(?:authjs|next-auth)\./i.test(name);
}

export async function POST() {
  const store = await cookies();
  const res = NextResponse.json({ success: true, data: { cleared: true } });

  for (const c of store.getAll()) {
    if (!isAuthCookie(c.name)) continue;
    const secure = c.name.startsWith('__Secure-') || c.name.startsWith('__Host-');
    res.cookies.set(c.name, '', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    });
  }

  return res;
}
