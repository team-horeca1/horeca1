/**
 * Human-readable payout / grant tracking key: H1P-XXXXXX.
 * Unique across cashback_entries and payout_invites.
 */

import type { PrismaClient, Prisma } from '@prisma/client';

type TrackingDb = PrismaClient | Prisma.TransactionClient;

function generatePayoutTrackingKey(): string {
  const buf = new Uint8Array(4);
  globalThis.crypto.getRandomValues(buf);
  const b32 = btoa(String.fromCharCode(...buf))
    .replace(/[+/=]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)
    .padEnd(6, '0');
  return `H1P-${b32}`;
}

export async function uniquePayoutTrackingKey(db: TrackingDb): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const candidate = generatePayoutTrackingKey();
    const [entry, invite] = await Promise.all([
      db.cashbackEntry.findUnique({ where: { trackingKey: candidate }, select: { id: true } }),
      db.payoutInvite.findUnique({ where: { trackingKey: candidate }, select: { id: true } }),
    ]);
    if (!entry && !invite) return candidate;
  }
  throw new Error('Could not allocate a unique payout tracking key');
}
