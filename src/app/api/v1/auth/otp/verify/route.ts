// POST /api/v1/auth/otp/verify
// Verifies a 4-digit OTP for a phone number WITHOUT creating a session.
// Used by the multi-step vendor/brand onboarding wizards and profile phone change.
// On success, marks the OtpCode used=true and returns a signed verificationToken
// that submit routes must present as proof of this verification.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRateLimit } from '@/middleware/withRateLimit';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';
import { normalizePhone } from '@/lib/phone';
import { issueVerificationToken } from '@/lib/otpVerification';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function postHandler(req: NextRequest) {
  try {
    const body = await req.json();
    const phone = normalizePhone(String(body.phone ?? ''));
    const email = String(body.email ?? '').trim().toLowerCase();
    const code = String(body.code ?? '').trim();

    const usePhone = !!phone;
    const useEmail = !usePhone && !!email;

    if (!usePhone && !useEmail) {
      return NextResponse.json(
        { success: false, error: 'Provide a phone number or email' },
        { status: 400 },
      );
    }

    if (useEmail && !isRegisterEmailOtpEnabled()) {
      return NextResponse.json(
        { success: false, error: 'Email verification is not enabled' },
        { status: 400 },
      );
    }

    if (usePhone && !phone) {
      return NextResponse.json({ success: false, error: 'Invalid phone number' }, { status: 400 });
    }

    if (useEmail && !EMAIL_RE.test(email)) {
      return NextResponse.json({ success: false, error: 'Invalid email address' }, { status: 400 });
    }

    if (!/^\d{4}$/.test(code)) {
      return NextResponse.json({ success: false, error: 'Enter the 4-digit code' }, { status: 400 });
    }

    const otp = await prisma.otpCode.findFirst({
      where: usePhone
        ? { phone, code, used: false, expiresAt: { gt: new Date() } }
        : { email, code, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, phone: true, email: true },
    });

    if (!otp) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired OTP' },
        { status: 400 },
      );
    }

    await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });

    return NextResponse.json({
      success: true,
      verificationToken: issueVerificationToken({
        otpId: otp.id,
        phone: otp.phone ?? phone,
        email: otp.email ?? (useEmail ? email : null),
      }),
    });
  } catch (err) {
    console.error('[otp/verify]', err);
    return NextResponse.json({ success: false, error: 'Verification failed' }, { status: 500 });
  }
}

export const POST = withRateLimit(postHandler, 'auth');
