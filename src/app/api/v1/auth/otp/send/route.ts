import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/providers/email';
import { withRateLimit } from '@/middleware/withRateLimit';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';
import { lookupEmailForRegistration, type EmailCheckIntent } from '@/lib/auth/checkEmailLookup';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REGISTER_INTENTS = ['customer', 'brand', 'vendor'] as const;

function parseIntent(raw: unknown): EmailCheckIntent {
  return REGISTER_INTENTS.includes(raw as EmailCheckIntent) ? (raw as EmailCheckIntent) : 'customer';
}

function emailExistsMessage(intent: EmailCheckIntent): string {
  if (intent === 'vendor') {
    return 'This email is already registered. Log in to add a vendor under your account.';
  }
  if (intent === 'brand') {
    return 'This email is already registered. Log in to add a brand under your account.';
  }
  return 'This email is already registered. Log in instead of creating a duplicate account.';
}

function generateOTP(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

async function dispatchPhoneOTP(phone: string, otp: string): Promise<void> {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID ?? process.env.MSG91_TEMPLATE_ID;
  const sender = process.env.MSG91_SENDER_ID ?? 'HCXGBL';

  if (!authKey || !templateId) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OTP:dev] +91${phone} → ${otp}`);
    }
    return;
  }

  const mobile = `91${phone}`;
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('authkey', authKey);
  url.searchParams.set('template_id', templateId);
  url.searchParams.set('mobile', mobile);
  url.searchParams.set('otp', otp);
  url.searchParams.set('otp_expiry', '10');
  url.searchParams.set('sender', sender);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`MSG91 error: ${await res.text()}`);
}

async function dispatchEmailOTP(email: string, otp: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Your HoReCa Hub login code',
    text: `Your verification code is ${otp}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>Your verification code is <strong style="font-size:18px;letter-spacing:2px">${otp}</strong>.</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
  });
}

async function postHandler(req: NextRequest) {
  try {
    const body = await req.json();
    const mode: 'login' | 'register' = body.mode === 'register' ? 'register' : 'login';
    const intent = parseIntent(body.intent);

    const rawPhone = String(body.phone ?? '').replace(/\D/g, '');
    const phone = rawPhone.length === 12 ? rawPhone.replace(/^91/, '') : rawPhone;
    const email = String(body.email ?? '').trim().toLowerCase();

    const usePhone = !!phone;
    const useEmail = !usePhone && !!email;

    if (!usePhone && !useEmail) {
      return NextResponse.json(
        { success: false, error: 'Provide a phone number or email' },
        { status: 400 }
      );
    }

    if (usePhone && !/^\d{10}$/.test(phone)) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid 10-digit phone number' },
        { status: 400 }
      );
    }

    if (useEmail && !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid email address' },
        { status: 400 }
      );
    }

    if (useEmail && mode === 'register' && !isRegisterEmailOtpEnabled()) {
      return NextResponse.json(
        { success: false, error: 'Registration requires a phone number' },
        { status: 400 }
      );
    }

    if (useEmail && mode === 'register' && isRegisterEmailOtpEnabled()) {
      const check = await lookupEmailForRegistration(email, intent);
      if (check.exists) {
        return NextResponse.json(
          {
            success: false,
            code: 'EMAIL_EXISTS',
            error: emailExistsMessage(intent),
            data: check,
          },
          { status: 409 },
        );
      }
    }

    // Account-existence check applies to EMAIL login only. A phone login
    // doubles as passwordless signup: when no account exists we still send the
    // OTP and auth.ts auto-creates a customer on verify. Email cannot
    // self-register (registration requires a phone), so it stays gated.
    if (mode === 'login' && useEmail) {
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!existing) {
        return NextResponse.json(
          { success: false, code: 'NO_ACCOUNT', error: 'No account found. Please register first.' },
          { status: 404 }
        );
      }
    }

    // Rate limit + invalidate-old + create-new must happen atomically. With the
    // default isolation level, two concurrent requests both see count<3, both
    // pass, and end up creating 4+ OTPs in a 10-minute window. Serializable
    // forces Postgres to fail one of the conflicting transactions instead.
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const otp = generateOTP();
    try {
      await prisma.$transaction(async (tx) => {
        const recentCount = await tx.otpCode.count({
          where: usePhone
            ? { phone, createdAt: { gte: since } }
            : { email, createdAt: { gte: since } },
        });
        if (recentCount >= 3) {
          throw new Error('RATE_LIMITED');
        }
        await tx.otpCode.updateMany({
          where: usePhone ? { phone, used: false } : { email, used: false },
          data: { used: true },
        });
        await tx.otpCode.create({
          data: {
            phone: usePhone ? phone : null,
            email: useEmail ? email : null,
            code: otp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        });
      }, { isolationLevel: 'Serializable' });
    } catch (err) {
      if (err instanceof Error && err.message === 'RATE_LIMITED') {
        return NextResponse.json(
          { success: false, error: 'Too many requests. Please wait 10 minutes.' },
          { status: 429 }
        );
      }
      throw err;
    }

    if (usePhone) await dispatchPhoneOTP(phone, otp);
    else await dispatchEmailOTP(email, otp);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[otp/send]', err);
    return NextResponse.json(
      { success: false, error: 'Failed to send OTP. Please try again.' },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(postHandler, 'auth');
