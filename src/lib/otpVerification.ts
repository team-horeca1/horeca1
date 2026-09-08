/**
 * Proof that a phone/email was verified via /auth/otp/verify.
 * Stateless HMAC token (AUTH_SECRET) — submit routes require this instead of
 * "any used OTP for this number in the last 30 minutes".
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { env } from '@/lib/env';
import { normalizePhone } from '@/lib/phone';

const TTL_MS = 30 * 60 * 1000;
const EXPIRED_MSG = 'Verification expired, please verify your number again';

type TokenPayload = {
  v: 1;
  otpId: string;
  phone?: string;
  email?: string;
  exp: number;
};

function signingKey(): Buffer {
  return createHmac('sha256', env.AUTH_SECRET).update('horeca1:otp-verify').digest();
}

function signBody(body: Buffer): Buffer {
  return createHmac('sha256', signingKey()).update(body).digest();
}

export function issueVerificationToken(args: {
  otpId: string;
  phone?: string | null;
  email?: string | null;
}): string {
  const phone = args.phone ? (normalizePhone(args.phone) ?? undefined) : undefined;
  const email = args.email ? args.email.trim().toLowerCase() : undefined;
  const payload: TokenPayload = {
    v: 1,
    otpId: args.otpId,
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    exp: Date.now() + TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  return `${body.toString('base64url')}.${signBody(body).toString('base64url')}`;
}

function identifiersMatch(
  token: { phone?: string; email?: string },
  match: { phone?: string | null; email?: string | null },
): boolean {
  const matchPhone = match.phone ? normalizePhone(match.phone) : null;
  const matchEmail = match.email ? match.email.trim().toLowerCase() : null;
  const phoneOk = !!matchPhone && token.phone === matchPhone;
  const emailOk = !!matchEmail && token.email === matchEmail;
  return phoneOk || emailOk;
}

export async function assertVerificationToken(
  token: unknown,
  match: { phone?: string | null; email?: string | null },
): Promise<{ otpId: string }> {
  if (typeof token !== 'string' || !token.includes('.')) {
    throw Errors.badRequest(EXPIRED_MSG);
  }

  const [bodyB64, sigB64] = token.split('.', 2);
  if (!bodyB64 || !sigB64) throw Errors.badRequest(EXPIRED_MSG);

  let body: Buffer;
  let expected: Buffer;
  let presented: Buffer;
  try {
    body = Buffer.from(bodyB64, 'base64url');
    expected = signBody(body);
    presented = Buffer.from(sigB64, 'base64url');
  } catch {
    throw Errors.badRequest(EXPIRED_MSG);
  }

  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    throw Errors.badRequest(EXPIRED_MSG);
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(body.toString('utf8')) as TokenPayload;
  } catch {
    throw Errors.badRequest(EXPIRED_MSG);
  }

  if (payload.v !== 1 || typeof payload.otpId !== 'string' || typeof payload.exp !== 'number') {
    throw Errors.badRequest(EXPIRED_MSG);
  }
  if (payload.exp < Date.now()) {
    throw Errors.badRequest(EXPIRED_MSG);
  }
  if (!identifiersMatch(payload, match)) {
    throw Errors.badRequest(EXPIRED_MSG);
  }

  const otp = await prisma.otpCode.findUnique({
    where: { id: payload.otpId },
    select: { id: true, used: true },
  });
  if (!otp?.used) {
    throw Errors.badRequest(EXPIRED_MSG);
  }

  return { otpId: otp.id };
}
