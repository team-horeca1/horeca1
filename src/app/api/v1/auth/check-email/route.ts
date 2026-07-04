// POST /api/v1/auth/check-email
// Pre-OTP gate for vendor registration via email (temp testing flag).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/middleware/withRateLimit';
import { lookupEmailForRegistration, type EmailCheckIntent } from '@/lib/auth/checkEmailLookup';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';

const Body = z.object({
  email: z.string().min(1),
  intent: z.enum(['vendor', 'brand', 'customer']).optional().default('vendor'),
});

async function postHandler(req: NextRequest) {
  if (!isRegisterEmailOtpEnabled()) {
    return NextResponse.json(
      { success: false, error: 'Email registration is not enabled' },
      { status: 403 },
    );
  }

  try {
    const body = Body.parse(await req.json());
    const intent = body.intent as EmailCheckIntent;
    const data = await lookupEmailForRegistration(body.email, intent);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lookup failed';
    if (message === 'Invalid email address') {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    console.error('[check-email]', err);
    return NextResponse.json({ success: false, error: 'Lookup failed' }, { status: 500 });
  }
}

export const POST = withRateLimit(postHandler, 'auth');
