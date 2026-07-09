import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function deriveKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be set (min 32 chars) for admin password cipher');
  }
  return createHash('sha256').update(`horeca1:admin-pwd:${secret}`).digest();
}

/** Encrypt plaintext admin-set password for storage in users.admin_password_cipher. */
export function encryptAdminPassword(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/** Decrypt admin_password_cipher; returns null if invalid or missing. */
export function decryptAdminPassword(cipherText: string | null | undefined): string | null {
  if (!cipherText) return null;
  try {
    const buf = Buffer.from(cipherText, 'base64');
    if (buf.length < IV_LEN + TAG_LEN + 1) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, deriveKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return plain || null;
  } catch {
    return null;
  }
}

/**
 * Hash password for login and store AES-GCM cipher for admin Login Access reveal.
 * Use for admin-initiated create/reset paths.
 */
export async function setUserPasswordWithReveal(
  userId: string,
  plain: string,
  rounds = 12,
): Promise<{ hashed: string; adminPasswordCipher: string }> {
  const hashed = await bcrypt.hash(plain, rounds);
  const adminPasswordCipher = encryptAdminPassword(plain);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed, adminPasswordCipher },
  });
  return { hashed, adminPasswordCipher };
}

/** Prisma create/update payload: bcrypt hash + reveal cipher (no DB write). */
export async function passwordFieldsWithReveal(
  plain: string,
  rounds = 12,
): Promise<{ password: string; adminPasswordCipher: string }> {
  const password = await bcrypt.hash(plain, rounds);
  return { password, adminPasswordCipher: encryptAdminPassword(plain) };
}

/**
 * After a successful password login, store reveal cipher if missing/unreadable.
 * Fire-and-forget safe — never throws to the caller.
 */
export async function backfillAdminPasswordCipherIfMissing(
  userId: string,
  plain: string,
  existingCipher: string | null | undefined,
): Promise<void> {
  try {
    if (decryptAdminPassword(existingCipher)) return;
    await prisma.user.update({
      where: { id: userId },
      data: { adminPasswordCipher: encryptAdminPassword(plain) },
    });
  } catch (err) {
    console.error('[adminPasswordCipher] backfill failed', userId, err);
  }
}
