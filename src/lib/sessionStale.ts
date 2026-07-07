import { redis } from '@/lib/redis';

const STALE_TTL_SEC = 3600;

/** Mark a user's JWT permissions as stale — next session update reloads from DB. */
export async function markSessionStale(userId: string): Promise<void> {
  try {
    await redis.set(`session:stale:${userId}`, '1', 'EX', STALE_TTL_SEC);
  } catch {
    /* non-critical */
  }
}
