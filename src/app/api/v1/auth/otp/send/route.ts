import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/providers/email';
import { sendPhoneOtp } from '@/lib/providers/otpSms';
import { withRateLimit } from '@/middleware/withRateLimit';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';
import { lookupEmailForRegistration, type EmailCheckIntent } from '@/lib/auth/checkEmailLookup';
import { findUserByPhoneLookup } from '@/lib/auth/checkPhoneLookup';
import { normalizePhone } from '@/lib/phone';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REGISTER_INTENTS = ['customer', 'brand', 'vendor'] as const;

function parseIntent(raw: unknown): EmailCheckIntent {
  return REGISTER_INTENTS.includes(raw as EmailCheckIntent) ? (raw as EmailCheckIntent) : 'customer';
}

function emailExistsMessage(intent: EmailCheckIntent): string {
  if (intent === 'vendor') {
    return 'This email is already registered. Log in to add a Supplier under the same login.';
  }
  if (intent === 'brand') {
    return 'This email is already registered. Log in to add a Brand under the same login.';
  }
  return 'This email is already registered. Log in to add a restaurant or retail business under the same login.';
}

function generateOTP(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
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

    const rawPhoneInput = String(body.phone ?? '').trim();
    const hasPhoneInput = !!rawPhoneInput;
    const phone = normalizePhone(rawPhoneInput);
    const email = String(body.email ?? '').trim().toLowerCase();

    const hasEmailInput = !!email;
    const phoneValid = !!phone;
    const emailValid = EMAIL_RE.test(email);

    // Register may send the same OTP to phone + email. Login stays exclusive.
    const usePhone = phoneValid;
    const useEmail = emailValid && (mode === 'register' || !usePhone);
    const dualRegister = mode === 'register' && usePhone && useEmail;

    if (!hasPhoneInput && !hasEmailInput) {
      return NextResponse.json(
        { success: false, error: 'Provide a phone number or email' },
        { status: 400 }
      );
    }

    if (hasPhoneInput && !phoneValid) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid 10-digit phone number' },
        { status: 400 }
      );
    }

    if (hasEmailInput && !emailValid) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid email address' },
        { status: 400 }
      );
    }

    if (useEmail && !usePhone && mode === 'register' && !isRegisterEmailOtpEnabled()) {
      return NextResponse.json(
        { success: false, error: 'Registration requires a phone number' },
        { status: 400 }
      );
    }

    if (useEmail && mode === 'register') {
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

    // Login requires an existing account. Unknown phone/email must register
    // first so customer signup can collect profile data before OTP.
    if (mode === 'login') {
      const existing = usePhone
        ? await findUserByPhoneLookup(phone, { id: true })
        : useEmail
          ? await prisma.user.findUnique({ where: { email }, select: { id: true } })
          : null;
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

    if (dualRegister) {
      const results = await Promise.allSettled([
        sendPhoneOtp(phone, otp),
        dispatchEmailOTP(email, otp),
      ]);
      if (results[0].status === 'rejected') {
        console.error('[otp/send] SMS failed', results[0].reason);
        return NextResponse.json(
          { success: false, error: 'Failed to send OTP. Please try again.' },
          { status: 500 }
        );
      }
      if (results[1].status === 'rejected') {
        console.error('[otp/send] email OTP failed (phone delivered)', results[1].reason);
      }
    } else if (usePhone) {
      await sendPhoneOtp(phone, otp);
    } else {
      await dispatchEmailOTP(email, otp);
    }

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
